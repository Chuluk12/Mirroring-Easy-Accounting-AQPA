import { useEffect, useState, useCallback, useRef } from 'react'
import { Table, Input, Card, Badge, DatePicker, Select, Row, Col, Statistic, Space, Button, Tooltip, Tag, Typography } from 'antd'
import { FileExcelOutlined, SearchOutlined, ReloadOutlined, FileTextOutlined, ClockCircleOutlined, CheckCircleOutlined, ShoppingCartOutlined } from '@ant-design/icons'
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
  { key: 'no_permintaan', label: 'No. Permintaan' },
  { key: 'tgl_permintaan', label: 'Tgl Permintaan', type: 'date' },
  { key: 'tgl_target', label: 'Tgl Target', type: 'date' },
  { key: 'deskripsi', label: 'Deskripsi Transaksi' },
  { key: 'no_barang', label: 'No. Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'qty', label: 'Qty', type: 'number' },
  { key: 'unit', label: 'Unit' },
  { key: 'no_po', label: 'No. PO' },
  { key: 'status', label: 'Status' },
]

export default function DaftarPermintaan() {
  const { user } = useAuth()
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [stats, setStats]       = useState({ total: 0, menunggu: 0, dipesan: 0, diterima: 0 })
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch]     = useState('')
  const [exporting, setExporting] = useState(false)

  const searchRef    = useRef('')
  const pageRef      = useRef(1)
  const pageSizeRef  = useRef(20)
  const dateRangeRef = useRef(getCurrentMonthRange())
  const statusRef    = useRef('')

  const fetchData = useCallback(async (page, pageSize, searchVal, dates, statusVal, showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal)  params.search  = searchVal
      if (statusVal)  params.status  = statusVal
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
      const summaryRes = await api.get('/api/permintaan/summary', { params: summaryParams })
      const summary = summaryRes.data || {}
      setStats({
        total:    summary.total || 0,
        menunggu: summary.menunggu || 0,
        dipesan:  summary.dipesan || 0,
        diterima: summary.diterima || 0,
      })
    } catch (e) { console.error(e) }
    finally { if (showLoading) setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData(1, 20, '', dateRangeRef.current, '')
  }, [fetchData])

  useVisiblePolling(() => {
    fetchData(pageRef.current, pageSizeRef.current, searchRef.current, dateRangeRef.current, statusRef.current, false)
  }, 30000)

  const handleSearch = val => {
    searchRef.current = val; setSearch(val); pageRef.current = 1
    fetchData(1, pageSizeRef.current, val, dateRangeRef.current, statusRef.current)
  }
  const handleDate = dates => {
    dateRangeRef.current = dates; setDateRange(dates || [null, null]); pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, dates, statusRef.current)
  }
  const handleStatus = val => {
    statusRef.current = val || ''; setStatusFilter(val || ''); pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, dateRangeRef.current, val || '')
  }
  const handleReset = () => {
    const currentMonth = getCurrentMonthRange()
    searchRef.current = ''; dateRangeRef.current = currentMonth; statusRef.current = ''
    setSearch(''); setDateRange(currentMonth); setStatusFilter('')
    fetchData(1, 20, '', currentMonth, '')
  }
  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (statusRef.current) params.status = statusRef.current
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

  const statusMap = { 'Menunggu': 'warning', 'Sudah Dipesan': 'processing', 'Sudah Diterima': 'success', 'Selesai': 'default' }

  const serialColumn = {
    title: 'No',
    key: 'no',
    width: 70,
    fixed: 'left',
    align: 'center',
    render: (_, __, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1,
  }

  const columns = [
    { title: 'No. Permintaan', dataIndex: 'no_permintaan', key: 'no_permintaan', width: 160, render: v => <Text strong style={{ color: '#1a73e8' }}>{v}</Text> },
    { title: 'Tgl Permintaan', dataIndex: 'tgl_permintaan', key: 'tgl_permintaan', width: 130, render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Tgl Target',     dataIndex: 'tgl_target',     key: 'tgl_target',     width: 120, render: v => v ? <Tag color="geekblue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Deskripsi Transaksi', dataIndex: 'deskripsi', key: 'deskripsi', ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span style={{ color: '#666' }}>{v || '-'}</span></Tooltip> },
    { title: 'No. Barang',     dataIndex: 'no_barang',        key: 'no_barang',        width: 180, render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: 'Deskripsi Barang', dataIndex: 'deskripsi_barang', key: 'deskripsi_barang', ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 100, align: 'right', render: (v, r) => `${parseFloat(v || 0).toLocaleString('id-ID')} ${r.unit}` },
    { title: 'No. PO', dataIndex: 'no_po', key: 'no_po', width: 160, render: v => v ? <Text code>{v}</Text> : <Text type="secondary">-</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 150, fixed: 'right', render: (v) => <Badge status={statusMap[v] || 'default'} text={v} /> },
  ]
  const visibleColumns = [serialColumn, ...filterColumnsByPermission('permintaan', columns, user)]

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}><Card size="small"><Statistic title="Total Permintaan" value={stats.total} prefix={<FileTextOutlined />} valueStyle={{ color: '#1a73e8' }} /></Card></Col>
        <Col xs={24} sm={6}><Card size="small"><Statistic title="Menunggu" value={stats.menunggu} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col xs={24} sm={6}><Card size="small"><Statistic title="Sudah Dipesan" value={stats.dipesan} prefix={<ShoppingCartOutlined />} valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col xs={24} sm={6}><Card size="small"><Statistic title="Sudah Diterima" value={stats.diterima} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Card
        title={<span><FileTextOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Daftar Permintaan</span>}
        extra={
          <Space wrap>
            <Select placeholder="Filter Status" allowClear style={{ width: 160 }} value={statusFilter || undefined}
              onChange={handleStatus}
              options={[
                { label: 'Menunggu', value: 'menunggu' },
                { label: 'Sudah Dipesan', value: 'dipesan' },
                { label: 'Sudah Diterima', value: 'diterima' },
              ]}
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
          rowKey={(r, i) => `${r.no_permintaan}-${i}`}
          columns={withTableSorters(visibleColumns)} dataSource={data} loading={loading} size="small"
          sticky={{ offsetHeader: 0 }}
          scroll={{ x: 1400, y: 'calc(100vh - 360px)' }}
          pagination={{
            ...pagination, showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t, range) => `${range[0]}-${range[1]} dari ~${t}`,
            onChange: (page, pageSize) => {
              pageRef.current = page; pageSizeRef.current = pageSize
              fetchData(page, pageSize, searchRef.current, dateRangeRef.current, statusRef.current)
            }
          }}
        />
      </Card>
    </div>
  )
}
