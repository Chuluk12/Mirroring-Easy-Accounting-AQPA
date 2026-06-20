import { useEffect, useState, useCallback, useRef } from 'react'
import { Table, Input, Card, DatePicker, Space, Tag, Tooltip, Statistic, Row, Col, Typography, Button, message } from 'antd'
import { FileExcelOutlined, SearchOutlined, ReloadOutlined, ImportOutlined, InboxOutlined } from '@ant-design/icons'
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

const formatRp = val => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0)
const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]
const PENERIMAAN_EXPORT_COLS = [
  { key: 'no', label: 'No', type: 'number' },
  { key: 'no_penerimaan', label: 'No. Penerimaan' },
  { key: 'no_formulir', label: 'No. Formulir' },
  { key: 'tgl_penerimaan', label: 'Tgl Penerimaan', type: 'date' },
  { key: 'no_pemasok', label: 'No. Pemasok' },
  { key: 'nama_pemasok', label: 'Nama Pemasok' },
  { key: 'deskripsi', label: 'Deskripsi Transaksi' },
  { key: 'no_barang', label: 'No. Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'qty', label: 'Qty', type: 'number' },
  { key: 'unit', label: 'Unit' },
  { key: 'harga', label: 'Harga', type: 'number' },
  { key: 'no_permintaan', label: 'No. Permintaan' },
  { key: 'no_pesanan', label: 'No. Pesanan' },
]

export default function DaftarPenerimaan() {
  const { user } = useAuth()
  const [data, setData]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [summary, setSummary]     = useState({ total_rows: 0, total_amount: 0 })
  const [exporting, setExporting] = useState(false)

  const searchRef    = useRef('')
  const pageRef      = useRef(1)
  const pageSizeRef  = useRef(20)
  const dateRangeRef = useRef(getCurrentMonthRange())

  const fetchData = useCallback(async (page = 1, pageSize = 20, searchVal = '', dates = [null, null], showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal) params.search    = searchVal
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to   = dates[1].format('YYYY-MM-DD')

      const res  = await api.get('/api/penerimaan', { params })
      const rows = res.data.data || []
      setData(rows)
      setPagination(prev => ({ ...prev, current: page, pageSize, total: page * pageSize + (rows.length === pageSize ? pageSize : 0) }))
      setSummary({ total_rows: rows.length, total_amount: rows.reduce((s, r) => s + (r.harga * r.qty || 0), 0) })
    } catch (e) { console.error(e) }
    finally { if (showLoading) setLoading(false) }
  }, [])

  useEffect(() => {
    fetchData(1, 20, '', dateRangeRef.current)
  }, [fetchData])

  useVisiblePolling(() => {
    fetchData(pageRef.current, pageSizeRef.current, searchRef.current, dateRangeRef.current, false)
  }, 30000)

  const handleSearch = val => {
    searchRef.current = val; setSearch(val); pageRef.current = 1
    fetchData(1, pageSizeRef.current, val, dateRangeRef.current)
  }
  const handleDate = dates => {
    dateRangeRef.current = dates; setDateRange(dates || [null, null]); pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, dates)
  }
  const handleReset = () => {
    const currentMonth = getCurrentMonthRange()
    searchRef.current = ''; dateRangeRef.current = currentMonth
    setSearch(''); setDateRange(currentMonth)
    fetchData(1, 20, '', currentMonth)
  }
  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      const res = await api.get('/api/penerimaan/export', { params })
      return (res.data.data || []).map((row, index) => ({ no: index + 1, ...row }))
    },
    columns: [
      PENERIMAAN_EXPORT_COLS[0],
      ...filterExportColumnsByPermission('penerimaan', PENERIMAAN_EXPORT_COLS.slice(1), user),
    ],
    filename: 'DaftarPenerimaan',
    sheetName: 'Daftar Penerimaan',
    message,
    setExporting,
  })

  const serialColumn = {
    title: 'No',
    key: 'no',
    width: 70,
    fixed: 'left',
    align: 'center',
    render: (_, __, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1,
  }

  const columns = [
    { title: 'No. Penerimaan',   dataIndex: 'no_penerimaan',   key: 'no_penerimaan',   width: 160, fixed: 'left', render: v => <Text strong style={{ color: '#1a73e8' }}>{v}</Text> },
    { title: 'No. Formulir',     dataIndex: 'no_formulir',     key: 'no_formulir',     width: 150, render: v => <Text code>{v || '-'}</Text> },
    { title: 'Tgl Penerimaan',   dataIndex: 'tgl_penerimaan',  key: 'tgl_penerimaan',  width: 130, render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'No. Pemasok',      dataIndex: 'no_pemasok',      key: 'no_pemasok',      width: 110, render: v => <Text code>{v || '-'}</Text> },
    { title: 'Nama Pemasok',     dataIndex: 'nama_pemasok',    key: 'nama_pemasok',    width: 200, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Deskripsi Transaksi', dataIndex: 'deskripsi',   key: 'deskripsi',       width: 200, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span style={{ color: '#666' }}>{v || '-'}</span></Tooltip> },
    { title: 'No. Barang',       dataIndex: 'no_barang',       key: 'no_barang',       width: 180, render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: 'Deskripsi Barang', dataIndex: 'deskripsi_barang',key: 'deskripsi_barang',width: 260, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Qty',              dataIndex: 'qty',             key: 'qty',             width: 80,  align: 'right', render: (v, r) => `${parseFloat(v || 0).toLocaleString('id-ID')} ${r.unit}` },
    { title: 'Harga',            dataIndex: 'harga',           key: 'harga',           width: 130, align: 'right', render: v => formatRp(v) },
    { title: 'No. Permintaan',   dataIndex: 'no_permintaan',   key: 'no_permintaan',   width: 160, render: v => v ? <Text code>{v}</Text> : <Text type="secondary">-</Text> },
    { title: 'No. Pesanan',      dataIndex: 'no_pesanan',      key: 'no_pesanan',      width: 160, fixed: 'right', render: v => v ? <Text code>{v}</Text> : <Text type="secondary">-</Text> },
  ]
  const visibleColumns = [serialColumn, ...filterColumnsByPermission('penerimaan', columns, user)]

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12}>
          <Card size="small"><Statistic title="Total Baris Ditampilkan" value={summary.total_rows} prefix={<InboxOutlined />} valueStyle={{ color: '#1a73e8' }} /></Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small"><Statistic title="Total Nilai Penerimaan" value={summary.total_amount} formatter={v => formatRp(v)} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
      </Row>

      <Card
        title={<span><ImportOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Daftar Penerimaan</span>}
        extra={
          <Space wrap>
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={handleDate} placeholder={['Tgl Dari', 'Tgl Sampai']} style={{ width: 220 }} />
            <Search placeholder="Cari no. penerimaan / pemasok / barang..." allowClear value={search} style={{ width: 280 }}
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
          rowKey={(r, i) => `${r.no_penerimaan}-${i}`}
          columns={withTableSorters(visibleColumns)} dataSource={data} loading={loading} size="small"
          sticky={{ offsetHeader: 0 }}
          scroll={{ x: 1800, y: 'calc(100vh - 360px)' }}
          pagination={{
            ...pagination, showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t, range) => `${range[0]}-${range[1]} dari ~${t} baris`,
            onChange: (page, pageSize) => {
              pageRef.current = page; pageSizeRef.current = pageSize
              fetchData(page, pageSize, searchRef.current, dateRangeRef.current)
            }
          }}
        />
      </Card>
    </div>
  )
}
