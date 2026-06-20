import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Table, Input, Card, DatePicker, Space, Tag, Tooltip, Modal,
  Statistic, Row, Col, Typography, Button, message, Select
} from 'antd'
import {
  FileExcelOutlined, SearchOutlined, ReloadOutlined, ShoppingCartOutlined,
  FileDoneOutlined, LoadingOutlined
} from '@ant-design/icons'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import DocumentDetailDrawer from '../../components/DocumentDetailDrawer'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import dayjs from 'dayjs'

const { Search } = Input
const { RangePicker } = DatePicker
const { Text } = Typography

const formatRp  = val => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0)
const formatQty = val => parseFloat(val || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })
const getPurchaseGrandTotal = rows => {
  const headerTotals = new Map()
  const lineTotal = rows.reduce((sum, row) => (
    sum + Number(row.amount || 0) - Number(row.diskon || 0) + Number(row.ppn_amount || 0)
  ), 0)

  rows.forEach((row, index) => {
    const key = row.no_pembelian || `row-${index}`
    if (headerTotals.has(key)) return
    headerTotals.set(key, Number(row.pph || 0) + Number(row.add_cost || 0))
  })

  return lineTotal + [...headerTotals.values()].reduce((sum, value) => sum + value, 0)
}
const buildPurchaseSummary = rows => {
  const poMap = new Map()
  const easyTotalMap = new Map()
  rows.forEach((row, index) => {
    const poNo = String(row.no_pembelian || '').trim()
    if (!poNo) return
    if (!poMap.has(poNo)) poMap.set(poNo, { total: 0, received: 0 })
    if (!easyTotalMap.has(poNo)) easyTotalMap.set(poNo, Number(row.total_easy ?? row.amount ?? 0))
    const item = poMap.get(poNo)
    item.total += 1
    if (String(row.no_penerimaan_barang || '').trim()) item.received += 1
  })

  const poStatus = { menunggu: 0, diproses: 0, diterima: 0 }
  poMap.forEach(item => {
    if (item.received <= 0) poStatus.menunggu += 1
    else if (item.received >= item.total) poStatus.diterima += 1
    else poStatus.diproses += 1
  })

  const totalItems = rows.length
  const receivedItems = rows.filter(row => String(row.no_penerimaan_barang || '').trim()).length
  const pendingItems = Math.max(totalItems - receivedItems, 0)

  return {
    po: { total: poMap.size, ...poStatus },
    items: { total: totalItems, belum: pendingItems, diterima: receivedItems },
    grossAmount: [...easyTotalMap.values()].reduce((sum, value) => sum + Number(value || 0), 0),
    discountAmount: rows.reduce((sum, row) => sum + Number(row.diskon || 0), 0),
    amount: getPurchaseGrandTotal(rows),
  }
}
const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]
const getDateAlert = value => {
  if (!value) return null
  const diff = dayjs(value).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (diff < 0) return { color: 'red', label: 'Lewat' }
  if (diff === 0) return { color: 'red', label: 'Hari ini' }
  if (diff <= 3) return { color: 'red', label: `H-${diff}` }
  return null
}
const getDaysRemaining = value => {
  if (!value) return null
  return dayjs(value).startOf('day').diff(dayjs().startOf('day'), 'day')
}
const renderDaysRemaining = value => {
  const diff = getDaysRemaining(value)
  if (diff === null || Number.isNaN(diff)) return '-'
  if (diff < 0) return <Tag color="red">Lewat {Math.abs(diff)} hari</Tag>
  if (diff === 0) return <Tag color="red">Hari ini</Tag>
  if (diff <= 3) return <Tag color="volcano">{diff} hari</Tag>
  return <Tag color="green">{diff} hari</Tag>
}
const getPbDelayDays = record => {
  if (!record?.tgl_ekspetasi || !record?.tgl_penerimaan_barang) return null
  return dayjs(record.tgl_penerimaan_barang).startOf('day').diff(dayjs(record.tgl_ekspetasi).startOf('day'), 'day')
}
const formatPbDelayText = record => {
  const diff = getPbDelayDays(record)
  if (diff === null || Number.isNaN(diff)) return ''
  if (diff > 0) return `Telat ${diff} hari`
  if (diff === 0) return 'Tepat waktu'
  return `Lebih cepat ${Math.abs(diff)} hari`
}
const renderPbDelay = record => {
  const diff = getPbDelayDays(record)
  if (diff === null || Number.isNaN(diff)) return <Text type="secondary">Belum PB</Text>
  if (diff > 0) return <Tag color="red">Telat {diff} hari</Tag>
  if (diff === 0) return <Tag color="green">Tepat waktu</Tag>
  return <Tag color="blue">Cepat {Math.abs(diff)} hari</Tag>
}
const needsPurchaseRequest = record => {
  const stock = Number(record?.stok_tersedia_so ?? 0)
  const qtyOrder = Number(record?.qty_order_so ?? record?.qty_so ?? 0)
  return stock <= 0 || (qtyOrder > 0 && stock < qtyOrder)
}
const formatPurchaseRequestNo = record => {
  const value = String(record?.no_permintaan || '').trim()
  if (value) return value
  return needsPurchaseRequest(record) ? 'Belum PR' : ''
}
const renderPurchaseRequestNo = record => {
  const value = String(record?.no_permintaan || '').trim()
  if (value) return <Tag color="cyan">{value}</Tag>
  if (!needsPurchaseRequest(record)) return '-'
  return (
    <Tooltip title="Stok tersedia kurang dari qty order, harus naik Permintaan Pembelian.">
      <Tag color="red">Belum PR</Tag>
    </Tooltip>
  )
}
const renderDateTag = (value, color = 'blue', alertEnabled = false) => {
  if (!value) return '-'
  const alert = alertEnabled ? getDateAlert(value) : null
  const formatted = dayjs(value).format('DD/MM/YYYY')
  if (!alert) return <Tag color={color}>{formatted}</Tag>
  return (
    <Tooltip title={`Perlu perhatian: ${alert.label}`}>
      <Tag color={alert.color}>{formatted} · {alert.label}</Tag>
    </Tooltip>
  )
}
const splitSoNo = value => String(value || '')
  .split(/\s*(?:,|;|&|\n)\s*/g)
  .map(item => item.trim())
  .filter(Boolean)

function SoNoCell({ value }) {
  const items = splitSoNo(value)
  if (!items.length) return <Text type="secondary">-</Text>
  const visible = items.slice(0, 2)
  const hidden = items.slice(2)
  const chipStyle = {
    maxWidth: 92,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginInlineEnd: 0,
  }
  const content = (
    <Space size={[4, 4]} wrap style={{ maxWidth: 260 }}>
      {items.map(item => (
        <Tag key={item} color={item.toUpperCase().includes('INTERNAL') ? 'purple' : 'blue'} style={chipStyle}>
          {item}
        </Tag>
      ))}
    </Space>
  )
  return (
    <Tooltip title={content} color="#fff" overlayInnerStyle={{ color: '#20243a' }}>
      <Space size={[4, 4]} wrap style={{ maxWidth: 220, rowGap: 4 }}>
        {visible.map(item => (
          <Tag key={item} color={item.toUpperCase().includes('INTERNAL') ? 'purple' : 'blue'} style={chipStyle}>
            {item}
          </Tag>
        ))}
        {hidden.length > 0 && <Tag style={{ marginInlineEnd: 0 }}>+{hidden.length}</Tag>}
      </Space>
    </Tooltip>
  )
}

