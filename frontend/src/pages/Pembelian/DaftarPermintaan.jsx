import { useEffect, useState, useCallback, useRef } from 'react'
import { Table, Input, Card, Badge, DatePicker, Select, Row, Col, Statistic, Space, Button, Tooltip, Tag, Typography, message } from 'antd'
import { FileExcelOutlined, SearchOutlined, ReloadOutlined, FileTextOutlined, ClockCircleOutlined, CheckCircleOutlined, ShoppingCartOutlined, WarningOutlined, CalendarOutlined } from '@ant-design/icons'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import useVisiblePolling from '../../hooks/useVisiblePolling'
import dayjs from 'dayjs'

const { Search } = Input
const { RangePicker } = DatePicker
const { Text } = Typography
const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]
const PERMINTAAN_EXPORT_COLS = [
  { key: 'no', label: 'No', type: 'number' },
  { key: 'no_permintaan', label: 'PR No.' },
  { key: 'no_so', label: 'SO No.' },
  { key: 'tgl_permintaan', label: 'PR Date', type: 'date' },
  { key: 'tgl_target', label: 'DT PR', type: 'date' },
  { key: 'no_po', label: 'PO No.' },
  { key: 'tgl_pesanan_po', label: 'PO Date', type: 'date' },
  { key: 'estimasi_po', label: 'DT PO', type: 'date' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'no_barang', label: 'No. Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi' },
  { key: 'qty', label: 'Qty PR', type: 'number' },
  { key: 'qty_po', label: 'Qty PO', type: 'number' },
  { key: 'qty_received', label: 'Qty PB', type: 'number' },
  { key: 'status', label: 'Status' },
  { key: 'deskripsi', label: 'Keterangan' },
  { key: 'aging', label: 'Aging', type: 'number' },
  { key: 'status_dt_po', label: 'Status DT' },
  { key: 'remark', label: 'Remark' },
]

