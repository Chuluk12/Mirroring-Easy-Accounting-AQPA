import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, Card, Col, Input, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  FileExcelOutlined, MailOutlined, PhoneOutlined, ReloadOutlined, SearchOutlined, TeamOutlined,
} from '@ant-design/icons'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'

const { Search } = Input
const { Text, Title } = Typography

const fmtRp = value => `Rp ${Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`

const CUSTOMER_EXPORT_COLS = [
  { key: 'no', label: 'No', type: 'number' },
  { key: 'no_pelanggan', label: 'No Customer' },
  { key: 'nama_pelanggan', label: 'Nama Customer' },
  { key: 'alamat', label: 'Alamat' },
  { key: 'kota', label: 'Kota' },
  { key: 'provinsi', label: 'Provinsi' },
  { key: 'kode_pos', label: 'Kode Pos' },
  { key: 'negara', label: 'Negara' },
  { key: 'kontak', label: 'Kontak' },
  { key: 'telepon', label: 'Telepon' },
  { key: 'fax', label: 'Fax' },
  { key: 'email', label: 'Email' },
  { key: 'webpage', label: 'Website' },
  { key: 'nama_salesman', label: 'Salesman' },
  { key: 'credit_limit', label: 'Credit Limit', type: 'number' },
  { key: 'balance', label: 'Saldo', type: 'number' },
  { key: 'status', label: 'Status' },
  { key: 'catatan', label: 'Catatan' },
]

