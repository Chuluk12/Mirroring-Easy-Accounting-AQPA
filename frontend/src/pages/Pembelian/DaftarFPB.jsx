import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Table, Input, Card, DatePicker, Space, Tag, Tooltip,
  Statistic, Row, Col, Typography, Button, Select, message, Badge
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, FileExcelOutlined,
  LoadingOutlined, DollarOutlined, CheckCircleOutlined,
  ClockCircleOutlined, ExclamationCircleOutlined, FileTextOutlined
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

const fmtRp = v => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0
}).format(v || 0)
const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]

// ─── CSV Export ───────────────────────────────────────────────────────────────
const FPB_EXPORT_COLS = [
  { key: 'no',              label: 'No',                  type: 'number' },
  { key: 'no_faktur',      label: 'No Faktur' },
  { key: 'tgl_faktur',     label: 'Tgl Faktur',          type: 'date' },
  { key: 'no_faktur_dp',   label: 'No Faktur Uang Muka' },
  { key: 'tgl_faktur_dp',  label: 'Tgl Faktur Uang Muka', type: 'date' },
  { key: 'no_pemasok',     label: 'No Pemasok' },
  { key: 'nama_pemasok',   label: 'Pemasok' },
  { key: 'nilai_faktur',   label: 'Nilai Faktur',         type: 'currency' },
  { key: 'uang_muka',      label: 'Uang Muka',            type: 'currency' },
  { key: 'nilai_terbayar', label: 'Nilai Terbayar',       type: 'currency' },
  { key: 'terhutang',      label: 'Terhutang',            type: 'currency' },
  { key: 'jatuh_tempo',    label: 'Jatuh Tempo',          type: 'date' },
  { key: 'status',         label: 'Status' },
  { key: 'deskripsi',      label: 'Deskripsi Transaksi' },
]

async function doExport({ params, columns, setExporting }) {
  return exportRowsToXLS({
    fetchRows: async () => {
      const res = await api.get(`/api/fpb/export`, { params })
      return (res.data.data || []).map((row, index) => ({ no: index + 1, ...row }))
    },
    columns,
    filename: 'DaftarFPB',
    sheetName: 'Daftar FPB',
    message,
    setExporting,
    loadingText: 'Mengambil semua data FPB...',
    successText: 'Data FPB berhasil diekspor',
  })
}

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  'Lunas':       { color: 'success',   tagColor: 'green',  icon: <CheckCircleOutlined /> },
  'Belum Lunas': { color: 'processing',tagColor: 'blue',   icon: <ClockCircleOutlined /> },
  'Jatuh Tempo': { color: 'error',     tagColor: 'red',    icon: <ExclamationCircleOutlined /> },
}

