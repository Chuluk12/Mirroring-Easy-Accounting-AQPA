import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, Card, Col, DatePicker, Input, message, Row, Select,
  Space, Statistic, Table, Tag, Tooltip, Typography,
} from 'antd'
import {
  ArrowDownOutlined, ArrowUpOutlined, FileExcelOutlined,
  ReloadOutlined, SearchOutlined, LineChartOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import useVisiblePolling from '../../hooks/useVisiblePolling'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text, Title } = Typography
const DEFAULT_PAGE_SIZE = 20

const getCurrentYearRange = () => [dayjs().startOf('year'), dayjs().endOf('year')]

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'Laba', label: 'Laba' },
  { value: 'Rugi', label: 'Rugi' },
  { value: 'Impas', label: 'Impas' },
]

const HPP_EXPORT_COLS = [
  { key: 'no_barang', label: 'No Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'qty_produksi', label: 'Qty Produksi', type: 'number' },
  { key: 'qty_terjual', label: 'Qty Terjual', type: 'number' },
  { key: 'hpp_total', label: 'Total HPP', type: 'number' },
  { key: 'hpp_per_unit', label: 'HPP/Unit', type: 'number' },
  { key: 'harga_jual_rata', label: 'Harga Jual Rata-rata', type: 'number' },
  { key: 'nilai_jual', label: 'Nilai Jual', type: 'number' },
  { key: 'laba_rugi', label: 'Laba/Rugi', type: 'number' },
  { key: 'margin_pct', label: 'Margin (%)', type: 'number' },
  { key: 'status', label: 'Status' },
]

const emptySummary = {
  total_produk: 0,
  qty_produksi: 0,
  qty_terjual: 0,
  hpp_total: 0,
  nilai_jual: 0,
  laba_rugi: 0,
  margin_pct: 0,
  status: 'Impas',
}

const formatQty = value => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 })
const formatCurrency = value => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(value || 0)

const statusColor = status => {
  if (status === 'Laba') return 'green'
  if (status === 'Rugi') return 'red'
  return 'gold'
}

