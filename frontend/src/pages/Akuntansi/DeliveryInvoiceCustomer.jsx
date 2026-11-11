import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, DatePicker, Input, Select, Space, Table, Tag, Typography, message } from 'antd'
import { FileExcelOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api, { getApiErrorMessage } from '../../api/client'
import { downloadWorkbookXLS } from '../../utils/exportXls'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text } = Typography
const dateRange = () => [dayjs('2025-01-01'), dayjs()]
const money = value => `Rp ${Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}`

const exportColumns = [
  ['marketing', 'Marketing'], ['no_do', 'No DO'], ['no_so', 'No SO'], ['no_pelanggan', 'Cust No.'],
  ['nama_pelanggan', 'Customer'], ['no_po', 'PO No.'], ['no_invoice', 'Invoice No.'],
  ['tgl_invoice', 'Invoice Date', 'date'], ['sub_total', 'Sub Total', 'currency'],
  ['vat', 'VAT', 'currency'], ['balances', 'Balances', 'currency'], ['delivery', 'Delivery'],
  ['delivery_date', 'Delivery Date', 'date'], ['syarat_pembayaran', 'Syarat Pembayaran'],
  ['vat_no', 'VAT No.'], ['no_fp_std', 'No. FP Std.'], ['remark', 'Remark'],
  ['pic', 'PIC'], ['telepon', 'Telp.'], ['email', 'Email'], ['paid', 'Paid', 'currency'],
  ['paid_date', 'Paid Date', 'date'], ['no_form_pembayaran', 'No. Form Pembayaran Terakhir'],
  ['tgl_cek_pembayaran', 'Tgl Cek Pembayaran Terakhir'],
].map(([key, label, type]) => ({ key, label, type }))

export default function DeliveryInvoiceCustomer() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [marketing, setMarketing] = useState('')
  const [options, setOptions] = useState([])
  const [range, setRange] = useState(dateRange)
  const filters = useRef({ search: '', marketing: '', range: dateRange() })
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })

  const fetchRows = useCallback(async (page = 1, pageSize = 20, active = filters.current) => {
    setLoading(true)
    setError('')
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (active.search) params.search = active.search
      if (active.marketing) params.marketing = active.marketing
      if (active.range?.[0]) params.date_from = active.range[0].format('YYYY-MM-DD')
      if (active.range?.[1]) params.date_to = active.range[1].format('YYYY-MM-DD')
      const response = await api.get('/api/delivery-invoice-customer', { params })
      setRows(response.data.data || [])
      setOptions(response.data.marketing_options || [])
      setPagination({ current: page, pageSize, total: Number(response.data.total || 0) })
    } catch (e) {
      const detail = getApiErrorMessage(e, 'Gagal memuat Delivery Invoice TO Customer')
      setError(detail)
      message.error(detail)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRows() }, [fetchRows])

  const applyFilters = next => {
    filters.current = { ...filters.current, ...next }
    setSearch(filters.current.search)
    setMarketing(filters.current.marketing)
    setRange(filters.current.range)
    fetchRows(1, pagination.pageSize, filters.current)
  }

  const handleExport = async () => {
    setExporting(true)
    const exportMessageKey = 'delivery-invoice-export'
    message.loading({ content: 'Mengambil seluruh data untuk Excel...', key: exportMessageKey, duration: 0 })
    try {
      const allRows = []
      const active = filters.current
      const params = { offset: 0, limit: 500 }
      if (active.search) params.search = active.search
      if (active.marketing) params.marketing = active.marketing
      if (active.range?.[0]) params.date_from = active.range[0].format('YYYY-MM-DD')
      if (active.range?.[1]) params.date_to = active.range[1].format('YYYY-MM-DD')

      const firstResponse = await api.get('/api/delivery-invoice-customer', { params })
      const total = Number(firstResponse.data.total || 0)
      allRows.push(...(firstResponse.data.data || []))
      for (let offset = allRows.length; offset < total; offset += 500) {
        const params = { offset, limit: 500 }
        if (active.search) params.search = active.search
        if (active.marketing) params.marketing = active.marketing
        if (active.range?.[0]) params.date_from = active.range[0].format('YYYY-MM-DD')
        if (active.range?.[1]) params.date_to = active.range[1].format('YYYY-MM-DD')
        const response = await api.get('/api/delivery-invoice-customer', { params })
        allRows.push(...(response.data.data || []))
      }
      if (!allRows.length) {
        message.info({ content: 'Tidak ada data untuk diekspor pada filter ini.', key: exportMessageKey })
        return
      }
      downloadWorkbookXLS([{ name: 'Delivery Invoice', columns: exportColumns, rows: allRows }], 'DeliveryInvoiceToCustomer')
      message.success({ content: `${allRows.length.toLocaleString('id-ID')} baris berhasil disiapkan ke Excel.`, key: exportMessageKey })
    } catch (e) {
      message.error({ content: getApiErrorMessage(e, 'Gagal mengekspor Delivery Invoice'), key: exportMessageKey })
    } finally {
      setExporting(false)
    }
  }

  const columns = exportColumns.map(column => ({
    title: column.label,
    dataIndex: column.key,
    key: column.key,
    width: column.type === 'currency' ? 145 : column.key === 'nama_pelanggan' ? 240 : 155,
    align: column.type === 'currency' ? 'right' : 'left',
    render: value => {
      if (column.type === 'currency') return money(value)
      if (column.type === 'date') return value ? dayjs(value).format('DD/MM/YYYY') : '-'
      if (column.key === 'delivery') return value ? <Tag color={String(value).toUpperCase().startsWith('AI-DO-') ? 'blue' : 'cyan'}>{value}</Tag> : '-'
      if (column.key === 'paid') return Number(value) > 0 ? <Text type="success">{money(value)}</Text> : <Text type="secondary">-</Text>
      return value || '-'
    },
  }))

  return (
    <Card
      title="Delivery Invoice TO Customer"
      extra={<Space wrap>
        <RangePicker value={range} format="DD/MM/YYYY" onChange={value => applyFilters({ range: value || [null, null] })} />
        <Select
          value={marketing || undefined}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Semua Marketing"
          style={{ width: 190 }}
          options={options.map(value => ({ value, label: value }))}
          onChange={value => applyFilters({ marketing: value || '' })}
        />
        <Search
          placeholder="Faktur, PO, customer, DO..."
          allowClear
          value={search}
          onChange={event => { setSearch(event.target.value); if (!event.target.value) applyFilters({ search: '' }) }}
          onSearch={value => applyFilters({ search: value })}
          style={{ width: 245 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => applyFilters({ range: dateRange(), search: '', marketing: '' })}>Reset</Button>
        <Button type="primary" icon={<FileExcelOutlined />} onClick={handleExport} loading={exporting}>Export XLS</Button>
      </Space>}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Invoice penjualan yang dibuat dari Delivery Order, dengan status pembayaran dan informasi pengiriman.
      </Text>
      {error && <Alert type="error" showIcon message="Data Delivery Invoice gagal dimuat" description={error} style={{ marginBottom: 12 }} />}
      <Table
      rowKey="no_invoice"
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="small"
        scroll={{ x: 2500, y: 'calc(100vh - 310px)' }}
        pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], showTotal: total => `${total.toLocaleString('id-ID')} faktur` }}
        onChange={pager => fetchRows(pager.current, pager.pageSize)}
        locale={{ emptyText: 'Tidak ada Delivery Invoice pada periode ini' }}
      />
    </Card>
  )
}