function EditableNoteCell({ record, field = 'note_pesanan', apiPath = '/api/liw-pur-mkt/note', placeholder = 'Isi note', onSave }) {
  const [value, setValue] = useState(record[field] || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(record[field] || '')
  }, [record, field])

  const save = async () => {
    const nextValue = value.trim()
    if (nextValue === (record[field] || '')) return
    setSaving(true)
    try {
      await api.post(apiPath, {
        no_permintaan: record.no_permintaan || '',
        so_no: record.so_no || '',
        no_pembelian: record.no_pembelian || '',
        no_barang: record.no_barang || '',
        note: nextValue,
      })
      onSave(record, field, nextValue)
      message.success('Note tersimpan')
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal menyimpan note')
      setValue(record[field] || '')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Input
      size="small"
      value={value}
      maxLength={500}
      placeholder={placeholder}
      disabled={saving}
      onClick={event => event.stopPropagation()}
      onChange={event => setValue(event.target.value)}
      onBlur={save}
      onPressEnter={event => {
        event.preventDefault()
        event.currentTarget.blur()
      }}
    />
  )
}

const PEMBELIAN_EXPORT_COLS = [
  { key: 'no', label: 'No', type: 'number' },
  { key: 'no_pembelian', label: 'No. Pembelian' },
  { key: 'tgl_pembelian', label: 'Tgl Pembelian', type: 'date' },
  { key: 'tgl_ekspetasi', label: 'Tgl Ekspetasi', type: 'date' },
  { key: 'top', label: 'TOP' },
  { key: 'sisa_hari_ekspetasi', label: 'Sisa Hari Ekspetasi', type: 'number' },
  { key: 'tgl_ekspetasi_vs_tgl_pb', label: 'Tgl Ekspetasi Vs Tgl PB' },
  { key: 'no_permintaan', label: 'No. Permintaan' },
  { key: 'tgl_permintaan', label: 'Tgl Permintaan', type: 'date' },
  { key: 'tgl_target_permintaan', label: 'Tgl Target', type: 'date' },
  { key: 'so_no', label: 'SO NO' },
  { key: 'no_pemasok', label: 'No. Pemasok' },
  { key: 'nama_pemasok', label: 'Nama Pemasok' },
  { key: 'purchaser', label: 'Purchaser' },
  { key: 'no_barang', label: 'No. Barang' },
  { key: 'deskripsi_barang', label: 'Deskripsi Barang' },
  { key: 'qty', label: 'Qty', type: 'number' },
  { key: 'uom', label: 'UoM' },
  { key: 'price', label: 'Harga Satuan', type: 'number' },
  { key: 'diskon', label: 'Diskon', type: 'number' },
  { key: 'ppn_kode', label: 'PPN' },
  { key: 'ppn_amount', label: 'Nominal PPN', type: 'number' },
  { key: 'pph', label: 'PPH', type: 'number' },
  { key: 'add_cost', label: 'Add Cost', type: 'number' },
  { key: 'dpp', label: 'DPP Setelah Diskon', type: 'number' },
  { key: 'amount', label: 'Amount', type: 'number' },
  { key: 'nilai_po', label: 'Nilai PO', type: 'number' },
  { key: 'uang_muka', label: 'Uang Muka', type: 'number' },
  { key: 'sisa_po', label: 'Sisa PO', type: 'number' },
  { key: 'status_pembayaran', label: 'Status Bayar' },
]

