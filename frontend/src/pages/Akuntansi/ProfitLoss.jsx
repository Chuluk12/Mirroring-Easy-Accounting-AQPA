import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, Card, Col, DatePicker, Input, InputNumber, message, Popover, Row, Select, Space,
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
  total_delivery_ju: 0,
  total_cf: 0,
  total_mf: 0,
  total_biaya_project: 0,
  total_biaya: 0,
  laba_operasi: 0,
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

function FeeReferenceCell({ value, details = [], color, type }) {
  const content = (
    <div style={{ width: 380, maxHeight: 320, overflowY: 'auto' }}>
      {details.map((detail, index) => (
        <div
          key={`${detail.no_transaksi}-${detail.part_number}-${index}`}
          style={{ padding: '8px 0', borderBottom: index < details.length - 1 ? '1px solid #f0f0f0' : 0 }}
        >
          <div>
            <Text type="secondary">No. transaksi: </Text>
            <Text strong code>{detail.no_transaksi || '-'}</Text>
          </div>
          <Space size={6} wrap>
            <Tag color={type === 'CF' ? 'blue' : 'magenta'} style={{ margin: 0 }}>{detail.persentase}</Tag>
            <Text type="secondary">{detail.tanggal || '-'}</Text>
          </Space>
          <div><Text type="secondary">Part number: </Text><Text>{detail.part_number || '-'}</Text></div>
          <div>
            <Text type="secondary">Amount: </Text><Text>{formatCurrency(detail.amount_asal)}</Text>
            <Text type="secondary"> → {type}: </Text><Text strong>{formatCurrency(detail.nilai_fee)}</Text>
          </div>
        </div>
      ))}
    </div>
  )

  const label = <Text style={{ color }}>{formatCurrency(value)}</Text>

  if (!details.length) return label
  return (
    <Popover title={`Referensi transaksi ${type}`} content={content} trigger="click" placement="left">
      <Button type="link" onClick={event => event.stopPropagation()} style={{ height: 'auto', padding: 0 }}>
        {label}
      </Button>
    </Popover>
  )
}