function EditableRemark({ record, onSaved }) {
  const [value, setValue] = useState(record.remark || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => setValue(record.remark || ''), [record.remark])

  const save = async () => {
    const normalized = value.trim()
    if (normalized === (record.remark || '').trim()) return
    setSaving(true)
    try {
      const res = await api.post('/api/permintaan/remark', {
        row_key: record.row_key,
        remark: normalized,
      })
      onSaved(record.row_key, res.data.data || { remark: normalized })
      message.success('Remark disimpan.')
    } catch (error) {
      setValue(record.remark || '')
      message.error(error.response?.data?.message || 'Gagal menyimpan remark.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Input.TextArea
      value={value}
      autoSize={{ minRows: 1, maxRows: 3 }}
      maxLength={500}
      placeholder="Input remark"
      status={saving ? 'warning' : undefined}
      onChange={event => setValue(event.target.value)}
      onBlur={save}
    />
  )
}

export default function DaftarPermintaan() {
  const { user } = useAuth()
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [stats, setStats]       = useState({ total: 0, menunggu: 0, dipesan: 0, diterima: 0, dt_besok: 0, late: 0, on_proses: 0 })
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [statusFilter, setStatusFilter] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [vendorOptions, setVendorOptions] = useState([])
  const [search, setSearch]     = useState('')
  const [exporting, setExporting] = useState(false)

  const searchRef    = useRef('')
  const pageRef      = useRef(1)
  const pageSizeRef  = useRef(20)
  const dateRangeRef = useRef(getCurrentMonthRange())
  const statusRef    = useRef('')
  const vendorRef    = useRef('')

  const fetchData = useCallback(async (page, pageSize, searchVal, dates, statusVal, vendorVal, showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal)  params.search  = searchVal
      if (statusVal)  params.status  = statusVal
      if (vendorVal)  params.vendor  = vendorVal
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to   = dates[1].format('YYYY-MM-DD')

      const res = await api.get('/api/permintaan', { params })
      const rows = res.data.data || []
      setData(rows)
      setPagination(prev => ({ ...prev, current: page, pageSize, total: page * pageSize + (rows.length === pageSize ? pageSize : 0) }))

      // Stats — ambil semua tanpa filter status
      const summaryParams = {}
      if (searchVal)  summaryParams.search    = searchVal
      if (dates?.[0]) summaryParams.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) summaryParams.date_to   = dates[1].format('YYYY-MM-DD')
      if (vendorVal) summaryParams.vendor = vendorVal
      const summaryRes = await api.get('/api/permintaan/summary', { params: summaryParams })
      const summary = summaryRes.data || {}
      setStats({
        total:    summary.total || 0,
        menunggu: summary.menunggu || 0,
        dipesan:  summary.dipesan || 0,
        diterima: summary.diterima || 0,
        dt_besok: summary.dt_besok || 0,
        late: summary.late || 0,
        on_proses: summary.on_proses || 0,
      })
    } catch (e) { console.error(e) }
    finally { if (showLoading) setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData(1, 20, '', dateRangeRef.current, '', '')
  }, [fetchData])

  useVisiblePolling(() => {
    fetchData(pageRef.current, pageSizeRef.current, searchRef.current, dateRangeRef.current, statusRef.current, vendorRef.current, false)
  }, 30000)

  const fetchVendorOptions = useCallback(async dates => {
    try {
      const params = {}
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')
      const res = await api.get('/api/permintaan/vendor-options', { params })
      setVendorOptions((res.data.data || []).map(value => ({ value, label: value })))
    } catch (error) {
      console.error(error)
    }
  }, [])

  useEffect(() => {
    fetchVendorOptions(dateRangeRef.current)
  }, [fetchVendorOptions])

  const handleSearch = val => {
    searchRef.current = val; setSearch(val); pageRef.current = 1
    fetchData(1, pageSizeRef.current, val, dateRangeRef.current, statusRef.current, vendorRef.current)
  }
  const handleDate = dates => {
    dateRangeRef.current = dates; setDateRange(dates || [null, null]); pageRef.current = 1
    fetchVendorOptions(dates)
    fetchData(1, pageSizeRef.current, searchRef.current, dates, statusRef.current, vendorRef.current)
  }
  const handleStatus = val => {
    statusRef.current = val || ''; setStatusFilter(val || ''); pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, dateRangeRef.current, val || '', vendorRef.current)
  }
  const handleVendor = val => {
    vendorRef.current = val || ''; setVendorFilter(val || ''); pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, dateRangeRef.current, statusRef.current, val || '')
  }
  const handleReset = () => {
    const currentMonth = getCurrentMonthRange()
    searchRef.current = ''; dateRangeRef.current = currentMonth; statusRef.current = ''; vendorRef.current = ''
    setSearch(''); setDateRange(currentMonth); setStatusFilter(''); setVendorFilter('')
    fetchVendorOptions(currentMonth)
    fetchData(1, 20, '', currentMonth, '', '')
  }
  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (statusRef.current) params.status = statusRef.current
      if (vendorRef.current) params.vendor = vendorRef.current
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      const res = await api.get('/api/permintaan/export', { params })
      return (res.data.data || []).map((row, index) => ({ no: index + 1, ...row }))
    },
    columns: [
      PERMINTAAN_EXPORT_COLS[0],
      ...filterExportColumnsByPermission('permintaan', PERMINTAAN_EXPORT_COLS.slice(1), user),
    ],
    filename: 'DaftarPermintaan',
    sheetName: 'Daftar Permintaan',
    message: undefined,
    setExporting,
  })

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

  const statusMap = { Menunggu: 'warning', Diproses: 'processing', Diterima: 'success' }
  const dtStatusColor = {
    LATE: 'red',
    'DT Hari Ini': 'orange',
    'DT Besok': 'gold',
    'On Proses': 'blue',
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
    { title: 'PR No.', dataIndex: 'no_permintaan', key: 'no_permintaan', width: 150, fixed: 'left', render: v => <Text strong style={{ color: '#1a73e8' }}>{v}</Text> },
    { title: 'SO No.', dataIndex: 'no_so', key: 'no_so', width: 145, render: v => v ? <Tag color="purple">{v}</Tag> : '-' },
    { title: 'PR Date', dataIndex: 'tgl_permintaan', key: 'tgl_permintaan', width: 110, render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { title: 'DT PR', dataIndex: 'tgl_target', key: 'tgl_target', width: 110, render: v => v ? <Tag color="geekblue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'PO No.', dataIndex: 'no_po', key: 'no_po', width: 145, render: v => v ? <Text code>{v}</Text> : '-' },
    { title: 'PO Date', dataIndex: 'tgl_pesanan_po', key: 'tgl_pesanan_po', width: 110, render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { title: 'DT PO', dataIndex: 'estimasi_po', key: 'estimasi_po', width: 110, render: v => v ? <Tag color="gold">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Vendor', dataIndex: 'vendor', key: 'vendor', width: 220, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'No. Barang', dataIndex: 'no_barang', key: 'no_barang', width: 175, render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: 'Deskripsi', dataIndex: 'deskripsi_barang', key: 'deskripsi_barang', width: 280, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Qty PR', dataIndex: 'qty', key: 'qty', width: 95, align: 'right', render: v => parseFloat(v || 0).toLocaleString('id-ID') },
    { title: 'Qty PO', dataIndex: 'qty_po', key: 'qty_po', width: 95, align: 'right', render: v => parseFloat(v || 0).toLocaleString('id-ID') },
    { title: 'Qty PB', dataIndex: 'qty_received', key: 'qty_received', width: 95, align: 'right', render: v => parseFloat(v || 0).toLocaleString('id-ID') },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 115, render: v => <Badge status={statusMap[v] || 'default'} text={v} /> },
    { title: 'Keterangan', dataIndex: 'deskripsi', key: 'deskripsi', width: 250, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Aging', dataIndex: 'aging', key: 'aging', width: 80, align: 'center', render: v => v === null || v === undefined ? '-' : <Text type={v < 0 ? 'danger' : undefined} strong>{v}</Text> },
    { title: 'Status DT', dataIndex: 'status_dt_po', key: 'status_dt_po', width: 120, render: v => v ? <Tag color={dtStatusColor[v] || 'default'}>{v}</Tag> : '-' },
    { title: 'Remark', dataIndex: 'remark', key: 'remark', width: 240, fixed: 'right', render: (_, record) => <EditableRemark record={record} onSaved={handleRemarkSaved} /> },
  ]
  const visibleColumns = [serialColumn, ...filterColumnsByPermission('permintaan', columns, user)]

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6} xl={3}><Card size="small"><Statistic title="Total Permintaan" value={stats.total} prefix={<FileTextOutlined />} valueStyle={{ color: '#1a73e8' }} /></Card></Col>
        <Col xs={12} md={6} xl={3}><Card size="small"><Statistic title="Menunggu" value={stats.menunggu} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col xs={12} md={6} xl={3}><Card size="small"><Statistic title="Diproses" value={stats.dipesan} prefix={<ShoppingCartOutlined />} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col xs={12} md={6} xl={3}><Card size="small"><Statistic title="Diterima" value={stats.diterima} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={12} md={6} xl={4}><Card size="small"><Statistic title="DT Besok" value={stats.dt_besok} prefix={<CalendarOutlined />} valueStyle={{ color: '#d48806' }} /></Card></Col>
        <Col xs={12} md={6} xl={4}><Card size="small"><Statistic title="Late" value={stats.late} prefix={<WarningOutlined />} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col xs={12} md={6} xl={4}><Card size="small"><Statistic title="On Proses" value={stats.on_proses} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#722ed1' }} /></Card></Col>
      </Row>

      <Card
        title={<span><FileTextOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Daftar Permintaan</span>}
        extra={
          <Space wrap>
            <Select placeholder="Filter Status" allowClear style={{ width: 160 }} value={statusFilter || undefined}
              onChange={handleStatus}
              options={[
                { label: 'Menunggu', value: 'menunggu' },
                { label: 'Diproses', value: 'diproses' },
                { label: 'Diterima', value: 'diterima' },
              ]}
            />
            <Select
              showSearch
              allowClear
              placeholder="Filter Vendor"
              optionFilterProp="label"
              style={{ width: 220 }}
              value={vendorFilter || undefined}
              options={vendorOptions}
              onChange={handleVendor}
            />
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={handleDate} placeholder={['Tgl Dari', 'Tgl Sampai']} style={{ width: 220 }} />
            <Search placeholder="Cari no. permintaan / barang..." allowClear value={search} style={{ width: 260 }}
              prefix={<SearchOutlined />} onSearch={handleSearch}
              onChange={e => { setSearch(e.target.value); if (!e.target.value) handleSearch('') }} />
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
        }
      >
        <Table
          className="purchase-freeze-table"
          rowKey={(r, i) => `${r.row_key}-${r.no_po || 'no-po'}-${i}`}
          columns={withTableSorters(visibleColumns)} dataSource={data} loading={loading} size="small"
          sticky={{ offsetHeader: 0 }}
          scroll={{ x: 2780, y: 'calc(100vh - 360px)' }}
          pagination={{
            ...pagination, showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t, range) => `${range[0]}-${range[1]} dari ~${t}`,
            onChange: (page, pageSize) => {
              pageRef.current = page; pageSizeRef.current = pageSize
              fetchData(page, pageSize, searchRef.current, dateRangeRef.current, statusRef.current, vendorRef.current)
            }
          }}
        />
      </Card>
    </div>
  )
}
