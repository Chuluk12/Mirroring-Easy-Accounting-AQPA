import { useEffect, useState, useCallback } from 'react'
import {
  Table, Input, Card, DatePicker, Space, Tag, Tooltip,
  Statistic, Row, Col, Typography, Button, message
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, FileExcelOutlined,
  LoadingOutlined, CarOutlined, FileDoneOutlined
} from '@ant-design/icons'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import dayjs from 'dayjs'

const { Search }     = Input
const { RangePicker} = DatePicker
const { Text }       = Typography

const formatQty = (val) =>
  parseFloat(val || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })
const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]

// ─── CSV Export (tanpa library eksternal) ────────────────────────────────────
const DO_EXPORT_COLS = [
  { key: 'no',              label: 'No',             type: 'number' },
  { key: 'no_pengiriman',   label: 'No Pengiriman' },
  { key: 'tgl_pengiriman',  label: 'Tgl Pengiriman', type: 'date' },
  { key: 'no_pelanggan',    label: 'No Pelanggan' },
  { key: 'nama_pelanggan',  label: 'Pelanggan' },
  { key: 'no_po',           label: 'No PO' },
  { key: 'no_pesanan',      label: 'No Pesanan (SO)' },
  { key: 'tgl_pesanan',     label: 'Tgl Pesanan',    type: 'date' },
  { key: 'deskripsi',       label: 'Deskripsi Transaksi' },
  { key: 'no_barang',       label: 'No Barang' },
  { key: 'deskripsi_barang',label: 'Deskripsi Barang' },
  { key: 'qty',             label: 'Qty',            type: 'number' },
  { key: 'uom',             label: 'UoM' },
]

async function exportData({ params, columns, token, setExporting }) {
  return exportRowsToXLS({
    fetchRows: async () => {
      const res = await api.get(`/api/penjualan-do/export`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      })
      return (res.data.data || []).map((row, index) => ({ no: index + 1, ...row }))
    },
    columns,
    filename: 'PengirimanBarang',
    sheetName: 'Pengiriman Barang',
    message,
    setExporting,
    loadingText: 'Mengambil semua data pengiriman...',
  })
}