function DeliveryReferenceCell({ value, details = [], color, type, fallbackTitle }) {
  const label = <Text style={{ color }}>{formatCurrency(value)}</Text>
  if (!Number(value || 0) || !details.length) {
    return <Text title={fallbackTitle || undefined} style={{ color }}>{formatCurrency(value)}</Text>
  }

  const content = (
    <div style={{ width: 430, maxHeight: 340, overflowY: 'auto' }}>
      {details.map((detail, index) => (
        <div
          key={`${detail.no_transaksi || detail.no_do || 'delivery'}-${index}`}
          style={{ padding: '8px 0', borderBottom: index < details.length - 1 ? '1px solid #f0f0f0' : 0 }}
        >
          <div>
            <Text type="secondary">No. transaksi: </Text>
            <Text strong code>{detail.no_transaksi || '-'}</Text>
          </div>
          {type === 'purch' ? (
            <>
              <Space size={6} wrap>
                <Tag color="blue" style={{ margin: 0 }}>AI-SRV</Tag>
                <Text type="secondary">{detail.tanggal || '-'}</Text>
              </Space>
              <div><Text type="secondary">Vendor: </Text><Text>{detail.nama_vendor || '-'}</Text></div>
              <div><Text type="secondary">Barang: </Text><Text>{detail.no_barang || '-'}</Text></div>
              <div><Text type="secondary">Deskripsi: </Text><Text>{detail.deskripsi_barang || '-'}</Text></div>
              <div>
                <Text type="secondary">Qty: </Text><Text>{formatQty(detail.qty)}</Text>
                <Text type="secondary"> | Harga: </Text><Text>{formatCurrency(detail.harga)}</Text>
              </div>
              <div><Text type="secondary">Nilai DPP: </Text><Text strong>{formatCurrency(detail.nilai_dpp)}</Text></div>
            </>
          ) : (
            <>
              <Space size={6} wrap>
                <Tag color="purple" style={{ margin: 0 }}>JV</Tag>
                <Text type="secondary">DO {detail.no_do || '-'}</Text>
              </Space>
              <div><Text type="secondary">Deskripsi: </Text><Text>{detail.deskripsi || '-'}</Text></div>
              <div>
                <Text type="secondary">Nilai jurnal: </Text><Text>{formatCurrency(detail.nilai_jurnal)}</Text>
                <Text type="secondary"> {'->'} Alokasi DO: </Text><Text strong>{formatCurrency(detail.nilai_alokasi)}</Text>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <Popover title={type === 'purch' ? 'Rincian Delivery Purch' : 'Rincian Delivery JU'} content={content} trigger="click" placement="left">
      <Button type="link" onClick={event => event.stopPropagation()} style={{ height: 'auto', padding: 0 }}>
        {label}
      </Button>
    </Popover>
  )
}

const EXPORT_COLUMNS = [
  { key: 'no_faktur', label: 'No. Faktur' },
  { key: 'no_do', label: 'No. Pengiriman' },
  { key: 'no_so', label: 'SO' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'tgl_faktur', label: 'Tgl. Faktur', type: 'date' },
  { key: 'no_barang', label: 'No. Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Produk' },
  { key: 'qty_faktur', label: 'Kts Faktur', type: 'number' },
  { key: 'uom', label: 'Satuan' },
  { key: 'harga_satuan', label: 'Harga Satuan', type: 'number' },
  { key: 'jumlah', label: 'Jumlah', type: 'number' },
  { key: 'nilai_hpp', label: 'Nilai HPP', type: 'number' },
  { key: 'gross_profit', label: 'Gross Profit', type: 'number' },
  { key: 'delivery', label: 'Delivery Purch', type: 'number' },
  { key: 'delivery_ju', label: 'Delivery JU', type: 'number' },
  { key: 'cf', label: 'CF', type: 'number' },
  { key: 'cf_pct', label: 'CF %' },
  { key: 'mf', label: 'MF', type: 'number' },
  { key: 'mf_pct', label: 'MF %' },
  { key: 'biaya_project', label: 'Biaya Project', type: 'number' },
  { key: 'total_biaya', label: 'Total Biaya', type: 'number' },
  { key: 'laba_operasi', label: 'Laba Operasi', type: 'number' },
  { key: 'margin_pct', label: '%', type: 'number' },
  { key: 'nama_pelanggan', label: 'Pelanggan' },
  { key: 'no_po', label: 'No. PO' },
]

function EditableManualCost({ record, field, onSaved }) {
  const [value, setValue] = useState(Number(record[field] || 0))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(Number(record[field] || 0))
  }, [record, field])

  const save = async () => {
    const nextValue = Math.max(Number(value || 0), 0)
    if (nextValue === Number(record[field] || 0)) return
    setSaving(true)
    try {
      const payload = {
        row_key: record.manual_cost_key,
        cf: Number(record.cf || 0),
        mf: Number(record.mf || 0),
        biaya_project: Number(record.biaya_project || 0),
        [field]: nextValue,
      }
      await api.post('/api/profit-loss/manual-cost', payload)
      onSaved(record, field, nextValue)
      message.success(`${field === 'biaya_project' ? 'Biaya Project' : field.toUpperCase()} tersimpan`)
    } catch (error) {
      setValue(Number(record[field] || 0))
      message.error(error.response?.data?.message || 'Gagal menyimpan biaya manual')
    } finally {
      setSaving(false)
    }
  }

  return (
    <InputNumber
      size="small"
      value={value}
      min={0}
      controls={false}
      disabled={saving}
      formatter={input => `${input || ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
      parser={input => (input || '').replace(/\./g, '').replace(/,/g, '.')}
      onClick={event => event.stopPropagation()}
      onChange={next => setValue(Number(next || 0))}
      onBlur={save}
      onPressEnter={event => event.currentTarget.blur()}
      style={{ width: 125, textAlign: 'right' }}
    />
  )
}

export default function ProfitLoss() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [summary, setSummary] = useState(emptySummary)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [marketing, setMarketing] = useState('')
  const [marketingOptions, setMarketingOptions] = useState([])
  const [dateRange, setDateRange] = useState(currentPeriodRange)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
  })
  const searchRef = useRef('')
  const marketingRef = useRef('')
  const dateRangeRef = useRef(currentPeriodRange())

  const fetchData = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE, searchValue = '', dates = currentPeriodRange(), marketingValue = '') => {
    setLoading(true)
    try {
      const params = {
        offset: (page - 1) * pageSize,
        limit: pageSize,
      }
      if (searchValue) params.search = searchValue
      if (marketingValue) params.marketing = marketingValue
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')
      const response = await api.get('/api/profit-loss', { params })
      setData(response.data.data || [])
      setSummary({ ...emptySummary, ...(response.data.summary || {}) })
      setMarketingOptions(response.data.marketing_options || [])
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
    fetchData(1, DEFAULT_PAGE_SIZE, '', dateRangeRef.current, '')
  }, [fetchData])

  const handleSearch = value => {
    searchRef.current = value
    setSearch(value)
    fetchData(1, pagination.pageSize, value, dateRangeRef.current, marketingRef.current)
  }

  const handleDate = dates => {
    const nextDates = dates || [null, null]
    dateRangeRef.current = nextDates
    setDateRange(nextDates)
    fetchData(1, pagination.pageSize, searchRef.current, nextDates, marketingRef.current)
  }

  const handleMarketing = value => {
    const nextMarketing = value || ''
    marketingRef.current = nextMarketing
    setMarketing(nextMarketing)
    fetchData(1, pagination.pageSize, searchRef.current, dateRangeRef.current, nextMarketing)
  }

  const handleReset = () => {
    const dates = currentPeriodRange()
    searchRef.current = ''
    marketingRef.current = ''
    dateRangeRef.current = dates
    setSearch('')
    setMarketing('')
    setDateRange(dates)
    fetchData(1, DEFAULT_PAGE_SIZE, '', dates, '')
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (marketingRef.current) params.marketing = marketingRef.current
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      const response = await api.get('/api/profit-loss/export', { params, timeout: 300000 })
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

  const handleManualCostSaved = (record, field, nextValue) => {
    const previousValue = Number(record[field] || 0)
    const delta = nextValue - previousValue
    const summaryKey = {
      cf: 'total_cf',
      mf: 'total_mf',
      biaya_project: 'total_biaya_project',
    }[field]
    setData(current => current.map(row => {
      if (row.manual_cost_key !== record.manual_cost_key) return row
      const nextLabaOperasi = Number(row.laba_operasi || 0) - delta
      return {
        ...row,
        [field]: nextValue,
        total_biaya: Number(row.total_biaya || 0) + delta,
        laba_operasi: nextLabaOperasi,
        margin_pct: Number(row.jumlah || 0) ? nextLabaOperasi / Number(row.jumlah) * 100 : 0,
      }
    }))
    setSummary(current => {
      const nextLabaOperasi = Number(current.laba_operasi || 0) - delta
      return {
        ...current,
        [summaryKey]: Number(current[summaryKey] || 0) + delta,
        total_biaya: Number(current.total_biaya || 0) + delta,
        laba_operasi: nextLabaOperasi,
        margin_pct: Number(current.total_jumlah || 0) ? nextLabaOperasi / Number(current.total_jumlah) * 100 : 0,
      }
    })
  }

  const columns = filterColumnsByPermission('profit_loss', withTableSorters([
    { title: 'No. Faktur', dataIndex: 'no_faktur', width: 150, fixed: 'left', render: value => <Text code>{value}</Text> },
    { title: 'No. Pengiriman', dataIndex: 'no_do', width: 160, render: value => value || '-' },
    { title: 'SO', dataIndex: 'no_so', width: 145, render: value => value || '-' },
    { title: 'Marketing', dataIndex: 'marketing', width: 170, ellipsis: true, render: value => value || '-' },
    { title: 'Tgl. Faktur', dataIndex: 'tgl_faktur', width: 115 },
    { title: 'No. Barang', dataIndex: 'no_barang', width: 150, render: value => value || '-' },
    { title: 'Deskripsi Produk', dataIndex: 'deskripsi_barang', width: 240 },
    { title: 'Kts Faktur', dataIndex: 'qty_faktur', width: 110, align: 'right', render: formatQty },
    { title: 'Harga Satuan', dataIndex: 'harga_satuan', width: 145, align: 'right', render: formatCurrency },
    { title: 'Jumlah', dataIndex: 'jumlah', width: 145, align: 'right', render: formatCurrency },
    { title: 'Nilai HPP', dataIndex: 'nilai_hpp', width: 145, align: 'right', render: value => <Text style={{ color: '#ff7a00' }}>{formatCurrency(value)}</Text> },
    {
      title: 'Gross Profit',
      dataIndex: 'gross_profit',
      width: 150,
      align: 'right',
      render: value => <Text strong style={{ color: Number(value) >= 0 ? '#00a92f' : '#d41452' }}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Delivery Purch',
      dataIndex: 'delivery',
      width: 145,
      align: 'right',
      render: (value, record) => (
        <DeliveryReferenceCell
          value={value}
          details={record.delivery_details}
          color="#1677ff"
          type="purch"
          fallbackTitle={record.no_delivery}
        />
      ),
    },
    {
      title: 'Delivery JU',
      dataIndex: 'delivery_ju',
      width: 145,
      align: 'right',
      render: (value, record) => (
        <DeliveryReferenceCell
          value={value}
          details={record.delivery_ju_details}
          color="#722ed1"
          type="ju"
          fallbackTitle={record.no_jurnal_delivery_ju}
        />
      ),
    },
    {
      title: 'CF',
      dataIndex: 'cf',
      width: 145,
      align: 'right',
      render: (value, record) => <FeeReferenceCell value={value} details={record.cf_details} color="#1677ff" type="CF" />,
    },
    {
      title: 'MF',
      dataIndex: 'mf',
      width: 145,
      align: 'right',
      render: (value, record) => <FeeReferenceCell value={value} details={record.mf_details} color="#d41452" type="MF" />,
    },
    {
      title: 'Biaya Project',
      dataIndex: 'biaya_project',
      width: 155,
      align: 'right',
      render: (_, record) => <EditableManualCost record={record} field="biaya_project" onSaved={handleManualCostSaved} />,
    },
    {
      title: 'Total Biaya',
      dataIndex: 'total_biaya',
      width: 150,
      align: 'right',
      render: value => <Text strong style={{ color: '#d46b08' }}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Laba Operasi',
      dataIndex: 'laba_operasi',
      width: 155,
      align: 'right',
      render: value => <Text strong style={{ color: Number(value) >= 0 ? '#00a92f' : '#d41452' }}>{formatCurrency(value)}</Text>,
    },
    {
      title: '%',
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
        <Col xs={12} lg={4}><Card><Statistic title="Delivery Purch" value={formatCurrency(summary.total_delivery)} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col xs={12} lg={4}><Card><Statistic title="Delivery JU" value={formatCurrency(summary.total_delivery_ju)} valueStyle={{ color: '#722ed1' }} /></Card></Col>
        <Col xs={12} lg={4}><Card><Statistic title="Total Biaya" value={formatCurrency(summary.total_biaya)} valueStyle={{ color: '#d46b08' }} /></Card></Col>
        <Col xs={12} lg={4}><Card><Statistic title="Laba Operasi" value={formatCurrency(summary.laba_operasi)} valueStyle={{ color: summary.laba_operasi >= 0 ? '#00a92f' : '#d41452' }} /></Card></Col>
        <Col xs={12} lg={4}><Card><Statistic title="Gross Profit" value={formatCurrency(summary.gross_profit)} valueStyle={{ color: summary.gross_profit >= 0 ? '#00a92f' : '#d41452' }} /></Card></Col>
        <Col xs={12} lg={4}><Card><Statistic title="%" value={summary.margin_pct} suffix="%" precision={2} /></Card></Col>
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
            <Select
              allowClear
              showSearch
              value={marketing || undefined}
              placeholder="Filter marketing"
              optionFilterProp="label"
              style={{ width: 210 }}
              options={marketingOptions.map(value => ({ value, label: value }))}
              onChange={handleMarketing}
            />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            <Button type="primary" icon={<FileExcelOutlined />} loading={exporting} onClick={handleExport}>Export</Button>
          </Space>
        )}
      >
        <Table
          className="profit-loss-freeze-table"
          rowKey={(row, index) => `${row.no_faktur}-${row.no_barang}-${row.no_so}-${index}`}
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 2170, y: 'calc(100vh - 180px)' }}
          size="small"
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100, 200],
            showTotal: total => `${total.toLocaleString('id-ID')} baris`,
          }}
          onChange={next => fetchData(next.current, next.pageSize, searchRef.current, dateRangeRef.current, marketingRef.current)}
        />
      </Card>
    </div>
  )
}