function ProfitBars({ summary, loading }) {
  const max = Math.max(summary.nilai_jual || 0, summary.hpp_total || 0, Math.abs(summary.laba_rugi || 0), 1)
  const rows = [
    { label: 'Nilai Jual', value: summary.nilai_jual, color: '#00a92f' },
    { label: 'Total HPP', value: summary.hpp_total, color: '#ff7a00' },
    { label: summary.laba_rugi >= 0 ? 'Laba' : 'Rugi', value: Math.abs(summary.laba_rugi), color: summary.laba_rugi >= 0 ? '#11b7d8' : '#d41452' },
  ]

  return (
    <Card title="Grafik HPP Vs Harga Jual" loading={loading} style={{ borderRadius: 8 }}>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        {rows.map(row => (
          <div key={row.label}>
            <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">{row.label}</Text>
              <Text strong>{formatCurrency(row.value)}</Text>
            </Space>
            <div style={{ height: 12, background: '#edf1f7', borderRadius: 8, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max((row.value / max) * 100, row.value > 0 ? 4 : 0)}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${row.color}, ${row.color}bf)`,
                  borderRadius: 8,
                }}
              />
            </div>
          </div>
        ))}
      </Space>
    </Card>
  )
}

export default function HPP() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [summary, setSummary] = useState(emptySummary)
  const [detailRows, setDetailRows] = useState({})
  const [detailLoading, setDetailLoading] = useState({})
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [dateRange, setDateRange] = useState(getCurrentYearRange)
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })

  const searchRef = useRef('')
  const statusRef = useRef('')
  const dateRangeRef = useRef(getCurrentYearRange())
  const pageRef = useRef(1)
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE)

  const fetchData = useCallback(async (
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    searchVal = '',
    dates = getCurrentYearRange(),
    statusVal = '',
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal) params.search = searchVal
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')
      if (statusVal) params.status = statusVal

      const res = await api.get('/api/hpp', { params })
      if (res.data.error) {
        message.error(`HPP backend error: ${res.data.error}`)
      }
      if (!res.data.error && (res.data.total || 0) === 0) {
        try {
          const debugRes = await api.get('/api/hpp/debug', { params })
          console.info('HPP debug counts:', debugRes.data.counts)
          console.info('HPP debug samples:', debugRes.data.samples)
          if (debugRes.data.error) {
            message.warning(`HPP debug error: ${debugRes.data.error}`)
          }
        } catch (debugError) {
          console.error('Gagal mengambil debug HPP:', debugError)
        }
      }
      setData(res.data.data || [])
      setSummary({ ...emptySummary, ...(res.data.summary || {}) })
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: res.data.total || 0,
      }))
    } catch (error) {
      console.error('Gagal memuat HPP:', error)
      message.error(error.response?.data?.message || 'Gagal memuat HPP')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(1, DEFAULT_PAGE_SIZE, '', dateRangeRef.current, '')
  }, [fetchData])

  useVisiblePolling(() => {
    fetchData(pageRef.current, pageSizeRef.current, searchRef.current, dateRangeRef.current, statusRef.current, false)
  }, 30000)

  const handleSearch = value => {
    searchRef.current = value
    setSearch(value)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, value, dateRangeRef.current, statusRef.current)
  }

  const handleDate = dates => {
    const nextDates = dates || [null, null]
    dateRangeRef.current = nextDates
    setDateRange(nextDates)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, nextDates, statusRef.current)
  }

  const handleStatus = value => {
    statusRef.current = value
    setStatus(value)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, dateRangeRef.current, value)
  }

  const handleReset = () => {
    const currentYear = getCurrentYearRange()
    searchRef.current = ''
    statusRef.current = ''
    dateRangeRef.current = currentYear
    setSearch('')
    setStatus('')
    setDateRange(currentYear)
    pageRef.current = 1
    pageSizeRef.current = DEFAULT_PAGE_SIZE
    fetchData(1, DEFAULT_PAGE_SIZE, '', currentYear, '')
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (statusRef.current) params.status = statusRef.current
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      const res = await api.get('/api/hpp/export', { params })
      return res.data.data || []
    },
    columns: filterExportColumnsByPermission('hpp', HPP_EXPORT_COLS, user),
    filename: 'HPPProdukVsHargaJual',
    sheetName: 'HPP Produk',
    message,
    setExporting,
    loadingText: 'Mengambil semua data HPP...',
    auditModule: 'hpp',
    auditDescription: 'Export HPP Produk Vs Harga Jual',
  })

  const loadDetails = async (record) => {
    if (detailRows[record.no_barang]) return
    setDetailLoading(prev => ({ ...prev, [record.no_barang]: true }))
    try {
      const params = { itemno: record.no_barang }
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      const res = await api.get('/api/hpp/details', { params })
      if (res.data.error) message.warning(res.data.error)
      setDetailRows(prev => ({ ...prev, [record.no_barang]: res.data.data || [] }))
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat detail pesanan')
    } finally {
      setDetailLoading(prev => ({ ...prev, [record.no_barang]: false }))
    }
  }

  const columns = [
    {
      title: 'No Barang',
      dataIndex: 'no_barang',
      key: 'no_barang',
      width: 160,
      fixed: 'left',
      render: value => <Text code>{value || '-'}</Text>,
    },
    {
      title: 'Deskripsi Barang',
      dataIndex: 'deskripsi_barang',
      key: 'deskripsi_barang',
      width: 260,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Qty Produksi',
      dataIndex: 'qty_produksi',
      key: 'qty_produksi',
      width: 120,
      align: 'right',
      render: value => formatQty(value),
    },
    {
      title: 'Qty Terjual',
      dataIndex: 'qty_terjual',
      key: 'qty_terjual',
      width: 115,
      align: 'right',
      render: value => formatQty(value),
    },
    {
      title: 'Total HPP',
      dataIndex: 'hpp_total',
      key: 'hpp_total',
      width: 150,
      align: 'right',
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'HPP/Unit',
      dataIndex: 'hpp_per_unit',
      key: 'hpp_per_unit',
      width: 140,
      align: 'right',
      render: value => formatCurrency(value),
    },
    {
      title: 'Harga Jual Rata-rata',
      dataIndex: 'harga_jual_rata',
      key: 'harga_jual_rata',
      width: 165,
      align: 'right',
      render: value => formatCurrency(value),
    },
    {
      title: 'Nilai Jual',
      dataIndex: 'nilai_jual',
      key: 'nilai_jual',
      width: 150,
      align: 'right',
      render: value => <Text strong style={{ color: '#00a92f' }}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Laba/Rugi',
      dataIndex: 'laba_rugi',
      key: 'laba_rugi',
      width: 150,
      align: 'right',
      render: value => (
        <Text strong style={{ color: Number(value || 0) >= 0 ? '#00a92f' : '#d41452' }}>
          {formatCurrency(value)}
        </Text>
      ),
    },
    {
      title: 'Margin',
      dataIndex: 'margin_pct',
      key: 'margin_pct',
      width: 105,
      align: 'right',
      render: value => `${Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 105,
      fixed: 'right',
      render: value => <Tag color={statusColor(value)}>{value}</Tag>,
    },
  ]

  const visibleColumns = filterColumnsByPermission('hpp', columns, user)
  const detailColumns = [
    { title: 'Sumber', dataIndex: 'source', width: 80, render: value => <Tag>{value}</Tag> },
    { title: 'Tanggal', dataIndex: 'tanggal', width: 115, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'No Dokumen', dataIndex: 'no_dokumen', width: 150, render: value => <Text code>{value || '-'}</Text> },
    { title: 'PO Customer', dataIndex: 'no_po_customer', width: 160, render: value => value || '-' },
    { title: 'Customer', dataIndex: 'nama_customer', width: 220, ellipsis: true },
    { title: 'Qty', dataIndex: 'qty', width: 90, align: 'right', render: value => formatQty(value) },
    { title: 'Harga Jual', dataIndex: 'harga_jual', width: 130, align: 'right', render: value => formatCurrency(value) },
    { title: 'Nilai Jual', dataIndex: 'nilai_jual', width: 130, align: 'right', render: value => formatCurrency(value) },
    { title: 'HPP', dataIndex: 'hpp_total', width: 130, align: 'right', render: value => formatCurrency(value) },
    {
      title: 'Laba/Rugi',
      dataIndex: 'laba_rugi',
      width: 130,
      align: 'right',
      render: value => <Text strong style={{ color: Number(value || 0) >= 0 ? '#00a92f' : '#d41452' }}>{formatCurrency(value)}</Text>,
    },
  ]
  const isProfit = summary.laba_rugi >= 0
  const periodLabel = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) return 'Semua periode'
    return `${dateRange[0].format('DD MMM YYYY')} - ${dateRange[1].format('DD MMM YYYY')}`
  }, [dateRange])

  return (
    <div style={{ maxWidth: 1440 }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>HPP Produk Vs Harga Jual</Title>
        <Text type="secondary">
          Perbandingan biaya hasil produksi dengan nilai penjualan untuk melihat laba, rugi, dan margin per produk.
        </Text>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic title="Nilai Jual" value={formatCurrency(summary.nilai_jual)} valueStyle={{ color: '#00a92f' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic title="Total HPP" value={formatCurrency(summary.hpp_total)} valueStyle={{ color: '#ff7a00' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Laba/Rugi"
              value={formatCurrency(summary.laba_rugi)}
              prefix={isProfit ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              valueStyle={{ color: isProfit ? '#00a92f' : '#d41452' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small">
            <Statistic
              title="Margin"
              value={summary.margin_pct}
              precision={2}
              suffix="%"
              valueStyle={{ color: isProfit ? '#11b7d8' : '#d41452' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} xl={9}>
          <ProfitBars summary={summary} loading={loading} />
        </Col>
        <Col xs={24} xl={15}>
          <Card
            title={<span><LineChartOutlined style={{ marginRight: 8, color: '#1a73e8' }} />HPP Produk</span>}
            extra={<Text type="secondary">{periodLabel}</Text>}
          >
            <Space wrap style={{ marginBottom: 14 }}>
              <RangePicker
                value={dateRange}
                format="DD/MM/YYYY"
                onChange={handleDate}
                placeholder={['Tgl Dari', 'Tgl Sampai']}
                style={{ width: 225 }}
              />
              <Select
                value={status}
                options={STATUS_OPTIONS}
                onChange={handleStatus}
                style={{ width: 140 }}
              />
              <Search
                placeholder="Cari barang..."
                allowClear
                value={search}
                style={{ width: 240 }}
                prefix={<SearchOutlined />}
                onSearch={handleSearch}
                onChange={event => {
                  setSearch(event.target.value)
                  if (!event.target.value) handleSearch('')
                }}
              />
              <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
              <Button
                type="primary"
                icon={<FileExcelOutlined />}
                onClick={handleExport}
                loading={exporting}
                style={{ background: '#217346', borderColor: '#217346' }}
              >
                Export XLS
              </Button>
            </Space>
            <Table
              rowKey="no_barang"
              columns={withTableSorters(visibleColumns)}
              dataSource={data}
              loading={loading}
              size="small"
              sticky
              scroll={{ x: 1620, y: 520 }}
              rowClassName={record => record.status === 'Rugi' ? 'hpp-row-loss' : record.status === 'Laba' ? 'hpp-row-profit' : ''}
              pagination={{
                ...pagination,
                showSizeChanger: true,
                pageSizeOptions: ['20', '50', '100'],
                showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} produk`,
                onChange: (page, pageSize) => {
                  pageRef.current = page
                  pageSizeRef.current = pageSize
                  fetchData(page, pageSize, searchRef.current, dateRangeRef.current, statusRef.current)
                },
              }}
              expandable={{
                onExpand: (expanded, record) => {
                  if (expanded) loadDetails(record)
                },
                expandedRowRender: record => (
                  <Table
                    rowKey={(row, index) => `${row.source}-${row.no_dokumen}-${index}`}
                    columns={detailColumns}
                    dataSource={detailRows[record.no_barang] || []}
                    loading={detailLoading[record.no_barang]}
                    pagination={false}
                    size="small"
                    scroll={{ x: 1420 }}
                  />
                ),
                rowExpandable: record => Number(record.qty_terjual || 0) > 0,
              }}
            />
          </Card>
        </Col>
      </Row>

      <style>{`
        .hpp-row-profit td { background: #f6ffed !important; }
        .hpp-row-loss td { background: #fff1f0 !important; }
      `}</style>
    </div>
  )
}
