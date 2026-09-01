import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, AutoComplete, Button, Card, DatePicker, Input, InputNumber, Modal, Select, Space, Statistic,
  Table, Tag, Typography, message,
} from 'antd'
import { CheckOutlined, CloseOutlined, DeleteOutlined, PrinterOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons'
import api from '../../api/client'
import dayjs from 'dayjs'
import { useAuth } from '../../context/AuthContext'
import { withTableSorters } from '../../utils/tableSorters'

const { Text, Title } = Typography
const { RangePicker } = DatePicker
const formatCurrency = value => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(Number(value || 0))
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]))
const formatPrintNumber = value => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))
const formatSubmissionDate = value => value && dayjs(value).isValid() ? dayjs(value).format('DD/MM/YYYY') : '-'

const STATUS_META = {
  available: ['Belum Diajukan', 'default'],
  submitted: ['Menunggu Manajemen', 'processing'],
  management_approved: ['Menunggu Eksekusi Finance', 'cyan'],
  approved: ['Menunggu Eksekusi Finance', 'cyan'],
  executed: ['Dieksekusi Finance', 'success'],
  rejected: ['Ditolak', 'error'],
  realized: ['Direalisasikan', 'blue'],
  draft: ['Siap Diajukan', 'cyan'],
}

const StatusTag = ({ value }) => {
  const [label, color] = STATUS_META[value] || [value || '-', 'default']
  return <Tag color={color}>{label}</Tag>
}

