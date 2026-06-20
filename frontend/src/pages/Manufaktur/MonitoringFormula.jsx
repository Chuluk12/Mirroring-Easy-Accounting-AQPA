import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Badge, Button, Card, Checkbox, DatePicker, Descriptions, Empty, Input, Modal, Popover, Progress, Space, Table, Tag, Tooltip, Typography, message,
  Select,
} from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, FileExcelOutlined, PrinterOutlined, ReloadOutlined, SearchOutlined, PartitionOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api, { getApiErrorMessage } from '../../api/client'
import { downloadHtmlXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import useVisiblePolling from '../../hooks/useVisiblePolling'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text } = Typography

const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]
const getDefaultDateRange = getCurrentMonthRange
const DEFAULT_PAGE_SIZE = 10

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'Belum Mulai', label: 'Belum Mulai' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Selesai', label: 'Selesai' },
]

const MONITORING_FORMULA_EXPORT_COLS = [
  { key: 'no_spk', label: 'No SPK' },
  { key: 'tanggal', label: 'Tanggal SPK', type: 'date' },
  { key: 'no_hasil_produksi', label: 'No Hasil Produksi / GP' },
  { key: 'tgl_selesai', label: 'Tgl Selesai Produksi', type: 'date' },
  { key: 'no_barang', label: 'No Barang' },
  { key: 'nama_barang', label: 'Nama Barang' },
  { key: 'qty_spk', label: 'Qty SPK', type: 'number' },
  { key: 'qty_hasil_produksi', label: 'Hasil Produksi / GP', type: 'number' },
  { key: 'uom', label: 'UoM' },
  { key: 'production_progress', label: 'Progress Produksi (%)', type: 'number' },
  { key: 'total_mat_plan', label: 'Total Bahan Rencana', type: 'number' },
  { key: 'total_mat_keluar', label: 'Total Bahan Keluar', type: 'number' },
  { key: 'material_progress', label: 'Progress Bahan (%)', type: 'number' },
  { key: 'production_status', label: 'Status Barang' },
  { key: 'no_formula', label: 'No Formula' },
  { key: 'formula_material_count', label: 'Material Formula', type: 'number' },
  { key: 'spk_material_count', label: 'Material SPK', type: 'number' },
  { key: 'spm_material_count', label: 'Material SPM', type: 'number' },
  { key: 'formula_material_cost', label: 'Biaya Material Formula', type: 'number' },
  { key: 'formula_production_cost', label: 'Biaya Produksi Formula', type: 'number' },
  { key: 'formula_total_cost', label: 'Total Biaya Formula', type: 'number' },
  { key: 'spk_material_cost', label: 'Biaya Material SPK', type: 'number' },
  { key: 'spk_production_cost', label: 'Biaya Produksi SPK', type: 'number' },
  { key: 'spk_total_cost', label: 'Total Biaya SPK', type: 'number' },
  { key: 'hpp_total_actual', label: 'Total HPP Aktual', type: 'number' },
  { key: 'hpp_per_unit', label: 'HPP per Unit', type: 'number' },
  { key: 'hpp_per_unit_spk', label: 'Estimasi HPP per Unit SPK', type: 'number' },
  { key: 'hpp_status', label: 'Status HPP' },
  { key: 'total_cost_diff', label: 'Selisih Total Biaya', type: 'number' },
  { key: 'formula_vs_spk_status', label: 'Formula vs SPK' },
  { key: 'spk_vs_spm_status', label: 'SPK vs SPM' },
  { key: 'material_stock_status', label: 'Status Stok Material' },
  { key: 'material_stock_shortage_count', label: 'Material Kurang', type: 'number' },
]

const EXPORT_PARENT_COLS = [
  { key: 'no_spk', label: 'No SPK' },
  { key: 'tanggal', label: 'Tanggal SPK', type: 'date' },
  { key: 'no_hasil_produksi', label: 'No Hasil Produksi / GP' },
  { key: 'tgl_selesai', label: 'Tgl Selesai Produksi', type: 'date' },
  { key: 'no_barang', label: 'No Barang' },
  { key: 'nama_barang', label: 'Nama Barang' },
  { key: 'qty_spk', label: 'Qty SPK', type: 'number' },
  { key: 'qty_hasil_produksi', label: 'Hasil Produksi / GP', type: 'number' },
  { key: 'uom', label: 'UoM' },
  { key: 'no_formula', label: 'No Formula' },
]

const MATERIAL_DETAIL_EXPORT_COLS = [
  ...EXPORT_PARENT_COLS,
  { key: 'material_no', label: 'No Barang Formula' },
  { key: 'material_name', label: 'Nama Material' },
  { key: 'formula_qty', label: 'Qty Formula', type: 'number' },
  { key: 'formula_qty_for_spk_qty', label: 'Qty Formula x Qty SPK', type: 'number' },
  { key: 'spk_qty', label: 'Qty di SPK', type: 'number' },
  { key: 'spm_qty', label: 'Qty di SPM', type: 'number' },
  { key: 'spm_spk_qty_diff', label: 'Selisih SPM-SPK', type: 'number' },
  { key: 'unit', label: 'UoM Material' },
  { key: 'formula_cost', label: 'Biaya Formula', type: 'number' },
  { key: 'formula_cost_for_spk_qty', label: 'Biaya Formula x Qty SPK', type: 'number' },
  { key: 'spk_cost', label: 'Biaya SPK', type: 'number' },
  { key: 'material_cost_diff', label: 'Selisih Biaya', type: 'number' },
  { key: 'cost_description', label: 'Deskripsi Biaya' },
  { key: 'stock_qty', label: 'Stok', type: 'number' },
  { key: 'shortage_qty', label: 'Kurang', type: 'number' },
  { key: 'stock_status', label: 'Status Stok' },
  { key: 'formula_spk_status', label: 'Formula vs SPK' },
  { key: 'spk_spm_status', label: 'SPK vs SPM' },
]

const PRODUCTION_DETAIL_EXPORT_COLS = [
  ...EXPORT_PARENT_COLS,
  { key: 'cost_no', label: 'No Biaya' },
  { key: 'description', label: 'Deskripsi' },
  { key: 'category', label: 'Kategori' },
  { key: 'formula_qty', label: 'Jam Formula', type: 'number' },
  { key: 'formula_qty_for_spk_qty', label: 'Jam Formula x Qty SPK', type: 'number' },
  { key: 'spk_qty', label: 'Jam SPK', type: 'number' },
  { key: 'formula_unit_cost', label: 'Biaya/Jam Formula', type: 'number' },
  { key: 'spk_unit_cost', label: 'Biaya/Jam SPK', type: 'number' },
  { key: 'formula_cost', label: 'Biaya Formula', type: 'number' },
  { key: 'formula_cost_for_spk_qty', label: 'Biaya Formula x Qty SPK', type: 'number' },
  { key: 'spk_cost', label: 'Biaya SPK', type: 'number' },
  { key: 'production_cost_diff', label: 'Selisih Biaya', type: 'number' },
]

