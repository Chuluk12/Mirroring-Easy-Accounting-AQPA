import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Table, Input, Card, DatePicker, Space, Tag, Tooltip,
  Statistic, Row, Col, Typography, Button, Select, Segmented, message
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, ShoppingOutlined,
  FileExcelOutlined, FileDoneOutlined, LoadingOutlined,
  CalendarOutlined, ArrowUpOutlined, ArrowDownOutlined, AimOutlined
} from '@ant-design/icons'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import DocumentDetailDrawer from '../../components/DocumentDetailDrawer'
import useVisiblePolling from '../../hooks/useVisiblePolling'
import dayjs from 'dayjs'
const { Search } = Input
const { RangePicker } = DatePicker
const { Text } = Typography
const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]
const getThisWeekRange = () => {
  const today = dayjs()
  const mondayOffset = (today.day() + 6) % 7
  return [today.subtract(mondayOffset, 'day').startOf('day'), today.endOf('day')]
}

const getFlowPeriodRange = (period) => period === 'week' ? getThisWeekRange() : getCurrentMonthRange()


const formatRp = (val) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0)

const formatQty = (val) =>
  parseFloat(val || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })

const isOverdueEstimate = (date, record = {}) => {
  if (!date) return false
  if (['Diterima', 'Ditutup'].includes(record.status)) return false
  return dayjs(date).isBefore(dayjs(), 'day')
}

const STATUS_COLOR = {
  'Menunggu': 'gold',
  'Diproses': 'blue',
  'Diterima': 'green',
  'Ditutup': 'default',
}

const emptyFlowSummary = {
  sales: {
    current_amount: 0,
    previous_amount: 0,
    change_pct: 0,
    direction: 'up',
    comparison_label: 'periode lalu',
    monthly_target_amount: 0,
    target_achievement_pct: 0,
    target_month_from: '',
    target_month_to: '',
  },
  so: { total: 0, menunggu: 0, diproses: 0, diterima: 0, ditutup: 0, qty_belum_dikirim: 0 },
  so_items: { total: 0, menunggu: 0, diproses: 0, diterima: 0, ditutup: 0, qty_belum_dikirim: 0 },
  do: { total: 0, lines: 0, belum_dikirim: 0 },
}

