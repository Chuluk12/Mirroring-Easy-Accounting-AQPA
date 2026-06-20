import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Table, Input, Tag, Card, Button, Space, message, Tooltip, Row, Col, Statistic, Typography, Popover } from 'antd'
import {
  AppstoreOutlined,
  FileExcelOutlined,
  SearchOutlined,
  ShoppingOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import api from '../api/client'
import { exportRowsToXLS } from '../utils/exportXls'
import { useAuth } from '../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../utils/columnPermissions'
import useVisiblePolling from '../hooks/useVisiblePolling'

const { Search } = Input
const { Text } = Typography
const DEFAULT_PAGE_SIZE = 20

const purple = '#7c3cff'
const cyan = '#11b7d8'
const orange = '#ff7a00'
const softBorder = '1px solid rgba(226,231,240,0.88)'

const emptySummary = {
  total_items: 0,
  category_count: 0,
  categories: [],
  standardized_items: 0,
  below_minimum_items: 0,
}

const STOCK_EXPORT_COLS = [
  { key: 'itemno', label: 'No. Barang' },
  { key: 'description', label: 'Deskripsi' },
  { key: 'description2', label: 'Deskripsi 2' },
  { key: 'quantity', label: 'Stok Tersedia', type: 'number' },
  { key: 'stock_sistem', label: 'Stock Sistem', type: 'number' },
  { key: 'minimum_qty', label: 'Minimum Stok', type: 'number' },
  { key: 'stock_note', label: 'Note' },
  { key: 'unit', label: 'Satuan' },
  { key: 'category', label: 'Kategori' },
]

function formatNumber(value) {
  return Number(value || 0).toLocaleString('id-ID')
}

function textCompare(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  })
}

function buildTextFilters(rows, key, formatValue = value => String(value || '').trim()) {
  const values = new Map()
  rows.forEach(row => {
    const raw = formatValue(row[key])
    const label = raw || '(Kosong)'
    const value = raw || '__EMPTY__'
    if (!values.has(value)) values.set(value, { text: label, value })
  })
  return [...values.values()].sort((a, b) => textCompare(a.text, b.text))
}

function SummaryCard({ title, value, icon, color, loading, children }) {
  return (
    <Card
      loading={loading}
      style={{
        borderRadius: 8,
        border: softBorder,
        height: 116,
        background: `
          radial-gradient(circle at 92% 20%, ${color}1a 0%, transparent 28%),
          linear-gradient(135deg, ${color}12 0%, #ffffff 50%, ${color}08 100%)
        `,
        position: 'relative',
        overflow: 'hidden',
      }}
      styles={{ body: { padding: 16 } }}
    >
      <div
        style={{
          position: 'absolute',
          right: 16,
          top: 14,
          width: 48,
          height: 48,
          borderRadius: 8,
          background: `linear-gradient(135deg, ${color}18, transparent)`,
          clipPath: 'polygon(50% 0, 94% 25%, 94% 75%, 50% 100%, 6% 75%, 6% 25%)',
        }}
      />
      <Statistic title={title} value={value} prefix={icon} valueStyle={{ color, fontSize: 22 }} />
      {children}
    </Card>
  )
}

