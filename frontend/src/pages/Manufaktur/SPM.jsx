import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Table, Input, Card, DatePicker, Space, Tag, Tooltip,
  Statistic, Row, Col, Typography, Button, Progress, Badge, Select
} from 'antd'
import {
  FileExcelOutlined, SearchOutlined, ReloadOutlined, ExperimentOutlined,
  CheckCircleOutlined, ClockCircleOutlined, MinusCircleOutlined
} from '@ant-design/icons'
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
const DEFAULT_PAGE_SIZE = 20
const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'selesai', label: 'Selesai' },
  { value: 'sebagian', label: 'Sebagian' },
  { value: 'belum', label: 'Belum Keluar' },
]
const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]
const SPM_EXPORT_COLS = [
  { key: 'no_pengeluaran', label: 'No. Pengeluaran' },
  { key: 'tgl_pengeluaran', label: 'Tgl Pengeluaran', type: 'date' },
  { key: 'no_pk', label: 'No. Perintah Kerja' },
  { key: 'tgl_pk', label: 'Tgl Perintah Kerja', type: 'date' },
  { key: 'deskripsi', label: 'Deskripsi Transaksi' },
  { key: 'no_barang', label: 'No. Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'qty_keluar', label: 'Qty Keluar', type: 'number' },
  { key: 'qty_plan', label: 'Qty Plan', type: 'number' },
  { key: 'satuan', label: 'Satuan' },
  { key: 'persentase', label: 'Persentase (%)', type: 'number' },
  { key: 'status', label: 'Status' },
]

export default function SPM() {
  const { user } = useAuth()
  const [data, setData]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [status, setStatus]       = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })
  const [stats, setStats]         = useState({ total: 0, selesai: 0, sebagian: 0, belum: 0 })
  const [exporting, setExporting] = useState(false)

  const searchRef    = useRef('')
  const pageRef      = useRef(1)
  const pageSizeRef  = useRef(DEFAULT_PAGE_SIZE)
  const dateRangeRef = useRef(getCurrentMonthRange())
  const statusRef    = useRef('')

  const fetchData = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE, searchVal = '', dates = [null, null], statusVal = '', showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal)  params.search    = searchVal
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to   = dates[1].format('YYYY-MM-DD')
      if (statusVal)  params.status    = statusVal

      const res  = await api.get('/api/spm', { params })
      const rows = res.data.data || []
      setData(rows)
      setPagination(prev => ({
        ...prev, current: page, pageSize,
        total: page * pageSize + (rows.length === pageSize ? pageSize : 0)
      }))
      setStats({
        total:    rows.length,
        selesai:  rows.filter(r => r.status === 'Selesai').length,
        sebagian: rows.filter(r => r.status === 'Sebagian').length,
        belum:    rows.filter(r => r.status === 'Belum Keluar').length,
      })
    } catch (e) { console.error(e) }
    finally { if (showLoading) setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData(1, DEFAULT_PAGE_SIZE, '', dateRangeRef.current, statusRef.current)
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
  const handleStatus = value => {
    statusRef.current = value
    setStatus(value)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, dateRangeRef.current, value)
  }
  const handleReset = () => {
    const currentMonth = getCurrentMonthRange()
    searchRef.current = ''; dateRangeRef.current = currentMonth; statusRef.current = ''
    setSearch(''); setDateRange(currentMonth); setStatus('')
    pageSizeRef.current = DEFAULT_PAGE_SIZE
    fetchData(1, DEFAULT_PAGE_SIZE, '', currentMonth, '')
  }
  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      if (statusRef.current) params.status = statusRef.current
      const res = await api.get('/api/spm/export', { params })
      return res.data.data || []
    },
    columns: filterExportColumnsByPermission('spm', SPM_EXPORT_COLS, user),
    filename: 'DaftarSPM',
    sheetName: 'Daftar SPM',
    setExporting,
  })

  const getStatusBadge = (status) => {
    const map = {
      'Selesai':      { status: 'success',   icon: <CheckCircleOutlined />,  color: '#52c41a' },
      'Sebagian':     { status: 'processing', icon: <ClockCircleOutlined />,  color: '#1890ff' },
      'Belum Keluar': { status: 'default',    icon: <MinusCircleOutlined />,  color: '#d9d9d9' },
    }
    return map[status] || map['Belum Keluar']
  }

  const columns = [
    {
      title: 'No. Pengeluaran', dataIndex: 'no_pengeluaran', key: 'no_pengeluaran',
      width: 160, fixed: 'left',
      render: v => <Text strong style={{ color: '#1a73e8' }}>{v}</Text>
    },
    {
      title: 'Tgl Pengeluaran', dataIndex: 'tgl_pengeluaran', key: 'tgl_pengeluaran', width: 140,
      render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-'
    },
    {
      title: 'No. Perintah Kerja', dataIndex: 'no_pk', key: 'no_pk', width: 160,
      render: v => v ? <Text code style={{ color: '#722ed1' }}>{v}</Text> : <Text type="secondary">-</Text>
    },
    {
      title: 'Tgl Perintah Kerja', dataIndex: 'tgl_pk', key: 'tgl_pk', width: 140,
      render: v => v ? <Tag color="geekblue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-'
    },
    {
      title: 'Deskripsi Transaksi', dataIndex: 'deskripsi', key: 'deskripsi',
      width: 220, ellipsis: { showTitle: false },
      render: v => {
        // Bersihkan \r\n dari deskripsi
        const clean = (v || '').replace(/[\r\n]+/g, ' ').trim()
        return <Tooltip title={clean}><span style={{ color: '#666' }}>{clean || '-'}</span></Tooltip>
      }
    },
    {
      title: 'No. Barang', dataIndex: 'no_barang', key: 'no_barang', width: 180,
      render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text>
    },
    {
      title: 'Deskripsi Barang', dataIndex: 'deskripsi_barang', key: 'deskripsi_barang',
      width: 240, ellipsis: { showTitle: false },
      render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip>
    },
    {
      title: 'Qty Keluar', dataIndex: 'qty_keluar', key: 'qty_keluar', width: 100, align: 'right',
      render: (v, r) => `${parseFloat(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${r.satuan}`
    },
    {
      title: 'Qty Plan', dataIndex: 'qty_plan', key: 'qty_plan', width: 100, align: 'right',
      render: (v, r) => v ? `${parseFloat(v).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${r.satuan}` : <Text type="secondary">-</Text>
    },
    {
      title: 'Persentase', dataIndex: 'persentase', key: 'persentase',
      width: 160, fixed: 'right',
      render: (pct, r) => {
        const s = getStatusBadge(r.status)
        const color = pct >= 100 ? '#52c41a' : pct > 0 ? '#1890ff' : '#d9d9d9'
        return (
          <div style={{ minWidth: 130 }}>
            <Progress
              percent={pct}
              size="small"
              strokeColor={color}
              format={p => `${p}%`}
              status={pct >= 100 ? 'success' : pct > 0 ? 'active' : 'normal'}
            />
            <Badge status={s.status} text={
              <Text style={{ fontSize: 11, color: s.color }}>{r.status}</Text>
            } />
          </div>
        )
      }
    },
  ]
  const visibleColumns = filterColumnsByPermission('spm', columns, user)

  return (
    <div>
      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Total Baris" value={stats.total}
              prefix={<ExperimentOutlined />} valueStyle={{ color: '#1a73e8' }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Selesai (100%)" value={stats.selesai}
              prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Sebagian" value={stats.sebagian}
              prefix={<ClockCircleOutlined />} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Belum Keluar" value={stats.belum}
              prefix={<MinusCircleOutlined />} valueStyle={{ color: '#8c8c8c' }} />
          </Card>
        </Col>
      </Row>

      <Card
        title={<span><ExperimentOutlined style={{ marginRight: 8, color: '#722ed1' }} />Daftar SPM (Surat Pengeluaran Material)</span>}
        extra={
          <Space wrap>
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={handleDate}
              placeholder={['Tgl Dari', 'Tgl Sampai']} style={{ width: 220 }} />
            <Select
              value={status}
              options={STATUS_OPTIONS}
              onChange={handleStatus}
              style={{ width: 150 }}
            />
            <Search placeholder="Cari no. SPM / SPK / barang..." allowClear value={search}
              style={{ width: 260 }} prefix={<SearchOutlined />}
              onSearch={handleSearch}
              onChange={e => { setSearch(e.target.value); if (!e.target.value) handleSearch('') }} />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            <Button
              type="primary"
              icon={<FileExcelOutlined />}
              onClick={handleExport}
              loading={exporting}
              disabled={exporting}
              style={{ background: '#217346', borderColor: '#217346' }}
            >
              Export XLS
            </Button>
          </Space>
        }
      >
        <Table
          rowKey={(r, i) => `${r.no_pengeluaran}-${r.no_barang}-${i}`}
          columns={withTableSorters(visibleColumns)} dataSource={data} loading={loading} size="small"
          scroll={{ x: 1600 }}
          rowClassName={r => r.persentase >= 100 ? 'row-selesai' : r.persentase > 0 ? 'row-sebagian' : ''}
          pagination={{
            ...pagination, showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t, range) => `${range[0]}-${range[1]} dari ~${t} baris`,
            onChange: (page, pageSize) => {
              pageRef.current = page; pageSizeRef.current = pageSize
              fetchData(page, pageSize, searchRef.current, dateRangeRef.current, statusRef.current)
            }
          }}
        />
      </Card>

      <style>{`
        .row-selesai td { background: #f6ffed !important; }
        .row-sebagian td { background: #e6f7ff !important; }
      `}</style>
    </div>
  )
}
