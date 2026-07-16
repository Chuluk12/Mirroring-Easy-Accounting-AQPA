import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, Card, Col, DatePicker, Input, message, Popover, Row, Select, Space,
  Statistic, Table, Tag, Typography,
} from 'antd'
import {
  FileExcelOutlined, LineChartOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api, { getApiErrorMessage } from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text, Title } = Typography
const DEFAULT_PAGE_SIZE = 50
const PROFIT_LOSS_TIMEOUT = 600000
const EXPORT_POLL_INTERVAL = 2000
const EXPORT_POLL_TIMEOUT = 30 * 60 * 1000

const defaultProfitLossRange = () => [dayjs().startOf('month'), dayjs()]

const dateParam = date => (date?.isValid?.() ? date.format('YYYY-MM-DD') : '')
const periodToDateRange = period => {
  if (!period) return null
  const from = period.date_from ? dayjs(period.date_from) : null
  const to = period.date_to ? dayjs(period.date_to) : null
  return [
    from?.isValid?.() ? from : null,
    to?.isValid?.() ? to : null,
  ]
}
const formatPeriod = dates => {
  const from = dateParam(dates?.[0])
  const to = dateParam(dates?.[1])
  if (from && to) return `${dates[0].format('DD/MM/YYYY')} - ${dates[1].format('DD/MM/YYYY')}`
  if (from) return `Mulai ${dates[0].format('DD/MM/YYYY')}`
  if (to) return `Sampai ${dates[1].format('DD/MM/YYYY')}`
  return 'Semua tanggal'
}

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

const extractProjectReferences = (...values) => {
  const seen = new Set()
  const refs = []
  values.forEach(value => {
    String(value || '').match(/\bAI-PP-\d+\b/gi)?.forEach(match => {
      const ref = match.toUpperCase()
      if (!seen.has(ref)) {
        seen.add(ref)
        refs.push(ref)
      }
    })
  })
  return refs
}

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