const WIP_RECONCILIATION_EXPORT_COLS = [
  ...EXPORT_PARENT_COLS,
  { key: 'row_type', label: 'Jenis Baris' },
  { key: 'no_perintah_kerja', label: 'No Perintah Kerja' },
  { key: 'pengeluaran_bahan', label: 'Pengeluaran Bahan' },
  { key: 'produksi_hasil', label: 'Produksi Hasil' },
  { key: 'tanggal_wip', label: 'Tanggal', type: 'date' },
  { key: 'tipe', label: 'Tipe' },
  { key: 'desk_pekerjaan', label: 'Desk Pekerjaan' },
  { key: 'total_wip', label: 'Total WIP', type: 'number' },
  { key: 'total_wip_inv', label: 'Total WIP Inv', type: 'number' },
  { key: 'selisih', label: 'Selisih', type: 'number' },
  { key: 'source', label: 'Sumber' },
]

const statusColor = status => {
  if (status === 'Sesuai') return 'green'
  if (status === 'Aman') return 'green'
  if (status === 'Kurang') return 'red'
  if (status === 'Tidak Dicek') return 'default'
  if (status === 'Tidak Ada Material') return 'default'
  if (status?.includes('Bertambah') || status?.includes('Tambahan')) return 'blue'
  if (status?.includes('Berkurang') || status?.includes('Belum')) return 'orange'
  if (status?.includes('Tidak Ada')) return 'red'
  return 'volcano'
}

const formatQty = value => {
  if (value === null || value === undefined) return '-'
  return Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 })
}

const formatCurrency = value => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 4,
}).format(value || 0)

const productionQtyText = record => {
  const base = `Hasil produksi ${formatQty(record.qty_hasil_produksi)} dari ${formatQty(record.qty_spk)} ${record.uom || ''}`
  const closedQty = Number(record.qty_berhenti_produksi || 0)
  return closedQty > 0 ? `${base}; ${formatQty(closedQty)} ${record.uom || ''} ditutup` : base
}

const productionResultNos = record => {
  const values = new Set()
  ;(record?.production_results || []).forEach(item => {
    const noHasil = String(item?.no_hasil || '').trim()
    if (noHasil) values.add(noHasil)
  })
  return [...values].join(', ')
}

const currencyTextStyle = { whiteSpace: 'nowrap' }

const hppStatusColor = status => {
  if (status === 'Final') return 'green'
  if (status === 'Estimasi') return 'gold'
  return 'default'
}

const PRODUCTION_STATUS_MAP = {
  'Belum Mulai': { badge: 'default', color: '#8c8c8c' },
  'In Progress': { badge: 'processing', color: '#1890ff' },
  Selesai: { badge: 'success', color: '#52c41a' },
}

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

