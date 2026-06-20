import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Table, Input, Card, DatePicker, Space, Tag, Tooltip, Select,
  Statistic, Row, Col, Typography, Button, Progress, Badge, message
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, FileExcelOutlined,
  LoadingOutlined, CheckCircleOutlined, ClockCircleOutlined,
  MinusCircleOutlined, ExperimentOutlined
} from '@ant-design/icons'
import api from '../../api/client'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import DocumentDetailDrawer from '../../components/DocumentDetailDrawer'
import dayjs from 'dayjs'

const { Search }     = Input
const { RangePicker} = DatePicker
const { Text }       = Typography
const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]

const fmtQty = (v) => parseFloat(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 3 })

// ─── CSV Export ───────────────────────────────────────────────────────────────
const GP_EXPORT_COLS = [
  { key: 'no_hasil',         label: 'No Hasil Produksi' },
  { key: 'tgl_hasil',        label: 'Tgl Hasil Produksi', type: 'date' },
  { key: 'no_spk',           label: 'No SPK' },
  { key: 'no_spm',           label: 'No SPM' },
  { key: 'deskripsi',        label: 'Deskripsi Transaksi' },
  { key: 'no_barang',        label: 'No Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'qty_jadi',         label: 'Qty Jadi',    type: 'number' },
  { key: 'qty_plan',         label: 'Qty Plan',    type: 'number' },
  { key: 'uom',              label: 'UoM' },
  { key: 'persentase',       label: 'Persentase (%)', type: 'number' },
  { key: 'status',           label: 'Status' },
]

function escapeCell(value) {
  return (value ?? '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatExportValue(row, column) {
  const value = row[column.key]
  if (column.type === 'date') return value ? dayjs(value).format('DD/MM/YYYY') : ''
  if (column.type === 'number') return Number(value || 0)
  return value ?? ''
}

function downloadXLS(rows, columns, filename) {
  const header = columns.map(column => (
    `<th style="background:#217346;color:#ffffff;font-weight:bold;">${escapeCell(column.label)}</th>`
  )).join('')

  const body = rows.map(row => (
    `<tr>${columns.map(column => {
      const value = formatExportValue(row, column)
      const align = column.type === 'number' ? 'right' : 'left'
      return `<td style="text-align:${align};mso-number-format:'\\@';">${escapeCell(value)}</td>`
    }).join('')}</tr>`
  )).join('')

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <head>
        <meta charset="UTF-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Hasil Produksi</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
      </head>
      <body>
        <table border="1">
          <thead><tr>${header}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </body>
    </html>
  `

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `${filename}_${dayjs().format('YYYYMMDD_HHmm')}.xls`
  a.click()
  URL.revokeObjectURL(url)
}

async function exportData({ params, columns, setExporting }) {
  setExporting(true)
  message.loading({ content: 'Mengambil semua data GP...', key: 'export', duration: 0 })
  try {
    const res  = await api.get(`/api/gp/export`, { params })
    const rows = res.data.data || []
    if (!rows.length) {
      message.warning({ content: 'Tidak ada data untuk diekspor', key: 'export' })
      return
    }
    downloadXLS(rows, columns, 'HasilProduksi')
    try {
      await api.post('/api/audit/event', {
        action: 'export',
        module: 'gp',
        description: 'Export Hasil Produksi GP',
        metadata: { filename: 'HasilProduksi', rows: rows.length },
      })
    } catch (e) {}
    message.success({ content: `${rows.length} baris berhasil diekspor`, key: 'export' })
  } catch (e) {
    message.error({ content: 'Gagal export: ' + (e.message || 'error'), key: 'export' })
  } finally {
    setExporting(false)
  }
}

// ─── Status helper ────────────────────────────────────────────────────────────
const STATUS_MAP = {
  'Selesai':    { badge: 'success',    icon: <CheckCircleOutlined />,  color: '#52c41a' },
  'Sebagian':   { badge: 'processing', icon: <ClockCircleOutlined />,  color: '#1890ff' },
  'Belum Jadi': { badge: 'default',    icon: <MinusCircleOutlined />,  color: '#d9d9d9' },
}

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'Selesai', label: 'Selesai' },
  { value: 'Sebagian', label: 'Sebagian' },
  { value: 'Belum Jadi', label: 'Belum Jadi' },
]

// ─── Kolom tabel ──────────────────────────────────────────────────────────────
const buildColumns = () => [
  {
    title: 'No. Hasil Produksi', dataIndex: 'no_hasil', key: 'no_hasil',
    width: 175, fixed: 'left',
    render: v => <Text strong style={{ color: '#1a73e8' }}>{v || '-'}</Text>
  },
  {
    title: 'Tgl Hasil Produksi', dataIndex: 'tgl_hasil', key: 'tgl_hasil', width: 150,
    render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-'
  },
  {
    title: 'No. SPK', dataIndex: 'no_spk', key: 'no_spk', width: 155,
    render: v => v
      ? <Text code style={{ color: '#722ed1' }}>{v}</Text>
      : <Text type="secondary">-</Text>
  },
  {
    title: 'No. SPM', dataIndex: 'no_spm', key: 'no_spm', width: 155,
    render: v => v
      ? <Text code style={{ color: '#d46b08' }}>{v}</Text>
      : <Text type="secondary">-</Text>
  },
  {
    title: 'Deskripsi Transaksi', dataIndex: 'deskripsi', key: 'deskripsi',
    width: 220, ellipsis: { showTitle: false },
    render: v => {
      const clean = (v || '').replace(/[\r\n]+/g, ' ').trim()
      return <Tooltip title={clean}><span style={{ color: '#666' }}>{clean || '-'}</span></Tooltip>
    }
  },
  {
    title: 'No. Barang', dataIndex: 'no_barang', key: 'no_barang', width: 175,
    render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text>
  },
  {
    title: 'Deskripsi Barang', dataIndex: 'deskripsi_barang', key: 'deskripsi_barang',
    width: 260, ellipsis: { showTitle: false },
    render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip>
  },
  {
    title: 'Qty Jadi', dataIndex: 'qty_jadi', key: 'qty_jadi',
    width: 105, align: 'right',
    render: (v, r) => (
      <Text strong style={{ color: '#52c41a' }}>
        {fmtQty(v)} <span style={{ color: '#888', fontWeight: 400 }}>{r.uom}</span>
      </Text>
    )
  },
  {
    title: 'Qty Plan', dataIndex: 'qty_plan', key: 'qty_plan',
    width: 105, align: 'right',
    render: (v, r) => v
      ? <Text>{fmtQty(v)} <span style={{ color: '#888' }}>{r.uom}</span></Text>
      : <Text type="secondary">-</Text>
  },
  {
    title: 'UoM', dataIndex: 'uom', key: 'uom',
    width: 70, align: 'center',
    render: v => v ? <Tag>{v}</Tag> : '-'
  },
  {
    title: 'Persentase Selesai', dataIndex: 'persentase', key: 'persentase',
    width: 185, fixed: 'right',
    render: (pct, r) => {
      const s     = STATUS_MAP[r.status] || STATUS_MAP['Belum Jadi']
      const color = pct >= 100 ? '#52c41a' : pct > 0 ? '#1890ff' : '#d9d9d9'
      return (
        <div style={{ minWidth: 155 }}>
          <Progress
            percent={pct}
            size="small"
            strokeColor={color}
            format={p => `${p}%`}
            status={pct >= 100 ? 'success' : pct > 0 ? 'active' : 'normal'}
          />
          <Badge
            status={s.badge}
            text={<Text style={{ fontSize: 11, color: s.color }}>{r.status}</Text>}
          />
        </div>
      )
    }
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function GP() {
  const { user } = useAuth()
  const [data, setData]             = useState([])
  const [loading, setLoading]       = useState(false)
  const [exporting, setExporting]   = useState(false)
  const [search, setSearch]         = useState('')
  const [dateRange, setDateRange]   = useState(getCurrentMonthRange)
  const [status, setStatus]         = useState('')
  const [selected, setSelected]     = useState(null)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [stats, setStats]           = useState({ total_gp: 0, selesai: 0, sebagian: 0, belum: 0 })

  // Refs untuk auto-refresh tanpa closure stale
  const searchRef    = useRef('')
  const pageRef      = useRef(1)
  const pageSizeRef  = useRef(20)
  const dateRangeRef = useRef(getCurrentMonthRange())
  const statusRef    = useRef('')

  const fetchData = useCallback(async (
    page = 1, pageSize = 20, sv = '', dates = [null, null], statusVal = '', showLoading = true
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (sv)        params.search    = sv
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to   = dates[1].format('YYYY-MM-DD')
      if (statusVal) params.status     = statusVal

      const res  = await api.get(`/api/gp`, { params })
      const rows = res.data.data || []

      setData(rows)
      setPagination(prev => ({
        ...prev, current: page, pageSize,
        total: page * pageSize + (rows.length === pageSize ? pageSize : 0),
      }))
      setStats({
        total_gp: res.data.total_gp || 0,
        selesai:  res.data.stats?.selesai || 0,
        sebagian: res.data.stats?.sebagian || 0,
        belum:    res.data.stats?.belum || 0,
      })
    } catch (e) {
      console.error('Error fetch GP:', e)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(1, 20, '', dateRangeRef.current, '')
    const interval = setInterval(() => {
      fetchData(pageRef.current, pageSizeRef.current, searchRef.current, dateRangeRef.current, statusRef.current, false)
    }, 15000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleSearch = val => {
    searchRef.current = val; setSearch(val); pageRef.current = 1
    fetchData(1, pageSizeRef.current, val, dateRangeRef.current, statusRef.current)
  }
  const handleDate = dates => {
    dateRangeRef.current = dates || [null, null]
    setDateRange(dates || [null, null]); pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, dates || [null, null], statusRef.current)
  }
  const handleStatus = val => {
    statusRef.current = val
    setStatus(val)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, dateRangeRef.current, val)
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
    if (status)       params.status    = status
    exportData({
      params,
      columns: filterExportColumnsByPermission('gp', GP_EXPORT_COLS, user),
      setExporting,
    })
  }

  const detailRows = selected ? data.filter(row => row.no_hasil === selected.no_hasil) : []
  const detailFields = [
    { key: 'no_hasil', label: 'No. Hasil Produksi', render: v => <Text strong>{v}</Text> },
    { key: 'tgl_hasil', label: 'Tanggal Hasil', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'no_spk', label: 'No SPK' },
    { key: 'no_spm', label: 'No SPM' },
    { key: 'deskripsi', label: 'Deskripsi Transaksi' },
    { key: 'status', label: 'Status', render: v => <Tag color={STATUS_MAP[v]?.badge || 'default'}>{v || '-'}</Tag> },
  ]
  const detailColumns = [
    { title: 'No Barang', dataIndex: 'no_barang', width: 140, render: v => <Text code>{v || '-'}</Text> },
    { title: 'Deskripsi', dataIndex: 'deskripsi_barang', width: 230, ellipsis: true },
    { title: 'Qty Jadi', dataIndex: 'qty_jadi', width: 95, align: 'right', render: v => fmtQty(v) },
    { title: 'Qty Plan', dataIndex: 'qty_plan', width: 95, align: 'right', render: v => fmtQty(v) },
    { title: 'UoM', dataIndex: 'uom', width: 70, render: v => v || '-' },
    { title: 'Persentase', dataIndex: 'persentase', width: 100, align: 'right', render: v => `${Number(v || 0)}%` },
    { title: 'Status', dataIndex: 'status', width: 110, render: v => v || '-' },
  ]
  const visibleColumns = filterColumnsByPermission('gp', buildColumns(), user)
  const visibleDetailFields = detailFields.filter(field => !field.key || filterExportColumnsByPermission('gp', [{ key: field.key }], user).length)
  const visibleDetailColumns = filterColumnsByPermission('gp', detailColumns, user)

  return (
    <div>
      {/* Stats Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title="Total Dokumen GP"
              value={stats.total_gp}
              prefix={<ExperimentOutlined />}
              valueStyle={{ color: '#1a73e8' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title="Selesai (100%)"
              value={stats.selesai}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title="Sebagian"
              value={stats.sebagian}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic
              title="Belum Jadi"
              value={stats.belum}
              prefix={<MinusCircleOutlined />}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabel */}
      <Card
        title={
          <span>
            <ExperimentOutlined style={{ marginRight: 8, color: '#52c41a' }} />
            Goods Production (Hasil Produksi)
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
            <Select
              value={status}
              options={STATUS_FILTER_OPTIONS}
              onChange={handleStatus}
              style={{ width: 150 }}
            />
            <Search
              placeholder="Cari no. GP / SPK / SPM / barang..."
              allowClear
              value={search}
              style={{ width: 265 }}
              prefix={<SearchOutlined />}
              onSearch={handleSearch}
              onChange={e => {
                setSearch(e.target.value)
                if (!e.target.value) handleSearch('')
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
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
          rowKey={(r, i) => `${r.no_hasil}-${r.no_barang}-${i}`}
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1900 }}
          onRow={rec => ({
            onClick: () => setSelected(rec),
            style: { cursor: 'pointer' },
          })}
          rowClassName={r =>
            r.persentase >= 100 ? 'row-selesai'
            : r.persentase > 0  ? 'row-sebagian'
            : ''
          }
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ~${total} baris`,
            onChange: (page, ps) => {
              pageRef.current = page; pageSizeRef.current = ps
              fetchData(page, ps, searchRef.current, dateRangeRef.current, statusRef.current)
            },
          }}
        />
      </Card>
      <DocumentDetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Detail GP ${selected?.no_hasil || ''}`}
        subtitle={selected?.deskripsi_barang}
        record={selected}
        fields={visibleDetailFields}
        lineTitle="Detail Barang Hasil Produksi"
        lineRows={detailRows}
        lineColumns={visibleDetailColumns}
      />

      <style>{`
        .row-selesai td  { background: #f6ffed !important; }
        .row-sebagian td { background: #e6f7ff !important; }
      `}</style>
    </div>
  )
}