function SalesFlowDashboard({ token }) {
  const [period, setPeriod] = useState('week')
  const [flowDateRange, setFlowDateRange] = useState(getThisWeekRange)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState(emptyFlowSummary)

  const fetchSummary = useCallback(async (nextPeriod = period, dates = flowDateRange, showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const res = await api.get('/api/penjualan/flow-summary', {
        params: {
          period: nextPeriod,
          date_from: dates[0].format('YYYY-MM-DD'),
          date_to: dates[1].format('YYYY-MM-DD'),
        },
        headers: { Authorization: `Bearer ${token}` },
      })
      setSummary({
        ...emptyFlowSummary,
        ...res.data,
        sales: { ...emptyFlowSummary.sales, ...(res.data.sales || {}) },
        so: { ...emptyFlowSummary.so, ...(res.data.so || {}) },
        so_items: { ...emptyFlowSummary.so_items, ...(res.data.so_items || {}) },
        do: { ...emptyFlowSummary.do, ...(res.data.do || {}) },
      })
    } catch (e) {
      console.error('Error fetch sales flow summary:', e)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [flowDateRange, period, token])

  useEffect(() => {
    fetchSummary(period, flowDateRange)
  }, [fetchSummary, flowDateRange, period])

  useVisiblePolling(() => {
    fetchSummary(period, flowDateRange, false)
  }, 30000)

  const handlePeriodChange = value => {
    const nextRange = getFlowPeriodRange(value)
    setPeriod(value)
    setFlowDateRange(nextRange)
  }

  const handleFlowDateChange = dates => {
    const nextRange = dates || getFlowPeriodRange('week')
    setPeriod('custom')
    setFlowDateRange(nextRange)
  }

  const buildStatusItems = source => [
    { label: 'menunggu', value: source.menunggu || 0, color: '#ff7a00' },
    { label: 'diproses', value: source.diproses || 0, color: '#11b7d8' },
    { label: 'diterima', value: source.diterima || 0, color: '#00a92f' },
    { label: 'ditutup', value: source.ditutup || 0, color: '#697087' },
  ]
  const itemStatusItems = buildStatusItems(summary.so_items)
  const soStatusItems = buildStatusItems(summary.so)
  const periodDates = flowDateRange
  const salesTrendUp = summary.sales.direction !== 'down'
  const salesTrendPct = Math.abs(Number(summary.sales.change_pct || 0)).toLocaleString('id-ID', { maximumFractionDigits: 1 })
  const targetAchievementPct = Number(summary.sales.target_achievement_pct || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })
  const targetMonthLabel = summary.sales.target_month_from
    ? dayjs(summary.sales.target_month_from).format('MM/YYYY')
    : 'bulan lalu'

  return (
    <div className="sales-flow-dashboard">
      <div className="sales-flow-header">
        <Text className="sales-flow-title">Dashboard Ringkasan</Text>
        <Space className="sales-flow-period" align="center" wrap>
          <Text strong><CalendarOutlined /> Periode:</Text>
          <Segmented
            value={period}
            onChange={handlePeriodChange}
            options={[
              { label: 'Minggu ini', value: 'week' },
              { label: 'Bulan ini', value: 'month' },
            ]}
          />
          <RangePicker
            className="sales-flow-date-picker"
            value={periodDates}
            format="DD/MM/YYYY"
            onChange={handleFlowDateChange}
            allowClear={false}
            suffixIcon={null}
          />
        </Space>
      </div>
      <Row gutter={[0, 0]} className="sales-flow-cards">
        <Col xs={24} md={12} xl={6}>
          <div className="sales-flow-card sales-flow-card-so">
            <div className="sales-flow-shape" />
            <Text className="sales-flow-label"><FileDoneOutlined /> SO per Barang</Text>
            <div className="sales-flow-value">{loading ? <LoadingOutlined /> : summary.so_items.total || 0}</div>
            <div className="sales-flow-status-list">
              {itemStatusItems.map(item => (
                <span
                  key={item.label}
                  className="sales-flow-status"
                  style={{ '--status-color': item.color }}
                >
                  <strong>{item.value}</strong> {item.label}
                </span>
              ))}
            </div>
          </div>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <div className="sales-flow-card sales-flow-card-doc">
            <div className="sales-flow-shape" />
            <Text className="sales-flow-label"><FileDoneOutlined /> Jumlah SO</Text>
            <div className="sales-flow-value">{loading ? <LoadingOutlined /> : summary.so.total || 0}</div>
            <div className="sales-flow-status-list">
              {soStatusItems.map(item => (
                <span
                  key={item.label}
                  className="sales-flow-status"
                  style={{ '--status-color': item.color }}
                >
                  <strong>{item.value}</strong> {item.label}
                </span>
              ))}
            </div>
          </div>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <div className="sales-flow-card sales-flow-card-sales">
            <div className="sales-flow-shape" />
            <Text className="sales-flow-label"><ShoppingOutlined /> Total DPP Penjualan</Text>
            <div className="sales-flow-value sales-flow-currency">
              {loading ? <LoadingOutlined /> : formatRp(summary.so.sales_amount || 0)}
            </div>
            <div className={`sales-flow-trend ${salesTrendUp ? 'up' : 'down'}`}>
              {salesTrendUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              <span>{salesTrendPct}% vs {summary.sales.comparison_label}</span>
            </div>
          </div>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <div className="sales-flow-card sales-flow-card-target">
            <div className="sales-flow-shape" />
            <Text className="sales-flow-label"><AimOutlined /> Target Bulanan</Text>
            <div className="sales-flow-value sales-flow-currency">
              {loading ? <LoadingOutlined /> : formatRp(summary.sales.monthly_target_amount || 0)}
            </div>
            <div className="sales-flow-trend target">
              <span>{targetAchievementPct}% tercapai dari {targetMonthLabel}</span>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  )
}

// â”€â”€â”€ Fungsi Export (ambil semua data dari server lalu download CSV) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function exportToExcel({ endpoint, params, filename, columns, token, setExporting }) {
  return exportRowsToXLS({
    fetchRows: async () => {
      const res = await api.get(`${endpoint}`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      })
      return (res.data.data || []).map((row, index) => ({ no: index + 1, ...row }))
    },
    columns,
    filename,
    sheetName: filename,
    message,
    setExporting,
    loadingText: 'Mengambil semua data dari server...',
  })
}

// â”€â”€â”€ Kolom export SO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SO_EXPORT_COLS = [
  { key: 'no',               label: 'No',             type: 'number' },
  { key: 'no_so',            label: 'No SO' },
  { key: 'tgl_so',           label: 'Tgl SO',         type: 'date' },
  { key: 'tgl_estimasi',     label: 'Est. Kirim',      type: 'date' },
  { key: 'no_pelanggan',     label: 'No Pelanggan' },
  { key: 'nama_pelanggan',   label: 'Nama Pelanggan' },
  { key: 'no_po_customer',   label: 'No PO Customer' },
  { key: 'nama_salesman',    label: 'Salesman' },
  { key: 'no_barang',        label: 'No Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'qty',              label: 'Qty Order',       type: 'number' },
  { key: 'qty_shipped',      label: 'Qty Shipped',     type: 'number' },
  { key: 'sisa_kirim',       label: 'Sisa Kirim',      type: 'number' },
  { key: 'stok_tersedia',    label: 'Stok Tersedia',   type: 'number' },
  { key: 'uom',              label: 'UoM' },
  { key: 'unit_price',       label: 'Harga Satuan',    type: 'currency' },
  { key: 'disc_pct',         label: 'Disc %',          type: 'number' },
  { key: 'disc_header_pct',  label: 'Diskon SO %',     type: 'number' },
  { key: 'disc_header_amount', label: 'Diskon SO',     type: 'currency' },
  { key: 'discount_amount',  label: 'Diskon Baris',    type: 'currency' },
  { key: 'ppn_rate',         label: 'PPN %',           type: 'number' },
  { key: 'ppn_amount',       label: 'Nominal PPN',     type: 'currency' },
  { key: 'subtotal',         label: 'Subtotal',        type: 'currency' },
  { key: 'amount',           label: 'DPP Setelah Diskon', type: 'currency' },
  { key: 'no_pengiriman',    label: 'No Pengiriman' },
  { key: 'tgl_pengiriman',   label: 'Tgl Kirim',       type: 'date' },
  { key: 'shipto',           label: 'Kirim Ke' },
  { key: 'deskripsi_so',     label: 'Keterangan' },
  { key: 'status',           label: 'Status' },
]