export default function Customer() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [summary, setSummary] = useState({ total: 0, aktif: 0, nonaktif: 0, saldo: 0 })
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const searchRef = useRef('')
  const statusRef = useRef('active')
  const pageRef = useRef(1)
  const pageSizeRef = useRef(20)

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/api/customer/summary')
      setSummary(res.data || { total: 0, aktif: 0, nonaktif: 0, saldo: 0 })
    } catch (error) {
      console.error('Gagal memuat summary customer:', error)
    }
  }, [])

  const fetchData = useCallback(async (
    page = pageRef.current,
    pageSize = pageSizeRef.current,
    q = searchRef.current,
    nextStatus = statusRef.current,
    showLoading = true,
  ) => {
    pageRef.current = page
    pageSizeRef.current = pageSize
    searchRef.current = q
    statusRef.current = nextStatus
    if (showLoading) setLoading(true)
    try {
      const res = await api.get('/api/customer', {
        params: {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          search: q,
          status: nextStatus,
        },
      })
      setData(res.data.data || [])
      setPagination(current => ({
        ...current,
        current: page,
        pageSize,
        total: res.data.total || 0,
      }))
    } catch (error) {
      console.error('Gagal memuat customer:', error)
      message.error('Gagal memuat data customer')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(1, 20, '', 'active')
    fetchSummary()
    const interval = setInterval(() => {
      fetchData(pageRef.current, pageSizeRef.current, searchRef.current, statusRef.current, false)
      fetchSummary()
    }, 15000)
    return () => clearInterval(interval)
  }, [fetchData, fetchSummary])

  const handleSearch = value => {
    setSearch(value)
    fetchData(1, pagination.pageSize, value, statusRef.current)
  }

  const handleStatus = value => {
    setStatus(value)
    fetchData(1, pagination.pageSize, searchRef.current, value)
  }

  const handleReset = () => {
    setSearch('')
    setStatus('active')
    fetchData(1, pagination.pageSize, '', 'active')
  }

  const handleExport = () => {
    exportRowsToXLS({
      fetchRows: async () => {
        const res = await api.get('/api/customer/export', {
          params: { search: searchRef.current, status: statusRef.current },
        })
        return (res.data.data || []).map((row, index) => ({ no: index + 1, ...row }))
      },
      columns: [
        CUSTOMER_EXPORT_COLS[0],
        ...filterExportColumnsByPermission('customer', CUSTOMER_EXPORT_COLS.slice(1), user),
      ],
      filename: 'DaftarCustomer',
      sheetName: 'Customer',
      message,
      setExporting,
      auditModule: 'customer',
      auditDescription: 'Export daftar customer',
    })
  }

  const serialColumn = {
    title: 'No',
    key: 'no',
    width: 64,
    fixed: 'left',
    align: 'center',
    render: (_value, _record, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1,
  }

  const tableColumns = [
    {
      title: 'No Customer',
      dataIndex: 'no_pelanggan',
      key: 'no_pelanggan',
      width: 135,
      fixed: 'left',
      render: value => value ? <Text code style={{ fontSize: 11, color: '#1a73e8' }}>{value}</Text> : '-',
    },
    {
      title: 'Nama Customer',
      dataIndex: 'nama_pelanggan',
      key: 'nama_pelanggan',
      width: 250,
      fixed: 'left',
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><Text strong>{value || '-'}</Text></Tooltip>,
    },
    {
      title: 'Kota',
      dataIndex: 'kota',
      key: 'kota',
      width: 140,
      render: value => value || '-',
    },
    {
      title: 'Kontak',
      dataIndex: 'kontak',
      key: 'kontak',
      width: 150,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}>{value || '-'}</Tooltip>,
    },
    {
      title: 'Telepon',
      dataIndex: 'telepon',
      key: 'telepon',
      width: 155,
      render: value => value
        ? <Space size={6}><PhoneOutlined style={{ color: '#11b7d8' }} /><span>{value}</span></Space>
        : <Text type="secondary">-</Text>,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 220,
      ellipsis: { showTitle: false },
      render: value => value
        ? <Tooltip title={value}><Space size={6}><MailOutlined style={{ color: '#d41452' }} /><span>{value}</span></Space></Tooltip>
        : <Text type="secondary">-</Text>,
    },
    {
      title: 'Salesman',
      dataIndex: 'nama_salesman',
      key: 'nama_salesman',
      width: 170,
      ellipsis: { showTitle: false },
      render: value => value ? <Tooltip title={value}>{value}</Tooltip> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Credit Limit',
      dataIndex: 'credit_limit',
      key: 'credit_limit',
      width: 140,
      align: 'right',
      render: value => <Text>{fmtRp(value)}</Text>,
    },
    {
      title: 'Saldo',
      dataIndex: 'balance',
      key: 'balance',
      width: 140,
      align: 'right',
      render: value => Number(value || 0) !== 0 ? <Text strong>{fmtRp(value)}</Text> : <Text type="secondary">Rp 0</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 105,
      align: 'center',
      fixed: 'right',
      render: (_value, record) => (
        <Tag color={record.suspended ? 'default' : 'green'}>
          {record.suspended ? 'Nonaktif' : 'Aktif'}
        </Tag>
      ),
    },
  ]

  const columns = useMemo(() => (
    withTableSorters([serialColumn, ...filterColumnsByPermission('customer', tableColumns, user)])
  ), [pagination.current, pagination.pageSize, user])

  return (
    <Card
      title={(
        <Space direction="vertical" size={0}>
          <Title level={4} style={{ margin: 0 }}>Customer</Title>
          <Text type="secondary">Master customer dari Easy Accounting.</Text>
        </Space>
      )}
      extra={(
        <Space wrap>
          <Search
            allowClear
            placeholder="Cari no, nama, kota, kontak"
            prefix={<SearchOutlined />}
            value={search}
            onChange={event => setSearch(event.target.value)}
            onSearch={handleSearch}
            style={{ width: 280 }}
          />
          <Select
            value={status}
            onChange={handleStatus}
            style={{ width: 135 }}
            options={[
              { value: 'active', label: 'Aktif' },
              { value: 'inactive', label: 'Nonaktif' },
              { value: 'all', label: 'Semua' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
          <Button icon={<FileExcelOutlined />} loading={exporting} onClick={handleExport}>
            Export XLS
          </Button>
        </Space>
      )}
      style={{ borderRadius: 8 }}
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8, background: 'linear-gradient(120deg, #eefcff, #ffffff)' }}>
            <Statistic title="Total Customer" value={summary.total || 0} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8, background: 'linear-gradient(120deg, #effdf5, #ffffff)' }}>
            <Statistic title="Customer Aktif" value={summary.aktif || 0} valueStyle={{ color: '#00a92f' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8, background: 'linear-gradient(120deg, #f7f8fb, #ffffff)' }}>
            <Statistic title="Customer Nonaktif" value={summary.nonaktif || 0} valueStyle={{ color: '#697087' }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 8, background: 'linear-gradient(120deg, #fff4f7, #ffffff)' }}>
            <Statistic title="Total Saldo" value={fmtRp(summary.saldo)} valueStyle={{ color: '#d41452' }} />
          </Card>
        </Col>
      </Row>

      <Table
        rowKey="customer_id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        scroll={{ x: 1700, y: 560 }}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} customer`,
        }}
        onChange={(pager) => fetchData(pager.current, pager.pageSize, searchRef.current, statusRef.current)}
      />
    </Card>
  )
}
