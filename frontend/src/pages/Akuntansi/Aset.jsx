import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Col, DatePicker, Input, message, Row, Segmented, Space, Statistic, Table, Tooltip, Typography } from 'antd'
import { BankOutlined, FileExcelOutlined, HomeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text, Title } = Typography

const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]

const ASET_EXPORT_COLS = [
  { key: 'no_aktiva', label: 'No Aktiva' },
  { key: 'nama_aktiva', label: 'Nama Aktiva' },
  { key: 'tanggal_aktiva', label: 'Tanggal Aktiva', type: 'date' },
  { key: 'nilai_aktiva', label: 'Nilai Aktiva', type: 'number' },
  { key: 'deskripsi', label: 'Deskripsi' },
]

const BANGUNAN_EXPORT_COLS = [
  { key: 'tanggal', label: 'Tanggal', type: 'date' },
  { key: 'no_project', label: 'No Project' },
  { key: 'nama_project', label: 'Nama Project' },
  { key: 'no_akun', label: 'No Akun' },
  { key: 'nama_akun', label: 'Nama Akun' },
  { key: 'no_dokumen', label: 'No Dokumen' },
  { key: 'deskripsi', label: 'Deskripsi' },
  { key: 'nilai', label: 'Nilai', type: 'number' },
]

const formatCurrency = value => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(value || 0)

