import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Col, DatePicker, Input, message, Row, Segmented, Space, Statistic, Table, Tooltip, Typography } from 'antd'
import { DollarOutlined, FileExcelOutlined, ReloadOutlined, SearchOutlined, WalletOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text, Title } = Typography

const getDefaultRange = () => [dayjs().startOf('year'), dayjs().endOf('month')]

const BEBAN_EXPORT_COLS = [
  { key: 'tanggal', label: 'Tanggal', type: 'date' },
  { key: 'no_akun', label: 'No Akun' },
  { key: 'nama_akun', label: 'Nama Akun' },
  { key: 'sumber', label: 'Sumber' },
  { key: 'tipe_transaksi', label: 'Tipe Transaksi' },
  { key: 'no_dokumen', label: 'No Dokumen' },
  { key: 'deskripsi', label: 'Deskripsi' },
  { key: 'nilai', label: 'Nilai', type: 'number' },
]

const EXPENSE_TYPES = {
  gaji: {
    module: 'beban_gaji',
    title: 'Beban Gaji',
    account: '6.00.00.001 - Gaji, Upah dan Tunjangan',
    tableTitle: 'Daftar Beban Gaji',
    totalTitle: 'Total Beban Gaji',
    endpoint: '/api/beban/gaji',
    exportEndpoint: '/api/beban/gaji/export',
    filename: 'Beban_Gaji',
    sheetName: 'Beban Gaji',
  },
  etoll: {
    module: 'beban_etoll',
    title: 'E-TOLL',
    account: '1.01.00.001 s/d 1.01.00.005 - E-TOLL',
    tableTitle: 'Daftar Beban E-TOLL',
    totalTitle: 'Total E-TOLL',
    endpoint: '/api/beban/etoll',
    exportEndpoint: '/api/beban/etoll/export',
    filename: 'Beban_ETOLL',
    sheetName: 'E-TOLL',
  },
  transport: {
    module: 'beban_transport',
    title: 'BBM, Parkir, Tol & Transport',
    account: '6.00.00.004 - BBM, Parkir, Tol & Transport',
    tableTitle: 'Daftar BBM, Parkir, Tol & Transport',
    totalTitle: 'Total Transport',
    endpoint: '/api/beban/transport',
    exportEndpoint: '/api/beban/transport/export',
    filename: 'Beban_Transport',
    sheetName: 'Transport',
  },
  utilitas: {
    module: 'beban_utilitas',
    title: 'Listrik, Telepon, Pulsa & Internet',
    account: '6.00.00.008 - Listrik, Telepon, Pulsa & Internet',
    tableTitle: 'Daftar Listrik, Telepon, Pulsa & Internet',
    totalTitle: 'Total Utilitas',
    endpoint: '/api/beban/utilitas',
    exportEndpoint: '/api/beban/utilitas/export',
    filename: 'Beban_Utilitas',
    sheetName: 'Utilitas',
  },
}

const formatCurrency = value => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(value || 0)

