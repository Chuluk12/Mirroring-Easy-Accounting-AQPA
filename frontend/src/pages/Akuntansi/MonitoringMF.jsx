import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert, Button, Card, Col, DatePicker, Input, Row, Select, Space, Statistic, Table, Tag, Typography, message,
} from 'antd'
import { FileExcelOutlined, LineChartOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api, { getApiErrorMessage } from '../../api/client'
import { downloadWorkbookXLS } from '../../utils/exportXls'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text } = Typography
const defaultRange = () => [dayjs().startOf('month'), dayjs()]
const currency = value => Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const EXPORT_COLUMNS = [
  { key: 'no_faktur', label: 'No. Faktur' },
  { key: 'tgl_faktur', label: 'Tanggal Faktur', type: 'date' },
  { key: 'no_pemasok', label: 'No. Pemasok' },
  { key: 'no_barang', label: 'No. Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'harga_satuan', label: 'Harga Kotor Satuan', type: 'currency' },
  { key: 'dpp_mf', label: 'DPP Faktur MF', type: 'currency' },
  { key: 'persentase_mf', label: '% MF', type: 'number' },
  { key: 'nilai_mf', label: 'Nilai MF', type: 'currency' },
  { key: 'status_pembayaran', label: 'Status Pembayaran' },
  { key: 'status_faktur', label: 'Status Faktur' },
  { key: 'status_persediaan', label: 'Status Persediaan' },
  { key: 'no_so', label: 'Compare SO' },
  { key: 'dpp_so', label: 'DPP SO', type: 'currency' },
  { key: 'nilai_mf_expected', label: 'Nilai MF Acuan', type: 'currency' },
  { key: 'selisih_dpp', label: 'Selisih DPP', type: 'currency' },
  { key: 'selisih_mf', label: 'Selisih MF', type: 'currency' },
  { key: 'validasi_harga', label: 'Validasi Harga SO' },
  { key: 'stok_persediaan', label: 'Stok Persediaan', type: 'number' },
  { key: 'marketing', label: 'Nama Marketing' },
]

export default function MonitoringMF() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState({})
  const [loadError, setLoadError] = useState('')
  const [monthlyRows, setMonthlyRows] = useState([])
  const [monthlyTotals, setMonthlyTotals] = useState([])
  const [monthlySummary, setMonthlySummary] = useState({})
  const [monthlyYear, setMonthlyYear] = useState(dayjs().year())
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [range, setRange] = useState(defaultRange)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [marketing, setMarketing] = useState('')
  const [marketingOptions, setMarketingOptions] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 })
  const filtersRef = useRef({ range: defaultRange(), search: '', status: '', marketing: '' })

  const fetchRows = useCallback(async (page = 1, pageSize = 50, filters = filtersRef.current) => {
    setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (filters.search) params.search = filters.search
      if (filters.status) params.status = filters.status
      if (filters.marketing) params.marketing = filters.marketing
      if (filters.range?.[0]) params.date_from = filters.range[0].format('YYYY-MM-DD')
      if (filters.range?.[1]) params.date_to = filters.range[1].format('YYYY-MM-DD')
      const response = await api.get('/api/monitoring-mf', { params })
      setRows(response.data.data || [])
      setSummary(response.data.summary || {})
      setLoadError('')
      setPagination({ current: page, pageSize, total: Number(response.data.total || 0) })
    } catch (error) {
      setLoadError(getApiErrorMessage(error, 'Gagal memuat Monitoring Marketing Fee'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRows() }, [fetchRows])

  useEffect(() => {
    api.get('/api/monitoring-mf/marketing-options')
      .then(response => setMarketingOptions(response.data.data || []))
      .catch(error => message.error(getApiErrorMessage(error, 'Gagal memuat daftar marketing')))
  }, [])

  const fetchMonthly = useCallback(async year => {
    setMonthlyLoading(true)
    try {
      const response = await api.get('/api/monitoring-mf/monthly', { params: { year } })
      setMonthlyRows(response.data.data || [])
      setMonthlyTotals(response.data.monthly || [])
      setMonthlySummary(response.data.summary || {})
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat rekap bulanan Marketing Fee'))
      setMonthlyRows([])
      setMonthlyTotals([])
      setMonthlySummary({})
    } finally {
      setMonthlyLoading(false)
    }
  }, [])

  useEffect(() => { fetchMonthly(monthlyYear) }, [fetchMonthly, monthlyYear])

  const applyFilters = next => {
    filtersRef.current = { ...filtersRef.current, ...next }
    setSearch(filtersRef.current.search)
    setStatus(filtersRef.current.status)
    setMarketing(filtersRef.current.marketing)
    setRange(filtersRef.current.range)
    fetchRows(1, pagination.pageSize, filtersRef.current)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const allRows = []
      for (let offset = 0; offset < pagination.total; offset += 500) {
        const filters = filtersRef.current
        const params = { offset, limit: 500 }
        if (filters.search) params.search = filters.search
        if (filters.status) params.status = filters.status
        if (filters.marketing) params.marketing = filters.marketing
        if (filters.range?.[0]) params.date_from = filters.range[0].format('YYYY-MM-DD')
        if (filters.range?.[1]) params.date_to = filters.range[1].format('YYYY-MM-DD')
        const response = await api.get('/api/monitoring-mf', { params })
        allRows.push(...(response.data.data || []))
      }
      downloadWorkbookXLS([{
        name: 'Monitoring MF',
        columns: filterExportColumnsByPermission('monitoring_mf', EXPORT_COLUMNS, user),
        rows: allRows,
      }], 'MonitoringMarketingFee')
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal mengekspor Monitoring Marketing Fee'))
    } finally {
      setExporting(false)
    }
  }

  const handleMonthlyExport = () => {
    downloadWorkbookXLS([
      {
        name: 'Rekap Pengajuan',
        columns: filterExportColumnsByPermission('monitoring_mf', monthlyColumns, user),
        rows: monthlyRows,
      },
      {
        name: 'Ringkasan Bulanan',
        columns: [
          { key: 'bulan', label: 'Bulan' },
          { key: 'total_pengajuan', label: 'Jumlah Pengajuan', type: 'number' },
          { key: 'jumlah_lunas', label: 'Pengajuan Lunas', type: 'number' },
          { key: 'nilai_lunas', label: 'Nilai Lunas', type: 'currency' },
          { key: 'jumlah_belum_lunas', label: 'Pengajuan Belum Lunas', type: 'number' },
          { key: 'nilai_belum_lunas', label: 'Nilai Belum Lunas', type: 'currency' },
          { key: 'dpp', label: 'DPP', type: 'currency' },
          { key: 'pph21', label: 'PPH 21', type: 'currency' },
          { key: 'total', label: 'TOTAL', type: 'currency' },
          { key: 'grand_total', label: 'GRAND TOTAL', type: 'currency' },
        ],
        rows: monthlyTotals,
      },
    ], `RekapMarketingFee${monthlyYear}`)
  }

  const columns = [
    { title: 'No.', key: 'row_number', width: 65, fixed: 'left', align: 'center', render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1 },
    { title: 'No. Faktur', dataIndex: 'no_faktur', key: 'no_faktur', width: 150, fixed: 'left', render: value => <Text strong>{value || '-'}</Text> },
    { title: 'Tanggal', dataIndex: 'tgl_faktur', key: 'tgl_faktur', width: 110, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'No. Pemasok', dataIndex: 'no_pemasok', key: 'no_pemasok', width: 125 },
    { title: 'No. Barang', dataIndex: 'no_barang', key: 'no_barang', width: 175 },
    { title: 'Deskripsi Barang', dataIndex: 'deskripsi_barang', key: 'deskripsi_barang', width: 260, ellipsis: true },
    { title: 'Harga Kotor Satuan', dataIndex: 'harga_satuan', key: 'harga_satuan', width: 145, align: 'right', render: currency },
    { title: 'DPP Faktur MF', dataIndex: 'dpp_mf', key: 'dpp_mf', width: 140, align: 'right', render: currency },
    { title: '% MF', dataIndex: 'persentase_mf', key: 'persentase_mf', width: 95, align: 'right', render: value => `${Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 })}%` },
    { title: 'Nilai MF', dataIndex: 'nilai_mf', key: 'nilai_mf', width: 135, align: 'right', render: currency },
    { title: 'Status Pembayaran Finance', dataIndex: 'status_pembayaran', key: 'status_pembayaran', width: 205, render: value => <Tag color={value === 'Sudah Dibayar Finance' ? 'green' : 'orange'}>{value}</Tag> },
    { title: 'Status Faktur', dataIndex: 'status_faktur', key: 'status_faktur', width: 125, render: value => <Tag color={value === 'Lunas' ? 'green' : 'orange'}>{value}</Tag> },
    { title: 'Status Persediaan', dataIndex: 'status_persediaan', key: 'status_persediaan', width: 145, render: value => <Tag color={value === 'Dihentikan' ? 'blue' : value === 'Aktif' ? 'green' : 'default'}>{value}</Tag> },
    { title: 'Compare SO', dataIndex: 'no_so', key: 'no_so', width: 145, render: value => value || <Tag color="red">Tidak ditemukan</Tag> },
    { title: 'DPP SO', dataIndex: 'dpp_so', key: 'dpp_so', width: 135, align: 'right', render: currency },
    { title: 'Nilai MF Acuan', dataIndex: 'nilai_mf_expected', key: 'nilai_mf_expected', width: 145, align: 'right', render: currency },
    { title: 'Selisih DPP', dataIndex: 'selisih_dpp', key: 'selisih_dpp', width: 130, align: 'right', render: value => value == null ? '-' : currency(value) },
    { title: 'Selisih MF', dataIndex: 'selisih_mf', key: 'selisih_mf', width: 130, align: 'right', render: value => value == null ? '-' : currency(value) },
    { title: 'Validasi Harga SO', dataIndex: 'validasi_harga', key: 'validasi_harga', width: 150, render: value => <Tag color={value === 'OK' ? 'green' : value === 'Selisih' ? 'red' : 'orange'}>{value}</Tag> },
    { title: 'Stok', dataIndex: 'stok_persediaan', key: 'stok_persediaan', width: 95, align: 'right', render: currency },
    { title: 'Marketing', dataIndex: 'marketing', key: 'marketing', width: 180 },
  ]

  const monthlyColumns = [
    { key: 'bulan', label: 'BULAN' },
    { key: 'no_pengajuan', label: 'NO. PENGAJUAN' },
  { key: 'nama_marketing', label: 'NAMA MARKETING' },
  { key: 'status_rekap', label: 'STATUS PEMBAYARAN' },
    { key: 'bank', label: 'BANK' },
    { key: 'nomor_rekening', label: 'NOMOR REKENING' },
    { key: 'dpp', label: 'DPP', type: 'currency' },
    { key: 'pph21', label: 'PPH 21', type: 'currency' },
    { key: 'total', label: 'TOTAL', type: 'currency' },
    { key: 'grand_total', label: 'GRAND TOTAL', type: 'currency' },
  ]
  const monthlyTableColumns = [
    ...monthlyColumns.map(column => ({
      title: column.label,
      dataIndex: column.key,
      key: column.key,
      width: column.key === 'nama_marketing' ? 240 : column.key === 'no_pengajuan' ? 165 : column.key === 'nomor_rekening' ? 175 : 145,
      align: column.type === 'currency' ? 'right' : 'left',
      render: column.type === 'currency' ? currency : value => value || '-',
    })),
  ]
  const monthlySummaryColumns = [
    { title: 'Bulan', dataIndex: 'bulan', key: 'bulan', width: 150 },
    { title: 'Jumlah Pengajuan', dataIndex: 'total_pengajuan', key: 'total_pengajuan', width: 160, align: 'right' },
    { title: 'Pengajuan Lunas', dataIndex: 'jumlah_lunas', key: 'jumlah_lunas', width: 145, align: 'right' },
    { title: 'Nilai Lunas', dataIndex: 'nilai_lunas', key: 'nilai_lunas', width: 175, align: 'right', render: currency },
    { title: 'Pengajuan Belum Lunas', dataIndex: 'jumlah_belum_lunas', key: 'jumlah_belum_lunas', width: 180, align: 'right' },
    { title: 'Nilai Belum Lunas', dataIndex: 'nilai_belum_lunas', key: 'nilai_belum_lunas', width: 190, align: 'right', render: currency },
    { title: 'DPP', dataIndex: 'dpp', key: 'dpp', width: 180, align: 'right', render: currency },
    { title: 'PPh 21', dataIndex: 'pph21', key: 'pph21', width: 160, align: 'right', render: currency },
    { title: 'Total', dataIndex: 'total', key: 'total', width: 180, align: 'right', render: currency },
    { title: 'Grand Total', dataIndex: 'grand_total', key: 'grand_total', width: 180, align: 'right', render: currency },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title={<span><LineChartOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Monitoring Marketing Fee</span>}
        extra={<Space wrap>
          <RangePicker value={range} format="DD/MM/YYYY" onChange={dates => applyFilters({ range: dates || [null, null] })} placeholder={['Tgl Dari', 'Tgl Sampai']} />
          <Select
            value={marketing}
            onChange={value => applyFilters({ marketing: value })}
            style={{ width: 180 }}
            showSearch
            optionFilterProp="label"
            placeholder="Semua Marketing"
            options={[{ value: '', label: 'Semua Marketing' }, ...marketingOptions]}
          />
          <Select value={status} onChange={value => applyFilters({ status: value })} style={{ width: 145 }} options={[
            { value: '', label: 'Semua Status' },
            { value: 'sudah_dibayar_finance', label: 'Sudah Dibayar Finance' },
            { value: 'belum_dibayar_finance', label: 'Belum Dibayar Finance' },
          ]} />
          <Search placeholder="Cari faktur, SO, barang, pemasok..." allowClear value={search} onChange={event => { setSearch(event.target.value); if (!event.target.value) applyFilters({ search: '' }) }} onSearch={value => applyFilters({ search: value })} style={{ width: 275 }} />
          <Button icon={<ReloadOutlined />} onClick={() => applyFilters({ range: defaultRange(), status: '', search: '', marketing: '' })}>Reset</Button>
          <Button type="primary" icon={<FileExcelOutlined />} onClick={handleExport} loading={exporting}>Export XLS</Button>
        </Space>}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 14, fontSize: 12 }}>
          Faktur AI-MF dari Easy Accounting dicocokkan ke barang MF, Sales Order, harga acuan, dan saldo persediaan.
        </Text>
        {loadError && <Alert type="error" showIcon message="Data Marketing Fee gagal dimuat" description={loadError} style={{ marginBottom: 14 }} />}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}><Statistic title="Total Faktur" value={summary.jumlah_transaksi || 0} /></Col>
          <Col xs={12} md={6}><Statistic title="Total Nilai MF" value={currency(summary.total_nilai_mf)} prefix="Rp" /></Col>
          <Col xs={12} md={6}><Statistic title="Sudah Dibayar Finance" value={summary.jumlah_sudah_dibayar_finance || 0} valueStyle={{ color: '#389e0d' }} /></Col>
          <Col xs={12} md={6}><Statistic title="Belum Dibayar Finance" value={summary.jumlah_belum_dibayar_finance || 0} valueStyle={{ color: '#d46b08' }} /></Col>
        </Row>
        <Table
          rowKey="row_key"
          columns={filterColumnsByPermission('monitoring_mf', columns, user)}
          dataSource={rows}
          loading={loading}
          scroll={{ x: 2500 }}
          pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], showTotal: total => `${total.toLocaleString('id-ID')} baris` }}
          onChange={pager => fetchRows(pager.current, pager.pageSize)}
          locale={{ emptyText: 'Tidak ada data Marketing Fee pada periode ini' }}
          size="small"
        />
      </Card>
      <Card
        title="Rekap Bulanan Marketing Fee"
        extra={<Space wrap>
          <Select
            value={monthlyYear}
            onChange={setMonthlyYear}
            style={{ width: 115 }}
            options={Array.from({ length: Math.max(dayjs().year() - 2025 + 1, 1) }, (_, index) => 2025 + index)
              .reverse().map(year => ({ value: year, label: String(year) }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => fetchMonthly(monthlyYear)}>Muat Ulang</Button>
          <Button type="primary" icon={<FileExcelOutlined />} onClick={handleMonthlyExport} disabled={!monthlyRows.length}>Export Rekap</Button>
        </Space>}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 14, fontSize: 12 }}>
          Rekap mencakup semua faktur AI-MF non-DP. Status lunas berarti faktur sudah lunas dan seluruh barang MF dihentikan; nilai lunas/belum lunas memakai nilai bersih setelah PPh 21. Data bank dan rekening diambil dari master pegawai jika nama marketing cocok.
        </Text>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={4}><Statistic title="Jumlah Pengajuan" value={monthlySummary.total_pengajuan || 0} /></Col>
          <Col xs={12} md={5}><Statistic title="DPP" value={currency(monthlySummary.dpp)} prefix="Rp" /></Col>
          <Col xs={12} md={5}><Statistic title="PPh 21" value={currency(monthlySummary.pph21)} prefix="Rp" /></Col>
          <Col xs={12} md={5}><Statistic title="Total Bersih" value={currency(monthlySummary.total)} prefix="Rp" /></Col>
          <Col xs={12} md={5}><Statistic title="Grand Total" value={currency(monthlySummary.grand_total)} prefix="Rp" /></Col>
        </Row>
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={12}><Statistic title="Pengajuan Lunas (Tahun Ini)" value={monthlySummary.jumlah_lunas || 0} valueStyle={{ color: '#389e0d' }} /></Col>
          <Col xs={12} md={12}><Statistic title="Pengajuan Belum Lunas (Tahun Ini)" value={monthlySummary.jumlah_belum_lunas || 0} valueStyle={{ color: '#d46b08' }} /></Col>
        </Row>
        <Table
          rowKey="bulan"
          columns={filterColumnsByPermission('monitoring_mf', monthlySummaryColumns, user)}
          dataSource={monthlyTotals}
          loading={monthlyLoading}
          pagination={false}
          size="small"
          scroll={{ x: 1000 }}
        />
        <Table
          rowKey="row_key"
          columns={filterColumnsByPermission('monitoring_mf', monthlyTableColumns, user)}
          dataSource={monthlyRows}
          loading={monthlyLoading}
          pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], showTotal: total => `${total.toLocaleString('id-ID')} pengajuan` }}
          size="small"
          scroll={{ x: 1350 }}
          style={{ marginTop: 16 }}
        />
      </Card>
    </Space>
  )
}
