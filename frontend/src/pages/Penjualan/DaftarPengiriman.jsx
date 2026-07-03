import { useEffect, useState, useCallback } from 'react'
import {
  Table, Input, Card, DatePicker, Select, Space, Tag, Tooltip,
  Statistic, Row, Col, Typography, Button, message
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, FileExcelOutlined,
  LoadingOutlined, CarOutlined, ClockCircleOutlined,
  WarningOutlined, CheckCircleOutlined
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
  { key: 'marketing',       label: 'Marketing' },
  { key: 'no_pesanan',      label: 'No SO' },
  { key: 'tgl_pesanan',     label: 'Tgl SO',          type: 'date' },
  { key: 'tgl_estimasi_so', label: 'Tgl Estimasi SO', type: 'date' },
  { key: 'umur',             label: 'Umur',            type: 'number' },
  { key: 'keterangan_so',    label: 'Keterangan SO' },
  { key: 'remark',           label: 'Remaks' },
  { key: 'nama_pelanggan',  label: 'Customer' },
  { key: 'no_po',           label: 'No PO Customer' },
  { key: 'no_pengiriman',   label: 'No Pengiriman Barang' },
  { key: 'tgl_pengiriman',  label: 'Tgl Pengiriman Barang', type: 'date' },
  { key: 'status_do',       label: 'Status DO (Pengiriman)' },
  { key: 'no_barang',       label: 'No Barang' },
  { key: 'deskripsi_barang',label: 'Deskripsi Barang' },
  { key: 'qty_so',          label: 'Qty SO',          type: 'number' },
  { key: 'qty_shipped',     label: 'Qty Kirim',       type: 'number' },
  { key: 'stok_barang',     label: 'Stok Barang',     type: 'number' },
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

function EditableRemark({ record, onSaved }) {
  const [value, setValue] = useState(record.remark || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => setValue(record.remark || ''), [record.remark])

  const save = async () => {
    const normalized = value.trim()
    if (normalized === (record.remark || '').trim()) return
    setSaving(true)
    try {
      const res = await api.post('/api/penjualan-do/remark', {
        row_key: record.row_key,
        remark: normalized,
      })
      onSaved(record.row_key, res.data.data || { remark: normalized })
      message.success('Remaks disimpan.')
    } catch (error) {
      setValue(record.remark || '')
      message.error(error.response?.data?.message || 'Gagal menyimpan remaks.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Input.TextArea
      value={value}
      autoSize={{ minRows: 1, maxRows: 3 }}
      maxLength={500}
      placeholder="Input remaks"
      status={saving ? 'warning' : undefined}
      onChange={event => setValue(event.target.value)}
      onBlur={save}
    />
  )
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

const orderedColumns = [
  {
    title: 'Marketing', dataIndex: 'marketing', key: 'marketing',
    width: 190, fixed: 'left', ellipsis: { showTitle: false },
    render: v => <Tooltip title={v}><Text strong>{v || '-'}</Text></Tooltip>,
  },
  {
    title: 'No. SO', dataIndex: 'no_pesanan', key: 'no_pesanan',
    width: 155, fixed: 'left',
    render: v => v ? <Tag color="cyan">{v}</Tag> : '-',
  },
  {
    title: 'Tgl SO', dataIndex: 'tgl_pesanan', key: 'tgl_pesanan',
    width: 110,
    render: v => v ? <Tag color="green">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-',
  },
  {
    title: 'Tgl Estimasi SO', dataIndex: 'tgl_estimasi_so', key: 'tgl_estimasi_so',
    width: 140,
    render: v => v ? <Tag color="gold">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-',
  },
  {
    title: 'Umur', dataIndex: 'umur', key: 'umur',
    width: 80, align: 'center',
    render: v => v === null || v === undefined
      ? '-'
      : <Text type={v < 0 ? 'danger' : undefined} strong>{v}</Text>,
  },
  {
    title: 'Keterangan SO', dataIndex: 'keterangan_so', key: 'keterangan_so',
    width: 135,
    render: v => {
      const colors = {
        Selesai: 'green',
        Late: 'red',
        'DT Hari Ini': 'orange',
        'DT Besok': 'gold',
        'On Progress': 'blue',
      }
      return v ? <Tag color={colors[v] || 'default'}>{v}</Tag> : '-'
    },
  },
  {
    title: 'Customer', dataIndex: 'nama_pelanggan', key: 'nama_pelanggan',
    width: 230, ellipsis: { showTitle: false },
    render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip>,
  },
  {
    title: 'No. PO (Customer)', dataIndex: 'no_po', key: 'no_po',
    width: 160,
    render: v => v ? <Tag color="purple">{v}</Tag> : '-',
  },
  {
    title: 'No. Pengiriman Barang', dataIndex: 'no_pengiriman', key: 'no_pengiriman',
    width: 185,
    render: v => <Text strong style={{ color: '#1a73e8' }}>{v || '-'}</Text>,
  },
  {
    title: 'Tgl Pengiriman Barang', dataIndex: 'tgl_pengiriman', key: 'tgl_pengiriman',
    width: 165,
    render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-',
  },
  {
    title: 'Status DO (Pengiriman)', dataIndex: 'status_do', key: 'status_do',
    width: 190,
    render: v => {
      const color = v === 'Lengkap'
        ? 'green'
        : v === 'Menunggu'
          ? 'orange'
          : 'red'
      return v ? <Tag color={color}>{v}</Tag> : '-'
    },
  },
  {
    title: 'No. Barang', dataIndex: 'no_barang', key: 'no_barang',
    width: 165,
    render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text>,
  },
  {
    title: 'Deskripsi Barang', dataIndex: 'deskripsi_barang', key: 'deskripsi_barang',
    width: 300, ellipsis: { showTitle: false },
    render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip>,
  },
  {
    title: 'Qty SO', dataIndex: 'qty_so', key: 'qty_so',
    width: 90, align: 'right',
    render: v => <Text strong>{formatQty(v)}</Text>,
  },
  {
    title: 'Qty Kirim (Shipped)', dataIndex: 'qty_shipped', key: 'qty_shipped',
    width: 145, align: 'right',
    render: v => <Text strong>{formatQty(v)}</Text>,
  },
  {
    title: 'Stok Barang', dataIndex: 'stok_barang', key: 'stok_barang',
    width: 110, align: 'right',
    render: v => (
      <Text style={{ color: Number(v || 0) > 0 ? '#08979c' : '#cf1322' }}>
        {formatQty(v)}
      </Text>
    ),
  },
  {
    title: 'UoM', dataIndex: 'uom', key: 'uom',
    width: 70, align: 'center',
    render: v => v ? <Tag>{v}</Tag> : '-',
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
  const [marketing, setMarketing]   = useState('')
  const [keteranganSo, setKeteranganSo] = useState('')
  const [statusDo, setStatusDo]     = useState('')
  const [marketingOptions, setMarketingOptions] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [summary, setSummary]       = useState({
    total_so: 0,
    waiting_so: 0,
    incomplete_so: 0,
    complete_so: 0,
  })
  const token = localStorage.getItem('token')

  const fetchData = useCallback(async (
    page = 1,
    pageSize = 20,
    sv = '',
    dates = [null, null],
    marketingValue = '',
    keteranganValue = '',
    statusValue = '',
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (sv)       params.search    = sv
      if (dates[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates[1]) params.date_to   = dates[1].format('YYYY-MM-DD')
      if (marketingValue) params.marketing = marketingValue
      if (keteranganValue) params.keterangan_so = keteranganValue
      if (statusValue) params.status_do = statusValue

      const res  = await api.get(`/api/penjualan-do`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      })
      const rows = res.data.data || []
      setData(rows)
      setPagination(prev => ({
        ...prev, current: page, pageSize,
        total: res.data.total_rows || 0,
      }))
      setSummary(res.data.summary || {
        total_so: 0,
        waiting_so: 0,
        incomplete_so: 0,
        complete_so: 0,
      })
      setMarketingOptions(res.data.marketing_options || [])
    } catch (e) {
      console.error('Error fetch DO:', e)
      message.error('Gagal memuat data pengiriman')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchData(1, 20, '', getCurrentMonthRange(), '', '', '')
  }, [fetchData])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(
        pagination.current,
        pagination.pageSize,
        search,
        dateRange,
        marketing,
        keteranganSo,
        statusDo,
        false,
      )
    }, 10000)
    return () => clearInterval(interval)
  }, [
    dateRange, fetchData, keteranganSo, marketing,
    pagination.current, pagination.pageSize, search, statusDo,
  ])

  const handleSearch = (val) => {
    setSearch(val)
    fetchData(1, pagination.pageSize, val, dateRange, marketing, keteranganSo, statusDo)
  }
  const handleDate = (d) => {
    const dr = d || [null, null]
    setDateRange(dr)
    fetchData(1, pagination.pageSize, search, dr, marketing, keteranganSo, statusDo)
  }
  const handleMarketing = value => {
    const next = value || ''
    setMarketing(next)
    fetchData(1, pagination.pageSize, search, dateRange, next, keteranganSo, statusDo)
  }
  const handleKeterangan = value => {
    const next = value || ''
    setKeteranganSo(next)
    fetchData(1, pagination.pageSize, search, dateRange, marketing, next, statusDo)
  }
  const handleStatusDo = value => {
    const next = value || ''
    setStatusDo(next)
    fetchData(1, pagination.pageSize, search, dateRange, marketing, keteranganSo, next)
  }
  const handleReset = () => {
    const currentMonth = getCurrentMonthRange()
    setSearch('')
    setDateRange(currentMonth)
    setMarketing('')
    setKeteranganSo('')
    setStatusDo('')
    fetchData(1, 20, '', currentMonth, '', '', '')
  }
  const handleExport = () => {
    const params = {}
    if (search)       params.search    = search
    if (dateRange[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
    if (dateRange[1]) params.date_to   = dateRange[1].format('YYYY-MM-DD')
    if (marketing) params.marketing = marketing
    if (keteranganSo) params.keterangan_so = keteranganSo
    if (statusDo) params.status_do = statusDo
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
  const handleRemarkSaved = useCallback((rowKey, saved) => {
    setData(rows => rows.map(row => (
      row.row_key === rowKey
        ? {
            ...row,
            remark: saved.remark || '',
            remark_updated_by: saved.updated_by || '',
            remark_updated_at: saved.updated_at || '',
          }
        : row
    )))
  }, [])
  const serialColumn = {
    title: 'No',
    key: 'no',
    width: 70,
    fixed: 'left',
    align: 'center',
    render: (_, __, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1,
  }
  const remarkColumn = {
    title: 'Remaks',
    dataIndex: 'remark',
    key: 'remark',
    width: 240,
    fixed: 'right',
    render: (_, record) => <EditableRemark record={record} onSaved={handleRemarkSaved} />,
  }
  const visibleColumns = [
    serialColumn,
    ...filterColumnsByPermission('penjualan_do', [...orderedColumns, remarkColumn], user),
  ]

  return (
    <div>
      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Total SO"
              value={summary.total_so}
              prefix={<CarOutlined />}
              valueStyle={{ color: '#1a73e8' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Menunggu Pengiriman"
              value={summary.waiting_so}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#d48806' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Belum Lengkap"
              value={summary.incomplete_so}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Lengkap"
              value={summary.complete_so}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#389e0d' }}
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
            <Select
              showSearch
              allowClear
              value={marketing || undefined}
              placeholder="Filter Marketing"
              style={{ width: 180 }}
              onChange={handleMarketing}
              options={marketingOptions.map(value => ({ value, label: value }))}
            />
            <Select
              allowClear
              value={keteranganSo || undefined}
              placeholder="Keterangan SO"
              style={{ width: 160 }}
              onChange={handleKeterangan}
              options={[
                { value: 'done', label: 'Selesai' },
                { value: 'late', label: 'Late' },
                { value: 'today', label: 'DT Hari Ini' },
                { value: 'tomorrow', label: 'DT Besok' },
                { value: 'progress', label: 'On Progress' },
                { value: 'empty', label: 'Tanpa Estimasi' },
              ]}
            />
            <Select
              allowClear
              value={statusDo || undefined}
              placeholder="Status DO"
              style={{ width: 160 }}
              onChange={handleStatusDo}
              options={[
                { value: 'waiting', label: 'Menunggu' },
                { value: 'incomplete', label: 'Belum Lengkap' },
                { value: 'complete', label: 'Lengkap' },
              ]}
            />
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
          rowKey="row_key"
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          sticky={{ offsetHeader: 0 }}
          scroll={{ x: 2940, y: 'calc(100vh - 360px)' }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ~${total} baris`,
            onChange: (page, ps) => fetchData(
              page, ps, search, dateRange, marketing, keteranganSo, statusDo,
            ),
          }}
        />
      </Card>
    </div>
  )
}