export default function DaftarPembelian({
  title = 'Daftar Pembelian',
  apiPath = '/api/pembelian',
  exportApiPath = '/api/pembelian/export',
  permissionModule = 'pembelian',
  filename = 'DaftarPembelian',
  sheetName = 'Daftar Pembelian',
  excludeInternalSo = false,
  showSummary = true,
  showSalesReferenceFields = false,
  hiddenColumnKeys = [],
  useLiwColumnOrder = false,
}) {
  const [data, setData]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [poType, setPoType]       = useState('')
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [summary, setSummary]     = useState({
    po: { total: 0, menunggu: 0, diproses: 0, diterima: 0 },
    items: { total: 0, belum: 0, diterima: 0 },
    grossAmount: 0,
    discountAmount: 0,
    amount: 0,
  })
  const [liwSummary, setLiwSummary] = useState({
    so_count: 0,
    do_count: 0,
    po_count: 0,
    pb_count: 0,
    so_due_soon: 0,
    po_due_soon: 0,
  })
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected]   = useState(null)
  const [stockHistoryOpen, setStockHistoryOpen] = useState(false)
  const [stockHistoryLoading, setStockHistoryLoading] = useState(false)
  const [stockHistoryRecord, setStockHistoryRecord] = useState(null)
  const [stockHistoryRows, setStockHistoryRows] = useState([])
  const [stockHistorySummary, setStockHistorySummary] = useState({ qty_total: 0, qty_future: 0 })
  const [stockHistoryDateRange, setStockHistoryDateRange] = useState(getCurrentMonthRange)
  const { user } = useAuth()
  const pageRef = useRef(1)
  const pageSizeRef = useRef(20)
  const searchRef = useRef('')
  const poTypeRef = useRef('')
  const dateRangeRef = useRef(getCurrentMonthRange())

  const fetchPurchaseSummary = useCallback(async (searchVal = '', dates = [null, null], poTypeVal = '') => {
    if (!showSummary || useLiwColumnOrder) return
    setSummaryLoading(true)
    try {
      const params = { summary_only: 1, include_payment: 0 }
      if (excludeInternalSo) params.exclude_internal_so = 1
      if (searchVal) params.search = searchVal
      if (poTypeVal) params.po_type = poTypeVal
      if (dates[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates[1]) params.date_to = dates[1].format('YYYY-MM-DD')
      const res = await api.get(apiPath, { params })
      setSummary(res.data.summary || buildPurchaseSummary(res.data.data || []))
    } catch (error) {
      console.error(error)
    } finally {
      setSummaryLoading(false)
    }
  }, [apiPath, excludeInternalSo, showSummary, useLiwColumnOrder])

  const buildLiwSummary = useCallback(rows => {
    const uniq = (values) => new Set(values.filter(Boolean)).size
    const splitDocs = value => String(value || '')
      .split(/\s*(?:,|;|&|\n)\s*/g)
      .map(item => item.trim())
      .filter(Boolean)
    const isDueSoon = value => {
      if (!value) return false
      const diff = dayjs(value).startOf('day').diff(dayjs().startOf('day'), 'day')
      return diff >= 1 && diff <= 3
    }

    return {
      so_count: uniq(rows.flatMap(row => splitDocs(row.so_no))),
      do_count: uniq(rows.flatMap(row => splitDocs(row.no_pengiriman_so))),
      po_count: uniq(rows.map(row => String(row.no_pembelian || '').trim())),
      pb_count: uniq(rows.flatMap(row => splitDocs(row.no_penerimaan_barang))),
      so_due_soon: uniq(rows.filter(row => isDueSoon(row.est_kirim_so)).flatMap(row => splitDocs(row.so_no))),
      po_due_soon: uniq(rows.filter(row => isDueSoon(row.tgl_ekspetasi)).map(row => String(row.no_pembelian || '').trim())),
    }
  }, [])

  const fetchLiwSummary = useCallback(async (searchVal = '', dates = [null, null], poTypeVal = '') => {
    if (!useLiwColumnOrder) return
    setSummaryLoading(true)
    try {
      const params = {}
      if (excludeInternalSo) params.exclude_internal_so = 1
      if (searchVal) params.search = searchVal
      if (poTypeVal) params.po_type = poTypeVal
      if (dates[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates[1]) params.date_to = dates[1].format('YYYY-MM-DD')
      const res = await api.get(exportApiPath, { params })
      const exportRows = res.data.data || []
      if (exportRows.length > 0) {
        setLiwSummary(buildLiwSummary(exportRows))
        return
      }

      const fallbackRes = await api.get(apiPath, {
        params: { ...params, offset: 0, limit: 5000, include_payment: 0 },
      })
      setLiwSummary(buildLiwSummary(fallbackRes.data.data || []))
    } catch (error) {
      console.error(error)
      try {
        const params = { offset: 0, limit: 5000, include_payment: 0 }
        if (excludeInternalSo) params.exclude_internal_so = 1
        if (searchVal) params.search = searchVal
        if (poTypeVal) params.po_type = poTypeVal
        if (dates[0]) params.date_from = dates[0].format('YYYY-MM-DD')
        if (dates[1]) params.date_to = dates[1].format('YYYY-MM-DD')
        const fallbackRes = await api.get(apiPath, { params })
        setLiwSummary(buildLiwSummary(fallbackRes.data.data || []))
      } catch (fallbackError) {
        console.error(fallbackError)
        setLiwSummary({ so_count: 0, do_count: 0, po_count: 0, pb_count: 0, so_due_soon: 0, po_due_soon: 0 })
      }
    } finally {
      setSummaryLoading(false)
    }
  }, [apiPath, buildLiwSummary, excludeInternalSo, exportApiPath, useLiwColumnOrder])

  const fetchData = useCallback(async (page = 1, pageSize = 20, searchVal = '', dates = [null, null], showLoading = true, poTypeVal = poTypeRef.current) => {
    if (showLoading) setLoading(true)
    try {
      pageRef.current = page
      pageSizeRef.current = pageSize
      searchRef.current = searchVal
      poTypeRef.current = poTypeVal
      dateRangeRef.current = dates
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (excludeInternalSo) params.exclude_internal_so = 1
      if (searchVal) params.search    = searchVal
      if (poTypeVal) params.po_type   = poTypeVal
      if (dates[0])  params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates[1])  params.date_to   = dates[1].format('YYYY-MM-DD')

      const res  = await api.get(apiPath, { params })
      const rows = res.data.data || []
      const totalRows = Number(res.data.total_rows ?? res.data.total ?? rows.length)
      setData(rows)
      setPagination(prev => ({ ...prev, current: page, pageSize, total: totalRows }))
      if (useLiwColumnOrder) setLiwSummary(buildLiwSummary(rows))
      if (showLoading) fetchPurchaseSummary(searchVal, dates, poTypeVal)
      if (useLiwColumnOrder && showLoading) fetchLiwSummary(searchVal, dates, poTypeVal)
    } catch (e) { console.error(e) }
    finally { if (showLoading) setLoading(false) }
  }, [apiPath, buildLiwSummary, excludeInternalSo, fetchLiwSummary, fetchPurchaseSummary, useLiwColumnOrder])

  useEffect(() => {
    fetchData(1, 20, '', dateRangeRef.current)
    const interval = setInterval(() => {
      fetchData(pageRef.current, pageSizeRef.current, searchRef.current, dateRangeRef.current, false, poTypeRef.current)
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleSearch    = val  => {
    setSearch(val)
    searchRef.current = val
    fetchData(1, pageSizeRef.current, val, dateRangeRef.current, true, poTypeRef.current)
  }
  const handlePoTypeChange = val => {
    const nextType = val || ''
    setPoType(nextType)
    poTypeRef.current = nextType
    fetchData(1, pageSizeRef.current, searchRef.current, dateRangeRef.current, true, nextType)
  }
  const handleDateChange = dates => {
    const nextDates = dates || [null, null]
    setDateRange(nextDates)
    dateRangeRef.current = nextDates
    fetchData(1, pageSizeRef.current, searchRef.current, nextDates, true, poTypeRef.current)
  }
  const handleReset     = ()   => {
    const currentMonth = getCurrentMonthRange()
    setSearch('')
    setPoType('')
    setDateRange(currentMonth)
    searchRef.current = ''
    poTypeRef.current = ''
    dateRangeRef.current = currentMonth
    fetchData(1, pageSizeRef.current, '', currentMonth, true, '')
  }
  const handleSaveNote = (record, field, note) => {
    setData(prev => prev.map(row => {
      const sameRow =
        (row.no_permintaan || '') === (record.no_permintaan || '') &&
        (row.so_no || '') === (record.so_no || '') &&
        (row.no_pembelian || '') === (record.no_pembelian || '') &&
        (row.no_barang || '') === (record.no_barang || '')
      return sameRow ? { ...row, [field]: note } : row
    }))
  }
  const fetchStockHistory = async (record, dates = stockHistoryDateRange) => {
    const itemno = String(record?.no_barang_so || record?.no_barang || '').trim()
    if (!itemno) {
      message.warning('No barang tidak tersedia')
      return
    }
    setStockHistoryLoading(true)
    try {
      const params = { itemno }
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')
      const res = await api.get('/api/liw-pur-mkt/stock-history', { params })
      setStockHistoryRows(res.data.data || [])
      setStockHistorySummary(res.data.summary || { qty_total: 0, qty_future: 0 })
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat riwayat stok')
    } finally {
      setStockHistoryLoading(false)
    }
  }
  const openStockHistory = (record) => {
    const currentMonth = getCurrentMonthRange()
    setStockHistoryRecord(record)
    setStockHistoryRows([])
    setStockHistorySummary({ qty_total: 0, qty_future: 0 })
    setStockHistoryDateRange(currentMonth)
    setStockHistoryOpen(true)
    fetchStockHistory(record, currentMonth)
  }
  const handleStockHistoryDateChange = dates => {
    const nextDates = dates || [null, null]
    setStockHistoryDateRange(nextDates)
    if (stockHistoryRecord) fetchStockHistory(stockHistoryRecord, nextDates)
  }
  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (excludeInternalSo) params.exclude_internal_so = 1
      if (search) params.search = search
      if (poType) params.po_type = poType
      if (dateRange[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
      if (dateRange[1]) params.date_to = dateRange[1].format('YYYY-MM-DD')
      const res = await api.get(exportApiPath, { params })
      return (res.data.data || []).map((row, index) => ({
        no: index + 1,
        ...row,
        ...(useLiwColumnOrder ? { no_permintaan: formatPurchaseRequestNo(row) } : {}),
        sisa_hari_ekspetasi: getDaysRemaining(row.tgl_ekspetasi),
        tgl_ekspetasi_vs_tgl_pb: formatPbDelayText(row),
      }))
    },
    columns: [
      PEMBELIAN_EXPORT_COLS[0],
      ...filterExportColumnsByPermission(permissionModule, [
        ...(useLiwColumnOrder ? [
          { key: 'so_no', label: 'SO NO' },
          { key: 'tgl_so', label: 'Tgl SO', type: 'date' },
          { key: 'est_kirim_so', label: 'Est. Kirim SO', type: 'date' },
          { key: 'nama_pelanggan_so', label: 'Nama Pelanggan' },
          { key: 'no_po_customer_so', label: 'No. PO Customer' },
          { key: 'salesman_so', label: 'Salesman' },
          { key: 'no_barang_so', label: 'No. Barang SO' },
          { key: 'deskripsi_barang_so', label: 'Deskripsi Barang SO' },
          { key: 'qty_order_so', label: 'Qty Order', type: 'number' },
          { key: 'qty_shipped_so', label: 'Qty Shipped', type: 'number' },
          { key: 'sisa_kirim_so', label: 'Sisa Kirim', type: 'number' },
          { key: 'stok_tersedia_so', label: 'Stok Tersedia', type: 'number' },
          { key: 'stock_sistem_so', label: 'Stock Sistem', type: 'number' },
          { key: 'uom_so', label: 'UoM SO' },
          { key: 'no_permintaan', label: 'No. Permintaan' },
          { key: 'tgl_permintaan', label: 'Tgl Permintaan', type: 'date' },
          { key: 'tgl_target_permintaan', label: 'Tgl Target Permintaan', type: 'date' },
          { key: 'no_pembelian', label: 'No. Pembelian' },
          { key: 'tgl_pembelian', label: 'Tgl Pembelian', type: 'date' },
          { key: 'tgl_ekspetasi', label: 'Tgl Target Pembelian', type: 'date' },
          { key: 'note_pesanan', label: 'Note Pesanan' },
          { key: 'nama_pemasok', label: 'Nama Pemasok' },
          { key: 'purchaser', label: 'Purchaser' },
          { key: 'no_barang', label: 'No. Barang Pembelian' },
          { key: 'deskripsi_barang', label: 'Deskripsi Barang Pembelian' },
          { key: 'qty', label: 'Qty', type: 'number' },
          { key: 'uom', label: 'UoM' },
          { key: 'no_penerimaan_barang', label: 'No Penerimaan Barang' },
          { key: 'tgl_penerimaan_barang', label: 'Tgl Penerimaan Barang', type: 'date' },
          { key: 'tgl_ekspetasi_vs_tgl_pb', label: 'Tgl Ekspetasi Vs Tgl PB' },
          { key: 'price', label: 'Harga Satuan Pembelian', type: 'number' },
          { key: 'no_pengiriman_so', label: 'No. Pengiriman' },
          { key: 'tgl_kirim_so', label: 'Tgl Kirim', type: 'date' },
          { key: 'note_pengiriman', label: 'Note Pengiriman' },
        ] : [
          ...PEMBELIAN_EXPORT_COLS.slice(1, 10),
          ...(showSalesReferenceFields ? [
            { key: 'tgl_so', label: 'Tgl SO', type: 'date' },
            { key: 'est_kirim_so', label: 'Est. Kirim SO', type: 'date' },
            { key: 'nama_pelanggan_so', label: 'Nama Pelanggan' },
            { key: 'no_po_customer_so', label: 'No. PO Customer' },
            { key: 'salesman_so', label: 'Salesman' },
            { key: 'no_barang_so', label: 'No. Barang SO' },
            { key: 'deskripsi_barang_so', label: 'Deskripsi Barang SO' },
            { key: 'no_pengiriman_so', label: 'No. Pengiriman' },
            { key: 'tgl_kirim_so', label: 'Tgl Kirim', type: 'date' },
            { key: 'stock_sistem_so', label: 'Stock Sistem', type: 'number' },
            { key: 'harga_satuan_penjualan', label: 'Harga Satuan', type: 'number' },
          ] : []),
          ...PEMBELIAN_EXPORT_COLS.slice(10),
        ]),
      ].filter(col => !hiddenColumnKeys.includes(col.key)), user),
    ],
    filename,
    sheetName,
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

  const salesReferenceColumns = showSalesReferenceFields ? [
    { title: 'Tgl SO', dataIndex: 'tgl_so', key: 'tgl_so', width: 120, render: v => v ? <Tag color="green">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Est. Kirim SO', dataIndex: 'est_kirim_so', key: 'est_kirim_so', width: 135, render: v => renderDateTag(v, 'cyan', true) },
    { title: 'Nama Pelanggan', dataIndex: 'nama_pelanggan_so', key: 'nama_pelanggan_so', width: 210, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'No. PO Customer', dataIndex: 'no_po_customer_so', key: 'no_po_customer_so', width: 150, render: v => v ? <Tag color="purple">{v}</Tag> : '-' },
    { title: 'Salesman', dataIndex: 'salesman_so', key: 'salesman_so', width: 140, render: v => v || '-' },
    { title: 'No. Barang SO', dataIndex: 'no_barang_so', key: 'no_barang_so', width: 160, render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: 'Deskripsi Barang SO', dataIndex: 'deskripsi_barang_so', key: 'deskripsi_barang_so', width: 260, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'No. Pengiriman', dataIndex: 'no_pengiriman_so', key: 'no_pengiriman_so', width: 165, render: v => v ? <Tag color="geekblue">{v}</Tag> : '-' },
    { title: 'Tgl Kirim', dataIndex: 'tgl_kirim_so', key: 'tgl_kirim_so', width: 115, render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Harga Satuan', dataIndex: 'harga_satuan_penjualan', key: 'harga_satuan_penjualan', width: 145, align: 'right', render: v => formatRp(v) },
  ] : []

  const defaultColumns = [
    { title: 'No. Pembelian',   dataIndex: 'no_pembelian',    key: 'no_pembelian',    width: 160, fixed: 'left', render: v => <Text strong style={{ color: '#1a73e8' }}>{v}</Text> },
    { title: 'Tgl Pembelian',   dataIndex: 'tgl_pembelian',   key: 'tgl_pembelian',   width: 120, render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Tgl Ekspetasi',   dataIndex: 'tgl_ekspetasi',   key: 'tgl_ekspetasi',   width: 120, render: v => v ? <Tag color="geekblue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'TOP',             dataIndex: 'top',             key: 'top',             width: 110, render: v => v ? <Tag color="purple">{v}</Tag> : '-' },
    { title: 'Sisa Hari',       dataIndex: 'tgl_ekspetasi',   key: 'sisa_hari_ekspetasi', width: 115, align: 'center', render: v => renderDaysRemaining(v) },
    { title: 'No. Permintaan',  dataIndex: 'no_permintaan',   key: 'no_permintaan',   width: 155, render: v => v ? <Tag color="cyan">{v}</Tag> : <Text type="secondary">-</Text> },
    { title: 'Tgl Permintaan',  dataIndex: 'tgl_permintaan',  key: 'tgl_permintaan',  width: 125, render: v => v ? <Tag color="green">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Tgl Target',      dataIndex: 'tgl_target_permintaan', key: 'tgl_target_permintaan', width: 125, render: v => v ? <Tag color="gold">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'SO NO',           dataIndex: 'so_no',           key: 'so_no',           width: 230, render: v => <SoNoCell value={v} /> },
    { title: 'No Penerimaan',   dataIndex: 'no_penerimaan_barang', key: 'no_penerimaan_barang', width: 155, render: v => v ? <Tag color="geekblue">{v}</Tag> : '-' },
    { title: 'Tgl Penerimaan',  dataIndex: 'tgl_penerimaan_barang', key: 'tgl_penerimaan_barang', width: 135, render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Ekspetasi vs PB', key: 'tgl_ekspetasi_vs_tgl_pb', width: 145, align: 'center', render: (_, record) => renderPbDelay(record) },
    ...salesReferenceColumns,
    { title: 'No. Pemasok',     dataIndex: 'no_pemasok',      key: 'no_pemasok',      width: 110, render: v => <Text code>{v || '-'}</Text> },
    { title: 'Nama Pemasok',    dataIndex: 'nama_pemasok',    key: 'nama_pemasok',    width: 200, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Purchaser',       dataIndex: 'purchaser',       key: 'purchaser',       width: 170, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'No. Barang',      dataIndex: 'no_barang',       key: 'no_barang',       width: 160, render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: 'Deskripsi Barang',dataIndex: 'deskripsi_barang',key: 'deskripsi_barang',width: 260, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Qty',             dataIndex: 'qty',             key: 'qty',             width: 80,  align: 'right', render: v => formatQty(v) },
    { title: 'UoM',             dataIndex: 'uom',             key: 'uom',             width: 70,  align: 'center', render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Harga Satuan',    dataIndex: 'price',           key: 'price',           width: 130, align: 'right', render: v => formatRp(v) },
    { title: 'Diskon',          dataIndex: 'diskon',          key: 'diskon',          width: 120, align: 'right', render: v => formatRp(v) },
    { title: 'PPN',             dataIndex: 'ppn_kode',        key: 'ppn',             width: 80,  align: 'center', render: (k, r) => k ? <Tag color="volcano">{k} {r.ppn_rate > 0 ? `(${r.ppn_rate}%)` : ''}</Tag> : <Tag>Non-PKP</Tag> },
    { title: 'Nominal PPN',     dataIndex: 'ppn_amount',      key: 'ppn_amount',      width: 130, align: 'right', render: v => <Text style={{ color: '#fa8c16' }}>{formatRp(v)}</Text> },
    { title: 'PPH',             dataIndex: 'pph',             key: 'pph',             width: 120, align: 'right', render: v => formatRp(v) },
    { title: 'Add Cost',        dataIndex: 'add_cost',        key: 'add_cost',        width: 120, align: 'right', render: v => formatRp(v) },
    { title: 'DPP',             dataIndex: 'dpp',             key: 'dpp',             width: 130, align: 'right', render: v => <Text strong>{formatRp(v)}</Text> },
    { title: 'Nilai PO',        dataIndex: 'nilai_po',        key: 'nilai_po',        width: 140, align: 'right', render: v => <Text strong>{formatRp(v)}</Text> },
    { title: 'Uang Muka',       dataIndex: 'uang_muka',       key: 'uang_muka',       width: 140, align: 'right', render: v => <Text style={{ color: Number(v || 0) > 0 ? '#1677ff' : undefined }}>{formatRp(v)}</Text> },
    { title: 'Sisa PO',         dataIndex: 'sisa_po',         key: 'sisa_po',         width: 140, align: 'right', render: v => <Text strong type={Number(v || 0) > 0 ? 'danger' : undefined}>{formatRp(v)}</Text> },
    {
      title: 'Status Bayar',
      dataIndex: 'status_pembayaran',
      key: 'status_pembayaran',
      width: 125,
      align: 'center',
      render: v => {
        const color = v === 'Lunas' ? 'green' : v === 'DP' ? 'blue' : 'default'
        return <Tag color={color}>{v || 'Belum DP'}</Tag>
      },
    },
    { title: 'No Faktur Pengajuan', dataIndex: 'no_faktur_pengajuan', key: 'no_faktur_pengajuan', width: 180, render: v => v ? <Text code>{v}</Text> : '-' },
    { title: 'Pengajuan Bayar', dataIndex: 'pengajuan_bayar', key: 'pengajuan_bayar', width: 150, align: 'right', render: v => <Text strong>{formatRp(v)}</Text> },
    { title: 'Dibayar FAT', dataIndex: 'dibayar_fat', key: 'dibayar_fat', width: 140, align: 'right', render: v => <Text style={{ color: Number(v || 0) > 0 ? '#389e0d' : undefined }}>{formatRp(v)}</Text> },
    { title: 'Sisa Hutang FAT', dataIndex: 'sisa_hutang_fat', key: 'sisa_hutang_fat', width: 150, align: 'right', render: v => <Text strong type={Number(v || 0) > 0 ? 'danger' : undefined}>{formatRp(v)}</Text> },
    {
      title: 'Status FAT',
      dataIndex: 'status_fat',
      key: 'status_fat',
      width: 155,
      align: 'center',
      render: v => {
        const colorMap = {
          Lunas: 'green',
          'Dibayar Sebagian': 'blue',
          'Belum Dibayar FAT': 'red',
          'Belum Diajukan': 'default',
        }
        return <Tag color={colorMap[v] || 'default'}>{v || 'Belum Diajukan'}</Tag>
      },
    },
    { title: 'Amount',          dataIndex: 'amount',          key: 'amount',          width: 140, align: 'right', fixed: 'right', render: v => <Text strong style={{ color: '#52c41a' }}>{formatRp(v)}</Text> },
  ]

  const liwGroup = (group, edge = '') => `liw-${group}-cell${edge ? ` liw-${edge}-edge` : ''}`

  const liwColumns = [
    { title: 'SO NO', dataIndex: 'so_no', key: 'so_no', width: 150, fixed: 'left', className: liwGroup('sales', 'start'), render: v => <SoNoCell value={v} /> },
    { title: 'Tgl SO', dataIndex: 'tgl_so', key: 'tgl_so', width: 115, className: liwGroup('sales'), render: v => v ? <Tag color="green">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Est. Kirim SO', dataIndex: 'est_kirim_so', key: 'est_kirim_so', width: 135, className: liwGroup('sales'), render: v => renderDateTag(v, 'cyan', true) },
    { title: 'Nama Pelanggan', dataIndex: 'nama_pelanggan_so', key: 'nama_pelanggan_so', width: 210, className: liwGroup('sales'), ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'No. PO Customer', dataIndex: 'no_po_customer_so', key: 'no_po_customer_so', width: 150, className: liwGroup('sales'), render: v => v ? <Tag color="purple">{v}</Tag> : '-' },
    { title: 'Salesman', dataIndex: 'salesman_so', key: 'salesman_so', width: 145, className: liwGroup('sales'), ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'No. Barang SO', dataIndex: 'no_barang_so', key: 'no_barang_so', width: 160, className: liwGroup('sales'), render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: 'Deskripsi Barang SO', dataIndex: 'deskripsi_barang_so', key: 'deskripsi_barang_so', width: 260, className: liwGroup('sales'), ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Qty Order', dataIndex: 'qty_order_so', key: 'qty_order_so', width: 95, align: 'right', className: liwGroup('sales'), render: v => formatQty(v) },
    { title: 'Qty Shipped', dataIndex: 'qty_shipped_so', key: 'qty_shipped_so', width: 105, align: 'right', className: liwGroup('sales'), render: v => <Text style={{ color: Number(v || 0) > 0 ? '#389e0d' : undefined }}>{formatQty(v)}</Text> },
    { title: 'Sisa Kirim', dataIndex: 'sisa_kirim_so', key: 'sisa_kirim_so', width: 95, align: 'right', className: liwGroup('sales'), render: v => <Text style={{ color: Number(v || 0) > 0 ? '#cf1322' : '#389e0d' }}>{formatQty(v)}</Text> },
    { title: 'Stok Tersedia', dataIndex: 'stok_tersedia_so', key: 'stok_tersedia_so', width: 115, align: 'right', className: liwGroup('sales'), render: (v, record) => (
      <Button
        type="link"
        size="small"
        onClick={event => {
          event.stopPropagation()
          openStockHistory(record)
        }}
        style={{ padding: 0, height: 'auto', color: Number(v || 0) > 0 ? '#1677ff' : '#cf1322', fontWeight: 600 }}
      >
        {formatQty(v)}
      </Button>
    ) },
    { title: 'Stock Sistem', dataIndex: 'stock_sistem_so', key: 'stock_sistem_so', width: 115, align: 'right', className: liwGroup('sales'), render: v => <Text style={{ color: Number(v || 0) > 0 ? '#08979c' : '#cf1322' }}>{formatQty(v)}</Text> },
    { title: 'UoM', dataIndex: 'uom_so', key: 'uom_so', width: 70, align: 'center', className: liwGroup('sales', 'end'), render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'No. Permintaan', dataIndex: 'no_permintaan', key: 'no_permintaan', width: 155, className: liwGroup('purchase', 'start'), render: (_, record) => renderPurchaseRequestNo(record) },
    { title: 'Tgl Permintaan', dataIndex: 'tgl_permintaan', key: 'tgl_permintaan', width: 125, className: liwGroup('purchase'), render: v => v ? <Tag color="green">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Tgl Target Permintaan', dataIndex: 'tgl_target_permintaan', key: 'tgl_target_permintaan', width: 165, className: liwGroup('purchase'), render: v => v ? <Tag color="gold">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'No. Pembelian', dataIndex: 'no_pembelian', key: 'no_pembelian', width: 155, className: liwGroup('purchase'), render: v => v ? <Tag color="blue">{v}</Tag> : <Tag color="orange">Belum PO</Tag> },
    { title: 'Tgl Pembelian', dataIndex: 'tgl_pembelian', key: 'tgl_pembelian', width: 120, className: liwGroup('purchase'), render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Tgl Target Pembelian', dataIndex: 'tgl_ekspetasi', key: 'tgl_ekspetasi', width: 170, className: liwGroup('purchase'), render: v => renderDateTag(v, 'geekblue', true) },
    { title: 'Note Pesanan', dataIndex: 'note_pesanan', key: 'note_pesanan', width: 220, className: liwGroup('purchase'), render: (_, record) => <EditableNoteCell record={record} onSave={handleSaveNote} /> },
    { title: 'Nama Pemasok', dataIndex: 'nama_pemasok', key: 'nama_pemasok', width: 200, className: liwGroup('purchase'), ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Purchaser', dataIndex: 'purchaser', key: 'purchaser', width: 170, className: liwGroup('purchase'), ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'No. Barang Pembelian', dataIndex: 'no_barang', key: 'no_barang', width: 170, className: liwGroup('purchase'), render: v => <Text code style={{ fontSize: 12 }}>{v || '-'}</Text> },
    { title: 'Deskripsi Barang Pembelian', dataIndex: 'deskripsi_barang', key: 'deskripsi_barang', width: 270, className: liwGroup('purchase'), ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 80, align: 'right', className: liwGroup('purchase'), render: v => formatQty(v) },
    { title: 'UoM', dataIndex: 'uom', key: 'uom', width: 70, align: 'center', className: liwGroup('purchase'), render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'No Penerimaan Barang', dataIndex: 'no_penerimaan_barang', key: 'no_penerimaan_barang', width: 180, className: liwGroup('purchase'), render: v => v ? <Tag color="geekblue">{v}</Tag> : '-' },
    { title: 'Tgl Penerimaan Barang', dataIndex: 'tgl_penerimaan_barang', key: 'tgl_penerimaan_barang', width: 180, className: liwGroup('purchase'), render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Ekspetasi vs PB', key: 'tgl_ekspetasi_vs_tgl_pb', width: 150, align: 'center', className: liwGroup('purchase'), render: (_, record) => renderPbDelay(record) },
    { title: 'Harga Satuan Pembelian', dataIndex: 'price', key: 'price', width: 170, align: 'right', className: liwGroup('purchase', 'end'), render: v => formatRp(v) },
    { title: 'No. Pengiriman', dataIndex: 'no_pengiriman_so', key: 'no_pengiriman_so', width: 165, className: liwGroup('delivery', 'start'), render: v => v ? <Tag color="geekblue">{v}</Tag> : '-' },
    { title: 'Tgl Kirim', dataIndex: 'tgl_kirim_so', key: 'tgl_kirim_so', width: 115, className: liwGroup('delivery'), render: v => v ? <Tag color="blue">{dayjs(v).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'Note Pengiriman', dataIndex: 'note_pengiriman', key: 'note_pengiriman', width: 220, className: liwGroup('delivery', 'end'), render: (_, record) => <EditableNoteCell record={record} field="note_pengiriman" apiPath="/api/liw-pur-mkt/delivery-note" placeholder="Isi note kirim" onSave={handleSaveNote} /> },
  ]

  const columns = useLiwColumnOrder ? liwColumns : defaultColumns

  const selectedDocKey = selected?.no_pembelian || selected?.no_permintaan
  const detailRows = selected
    ? data.filter(row => (row.no_pembelian || row.no_permintaan) === selectedDocKey)
    : []

  const detailFields = [
    { key: 'no_pembelian', label: 'No. Pembelian', render: v => <Text strong>{v}</Text> },
    { key: 'tgl_pembelian', label: 'Tanggal Pembelian', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'tgl_ekspetasi', label: 'Tanggal Ekspetasi', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'top', label: 'TOP', render: v => v || '-' },
    { key: 'sisa_hari_ekspetasi', label: 'Sisa Hari Ekspetasi', render: (_, record) => renderDaysRemaining(record?.tgl_ekspetasi) },
    { key: 'tgl_ekspetasi_vs_tgl_pb', label: 'Tgl Ekspetasi Vs Tgl PB', render: (_, record) => renderPbDelay(record) },
    { key: 'nilai_po', label: 'Nilai PO', render: v => formatRp(v) },
    { key: 'uang_muka', label: 'Uang Muka', render: v => formatRp(v) },
    { key: 'sisa_po', label: 'Sisa PO', render: v => formatRp(v) },
    { key: 'status_pembayaran', label: 'Status Bayar', render: v => v || 'Belum DP' },
    { key: 'no_faktur_pengajuan', label: 'No Faktur Pengajuan', render: v => v || '-' },
    { key: 'pengajuan_bayar', label: 'Pengajuan Bayar', render: v => formatRp(v) },
    { key: 'dibayar_fat', label: 'Dibayar FAT', render: v => formatRp(v) },
    { key: 'sisa_hutang_fat', label: 'Sisa Hutang FAT', render: v => formatRp(v) },
    { key: 'status_fat', label: 'Status FAT', render: v => v || 'Belum Diajukan' },
    { key: 'no_permintaan', label: 'No. Permintaan', render: v => v || '-' },
    { key: 'tgl_permintaan', label: 'Tanggal Permintaan', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'tgl_target_permintaan', label: 'Tanggal Target', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'so_no', label: 'SO NO' },
    ...(showSalesReferenceFields ? [
      { key: 'tgl_so', label: 'Tanggal SO', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
      { key: 'est_kirim_so', label: 'Est. Kirim SO', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
      { key: 'nama_pelanggan_so', label: 'Nama Pelanggan' },
      { key: 'no_po_customer_so', label: 'No. PO Customer' },
      { key: 'salesman_so', label: 'Salesman' },
      { key: 'no_barang_so', label: 'No. Barang SO' },
      { key: 'deskripsi_barang_so', label: 'Deskripsi Barang SO' },
      { key: 'no_pengiriman_so', label: 'No. Pengiriman' },
      { key: 'tgl_kirim_so', label: 'Tgl Kirim', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
      { key: 'qty_order_so', label: 'Qty Order', render: v => formatQty(v) },
      { key: 'qty_shipped_so', label: 'Qty Shipped', render: v => formatQty(v) },
      { key: 'sisa_kirim_so', label: 'Sisa Kirim', render: v => formatQty(v) },
      { key: 'stok_tersedia_so', label: 'Stok Tersedia', render: v => formatQty(v) },
      { key: 'stock_sistem_so', label: 'Stock Sistem', render: v => formatQty(v) },
      { key: 'uom_so', label: 'UoM SO' },
      { key: 'harga_satuan_penjualan', label: 'Harga Satuan', render: v => formatRp(v) },
    ] : []),
    { key: 'no_pemasok', label: 'No. Pemasok' },
    { key: 'nama_pemasok', label: 'Nama Pemasok' },
    { key: 'purchaser', label: 'Purchaser' },
  ]

  const detailColumns = [
    { title: 'No Barang', dataIndex: 'no_barang', width: 130, render: v => <Text code>{v || '-'}</Text> },
    { title: 'SO NO', dataIndex: 'so_no', width: 220, render: v => <SoNoCell value={v} /> },
    ...(showSalesReferenceFields ? [
      { title: 'Tgl SO', dataIndex: 'tgl_so', width: 115, render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
      { title: 'Est. Kirim', dataIndex: 'est_kirim_so', width: 115, render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
      { title: 'No. Pengiriman', dataIndex: 'no_pengiriman_so', width: 150, render: v => v || '-' },
      { title: 'Tgl Kirim', dataIndex: 'tgl_kirim_so', width: 110, render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
      { title: 'Harga Satuan', dataIndex: 'harga_satuan_penjualan', width: 130, align: 'right', render: v => formatRp(v) },
    ] : []),
    { title: 'No Penerimaan', dataIndex: 'no_penerimaan_barang', width: 150, render: v => v || '-' },
    { title: 'Tgl Penerimaan', dataIndex: 'tgl_penerimaan_barang', width: 130, render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { title: 'Ekspetasi vs PB', width: 130, align: 'center', render: (_, record) => renderPbDelay(record) },
    { title: 'Deskripsi', dataIndex: 'deskripsi_barang', width: 220, ellipsis: true },
    { title: 'Qty', dataIndex: 'qty', width: 90, align: 'right', render: v => formatQty(v) },
    { title: 'UoM', dataIndex: 'uom', width: 70, render: v => v || '-' },
    { title: 'Harga', dataIndex: 'price', width: 120, align: 'right', render: v => formatRp(v) },
    { title: 'Diskon', dataIndex: 'diskon', width: 120, align: 'right', render: v => formatRp(v) },
    { title: 'PPH', dataIndex: 'pph', width: 120, align: 'right', render: v => formatRp(v) },
    { title: 'Add Cost', dataIndex: 'add_cost', width: 120, align: 'right', render: v => formatRp(v) },
    { title: 'DPP', dataIndex: 'dpp', width: 120, align: 'right', render: v => formatRp(v) },
    { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: v => <Text strong>{formatRp(v)}</Text> },
  ]

  const hideColumn = column => {
    const key = column.key || column.dataIndex
    return key && hiddenColumnKeys.includes(key)
  }
  const visibleColumns = [serialColumn, ...filterColumnsByPermission(permissionModule, columns.filter(column => !hideColumn(column)), user)]
  const visibleDetailFields = filterExportColumnsByPermission(permissionModule, detailFields.filter(field => !hiddenColumnKeys.includes(field.key)), user)
  const visibleDetailColumns = filterColumnsByPermission(permissionModule, detailColumns.filter(column => !hideColumn(column)), user)
  const allowedPembelianColumns = user?.column_permissions?.[permissionModule]
  const canViewAmount = !allowedPembelianColumns || allowedPembelianColumns.includes('amount')
  const purchasePoStatusItems = [
    { label: 'menunggu', value: summary.po.menunggu || 0, color: '#ff7a00' },
    { label: 'diproses', value: summary.po.diproses || 0, color: '#11b7d8' },
    { label: 'diterima', value: summary.po.diterima || 0, color: '#00a92f' },
  ]
  const purchaseItemStatusItems = [
    { label: 'belum diterima', value: summary.items.belum || 0, color: '#ff7a00' },
    { label: 'diterima', value: summary.items.diterima || 0, color: '#00a92f' },
  ]
  const liwSummaryCards = [
    { title: 'Sales Order (SO)', value: liwSummary.so_count, color: '#1677ff' },
    { title: 'Barang Dikirim (DO)', value: liwSummary.do_count, color: '#13a8a8' },
    { title: 'Pesanan Pembelian (PO)', value: liwSummary.po_count, color: '#fa8c16' },
    { title: 'Penerimaan Barang (PB)', value: liwSummary.pb_count, color: '#52c41a' },
    { title: 'SO Est. Kirim H-3 s/d H-1', value: liwSummary.so_due_soon, color: '#cf1322' },
    { title: 'PO Target H-3 s/d H-1', value: liwSummary.po_due_soon, color: '#d4380d' },
  ]
  const stockHistoryColumns = [
    { title: 'No. DO', dataIndex: 'no_pengiriman', width: 145, fixed: 'left', render: v => v ? <Tag color="geekblue">{v}</Tag> : '-' },
    {
      title: 'Tgl DO',
      dataIndex: 'tgl_pengiriman',
      width: 115,
      render: (v, record) => v ? (
        <Space size={4}>
          <Tag color={record.is_future ? 'red' : 'blue'}>{dayjs(v).format('DD/MM/YYYY')}</Tag>
          {record.is_future && <Tag color="red">Future</Tag>}
        </Space>
      ) : '-',
    },
    { title: 'No. SO', dataIndex: 'no_so', width: 145, render: v => v ? <Tag color="blue">{v}</Tag> : '-' },
    { title: 'Customer', dataIndex: 'nama_pelanggan', width: 240, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'PO Customer', dataIndex: 'no_po', width: 165, render: v => v || '-' },
    { title: 'Qty Keluar', dataIndex: 'qty', width: 105, align: 'right', render: v => <Text strong>{formatQty(v)}</Text> },
    { title: 'UoM', dataIndex: 'uom', width: 70, align: 'center', render: v => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Deskripsi', dataIndex: 'deskripsi_barang', width: 320, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
  ]

  return (
    <div>
      {useLiwColumnOrder && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {liwSummaryCards.map(card => (
            <Col key={card.title} xs={24} sm={12} md={8} xl={4}>
              <Card size="small" loading={summaryLoading}>
                <Statistic title={card.title} value={card.value} valueStyle={{ color: card.color, fontSize: 22 }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {showSummary && (
        <Row gutter={[0, 0]} className="purchase-summary-cards">
          <Col xs={24} sm={12} xl={canViewAmount ? 5 : 12}>
            <div className="purchase-summary-card purchase-summary-card-po">
              <div className="purchase-summary-shape" />
              <Text className="purchase-summary-label"><FileDoneOutlined /> Jumlah Pesanan Pembelian (PO)</Text>
              <div className="purchase-summary-value">{summaryLoading ? <LoadingOutlined /> : summary.po.total || 0}</div>
              <div className="purchase-summary-status-list">
                {purchasePoStatusItems.map(item => (
                  <span key={item.label} className="purchase-summary-status" style={{ '--status-color': item.color }}>
                    <strong>{item.value}</strong> {item.label}
                  </span>
                ))}
              </div>
            </div>
          </Col>
          <Col xs={24} sm={12} xl={canViewAmount ? 5 : 12}>
            <div className="purchase-summary-card purchase-summary-card-item">
              <div className="purchase-summary-shape" />
              <Text className="purchase-summary-label"><FileDoneOutlined /> PO per Barang</Text>
              <div className="purchase-summary-value">{summaryLoading ? <LoadingOutlined /> : summary.items.total || 0}</div>
              <div className="purchase-summary-status-list">
                {purchaseItemStatusItems.map(item => (
                  <span key={item.label} className="purchase-summary-status" style={{ '--status-color': item.color }}>
                    <strong>{item.value}</strong> {item.label}
                  </span>
                ))}
              </div>
            </div>
          </Col>
          {canViewAmount && (
            <>
            <Col xs={24} sm={12} xl={4}>
              <div className="purchase-summary-card purchase-summary-card-total">
                <div className="purchase-summary-shape" />
                <Text className="purchase-summary-label"><ShoppingCartOutlined /> Total</Text>
                <div className="purchase-summary-value purchase-summary-currency">
                  {summaryLoading ? <LoadingOutlined /> : formatRp(summary.grossAmount || 0)}
                </div>
                <div className="purchase-summary-status-list">
                  <span className="purchase-summary-status" style={{ '--status-color': '#1677ff' }}>
                    sesuai Total Easy
                  </span>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} xl={4}>
              <div className="purchase-summary-card purchase-summary-card-discount">
                <div className="purchase-summary-shape" />
                <Text className="purchase-summary-label"><ShoppingCartOutlined /> Diskon</Text>
                <div className="purchase-summary-value purchase-summary-currency">
                  {summaryLoading ? <LoadingOutlined /> : formatRp(summary.discountAmount || 0)}
                </div>
                <div className="purchase-summary-status-list">
                  <span className="purchase-summary-status" style={{ '--status-color': '#d4380d' }}>
                    diskon transaksi
                  </span>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={24} xl={6}>
              <div className="purchase-summary-card purchase-summary-card-amount">
                <div className="purchase-summary-shape" />
                <Text className="purchase-summary-label"><ShoppingCartOutlined /> Grand Total Periode</Text>
                <div className="purchase-summary-value purchase-summary-currency">
                  {summaryLoading ? <LoadingOutlined /> : formatRp(summary.amount || 0)}
                </div>
                <div className="purchase-summary-status-list">
                  <span className="purchase-summary-status" style={{ '--status-color': '#00a92f' }}>
                    sesuai grand total transaksi
                  </span>
                </div>
              </div>
            </Col>
            </>
          )}
        </Row>
      )}

      <Card
        title={<span><ShoppingCartOutlined style={{ marginRight: 8, color: '#1a73e8' }} />{title}</span>}
        extra={
          <Space wrap>
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={handleDateChange} placeholder={['Tgl Dari', 'Tgl Sampai']} style={{ width: 220 }} />
            <Search placeholder="Cari no PO, permintaan, pemasok, barang..." allowClear value={search} style={{ width: 290 }}
              prefix={<SearchOutlined />} onSearch={handleSearch}
              onChange={e => { setSearch(e.target.value); if (!e.target.value) handleSearch('') }} />
            <Select
              allowClear
              placeholder="Tipe PO"
              value={poType || undefined}
              onChange={handlePoTypeChange}
              style={{ width: 135 }}
              options={[
                { value: 'AI-S', label: 'AI-S Sale' },
                { value: 'AI-SRV', label: 'AI-SRV Service' },
                { value: 'AI-BM', label: 'AI-BM Material' },
                { value: 'AI-A', label: 'AI-A Aset' },
              ]}
            />
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
          className={`purchase-freeze-table${useLiwColumnOrder ? ' liw-flow-table' : ''}`}
          rowKey={(r, i) => `${r.no_pembelian || r.no_permintaan}-${r.no_barang}-${i}`}
          columns={withTableSorters(visibleColumns)} dataSource={data} loading={loading} size="small"
          sticky={{ offsetHeader: 0 }}
          scroll={{ x: useLiwColumnOrder ? 5225 : (showSalesReferenceFields ? 4400 : 2770), y: 'calc(100vh - 360px)' }}
          onRow={rec => ({
            onClick: () => setSelected(rec),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            ...pagination, showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t, range) => `${range[0]}-${range[1]} dari ${t} baris`,
            onChange: (page, pageSize) => {
              const nextPage = pageSize !== pageSizeRef.current ? 1 : page
              fetchData(nextPage, pageSize, searchRef.current, dateRangeRef.current)
            }
          }}
        />
      </Card>
      <DocumentDetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Detail ${selected?.no_pembelian ? 'PO' : 'PR'} ${selectedDocKey || ''}`}
        subtitle={selected?.nama_pemasok}
        record={selected}
        fields={visibleDetailFields}
        lineTitle="Detail Barang PO"
        lineRows={detailRows}
        lineColumns={visibleDetailColumns}
      />
      <Modal
        open={stockHistoryOpen}
        onCancel={() => setStockHistoryOpen(false)}
        footer={null}
        width="92vw"
        title={`Riwayat DO ${stockHistoryRecord?.no_barang_so || stockHistoryRecord?.no_barang || ''}`}
      >
        <Space align="start" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
          <Space size={[8, 8]} wrap>
            <Tag color="blue">Stok Tersedia: {formatQty(stockHistoryRecord?.stok_tersedia_so)}</Tag>
            <Tag color="cyan">Stock Sistem: {formatQty(stockHistoryRecord?.stock_sistem_so)}</Tag>
            <Tag>Total DO: {formatQty(stockHistorySummary.qty_total)}</Tag>
            <Tag color={Number(stockHistorySummary.qty_future || 0) > 0 ? 'red' : 'default'}>
              Future DO: {formatQty(stockHistorySummary.qty_future)}
            </Tag>
          </Space>
          <RangePicker
            value={stockHistoryDateRange}
            format="DD/MM/YYYY"
            onChange={handleStockHistoryDateChange}
            allowClear={false}
            style={{ width: 220 }}
          />
        </Space>
        <Table
          rowKey={(row, index) => `${row.no_pengiriman}-${row.no_so}-${index}`}
          columns={stockHistoryColumns}
          dataSource={stockHistoryRows}
          loading={stockHistoryLoading}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1280, y: 420 }}
          locale={{ emptyText: 'Belum ada DO untuk item ini' }}
        />
      </Modal>
      <style>{`
        .purchase-summary-cards {
          margin-bottom: 16px;
          overflow: hidden;
          border: 1px solid rgba(226, 231, 240, 0.82);
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 10px 26px rgba(24, 33, 58, 0.05);
        }
        .purchase-summary-card {
          position: relative;
          min-height: 96px;
          padding: 14px 18px;
          overflow: hidden;
          border-right: 1px solid rgba(226, 231, 240, 0.72);
        }
        .purchase-summary-cards .ant-col:last-child .purchase-summary-card {
          border-right: 0;
        }
        .purchase-summary-card-po {
          background: linear-gradient(135deg, rgba(229, 248, 255, 0.95), rgba(241, 253, 251, 0.74));
        }
        .purchase-summary-card-item {
          background: linear-gradient(135deg, rgba(255, 250, 235, 0.95), rgba(247, 245, 255, 0.78));
        }
        .purchase-summary-card-amount {
          background: linear-gradient(135deg, rgba(255, 245, 248, 0.95), rgba(235, 253, 244, 0.82));
        }
        .purchase-summary-card-total {
          background: linear-gradient(135deg, rgba(239, 246, 255, 0.95), rgba(245, 250, 255, 0.82));
        }
        .purchase-summary-card-discount {
          background: linear-gradient(135deg, rgba(255, 247, 237, 0.95), rgba(255, 251, 235, 0.82));
        }
        .purchase-summary-shape {
          position: absolute;
          right: 28px;
          top: 20px;
          width: 44px;
          height: 44px;
          clip-path: polygon(50% 0, 92% 25%, 92% 75%, 50% 100%, 8% 75%, 8% 25%);
          background: rgba(17, 183, 216, 0.12);
        }
        .purchase-summary-card-item .purchase-summary-shape {
          background: rgba(250, 140, 22, 0.12);
        }
        .purchase-summary-card-amount .purchase-summary-shape {
          background: rgba(212, 20, 82, 0.12);
        }
        .purchase-summary-card-total .purchase-summary-shape {
          background: rgba(22, 119, 255, 0.12);
        }
        .purchase-summary-card-discount .purchase-summary-shape {
          background: rgba(212, 56, 13, 0.12);
        }
        .purchase-summary-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #4e5870;
          font-size: 12px;
          font-weight: 700;
        }
        .purchase-summary-value {
          margin-top: 8px;
          color: #1677ff;
          font-size: 26px;
          font-weight: 800;
          line-height: 1.1;
        }
        .purchase-summary-card-item .purchase-summary-value {
          color: #fa8c16;
        }
        .purchase-summary-card-amount .purchase-summary-value {
          color: #00a92f;
        }
        .purchase-summary-card-total .purchase-summary-value {
          color: #1677ff;
        }
        .purchase-summary-card-discount .purchase-summary-value {
          color: #d4380d;
        }
        .purchase-summary-currency {
          font-size: 22px;
        }
        .purchase-summary-status-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }
        .purchase-summary-status {
          display: inline-flex;
          align-items: center;
          min-height: 20px;
          padding: 2px 8px;
          border-radius: 6px;
          background: color-mix(in srgb, var(--status-color) 12%, white);
          color: var(--status-color);
          font-size: 11px;
          font-weight: 600;
          line-height: 16px;
        }
        .purchase-summary-status strong {
          margin-right: 4px;
          font-weight: 800;
        }
        @media (max-width: 767px) {
          .purchase-summary-card {
            border-right: 0;
            border-bottom: 1px solid rgba(226, 231, 240, 0.72);
          }
          .purchase-summary-cards .ant-col:last-child .purchase-summary-card {
            border-bottom: 0;
          }
        }
      `}</style>
    </div>
  )
}