export default function Stock() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState(emptySummary)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })
  const [activeFilters, setActiveFilters] = useState({})
  const [activeSorter, setActiveSorter] = useState({})
  const [filterOptions, setFilterOptions] = useState({})
  const searchRef = useRef('')
  const filtersRef = useRef({})
  const sorterRef = useRef({})
  const pageRef = useRef(1)
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE)

  const fetchData = useCallback(async (page, pageSize, searchVal, showLoading = true, filters = filtersRef.current, sorter = sorterRef.current) => {
    if (showLoading) setLoading(true)
    try {
      const offset = (page - 1) * pageSize
      const res = await api.get('/api/stock', {
        params: {
          offset,
          limit: pageSize,
          search: searchVal,
          include_total: 1,
          minimum_qty: (filters.minimum_qty || []).join('||'),
          stock_note: (filters.stock_note || []).join('||'),
          category: (filters.category || []).join('||'),
          sort_field: sorter.field || '',
          sort_order: sorter.order || '',
        }
      })
      const rows = Array.isArray(res.data) ? res.data : (res.data.data || [])
      const total = Array.isArray(res.data) ? rows.length : Number(res.data.total || 0)
      setData(rows)
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total,
      }))
    } catch (e) {
      console.error(e)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  const fetchSummary = useCallback(async (showLoading = true) => {
    if (showLoading) setSummaryLoading(true)
    try {
      const res = await api.get('/api/stock/summary')
      setSummary({ ...emptySummary, ...(res.data || {}) })
    } catch (e) {
      console.error(e)
    } finally {
      if (showLoading) setSummaryLoading(false)
    }
  }, [])

  const fetchFilterOptions = useCallback(async () => {
    try {
      const res = await api.get('/api/stock/filter-options')
      setFilterOptions(res.data || {})
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    fetchData(1, DEFAULT_PAGE_SIZE, '')
    fetchSummary()
    fetchFilterOptions()
  }, [fetchData, fetchFilterOptions, fetchSummary])

  useVisiblePolling(() => {
    fetchData(pageRef.current, pageSizeRef.current, searchRef.current, false, filtersRef.current, sorterRef.current)
    fetchSummary(false)
  }, 30000)

  const handleSearch = useCallback((val) => {
    searchRef.current = val
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, val, true, filtersRef.current, sorterRef.current)
  }, [fetchData])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== searchRef.current) handleSearch(searchValue)
    }, 450)
    return () => clearTimeout(timer)
  }, [handleSearch, searchValue])

  const tableRows = data

  const checklistFilterProps = (dataIndex, filters) => ({
    filters,
    filterSearch: true,
    filteredValue: activeFilters[dataIndex] || null,
  })

  const serverSorterProps = dataIndex => ({
    sorter: true,
    sortDirections: ['ascend', 'descend'],
    sortOrder: activeSorter.field === dataIndex ? activeSorter.order : null,
  })

  const handleTableChange = (nextPagination, filters, sorter, extra) => {
    const nextPage = extra?.action === 'filter' ? 1 : nextPagination.current
    const nextFilters = {
      ...filtersRef.current,
      minimum_qty: filters.minimum_qty || [],
      stock_note: filters.stock_note || [],
      category: filters.category || [],
    }
    const nextSorter = {
      field: sorter?.field || '',
      order: sorter?.order || '',
    }

    pageRef.current = nextPage
    pageSizeRef.current = nextPagination.pageSize
    filtersRef.current = nextFilters
    sorterRef.current = nextSorter
    setActiveFilters(nextFilters)
    setActiveSorter(nextSorter)
    setPagination(prev => ({
      ...prev,
      current: nextPage,
      pageSize: nextPagination.pageSize,
      total: nextPagination.total || prev.total,
    }))
    fetchData(nextPage, nextPagination.pageSize, searchRef.current, true, nextFilters, nextSorter)
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const res = await api.get('/api/stock/export', {
        params: {
          search: searchRef.current,
          minimum_qty: (filtersRef.current.minimum_qty || []).join('||'),
          stock_note: (filtersRef.current.stock_note || []).join('||'),
          category: (filtersRef.current.category || []).join('||'),
          sort_field: sorterRef.current.field || '',
          sort_order: sorterRef.current.order || '',
        },
      })
      return Array.isArray(res.data) ? res.data : (res.data.data || [])
    },
    columns: filterExportColumnsByPermission('stock', STOCK_EXPORT_COLS, user),
    filename: 'StokBarang',
    sheetName: 'Stok Barang',
    message,
    setExporting,
    loadingText: 'Menyiapkan data stok...',
  })

  const minimumStockFilters = useMemo(() => {
    const values = new Map()
    ;(filterOptions.minimum_qty || []).forEach(option => {
      const value = Number(option.value ?? option.text ?? 0).toFixed(2)
      values.set(value, { text: value, value })
    })
    buildTextFilters(tableRows, 'minimum_qty', value => Number(value || 0).toFixed(2))
      .forEach(option => values.set(option.value, option))
    return [...values.values()].sort((a, b) => Number(a.value) - Number(b.value))
  }, [filterOptions.minimum_qty, tableRows])
  const noteFilters = useMemo(() => ([
    { text: 'Stok di bawah minimum', value: 'Stok di bawah minimum' },
    { text: '(Kosong)', value: '__EMPTY__' },
  ]), [])
  const categoryFilters = useMemo(() => (
    (summary.categories || [])
      .map(item => ({ text: item.category || '(Kosong)', value: item.category || '__EMPTY__' }))
      .sort((a, b) => textCompare(a.text, b.text))
  ), [summary.categories])

  const columns = [
    {
      title: 'No. Barang',
      dataIndex: 'itemno',
      key: 'itemno',
      width: 180,
      ...serverSorterProps('itemno'),
      render: val => <b>{val}</b>
    },
    {
      title: 'Deskripsi',
      dataIndex: 'description',
      key: 'description',
      ...serverSorterProps('description'),
    },
    {
      title: 'Deskripsi 2',
      dataIndex: 'description2',
      key: 'description2',
      ...serverSorterProps('description2'),
    },
    {
      title: 'Stok Tersedia',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 125,
      ...serverSorterProps('quantity'),
      render: (val, record) => {
        const quantity = Number(val || 0)
        const minimumQty = Number(record.minimum_qty || 0)
        const belowMinimum = minimumQty > 0 && quantity < minimumQty
        return (
          <span style={{ color: belowMinimum ? '#ff4d4f' : undefined, fontWeight: 'bold' }}>
            {quantity.toFixed(2)}
          </span>
        )
      }
    },
    {
      title: 'Stock Sistem',
      dataIndex: 'stock_sistem',
      key: 'stock_sistem',
      width: 125,
      align: 'right',
      ...serverSorterProps('stock_sistem'),
      render: val => (
        <span style={{ color: Number(val || 0) > 0 ? '#08979c' : '#cf1322', fontWeight: 'bold' }}>
          {Number(val || 0).toFixed(2)}
        </span>
      ),
    },
    {
      title: 'Minimum Stok',
      dataIndex: 'minimum_qty',
      key: 'minimum_qty',
      width: 130,
      align: 'right',
      ...serverSorterProps('minimum_qty'),
      ...checklistFilterProps('minimum_qty', minimumStockFilters),
      render: val => Number(val || 0).toFixed(2),
    },
    {
      title: 'Note',
      dataIndex: 'stock_note',
      key: 'stock_note',
      width: 170,
      ...serverSorterProps('stock_note'),
      ...checklistFilterProps('stock_note', noteFilters),
      render: val => val ? <Tag color="red">{val}</Tag> : '-',
    },
    {
      title: 'Satuan',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
      ...serverSorterProps('unit'),
    },
    {
      title: 'Kategori', dataIndex: 'category', key: 'category', width: 160,
      ...serverSorterProps('category'),
      ...checklistFilterProps('category', categoryFilters),
      render: val => val ? <Tag color="geekblue">{val}</Tag> : '-'
    },
  ]
  const visibleColumns = filterColumnsByPermission('stock', columns, user)
  const categoryItems = summary.categories || []
  const visibleCategoryItems = categoryItems.slice(0, 2)
  const hiddenCategoryCount = Math.max(categoryItems.length - visibleCategoryItems.length, 0)
  const categoryPopover = (
    <div style={{ width: 250, maxHeight: 260, overflowY: 'auto' }}>
      <Space size={6} direction="vertical" style={{ width: '100%' }}>
        {categoryItems.map(item => (
          <Tag key={item.category} color="purple" style={{ marginInlineEnd: 0, width: '100%' }}>
            {item.category}: {formatNumber(item.count)}
          </Tag>
        ))}
      </Space>
    </div>
  )

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
        <Col xs={24} sm={12} xl={5}>
          <SummaryCard
            title="Total Barang"
            value={summary.total_items}
            icon={<ShoppingOutlined />}
            color={cyan}
            loading={summaryLoading}
          />
        </Col>
        <Col xs={24} sm={24} xl={9}>
          <SummaryCard
            title="Kategori Barang"
            value={summary.category_count}
            icon={<AppstoreOutlined />}
            color={purple}
            loading={summaryLoading}
          >
            <Space size={[5, 5]} wrap style={{ marginTop: 10, maxWidth: 'calc(100% - 42px)' }}>
              {visibleCategoryItems.map(item => (
                <Tooltip key={item.category} title={`${item.category}: ${formatNumber(item.count)} barang`}>
                  <Tag color="purple">{item.category}: {formatNumber(item.count)}</Tag>
                </Tooltip>
              ))}
              {hiddenCategoryCount > 0 && (
                <Popover content={categoryPopover} title="Semua Kategori" trigger="click" placement="bottom">
                  <Button
                    size="small"
                    type="text"
                    style={{
                      height: 22,
                      paddingInline: 8,
                      borderRadius: 999,
                      color: 'rgba(124,60,255,0.78)',
                      background: 'rgba(124,60,255,0.055)',
                      border: '1px solid rgba(124,60,255,0.10)',
                      fontWeight: 500,
                    }}
                  >
                    Lihat semua
                  </Button>
                </Popover>
              )}
              {!categoryItems.length && <Text type="secondary">Belum ada kategori</Text>}
            </Space>
          </SummaryCard>
        </Col>
        <Col xs={24} sm={12} xl={10}>
          <SummaryCard
            title="Lewat Minimum"
            value={summary.below_minimum_items}
            icon={<WarningOutlined />}
            color={orange}
            loading={summaryLoading}
          />
        </Col>
      </Row>

    <Card title="📦 Stok Barang" extra={
      <Space wrap>
        <Search
          placeholder="Cari semua field stok..."
          allowClear
          value={searchValue}
          style={{ width: 300 }}
          prefix={<SearchOutlined />}
          onChange={e => setSearchValue(e.target.value)}
          onSearch={value => {
            setSearchValue(value)
            handleSearch(value)
          }}
        />
        <Button
          icon={<FileExcelOutlined />}
          onClick={handleExport}
          loading={exporting}
          style={{
            background: 'linear-gradient(135deg, #d41452 0%, #e018a8 52%, #7c3cff 100%)',
            borderColor: '#d41452',
            color: '#fff',
          }}
        >
          Export XLS
        </Button>
      </Space>
    }>
      <Table
        rowKey="itemno"
        columns={visibleColumns}
        dataSource={tableRows}
        loading={loading}
        pagination={{
          ...pagination,
          total: pagination.total,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} item`,
        }}
        onChange={handleTableChange}
        scroll={{ x: 1110 }}
        sticky={{ offsetHeader: 0 }}
        size="middle"
      />
    </Card>
    </>
  )
}