export default function Aset() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [bangunanData, setBangunanData] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [summary, setSummary] = useState({ total_aset: 0, nilai_aktiva: 0 })
  const [bangunanSummary, setBangunanSummary] = useState({ total_transaksi: 0, nilai: 0, total_project: 0 })
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [activeTab, setActiveTab] = useState('aset')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [bangunanPagination, setBangunanPagination] = useState({ current: 1, pageSize: 20, total: 0 })

  const searchRef = useRef('')
  const dateRangeRef = useRef(getCurrentMonthRange())
  const pageRef = useRef(1)
  const pageSizeRef = useRef(20)
  const bangunanPageRef = useRef(1)
  const bangunanPageSizeRef = useRef(20)

  const fetchData = useCallback(async (page = 1, pageSize = 20, searchVal = '', dates = getCurrentMonthRange()) => {
    setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal) params.search = searchVal
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')

      const res = await api.get('/api/aset', { params })
      if (res.data.error) message.error(res.data.error)
      if (res.data.meta?.message) message.warning(res.data.meta.message)
      setData(res.data.data || [])
      setSummary({ total_aset: res.data.summary?.total_aset || 0, nilai_aktiva: res.data.summary?.nilai_aktiva || 0 })
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: res.data.total || 0,
      }))
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat data aset')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchBangunanData = useCallback(async (page = 1, pageSize = 20, searchVal = '', dates = getCurrentMonthRange()) => {
    setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal) params.search = searchVal
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')

      const res = await api.get('/api/aset/bangunan', { params })
      if (res.data.error) message.error(res.data.error)
      if (res.data.meta?.message) message.warning(res.data.meta.message)
      setBangunanData(res.data.data || [])
      setBangunanSummary({
        total_transaksi: res.data.summary?.total_transaksi || 0,
        nilai: res.data.summary?.nilai || 0,
        total_project: res.data.summary?.total_project || 0,
      })
      setBangunanPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: res.data.total || 0,
      }))
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat data bangunan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(1, 20, '', dateRangeRef.current)
  }, [fetchData])

  const handleSearch = value => {
    searchRef.current = value
    setSearch(value)
    if (activeTab === 'bangunan') {
      bangunanPageRef.current = 1
      fetchBangunanData(1, bangunanPageSizeRef.current, value, dateRangeRef.current)
      return
    }
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, value, dateRangeRef.current)
  }

  const handleDate = dates => {
    const nextDates = dates || [null, null]
    dateRangeRef.current = nextDates
    setDateRange(nextDates)
    if (activeTab === 'bangunan') {
      bangunanPageRef.current = 1
      fetchBangunanData(1, bangunanPageSizeRef.current, searchRef.current, nextDates)
      return
    }
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, nextDates)
  }

  const handleReset = () => {
    const currentMonth = getCurrentMonthRange()
    searchRef.current = ''
    dateRangeRef.current = currentMonth
    setSearch('')
    setDateRange(currentMonth)
    if (activeTab === 'bangunan') {
      bangunanPageRef.current = 1
      fetchBangunanData(1, 50, '', currentMonth)
      return
    }
    pageRef.current = 1
    fetchData(1, 20, '', currentMonth)
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      const res = await api.get(activeTab === 'bangunan' ? '/api/aset/bangunan/export' : '/api/aset/export', { params })
      return res.data.data || []
    },
    columns: activeTab === 'bangunan'
      ? filterExportColumnsByPermission('aset_bangunan', BANGUNAN_EXPORT_COLS, user)
      : filterExportColumnsByPermission('aset', ASET_EXPORT_COLS, user),
    filename: activeTab === 'bangunan' ? 'Aset_Bangunan' : 'Aset',
    sheetName: activeTab === 'bangunan' ? 'Bangunan' : 'Aset',
    message,
    setExporting,
    loadingText: activeTab === 'bangunan' ? 'Mengambil data bangunan...' : 'Mengambil data aset...',
    auditModule: activeTab === 'bangunan' ? 'aset_bangunan' : 'aset',
    auditDescription: activeTab === 'bangunan' ? 'Export Aset Bangunan' : 'Export Aset',
  })

  const columns = [
    { title: 'No Aktiva', dataIndex: 'no_aktiva', key: 'no_aktiva', width: 150, fixed: 'left', render: value => <Text code>{value || '-'}</Text> },
    { title: 'Nama Aktiva', dataIndex: 'nama_aktiva', key: 'nama_aktiva', width: 320, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip> },
    { title: 'Tanggal Aktiva', dataIndex: 'tanggal_aktiva', key: 'tanggal_aktiva', width: 140, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'Nilai Aktiva', dataIndex: 'nilai_aktiva', key: 'nilai_aktiva', width: 160, align: 'right', render: value => <Text strong>{formatCurrency(value)}</Text> },
    { title: 'Deskripsi', dataIndex: 'deskripsi', key: 'deskripsi', width: 340, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip> },
  ]
  const visibleColumns = filterColumnsByPermission('aset', columns, user)
  const bangunanColumns = [
    { title: 'Tanggal', dataIndex: 'tanggal', key: 'tanggal', width: 130, fixed: 'left', render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'No Project', dataIndex: 'no_project', key: 'no_project', width: 150, render: value => <Text code>{value || '-'}</Text> },
    { title: 'Nama Project', dataIndex: 'nama_project', key: 'nama_project', width: 220, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip> },
    { title: 'No Akun', dataIndex: 'no_akun', key: 'no_akun', width: 140 },
    { title: 'Nama Akun', dataIndex: 'nama_akun', key: 'nama_akun', width: 260, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip> },
    { title: 'No Dokumen', dataIndex: 'no_dokumen', key: 'no_dokumen', width: 160, render: value => <Text code>{value || '-'}</Text> },
    { title: 'Nilai', dataIndex: 'nilai', key: 'nilai', width: 160, align: 'right', render: value => <Text strong>{formatCurrency(value)}</Text> },
    { title: 'Deskripsi', dataIndex: 'deskripsi', key: 'deskripsi', width: 320, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip> },
  ]
  const visibleBangunanColumns = filterColumnsByPermission('aset_bangunan', bangunanColumns, user)

  const handleTabChange = key => {
    setActiveTab(key)
    if (key === 'bangunan' && bangunanData.length === 0) {
      fetchBangunanData(bangunanPageRef.current, bangunanPageSizeRef.current, searchRef.current, dateRangeRef.current)
    }
  }

  return (
    <div style={{ maxWidth: 1440 }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>Aset</Title>
        <Text type="secondary">Daftar aktiva tetap dan biaya bangunan dari Easy Accounting untuk memantau aset dalam periode tertentu.</Text>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={activeTab === 'bangunan' ? 8 : 12}>
          <Card size="small">
            <Statistic
              title={activeTab === 'bangunan' ? 'Total Transaksi Bangunan' : 'Total Aset'}
              value={activeTab === 'bangunan' ? bangunanSummary.total_transaksi : summary.total_aset}
              prefix={activeTab === 'bangunan' ? <HomeOutlined /> : <BankOutlined />}
              valueStyle={{ color: '#1a73e8' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={activeTab === 'bangunan' ? 8 : 12}>
          <Card size="small">
            <Statistic
              title={activeTab === 'bangunan' ? 'Biaya Bangunan' : 'Nilai Aktiva'}
              value={formatCurrency(activeTab === 'bangunan' ? bangunanSummary.nilai : summary.nilai_aktiva)}
              prefix={activeTab === 'bangunan' ? <HomeOutlined /> : <BankOutlined />}
              valueStyle={{ color: '#ff7a00' }}
            />
          </Card>
        </Col>
        {activeTab === 'bangunan' && (
          <Col xs={24} sm={8}>
            <Card size="small">
              <Statistic title="Project Teridentifikasi" value={bangunanSummary.total_project} prefix={<HomeOutlined />} valueStyle={{ color: '#00a92f' }} />
            </Card>
          </Col>
        )}
      </Row>

      <Card
        title={<span><BankOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Daftar Aset</span>}
        extra={
          <Space wrap>
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={handleDate} style={{ width: 225 }} />
            <Search
              placeholder={activeTab === 'bangunan' ? 'Cari project/dokumen...' : 'Cari no/nama aset...'}
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
            value={activeTab}
            onChange={handleTabChange}
            options={[
              { label: 'Aktiva Tetap', value: 'aset', icon: <BankOutlined /> },
              { label: 'Bangunan', value: 'bangunan', icon: <HomeOutlined /> },
            ]}
            style={{ padding: 4 }}
          />

          {activeTab === 'aset' ? (
            <Table
              rowKey={(record, index) => `${record.no_aktiva}-${index}`}
              columns={withTableSorters(visibleColumns)}
              dataSource={data}
              loading={loading}
              size="small"
              scroll={{ x: 1200 }}
              pagination={{
                ...pagination,
                showSizeChanger: true,
                pageSizeOptions: ['20', '50', '100'],
                showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} aset`,
                onChange: (page, pageSize) => {
                  pageRef.current = page
                  pageSizeRef.current = pageSize
                  fetchData(page, pageSize, searchRef.current, dateRangeRef.current)
                },
              }}
            />
          ) : (
            <Table
              rowKey={(record, index) => `${record.tanggal}-${record.no_project}-${record.no_dokumen}-${index}`}
              columns={withTableSorters(visibleBangunanColumns)}
              dataSource={bangunanData}
              loading={loading}
              size="small"
              scroll={{ x: 1500 }}
              pagination={{
                ...bangunanPagination,
                showSizeChanger: true,
                pageSizeOptions: ['20', '50', '100'],
                showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} transaksi`,
                onChange: (page, pageSize) => {
                  bangunanPageRef.current = page
                  bangunanPageSizeRef.current = pageSize
                  fetchBangunanData(page, pageSize, searchRef.current, dateRangeRef.current)
                },
              }}
            />
          )}
        </Space>
      </Card>
    </div>
  )
}