// â”€â”€â”€ Kolom export Invoice â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TAB 1 â€” Sales Order
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function TabSO() {
  const { user } = useAuth()
  const [data, setData]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch]       = useState('')
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [statusFilter, setStatus] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [summary, setSummary]     = useState({ total_so: 0, total_amount: 0 })
  const [selected, setSelected]   = useState(null)
  const token = localStorage.getItem('token')
  const searchRef = useRef('')
  const dateRangeRef = useRef(getCurrentMonthRange())
  const statusRef = useRef('')
  const pageRef = useRef(1)
  const pageSizeRef = useRef(20)
  const didMountRef = useRef(false)

  const fetchData = useCallback(async (page = 1, pageSize = 20, sv = '', dates = [null, null], stat = '', showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (sv)       params.search    = sv
      if (dates[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates[1]) params.date_to   = dates[1].format('YYYY-MM-DD')
      if (stat)     params.status    = stat

      const res  = await api.get(`/api/penjualan-so`, {
        params, headers: { Authorization: `Bearer ${token}` },
      })
      const rows = res.data.data || []
      setData(rows)
      setPagination(prev => ({
        ...prev, current: page, pageSize,
        total: res.data.total_rows || rows.length,
      }))
      setSummary({ total_so: res.data.total_so || 0, total_amount: res.data.total_amount || 0 })
      pageRef.current = page
      pageSizeRef.current = pageSize
      searchRef.current = sv
      dateRangeRef.current = dates
      statusRef.current = stat
    } catch (e) { console.error('Error fetch SO:', e) }
    finally { if (showLoading) setLoading(false) }
  }, [token])

  useEffect(() => {
    fetchData(1, 20, '', dateRangeRef.current, '')
  }, [fetchData])

  useVisiblePolling(() => {
    fetchData(pageRef.current, pageSizeRef.current, searchRef.current, dateRangeRef.current, statusRef.current, false)
  }, 30000)

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return undefined
    }

    const timer = setTimeout(() => {
      if (search !== searchRef.current) {
        fetchData(1, pageSizeRef.current, search, dateRangeRef.current, statusRef.current)
      }
    }, 450)

    return () => clearTimeout(timer)
  }, [fetchData, search])

  const handleSearch = (val) => {
    setSearch(val)
    searchRef.current = val
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, val, dateRangeRef.current, statusRef.current)
  }
  const handleDate   = (d)   => {
    const dr = d || [null,null]
    dateRangeRef.current = dr
    pageRef.current = 1
    setDateRange(d || null)
    fetchData(1, pageSizeRef.current, searchRef.current, dr, statusRef.current)
  }
  const handleStatus = (v)   => {
    const nextStatus = v || ''
    statusRef.current = nextStatus
    pageRef.current = 1
    setStatus(nextStatus)
    fetchData(1, pageSizeRef.current, searchRef.current, dateRangeRef.current, nextStatus)
  }
  const handleReset  = ()    => {
    const nextDates = getCurrentMonthRange()
    setSearch('')
    setDateRange(nextDates)
    setStatus('')
    searchRef.current = ''
    dateRangeRef.current = nextDates
    statusRef.current = ''
    pageRef.current = 1
    pageSizeRef.current = 20
    fetchData(1, 20, '', nextDates, '')
  }

  const handleExport = () => {
    const params = {}
    if (searchRef.current)       params.search    = searchRef.current
    if (dateRangeRef.current[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
    if (dateRangeRef.current[1]) params.date_to   = dateRangeRef.current[1].format('YYYY-MM-DD')
    if (statusRef.current)       params.status    = statusRef.current
    exportToExcel({
      endpoint: '/api/penjualan-so/export',
      params,
      filename: 'SalesOrder',
      columns: [
        SO_EXPORT_COLS[0],
        ...filterExportColumnsByPermission('penjualan_so', SO_EXPORT_COLS.slice(1), user),
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

  const columns = [
    { title: 'No. SO', dataIndex: 'no_so', key: 'no_so', width: 165, fixed: 'left',
      render: v => <Text strong style={{ color: '#1a73e8' }}>{v}</Text> },
    { title: 'Tgl SO', dataIndex: 'tgl_so', key: 'tgl_so', width: 110,
      render: v => v ? <Tag color="green">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Est. Kirim', dataIndex: 'tgl_estimasi', key: 'tgl_estimasi', width: 110,
      render: (v, rec) => {
        if (!v) return '-'
        const overdue = isOverdueEstimate(v, rec)
        return (
          <Tooltip title={overdue ? 'Estimasi kirim sudah melewati tanggal hari ini' : 'Estimasi kirim'}>
            <Tag color={overdue ? 'red' : 'cyan'}>{dayjs(v).format('DD/MM/YYYY')}</Tag>
          </Tooltip>
        )
      } },
    { title: 'Nama Pelanggan', dataIndex: 'nama_pelanggan', key: 'nama_pelanggan', width: 215, ellipsis: { showTitle: false },
      render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'No. PO Customer', dataIndex: 'no_po_customer', key: 'no_po_customer', width: 150,
      render: v => v ? <Tag color="purple">{v}</Tag> : <span style={{ color: '#ccc' }}>â€”</span> },
    { title: 'Salesman', dataIndex: 'nama_salesman', key: 'nama_salesman', width: 140,
      render: v => v || '-' },
    { title: 'No. Barang', dataIndex: 'no_barang', key: 'no_barang', width: 160,
      render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: 'Deskripsi Barang', dataIndex: 'deskripsi_barang', key: 'deskripsi_barang', width: 260, ellipsis: { showTitle: false },
      render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Qty Order', dataIndex: 'qty', key: 'qty', width: 95, align: 'right',
      render: v => formatQty(v) },
    { title: 'Qty Shipped', dataIndex: 'qty_shipped', key: 'qty_shipped', width: 100, align: 'right',
      render: v => <Text style={{ color: '#52c41a' }}>{formatQty(v)}</Text> },
    { title: 'Sisa Kirim', dataIndex: 'sisa_kirim', key: 'sisa_kirim', width: 95, align: 'right',
      render: v => <Text style={{ color: v > 0 ? '#fa541c' : '#52c41a', fontWeight: v > 0 ? 600 : 400 }}>{formatQty(v)}</Text> },
    { title: 'Stok Tersedia', dataIndex: 'stok_tersedia', key: 'stok_tersedia', width: 115, align: 'right',
      render: (v, rec) => {
        const kurang = Number(v || 0) < Number(rec.sisa_kirim || 0)
        return (
          <Tooltip title={kurang ? 'Stok tersedia lebih kecil dari sisa kirim' : 'Stok tersedia cukup untuk sisa kirim'}>
            <Text strong style={{ color: kurang ? '#ff4d4f' : '#1677ff' }}>{formatQty(v)}</Text>
          </Tooltip>
        )
      } },
    { title: 'UoM', dataIndex: 'uom', key: 'uom', width: 65, align: 'center',
      render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Harga Satuan', dataIndex: 'unit_price', key: 'unit_price', width: 145, align: 'right',
      render: v => formatRp(v) },
    { title: 'Diskon', dataIndex: 'discount_amount', key: 'discount_amount', width: 130, align: 'right',
      render: (v, rec) => (
        <Tooltip title={rec.disc_header_pct ? `Diskon SO ${rec.disc_header_pct}%` : 'Diskon SO'}>
          <Text style={{ color: Number(v || 0) > 0 ? '#fa8c16' : '#8c8c8c' }}>{formatRp(v)}</Text>
        </Tooltip>
      ) },
    { title: 'PPN', dataIndex: 'ppn_rate', key: 'ppn', width: 75, align: 'center',
      render: v => v > 0 ? <Tag color="volcano">{v}%</Tag> : <Tag color="default">-</Tag> },
    { title: 'DPP', dataIndex: 'amount', key: 'amount', width: 155, align: 'right',
      render: v => <Text strong style={{ color: '#52c41a' }}>{formatRp(v)}</Text> },
    { title: 'No. Pengiriman', dataIndex: 'no_pengiriman', key: 'no_pengiriman', width: 165,
      render: v => v ? <Tag color="geekblue">{v}</Tag> : <span style={{ color: '#bbb' }}>-</span> },
    { title: 'Tgl Kirim', dataIndex: 'tgl_pengiriman', key: 'tgl_pengiriman', width: 110,
      render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120, fixed: 'right',
      render: v => <Tag color={STATUS_COLOR[v] || 'default'}>{v || '-'}</Tag> },
  ]

  const detailRows = selected ? data.filter(row => row.no_so === selected.no_so) : []
  const detailFields = [
    { key: 'no_so', label: 'No. SO', render: v => <Text strong>{v}</Text> },
    { key: 'status', label: 'Status', render: v => <Tag color={STATUS_COLOR[v] || 'default'}>{v || '-'}</Tag> },
    { key: 'tgl_so', label: 'Tanggal SO', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'tgl_estimasi', label: 'Estimasi Kirim', render: v => v ? (
      <Tag color={isOverdueEstimate(v, selected) ? 'red' : 'cyan'}>{dayjs(v).format('DD/MM/YYYY')}</Tag>
    ) : '-' },
    { key: 'no_pengiriman', label: 'No Pengiriman' },
    { key: 'tgl_pengiriman', label: 'Tanggal Kirim', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'no_pelanggan', label: 'No Pelanggan' },
    { key: 'nama_pelanggan', label: 'Nama Pelanggan' },
    { key: 'no_po_customer', label: 'No PO Customer' },
    { key: 'nama_salesman', label: 'Salesman' },
    { key: 'shipto', label: 'Kirim Ke' },
    { key: 'deskripsi_so', label: 'Keterangan' },
  ]
  const detailColumns = [
    { title: 'No Barang', dataIndex: 'no_barang', width: 130, render: v => <Text code>{v || '-'}</Text> },
    { title: 'Deskripsi', dataIndex: 'deskripsi_barang', width: 220, ellipsis: true },
    { title: 'Qty', dataIndex: 'qty', width: 80, align: 'right', render: v => formatQty(v) },
    { title: 'Terkirim', dataIndex: 'qty_shipped', width: 85, align: 'right', render: v => formatQty(v) },
    { title: 'Sisa', dataIndex: 'sisa_kirim', width: 80, align: 'right', render: v => formatQty(v) },
    { title: 'No Pengiriman', dataIndex: 'no_pengiriman', width: 145, render: v => v || '-' },
    { title: 'Tgl Kirim', dataIndex: 'tgl_pengiriman', width: 95, render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { title: 'Stok Tersedia', dataIndex: 'stok_tersedia', width: 105, align: 'right', render: v => formatQty(v) },
    { title: 'Diskon', dataIndex: 'discount_amount', width: 110, align: 'right', render: v => formatRp(v) },
    { title: 'DPP', dataIndex: 'amount', width: 130, align: 'right', render: v => <Text strong>{formatRp(v)}</Text> },
  ]
  const visibleColumns = [serialColumn, ...filterColumnsByPermission('penjualan_so', columns, user)]
  const visibleDetailFields = detailFields.filter(field => !field.key || filterExportColumnsByPermission('penjualan_so', [{ key: field.key }], user).length)
  const visibleDetailColumns = filterColumnsByPermission('penjualan_so', detailColumns, user)

  return (
    <div>
      <SalesFlowDashboard token={token} />
      <Card
        title={<span><FileDoneOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Pesanan Penjualan (Sales Order)</span>}
        extra={
          <Space wrap>
            <Select placeholder="Semua Status" allowClear style={{ width: 170 }}
              value={statusFilter || undefined} onChange={handleStatus}
              options={[
                { value: 'waiting',  label: 'Menunggu' },
                { value: 'process',  label: 'Diproses' },
                { value: 'received', label: 'Diterima' },
                { value: 'closed',   label: 'Ditutup' },
              ]}
            />
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={handleDate}
              placeholder={['Tgl Dari', 'Tgl Sampai']} style={{ width: 225 }} />
            <Search placeholder="Cari no SO, pelanggan, PO, barang..." allowClear value={search}
              style={{ width: 255 }} prefix={<SearchOutlined />}
            onSearch={handleSearch}
              onChange={e => setSearch(e.target.value)} />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            <Button type="primary" icon={exporting ? <LoadingOutlined /> : <FileExcelOutlined />}
              onClick={handleExport} disabled={exporting}
              style={{ background: '#217346', borderColor: '#217346' }}>
              {exporting ? 'Mengekspor...' : 'Export XLS'}
            </Button>
          </Space>
        }
      >
        <Table
          className="sales-freeze-table"
          rowKey={(r, i) => `${r.no_so}-${r.no_barang}-${i}`}
          columns={withTableSorters(visibleColumns)} dataSource={data} loading={loading}
          size="small"
          sticky={{ offsetHeader: 0 }}
          scroll={{ x: 2520, y: 'calc(100vh - 340px)' }}
          onRow={rec => ({
            onClick: () => setSelected(rec),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            ...pagination, showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t, range) => `${range[0]}-${range[1]} dari ~${t} baris`,
            onChange: (page, ps) => fetchData(page, ps, searchRef.current, dateRangeRef.current, statusRef.current),
          }}
        />
      </Card>
      <DocumentDetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Detail SO ${selected?.no_so || ''}`}
        subtitle={selected?.nama_pelanggan}
        record={selected}
        fields={visibleDetailFields}
        lineTitle="Detail Barang SO"
        lineRows={detailRows}
        lineColumns={visibleDetailColumns}
      />
      <style>{`
        .sales-freeze-table .ant-table-thead > tr > th {
          position: sticky;
          top: 0;
          z-index: 3;
        }
        .sales-freeze-table .ant-table-tbody > tr > td {
          color: #20243a;
        }
        .sales-flow-dashboard {
          margin-bottom: 16px;
          padding: 2px 0 0;
        }
        .sales-flow-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .sales-flow-period {
          display: inline-flex;
          gap: 10px;
          padding: 6px 8px 6px 10px;
          border: 1px solid rgba(226, 231, 240, 0.82);
          border-radius: 8px;
          background:
            radial-gradient(circle at 12% 18%, rgba(17, 183, 216, 0.13), transparent 32%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 253, 0.82));
          box-shadow: 0 10px 24px rgba(24, 33, 58, 0.05);
        }
        .sales-flow-period .ant-typography {
          color: #2b3145;
          font-size: 12px;
        }
        .sales-flow-period .anticon {
          margin-right: 4px;
        }
        .sales-flow-period .ant-segmented {
          padding: 3px;
          border: 1px solid rgba(226, 231, 240, 0.72);
          background: rgba(255, 255, 255, 0.72);
          border-radius: 8px;
          color: #697087;
        }
        .sales-flow-period .ant-segmented-item {
          border-radius: 7px;
        }
        .sales-flow-period .ant-segmented-item-label {
          min-height: 26px;
          padding: 2px 12px;
          font-size: 12px;
          line-height: 22px;
        }
        .sales-flow-period .ant-segmented-thumb,
        .sales-flow-period .ant-segmented-item-selected {
          background: linear-gradient(135deg, rgba(212, 20, 82, 0.12), rgba(17, 183, 216, 0.16));
          box-shadow: 0 6px 14px rgba(17, 183, 216, 0.12);
        }
        .sales-flow-date {
          padding: 2px 8px;
          border-radius: 8px;
          background: rgba(17, 183, 216, 0.08);
          color: #586174 !important;
          font-weight: 600;
        }
        .sales-flow-date-picker {
          width: 186px;
          border: 0;
          border-radius: 8px;
          background: rgba(17, 183, 216, 0.08);
          box-shadow: none;
        }
        .sales-flow-date-picker input {
          color: #586174 !important;
          font-size: 12px;
          font-weight: 600;
          text-align: center;
        }
        .sales-flow-date-picker .ant-picker-range-separator {
          padding-inline: 2px;
          color: #8a93a6;
        }
        .sales-flow-date-picker.ant-picker-focused {
          box-shadow: 0 0 0 2px rgba(17, 183, 216, 0.12);
        }
        .sales-flow-title {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #20243a;
          font-size: 17px;
          font-weight: 650;
          letter-spacing: 0;
        }
        .sales-flow-title::after {
          content: '';
          width: 34px;
          height: 7px;
          border-radius: 999px;
          background: linear-gradient(90deg, #11b7d8, #7c3cff, #d41452);
          opacity: 0.82;
          clip-path: polygon(0 42%, 62% 42%, 70% 0, 78% 42%, 100% 42%, 100% 70%, 74% 70%, 66% 100%, 58% 70%, 0 70%);
        }
        .sales-flow-cards {
          overflow: hidden;
          border: 1px solid rgba(226, 231, 240, 0.88);
          border-radius: 8px;
          background:
            radial-gradient(circle at 94% 10%, rgba(124, 60, 255, 0.12), transparent 28%),
            radial-gradient(circle at 4% 100%, rgba(17, 183, 216, 0.12), transparent 32%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 253, 0.92));
          box-shadow: 0 16px 40px rgba(24, 33, 58, 0.07);
        }
        .sales-flow-card {
          position: relative;
          min-height: 92px;
          padding: 16px 18px;
          border-right: 1px solid rgba(226, 231, 240, 0.88);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.64), rgba(255, 255, 255, 0.18));
          isolation: isolate;
        }
        .sales-flow-card-so {
          background:
            radial-gradient(circle at 92% 16%, rgba(17, 183, 216, 0.18), transparent 32%),
            linear-gradient(135deg, rgba(17, 183, 216, 0.10), rgba(255,255,255,0.64) 46%, rgba(124, 60, 255, 0.07));
        }
        .sales-flow-card-doc {
          background:
            radial-gradient(circle at 92% 16%, rgba(124, 60, 255, 0.17), transparent 32%),
            linear-gradient(135deg, rgba(124, 60, 255, 0.09), rgba(255,255,255,0.64) 46%, rgba(212, 20, 82, 0.06));
        }
        .sales-flow-card-sales {
          background:
            radial-gradient(circle at 92% 16%, rgba(255, 122, 0, 0.16), transparent 32%),
            linear-gradient(135deg, rgba(212, 20, 82, 0.08), rgba(255,255,255,0.64) 46%, rgba(255, 122, 0, 0.07));
        }
        .sales-flow-card-target {
          background:
            radial-gradient(circle at 92% 16%, rgba(0, 169, 47, 0.16), transparent 32%),
            linear-gradient(135deg, rgba(0, 169, 47, 0.08), rgba(255,255,255,0.64) 46%, rgba(17, 183, 216, 0.07));
        }
        .sales-flow-cards .ant-col:last-child .sales-flow-card {
          border-right: 0;
        }
        .sales-flow-shape {
          position: absolute;
          right: 18px;
          top: 16px;
          width: 54px;
          height: 54px;
          border-radius: 8px;
          background: linear-gradient(135deg, rgba(255,255,255,0.2), rgba(32,36,58,0.05));
          clip-path: polygon(50% 0, 94% 25%, 94% 75%, 50% 100%, 6% 75%, 6% 25%);
          z-index: -1;
        }
        .sales-flow-label {
          display: flex;
          gap: 6px;
          align-items: center;
          color: #586174;
          font-size: 12px;
          font-weight: 600;
        }
        .sales-flow-value {
          margin-top: 5px;
          color: #0f67a8;
          font-size: 26px;
          font-weight: 800;
          line-height: 1.1;
        }
        .sales-flow-card-sales .sales-flow-value {
          color: #d41452;
        }
        .sales-flow-card-doc .sales-flow-value {
          color: #7c3cff;
        }
        .sales-flow-card-target .sales-flow-value {
          color: #00a92f;
        }
        .sales-flow-currency {
          font-size: 22px;
          white-space: nowrap;
        }
        .sales-flow-status-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }
        .sales-flow-status {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          min-height: 22px;
          padding: 2px 8px;
          border: 1px solid color-mix(in srgb, var(--status-color) 18%, transparent);
          border-radius: 8px;
          background: color-mix(in srgb, var(--status-color) 10%, #ffffff);
          color: #343a56;
          font-size: 12px;
          font-weight: 600;
        }
        .sales-flow-status strong {
          color: var(--status-color);
        }
        .sales-flow-note {
          margin-top: 8px;
          font-size: 12px;
          font-weight: 600;
        }
        .sales-flow-note.so {
          color: #223047;
        }
        .sales-flow-note.sales {
          color: #b7791f;
        }
        .sales-flow-trend {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-height: 22px;
          margin-top: 8px;
          padding: 2px 8px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          max-width: 100%;
          white-space: normal;
        }
        .sales-flow-trend.up {
          color: #00a92f;
          background: rgba(0, 169, 47, 0.09);
        }
        .sales-flow-trend.down {
          color: #d41452;
          background: rgba(212, 20, 82, 0.09);
        }
        .sales-flow-trend.target {
          color: #087f5b;
          background: rgba(0, 169, 47, 0.09);
        }
        .sales-flow-trend .anticon {
          font-size: 12px;
        }
        @media (max-width: 767px) {
          .sales-flow-header {
            align-items: stretch;
            flex-direction: column;
          }
          .sales-flow-period {
            width: 100%;
          }
          .sales-flow-card {
            border-right: 0;
            border-bottom: 1px solid rgba(226, 231, 240, 0.88);
          }
          .sales-flow-cards .ant-col:last-child .sales-flow-card {
            border-bottom: 0;
          }
        }
        @media (min-width: 768px) and (max-width: 1199px) {
          .sales-flow-cards .ant-col:nth-child(2n) .sales-flow-card {
            border-right: 0;
          }
          .sales-flow-cards .ant-col:nth-child(-n + 2) .sales-flow-card {
            border-bottom: 1px solid rgba(226, 231, 240, 0.88);
          }
        }
      `}</style>
    </div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TAB 2 â€” Invoice Penjualan
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function TabInvoice() {
  const { user } = useAuth()
  const [data, setData]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch]       = useState('')
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [summary, setSummary]     = useState({ total_rows: 0, total_amount: 0 })
  const [selected, setSelected]   = useState(null)
  const token = localStorage.getItem('token')

  const fetchData = useCallback(async (page = 1, pageSize = 20, sv = '', dates = [null, null], showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (sv)       params.search    = sv
      if (dates[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates[1]) params.date_to   = dates[1].format('YYYY-MM-DD')

      const res  = await api.get(`/api/penjualan`, {
        params, headers: { Authorization: `Bearer ${token}` },
      })
      const rows = res.data.data || []
      setData(rows)
      setPagination(prev => ({
        ...prev, current: page, pageSize,
        total: page * pageSize + (rows.length === pageSize ? pageSize : 0),
      }))
      setSummary({ total_rows: rows.length, total_amount: rows.reduce((s, r) => s + (r.amount || 0), 0) })
    } catch (e) { console.error('Error fetch invoice:', e) }
    finally { if (showLoading) setLoading(false) }
  }, [token])

  useEffect(() => {
    fetchData(1, 20, '', getCurrentMonthRange())
    const interval = setInterval(() => {
      fetchData(pagination.current, pagination.pageSize, search, dateRange, false)
    }, 10000)
    return () => clearInterval(interval)
  }, [dateRange, fetchData, pagination.current, pagination.pageSize, search])

  const handleSearch = (val) => { setSearch(val); fetchData(1, pagination.pageSize, val, dateRange) }
  const handleDate   = (d)   => { const dr = d || [null,null]; setDateRange(dr); fetchData(1, pagination.pageSize, search, dr) }
  const handleReset  = ()    => {
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
    exportToExcel({
      endpoint: '/api/penjualan/export',
      params,
      filename: 'InvoicePenjualan',
      columns: filterExportColumnsByPermission('penjualan', INV_EXPORT_COLS, user),
      token,
      setExporting,
    })
  }

  const columns = [
    { title: 'No. Invoice', dataIndex: 'no_penjualan', key: 'no_penjualan', width: 165, fixed: 'left',
      render: v => <Text strong style={{ color: '#1a73e8' }}>{v}</Text> },
    { title: 'Tgl Invoice', dataIndex: 'tgl_penjualan', key: 'tgl_penjualan', width: 115,
      render: v => v ? <Tag color="green">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'No. Pelanggan', dataIndex: 'no_pelanggan', key: 'no_pelanggan', width: 115,
      render: v => <Text code>{v || '-'}</Text> },
    { title: 'Nama Pelanggan', dataIndex: 'nama_pelanggan', key: 'nama_pelanggan', width: 215, ellipsis: { showTitle: false },
      render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'No. PO', dataIndex: 'no_po', key: 'no_po', width: 145,
      render: v => v ? <Tag color="purple">{v}</Tag> : <span style={{ color: '#ccc' }}>â€”</span> },
    { title: 'No. Barang', dataIndex: 'no_barang', key: 'no_barang', width: 160,
      render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: 'Deskripsi Barang', dataIndex: 'deskripsi_barang', key: 'deskripsi_barang', width: 260, ellipsis: { showTitle: false },
      render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 80, align: 'right',
      render: v => formatQty(v) },
    { title: 'UoM', dataIndex: 'uom', key: 'uom', width: 65, align: 'center',
      render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Harga Satuan', dataIndex: 'price', key: 'price', width: 145, align: 'right',
      render: v => formatRp(v) },
    { title: 'PPN', dataIndex: 'ppn_kode', key: 'ppn', width: 90, align: 'center',
      render: (kode, rec) => kode
        ? <Tag color="volcano">{kode}{rec.ppn_rate > 0 ? ` (${rec.ppn_rate}%)` : ''}</Tag>
        : <Tag color="default">Non-PKP</Tag> },
    { title: 'Nominal PPN', dataIndex: 'ppn_amount', key: 'ppn_amount', width: 145, align: 'right',
      render: v => <Text style={{ color: '#fa8c16' }}>{formatRp(v)}</Text> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 155, align: 'right', fixed: 'right',
      render: v => <Text strong style={{ color: '#52c41a' }}>{formatRp(v)}</Text> },
  ]

  const detailRows = selected ? data.filter(row => row.no_penjualan === selected.no_penjualan) : []
  const detailFields = [
    { key: 'no_penjualan', label: 'No. Invoice', render: v => <Text strong>{v}</Text> },
    { key: 'tgl_penjualan', label: 'Tanggal Invoice', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'no_pelanggan', label: 'No Pelanggan' },
    { key: 'nama_pelanggan', label: 'Nama Pelanggan' },
    { key: 'no_po', label: 'No PO Customer' },
    { key: 'deskripsi', label: 'Keterangan' },
  ]
  const detailColumns = [
    { title: 'No Barang', dataIndex: 'no_barang', width: 130, render: v => <Text code>{v || '-'}</Text> },
    { title: 'Deskripsi', dataIndex: 'deskripsi_barang', width: 220, ellipsis: true },
    { title: 'Qty', dataIndex: 'qty', width: 80, align: 'right', render: v => formatQty(v) },
    { title: 'UoM', dataIndex: 'uom', width: 70, render: v => v || '-' },
    { title: 'Harga', dataIndex: 'price', width: 120, align: 'right', render: v => formatRp(v) },
    { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: v => <Text strong>{formatRp(v)}</Text> },
  ]
  const visibleColumns = filterColumnsByPermission('penjualan', columns, user)
  const visibleDetailFields = detailFields.filter(field => !field.key || filterExportColumnsByPermission('penjualan', [{ key: field.key }], user).length)
  const visibleDetailColumns = filterColumnsByPermission('penjualan', detailColumns, user)

  return (
    <div>
      <Row gutter={[16,16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12}>
          <Card size="small"><Statistic title="Baris Ditampilkan" value={summary.total_rows}
            prefix={<ShoppingOutlined />} valueStyle={{ color: '#1a73e8' }} /></Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small"><Statistic title="Total Amount (halaman ini)" value={summary.total_amount}
            formatter={v => formatRp(v)} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
      </Row>
      <Card
        title={<span><ShoppingOutlined style={{ marginRight: 8, color: '#52c41a' }} />Invoice Penjualan (AR Invoice)</span>}
        extra={
          <Space wrap>
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={handleDate}
              placeholder={['Tgl Dari', 'Tgl Sampai']} style={{ width: 225 }} />
            <Search placeholder="Cari no faktur, pelanggan, barang..." allowClear value={search}
              style={{ width: 255 }} prefix={<SearchOutlined />}
              onSearch={handleSearch}
              onChange={e => { setSearch(e.target.value); if (!e.target.value) handleSearch('') }} />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            <Button type="primary" icon={exporting ? <LoadingOutlined /> : <FileExcelOutlined />}
              onClick={handleExport} disabled={exporting}
              style={{ background: '#217346', borderColor: '#217346' }}>
              {exporting ? 'Mengekspor...' : 'Export XLS'}
            </Button>
          </Space>
        }
      >
        <Table
          rowKey={(r, i) => `${r.no_penjualan}-${r.no_barang}-${i}`}
          columns={withTableSorters(visibleColumns)} dataSource={data} loading={loading}
          size="small" scroll={{ x: 1900 }}
          onRow={rec => ({
            onClick: () => setSelected(rec),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            ...pagination, showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t, range) => `${range[0]}-${range[1]} dari ~${t} baris`,
            onChange: (page, ps) => fetchData(page, ps, search, dateRange),
          }}
        />
      </Card>
      <DocumentDetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Detail Invoice ${selected?.no_penjualan || ''}`}
        subtitle={selected?.nama_pelanggan}
        record={selected}
        fields={visibleDetailFields}
        lineTitle="Detail Barang Invoice"
        lineRows={detailRows}
        lineColumns={visibleDetailColumns}
      />
    </div>
  )
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ROOT â€” Tabs wrapper
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export default function Penjualan() {
  return <TabSO />
}