export default function MonitoringFormula() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMsg, setLoadingMsg] = useState('Memuat data formula...')
  const [hasLoaded, setHasLoaded] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [dateRange, setDateRange] = useState(getDefaultDateRange)
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printOptions, setPrintOptions] = useState([])
  const [selectedPrintKeys, setSelectedPrintKeys] = useState([])
  const [printLoading, setPrintLoading] = useState(false)
  const [wipLoadingIds, setWipLoadingIds] = useState({})

  const searchRef = useRef('')
  const statusRef = useRef('')
  const dateRangeRef = useRef(getDefaultDateRange())
  const pageRef = useRef(1)
  const pageSizeRef = useRef(DEFAULT_PAGE_SIZE)
  const isFetchingRef = useRef(false)
  const requestSeqRef = useRef(0)
  const wipRequestIdsRef = useRef({})

  const fetchData = useCallback(async (
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    searchVal = '',
    dates = getDefaultDateRange(),
    statusVal = '',
    showLoading = true,
  ) => {
    if (!showLoading && isFetchingRef.current) return
    const requestSeq = requestSeqRef.current + 1
    requestSeqRef.current = requestSeq
    isFetchingRef.current = true
    if (showLoading) {
      setLoadingMsg('Memuat data formula...')
      setLoading(true)
    }
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize, skip_count: 1 }
      if (searchVal) params.search = searchVal
      if (statusVal) params.status = statusVal
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')

      const res = await api.get('/api/monitoring-formula', {
        params,
        timeout: 90000,
        onDownloadProgress: () => setLoadingMsg('Menerima data formula...'),
      })
      if (requestSeq !== requestSeqRef.current) return
      const rows = res.data.data || []
      setData(rows)
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: res.data.total || rows.length,
      }))
    } catch (error) {
      console.error('Gagal fetch monitoring formula:', error)
      message.error(getApiErrorMessage(error, 'Gagal memuat monitoring formula'))
    } finally {
      if (requestSeq === requestSeqRef.current) isFetchingRef.current = false
      if (requestSeq === requestSeqRef.current) setHasLoaded(true)
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(1, DEFAULT_PAGE_SIZE, '', dateRangeRef.current, statusRef.current)
  }, [fetchData])

  useVisiblePolling(() => {
    fetchData(pageRef.current, pageSizeRef.current, searchRef.current, dateRangeRef.current, statusRef.current, false)
  }, 60000)

  const handleSearch = value => {
    searchRef.current = value
    setSearch(value)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, value, dateRangeRef.current, statusRef.current)
  }

  const handleDate = dates => {
    const nextDates = dates || [null, null]
    dateRangeRef.current = nextDates
    setDateRange(nextDates)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, nextDates, statusRef.current)
  }

  const handleStatus = value => {
    statusRef.current = value
    setStatus(value)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, dateRangeRef.current, value)
  }

  const handleReset = () => {
    const currentMonth = getCurrentMonthRange()
    searchRef.current = ''
    statusRef.current = ''
    dateRangeRef.current = currentMonth
    setSearch('')
    setStatus('')
    setDateRange(currentMonth)
    pageRef.current = 1
    fetchData(1, DEFAULT_PAGE_SIZE, '', currentMonth, '')
  }

  const loadWipReconciliation = useCallback(async record => {
    const wodetId = record?.wodet_id
    if (!wodetId || record?.wip_loaded || (record?.wip_reconciliation?.rows || []).length > 0) return
    if (wipRequestIdsRef.current[wodetId]) return

    wipRequestIdsRef.current[wodetId] = true
    setWipLoadingIds(prev => ({ ...prev, [wodetId]: true }))
    try {
      const params = {
        offset: 0,
        limit: 1,
        include_wip: 1,
        wodet_id: wodetId,
      }

      const res = await api.get('/api/monitoring-formula', { params, timeout: 90000 })
      const detail = (res.data.data || []).find(row => Number(row.wodet_id) === Number(wodetId))
      setData(prev => prev.map(row => {
        if (Number(row.wodet_id) !== Number(wodetId)) return row
        return {
          ...row,
          wip_loaded: true,
          wip_reconciliation: detail?.wip_reconciliation || row.wip_reconciliation,
        }
      }))
    } catch (error) {
      console.error('Gagal fetch rekonsiliasi WIP:', error)
      message.error(getApiErrorMessage(error, 'Gagal memuat rekonsiliasi WIP'))
    } finally {
      delete wipRequestIdsRef.current[wodetId]
      setWipLoadingIds(prev => ({ ...prev, [wodetId]: false }))
    }
  }, [])

  const buildParentExportFields = row => ({
    no_spk: row.no_spk,
    tanggal: row.tanggal,
    no_hasil_produksi: productionResultNos(row),
    tgl_selesai: row.tgl_selesai,
    qty_hasil_produksi: row.qty_hasil_produksi,
    no_barang: row.no_barang,
    nama_barang: row.nama_barang,
    qty_spk: row.qty_spk,
    uom: row.uom,
    no_formula: row.no_formula,
  })

  const buildMaterialExportRows = rows => rows.flatMap(row => (
    (row.materials || []).map(item => ({
      ...buildParentExportFields(row),
      ...item,
      spm_spk_qty_diff: item.spk_qty === null || item.spk_qty === undefined || item.spm_qty === null || item.spm_qty === undefined
        ? null
        : Number(item.spm_qty || 0) - Number(item.spk_qty || 0),
    }))
  ))

  const buildProductionExportRows = rows => rows.flatMap(row => (
    (row.production_details || []).map(item => ({
      ...buildParentExportFields(row),
      ...item,
    }))
  ))

  const buildWipExportRows = rows => rows.flatMap(row => {
    const parent = buildParentExportFields(row)
    const detailRows = (row.wip_reconciliation?.rows || []).map(item => ({
      ...parent,
      ...item,
      row_type: 'Detail',
      tanggal_wip: item.tanggal,
    }))
    const totals = row.wip_reconciliation?.totals
    if (!totals) return detailRows
    return [
      ...detailRows,
      {
        ...parent,
        row_type: 'Total',
        total_wip: totals.total_wip,
        total_wip_inv: totals.total_wip_inv,
        selisih: totals.selisih,
      },
    ]
  })

  const reportCurrencyKeys = new Set([
    'formula_material_cost', 'formula_production_cost', 'formula_total_cost',
    'spk_material_cost', 'spk_production_cost', 'spk_total_cost',
    'hpp_total_actual', 'hpp_per_unit', 'hpp_per_unit_spk',
    'total_cost_diff', 'material_cost_diff', 'production_cost_diff',
    'formula_cost', 'formula_cost_for_spk_qty', 'spk_cost',
    'formula_unit_cost', 'spk_unit_cost', 'total_wip', 'total_wip_inv', 'selisih',
  ])

  const reportValue = (row, column) => {
    const value = row[column.key]
    if (value === null || value === undefined || value === '') return '-'
    if (column.type === 'date') return dayjs(value).format('DD/MM/YYYY')
    if (reportCurrencyKeys.has(column.key)) return formatCurrency(value)
    if (column.type === 'number') return formatQty(value)
    return value
  }

  const reportClass = value => {
    const text = String(value || '').toLowerCase()
    if (text.includes('selesai') || text.includes('aman') || text.includes('sesuai') || text.includes('final')) return 'tag green'
    if (text.includes('kurang') || text.includes('tidak')) return 'tag red'
    if (text.includes('estimasi') || text.includes('akhir')) return 'tag yellow'
    if (text.includes('pengeluaran')) return 'tag blue'
    return 'tag'
  }

  const renderReportTable = (columns, rows, emptyText = 'Tidak ada data') => {
    const header = columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('')
    const body = rows.length
      ? rows.map(row => (
        `<tr>${columns.map(column => {
          const value = reportValue(row, column)
          const isNumber = column.type === 'number' || reportCurrencyKeys.has(column.key)
          const tagKeys = ['production_status', 'hpp_status', 'stock_status', 'formula_spk_status', 'spk_spm_status', 'tipe']
          const content = tagKeys.includes(column.key)
            ? `<span class="${reportClass(value)}">${escapeHtml(value)}</span>`
            : escapeHtml(value)
          return `<td class="${isNumber ? 'num' : ''}">${content}</td>`
        }).join('')}</tr>`
      )).join('')
      : `<tr><td colspan="${columns.length}">${escapeHtml(emptyText)}</td></tr>`
    return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`
  }

  const buildReportHtml = rows => {
    const mainColumns = filterExportColumnsByPermission('monitoring_formula', MONITORING_FORMULA_EXPORT_COLS, user)
    const mainRows = rows.map(row => ({
      ...row,
      no_hasil_produksi: productionResultNos(row),
    }))

    return `
      <style>
        body { font-family: Arial, sans-serif; color: #1f2937; }
        table { border-collapse: collapse; width: 100%; font-size: 11px; }
        th { background: #f5f7fb; color: #25324b; font-weight: 700; }
        th, td { border: 1px solid #e5e7eb; padding: 6px 8px; vertical-align: middle; }
        .report-shell > tbody > tr > td { border: 0; padding: 0 0 8px; }
        .record-title { font-weight: 700; padding: 10px 0 8px !important; color: #0f172a; }
        .section-title { font-weight: 700; padding: 10px 0 6px !important; color: #0f172a; }
        .summary th { width: 14%; color: #64748b; font-weight: 600; background: #fbfbfc; }
        .summary td { width: 19%; }
        .num { text-align: right; white-space: nowrap; }
        .tag { display: inline-block; padding: 2px 8px; border-radius: 10px; background: #eef2f7; color: #475569; }
        .tag.green { background: #e8f7df; color: #208a2a; }
        .tag.red { background: #fde2e2; color: #cf1322; }
        .tag.yellow { background: #fff2cc; color: #ad6800; }
        .tag.blue { background: #e6f4ff; color: #1677ff; }
        .red-text { color: #cf1322; font-weight: 700; text-align: right; }
        .spacer { height: 20px; border: 0 !important; }
      </style>
      <table class="report-shell">
        <tbody>
          <tr><td class="record-title">Monitoring Formula</td></tr>
          <tr><td>Export ${escapeHtml(dayjs().format('DD/MM/YYYY HH:mm'))}</td></tr>
          <tr><td>${renderReportTable(mainColumns, mainRows, 'Tidak ada data')}</td></tr>
        </tbody>
      </table>
    `
  }

  const handleExport = async () => {
    setExporting(true)
    message.loading({ content: 'Menyiapkan export monitoring formula...', key: 'export', duration: 0 })
    try {
      const exportRows = data || []
      if (!exportRows.length) {
        message.warning({ content: 'Tidak ada data yang sedang tampil untuk diekspor', key: 'export' })
        return
      }

      downloadHtmlXLS(buildReportHtml(exportRows), 'MonitoringFormula', 'Monitoring Formula')

      try {
        await api.post('/api/audit/event', {
          action: 'export',
          module: 'monitoring_formula',
          description: 'Export Monitoring Formula header utama',
          metadata: {
            filename: 'MonitoringFormula',
            layout: 'main_header',
            rows: exportRows.length,
            current_page: pagination.current,
            page_size: pagination.pageSize,
          },
        })
      } catch {
        // Audit failure should not block the downloaded export.
      }
      message.success({
        content: `${exportRows.length} baris utama yang sedang tampil berhasil diekspor`,
        key: 'export',
      })
    } catch (error) {
      message.error({ content: `Gagal export: ${error.message || 'error'}`, key: 'export' })
    } finally {
      setExporting(false)
    }
  }

  const getPrintKey = record => String(record?.wodet_id ?? `${record?.no_spk || ''}-${record?.no_barang || ''}-${record?.no_formula || ''}`)

  const uniqueRecords = rows => {
    const seen = new Set()
    return rows.filter(row => {
      const key = getPrintKey(row)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const buildPrintSection = (record, index, total) => {
    const materials = record.materials || []
    const productions = record.production_details || []
    const materialRows = materials.map(item => {
      const qtyDiff = item.spk_qty !== null && item.spk_qty !== undefined && item.spm_qty !== null && item.spm_qty !== undefined
        ? Number(item.spm_qty || 0) - Number(item.spk_qty || 0)
        : null
      return `
        <tr>
          <td>${escapeHtml(item.material_no)}</td>
          <td>${escapeHtml(item.material_name)}</td>
          <td class="right">${item.formula_qty_for_spk_qty === null || item.formula_qty_for_spk_qty === undefined ? '-' : escapeHtml(formatQty(item.formula_qty_for_spk_qty))}</td>
          <td class="right">${escapeHtml(formatQty(item.spk_qty))}</td>
          <td class="right">${escapeHtml(formatQty(item.spm_qty))}</td>
          <td>${escapeHtml(item.unit || '')}</td>
          <td class="right ${qtyDiff > 0 ? 'danger' : ''}">${qtyDiff === null ? '-' : `${qtyDiff > 0 ? '+' : ''}${escapeHtml(formatQty(qtyDiff))}`}</td>
          <td class="note-cell"></td>
        </tr>
      `
    }).join('')
    const productionRows = productions.map(item => `
      <tr>
        <td>${escapeHtml(item.cost_no)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.category)}</td>
        <td class="right">${item.formula_qty_for_spk_qty === null || item.formula_qty_for_spk_qty === undefined ? '-' : escapeHtml(formatQty(item.formula_qty_for_spk_qty))}</td>
        <td class="right">${escapeHtml(formatQty(item.spk_qty))}</td>
        <td class="note-cell"></td>
      </tr>
    `).join('')
    return `
          <div class="grid">
            <div class="cell"><div class="label">No SPK</div><div class="value">${escapeHtml(record.no_spk || '-')}</div></div>
            <div class="cell"><div class="label">Tanggal</div><div class="value">${escapeHtml(record.tanggal ? dayjs(record.tanggal).format('DD/MM/YYYY') : '-')}</div></div>
            <div class="cell"><div class="label">No Barang</div><div class="value">${escapeHtml(record.no_barang || '-')}</div></div>
            <div class="cell"><div class="label">Qty SPK</div><div class="value">${escapeHtml(formatQty(record.qty_spk))} ${escapeHtml(record.uom || '')}</div></div>
            <div class="cell"><div class="label">Qty Produksi</div><div class="value">${escapeHtml(formatQty(record.qty_hasil_produksi))} ${escapeHtml(record.uom || '')}</div></div>
            <div class="cell"><div class="label">Nama Barang</div><div class="value">${escapeHtml(record.nama_barang || '-')}</div></div>
            <div class="cell"><div class="label">No Formula</div><div class="value">${escapeHtml(record.no_formula || '-')}</div></div>
            <div class="cell"><div class="label">No Pesanan</div><div class="value">${escapeHtml(record.no_pesanan || '-')}</div></div>
            <div class="cell"><div class="label">No PO</div><div class="value">${escapeHtml(record.no_po || '-')}</div></div>
          </div>
          <h2>Rincian Material Formula</h2>
          <table>
            <colgroup>
              <col><col><col><col><col><col><col><col class="note-col">
            </colgroup>
            <thead>
              <tr><th>No Barang</th><th>Nama Material</th><th>Formula</th><th>SPK</th><th>SPM</th><th>UOM</th><th>Selisih SPM-SPK</th><th>Note</th></tr>
            </thead>
            <tbody>${materialRows || '<tr><td colspan="8">Tidak ada data material</td></tr>'}</tbody>
          </table>
          <h2>Rincian Biaya Produksi</h2>
          <table>
            <colgroup>
              <col><col><col><col><col><col class="note-col">
            </colgroup>
            <thead>
              <tr><th>No Biaya</th><th>Deskripsi</th><th>Kategori</th><th>Formula</th><th>SPK</th><th>Note</th></tr>
            </thead>
            <tbody>${productionRows || '<tr><td colspan="6">Tidak ada data biaya produksi</td></tr>'}</tbody>
          </table>
          ${index < total - 1 ? '<div class="page-break"></div>' : ''}
    `
  }

  const handlePrint = records => {
    const printRecords = Array.isArray(records) ? records : [records]
    if (!printRecords.length) {
      message.warning('Pilih barang yang mau diprint')
      return
    }
    const firstRecord = printRecords[0]
    const sections = printRecords.map((record, index) => buildPrintSection(record, index, printRecords.length)).join('')
    const printWindow = window.open('', '_blank', 'width=1200,height=800')
    if (!printWindow) {
      message.error('Popup print diblokir browser')
      return
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Monitoring BOM ${escapeHtml(firstRecord.no_spk || '')}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 24px; font-size: 12px; }
            h1 { font-size: 20px; margin: 0 0 4px; }
            h2 { font-size: 14px; margin: 20px 0 8px; }
            .muted { color: #6b7280; }
            .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 14px; }
            .brand { display: flex; align-items: center; gap: 14px; }
            .brand-logo { width: 160px; height: 46px; object-fit: contain; object-position: left center; }
            .grid { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid #d1d5db; margin-bottom: 14px; }
            .cell { padding: 8px; border-right: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; min-height: 42px; }
            .cell:nth-child(5n) { border-right: 0; }
            .label { color: #6b7280; font-size: 10px; margin-bottom: 3px; text-transform: uppercase; }
            .value { font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; page-break-inside: auto; }
            th, td { border: 1px solid #d1d5db; padding: 6px 7px; vertical-align: top; }
            th { background: #f3f4f6; text-align: left; font-size: 11px; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            .right { text-align: right; white-space: nowrap; }
            .danger { color: #b91c1c; font-weight: 700; }
            .note-col { width: 22%; }
            .note-cell { min-width: 160px; }
            .page-break { break-after: page; page-break-after: always; }
            .page-footer { position: fixed; bottom: 0; right: 0; color: #6b7280; font-size: 10px; }
            .page-footer::after { content: "Halaman " counter(page); }
            @page {
              margin: 12mm;
              @bottom-right { content: "Halaman " counter(page); }
            }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand">
              <img class="brand-logo" src="/logo-gte-horizontal.jpg" alt="Grand Twins Engineering" />
              <div>
                <h1>Monitoring BOM SPK</h1>
                <div class="muted">Dicetak ${escapeHtml(dayjs().format('DD/MM/YYYY HH:mm'))}</div>
              </div>
            </div>
            <button class="no-print" onclick="window.print()">Print</button>
          </div>
          ${sections}
          <div class="page-footer"></div>
          <script>window.onload = () => window.print()</script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const handleOpenPrintOptions = async record => {
    setPrintLoading(true)
    try {
      const params = { offset: 0, limit: 500, search: record.no_spk }
      if (dateRangeRef.current?.[0]) params.date_from = dateRangeRef.current[0].format('YYYY-MM-DD')
      if (dateRangeRef.current?.[1]) params.date_to = dateRangeRef.current[1].format('YYYY-MM-DD')
      const res = await api.get('/api/monitoring-formula', { params, timeout: 90000 })
      const fetchedRows = (res.data.data || []).filter(row => row.no_spk === record.no_spk)
      const loadedRows = data.filter(row => row.no_spk === record.no_spk)
      const rows = uniqueRecords([record, ...loadedRows, ...fetchedRows])
      setPrintOptions(rows)
      setSelectedPrintKeys(rows.map(getPrintKey))
      setPrintModalOpen(true)
    } catch (error) {
      console.error('Gagal memuat pilihan print SPK:', error)
      const rows = uniqueRecords([record, ...data.filter(row => row.no_spk === record.no_spk)])
      setPrintOptions(rows)
      setSelectedPrintKeys(rows.map(getPrintKey))
      setPrintModalOpen(true)
      message.warning(getApiErrorMessage(error, 'Gagal memuat semua barang SPK, pilihan memakai data yang sedang tampil'))
    } finally {
      setPrintLoading(false)
    }
  }

  const handleConfirmPrintOptions = () => {
    const selectedRows = printOptions.filter(row => selectedPrintKeys.includes(getPrintKey(row)))
    if (!selectedRows.length) {
      message.warning('Pilih minimal 1 barang untuk diprint')
      return
    }
    setPrintModalOpen(false)
    handlePrint(selectedRows)
  }

  const renderProductionResultPopover = record => {
    const results = record.production_results || []
    if (!results.length) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada hasil produksi" />
    }
    return (
      <div style={{ width: 390 }}>
        <Descriptions size="small" column={1} style={{ marginBottom: 10 }}>
          <Descriptions.Item label={record.hpp_status === 'Final' ? 'HPP / Unit' : 'Estimasi HPP / Unit'}>
            <Text strong>{formatCurrency(record.hpp_per_unit)}</Text>
            <Tag color={hppStatusColor(record.hpp_status)} style={{ marginLeft: 8 }}>{record.hpp_status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Estimasi HPP / Unit SPK">
            <Text strong>{formatCurrency(record.hpp_per_unit_spk)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Total Aktual">{formatCurrency(record.hpp_total_actual)}</Descriptions.Item>
        </Descriptions>
        <Table
          rowKey={(row, index) => `${row.no_hasil}-${index}`}
          dataSource={results}
          pagination={false}
          size="small"
          columns={[
            {
              title: 'No Hasil',
              dataIndex: 'no_hasil',
              render: value => <Text code>{value || '-'}</Text>,
            },
            {
              title: 'Tanggal',
              dataIndex: 'tanggal',
              width: 95,
              render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-',
            },
            {
              title: 'Qty',
              dataIndex: 'qty',
              width: 95,
              align: 'right',
              render: (value, row) => `${formatQty(value)} ${row.unit || record.uom || ''}`,
            },
          ]}
        />
      </div>
    )
  }

  const columns = [
    {
      title: 'No SPK',
      dataIndex: 'no_spk',
      key: 'no_spk',
      width: 150,
      fixed: 'left',
      render: value => <Text strong style={{ color: '#1a73e8' }}>{value || '-'}</Text>,
    },
    {
      title: 'Tanggal',
      dataIndex: 'tanggal',
      key: 'tanggal',
      width: 115,
      render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'No Hasil Produksi / GP',
      key: 'no_hasil_produksi',
      width: 170,
      ellipsis: { showTitle: false },
      render: (_, record) => {
        const value = productionResultNos(record)
        if (!value) return <Text type="secondary">-</Text>
        return (
          <Popover
            trigger="click"
            title={`Hasil Produksi ${record.no_spk || ''}`}
            content={renderProductionResultPopover(record)}
          >
            <Text code style={{ cursor: 'pointer', color: '#1677ff' }}>{value}</Text>
          </Popover>
        )
      },
    },
    {
      title: 'Tgl Selesai Produksi',
      dataIndex: 'tgl_selesai',
      key: 'tgl_selesai',
      width: 155,
      render: (value, record) => {
        if (!value) {
          return (
            <Tooltip title={productionQtyText(record)}>
              <span style={{ color: '#aaa', fontSize: 12 }}>
                <ClockCircleOutlined style={{ marginRight: 4 }} />
                Belum selesai
              </span>
            </Tooltip>
          )
        }
        return (
          <Tooltip title={productionQtyText(record)}>
            <span style={{ color: '#52c41a', fontWeight: 600 }}>
              <CheckCircleOutlined style={{ marginRight: 4 }} />
              {dayjs(value).format('DD/MM/YYYY')}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: 'No Barang',
      dataIndex: 'no_barang',
      key: 'no_barang',
      width: 180,
      render: value => <Text code style={{ fontSize: 12 }}>{value || '-'}</Text>,
    },
    {
      title: 'Nama Barang',
      dataIndex: 'nama_barang',
      key: 'nama_barang',
      width: 280,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Qty SPK',
      dataIndex: 'qty_spk',
      key: 'qty_spk',
      width: 100,
      align: 'right',
      render: (value, record) => `${formatQty(value)} ${record.uom || ''}`,
    },
    {
      title: 'Hasil Produksi / GP',
      dataIndex: 'qty_hasil_produksi',
      key: 'qty_hasil_produksi',
      width: 145,
      align: 'right',
      render: (value, record) => (
        <Popover
          trigger="click"
          title={`Hasil Produksi ${record.no_spk || ''}`}
          content={renderProductionResultPopover(record)}
        >
          <Text strong style={{ cursor: 'pointer', color: Number(value || 0) > 0 ? '#1677ff' : undefined }}>
            {formatQty(value)} {record.uom || ''}
          </Text>
        </Popover>
      ),
    },
    {
      title: 'Progress Bahan',
      dataIndex: 'material_progress',
      key: 'material_progress',
      width: 180,
      render: (value, record) => {
        const pct = Number(value || 0)
        const color = record.tgl_selesai ? '#52c41a' : pct > 0 ? '#1890ff' : '#d9d9d9'
        return (
          <Tooltip title={`Bahan keluar ${formatQty(record.total_mat_keluar)} dari rencana ${formatQty(record.total_mat_plan)}`}>
            <div style={{ minWidth: 145 }}>
              <Progress
                percent={pct}
                size="small"
                strokeColor={color}
                status={record.tgl_selesai ? 'success' : pct > 0 ? 'active' : 'normal'}
              />
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: 'Progress Produksi',
      dataIndex: 'production_progress',
      key: 'production_progress',
      width: 185,
      render: (value, record) => {
        const pct = Number(value || 0)
        const color = pct >= 100 ? '#52c41a' : pct > 0 ? '#1890ff' : '#d9d9d9'
        return (
          <Popover
            trigger="click"
            title={`Hasil Produksi ${record.no_spk || ''}`}
            content={renderProductionResultPopover(record)}
          >
            <div style={{ minWidth: 145, cursor: 'pointer' }}>
              <Progress
                percent={pct}
                size="small"
                strokeColor={color}
                status={pct >= 100 ? 'success' : pct > 0 ? 'active' : 'normal'}
              />
            </div>
          </Popover>
        )
      },
    },
    {
      title: 'Status Barang',
      dataIndex: 'production_status',
      key: 'production_status',
      width: 125,
      align: 'center',
      render: (value, record) => {
        const status = value || 'Belum Mulai'
        const statusMeta = PRODUCTION_STATUS_MAP[status] ?? { badge: 'default', color: '#8c8c8c' }
        return (
          <Tooltip title={productionQtyText(record)}>
            <Badge status={statusMeta.badge} text={<Text style={{ color: statusMeta.color }}>{status}</Text>} />
          </Tooltip>
        )
      },
    },
    {
      title: 'HPP / Unit',
      dataIndex: 'hpp_per_unit',
      key: 'hpp_per_unit',
      width: 155,
      align: 'right',
      render: (value, record) => {
        if (!Number(record.qty_hasil_produksi || 0)) return <Text type="secondary">-</Text>
        return (
          <Tooltip title={`Total aktual ${formatCurrency(record.hpp_total_actual)} dibagi hasil produksi ${formatQty(record.qty_hasil_produksi)} ${record.uom || ''}`}>
            <Space size={6} style={{ whiteSpace: 'nowrap' }}>
              <Text strong>{formatCurrency(value)}</Text>
              <Tag color={hppStatusColor(record.hpp_status)}>{record.hpp_status}</Tag>
            </Space>
          </Tooltip>
        )
      },
    },
    {
      title: 'Total Biaya SPK',
      dataIndex: 'spk_total_cost',
      key: 'spk_total_cost',
      width: 155,
      align: 'right',
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'No Formula',
      dataIndex: 'no_formula',
      key: 'no_formula',
      width: 160,
      render: value => value ? <Tag color="purple">{value}</Tag> : <Text type="secondary">Tidak ada</Text>,
    },
    {
      title: 'Material Formula',
      dataIndex: 'formula_material_count',
      key: 'formula_material_count',
      width: 120,
      align: 'right',
      render: value => <Tag color="cyan">{value || 0}</Tag>,
    },
    {
      title: 'Material SPK',
      dataIndex: 'spk_material_count',
      key: 'spk_material_count',
      width: 110,
      align: 'right',
      render: value => <Tag color="geekblue">{value || 0}</Tag>,
    },
    {
      title: 'Material SPM',
      dataIndex: 'spm_material_count',
      key: 'spm_material_count',
      width: 110,
      align: 'right',
      render: value => <Tag color="blue">{value || 0}</Tag>,
    },
    {
      title: 'Biaya Material Formula',
      dataIndex: 'formula_material_cost',
      key: 'formula_material_cost',
      width: 165,
      align: 'right',
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Biaya Produksi Formula',
      dataIndex: 'formula_production_cost',
      key: 'formula_production_cost',
      width: 165,
      align: 'right',
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Total Formula',
      dataIndex: 'formula_total_cost',
      key: 'formula_total_cost',
      width: 145,
      align: 'right',
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Biaya Material SPK',
      dataIndex: 'spk_material_cost',
      key: 'spk_material_cost',
      width: 155,
      align: 'right',
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Biaya Produksi SPK',
      dataIndex: 'spk_production_cost',
      key: 'spk_production_cost',
      width: 155,
      align: 'right',
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Total SPK',
      dataIndex: 'spk_total_cost',
      key: 'spk_total_cost',
      width: 140,
      align: 'right',
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Selisih Biaya',
      dataIndex: 'total_cost_diff',
      key: 'total_cost_diff',
      width: 140,
      align: 'right',
      render: value => {
        const amount = Number(value || 0)
        return <Text type={amount > 0 ? 'danger' : amount < 0 ? 'success' : 'secondary'}>{formatCurrency(amount)}</Text>
      },
    },
  ]

  const materialColumns = [
    {
      title: 'No Barang Formula',
      dataIndex: 'material_no',
      width: 170,
      fixed: 'left',
      render: value => <Text code>{value || '-'}</Text>,
    },
    {
      title: 'Nama Material',
      dataIndex: 'material_name',
      width: 280,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Qty Formula',
      dataIndex: 'formula_qty',
      width: 120,
      align: 'right',
      render: (value, record) => `${formatQty(value)} ${value === null || value === undefined ? '' : record.unit || ''}`,
    },
    {
      title: 'Qty Formula x Qty SPK',
      dataIndex: 'formula_qty_for_spk_qty',
      width: 170,
      align: 'right',
      render: (value, record) => value === null || value === undefined ? '-' : `${formatQty(value)} ${record.unit || ''}`,
    },
    {
      title: 'Qty di SPK',
      dataIndex: 'spk_qty',
      width: 120,
      align: 'right',
      render: (value, record) => `${formatQty(value)} ${value === null || value === undefined ? '' : record.unit || ''}`,
    },
    {
      title: 'Qty di SPM',
      dataIndex: 'spm_qty',
      width: 120,
      align: 'right',
      render: (value, record) => `${formatQty(value)} ${value === null || value === undefined ? '' : record.unit || ''}`,
    },
    {
      title: 'Selisih SPM-SPK',
      key: 'spm_spk_qty_diff',
      width: 145,
      align: 'right',
      render: (_, record) => {
        if (record.spk_qty === null || record.spk_qty === undefined || record.spm_qty === null || record.spm_qty === undefined) return '-'
        const diff = Number(record.spm_qty || 0) - Number(record.spk_qty || 0)
        return (
          <Text type={diff > 0 ? 'danger' : diff < 0 ? 'warning' : 'secondary'} strong={diff > 0}>
            {`${diff > 0 ? '+' : ''}${formatQty(diff)} ${record.unit || ''}`}
          </Text>
        )
      },
    },
    {
      title: 'Biaya Formula',
      dataIndex: 'formula_cost',
      width: 170,
      align: 'right',
      render: (value, record) => {
        if (value === null || value === undefined) return '-'
        return (
          <Space size={6} style={{ whiteSpace: 'nowrap' }}>
            <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>
            {record.formula_cost_estimated && <Tag color="gold">Estimasi</Tag>}
          </Space>
        )
      },
    },
    {
      title: 'Biaya Formula x Qty SPK',
      dataIndex: 'formula_cost_for_spk_qty',
      width: 185,
      align: 'right',
      render: value => value === null || value === undefined ? '-' : <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Biaya SPK',
      dataIndex: 'spk_cost',
      width: 130,
      align: 'right',
      render: value => value === null || value === undefined ? '-' : <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Deskripsi Biaya',
      dataIndex: 'cost_description',
      width: 190,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Selisih Biaya',
      dataIndex: 'material_cost_diff',
      width: 130,
      align: 'right',
      render: value => value === null || value === undefined ? '-' : <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Stok',
      dataIndex: 'stock_qty',
      width: 120,
      align: 'right',
      render: (value, record) => `${formatQty(value)} ${value === null || value === undefined ? '' : record.unit || ''}`,
    },
    {
      title: 'Kurang',
      dataIndex: 'shortage_qty',
      width: 120,
      align: 'right',
      render: (value, record) => {
        const shortage = Number(value || 0)
        return (
          <Text type={shortage > 0 ? 'danger' : 'secondary'}>
            {`${formatQty(value)} ${value === null || value === undefined ? '' : record.unit || ''}`}
          </Text>
        )
      },
    },
    {
      title: 'Status Stok',
      dataIndex: 'stock_status',
      width: 120,
      render: value => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: 'Formula vs SPK',
      dataIndex: 'formula_spk_status',
      width: 150,
      render: value => <Tag color={statusColor(value)}>{value}</Tag>,
    },
    {
      title: 'SPK vs SPM',
      dataIndex: 'spk_spm_status',
      width: 150,
      render: value => <Tag color={statusColor(value)}>{value}</Tag>,
    },
  ]

  const productionColumns = [
    {
      title: 'No Biaya',
      dataIndex: 'cost_no',
      width: 190,
      fixed: 'left',
      render: value => <Text code>{value || '-'}</Text>,
    },
    {
      title: 'Deskripsi',
      dataIndex: 'description',
      width: 280,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Kategori',
      dataIndex: 'category',
      width: 130,
      render: value => value ? <Tag color="geekblue">{value}</Tag> : '-',
    },
    {
      title: 'Jam Formula',
      dataIndex: 'formula_qty',
      width: 120,
      align: 'right',
      render: value => formatQty(value),
    },
    {
      title: 'Jam Formula x Qty SPK',
      dataIndex: 'formula_qty_for_spk_qty',
      width: 175,
      align: 'right',
      render: value => value === null || value === undefined ? '-' : formatQty(value),
    },
    {
      title: 'Jam SPK',
      dataIndex: 'spk_qty',
      width: 110,
      align: 'right',
      render: value => formatQty(value),
    },
    {
      title: 'Biaya/Jam Formula',
      dataIndex: 'formula_unit_cost',
      width: 155,
      align: 'right',
      render: value => value === null || value === undefined ? '-' : <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Biaya/Jam SPK',
      dataIndex: 'spk_unit_cost',
      width: 145,
      align: 'right',
      render: value => value === null || value === undefined ? '-' : <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Biaya Formula',
      dataIndex: 'formula_cost',
      width: 145,
      align: 'right',
      render: value => value === null || value === undefined ? '-' : <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Biaya Formula x Qty SPK',
      dataIndex: 'formula_cost_for_spk_qty',
      width: 185,
      align: 'right',
      render: value => value === null || value === undefined ? '-' : <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Biaya SPK',
      dataIndex: 'spk_cost',
      width: 130,
      align: 'right',
      render: value => value === null || value === undefined ? '-' : <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Selisih Biaya',
      dataIndex: 'production_cost_diff',
      width: 130,
      align: 'right',
      render: value => value === null || value === undefined ? '-' : <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>,
    },
  ]

  const wipReconciliationColumns = [
    {
      title: 'No Perintah Kerja',
      dataIndex: 'no_perintah_kerja',
      width: 150,
      fixed: 'left',
      render: value => <Text code>{value || '-'}</Text>,
    },
    {
      title: 'Pengeluaran Bahan',
      dataIndex: 'pengeluaran_bahan',
      width: 155,
      render: value => value ? <Text code>{value}</Text> : '-',
    },
    {
      title: 'Produksi Hasil',
      dataIndex: 'produksi_hasil',
      width: 145,
      render: value => value ? <Text code>{value}</Text> : '-',
    },
    {
      title: 'Tanggal',
      dataIndex: 'tanggal',
      width: 115,
      render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Tipe',
      dataIndex: 'tipe',
      width: 145,
      render: value => {
        const color = value === 'Pengeluaran Bahan'
          ? 'blue'
          : value === 'Hasil Produksi'
            ? 'green'
            : value === 'Berhenti Produksi'
              ? 'volcano'
              : 'gold'
        return <Tag color={color}>{value || '-'}</Tag>
      },
    },
    {
      title: 'Desk Pekerjaan',
      dataIndex: 'desk_pekerjaan',
      width: 240,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Total WIP',
      dataIndex: 'total_wip',
      width: 140,
      align: 'right',
      render: value => <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Total WIP Inv',
      dataIndex: 'total_wip_inv',
      width: 145,
      align: 'right',
      render: value => <Text style={currencyTextStyle}>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Selisih',
      dataIndex: 'selisih',
      width: 135,
      align: 'right',
      render: value => {
        const amount = Number(value || 0)
        return <Text strong type={amount < 0 ? 'danger' : amount > 0 ? 'success' : 'secondary'}>{formatCurrency(amount)}</Text>
      },
    },
    {
      title: 'Sumber',
      dataIndex: 'source',
      width: 210,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><Text type="secondary">{value || '-'}</Text></Tooltip>,
    },
  ]

  const renderWipSummary = record => {
    const totals = record.wip_reconciliation?.totals || {}
    const amount = Number(totals.selisih || 0)
    return (
      <Table.Summary.Row>
        <Table.Summary.Cell index={0} colSpan={6}>
          <Text strong>Total</Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={6} align="right">
          <Text strong>{formatCurrency(totals.total_wip)}</Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={7} align="right">
          <Text strong>{formatCurrency(totals.total_wip_inv)}</Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={8} align="right">
          <Text strong type={amount < 0 ? 'danger' : amount > 0 ? 'success' : 'secondary'}>{formatCurrency(amount)}</Text>
        </Table.Summary.Cell>
        <Table.Summary.Cell index={9} />
      </Table.Summary.Row>
    )
  }

  const printOptionColumns = [
    {
      title: 'No Barang',
      dataIndex: 'no_barang',
      width: 170,
      render: value => <Text code>{value || '-'}</Text>,
    },
    {
      title: 'Nama Barang',
      dataIndex: 'nama_barang',
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Qty SPK',
      dataIndex: 'qty_spk',
      width: 110,
      align: 'right',
      render: (value, record) => `${formatQty(value)} ${record.uom || ''}`,
    },
    {
      title: 'No Formula',
      dataIndex: 'no_formula',
      width: 160,
      render: value => value ? <Tag color="purple">{value}</Tag> : '-',
    },
  ]

  const visibleColumns = filterColumnsByPermission('monitoring_formula', columns, user)

  return (
    <>
      <Card
        title={<span><PartitionOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Monitoring Formula</span>}
        extra={
          <Space wrap>
            <RangePicker
              value={dateRange}
              format="DD/MM/YYYY"
              onChange={handleDate}
              placeholder={['Tgl Dari', 'Tgl Sampai']}
              style={{ width: 220 }}
            />
            <Select
              value={status}
              options={STATUS_OPTIONS}
              onChange={handleStatus}
              style={{ width: 145 }}
            />
            <Search
              prefix={<SearchOutlined />}
              placeholder="Cari SPK, barang, pesanan..."
              allowClear
              value={search}
              style={{ width: 280 }}
              onSearch={handleSearch}
              onChange={event => {
                setSearch(event.target.value)
                if (!event.target.value) handleSearch('')
              }}
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
        <Text type="secondary" style={{ display: 'block', marginBottom: 10, fontSize: 12 }}>
          Data awal menampilkan transaksi bulan berjalan.
        </Text>
        <Table
          className="monitoring-formula-table"
          rowKey="wodet_id"
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={{ spinning: loading, tip: loadingMsg }}
          locale={{ emptyText: loading && !hasLoaded ? 'Memuat data bulan berjalan...' : 'Tidak ada data' }}
          size="small"
          sticky={{ offsetHeader: 0 }}
          scroll={{ x: 2850, y: 'calc(100vh - 315px)' }}
          expandable={{
            expandedRowRender: record => (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                  <Text strong>{`Detail ${record.no_spk || '-'}`}</Text>
                  <Space wrap>
                    <Button icon={<PrinterOutlined />} onClick={() => handlePrint(record)}>
                      Print Barang Ini
                    </Button>
                    <Button icon={<PrinterOutlined />} onClick={() => handleOpenPrintOptions(record)} loading={printLoading}>
                      Print Pilihan SPK
                    </Button>
                  </Space>
                </Space>
              <table className="cost-summary-table">
                <tbody>
                  <tr>
                    <th>Material Formula</th>
                    <td>{formatCurrency(record.formula_material_cost)}</td>
                    <th>Material SPK</th>
                    <td>{formatCurrency(record.spk_material_cost)}</td>
                    <th>Selisih Material</th>
                    <td><Text type={Number(record.material_cost_diff || 0) > 0 ? 'danger' : 'secondary'}>{formatCurrency(record.material_cost_diff)}</Text></td>
                  </tr>
                  <tr>
                    <th>Produksi Formula</th>
                    <td>{formatCurrency(record.formula_production_cost)}</td>
                    <th>Produksi SPK</th>
                    <td>{formatCurrency(record.spk_production_cost)}</td>
                    <th>Selisih Produksi</th>
                    <td><Text type={Number(record.production_cost_diff || 0) > 0 ? 'danger' : 'secondary'}>{formatCurrency(record.production_cost_diff)}</Text></td>
                  </tr>
                  <tr>
                    <th></th>
                    <td></td>
                    <th></th>
                    <td></td>
                    <th>Selisih Total</th>
                    <td>
                      <Text strong type={Number(record.total_cost_diff || 0) > 0 ? 'danger' : Number(record.total_cost_diff || 0) < 0 ? 'success' : 'secondary'}>
                        {formatCurrency(record.total_cost_diff)}
                      </Text>
                    </td>
                  </tr>
                </tbody>
              </table>
              <Text strong>Rincian Material Formula</Text>
              <Table
                rowKey="material_no"
                columns={materialColumns}
                dataSource={record.materials || []}
                pagination={false}
                size="small"
                scroll={{ x: 2640 }}
              />
              <Text strong>Rincian Biaya Produksi</Text>
              <Table
                rowKey="cost_no"
                columns={productionColumns}
                dataSource={record.production_details || []}
                pagination={false}
                size="small"
                scroll={{ x: 1895 }}
                locale={{ emptyText: 'Tidak ada rincian biaya produksi' }}
              />
              <Text strong>Rekonsiliasi WIP</Text>
              <Table
                rowKey={(row, index) => `${row.tipe}-${row.pengeluaran_bahan || row.produksi_hasil || 'akhir'}-${index}`}
                columns={wipReconciliationColumns}
                dataSource={record.wip_reconciliation?.rows || []}
                loading={!!wipLoadingIds[record.wodet_id]}
                pagination={false}
                size="small"
                scroll={{ x: 1580 }}
                summary={() => renderWipSummary(record)}
                locale={{ emptyText: wipLoadingIds[record.wodet_id] ? 'Memuat rekonsiliasi WIP...' : 'Data rekonsiliasi WIP belum tersedia' }}
              />
            </Space>
          ),
          onExpand: (expanded, record) => {
            if (expanded) loadWipReconciliation(record)
          },
          rowExpandable: record => (
            (record.materials || []).length > 0
            || (record.production_details || []).length > 0
            || (record.wip_reconciliation?.rows || []).length > 0
          ),
        }}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          pageSizeOptions: ['5', '10', '50'],
          showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} item SPK`,
          onChange: (page, pageSize) => {
            pageRef.current = page
            pageSizeRef.current = pageSize
            fetchData(page, pageSize, searchRef.current, dateRangeRef.current, statusRef.current)
          },
        }}
        />
      </Card>
      <Modal
        title="Pilih Barang untuk Print"
        open={printModalOpen}
        onOk={handleConfirmPrintOptions}
        onCancel={() => setPrintModalOpen(false)}
        okText="Print"
        cancelText="Batal"
        width={760}
        confirmLoading={printLoading}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Checkbox
            checked={printOptions.length > 0 && selectedPrintKeys.length === printOptions.length}
            indeterminate={selectedPrintKeys.length > 0 && selectedPrintKeys.length < printOptions.length}
            onChange={event => {
              setSelectedPrintKeys(event.target.checked ? printOptions.map(getPrintKey) : [])
            }}
          >
            Pilih semua barang dalam SPK
          </Checkbox>
          <Table
            rowKey={getPrintKey}
            columns={printOptionColumns}
            dataSource={printOptions}
            pagination={false}
            size="small"
            loading={printLoading}
            rowSelection={{
              selectedRowKeys: selectedPrintKeys,
              onChange: keys => setSelectedPrintKeys(keys),
            }}
            scroll={{ y: 360 }}
          />
        </Space>
      </Modal>
      <style>{`
        .monitoring-formula-table .ant-table-container {
          border-radius: 8px;
        }
        .monitoring-formula-table .ant-table-header {
          position: sticky;
          top: 0;
          z-index: 5;
        }
        .monitoring-formula-table .ant-table-body {
          scrollbar-gutter: stable;
        }
        .cost-summary-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          border: 1px solid #f0f0f0;
          border-radius: 6px;
          overflow: hidden;
          background: #fff;
        }
        .cost-summary-table th,
        .cost-summary-table td {
          padding: 8px 12px;
          border-right: 1px solid #f0f0f0;
          border-bottom: 1px solid #f0f0f0;
          text-align: left;
          white-space: nowrap;
        }
        .cost-summary-table th {
          width: 14%;
          color: #64748b;
          font-weight: 500;
          background: #fafafa;
        }
        .cost-summary-table td {
          width: 19%;
        }
        .cost-summary-table tr:last-child th,
        .cost-summary-table tr:last-child td {
          border-bottom: 0;
        }
        .cost-summary-table th:last-child,
        .cost-summary-table td:last-child {
          border-right: 0;
        }
      `}</style>
    </>
  )
}