export default function BebanGaji() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [activeType, setActiveType] = useState('gaji')
  const [summary, setSummary] = useState({ total_transaksi: 0, nilai: 0 })
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState(getDefaultRange)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })

  const searchRef = useRef('')
  const dateRangeRef = useRef(getDefaultRange())
  const pageRef = useRef(1)
  const pageSizeRef = useRef(20)

  const activeConfig = EXPENSE_TYPES[activeType]

  const fetchData = useCallback(async (page = 1, pageSize = 20, searchVal = '', dates = getDefaultRange()) => {
    setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal) params.search = searchVal
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')

      const res = await api.get(activeConfig.endpoint, { params })
      if (res.data.error) message.error(res.data.error)
      if (res.data.meta?.message) message.warning(res.data.meta.message)
      setData(res.data.data || [])
      setSummary({
        total_transaksi: res.data.summary?.total_transaksi || 0,
        nilai: res.data.summary?.nilai || 0,
      })
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: res.data.total || 0,
      }))
    } catch (error) {
      message.error(error.response?.data?.message || `Gagal memuat data ${activeConfig.title}`)
    } finally {
      setLoading(false)
    }
  }, [activeConfig])

  useEffect(() => {
    fetchData(1, 20, '', dateRangeRef.current)
  }, [fetchData])

  const handleSearch = value => {
    searchRef.current = value
    setSearch(value)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, value, dateRangeRef.current)
  }

  const handleDate = dates => {
    const nextDates = dates || [null, null]
    dateRangeRef.current = nextDates
    setDateRange(nextDates)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, nextDates)
  }

  const handleReset = () => {
    const currentRange = getDefaultRange()
    searchRef.current = ''
    dateRangeRef.current = currentRange
    pageRef.current = 1
    pageSizeRef.current = 20
    setSearch('')
    setDateRange(currentRange)
    fetchData(1, 20, '', currentRange)
  }

  const handleTypeChange = value => {
    const nextRange = getDefaultRange()
    setActiveType(value)
    searchRef.current = ''
    dateRangeRef.current = nextRange
    pageRef.current = 1
    setSearch('')
    setDateRange(nextRange)
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      const res = await api.get(activeConfig.exportEndpoint, { params })
      return res.data.data || []
    },
    columns: filterExportColumnsByPermission(activeConfig.module, BEBAN_EXPORT_COLS, user),
    filename: activeConfig.filename,
    sheetName: activeConfig.sheetName,
    message,
    setExporting,
    loadingText: `Mengambil data ${activeConfig.title}...`,
    auditModule: activeConfig.module,
    auditDescription: `Export ${activeConfig.title}`,
  })

  const columns = [
    { title: 'Tanggal', dataIndex: 'tanggal', key: 'tanggal', width: 130, fixed: 'left', render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'No Akun', dataIndex: 'no_akun', key: 'no_akun', width: 140, render: value => <Text code>{value || '-'}</Text> },
    { title: 'Nama Akun', dataIndex: 'nama_akun', key: 'nama_akun', width: 240, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip> },
    { title: 'Sumber', dataIndex: 'sumber', key: 'sumber', width: 100 },
    { title: 'Tipe', dataIndex: 'tipe_transaksi', key: 'tipe_transaksi', width: 100 },
    { title: 'No Dokumen', dataIndex: 'no_dokumen', key: 'no_dokumen', width: 170, render: value => <Text code>{value || '-'}</Text> },
    { title: 'Nilai', dataIndex: 'nilai', key: 'nilai', width: 160, align: 'right', render: value => <Text strong>{formatCurrency(value)}</Text> },
    { title: 'Deskripsi', dataIndex: 'deskripsi', key: 'deskripsi', width: 420, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip> },
  ]
  const visibleColumns = filterColumnsByPermission(activeConfig.module, columns, user)

  return (
    <div style={{ maxWidth: 1440 }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>Beban</Title>
        <Text type="secondary">Transaksi akun {activeConfig.account} dari Easy Accounting.</Text>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12}>
          <Card size="small">
            <Statistic title="Total Transaksi" value={summary.total_transaksi} prefix={<WalletOutlined />} valueStyle={{ color: '#1a73e8' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small">
            <Statistic title={activeConfig.totalTitle} value={formatCurrency(summary.nilai)} prefix={<DollarOutlined />} valueStyle={{ color: '#d41452' }} />
          </Card>
        </Col>
      </Row>

      <Card
        title={<span><WalletOutlined style={{ marginRight: 8, color: '#d41452' }} />{activeConfig.tableTitle}</span>}
        extra={
          <Space wrap>
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={handleDate} style={{ width: 225 }} />
            <Search
              placeholder="Cari dokumen/deskripsi..."
              allowClear
              value={search}
              style={{ width: 260 }}
              prefix={<SearchOutlined />}
              onSearch={handleSearch}
              onChange={event => {
                setSearch(event.target.value)
                if (!event.target.value) handleSearch('')
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            <Button type="primary" icon={<FileExcelOutlined />} onClick={handleExport} loading={exporting} style={{ background: '#217346', borderColor: '#217346' }}>
              Export XLS
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Segmented
            value={activeType}
            onChange={handleTypeChange}
            options={[
              { label: 'Beban Gaji', value: 'gaji', icon: <WalletOutlined /> },
              { label: 'E-TOLL', value: 'etoll', icon: <DollarOutlined /> },
              { label: 'BBM/Parkir/Tol', value: 'transport', icon: <DollarOutlined /> },
              { label: 'Listrik/Telepon', value: 'utilitas', icon: <DollarOutlined /> },
            ]}
            style={{ padding: 4 }}
          />
        <Table
          rowKey={(record, index) => `${record.tanggal}-${record.no_dokumen}-${index}`}
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1500 }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} transaksi`,
            onChange: (page, pageSize) => {
              pageRef.current = page
              pageSizeRef.current = pageSize
              fetchData(page, pageSize, searchRef.current, dateRangeRef.current)
            },
          }}
        />
        </Space>
      </Card>
    </div>
  )
}