// ─── Kolom tabel ──────────────────────────────────────────────────────────────
const columns = [
  {
    title: 'No. Faktur', dataIndex: 'no_faktur', key: 'no_faktur',
    width: 175, fixed: 'left',
    render: v => <Text strong style={{ color: '#1a73e8' }}>{v || '-'}</Text>
  },
  {
    title: 'Tgl Faktur', dataIndex: 'tgl_faktur', key: 'tgl_faktur', width: 115,
    render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-'
  },
  {
    title: 'No Faktur UM', dataIndex: 'no_faktur_dp', key: 'no_faktur_dp', width: 155,
    render: v => v
      ? <Tag color="purple">{v}</Tag>
      : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
  },
  {
    title: 'Tgl Faktur UM', dataIndex: 'tgl_faktur_dp', key: 'tgl_faktur_dp', width: 125,
    render: v => v ? <Tag color="geekblue">{dayjs(v).format('DD/MM/YYYY')}</Tag>
      : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
  },
  {
    title: 'No. Pemasok', dataIndex: 'no_pemasok', key: 'no_pemasok', width: 115,
    render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text>
  },
  {
    title: 'Pemasok', dataIndex: 'nama_pemasok', key: 'nama_pemasok', width: 220,
    ellipsis: { showTitle: false },
    render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip>
  },
  {
    title: 'Nilai Faktur', dataIndex: 'nilai_faktur', key: 'nilai_faktur',
    width: 155, align: 'right',
    render: v => <Text strong>{fmtRp(v)}</Text>
  },
  {
    title: 'Uang Muka', dataIndex: 'uang_muka', key: 'uang_muka',
    width: 145, align: 'right',
    render: v => v > 0
      ? <Text style={{ color: '#722ed1' }}>{fmtRp(v)}</Text>
      : <Text type="secondary">—</Text>
  },
  {
    title: 'Nilai Terbayar', dataIndex: 'nilai_terbayar', key: 'nilai_terbayar',
    width: 150, align: 'right',
    render: v => <Text style={{ color: '#52c41a' }}>{fmtRp(v)}</Text>
  },
  {
    title: 'Terhutang', dataIndex: 'terhutang', key: 'terhutang',
    width: 145, align: 'right',
    render: (v, r) => (
      <Text strong style={{ color: v > 0 ? (r.overdue ? '#ff4d4f' : '#fa8c16') : '#52c41a' }}>
        {fmtRp(v)}
      </Text>
    )
  },
  {
    title: 'Jatuh Tempo', dataIndex: 'jatuh_tempo', key: 'jatuh_tempo', width: 120,
    render: (v, r) => {
      if (!v) return '-'
      const d = dayjs(v)
      const isOD = r.overdue
      return (
        <Tag color={isOD ? 'red' : 'default'} style={{ fontWeight: isOD ? 600 : 400 }}>
          {d.format('DD/MM/YYYY')}
        </Tag>
      )
    }
  },
  {
    title: 'Status', dataIndex: 'status', key: 'status', width: 130,
    render: v => {
      const cfg = STATUS_CFG[v] || STATUS_CFG['Belum Lunas']
      return <Badge status={cfg.color} text={
        <Tag color={cfg.tagColor} icon={cfg.icon} style={{ marginLeft: 0 }}>{v}</Tag>
      } />
    }
  },
  {
    title: 'Deskripsi Transaksi', dataIndex: 'deskripsi', key: 'deskripsi',
    width: 230, ellipsis: { showTitle: false }, fixed: 'right',
    render: v => <Tooltip title={v}><span style={{ color: '#666' }}>{v || '-'}</span></Tooltip>
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function DaftarFPB() {
  const { user } = useAuth()
  const [data, setData]             = useState([])
  const [loading, setLoading]       = useState(false)
  const [exporting, setExporting]   = useState(false)
  const [search, setSearch]         = useState('')
  const [dateRange, setDateRange]   = useState(getCurrentMonthRange)
  const [statusFilter, setStatus]   = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [summary, setSummary]       = useState({
    total_faktur: 0, total_nilai: 0, total_paid: 0, total_owing: 0
  })

  const searchRef    = useRef('')
  const pageRef      = useRef(1)
  const pageSizeRef  = useRef(20)
  const dateRangeRef = useRef(getCurrentMonthRange())
  const statusRef    = useRef('')

  const fetchData = useCallback(async (
    page = 1, pageSize = 20, sv = '', dates = [null, null], stat = '', showLoading = true
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (sv)         params.search    = sv
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to   = dates[1].format('YYYY-MM-DD')
      if (stat)       params.status    = stat

      const res  = await api.get(`/api/fpb`, { params })
      const rows = res.data.data || []
      setData(rows)
      setPagination(prev => ({
        ...prev, current: page, pageSize,
        total: page * pageSize + (rows.length === pageSize ? pageSize : 0),
      }))
      setSummary({
        total_faktur: res.data.total_faktur || 0,
        total_nilai:  res.data.total_nilai  || 0,
        total_paid:   res.data.total_paid   || 0,
        total_owing:  res.data.total_owing  || 0,
      })
    } catch (e) {
      console.error('Error fetch FPB:', e)
      message.error('Gagal memuat data FPB')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(1, 20, '', dateRangeRef.current, '')
    const iv = setInterval(() =>
      fetchData(pageRef.current, pageSizeRef.current, searchRef.current, dateRangeRef.current, statusRef.current, false)
    , 15000)
    return () => clearInterval(iv)
  }, [fetchData])

  const handleSearch = val => {
    searchRef.current = val; setSearch(val); pageRef.current = 1
    fetchData(1, pageSizeRef.current, val, dateRangeRef.current, statusRef.current)
  }
  const handleDate = dates => {
    dateRangeRef.current = dates || [null, null]; setDateRange(dates || [null, null])
    fetchData(1, pageSizeRef.current, searchRef.current, dates, statusRef.current)
  }
  const handleStatus = val => {
    statusRef.current = val || ''; setStatus(val || '')
    fetchData(1, pageSizeRef.current, searchRef.current, dateRangeRef.current, val || '')
  }
  const handleReset = () => {
    const currentMonth = getCurrentMonthRange()
    searchRef.current = ''; dateRangeRef.current = currentMonth; statusRef.current = ''
    setSearch(''); setDateRange(currentMonth); setStatus('')
    fetchData(1, 20, '', currentMonth, '')
  }
  const handleExport = () => {
    const params = {}
    if (search)       params.search    = search
    if (dateRange[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
    if (dateRange[1]) params.date_to   = dateRange[1].format('YYYY-MM-DD')
    if (statusFilter) params.status    = statusFilter
    doExport({
      params,
      columns: [
        FPB_EXPORT_COLS[0],
        ...filterExportColumnsByPermission('fpb', FPB_EXPORT_COLS.slice(1), user),
      ],
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
  const visibleColumns = [serialColumn, ...filterColumnsByPermission('fpb', columns, user)]

  return (
    <div>
      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Total Faktur" value={summary.total_faktur}
              prefix={<FileTextOutlined />} valueStyle={{ color: '#1a73e8' }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Total Nilai Faktur" value={summary.total_nilai}
              formatter={v => fmtRp(v)} valueStyle={{ color: '#1a73e8', fontSize: 16 }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Total Terbayar" value={summary.total_paid}
              formatter={v => fmtRp(v)} valueStyle={{ color: '#52c41a', fontSize: 16 }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Total Terhutang" value={summary.total_owing}
              formatter={v => fmtRp(v)}
              valueStyle={{ color: summary.total_owing > 0 ? '#ff4d4f' : '#52c41a', fontSize: 16 }} />
          </Card>
        </Col>
      </Row>

      {/* Tabel */}
      <Card
        title={<span><DollarOutlined style={{ marginRight: 8, color: '#1a73e8' }} />
          Daftar FPB (Faktur Penerimaan Barang)</span>}
        extra={
          <Space wrap>
            <Select
              placeholder="Semua Status" allowClear style={{ width: 155 }}
              value={statusFilter || undefined} onChange={handleStatus}
              options={[
                { value: 'lunas',       label: '✅ Lunas' },
                { value: 'belum_lunas', label: '🔵 Belum Lunas' },
                { value: 'jatuh_tempo', label: '🔴 Jatuh Tempo' },
              ]}
            />
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={handleDate}
              placeholder={['Tgl Dari', 'Tgl Sampai']} style={{ width: 225 }} />
            <Search placeholder="Cari no faktur, pemasok, deskripsi..."
              allowClear value={search} style={{ width: 265 }}
              prefix={<SearchOutlined />} onSearch={handleSearch}
              onChange={e => { setSearch(e.target.value); if (!e.target.value) handleSearch('') }} />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            <Button type="primary"
              icon={exporting ? <LoadingOutlined /> : <FileExcelOutlined />}
              onClick={handleExport} disabled={exporting}
              style={{ background: '#217346', borderColor: '#217346' }}>
              {exporting ? 'Mengekspor...' : 'Export XLS'}
            </Button>
          </Space>
        }
      >
        <Table
          className="purchase-freeze-table"
          rowKey={(r, i) => `${r.no_faktur}-${i}`}
          columns={withTableSorters(visibleColumns)} dataSource={data} loading={loading}
          size="small"
          sticky={{ offsetHeader: 0 }}
          scroll={{ x: 2100, y: 'calc(100vh - 360px)' }}
          rowClassName={r =>
            r.status === 'Jatuh Tempo' ? 'row-overdue'
            : r.status === 'Lunas'     ? 'row-lunas' : ''
          }
          pagination={{
            ...pagination, showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ~${total} faktur`,
            onChange: (page, ps) => {
              pageRef.current = page; pageSizeRef.current = ps
              fetchData(page, ps, searchRef.current, dateRangeRef.current, statusRef.current)
            },
          }}
        />
      </Card>

      <style>{`
        .row-overdue td { background: #fff2f0 !important; }
        .row-lunas   td { background: #f6ffed !important; }
      `}</style>
    </div>
  )
}
