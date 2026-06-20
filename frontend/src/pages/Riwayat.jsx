import { useEffect, useState, useCallback, useRef } from 'react'
import { Table, Input, Card, Tag, Badge, Button, Space, message } from 'antd'
import { SearchOutlined, ArrowUpOutlined, ArrowDownOutlined, FileExcelOutlined } from '@ant-design/icons'
import api from '../api/client'
import { exportRowsToXLS } from '../utils/exportXls'
import { withTableSorters } from '../utils/tableSorters'
import { useAuth } from '../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../utils/columnPermissions'
import useVisiblePolling from '../hooks/useVisiblePolling'

const { Search } = Input
const DEFAULT_PAGE_SIZE = 20

const RIWAYAT_EXPORT_COLS = [
  { key: 'txdate', label: 'Tanggal', type: 'date' },
  { key: 'itemno', label: 'No. Barang' },
  { key: 'description', label: 'Deskripsi' },
  { key: 'txtype', label: 'Tipe' },
  { key: 'quantity', label: 'Jumlah', type: 'number' },
  { key: 'unit', label: 'Satuan' },
  { key: 'keterangan', label: 'Keterangan' },
  { key: 'status_lacak', label: 'Status Lacak' },
]

export default function Riwayat() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [todayCount, setTodayCount] = useState(0)
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE })
  const [exporting, setExporting] = useState(false)
  const searchRef = useRef('')
  const pageRef = useRef(1)
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE)
  const didMountRef = useRef(false)

  const fetchData = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE, searchVal = '', showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const offset = (page - 1) * pageSize
      const res = await api.get('/api/riwayat', {
        params: { offset, limit: pageSize, search: searchVal }
      })
      setData(res.data.data)
      setTodayCount(res.data.today_count)
      setPagination(prev => ({ ...prev, current: page, pageSize }))
      pageRef.current = page
      pageSizeRef.current = pageSize
      searchRef.current = searchVal
    } catch (e) {
      console.error(e)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [])

  useVisiblePolling(() => {
    fetchData(pageRef.current, pageSizeRef.current, searchRef.current, false)
  }, 30000)

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return undefined
    }

    const timer = setTimeout(() => {
      fetchData(1, pageSizeRef.current, search)
    }, 450)

    return () => clearTimeout(timer)
  }, [fetchData, search])

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const res = await api.get('/api/riwayat/export', {
        params: { search },
      })
      return res.data.data || []
    },
    columns: filterExportColumnsByPermission('riwayat', RIWAYAT_EXPORT_COLS, user),
    filename: 'RiwayatPersediaan',
    sheetName: 'Riwayat Persediaan',
    message,
    setExporting,
    loadingText: 'Menyiapkan data riwayat...',
  })

  const columns = [
    {
      title: 'Tanggal',
      dataIndex: 'txdate',
      key: 'txdate',
      width: 120,
      render: val => <span style={{ color: '#666' }}>{val}</span>
    },
    {
      title: 'Status Lacak',
      dataIndex: 'status_lacak',
      key: 'status_lacak',
      width: 170,
      render: (val, record) => (
        <Tag color={record.is_backdate_detected ? 'gold' : 'blue'}>
          {val || '-'}
        </Tag>
      )
    },
    {
      title: 'No. Barang',
      dataIndex: 'itemno',
      key: 'itemno',
      width: 160,
      render: val => <b>{val}</b>
    },
    {
      title: 'Deskripsi',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Tipe',
      dataIndex: 'txtype',
      key: 'txtype',
      width: 130,
      render: val => {
        const colors = {
          'Penjualan': 'red', 'Pembelian': 'green', 'Penyesuaian': 'orange',
          'Transfer': 'blue', 'Retur': 'purple', 'Manufaktur': 'cyan'
        }
        return <Tag color={colors[val] || 'default'}>{val}</Tag>
      }
    },
    {
      title: 'Jumlah',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 120,
      render: (val, record) => (
        <span style={{ color: val > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
          {val > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          {' '}{Math.abs(val).toFixed(2)} {record.unit}
        </span>
      )
    },
    {
      title: 'Keterangan',
      dataIndex: 'keterangan',
      key: 'keterangan',
    },
  ]
  const visibleColumns = filterColumnsByPermission('riwayat', columns, user)

  return (
    <Card
      title={
        <span>
          📋 Riwayat Perubahan Stok{' '}
          <Badge count={todayCount} overflowCount={9999}
            style={{ backgroundColor: '#1a73e8' }}
            title={`${todayCount} transaksi tanggal hari ini atau terdeteksi dibuat hari ini`}
          />
        </span>
      }
      extra={
        <Space wrap>
          <Search
            placeholder="Cari no. barang atau deskripsi..."
            allowClear
            style={{ width: 300 }}
            prefix={<SearchOutlined />}
            onChange={e => {
              setSearch(e.target.value)
            }}
            onSearch={value => fetchData(1, pageSizeRef.current, value)}
          />
          <Button icon={<FileExcelOutlined />} onClick={handleExport} loading={exporting}>
            Export XLS
          </Button>
        </Space>
      }
    >
      <Table
        rowKey={(record, index) => record.itemhistid || `${record.itemno}-${index}`}
        columns={withTableSorters(visibleColumns)}
        dataSource={data}
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total}`,
          onChange: (page, pageSize) => fetchData(page, pageSize, search)
        }}
        scroll={{ x: 900 }}
        size="middle"
      />
    </Card>
  )
}