function ProjectCostReferenceCell({ value, details = [], record }) {
  const color = '#d46b08'
  const [lookupDetails, setLookupDetails] = useState([])
  const [lookupLoading, setLookupLoading] = useState(false)
  const label = <Text style={{ color }}>{formatCurrency(value)}</Text>
  if (!Number(value || 0)) return label
  const visibleDetails = details.length ? details : lookupDetails

  const lookupProjectReference = async open => {
    if (!open || details.length || lookupDetails.length || lookupLoading) return
    const noSo = String(record?.no_so || '').trim().toUpperCase()
    if (!noSo) return

    setLookupLoading(true)
    try {
      const response = await api.get('/api/project', {
        params: {
          search: noSo,
          project_type: 'mkt',
          status: 'active',
          offset: 0,
          limit: 20,
        },
      })
      const matched = (response.data.data || [])
        .map(project => {
          const refs = extractProjectReferences(
            project.no_project,
            project.nama_project,
            project.deskripsi,
            project.remarks,
          )
          if (!refs.includes(noSo)) return null
          const referenceCount = refs.length || 1
          const realisasi = Number(project.realisasi || 0)
          return {
            referensi: noSo,
            no_project: project.no_project,
            nama_project: project.nama_project,
            nama_kontak: project.nama_kontak,
            realisasi_project: realisasi,
            jumlah_referensi_project: referenceCount,
            nilai_referensi: realisasi / referenceCount,
            basis_alokasi: 'Referensi dari Daftar Project',
            jumlah_baris: Number(record?.jumlah || 0),
            total_jumlah_referensi: null,
            nilai_alokasi: Number(value || 0),
          }
        })
        .filter(Boolean)
      setLookupDetails(matched)
    } catch {
      setLookupDetails([])
    } finally {
      setLookupLoading(false)
    }
  }

  const content = (
    <div style={{ width: 460, maxHeight: 360, overflowY: 'auto' }}>
      {visibleDetails.length ? visibleDetails.map((detail, index) => (
          <div
            key={`${detail.no_project || 'project'}-${detail.referensi || 'ref'}-${index}`}
            style={{ padding: '8px 0', borderBottom: index < visibleDetails.length - 1 ? '1px solid #f0f0f0' : 0 }}
          >
            <div>
              <Text type="secondary">Project: </Text>
              <Text strong code>{detail.no_project || '-'}</Text>
            </div>
            <Space size={6} wrap>
              <Tag color="orange" style={{ margin: 0 }}>{detail.referensi || '-'}</Tag>
              <Text type="secondary">{detail.basis_alokasi || '-'}</Text>
            </Space>
            <div><Text type="secondary">Nama: </Text><Text>{detail.nama_project || '-'}</Text></div>
            <div><Text type="secondary">Kontak: </Text><Text>{detail.nama_kontak || '-'}</Text></div>
            <div>
              <Text type="secondary">Realisasi project: </Text>
              <Text>{formatCurrency(detail.realisasi_project)}</Text>
            </div>
            <div>
              <Text type="secondary">Nilai referensi: </Text>
              <Text>{formatCurrency(detail.nilai_referensi)}</Text>
              <Text type="secondary"> dari {detail.jumlah_referensi_project || 1} referensi</Text>
            </div>
            <div>
              <Text type="secondary">Jumlah baris: </Text>
              <Text>{formatCurrency(detail.jumlah_baris)}</Text>
            </div>
            <div>
              <Text type="secondary">Total basis: </Text>
              <Text>{detail.total_jumlah_referensi === null || detail.total_jumlah_referensi === undefined ? '-' : formatCurrency(detail.total_jumlah_referensi)}</Text>
            </div>
            <div>
              <Text type="secondary">Alokasi baris: </Text>
              <Text strong>{formatCurrency(detail.nilai_alokasi)}</Text>
            </div>
          </div>
        )) : lookupLoading ? (
          <Text type="secondary">Mencari referensi project...</Text>
        ) : (
          <Text type="secondary">Tidak ditemukan project aktif yang mereferensikan SO ini.</Text>
        )}
    </div>
  )

  return (
    <Popover title="Rincian Biaya Project" content={content} trigger="click" placement="left" onOpenChange={lookupProjectReference}>
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
  { key: 'harga_satuan', label: 'Harga Satuan', type: 'currency' },
  { key: 'jumlah', label: 'Jumlah', type: 'currency' },
  { key: 'nilai_hpp', label: 'Nilai HPP', type: 'currency' },
  { key: 'gross_profit', label: 'Gross Profit', type: 'currency' },
  { key: 'delivery', label: 'Delivery Purch', type: 'currency' },
  { key: 'delivery_ju', label: 'Delivery JU', type: 'currency' },
  { key: 'cf', label: 'CF', type: 'currency' },
  { key: 'cf_pct', label: 'CF %', type: 'number' },
  { key: 'mf', label: 'MF', type: 'currency' },
  { key: 'mf_pct', label: 'MF %', type: 'number' },
  { key: 'biaya_project', label: 'Biaya Project', type: 'currency' },
  { key: 'total_biaya', label: 'Total Biaya', type: 'currency' },
  { key: 'laba_operasi', label: 'Laba Operasi', type: 'currency' },
  { key: 'margin_pct', label: '%', type: 'number' },
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
  const [marketing, setMarketing] = useState('')
  const [marketingOptions, setMarketingOptions] = useState([])
  const [dateRange, setDateRange] = useState(defaultProfitLossRange)
  const [activeDateRange, setActiveDateRange] = useState(defaultProfitLossRange)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
  })
  const searchRef = useRef('')
  const marketingRef = useRef('')
  const dateRangeRef = useRef(defaultProfitLossRange())

  const fetchData = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE, searchValue = '', dates = defaultProfitLossRange(), marketingValue = '') => {
    setLoading(true)
    try {
      const params = {
        offset: (page - 1) * pageSize,
        limit: pageSize,
      }
      if (searchValue) params.search = searchValue
      if (marketingValue) params.marketing = marketingValue
      if (dateParam(dates?.[0])) params.date_from = dateParam(dates[0])
      if (dateParam(dates?.[1])) params.date_to = dateParam(dates[1])
      const response = await api.get('/api/profit-loss', { params, timeout: PROFIT_LOSS_TIMEOUT })
      setData(response.data.data || [])
      setSummary({ ...emptySummary, ...(response.data.summary || {}) })
      setMarketingOptions(response.data.marketing_options || [])
      setPagination({ current: page, pageSize, total: response.data.total || 0 })
      const effectiveRange = periodToDateRange(response.data.period) || dates || [null, null]
      setActiveDateRange(effectiveRange)
      if (!dateParam(dates?.[0]) || !dateParam(dates?.[1])) {
        dateRangeRef.current = effectiveRange
        setDateRange(effectiveRange)
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat Profit & Loss'))
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
    setDateRange(nextDates)
  }

  const applyDateFilter = () => {
    dateRangeRef.current = dateRange
    fetchData(1, pagination.pageSize, searchRef.current, dateRange, marketingRef.current)
  }

  const handleMarketing = value => {
    const nextMarketing = value || ''
    marketingRef.current = nextMarketing
    setMarketing(nextMarketing)
    fetchData(1, pagination.pageSize, searchRef.current, dateRangeRef.current, nextMarketing)
  }

  const handleReset = () => {
    const dates = defaultProfitLossRange()
    searchRef.current = ''
    marketingRef.current = ''
    dateRangeRef.current = dates
    setSearch('')
    setMarketing('')
    setDateRange(dates)
    setActiveDateRange(dates)
    fetchData(1, DEFAULT_PAGE_SIZE, '', dates, '')
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (marketingRef.current) params.marketing = marketingRef.current
      if (dateParam(dateRangeRef.current?.[0])) params.date_from = dateParam(dateRangeRef.current[0])
      if (dateParam(dateRangeRef.current?.[1])) params.date_to = dateParam(dateRangeRef.current[1])
      const started = await api.post('/api/profit-loss/export/start', params)
      const jobId = started.data?.job_id
      if (!jobId) throw new Error('Server tidak memberikan ID proses export')

      const startedAt = Date.now()
      while (Date.now() - startedAt < EXPORT_POLL_TIMEOUT) {
        await new Promise(resolve => setTimeout(resolve, EXPORT_POLL_INTERVAL))
        const response = await api.get(`/api/profit-loss/export/status/${jobId}`)
        if (response.data?.status === 'completed') return response.data.data || []
        if (response.data?.status === 'failed') {
          throw new Error(response.data.error || 'Proses export gagal di server')
        }
      }
      throw new Error('Proses export melewati batas waktu 30 menit')
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
      render: (value, record) => (
        <ProjectCostReferenceCell value={value} details={record.biaya_project_details} record={record} />
      ),
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
      <Space size={8} wrap>
        <Text type="secondary">Gross Profit dihitung dari Jumlah penjualan dikurangi Nilai HPP jurnal.</Text>
        <Tag color="blue">Periode aktif: {formatPeriod(activeDateRange)}</Tag>
      </Space>

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
            <RangePicker
              value={dateRange}
              onChange={handleDate}
              format="DD/MM/YYYY"
              allowClear
              style={{ width: 245 }}
            />
            <Button type="primary" onClick={applyDateFilter} loading={loading}>Terapkan</Button>
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
