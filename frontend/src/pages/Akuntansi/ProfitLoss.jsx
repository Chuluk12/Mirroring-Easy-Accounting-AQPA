import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, Card, Col, DatePicker, Input, message, Row, Space,
  Statistic, Table, Tag, Typography,
} from 'antd'
import {
  FileExcelOutlined, LineChartOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text, Title } = Typography
const DEFAULT_PAGE_SIZE = 50

const currentPeriodRange = () => [dayjs().startOf('month'), dayjs()]

const emptySummary = {
  total_baris: 0,
  total_faktur: 0,
  total_jumlah: 0,
  total_hpp: 0,
  total_delivery: 0,
  gross_profit: 0,
  margin_pct: 0,
}

const formatCurrency = value => Number(value || 0).toLocaleString('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const formatQty = value => Number(value || 0).toLocaleString('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

const EXPORT_COLUMNS = [
  { key: 'no_faktur', label: 'No. Faktur' },
  { key: 'no_do', label: 'No. Pengiriman' },
  { key: 'no_so', label: 'SO' },
  { key: 'tgl_faktur', label: 'Tgl. Faktur', type: 'date' },
  { key: 'no_barang', label: 'No. Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Produk' },
  { key: 'qty_faktur', label: 'Kts Faktur', type: 'number' },
  { key: 'uom', label: 'Satuan' },
  { key: 'harga_satuan', label: 'Harga Satuan', type: 'number' },
  { key: 'jumlah', label: 'Jumlah', type: 'number' },
  { key: 'nilai_hpp', label: 'Nilai HPP', type: 'number' },
  { key: 'delivery', label: 'Delivery', type: 'number' },
  { key: 'gross_profit', label: 'Gross Profit', type: 'number' },
  { key: 'margin_pct', label: 'Margin (%)', type: 'number' },
  { key: 'nama_pelanggan', label: 'Pelanggan' },
  { key: 'no_po', label: 'No. PO' },
]

export default function ProfitLoss() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [summary, setSummary] = useState(emptySummary)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState(currentPeriodRange)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
  })
  const searchRef = useRef('')
  const dateRangeRef = useRef(currentPeriodRange())

  const fetchData = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE, searchValue = '', dates = currentPeriodRange()) => {
    setLoading(true)
    try {
      const params = {
        offset: (page - 1) * pageSize,
        limit: pageSize,
      }
      if (searchValue) params.search = searchValue
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')
      const response = await api.get('/api/profit-loss', { params })
      setData(response.data.data || [])
      setSummary({ ...emptySummary, ...(response.data.summary || {}) })
      setPagination({ current: page, pageSize, total: response.data.total || 0 })
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat Profit & Loss')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(1, DEFAULT_PAGE_SIZE, '', dateRangeRef.current)
  }, [fetchData])

  const handleSearch = value => {
    searchRef.current = value
    setSearch(value)
    fetchData(1, pagination.pageSize, value, dateRangeRef.current)
  }

  const handleDate = dates => {
    const nextDates = dates || [null, null]
    dateRangeRef.current = nextDates
    setDateRange(nextDates)
    fetchData(1, pagination.pageSize, searchRef.current, nextDates)
  }

  const handleReset = () => {
    const dates = currentPeriodRange()
    searchRef.current = ''
    dateRangeRef.current = dates
    setSearch('')
    setDateRange(dates)
    fetchData(1, DEFAULT_PAGE_SIZE, '', dates)
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      const response = await api.get('/api/profit-loss/export', { params })
      return response.data.data || []
    },
    columns: filterExportColumnsByPermission('profit_loss', EXPORT_COLUMNS, user),
    filename: 'Profit_Loss_Invoice',
    sheetName: 'Profit Loss',
    message,
    setExporting,
    loadingText: 'Mengambil data Profit & Loss...',
    auditModule: 'profit_loss',
    auditDescription: 'Export Profit & Loss Invoice',
  })

  const columns = filterColumnsByPermission('profit_loss', withTableSorters([
    { title: 'No. Faktur', dataIndex: 'no_faktur', width: 150, fixed: 'left', render: value => <Text code>{value}</Text> },
    { title: 'No. Pengiriman', dataIndex: 'no_do', width: 160, render: value => value || '-' },
    { title: 'SO', dataIndex: 'no_so', width: 145, render: value => value || '-' },
    { title: 'Tgl. Faktur', dataIndex: 'tgl_faktur', width: 115 },
    { title: 'No. Barang', dataIndex: 'no_barang', width: 150, render: value => value || '-' },
    { title: 'Deskripsi Produk', dataIndex: 'deskripsi_barang', width: 240 },
    { title: 'Kts Faktur', dataIndex: 'qty_faktur', width: 110, align: 'right', render: formatQty },
    { title: 'Harga Satuan', dataIndex: 'harga_satuan', width: 145, align: 'right', render: formatCurrency },
    { title: 'Jumlah', dataIndex: 'jumlah', width: 145, align: 'right', render: formatCurrency },
    { title: 'Nilai HPP', dataIndex: 'nilai_hpp', width: 145, align: 'right', render: value => <Text style={{ color: '#ff7a00' }}>{formatCurrency(value)}</Text> },
    {
      title: 'Delivery',
      dataIndex: 'delivery',
      width: 145,
      align: 'right',
      render: (value, record) => (
        <Text title={record.no_delivery || undefined} style={{ color: '#1677ff' }}>
          {formatCurrency(value)}
        </Text>
      ),
    },
    {
      title: 'Gross Profit',
      dataIndex: 'gross_profit',
      width: 150,
      align: 'right',
      render: value => <Text strong style={{ color: Number(value) >= 0 ? '#00a92f' : '#d41452' }}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Margin',
      dataIndex: 'margin_pct',
      width: 100,
      align: 'right',
      render: value => <Tag color={Number(value) >= 0 ? 'green' : 'red'}>{Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%</Tag>,
    },
    { title: 'Pelanggan', dataIndex: 'nama_pelanggan', width: 220 },
    { title: 'No. PO', dataIndex: 'no_po', width: 160 },
  ]), user)

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>Profit & Loss (Laba & Rugi)</Title>
      <Text type="secondary">Gross Profit dihitung dari Jumlah penjualan dikurangi Nilai HPP jurnal.</Text>

      <Row gutter={[12, 12]} style={{ marginTop: 18, marginBottom: 16 }}>
        <Col xs={12} lg={4}><Card><Statistic title="Total Faktur" value={summary.total_faktur} /></Card></Col>
        <Col xs={12} lg={4}><Card><Statistic title="Jumlah" value={formatCurrency(summary.total_jumlah)} /></Card></Col>
        <Col xs={12} lg={4}><Card><Statistic title="Nilai HPP" value={formatCurrency(summary.total_hpp)} valueStyle={{ color: '#ff7a00' }} /></Card></Col>
        <Col xs={12} lg={4}><Card><Statistic title="Delivery" value={formatCurrency(summary.total_delivery)} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col xs={12} lg={4}><Card><Statistic title="Gross Profit" value={formatCurrency(summary.gross_profit)} valueStyle={{ color: summary.gross_profit >= 0 ? '#00a92f' : '#d41452' }} /></Card></Col>
        <Col xs={12} lg={4}><Card><Statistic title="Margin" value={summary.margin_pct} suffix="%" precision={2} /></Card></Col>
      </Row>

      <Card
        title={<span><LineChartOutlined style={{ marginRight: 8, color: '#d41452' }} />Daftar Profit & Loss Invoice</span>}
        extra={(
          <Space wrap>
            <Search
              value={search}
              allowClear
              placeholder="Faktur, pengiriman, SO, barang..."
              prefix={<SearchOutlined />}
              onChange={event => setSearch(event.target.value)}
              onSearch={handleSearch}
              style={{ width: 280 }}
            />
            <RangePicker value={dateRange} onChange={handleDate} format="DD/MM/YYYY" />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            <Button type="primary" icon={<FileExcelOutlined />} loading={exporting} onClick={handleExport}>Export</Button>
          </Space>
        )}
      >
        <Table
          rowKey={(row, index) => `${row.no_faktur}-${row.no_barang}-${row.no_so}-${index}`}
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 2000 }}
          size="small"
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100, 200],
            showTotal: total => `${total.toLocaleString('id-ID')} baris`,
          }}
          onChange={next => fetchData(next.current, next.pageSize, searchRef.current, dateRangeRef.current)}
        />
      </Card>
    </div>
  )
}