// ─── Kolom tabel ─────────────────────────────────────────────────────────────
const columns = [
  {
    title: 'No. Pengiriman', dataIndex: 'no_pengiriman', key: 'no_pengiriman',
    width: 165, fixed: 'left',
    render: v => <Text strong style={{ color: '#1a73e8' }}>{v || '-'}</Text>
  },
  {
    title: 'Tgl Pengiriman', dataIndex: 'tgl_pengiriman', key: 'tgl_pengiriman',
    width: 125,
    render: v => v
      ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag>
      : '-'
  },
  {
    title: 'No. Pelanggan', dataIndex: 'no_pelanggan', key: 'no_pelanggan',
    width: 120,
    render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text>
  },
  {
    title: 'Pelanggan', dataIndex: 'nama_pelanggan', key: 'nama_pelanggan',
    width: 220, ellipsis: { showTitle: false },
    render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip>
  },
  {
    title: 'No. PO', dataIndex: 'no_po', key: 'no_po',
    width: 150,
    render: v => v
      ? <Tag color="purple">{v}</Tag>
      : <span style={{ color: '#ccc' }}>—</span>
  },
  {
    title: 'No. Pesanan (SO)', dataIndex: 'no_pesanan', key: 'no_pesanan',
    width: 165,
    render: v => v
      ? <Tag color="cyan">{v}</Tag>
      : <span style={{ color: '#ccc' }}>—</span>
  },
  {
    title: 'Tgl Pesanan', dataIndex: 'tgl_pesanan', key: 'tgl_pesanan',
    width: 115,
    render: v => v
      ? <Tag color="green">{dayjs(v).format('DD/MM/YYYY')}</Tag>
      : '-'
  },
  {
    title: 'Deskripsi Transaksi', dataIndex: 'deskripsi', key: 'deskripsi',
    width: 200, ellipsis: { showTitle: false },
    render: v => v
      ? <Tooltip title={v}><span>{v}</span></Tooltip>
      : <span style={{ color: '#ccc' }}>—</span>
  },
  {
    title: 'No. Barang', dataIndex: 'no_barang', key: 'no_barang',
    width: 165,
    render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text>
  },
  {
    title: 'Deskripsi Barang', dataIndex: 'deskripsi_barang', key: 'deskripsi_barang',
    width: 300, ellipsis: { showTitle: false },
    render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip>
  },
  {
    title: 'Qty', dataIndex: 'qty', key: 'qty',
    width: 80, align: 'right',
    render: v => <Text strong>{formatQty(v)}</Text>
  },
  {
    title: 'UoM', dataIndex: 'uom', key: 'uom',
    width: 70, align: 'center',
    render: v => v ? <Tag>{v}</Tag> : '-'
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function DaftarPengiriman() {
  const { user } = useAuth()
  const [data, setData]             = useState([])
  const [loading, setLoading]       = useState(false)
  const [exporting, setExporting]   = useState(false)
  const [search, setSearch]         = useState('')
  const [dateRange, setDateRange]   = useState(getCurrentMonthRange)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [summary, setSummary]       = useState({ total_do: 0, total_rows: 0 })
  const token = localStorage.getItem('token')

  const fetchData = useCallback(async (page = 1, pageSize = 20, sv = '', dates = [null, null], showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (sv)       params.search    = sv
      if (dates[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates[1]) params.date_to   = dates[1].format('YYYY-MM-DD')

      const res  = await api.get(`/api/penjualan-do`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      })
      const rows = res.data.data || []
      setData(rows)
      setPagination(prev => ({
        ...prev, current: page, pageSize,
        total: page * pageSize + (rows.length === pageSize ? pageSize : 0),
      }))
      setSummary({
        total_do:   res.data.total_do   || 0,
        total_rows: rows.length,
      })
    } catch (e) {
      console.error('Error fetch DO:', e)
      message.error('Gagal memuat data pengiriman')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchData(1, 20, '', getCurrentMonthRange())
    const interval = setInterval(() => {
      fetchData(pagination.current, pagination.pageSize, search, dateRange, false)
    }, 10000)
    return () => clearInterval(interval)
  }, [dateRange, fetchData, pagination.current, pagination.pageSize, search])

  const handleSearch = (val) => {
    setSearch(val)
    fetchData(1, pagination.pageSize, val, dateRange)
  }
  const handleDate = (d) => {
    const dr = d || [null, null]
    setDateRange(dr)
    fetchData(1, pagination.pageSize, search, dr)
  }
  const handleReset = () => {
    const currentMonth = getCurrentMonthRange()
    setSearch('')
    setDateRange(currentMonth)
    fetchData(1, 20, '', currentMonth)
  }
  const handleExport = () => {
    const params = {}
    if (search)       params.search    = search
    if (dateRange[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
    if (dateRange[1]) params.date_to   = dateRange[1].format('YYYY-MM-DD')
    exportData({
      params,
      columns: [
        DO_EXPORT_COLS[0],
        ...filterExportColumnsByPermission('penjualan_do', DO_EXPORT_COLS.slice(1), user),
      ],
      token,
      setExporting,
    })
  }
  const serialColumn = {
    title: 'No',
    key: 'no',
    width: 70,
    fixed: 'left',
    align: 'center',
    render: (_, __, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1,
  }
  const visibleColumns = [serialColumn, ...filterColumnsByPermission('penjualan_do', columns, user)]

  return (
    <div>
      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Total DO (filter aktif)"
              value={summary.total_do}
              prefix={<CarOutlined />}
              valueStyle={{ color: '#1a73e8' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Baris Ditampilkan"
              value={summary.total_rows}
              prefix={<FileDoneOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="Halaman"
              value={`${pagination.current}`}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabel */}
      <Card
        title={
          <span>
            <CarOutlined style={{ marginRight: 8, color: '#1a73e8' }} />
            Daftar Pengiriman Barang
          </span>
        }
        extra={
          <Space wrap>
            <RangePicker
              value={dateRange}
              format="DD/MM/YYYY"
              onChange={handleDate}
              placeholder={['Tgl Dari', 'Tgl Sampai']}
              style={{ width: 225 }}
            />
            <Search
              placeholder="Cari no DO, pelanggan, PO, SO, barang..."
              allowClear
              value={search}
              style={{ width: 270 }}
              prefix={<SearchOutlined />}
              onSearch={handleSearch}
              onChange={e => {
                setSearch(e.target.value)
                if (!e.target.value) handleSearch('')
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              Reset
            </Button>
            <Button
              type="primary"
              icon={exporting ? <LoadingOutlined /> : <FileExcelOutlined />}
              onClick={handleExport}
              disabled={exporting}
              style={{ background: '#217346', borderColor: '#217346' }}
            >
              {exporting ? 'Mengekspor...' : 'Export XLS'}
            </Button>
          </Space>
        }
      >
        <Table
          className="sales-freeze-table"
          rowKey={(r, i) => `${r.no_pengiriman}-${r.no_barang}-${i}`}
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          sticky={{ offsetHeader: 0 }}
          scroll={{ x: 1900, y: 'calc(100vh - 360px)' }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ~${total} baris`,
            onChange: (page, ps) => fetchData(page, ps, search, dateRange),
          }}
        />
      </Card>
    </div>
  )
}