export default function PengajuanFee({ view = 'request', requestFeeType = null }) {
  const { user } = useAuth()
  const isMarketing = ['marketing', 'marketing_fee'].includes(user?.role)
  const canSubmit = isMarketing || user?.role === 'admin'
  const [rows, setRows] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [selectedKeys, setSelectedKeys] = useState([])
  const [selectedRowsByKey, setSelectedRowsByKey] = useState({})
  const [drafts, setDrafts] = useState({})
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [canExecute, setCanExecute] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [transactionDate, setTransactionDate] = useState(null)
  const [previewRate, setPreviewRate] = useState(null)
  const [cfCalculationMode, setCfCalculationMode] = useState('percentage')
  const [cfManualAmount, setCfManualAmount] = useState(null)
  const [cfTaxTreatment, setCfTaxTreatment] = useState('standard')
  const [cfTaxReason, setCfTaxReason] = useState('')
  const [cfRecipients, setCfRecipients] = useState([
    { recipient_name: '', payment_method: 'TF', bank_name: '', account_number: '', amount: null },
  ])
  const [bankNames, setBankNames] = useState([])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const params = { search: appliedSearch }
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD')
      const res = await api.get('/api/fee-submissions/sales-orders', { params })
      setRows(res.data.data || [])
    } catch (error) {
      setRows([])
      message.error(error.response?.data?.message || 'Gagal memuat AI-PP tahun 2026')
    } finally {
      setLoading(false)
    }
  }, [appliedSearch, dateRange])

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await api.get('/api/fee-submissions')
      const data = res.data.data || []
      setSubmissions(requestFeeType ? data.filter(row => row.fee_type === requestFeeType) : data)
      setCanManage(Boolean(res.data.can_manage))
      setCanExecute(Boolean(res.data.can_execute))
    } catch {
      setSubmissions([])
    }
  }, [requestFeeType])

  useEffect(() => {
    if (view === 'request') fetchRows()
    fetchSubmissions()
  }, [fetchRows, fetchSubmissions, view])

  useEffect(() => {
    if (requestFeeType !== 'CF') return
    api.get('/api/fee-submissions/banks')
      .then(res => setBankNames(res.data.data || []))
      .catch(() => {
        setBankNames([])
        message.error('Gagal memuat daftar bank')
      })
  }, [requestFeeType])

  const draftFor = record => drafts[record.so_no] || {
    include_mf: false,
    mf_rate_pct: 1,
    include_cf: false,
    cf_rate_pct: null,
  }
  const changeSelectedRows = keys => {
    const selected = new Set(keys)
    setSelectedKeys(keys)
    setSelectedRowsByKey(previous => {
      const next = {}
      keys.forEach(soNo => {
        const currentRow = rows.find(record => record.so_no === soNo)
        if (currentRow || previous[soNo]) next[soNo] = currentRow || previous[soNo]
      })
      return next
    })
    setDrafts(previous => {
      const next = { ...previous }
      rows.forEach(record => {
        const current = next[record.so_no] || { include_mf: false, mf_rate_pct: 1, include_cf: false, cf_rate_pct: null }
        const editableStatus = requestFeeType === 'MF' ? record.mf_status : record.cf_status
        const isNewSubmission = selected.has(record.so_no) && ['available', 'rejected'].includes(editableStatus)
        next[record.so_no] = {
          ...current,
          include_mf: requestFeeType === 'MF' ? isNewSubmission : false,
          include_cf: requestFeeType === 'CF' ? isNewSubmission : false,
        }
      })
      return next
    })
  }

  const clearSelectedRows = () => {
    setSelectedKeys([])
    setSelectedRowsByKey({})
    setDrafts({})
  }

  const validatedPayloadRows = ({ validateRate = true, rateOverride } = {}) => {
    const payloadRows = selectedKeys.map(soNo => {
      const row = { so_no: soNo, ...draftFor(selectedRowsByKey[soNo] || rows.find(item => item.so_no === soNo)) }
      if (rateOverride !== undefined && requestFeeType === 'MF') row.mf_rate_pct = rateOverride
      if (rateOverride !== undefined && requestFeeType === 'CF') row.cf_rate_pct = rateOverride
      if (requestFeeType === 'CF') {
        row.cf_calculation_mode = cfCalculationMode
        row.cf_manual_amount = Number(cfManualAmount || 0)
      }
      return row
    })
    if (!payloadRows.some(row => row.include_mf || row.include_cf)) {
      message.warning('Pilih MF atau CF yang akan diajukan')
      return null
    }
    const activeRows = payloadRows.filter(row => row.include_mf || row.include_cf)
    const selectedSalesmen = new Set(activeRows.map(row => (selectedRowsByKey[row.so_no] || rows.find(item => item.so_no === row.so_no))?.salesman_id).filter(value => value !== undefined && value !== null))
    if (selectedSalesmen.size > 1) {
      message.warning('Satu pengajuan hanya boleh berisi transaksi dari satu marketing')
      return null
    }
    if (requestFeeType === 'CF') {
      const selectedCustomers = new Set(activeRows.map(row => (
        selectedRowsByKey[row.so_no] || rows.find(item => item.so_no === row.so_no)
      )?.customer_no).filter(Boolean))
      if (selectedCustomers.size > 1) {
        message.warning('Satu pengajuan CF hanya boleh berisi transaksi dari satu customer')
        return null
      }
    }
    if (!validateRate) return payloadRows
    const invalidMf = payloadRows.find(row => row.include_mf && (Number(row.mf_rate_pct || 0) <= 0 || Number(row.mf_rate_pct || 0) > 100))
    if (invalidMf) {
      message.warning(`Isi persentase MF untuk ${invalidMf.so_no} (lebih dari 0 dan maksimal 100%)`)
      return null
    }
    const invalidCf = payloadRows.find(row => row.include_cf && row.cf_calculation_mode !== 'nominal' && (Number(row.cf_rate_pct || 0) <= 0 || Number(row.cf_rate_pct || 0) > 100))
    if (invalidCf) {
      message.warning(`Isi persentase CF untuk ${invalidCf.so_no} (lebih dari 0 dan maksimal 100%)`)
      return null
    }
    const invalidManualCf = payloadRows.find(row => row.include_cf && row.cf_calculation_mode === 'nominal' && Number(row.cf_manual_amount || 0) <= 0)
    if (invalidManualCf) {
      message.warning(`Isi nominal CF untuk ${invalidManualCf.so_no} (harus lebih dari 0)`)
      return null
    }
    return payloadRows
  }

  const openSubmissionPreview = () => {
    if (!validatedPayloadRows({ validateRate: false })) return
    setTransactionDate(null)
    setPreviewRate(requestFeeType === 'MF' ? 1 : null)
    if (requestFeeType === 'CF') {
      setCfCalculationMode('percentage')
      setCfManualAmount(null)
      setCfTaxTreatment('standard')
      setCfTaxReason('')
      setCfRecipients([{ recipient_name: '', payment_method: 'TF', bank_name: '', account_number: '', amount: null }])
    }
    setPreviewOpen(true)
  }

  const updateCfRecipient = (index, changes) => {
    setCfRecipients(previous => previous.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row))
  }

  const validateCfRecipients = () => {
    if (requestFeeType !== 'CF') return []
    const recipients = cfRecipients.map(row => ({
      ...row,
      amount: cfRecipients.length === 1 ? previewPayableTotal : Number(row.amount || 0),
    }))
    const invalidIndex = recipients.findIndex(row => (
      !row.recipient_name.trim()
      || !['TF', 'CASH'].includes(row.payment_method)
      || (row.payment_method === 'TF' && (!row.bank_name.trim() || !row.account_number.trim()))
      || row.amount <= 0
    ))
    if (invalidIndex >= 0) {
      message.warning(`Lengkapi data penerima CF ke-${invalidIndex + 1}`)
      return null
    }
    const allocated = recipients.reduce((sum, row) => sum + row.amount, 0)
    if (Math.abs(allocated - previewPayableTotal) > 0.5) {
      const difference = allocated - previewPayableTotal
      message.warning(`Total nominal penerima ${difference < 0 ? 'kurang' : 'lebih'} ${formatCurrency(Math.abs(difference))}`)
      return null
    }
    return recipients
  }

  const submitSelected = async () => {
    const payloadRows = validatedPayloadRows({ rateOverride: previewRate })
    if (!payloadRows) return
    if (!transactionDate) {
      message.warning('Pilih tanggal pengajuan terlebih dahulu')
      return
    }
    const recipients = validateCfRecipients()
    if (requestFeeType === 'CF' && !recipients) return
    if (requestFeeType === 'CF' && cfTaxTreatment === 'exempt' && !cfTaxReason.trim()) {
      message.warning('Alasan tanpa PPh 23 wajib diisi')
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post('/api/fee-submissions', {
        rows: payloadRows,
        transaction_date: transactionDate.format('YYYY-MM-DD'),
        ...(requestFeeType === 'CF' ? { cf_recipients: recipients } : {}),
        ...(requestFeeType === 'CF' && cfCalculationMode === 'nominal' ? { cf_manual_amount: Number(cfManualAmount || 0) } : {}),
        ...(requestFeeType === 'CF' ? { cf_tax_treatment: cfTaxTreatment, cf_tax_reason: cfTaxReason.trim() } : {}),
      })
      message.success(res.data.message)
      if (res.data.errors?.length) Modal.warning({ title: 'Sebagian pengajuan tidak diproses', content: res.data.errors.join('\n') })
      clearSelectedRows()
      setPreviewOpen(false)
      setTransactionDate(null)
      setPreviewRate(null)
      await Promise.all([fetchRows(), fetchSubmissions()])
    } catch (error) {
      const data = error.response?.data
      message.error(data?.message || 'Gagal mengirim pengajuan')
      if (data?.errors?.length) Modal.error({ title: 'Pengajuan tidak diproses', content: data.errors.join('\n') })
    } finally {
      setSubmitting(false)
    }
  }

  const review = async (record, action, note = '') => {
    try {
      const res = await api.post(`/api/fee-submissions/${record.id}/review`, { action, note })
      message.success(res.data.message)
      await Promise.all([fetchRows(), fetchSubmissions()])
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memproses pengajuan')
    }
  }

  const reject = record => {
    let note = ''
    Modal.confirm({
      title: `Tolak pengajuan ${record.batch_no || record.so_no}?`,
      content: <Input.TextArea rows={3} placeholder="Alasan penolakan (wajib)" onChange={event => { note = event.target.value }} />,
      okText: 'Tolak', okButtonProps: { danger: true }, cancelText: 'Batal',
      onOk: () => {
        if (!note.trim()) {
          message.warning('Alasan penolakan wajib diisi')
          return Promise.reject()
        }
        return review(record, 'reject', note.trim())
      },
    })
  }

  const execute = record => {
    let note = ''
    Modal.confirm({
      title: `Eksekusi pengajuan ${record.batch_no || record.so_no}?`,
      content: <Input.TextArea rows={3} placeholder="Catatan eksekusi Finance (opsional)" onChange={event => { note = event.target.value }} />,
      okText: 'Eksekusi',
      cancelText: 'Batal',
      onOk: async () => {
        try {
          const res = await api.post(`/api/fee-submissions/${record.id}/execute`, { note: note.trim() })
          message.success(res.data.message)
          await Promise.all([fetchRows(), fetchSubmissions()])
        } catch (error) {
          message.error(error.response?.data?.message || 'Gagal mengeksekusi pengajuan')
          return Promise.reject()
        }
      },
    })
  }

  const removeSubmission = record => {
    Modal.confirm({
      title: 'Hapus pengajuan?',
      content: record.items?.length
        ? `Pengajuan ${record.batch_no} beserta ${record.items.length} SO di dalamnya akan dihapus dan kembali ke daftar pengajuan.`
        : `Pengajuan ${record.fee_type} untuk ${record.so_no} akan dihapus permanen.`,
      okText: 'Hapus',
      okButtonProps: { danger: true },
      cancelText: 'Batal',
      onOk: async () => {
        try {
          const res = await api.delete(`/api/fee-submissions/${record.id}`)
          message.success(res.data.message)
          await Promise.all([fetchRows(), fetchSubmissions()])
        } catch (error) {
          message.error(error.response?.data?.message || 'Gagal menghapus pengajuan')
        }
      },
    })
  }

  const printDocument = (record, batchRows) => {
    if (!batchRows.length) {
      message.warning('Tidak ada data yang dapat dicetak')
      return
    }
    const feeType = record.fee_type
    const baseTotal = batchRows.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const total = feeType === 'CF' && Number(record.gross_amount || 0) > 0 ? Number(record.gross_amount) : baseTotal
    const pph = feeType === 'CF' && record.tax_amount !== undefined ? Number(record.tax_amount || 0) : total * 0.03
    const grandTotal = feeType === 'CF' && Number(record.net_amount || 0) > 0 ? Number(record.net_amount) : total - pph
    const submittedDate = new Date(record.transaction_date || record.submitted_at || Date.now())
    const dateText = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(submittedDate)
    const printedAt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date())
    const detailRows = batchRows.map((item, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(`${feeType}-${item.so_no}`)}</td>
        <td>${escapeHtml(`${item.salesman_name} ${feeType}-ATAS PO : ${item.customer_po || '-'}`)}</td>
        <td class="center">1</td><td class="center">LOT</td>
        <td class="amount">${formatPrintNumber(feeType === 'CF' ? item.dpp : item.amount)}</td>
      </tr>`).join('')
    const recipientRows = (record.recipients || []).map(recipient => {
      const paymentDetail = recipient.payment_method === 'CASH'
        ? 'Cash'
        : `${recipient.bank_name || '-'} / ${recipient.account_number || '-'}`
      return `<div>${escapeHtml(recipient.recipient_name)} / ${escapeHtml(paymentDetail)} / Rp ${formatPrintNumber(recipient.amount)}</div>`
    }).join('')
    const popup = window.open('', '_blank')
    if (!popup) {
      message.error('Popup print diblokir browser. Izinkan popup untuk dashboard ini.')
      return
    }
    popup.opener = null
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(record.batch_no)}</title><style>
      @page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:11px}.sheet{width:100%;min-height:277mm;padding:2mm 3mm;position:relative}.header{display:flex;justify-content:space-between;align-items:flex-start}.brand{display:flex;gap:10px;align-items:flex-start}.brand img{width:58px;height:58px;object-fit:contain}.company{font-size:11px;line-height:1.35}.company b{font-size:26px}.company b span{font-weight:400}.cert-logo{width:150px;height:70px;object-fit:contain;object-position:right top}.title{text-align:center;font-size:22px;font-weight:700;margin:16px 0 6px}.subtitle{text-align:center;font-size:20px;font-weight:700;letter-spacing:6px;margin-bottom:8px}.meta{display:flex;justify-content:space-between;font-size:13px;margin:4px 0 16px}.meta table td{padding:4px 5px}.items{width:100%;border-collapse:collapse;table-layout:fixed}.items th,.items td{border-left:1px solid #222;border-right:1px solid #222;padding:4px 5px}.items th{border-top:1px solid #222;border-bottom:1px solid #222;text-align:center}.items tbody{height:112mm;vertical-align:top}.items tbody tr:not(.spacer){height:23px}.items tbody tr:not(.spacer) td{height:23px;vertical-align:top}.items tbody tr.spacer{height:100%}.items tbody tr.spacer td{border-bottom:1px solid #222;padding:0}.items th:nth-child(1){width:5%}.items th:nth-child(2){width:18%}.items th:nth-child(3){width:45%}.items th:nth-child(4){width:8%}.items th:nth-child(5){width:8%}.items th:nth-child(6){width:16%}.center{text-align:center}.amount{text-align:right}.approval-total{display:flex;justify-content:space-between;margin-top:8px}.signatures{width:54%;display:flex;justify-content:space-around;text-align:center}.signatures div{width:29%;height:78px;border-bottom:1px solid #222}.totals{width:31%;border-collapse:collapse;font-size:12px}.totals td{padding:4px}.totals td:last-child{text-align:right}.notes{border:1px solid #222;height:45mm;margin-top:10px}.notes-title{text-align:center;border-bottom:1px solid #222;padding:4px}.notes-body{padding:6px}.footer{display:flex;justify-content:space-between;margin-top:10px;font-size:10px}@media print{button{display:none}.sheet{min-height:auto}}
    </style></head><body><div class="sheet">
      <div class="header"><div class="brand"><img src="${window.location.origin}/favicon-aqpa.png"/><div class="company"><b>AQPA <span>INDONESIA</span></b><br/>Jalan Raya Kedaung No. 20 RT. 001 RW. 004<br/>Cimuning, Mustikajaya, Kota Bekasi, Jawa Barat, 17155<br/>☎ +6221-8241-5897 | ✉ info@aqpa-indonesia.com<br/>NPWP : 0316 3040 7043 5000</div></div><img class="cert-logo" src="${window.location.origin}/tuv-logo-2025.jpg" alt="TUV Rheinland Certified"/></div>
      <div class="title">REQUEST PAYMENT</div><div class="subtitle">( ${feeType} )</div>
      <div class="meta"><table><tr><td>PAID TO</td><td>:</td><td><b>${escapeHtml(record.salesman_name)}</b></td></tr><tr><td>DATE</td><td>:</td><td>${escapeHtml(dateText)}</td></tr></table><table><tr><td>NO. ${feeType}</td><td>:</td><td>${escapeHtml(record.batch_no)}</td></tr><tr><td>PAGE</td><td>:</td><td>1 / 1</td></tr></table></div>
      <table class="items"><thead><tr><th>NO</th><th>NO. SO/PP</th><th>DESCRIPTION</th><th>QTY</th><th>UOM</th><th>AMOUNT</th></tr></thead><tbody>${detailRows}<tr class="spacer"><td></td><td></td><td></td><td></td><td></td><td></td></tr></tbody></table>
      <div class="approval-total"><div class="signatures"><div>Dibuat</div><div>Diperiksa</div><div>Disetujui</div></div><table class="totals"><tr><td>${feeType}${record.tax_treatment === 'gross_up' ? ' (Gross-up)' : record.tax_treatment === 'exempt' ? ' (Tanpa PPh)' : ' (Incl. PPh)'}</td><td>: RP.</td><td>${formatPrintNumber(total)}</td></tr><tr><td>PPH 23 -3%</td><td>: RP.</td><td>-${formatPrintNumber(pph)}</td></tr><tr><td><b>Grand Total</b></td><td>: RP.</td><td><b>${formatPrintNumber(grandTotal)}</b></td></tr></table></div>
      <div class="notes"><div class="notes-title">Note or Instruction</div><div class="notes-body">${recipientRows || 'As Per Excell'}</div></div>
      <div class="footer"><span>FIN/A03/F05- Rev.0</span><span>Printed on ${escapeHtml(printedAt)}</span><span>Halaman : 1 / 1</span></div>
    </div><script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`)
    popup.document.close()
  }

  const printBatch = record => {
    const batchRows = submissions.filter(item => item.batch_no && item.batch_no === record.batch_no)
    printDocument(record, batchRows)
  }

  const printSelected = feeType => {
    const draftRows = selectedKeys
      .map(soNo => selectedRowsByKey[soNo] || rows.find(row => row.so_no === soNo))
      .filter(Boolean)
      .filter(row => feeType === 'MF' ? draftFor(row).include_mf : draftFor(row).include_cf)
    const savedRows = selectedKeys
      .map(soNo => submissions.find(item => item.so_no === soNo && item.fee_type === feeType))
      .filter(Boolean)
    if (draftRows.length && savedRows.length) {
      message.warning('Pisahkan pilihan yang belum diajukan dan yang sudah diajukan saat Print')
      return
    }
    if (!draftRows.length && savedRows.length) {
      const salesmanIds = new Set(savedRows.map(row => row.salesman_id))
      if (salesmanIds.size > 1) {
        message.warning('Untuk Print, pilih SO dari marketing yang sama')
        return
      }
      const transactionDates = [...new Set(savedRows.map(row => row.transaction_date || '').filter(Boolean))]
      printDocument({
        ...savedRows[0],
        fee_type: feeType,
        batch_no: savedRows.length === 1 ? savedRows[0].batch_no : `REPRINT-${feeType}-${dayjs().format('YYYYMMDD')}`,
        transaction_date: transactionDates.length === 1 ? transactionDates[0] : (savedRows[0].transaction_date || savedRows[0].submitted_at),
      }, savedRows)
      return
    }
    if (!draftRows.length) {
      message.warning(`Pilih minimal satu AI-PP untuk ${feeType}`)
      return
    }
    const salesmanIds = new Set(draftRows.map(row => row.salesman_id))
    if (salesmanIds.size > 1) {
      message.warning('Untuk Print, pilih AI-PP dari marketing yang sama')
      return
    }
    const rateKey = feeType === 'MF' ? 'mf_rate_pct' : 'cf_rate_pct'
    if (draftRows.some(row => Number(draftFor(row)[rateKey] || 0) <= 0)) {
      message.warning(`Isi persentase ${feeType} terlebih dahulu`)
      return
    }
    const batchRows = draftRows.map(row => ({
      ...row,
      fee_type: feeType,
      rate_pct: Number(draftFor(row)[rateKey] || 0),
      amount: Number(row.dpp || 0) * Number(draftFor(row)[rateKey] || 0) / 100,
    }))
    const timestamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    printDocument({
      ...batchRows[0],
      fee_type: feeType,
      batch_no: `DRAFT-${feeType}-${timestamp}`,
      submitted_at: new Date().toISOString(),
    }, batchRows)
  }

  const transactionColumns = withTableSorters([
    { title: 'No SO', dataIndex: 'so_no', width: 145, fixed: 'left', render: value => <Text code>{value}</Text> },
    { title: 'No PO', dataIndex: 'customer_po', width: 190, ellipsis: true, render: value => value ? <Text code>{value}</Text> : '-' },
    { title: 'Tanggal SO', dataIndex: 'so_date', width: 110, render: formatSubmissionDate },
    {
      title: 'Tanggal Pengajuan', width: 145,
      render: (_, record) => {
        const mfDate = formatSubmissionDate(record.mf_transaction_date || record.mf_submitted_at)
        const cfDate = formatSubmissionDate(record.cf_transaction_date || record.cf_submitted_at)
        if (requestFeeType === 'MF') return mfDate === '-' ? <Text type="secondary">-</Text> : <Text>{mfDate}</Text>
        if (requestFeeType === 'CF') return cfDate === '-' ? <Text type="secondary">-</Text> : <Text>{cfDate}</Text>
        if (mfDate === '-' && cfDate === '-') return <Text type="secondary">-</Text>
        if (mfDate !== '-' && mfDate === cfDate) return <Text>{mfDate}</Text>
        return <Space direction="vertical" size={1}>
          {mfDate !== '-' && <Text><Text type="secondary">MF </Text>{mfDate}</Text>}
          {cfDate !== '-' && <Text><Text type="secondary">CF </Text>{cfDate}</Text>}
        </Space>
      },
    },
    { title: 'Customer', dataIndex: 'customer_name', width: 230, ellipsis: true },
    { title: 'Marketing', dataIndex: 'salesman_name', width: 170 },
    { title: 'DPP', dataIndex: 'dpp', width: 155, align: 'right', render: formatCurrency },
    {
      title: 'Status Pengajuan', width: 190,
      render: (_, record) => {
        const draft = draftFor(record)
        return (
          <Space direction="vertical" size={5}>
            {requestFeeType !== 'CF' && <Space size={6}><Text type="secondary" style={{ width: 22 }}>MF</Text><StatusTag value={draft.include_mf ? 'draft' : record.mf_status} /></Space>}
            {requestFeeType !== 'MF' && <Space size={6}><Text type="secondary" style={{ width: 22 }}>CF</Text><StatusTag value={draft.include_cf ? 'draft' : record.cf_status} /></Space>}
          </Space>
        )
      },
    },
  ])

  const approvalRows = useMemo(() => {
    const grouped = new Map()
    submissions.forEach(item => {
      const key = item.batch_id ? `batch-${item.batch_id}` : (item.batch_no ? `batch-no-${item.batch_no}` : `submission-${item.id}`)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(item)
    })
    return Array.from(grouped.entries()).map(([key, items]) => {
      const first = items[0]
      const statuses = [...new Set(items.map(item => item.status))]
      const rates = [...new Set(items.map(item => Number(item.rate_pct || 0)))]
      return {
        ...first,
        key,
        items,
        so_count: items.length,
        po_count: new Set(items.map(item => String(item.customer_po || '').trim()).filter(Boolean)).size,
        dpp: items.reduce((sum, item) => sum + Number(item.dpp || 0), 0),
        amount: items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        rate_pct: rates.length === 1 ? rates[0] : null,
        status: statuses.length === 1 ? statuses[0] : (statuses.includes('submitted') ? 'submitted' : statuses[0]),
        review_note: [...new Set(items.map(item => item.review_note).filter(Boolean))].join('; '),
      }
    })
  }, [submissions])

  const approvalDetailColumns = withTableSorters([
    { title: 'No SO', dataIndex: 'so_no', width: 150, render: value => <Text code>{value}</Text> },
    { title: 'No PO', dataIndex: 'customer_po', width: 210, render: value => value ? <Text code>{value}</Text> : '-' },
    { title: 'Customer', dataIndex: 'customer_name', width: 230, ellipsis: true },
    { title: 'DPP', dataIndex: 'dpp', width: 155, align: 'right', render: formatCurrency },
    { title: '% / Mode', dataIndex: 'rate_pct', width: 110, align: 'right', render: (value, record) => record.calculation_mode === 'nominal' ? 'Nominal' : `${Number(value || 0)}%` },
    { title: 'Nilai', dataIndex: 'amount', width: 155, align: 'right', render: formatCurrency },
  ])
  const recipientColumns = [
    { title: 'Nama Penerima', dataIndex: 'recipient_name', width: 220 },
    { title: 'Metode', dataIndex: 'payment_method', width: 90, render: value => value === 'TF' ? 'Transfer' : 'Cash' },
    { title: 'Bank', dataIndex: 'bank_name', width: 130, render: value => value || '-' },
    { title: 'No. Rekening', dataIndex: 'account_number', width: 170, render: value => value || '-' },
    { title: 'Nominal', dataIndex: 'amount', width: 170, align: 'right', render: formatCurrency },
  ]

  const submissionColumns = withTableSorters([
    { title: 'No. Pengajuan', dataIndex: 'batch_no', width: 175, render: value => value ? <Text code>{value}</Text> : '-' },
    { title: 'No SO', dataIndex: 'so_no', width: 145, render: (value, record) => record.items ? <Tag color="blue">{record.so_count} SO</Tag> : <Text code>{value}</Text> },
    { title: 'No PO', dataIndex: 'customer_po', width: 190, ellipsis: true, render: (value, record) => record.items ? <Tag color="cyan">{record.po_count} PO</Tag> : (value ? <Text code>{value}</Text> : '-') },
    { title: 'Jenis', dataIndex: 'fee_type', width: 80, render: value => <Tag color={value === 'MF' ? 'green' : 'purple'}>{value}</Tag> },
    { title: 'Marketing', dataIndex: 'salesman_name', width: 180 },
    { title: 'DPP', dataIndex: 'dpp', width: 155, align: 'right', render: formatCurrency },
    { title: '% / Mode', dataIndex: 'rate_pct', width: 110, align: 'right', render: (value, record) => record.calculation_mode === 'nominal' ? 'Nominal' : (value === null ? 'Bervariasi' : `${Number(value || 0)}%`) },
    { title: 'Nilai', dataIndex: 'amount', width: 155, align: 'right', render: formatCurrency },
    {
      title: 'Perlakuan PPh', dataIndex: 'tax_treatment', width: 155,
      render: (value, record) => record.fee_type !== 'CF' ? '-' : ({
        standard: 'Potong PPh 23', gross_up: 'Gross-up', exempt: 'Tanpa PPh 23',
      }[value] || 'Potong PPh 23'),
    },
    { title: 'PPh 23', dataIndex: 'tax_amount', width: 140, align: 'right', render: (value, record) => record.fee_type === 'CF' ? formatCurrency(value) : '-' },
    { title: 'Grand Total', dataIndex: 'net_amount', width: 155, align: 'right', render: (value, record) => record.fee_type === 'CF' ? formatCurrency(value) : '-' },
    { title: 'Alasan Tanpa PPh', dataIndex: 'tax_reason', width: 220, ellipsis: true, render: (value, record) => record.fee_type === 'CF' ? (value || '-') : '-' },
    { title: 'Tanggal Pengajuan', dataIndex: 'transaction_date', width: 145, render: (_, record) => formatSubmissionDate(record.transaction_date || record.submitted_at) },
    { title: 'Status', dataIndex: 'status', width: 145, render: value => <StatusTag value={value} /> },
    { title: 'Catatan Manajemen', dataIndex: 'review_note', width: 220, ellipsis: true, render: value => value || '-' },
    { title: 'Disetujui Oleh', dataIndex: 'reviewed_by', width: 140, render: value => value || '-' },
    { title: 'Dieksekusi Oleh', dataIndex: 'executed_by', width: 140, render: value => value || '-' },
    { title: 'Waktu Eksekusi', dataIndex: 'executed_at', width: 160, render: formatSubmissionDate },
    { title: 'Catatan Finance', dataIndex: 'execution_note', width: 220, ellipsis: true, render: value => value || '-' },
    {
      title: 'Aksi', width: view === 'approval' ? 260 : 190, fixed: 'right',
      render: (_, record) => (
        <Space>
          {view === 'request' && record.batch_no && <Button size="small" icon={<PrinterOutlined />} onClick={() => printBatch(record)}>Print</Button>}
          {view === 'approval' && canManage && record.status === 'submitted' && <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => review(record, 'approve')}>Setujui</Button>}
          {view === 'approval' && canManage && record.status === 'submitted' && <Button danger size="small" icon={<CloseOutlined />} onClick={() => reject(record)}>Tolak</Button>}
          {view === 'approval' && canManage && ['submitted', 'management_approved', 'rejected'].includes(record.status) && <Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => removeSubmission(record)}>Hapus</Button>}
          {view === 'approval' && canExecute && record.status === 'management_approved' && <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => execute(record)}>Eksekusi</Button>}
        </Space>
      ),
    },
  ])

  const summary = useMemo(() => {
    const statusKey = requestFeeType === 'MF' ? 'mf_status' : 'cf_status'
    const statuses = rows.map(row => row[statusKey] || 'available')
    return {
      realized: statuses.filter(status => status === 'realized').length,
      submitted: statuses.filter(status => !['available', 'realized'].includes(status)).length,
      available: statuses.filter(status => status === 'available').length,
      pendingManagement: approvalRows.filter(row => row.status === 'submitted').length,
      pendingFinance: approvalRows.filter(row => ['management_approved', 'approved'].includes(row.status)).length,
    }
  }, [rows, approvalRows, requestFeeType])
  const selectedMfCount = selectedKeys.filter(soNo => draftFor(selectedRowsByKey[soNo] || {}).include_mf).length
  const selectedCfCount = selectedKeys.filter(soNo => draftFor(selectedRowsByKey[soNo] || {}).include_cf).length
  const selectedMfSavedCount = selectedKeys.filter(soNo => submissions.some(item => item.so_no === soNo && item.fee_type === 'MF')).length
  const selectedCfSavedCount = selectedKeys.filter(soNo => submissions.some(item => item.so_no === soNo && item.fee_type === 'CF')).length
  const printableMfCount = selectedMfSavedCount
  const printableCfCount = selectedCfSavedCount
  const previewSelectionCount = requestFeeType === 'MF' ? selectedMfCount : selectedCfCount
  const previewFeeType = requestFeeType || (selectedMfCount ? 'MF' : 'CF')
  const previewRows = selectedKeys
    .map(soNo => selectedRowsByKey[soNo] || rows.find(row => row.so_no === soNo))
    .filter(Boolean)
    .filter(row => previewFeeType === 'MF' ? draftFor(row).include_mf : draftFor(row).include_cf)
    .map((row, index, sourceRows) => {
      const rate = Number(previewRate) || 0
      let amount = Number(row.dpp || 0) * rate / 100
      if (requestFeeType === 'CF' && cfCalculationMode === 'nominal') {
        const manualTotal = Number(cfManualAmount || 0)
        const totalDpp = sourceRows.reduce((sum, item) => sum + Number(item.dpp || 0), 0)
        const allocatedBefore = sourceRows.slice(0, index).reduce((sum, item) => (
          sum + Math.round((totalDpp ? manualTotal * Number(item.dpp || 0) / totalDpp : manualTotal / sourceRows.length) * 100) / 100
        ), 0)
        amount = index === sourceRows.length - 1
          ? manualTotal - allocatedBefore
          : Math.round((totalDpp ? manualTotal * Number(row.dpp || 0) / totalDpp : manualTotal / sourceRows.length) * 100) / 100
      }
      return { ...row, rate_pct: rate, calculation_mode: requestFeeType === 'CF' ? cfCalculationMode : 'percentage', amount }
    })
  const previewTotal = previewRows.reduce((sum, row) => sum + row.amount, 0)
  const previewDppTotal = previewRows.reduce((sum, row) => sum + Number(row.dpp || 0), 0)
  const previewGrossTotal = requestFeeType === 'CF' && cfTaxTreatment === 'gross_up'
    ? previewTotal / 0.97
    : previewTotal
  const previewPph = requestFeeType === 'CF' && cfTaxTreatment === 'exempt'
    ? 0
    : previewGrossTotal * 0.03
  const previewPayableTotal = requestFeeType === 'CF' && cfTaxTreatment === 'gross_up'
    ? previewTotal
    : previewGrossTotal - previewPph
  const effectiveCfRecipients = cfRecipients.map(row => ({
    ...row,
    amount: cfRecipients.length === 1 ? previewPayableTotal : Number(row.amount || 0),
  }))
  const cfRecipientsTotal = effectiveCfRecipients.reduce((sum, row) => sum + row.amount, 0)
  const cfRecipientDifference = cfRecipientsTotal - previewPayableTotal
  const printSubmissionPreview = () => {
    if (!transactionDate) {
      message.warning('Pilih tanggal pengajuan terlebih dahulu')
      return
    }
    if (!(requestFeeType === 'CF' && cfCalculationMode === 'nominal') && (Number(previewRate || 0) <= 0 || Number(previewRate || 0) > 100)) {
      message.warning(`Isi persentase ${previewFeeType} terlebih dahulu`)
      return
    }
    if (requestFeeType === 'CF' && cfCalculationMode === 'nominal') {
      if (Number(cfManualAmount || 0) <= 0) {
        message.warning('Isi total nominal CF')
        return
      }
    }
    const recipients = validateCfRecipients()
    if (requestFeeType === 'CF' && !recipients) return
    if (requestFeeType === 'CF' && cfTaxTreatment === 'exempt' && !cfTaxReason.trim()) {
      message.warning('Alasan tanpa PPh 23 wajib diisi')
      return
    }
    printDocument({
      ...previewRows[0],
      fee_type: previewFeeType,
      batch_no: `DRAFT-${previewFeeType}-${transactionDate.format('YYYYMMDD')}`,
      transaction_date: transactionDate.format('YYYY-MM-DD'),
      submitted_at: new Date().toISOString(),
      ...(requestFeeType === 'CF' ? {
        recipients,
        tax_treatment: cfTaxTreatment,
        tax_amount: previewPph,
        gross_amount: previewGrossTotal,
        net_amount: previewPayableTotal,
        tax_reason: cfTaxReason.trim(),
      } : {}),
    }, previewRows.map(row => ({ ...row, fee_type: previewFeeType })))
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 4 }}>{view === 'request' ? `Pengajuan ${requestFeeType || 'CF & MF'}` : 'Persetujuan CF & MF'}</Title>
      {view === 'approval' && <Text type="secondary">{canManage ? 'Persetujuan pengajuan CF/MF oleh Manajemen.' : 'Eksekusi pengajuan CF/MF yang telah disetujui Manajemen oleh Finance.'}</Text>}
      <Space wrap style={{ margin: '16px 0' }}>
        {view === 'request' && <Card size="small" style={{ minWidth: 160 }}><Statistic title="Direalisasikan" value={summary.realized} valueStyle={{ color: '#1677ff' }} /></Card>}
        {view === 'request' && <Card size="small" style={{ minWidth: 160 }}><Statistic title="Diajukan" value={summary.submitted} valueStyle={{ color: '#fa8c16' }} /></Card>}
        {view === 'request' && <Card size="small" style={{ minWidth: 160 }}><Statistic title="Belum Diajukan" value={summary.available} /></Card>}
        {view === 'approval' && canManage && <Card size="small"><Statistic title="Menunggu Manajemen" value={summary.pendingManagement} /></Card>}
        {view === 'approval' && canExecute && <Card size="small"><Statistic title="Menunggu Eksekusi Finance" value={summary.pendingFinance} /></Card>}
      </Space>
      {view === 'request' ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          showIcon
          type="info"
          message="Cara membuat pengajuan"
          description={`Pilih SO yang akan diajukan, lalu klik Pratinjau. Tanggal dan satu persentase ${requestFeeType || 'fee'} untuk seluruh SO terpilih diisi di dalam Pratinjau sebelum dikirim ke Manajemen.`}
        />
        {selectedKeys.length > 0 && (
          <Alert
            showIcon
            type="success"
            message={`${selectedKeys.length} transaksi telah dicentang`}
            description="Pilihan tetap tersimpan saat berpindah halaman, menggunakan pencarian, atau mengubah filter."
            action={<Button size="small" danger onClick={clearSelectedRows}>Batalkan Semua Pilihan</Button>}
          />
        )}
        <Card
            extra={<Space wrap><RangePicker value={dateRange} format="DD/MM/YYYY" allowClear={false} onChange={dates => setDateRange(dates || [dayjs().startOf('month'), dayjs().endOf('month')])} /><Input.Search allowClear placeholder="Cari AI-PP/customer/marketing" value={search} onChange={event => { setSearch(event.target.value); if (!event.target.value) setAppliedSearch('') }} onSearch={() => setAppliedSearch(search)} style={{ width: 280 }} /><Button icon={<ReloadOutlined />} onClick={fetchRows}>Muat Ulang</Button>{requestFeeType !== 'CF' && canSubmit && <Button icon={<PrinterOutlined />} disabled={!printableMfCount} onClick={() => printSelected('MF')}>Print MF ({printableMfCount})</Button>}{requestFeeType !== 'MF' && canSubmit && <Button icon={<PrinterOutlined />} disabled={!printableCfCount} onClick={() => printSelected('CF')}>Print CF ({printableCfCount})</Button>}{canSubmit && <Button type="primary" icon={<SendOutlined />} disabled={!previewSelectionCount} onClick={openSubmissionPreview}>Pratinjau ({previewSelectionCount})</Button>}</Space>}
        >
          <Table rowKey="so_no" loading={loading} columns={transactionColumns} dataSource={rows} size="small" tableLayout="fixed" scroll={{ x: 1400 }} rowSelection={canSubmit ? { selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: changeSelectedRows } : undefined} pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200] }} />
        </Card>
        <Card title="Daftar Pengajuan" extra={<Button icon={<ReloadOutlined />} onClick={fetchSubmissions}>Muat Ulang</Button>}>
          <Table rowKey="id" columns={submissionColumns} dataSource={submissions} size="small" scroll={{ x: 1650 }} pagination={{ pageSize: 20, showSizeChanger: true }} />
        </Card>
        </Space>
      ) : (
        <Card title={canManage ? `Persetujuan Manajemen (${summary.pendingManagement})` : canExecute ? `Eksekusi Finance (${summary.pendingFinance})` : 'Daftar Pengajuan'} extra={<Button icon={<ReloadOutlined />} onClick={fetchSubmissions}>Muat Ulang</Button>}>
          <Table
            rowKey="key"
            columns={submissionColumns}
            dataSource={approvalRows}
            size="small"
            scroll={{ x: 2200 }}
            expandable={{
              expandedRowRender: record => (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Table rowKey="id" columns={approvalDetailColumns} dataSource={record.items} size="small" pagination={false} scroll={{ x: 980 }} />
                  {record.fee_type === 'CF' && record.recipients?.length > 0 && (
                    <>
                      <Text strong>Rincian Penerima CF</Text>
                      <Table rowKey="id" columns={recipientColumns} dataSource={record.recipients} size="small" pagination={false} scroll={{ x: 780 }} />
                    </>
                  )}
                </Space>
              ),
              rowExpandable: record => record.items?.length > 0,
            }}
            pagination={{ pageSize: 50, showSizeChanger: true }}
          />
        </Card>
      )}
      <Modal
        open={previewOpen}
        width={920}
        title={`Pratinjau Pengajuan ${previewFeeType}`}
        onCancel={() => !submitting && setPreviewOpen(false)}
        footer={[
          <Button key="cancel" disabled={submitting} onClick={() => setPreviewOpen(false)}>Kembali</Button>,
          <Button key="print" icon={<PrinterOutlined />} disabled={!transactionDate || ((requestFeeType !== 'CF' || cfCalculationMode !== 'nominal') && !previewRate) || submitting} onClick={printSubmissionPreview}>Print</Button>,
          <Button key="submit" type="primary" icon={<SendOutlined />} loading={submitting} disabled={!transactionDate || ((requestFeeType !== 'CF' || cfCalculationMode !== 'nominal') && !previewRate)} onClick={submitSelected}>Ajukan ke Manajemen</Button>,
        ]}
      >
        <div style={{ background: '#fff', border: '1px solid #d9d9d9', padding: '24px 28px', color: '#111', fontFamily: 'Arial, sans-serif' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 11, lineHeight: 1.45 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <img src="/favicon-aqpa.png" alt="AQPA" style={{ width: 54, height: 54, objectFit: 'contain' }} />
              <div><b style={{ fontSize: 24 }}>AQPA INDONESIA</b><br />Jalan Raya Kedaung No. 20 RT. 001 RW. 004<br />Cimuning, Mustikajaya, Kota Bekasi, Jawa Barat, 17155<br />NPWP : 0316 3040 7043 5000</div>
            </div>
            <img src="/tuv-logo-2025.jpg" alt="TUV Rheinland Certified" style={{ width: 150, height: 70, objectFit: 'contain', objectPosition: 'right top' }} />
          </div>
          <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, marginTop: 18 }}>REQUEST PAYMENT</div>
          <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, letterSpacing: 5 }}>( {previewFeeType} )</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0', alignItems: 'center' }}>
            <table><tbody>
              <tr><td>PAID TO</td><td style={{ padding: '3px 8px' }}>:</td><td><b>{previewRows[0]?.salesman_name || '-'}</b></td></tr>
              <tr><td>DATE</td><td style={{ padding: '3px 8px' }}>:</td><td><DatePicker value={transactionDate} onChange={setTransactionDate} format="DD/MM/YYYY" placeholder="Pilih tanggal pengajuan" allowClear={false} /></td></tr>
              {requestFeeType === 'CF' && <tr><td>MODE HITUNG</td><td style={{ padding: '3px 8px' }}>:</td><td><Select value={cfCalculationMode} options={[{ value: 'percentage', label: 'Persentase' }, { value: 'nominal', label: 'Nominal Manual Total' }]} onChange={setCfCalculationMode} style={{ width: 190 }} /></td></tr>}
              {(requestFeeType !== 'CF' || cfCalculationMode === 'percentage') && <tr><td>PERCENTAGE</td><td style={{ padding: '3px 8px' }}>:</td><td><Space size={5}><InputNumber min={0.01} max={100} precision={2} controls={false} placeholder="Isi persentase" value={previewRate} onChange={setPreviewRate} style={{ width: 145 }} /><Text>%</Text></Space></td></tr>}
            </tbody></table>
            <table><tbody><tr><td>NO. {previewFeeType}</td><td style={{ padding: '3px 8px' }}>:</td><td>DRAFT</td></tr><tr><td>PAGE</td><td style={{ padding: '3px 8px' }}>:</td><td>1 / 1</td></tr></tbody></table>
          </div>
          {requestFeeType === 'CF' && cfCalculationMode === 'nominal' && (
            <div style={{ marginBottom: 18, padding: 14, border: '1px solid #d9d9d9', borderRadius: 6 }}>
              <Space>
                <Text strong>Total Nominal CF</Text>
                <InputNumber
                  min={0}
                  controls={false}
                  value={cfManualAmount}
                  placeholder="Isi total nominal CF"
                  formatter={value => `Rp ${String(value ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`}
                  parser={value => Number(String(value || '').replace(/[^\d]/g, ''))}
                  onChange={setCfManualAmount}
                  style={{ width: 220 }}
                />
              </Space>
              <div style={{ marginTop: 8 }}><Text type="secondary">Nominal berlaku untuk seluruh SO terpilih dari customer yang sama.</Text></div>
            </div>
          )}
          {requestFeeType === 'CF' && (
            <div style={{ marginBottom: 18, padding: 14, border: '1px solid #d9d9d9', borderRadius: 6 }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space wrap>
                  <Text strong>Perlakuan PPh 23</Text>
                  <Select
                    value={cfTaxTreatment}
                    options={[
                      { value: 'standard', label: 'Potong PPh 23' },
                      { value: 'gross_up', label: 'Gross-up' },
                      { value: 'exempt', label: 'Tanpa PPh 23' },
                    ]}
                    onChange={value => {
                      setCfTaxTreatment(value)
                      if (value !== 'exempt') setCfTaxReason('')
                    }}
                    style={{ width: 180 }}
                  />
                </Space>
                {cfTaxTreatment === 'gross_up' && <Text type="secondary">Nilai bruto dinaikkan agar penerima memperoleh nilai CF secara penuh setelah pemotongan.</Text>}
                {cfTaxTreatment === 'exempt' && (
                  <Input.TextArea
                    rows={2}
                    value={cfTaxReason}
                    onChange={event => setCfTaxReason(event.target.value)}
                    placeholder="Alasan tanpa PPh 23 (wajib)"
                  />
                )}
              </Space>
            </div>
          )}
          {requestFeeType === 'CF' && (
            <div style={{ marginBottom: 18, padding: 14, border: '1px solid #d9d9d9', borderRadius: 6 }}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Text strong>Rincian Penerima CF</Text>
                  <Button size="small" onClick={() => setCfRecipients(previous => [...previous, { recipient_name: '', payment_method: 'TF', bank_name: '', account_number: '', amount: null }])}>Tambah Penerima</Button>
                </Space>
                {effectiveCfRecipients.map((recipient, index) => (
                  <Space key={index} wrap align="start" style={{ width: '100%' }}>
                    <Input placeholder="Nama penerima" value={recipient.recipient_name} onChange={event => updateCfRecipient(index, { recipient_name: event.target.value })} style={{ width: 180 }} />
                    <Select
                      value={recipient.payment_method}
                      options={[{ value: 'TF', label: 'Transfer' }, { value: 'CASH', label: 'Cash' }]}
                      onChange={value => updateCfRecipient(index, { payment_method: value, ...(value === 'CASH' ? { bank_name: '', account_number: '' } : {}) })}
                      style={{ width: 110 }}
                    />
                    <AutoComplete
                      disabled={recipient.payment_method === 'CASH'}
                      placeholder="Pilih atau ketik bank"
                      value={recipient.bank_name}
                      options={bankNames.map(name => ({ value: name, label: name }))}
                      filterOption={(inputValue, option) => String(option?.value || '').toLowerCase().includes(inputValue.toLowerCase())}
                      onChange={value => updateCfRecipient(index, { bank_name: value })}
                      style={{ width: 175 }}
                    />
                    <Input disabled={recipient.payment_method === 'CASH'} placeholder="No. rekening" value={recipient.account_number} onChange={event => updateCfRecipient(index, { account_number: event.target.value })} style={{ width: 160 }} />
                    <InputNumber
                      disabled={cfRecipients.length === 1}
                      min={0}
                      controls={false}
                      placeholder="Nominal"
                      value={recipient.amount}
                      formatter={value => `Rp ${String(value ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`}
                      parser={value => Number(String(value || '').replace(/[^\d]/g, ''))}
                      onChange={value => updateCfRecipient(index, { amount: value })}
                      style={{ width: 165 }}
                    />
                    {cfRecipients.length > 1 && <Button onClick={() => updateCfRecipient(index, { amount: Math.max(previewTotal - (cfRecipientsTotal - recipient.amount), 0) })}>Isi Sisa</Button>}
                    {cfRecipients.length > 1 && <Button danger type="text" onClick={() => setCfRecipients(previous => previous.filter((_, rowIndex) => rowIndex !== index))}>Hapus</Button>}
                  </Space>
                ))}
                <Alert
                  type={Math.abs(cfRecipientDifference) <= 0.5 ? 'success' : 'warning'}
                  showIcon
                  message={Math.abs(cfRecipientDifference) <= 0.5
                    ? `Total penerima sesuai: ${formatCurrency(cfRecipientsTotal)}`
                    : `Total penerima ${cfRecipientDifference < 0 ? 'kurang' : 'lebih'} ${formatCurrency(Math.abs(cfRecipientDifference))}`}
                />
              </Space>
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11 }}>
            <thead><tr>{['NO', 'NO. SO/PP', 'DESCRIPTION', 'QTY', 'UOM', 'AMOUNT'].map((label, index) => <th key={label} style={{ border: '1px solid #222', padding: 6, width: index === 0 ? '5%' : index === 1 ? '18%' : index === 2 ? '45%' : index === 5 ? '16%' : '8%' }}>{label}</th>)}</tr></thead>
            <tbody>
              {previewRows.map((row, index) => <tr key={row.so_no}><td style={{ border: '1px solid #222', padding: 6, textAlign: 'center' }}>{index + 1}</td><td style={{ border: '1px solid #222', padding: 6 }}>{previewFeeType}-{row.so_no}</td><td style={{ border: '1px solid #222', padding: 6 }}>{row.salesman_name} {previewFeeType}-ATAS PO : {row.customer_po || '-'}</td><td style={{ border: '1px solid #222', padding: 6, textAlign: 'center' }}>1</td><td style={{ border: '1px solid #222', padding: 6, textAlign: 'center' }}>LOT</td><td style={{ border: '1px solid #222', padding: 6, textAlign: 'right' }}>{formatPrintNumber(previewFeeType === 'CF' ? row.dpp : row.amount)}</td></tr>)}
              <tr><td colSpan={6} style={{ border: '1px solid #222', height: 70 }} /></tr>
            </tbody>
          </table>
          {requestFeeType === 'CF' && (
            <table style={{ width: '100%', tableLayout: 'fixed', marginTop: 8, fontSize: 11 }}>
              <tbody><tr>
                <td style={{ width: '5%' }} />
                <td style={{ width: '18%' }} />
                <td style={{ width: '45%' }} />
                <td style={{ width: '8%' }} />
                <td style={{ width: '8%', textAlign: 'right', paddingRight: 6 }}><Text strong>Total:</Text></td>
                <td style={{ width: '16%', textAlign: 'right' }}><Text strong>{formatCurrency(previewDppTotal)}</Text></td>
              </tr></tbody>
            </table>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <table style={{ minWidth: 285, fontSize: 12 }}><tbody><tr><td>{previewFeeType}{requestFeeType === 'CF' && cfTaxTreatment === 'gross_up' ? ' (Gross-up)' : requestFeeType === 'CF' && cfTaxTreatment === 'exempt' ? ' (Tanpa PPh)' : ' (Incl. PPh)'}</td><td>: RP.</td><td style={{ textAlign: 'right' }}>{formatPrintNumber(previewGrossTotal)}</td></tr><tr><td>PPH 23 -3%</td><td>: RP.</td><td style={{ textAlign: 'right' }}>-{formatPrintNumber(previewPph)}</td></tr><tr><td><b>Grand Total</b></td><td>: RP.</td><td style={{ textAlign: 'right' }}><b>{formatPrintNumber(previewPayableTotal)}</b></td></tr></tbody></table>
          </div>
        </div>
      </Modal>
    </div>
  )
}
