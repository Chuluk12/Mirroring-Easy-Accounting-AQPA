import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AutoComplete, Button, Card, Checkbox, Col, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import { ArrowLeftOutlined, CheckOutlined, CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, EyeOutlined, ImportOutlined, PlusOutlined, PrinterOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { withTableSorters } from '../../utils/tableSorters'
import { downloadWorkbookXLS } from '../../utils/exportXls'
import './DaftarQuotation.css'

const { Title, Text } = Typography
const money = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))
const currencyDigits = value => Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('id-ID') : ''
const rupiahFormatter = value => `Rp ${currencyDigits(value)}`
const idrFormatter = value => `IDR ${currencyDigits(value)}`
const idrMoney = value => `IDR ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(value || 0))}`
const rupiahParser = value => Number(String(value || '').replace(/[^\d]/g, ''))
const allocatableCosts = [
  ['cf_cost', 'cf_applied'],
  ['mf_cost', 'mf_applied'],
  ['installation_cost', 'installation_applied'],
  ['packing_cost', 'packing_applied'],
]
const normalizeItem = (item, costs = {}) => ({
  ...item,
  cf_applied: item?.cf_applied ?? Number(costs.cf_cost || 0) > 0,
  mf_applied: item?.mf_applied ?? Number(costs.mf_cost || 0) > 0,
  installation_applied: item?.installation_applied ?? Number(costs.installation_cost || 0) > 0,
  packing_applied: item?.packing_applied ?? Number(costs.packing_cost || 0) > 0,
  markup_pct: item?.markup_pct ?? null,
})
const emptyItem = () => normalizeItem({ item_no: '', description: '', qty: 1, uom: 'EA', unit_price: 0, hpp: 0 })
const internalCostKeys = ['cf_cost','mf_cost','installation_cost','shipping_cost','packing_cost','other_cost']
const statusMeta = { draft: ['Draft', 'default'], submitted: ['Menunggu Manajemen', 'processing'], approved: ['Disetujui', 'success'], rejected: ['Ditolak', 'error'], superseded: ['Digantikan', 'warning'] }
const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]))
const shortDate = value => value && dayjs(value).isValid() ? dayjs(value).format('DD/MM/YYYY') : '-'
const quotationNumber = record => record.base_quotation_no || record.quotation_no

function QuotationDetailDocument({ record }) {
  const costs = [
    ['Target Markup',record.target_margin_type==='nominal'?money(record.target_margin_value):`${Number(record.target_margin_value||0).toFixed(2)}% dari total biaya`],
    ['CF',record.cf_cost],['MF',record.mf_cost],['Instalasi',record.installation_cost],
    ['Pengiriman',record.shipping_cost],['Packing',record.packing_cost],['Lainnya',record.other_cost],
  ]
  return <>
    <div className="quotation-sheet quotation-readonly">
      <div className="quotation-letterhead"><img className="quotation-company" src="/quotation/aqpa-header.jpg" alt="AQPA Indonesia"/><img className="quotation-iso" src="/quotation/iso-certification.jpg" alt="ISO Certification"/></div>
      <div className="quotation-title">QUOTATION</div>
      <div className="quotation-meta">
        <div>{[['Customer',record.customer_name],['Address',record.customer_address],['Attention',record.attention],['Delivery To',record.delivery_to]].map(([label,value])=><div className="quotation-meta-line" key={label}><span>{label}</span><span>:</span><b>{value||'-'}</b></div>)}</div>
        <div>{[['Qtn Number',quotationNumber(record)],['Date',shortDate(record.quotation_date)],['Valid Until',shortDate(record.valid_until)],['Subject',record.subject||'Various'],['Revision',record.revision]].map(([label,value])=><div className="quotation-meta-line" key={label}><span>{label}</span><span>:</span><b>{value??'-'}</b></div>)}</div>
      </div>
      <table className="quotation-document-table"><thead><tr><th>NO</th><th>DESCRIPTION &amp; SPECIFICATION</th><th>QUANTITY</th><th>UOM</th><th>UNIT PRICE</th><th>TOTAL PRICE</th></tr></thead><tbody>
        {record.items.map((item,index)=><tr key={index}><td>{index+1}</td><td>{item.description}</td><td>{item.qty}</td><td>{item.uom}</td><td>{idrMoney(item.unit_price)}</td><td><b>{idrMoney(Number(item.qty||0)*Number(item.unit_price||0))}</b></td></tr>)}
        <tr className="quotation-document-filler"><td colSpan={6}></td></tr>
      </tbody></table>
      <div className="quotation-document-summary">
        <div><b>SUBTOTAL</b><span></span><span>IDR</span><b>{new Intl.NumberFormat('id-ID').format(record.subtotal)}</b></div>
        <div><b>DISCOUNT</b><b>{record.discount_type==='percentage'?`${record.discount_value}%`:''}</b><span>IDR</span><b>- {new Intl.NumberFormat('id-ID').format(record.discount_amount)}</b></div>
        <div><b>VAT</b><b>{record.vat_enabled?`${record.vat_rate}%`:'0%'}</b><span>IDR</span><b>{new Intl.NumberFormat('id-ID').format(record.vat_amount)}</b></div>
        <div><b>GRAND TOTAL</b><span></span><span>IDR</span><b>{new Intl.NumberFormat('id-ID').format(record.total_amount)}</b></div>
      </div>
      <div className="quotation-terms quotation-readonly-terms"><b><i>TERM CONDITIONS :</i></b>
        {[['Delivery Term',record.delivery_term],['Payment Terms',record.payment_terms],['Delivery time',record.delivery_time],['Scope of works',record.scope_of_works],['Price Validity',record.price_validity]].map(([label,value])=><div className="quotation-term-row" key={label}><span>{label}</span><span>:</span><b>{value||'-'}</b></div>)}
      </div>
      <div className="quotation-closing">Hoping this offer could meet your requirements and may we look forward to receiving your reply soonest.<br/><br/>Yours faithfully,<br/><b><i>PT AQPA INDONESIA</i></b><br/><br/><br/><i>{record.created_name}</i><br/><i>{record.marketing_phone||''}</i></div>
    </div>
    <Card className="quotation-internal quotation-detail-internal" title="Perhitungan Internal — Tidak Masuk Print Customer">
      <Table size="small" pagination={false} scroll={{x:1050}} rowKey={(_,i)=>i} dataSource={record.items} columns={[
        {title:'Deskripsi',dataIndex:'description',width:240},
        {title:'Qty',dataIndex:'qty',width:60},
        {title:'HPP/Unit',dataIndex:'hpp',width:130,render:money},
        ...[['CF','cf_applied'],['MF','mf_applied'],['Instalasi','installation_applied'],['Packaging','packing_applied']].map(([title,key])=>({title,key,width:85,align:'center',render:(_,item)=>item[key]!==false?'Ya':'Tidak'})),
        {title:'Markup',width:90,align:'right',render:(_,item)=>item.markup_pct == null ? 'Global' : `${Number(item.markup_pct).toLocaleString('id-ID',{maximumFractionDigits:2})}%`},
        {title:'Total HPP',width:140,render:(_,item)=>money(Number(item.qty||0)*Number(item.hpp||0))},
      ]}/>
      <Descriptions bordered size="small" column={3} style={{marginTop:14}} items={costs.map(([label,value])=>({key:label,label,children:label==='Target Markup'?value:money(value)}))}/>
      <Row gutter={12} style={{marginTop:16}}><Col span={6}><Statistic title="Penjualan Bersih" value={record.subtotal-record.discount_amount} formatter={money}/></Col><Col span={6}><Statistic title="Total HPP" value={record.total_hpp} formatter={money}/></Col><Col span={6}><Statistic title="Biaya Pendukung" value={record.total_internal_cost} formatter={money}/></Col><Col span={6}><Statistic title="Margin Penjualan Rencana" value={record.planned_margin} suffix={`(${Number(record.margin_pct).toFixed(1)}%)`} formatter={money}/></Col></Row>
      {record.review_note&&<div style={{marginTop:14}}><Text strong>Catatan Manajemen: </Text>{record.review_note}</div>}
    </Card>
  </>
}

export default function DaftarQuotation({ editorMode=false }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { quotationId } = useParams()
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [editing, setEditing] = useState(null)
  const [items, setItems] = useState([emptyItem()])
  const [customers, setCustomers] = useState([])
  const [costPercentages, setCostPercentages] = useState({})
  const [costInputModes, setCostInputModes] = useState({})
  const costInputModesRef = useRef({})
  const [form] = Form.useForm()
  const importInputRef = useRef(null)
  const customerWarningRef = useRef('')
  const [importing, setImporting] = useState(false)
  const watchedValues = Form.useWatch([], form) || {}
  const canApprove = user?.role === 'admin'

  const load = useCallback(async () => {
    const res = await api.get('/api/quotations')
    setRows(res.data.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const loadCustomers = async search => {
    const res = await api.get('/api/quotations/customers', { params: { search, limit: 30 } })
    setCustomers(res.data.data || [])
    if (res.data.warning && customerWarningRef.current !== res.data.warning) {
      customerWarningRef.current = res.data.warning
      message.warning(res.data.warning)
    }
  }
  const importExcel = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await api.post('/api/quotations/import', body)
      const imported = res.data.data || {}
      let source = 'manual'
      let matchedCustomer = null
      if (imported.customer_name) {
        const customerRes = await api.get('/api/customer', { params: { search: imported.customer_name, limit: 30 } })
        matchedCustomer = (customerRes.data.data || []).find(customer => customer.nama_pelanggan.trim().toLowerCase() === imported.customer_name.trim().toLowerCase())
        if (matchedCustomer) source = 'easy'
      }
      let importedDate = dayjs()
      if (imported.quotation_date_raw && /^\d+(\.\d+)?$/.test(imported.quotation_date_raw)) {
        importedDate = dayjs('1899-12-30').add(Number(imported.quotation_date_raw), 'day')
      } else if (imported.quotation_date_raw && dayjs(imported.quotation_date_raw).isValid()) {
        importedDate = dayjs(imported.quotation_date_raw)
      }
      form.setFieldsValue({
        ...imported,
        quotation_date: importedDate,
        customer_source: source,
        customer_no: matchedCustomer?.no_pelanggan || '',
        customer_name: matchedCustomer?.nama_pelanggan || imported.customer_name || '',
        customer_address: source === 'easy' ? (imported.customer_address || matchedCustomer?.alamat || '') : '',
      })
      setItems(imported.items?.length ? imported.items.map(item=>normalizeItem(item, imported)) : [emptyItem()])
      message.success(res.data.message)
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal membaca file penawaran')
    } finally {
      setImporting(false)
    }
  }
  const openForm = record => {
    if (!editorMode) {
      navigate(record ? `/quotation/daftar/${record.id}/edit` : '/quotation/daftar/buat')
      return
    }
    setEditing(record || null)
    setItems(record?.items?.length ? record.items.map(item=>normalizeItem(item, record)) : [emptyItem()])
    setCostPercentages({})
    setCostInputModes({})
    costInputModesRef.current = {}
    form.setFieldsValue(record ? {
      ...record, quotation_date: dayjs(record.quotation_date), valid_until: record.valid_until ? dayjs(record.valid_until) : null,
      cf_enabled: Number(record.cf_cost || 0) > 0,
      auto_price: record.auto_price !== 0 && record.auto_price !== false,
    } : {
      quotation_date: dayjs(), customer_source: 'manual', discount_type: 'percentage',
      discount_value: 0, vat_enabled: true, vat_rate: 11, cf_enabled: false,
      cf_cost: 0, mf_cost: 0, target_margin_type: 'percentage',
      target_margin_value: 0, auto_price: true,
    })
    loadCustomers('')
    setOpen(true)
  }
  useEffect(() => {
    if (!editorMode) return
    const prepareEditor = async () => {
      if (!quotationId) return openForm()
      const res = await api.get('/api/quotations')
      const record = (res.data.data || []).find(row=>String(row.id)===String(quotationId))
      if (!record) {
        message.error('Quotation tidak ditemukan')
        navigate('/quotation/daftar', {replace:true})
        return
      }
      openForm(record)
    }
    prepareEditor()
  }, [editorMode, quotationId])
  const updateItem = (index, patch) => setItems(previous => previous.map((item, i) => i === index ? { ...item, ...patch } : item))
  const itemsReady = items.length > 0 && items.every(item =>
    String(item.description || '').trim() &&
    String(item.uom || '').trim() &&
    Number(item.qty || 0) > 0 &&
    Number(item.hpp || 0) > 0
  )
  const supportingCostsReady = itemsReady && internalCostKeys.some(key => Number(watchedValues[key] || 0) > 0)
  const targetMarkup = Number(watchedValues.target_margin_value || 0)
  const targetReady = supportingCostsReady && targetMarkup > 0 &&
    (watchedValues.target_margin_type !== 'percentage' || targetMarkup <= 100)
  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0)
    const hpp = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.hpp || 0), 0)
    const values = form.getFieldsValue()
    const discount = values.discount_type === 'nominal' ? Number(values.discount_value || 0) : subtotal * Number(values.discount_value || 0) / 100
    const sales = Math.max(subtotal - discount, 0)
    const vat = values.vat_enabled ? sales * Number(values.vat_rate || 0) / 100 : 0
    const internal = internalCostKeys.reduce((sum, key) => sum + Number(values[key] || 0), 0)
    const margin = sales - hpp - internal
    return { subtotal, hpp, discount, sales, vat, total: sales + vat, internal, margin, marginPct: sales ? margin / sales * 100 : 0 }
  }, [items, watchedValues])
  const pricingPlan = useMemo(() => {
    const itemCost = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.hpp || 0), 0)
    const supportingCost = internalCostKeys.reduce((sum, key) => sum + Number(watchedValues[key] || 0), 0)
    const totalCost = itemCost + supportingCost
    const marginValue = Math.max(Number(watchedValues.target_margin_value || 0), 0)
    const globalMarkupPct = watchedValues.target_margin_type === 'nominal'
      ? (totalCost ? marginValue / totalCost * 100 : 0)
      : marginValue
    const lineBaseCosts = items.map(item => Number(item.qty || 0) * Number(item.hpp || 0))
    const allocations = items.map(() => ({ cf_cost: 0, mf_cost: 0, installation_cost: 0, packing_cost: 0, shipping_cost: 0, other_cost: 0, total: 0 }))
    allocatableCosts.forEach(([costKey, appliedKey]) => {
      const hasSelectedItem = items.some(item => item[appliedKey] === true)
      const isEligible = item => hasSelectedItem ? item[appliedKey] === true : true
      const eligibleCost = items.reduce((sum, item, index) => isEligible(item) ? sum + lineBaseCosts[index] : sum, 0)
      items.forEach((item, index) => {
        if (isEligible(item) && eligibleCost > 0) {
          allocations[index][costKey] = Number(watchedValues[costKey] || 0) * lineBaseCosts[index] / eligibleCost
        }
      })
    })
    ;['shipping_cost', 'other_cost'].forEach(costKey => {
      items.forEach((_, index) => {
        allocations[index][costKey] = itemCost > 0 ? Number(watchedValues[costKey] || 0) * lineBaseCosts[index] / itemCost : 0
      })
    })
    allocations.forEach(allocation => {
      allocation.total = internalCostKeys.reduce((sum, key) => sum + Number(allocation[key] || 0), 0)
    })
    const lineCosts = lineBaseCosts.map((cost, index) => cost + allocations[index].total)
    const lineMarkups = items.map(item => item.markup_pct == null ? globalMarkupPct : Math.max(Number(item.markup_pct || 0), 0))
    const lineProfits = lineCosts.map((cost, index) => cost * lineMarkups[index] / 100)
    const targetProfit = lineProfits.reduce((sum, value) => sum + value, 0)
    const targetNetSales = totalCost + targetProfit
    const discountValue = Math.max(Number(watchedValues.discount_value || 0), 0)
    const discountRate = watchedValues.discount_type === 'percentage' ? Math.min(discountValue, 99.99) / 100 : 0
    const nominalDiscountShares = lineCosts.map(cost => totalCost > 0 ? discountValue * cost / totalCost : 0)
    const lineSubtotals = items.map((item, index) => {
      const targetLineSales = lineCosts[index] + lineProfits[index]
      return watchedValues.discount_type === 'nominal'
        ? targetLineSales + nominalDiscountShares[index]
        : targetLineSales / (1 - discountRate)
    })
    const targetSubtotal = lineSubtotals.reduce((sum, value) => sum + value, 0)
    const unitPrices = items.map((item, index) => {
      const qty = Number(item.qty || 0)
      return qty > 0 ? Math.round(lineSubtotals[index] / qty) : 0
    })
    return { itemCost, supportingCost, totalCost, targetProfit, targetNetSales, targetSubtotal, unitPrices, allocations, lineCosts, lineMarkups }
  }, [
    items,
    watchedValues.cf_cost, watchedValues.mf_cost, watchedValues.installation_cost,
    watchedValues.shipping_cost, watchedValues.packing_cost, watchedValues.other_cost,
    watchedValues.target_margin_type, watchedValues.target_margin_value,
    watchedValues.discount_type, watchedValues.discount_value,
  ])
  const suggestedPriceKey = pricingPlan.unitPrices.join('|')
  useEffect(() => {
    if (!watchedValues.auto_price) return
    setItems(previous => {
      let changed = false
      const next = previous.map((item, index) => {
        const suggested = pricingPlan.unitPrices[index] || 0
        if (Number(item.unit_price || 0) === suggested) return item
        changed = true
        return { ...item, unit_price: suggested }
      })
      return changed ? next : previous
    })
  }, [watchedValues.auto_price, suggestedPriceKey])
  useEffect(() => {
    const percentageKeys=internalCostKeys.filter(key=>costInputModesRef.current[key]==='percentage' && !(key==='cf_cost'&&!watchedValues.cf_enabled))
    if (!percentageKeys.length) return
    const rate=percentageKeys.reduce((sum,key)=>sum+Number(costPercentages[key]||0)/100,0)
    const fixedSupporting=internalCostKeys.reduce((sum,key)=>sum+(percentageKeys.includes(key)||(key==='cf_cost'&&!watchedValues.cf_enabled)?0:Number(watchedValues[key]||0)),0)
    let targetSales=totals.sales
    if (watchedValues.auto_price) {
      const base=pricingPlan.itemCost+fixedSupporting
      const target=Number(watchedValues.target_margin_value||0)
      targetSales=watchedValues.target_margin_type==='nominal'
        ? (base+target)/Math.max(1-rate,0.0001)
        : base*(1+target/100)/Math.max(1-rate*(1+target/100),0.0001)
    }
    percentageKeys.forEach(key=>{
      const nominal=targetSales*Number(costPercentages[key]||0)/100
      if (Math.abs(Number(watchedValues[key]||0)-nominal)>0.5) form.setFieldValue(key,nominal)
    })
  }, [costPercentages, costInputModes, items, watchedValues.auto_price, watchedValues.cf_enabled, watchedValues.target_margin_type, watchedValues.target_margin_value, ...internalCostKeys.map(key=>watchedValues[key])])
  const internalCostPercent = key => costInputModes[key]==='percentage'
    ? Number(costPercentages[key]||0)
    : (totals.sales ? Number(watchedValues[key] || 0) / totals.sales * 100 : 0)
  const setInternalCostPercent = (key, percent) => {
    costInputModesRef.current={...costInputModesRef.current,[key]:'percentage'}
    setCostInputModes(previous=>({...previous,[key]:'percentage'}))
    setCostPercentages(previous=>({...previous,[key]:Number(percent||0)}))
    const appliedKey=allocatableCosts.find(([costKey])=>costKey===key)?.[1]
    if (appliedKey) {
      if (Number(percent || 0) <= 0) {
        setItems(previous=>previous.map(item=>({...item,[appliedKey]:false})))
      } else {
        setItems(previous=>previous.some(item=>item[appliedKey]===true)
          ? previous
          : previous.map(item=>({...item,[appliedKey]:true})))
      }
    }
  }
  const setInternalCostRupiahMode = key => {
    costInputModesRef.current={...costInputModesRef.current,[key]:'rupiah'}
    setCostInputModes(previous=>({...previous,[key]:'rupiah'}))
  }

  const save = async () => {
    const values = await form.validateFields()
    if (!itemsReady) return message.error('Lengkapi deskripsi, quantity, UOM, dan harga modal seluruh barang')
    if (!supportingCostsReady) return message.error('Isi minimal satu biaya pendukung sebelum menentukan Target Markup')
    if (Number(values.target_margin_value || 0) <= 0) return message.error('Target Markup wajib diisi lebih dari 0')
    if (values.target_margin_type === 'percentage' && Number(values.target_margin_value || 0) > 100) {
      return message.error('Target Markup tidak boleh lebih dari 100%')
    }
    if (items.some(item => item.markup_pct != null && Number(item.markup_pct) > 100)) {
      return message.error('Target Markup pada tabel barang tidak boleh lebih dari 100%')
    }
    if (!items.length || items.some(item => !item.description || Number(item.qty || 0) <= 0)) return message.warning('Lengkapi item quotation')
    const withoutCost = items.find(item => Number(item.hpp || 0) <= 0)
    if (withoutCost) return message.error(`Isi Harga Modal ${withoutCost.description || 'item'} sebelum mengisi Unit Price`)
    const belowCost = items.find(item => Number(item.unit_price || 0) < Number(item.hpp || 0))
    if (belowCost) return message.error(`Unit Price ${belowCost.description || 'item'} tidak boleh lebih rendah dari Harga Modal`)
    const unallocatedCost = allocatableCosts.find(([costKey, appliedKey]) =>
      Number(values[costKey] || 0) > 0 && !items.some(item => item[appliedKey] !== false)
    )
    if (unallocatedCost) {
      const labels = { cf_cost:'CF', mf_cost:'MF', installation_cost:'Instalasi', packing_cost:'Packaging' }
      return message.error(`Pilih minimal satu barang yang dibebani biaya ${labels[unallocatedCost[0]]}`)
    }
    const payload = {
      ...values,
      cf_cost: values.cf_enabled ? Number(values.cf_cost || 0) : 0,
      mf_cost: Number(values.mf_cost || 0),
      quotation_date: values.quotation_date.format('YYYY-MM-DD'),
      valid_until: values.valid_until?.format('YYYY-MM-DD') || '',
      items,
    }
    const res = editing ? await api.put(`/api/quotations/${editing.id}`, payload) : await api.post('/api/quotations', payload)
    message.success(res.data.message); navigate('/quotation/daftar')
  }
  const statusAction = async (record, action, note='') => {
    const res = await api.post(`/api/quotations/${record.id}/status`, { action, note })
    message.success(res.data.message); load()
  }
  const reject = record => {
    let note = ''
    Modal.confirm({ title: `Tolak ${record.quotation_no}?`, content: <Input.TextArea onChange={e => { note=e.target.value }} placeholder="Alasan penolakan" />, okText: 'Tolak', okButtonProps: { danger: true }, onOk: () => note.trim() ? statusAction(record, 'reject', note.trim()) : Promise.reject() })
  }
  const remove = record => Modal.confirm({
    title: `Hapus ${record.quotation_no}?`,
    content: 'Quotation yang dihapus tidak dapat dikembalikan.',
    okText: 'Hapus',
    okButtonProps: { danger: true },
    cancelText: 'Batal',
    onOk: async () => {
      const res = await api.delete(`/api/quotations/${record.id}`)
      message.success(res.data.message)
      if (detail?.id === record.id) setDetail(null)
      load()
    },
  })
  const createRevision = record => Modal.confirm({
    title: `Buat revisi untuk ${quotationNumber(record)}?`,
    content: `Sistem akan membuat Revision ${Number(record.revision || 0) + 1} sebagai Draft dan mewajibkan approval ulang.`,
    okText: 'Buat Revisi',
    cancelText: 'Batal',
    onOk: async () => {
      const res = await api.post(`/api/quotations/${record.id}/revision`)
      message.success(res.data.message)
      const revisionId = res.data?.data?.id
      if (!revisionId) {
        await load()
        throw new Error('ID quotation revisi tidak diterima dari server')
      }
      navigate(`/quotation/daftar/${revisionId}/edit`)
    },
  })
  const print = record => {
    const w = window.open('', '_blank'); if (!w) return message.error('Izinkan popup untuk print')
    const itemRows = record.items.map((item, i) => `<tr><td>${i+1}</td><td>${safe(item.description)}</td><td>${safe(item.qty)}</td><td>${safe(item.uom)}</td><td>${idrMoney(item.unit_price)}</td><td><b>${idrMoney(Number(item.qty||0)*Number(item.unit_price||0))}</b></td></tr>`).join('')
    const meta = (label,value) => `<div class="meta-row"><span>${label}</span><span>:</span><b>${safe(value||'-')}</b></div>`
    const term = (label,value) => `<div class="term-row"><span>${label}</span><span>:</span><b>${safe(value||'-')}</b></div>`
    const origin = window.location.origin
    w.document.write(`<!doctype html><html><head><title>${safe(quotationNumber(record))} - Revision ${record.revision}</title><style>
      @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#111;font:9px Arial,sans-serif}.page{width:100%}
      .letterhead{display:flex;justify-content:space-between;align-items:flex-start;height:50px}.company{width:34%;height:auto}.iso{width:9%;height:auto;margin-right:2%}
      h1{text-align:center;font-size:16px;letter-spacing:.4px;margin:2px 0 16px}.meta{display:grid;grid-template-columns:56% 44%;gap:25px;margin-bottom:12px}
      .meta-row{display:grid;grid-template-columns:78px 8px 1fr;min-height:18px;align-items:start}
      table.items{width:100%;border-collapse:collapse;table-layout:fixed}.items th,.items td{padding:5px}.items th{border-top:1px solid #111;border-bottom:1px solid #111;text-align:center;font-size:9px}.items tbody td{border:0;vertical-align:top}
      .items th:nth-child(1){width:6%}.items th:nth-child(2){width:42%}.items th:nth-child(3){width:11%}.items th:nth-child(4){width:8%}.items th:nth-child(5){width:16%}.items th:nth-child(6){width:17%}
      .items td:nth-child(1),.items td:nth-child(3),.items td:nth-child(4){text-align:center}.items td:nth-child(2){white-space:pre-line}.items td:nth-child(5),.items td:nth-child(6){text-align:right}
      .filler td{height:${Math.max(45,220-record.items.length*22)}px;border:0}.summary{width:47%;margin-left:auto;background:#eee;font-size:9px}.summary>div{display:grid;grid-template-columns:38% 14% 13% 35%;min-height:20px;align-items:center;padding:0 6px}.summary>div>*:nth-child(2),.summary>div>*:nth-child(3){text-align:center}.summary>div>*:last-child{text-align:right}.summary>div:last-child{border-bottom:2px solid #111}
      .terms{border-top:1px solid #111;margin-top:0;padding-top:12px}.term-title{font-weight:bold;font-style:italic;margin-bottom:4px}.term-row{display:grid;grid-template-columns:105px 8px 1fr;min-height:18px;font-style:italic}
      .closing{margin-top:15px;line-height:1.5}.signature{margin-top:17px;line-height:1.5}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><div class="page">
      <div class="letterhead"><img class="company" src="${origin}/quotation/aqpa-header.jpg"/><img class="iso" src="${origin}/quotation/iso-certification.jpg"/></div>
      <h1>QUOTATION</h1><div class="meta"><div>${meta('Customer',record.customer_name)}${meta('Address',record.customer_address)}${meta('Attention',record.attention)}${meta('Delivery To',record.delivery_to)}</div><div>${meta('Qtn Number',quotationNumber(record))}${meta('Date',shortDate(record.quotation_date))}${meta('Valid Until',shortDate(record.valid_until))}${meta('Subject',record.subject||'Various')}${meta('Revision',record.revision)}</div></div>
      <table class="items"><thead><tr><th>NO</th><th>DESCRIPTION &amp; SPECIFICATION</th><th>QUANTITY</th><th>UOM</th><th>UNIT PRICE</th><th>TOTAL PRICE</th></tr></thead><tbody>${itemRows}<tr class="filler"><td colspan="6"></td></tr></tbody></table>
      <div class="summary"><div><b>SUBTOTAL</b><span></span><span>IDR</span><b>${new Intl.NumberFormat('id-ID').format(record.subtotal)}</b></div>
      <div><b>DISCOUNT</b><b>${record.discount_type==='percentage'?`${record.discount_value}%`:''}</b><span>IDR</span><b>- ${new Intl.NumberFormat('id-ID').format(record.discount_amount)}</b></div>
      <div><b>VAT</b><b>${record.vat_enabled?`${record.vat_rate}%`:'0%'}</b><span>IDR</span><b>${new Intl.NumberFormat('id-ID').format(record.vat_amount)}</b></div>
      <div><b>GRAND TOTAL</b><span></span><span>IDR</span><b>${new Intl.NumberFormat('id-ID').format(record.total_amount)}</b></div></div>
      <div class="terms"><div class="term-title">TERM CONDITIONS :</div>${term('Delivery Term',record.delivery_term)}${term('Payment Terms',record.payment_terms)}${term('Delivery Time',record.delivery_time)}${term('Scope of Works',record.scope_of_works)}${term('Price Validity',record.price_validity)}</div>
      <div class="closing">Hoping this offer could meet your requirements and may we look forward to receiving your reply soonest.</div>
      <div class="signature">Yours faithfully,<br/><b><i>PT AQPA INDONESIA</i></b><br/><br/><br/><i>${safe(record.created_name)}</i><br/><i>${safe(record.marketing_phone||'')}</i></div>
    </div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300))<\/script></body></html>`); w.document.close()
  }

  const printCurrentQuotation = () => {
    const values=form.getFieldsValue(true)
    if (!String(values.customer_name||'').trim()) return message.warning('Isi customer sebelum membuka print preview')
    if (!items.length || items.every(item=>!String(item.description||'').trim())) return message.warning('Isi minimal satu item sebelum membuka print preview')
    print({
      ...(editing||{}),
      ...values,
      quotation_no:editing?.quotation_no||'DRAFT',
      base_quotation_no:editing?.base_quotation_no||'DRAFT',
      revision:editing?.revision||0,
      items,
      subtotal:totals.subtotal,
      discount_amount:totals.discount,
      vat_amount:totals.vat,
      total_amount:totals.total,
      created_name:editing?.created_name||user?.name||'Marketing',
    })
  }

  const exportQuotations = () => {
    if (!rows.length) return message.warning('Belum ada data quotation untuk diekspor')
    const itemRows = rows.flatMap(record=>{
      const lineBases=(record.items||[]).map(item=>Number(item.qty||0)*Number(item.hpp||0))
      const totalBase=lineBases.reduce((sum,value)=>sum+value,0)
      const allocations=(record.items||[]).map(()=>({}))
      allocatableCosts.forEach(([costKey,appliedKey])=>{
        const hasSelection=(record.items||[]).some(item=>item[appliedKey]===true)
        const eligibleTotal=(record.items||[]).reduce((sum,item,index)=>sum+((hasSelection?item[appliedKey]===true:true)?lineBases[index]:0),0)
        ;(record.items||[]).forEach((item,index)=>{
          allocations[index][costKey]=(hasSelection?item[appliedKey]===true:true)&&eligibleTotal
            ? Number(record[costKey]||0)*lineBases[index]/eligibleTotal : 0
        })
      })
      ;['shipping_cost','other_cost'].forEach(costKey=>(record.items||[]).forEach((_,index)=>{
        allocations[index][costKey]=totalBase?Number(record[costKey]||0)*lineBases[index]/totalBase:0
      }))
      return (record.items||[]).map((item,index)=>{
        const allocation=internalCostKeys.reduce((sum,key)=>sum+Number(allocations[index][key]||0),0)
        const lineTotal=Number(item.qty||0)*Number(item.unit_price||0)
        const discountShare=Number(record.subtotal||0)?Number(record.discount_amount||0)*lineTotal/Number(record.subtotal):0
        return {
          ...record,
          quotation_number:quotationNumber(record),revision:record.revision,quotation_date:record.quotation_date,
          status:record.status,customer_no:record.customer_no,customer_name:record.customer_name,
          item_no:index+1,description:item.description,qty:item.qty,uom:item.uom,hpp_unit:item.hpp,
          modal_total:lineBases[index],cf_applied:item.cf_applied?'Ya':'Tidak',mf_applied:item.mf_applied?'Ya':'Tidak',
          installation_applied:item.installation_applied?'Ya':'Tidak',packing_applied:item.packing_applied?'Ya':'Tidak',
          cf_allocation:allocations[index].cf_cost,mf_allocation:allocations[index].mf_cost,
          installation_allocation:allocations[index].installation_cost,shipping_allocation:allocations[index].shipping_cost,
          packing_allocation:allocations[index].packing_cost,other_allocation:allocations[index].other_cost,
          supporting_allocation:allocation,markup_pct:item.markup_pct==null?record.target_margin_value:item.markup_pct,
          unit_price:item.unit_price,total_price:lineTotal,discount_allocation:discountShare,
          net_sales:lineTotal-discountShare,planned_profit:lineTotal-discountShare-lineBases[index]-allocation,
          item_margin_pct:lineTotal-discountShare
            ? (lineTotal-discountShare-lineBases[index]-allocation)/(lineTotal-discountShare)*100 : 0,
        }
      })
    })
    downloadWorkbookXLS([
      {name:'Quo Lengkap per Barang',rows:itemRows,columns:[
        {key:'quotation_number',label:'No. Quotation'},{key:'revision',label:'Revision'},
        {key:'quotation_date',label:'Tanggal',type:'date'},{key:'valid_until',label:'Valid Until',type:'date'},
        {key:'customer_no',label:'No. Customer'},{key:'customer_name',label:'Customer'},
        {key:'customer_address',label:'Alamat'},{key:'attention',label:'Attention'},
        {key:'delivery_to',label:'Delivery To'},{key:'subject',label:'Subject'},
        {key:'description',label:'Deskripsi & Spesifikasi',width:40},
        {key:'qty',label:'Quantity',type:'number'},{key:'uom',label:'UOM'},
        {key:'hpp_unit',label:'Harga Modal Barang',type:'currency'},
        {key:'cf_allocation',label:'Biaya CF',type:'currency'},{key:'mf_allocation',label:'Biaya MF',type:'currency'},
        {key:'installation_allocation',label:'Biaya Instalasi',type:'currency'},{key:'shipping_allocation',label:'Biaya Pengiriman',type:'currency'},
        {key:'packing_allocation',label:'Biaya Packaging',type:'currency'},{key:'other_allocation',label:'Biaya Lainnya',type:'currency'},
        {key:'target_margin_value',label:'Target Markup',type:'number'},
        {key:'discount_value',label:'Nilai Diskon',type:'number'},
        {key:'unit_price',label:'Unit Price',type:'currency'},{key:'total_price',label:'Total Price Barang',type:'currency'},
        {key:'net_sales',label:'Penjualan Bersih Barang',type:'currency'},
        {key:'planned_profit',label:'Keuntungan Bersih Barang',type:'currency'},
        {key:'subtotal',label:'Subtotal',type:'currency'},{key:'margin_pct',label:'Margin %',type:'number'},
        {key:'status',label:'Status'},{key:'created_name',label:'Dibuat Oleh'},{key:'created_at',label:'Dibuat Pada',type:'datetime'},
      ]},
      {name:'Quo Harga per Barang',rows:itemRows,columns:[
        {key:'quotation_number',label:'No. Quotation'},
        {key:'description',label:'Deskripsi & Spesifikasi',width:40},
        {key:'hpp_unit',label:'Harga Modal Barang',type:'currency'},
        {key:'cf_allocation',label:'CF',type:'currency'},
        {key:'mf_allocation',label:'MF',type:'currency'},
        {key:'installation_allocation',label:'Instalasi',type:'currency'},
        {key:'shipping_allocation',label:'Pengiriman',type:'currency'},
        {key:'packing_allocation',label:'Packaging',type:'currency'},
        {key:'markup_pct',label:'Target Markup',type:'number'},
        {key:'unit_price',label:'Unit Price',type:'currency'},
        {key:'total_price',label:'Total Price Barang',type:'currency'},
        {key:'net_sales',label:'Penjualan Bersih Barang',type:'currency'},
        {key:'planned_profit',label:'Keuntungan Bersih Barang',type:'currency'},
        {key:'subtotal',label:'Subtotal',type:'currency'},
        {key:'item_margin_pct',label:'Margin',type:'number'},
      ]},
    ],`quotation-lengkap-${dayjs().format('YYYY-MM-DD')}.xlsx`)
  }

  const columns = withTableSorters([
    { title:'No. Quotation', dataIndex:'base_quotation_no', width:165, render:(_,record)=><Text code>{quotationNumber(record)}</Text> },
    { title:'Revision', dataIndex:'revision', width:90, align:'center' },
    { title:'Tanggal', dataIndex:'quotation_date', width:120 }, { title:'Customer', dataIndex:'customer_name', width:220 },
    { title:'Status Customer', dataIndex:'customer_status', width:150, render:v=><Tag color={v==='Pelanggan Baru'?'orange':'blue'}>{v}</Tag> },
    { title:'Diajukan Oleh', dataIndex:'submitted_name', width:165, render:value=><Text>{value||'-'}</Text> },
    { title:'Total Penawaran', dataIndex:'total_amount', width:160, align:'right', render:money },
    { title:'Margin Penjualan Rencana', dataIndex:'planned_margin', width:205, align:'right', render:(v,r)=><Text type={v<0?'danger':undefined}>{money(v)} ({Number(r.margin_pct).toFixed(1)}%)</Text> },
    { title:'Status', dataIndex:'status', width:145, render:v=>{const m=statusMeta[v]||[v,'default'];return <Tag color={m[1]}>{m[0]}</Tag>} },
    { title:'Aksi', fixed:'right', width:300, render:(_,r)=><Space className="quotation-list-actions" size={[6,6]} wrap><Button size="small" icon={<EyeOutlined/>} onClick={()=>setDetail(r)}>Detail</Button>{(['draft','rejected'].includes(r.status)||(canApprove&&r.status==='submitted'))&&<Button size="small" icon={<EditOutlined/>} onClick={()=>openForm(r)}>Edit Quotation</Button>}{r.status==='draft'&&<Button size="small" type="primary" icon={<SendOutlined/>} onClick={()=>statusAction(r,'submit')}>Ajukan</Button>}{canApprove&&r.status==='submitted'&&<Button size="small" type="primary" icon={<CheckOutlined/>} onClick={()=>statusAction(r,'approve')}>Setujui</Button>}{canApprove&&r.status==='submitted'&&<Button size="small" danger onClick={()=>reject(r)}>Tolak</Button>}{r.status==='approved'&&(canApprove||r.created_by===user?.username)&&<Button size="small" icon={<CopyOutlined/>} onClick={()=>createRevision(r)}>Buat Revisi</Button>}{(canApprove||(r.created_by===user?.username&&['draft','rejected'].includes(r.status)))&&<Button size="small" danger icon={<DeleteOutlined/>} onClick={()=>remove(r)}>Delete</Button>}</Space> },
  ])

  if (!editorMode) return <div><Title level={3}>Daftar Quotation</Title><Row gutter={12}><Col><Card size="small"><Statistic title="Total" value={rows.length}/></Card></Col><Col><Card size="small"><Statistic title="Menunggu Manajemen" value={rows.filter(r=>r.status==='submitted').length}/></Card></Col></Row><Card style={{marginTop:16}} extra={<Space><Button icon={<DownloadOutlined/>} onClick={exportQuotations}>Export</Button><Button type="primary" icon={<PlusOutlined/>} onClick={()=>openForm()}>Buat Quotation</Button></Space>}><Table rowKey="id" dataSource={rows} columns={columns} scroll={{x:1600}}/></Card>
    <Modal open={!!detail} onCancel={()=>setDetail(null)} footer={null} width={1150} title={detail?`${quotationNumber(detail)} — Revision ${detail.revision}`:''} styles={{body:{background:'#eef1f5',padding:18}}}>{detail&&<QuotationDetailDocument record={detail}/>}</Modal>
  </div>

  return <div className="quotation-editor-page">
    <div className="quotation-editor-toolbar">
      <Button className="quotation-back-button" icon={<ArrowLeftOutlined/>} onClick={()=>navigate('/quotation/daftar')}>Kembali</Button>
      <div className="quotation-editor-heading">
        <Title level={4}>{editing?'Edit Quotation':'Buat Quotation'}</Title>
        <Text type="secondary">Lengkapi penawaran dan perhitungan internal</Text>
      </div>
      <Space className="quotation-editor-actions">
        <Button icon={<ImportOutlined/>} loading={importing} onClick={()=>importInputRef.current?.click()}>Import</Button>
        <Button icon={<PrinterOutlined/>} onClick={printCurrentQuotation}>Print</Button>
        <Button type="primary" icon={<SaveOutlined/>} onClick={save}>Simpan</Button>
      </Space>
    </div>
    <Form form={form} layout="vertical">
      <input ref={importInputRef} type="file" accept=".xlsx" hidden onChange={importExcel}/>
      <Form.Item name="customer_source" hidden><Input/></Form.Item>
      <Form.Item name="customer_no" hidden><Input/></Form.Item>
      <div className="quotation-sheet quotation-editor-sheet">
        <div className="quotation-title">QUOTATION</div>
        <div className="quotation-meta">
          <div>
            <div className="quotation-meta-line"><span>Customer</span><span>:</span><Form.Item name="customer_name" rules={[{required:true}]}>
        <AutoComplete
          placeholder="Cari customer Easy atau ketik nama customer baru"
          options={customers.map(c=>({key:c.no_pelanggan,value:c.no_pelanggan,label:`${c.no_pelanggan} - ${c.nama_pelanggan}`,record:c}))}
          onSearch={loadCustomers}
          onFocus={()=>loadCustomers('')}
          onChange={(value,option)=>option?.record
            ? form.setFieldsValue({customer_source:'easy',customer_no:option.record.no_pelanggan,customer_name:option.record.nama_pelanggan,customer_address:option.record.alamat||''})
            : form.setFieldsValue({customer_source:'manual',customer_no:'',customer_name:value,customer_address:'',attention:'',delivery_to:''})}
          onSelect={(_,option)=>form.setFieldsValue({customer_source:'easy',customer_no:option.record.no_pelanggan,customer_name:option.record.nama_pelanggan,customer_address:option.record.alamat||''})}
        />
            </Form.Item></div>
            <div className="quotation-meta-line"><span>Address</span><span>:</span><Form.Item name="customer_address"><Input placeholder="Alamat customer"/></Form.Item></div>
            <div className="quotation-meta-line"><span>Attention</span><span>:</span><Form.Item name="attention"><Input/></Form.Item></div>
            <div className="quotation-meta-line"><span>Delivery To</span><span>:</span><Form.Item name="delivery_to"><Input/></Form.Item></div>
          </div>
          <div>
            <div className="quotation-meta-line"><span>Qtn Number</span><span>:</span><Text type="secondary">{editing ? quotationNumber(editing) : 'Otomatis setelah disimpan'}</Text></div>
            <div className="quotation-meta-line"><span>Date</span><span>:</span><Form.Item name="quotation_date" rules={[{required:true}]}><DatePicker format="DD/MM/YYYY" style={{width:'100%'}}/></Form.Item></div>
            <div className="quotation-meta-line"><span>Valid Until</span><span>:</span><Form.Item name="valid_until"><DatePicker format="DD/MM/YYYY" style={{width:'100%'}}/></Form.Item></div>
            <div className="quotation-meta-line"><span>Subject</span><span>:</span><Form.Item name="subject"><Input placeholder="Various"/></Form.Item></div>
            <div className="quotation-meta-line"><span>Revision</span><span>:</span><Text>{editing?.revision || 0}</Text></div>
          </div>
        </div>
        <Table className="quotation-items" pagination={false} scroll={{x:1980}} rowKey={(_,i)=>i} dataSource={items} columns={[
          {title:'NO',width:48,align:'center',render:(_,r,i)=>i+1},
          {title:'DESCRIPTION & SPECIFICATION',width:310,render:(_,r,i)=><Input.TextArea value={r.description} autoSize={{minRows:1,maxRows:6}} onChange={event=>updateItem(i,{description:event.target.value,item_no:''})} onPressEnter={event=>event.stopPropagation()} placeholder="Ketik deskripsi dan spesifikasi barang"/>},
          {title:'QUANTITY',width:90,align:'center',render:(_,r,i)=><InputNumber min={0.01} value={r.qty} onChange={v=>updateItem(i,{qty:v})} style={{width:'100%'}}/>},
          {title:'UOM',width:72,align:'center',render:(_,r,i)=><Input value={r.uom} onChange={e=>updateItem(i,{uom:e.target.value})}/>},
          {title:'HARGA MODAL BARANG',width:155,render:(_,r,i)=><InputNumber min={0} value={r.hpp} formatter={idrFormatter} parser={rupiahParser} onChange={v=>{const cost=Number(v||0);updateItem(i,{hpp:cost,...(cost<=0?{unit_price:0}:(!watchedValues.auto_price&&Number(r.unit_price||0)<cost?{unit_price:cost}:{}))})}} style={{width:'100%'}}/>},
          ...[
            ['CF','cf_applied'],
            ['MF','mf_applied'],
            ['INSTALASI','installation_applied'],
            ['PACKAGING','packing_applied'],
          ].map(([title,key], costIndex)=>({
            title,
            width:title==='PACKAGING'?120:105,
            align:'center',
            render:(_,r,i)=>{
              const costKey=allocatableCosts[costIndex][0]
              const costAvailable=Number(watchedValues[costKey] || 0) > 0
              return <Space direction="vertical" size={1}>
                <Checkbox disabled={!costAvailable} checked={costAvailable && r[key]===true} onChange={event=>updateItem(i,{[key]:event.target.checked})}/>
                <Text type="secondary" className="quotation-allocation-value">{idrMoney(pricingPlan.allocations[i]?.[costKey] || 0)}</Text>
              </Space>
            },
          })),
          {title:'UNIT PRICE',width:165,render:(_,r,i)=>{
            const hasCost=Number(r.hpp||0)>0
            const effectiveMarkup=Number(pricingPlan.lineMarkups[i] || 0)
            const itemMarkupReady=effectiveMarkup>0 && effectiveMarkup<=100
            return <InputNumber disabled={!hasCost || !targetReady || !itemMarkupReady} placeholder={!itemMarkupReady?'Isi markup item dahulu':'Harga dapat diedit'} min={Number(r.hpp||0)} value={hasCost?r.unit_price:null} formatter={idrFormatter} parser={rupiahParser} onChange={v=>{updateItem(i,{unit_price:Math.max(Number(v||0),Number(r.hpp||0))});form.setFieldValue('auto_price',false)}} style={{width:'100%'}}/>
          }},
          {title:'TARGET MARKUP %',width:125,align:'center',render:(_,r,i)=><InputNumber
            disabled={!targetReady}
            min={0}
            max={100}
            precision={2}
            value={pricingPlan.lineMarkups[i] || 0}
            addonAfter="%"
            onChange={value=>updateItem(i,{markup_pct:Number(value||0)})}
            style={{width:'100%'}}
          />},
          {title:'HARGA DASAR (TANPA DISKON)',width:155,align:'right',render:(_,r)=>{
            const qty=Number(r.qty||0)
            const lineSales=qty*Number(r.unit_price||0)
            const effectiveDiscount=Math.max(totals.subtotal-totals.sales,0)
            const lineDiscount=totals.subtotal?effectiveDiscount*lineSales/totals.subtotal:0
            return <Text strong>{idrMoney(qty?(lineSales-lineDiscount)/qty:0)}</Text>
          }},
          {title:'DISKON %',width:95,align:'center',render:()=>{
            const percentage=totals.subtotal?totals.discount/totals.subtotal*100:0
            return <Text strong>{percentage.toLocaleString('id-ID',{maximumFractionDigits:2})}%</Text>
          }},
          {title:'TOTAL PRICE',width:130,align:'right',render:(_,r)=><Text strong>{idrMoney(Number(r.qty||0)*Number(r.unit_price||0))}</Text>},
          {title:'KEUNTUNGAN BERSIH',width:145,align:'right',render:(_,r,i)=>{
            const lineSales=Number(r.qty||0)*Number(r.unit_price||0)
            const lineCost=Number(r.qty||0)*Number(r.hpp||0)
            const effectiveDiscount=Math.max(totals.subtotal-totals.sales,0)
            const lineDiscount=totals.subtotal?effectiveDiscount*lineSales/totals.subtotal:0
            const supportingAllocation=pricingPlan.allocations[i]?.total || 0
            const profit=lineSales-lineDiscount-lineCost-supportingAllocation
            return <Text strong type={profit<0?'danger':undefined}>{idrMoney(profit)}</Text>
          }},
          {title:'',width:38,render:(_,r,i)=><Button danger type="text" size="small" onClick={()=>setItems(p=>p.filter((_,x)=>x!==i))}>×</Button>}
        ]} summary={()=>
          <Table.Summary.Row className="quotation-items-summary-row">
            <Table.Summary.Cell index={0} colSpan={13}/>
            <Table.Summary.Cell index={13} align="right"><Text strong>{idrMoney(totals.subtotal)}</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={14} align="right"><Text strong type={totals.margin<0?'danger':undefined}>{idrMoney(totals.margin)}</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={15}/>
          </Table.Summary.Row>
        }/>
        <Button className="quotation-add-item" type="primary" size="middle" icon={<PlusOutlined/>} onClick={()=>setItems(p=>[...p,emptyItem()])}>Tambah Item</Button>
        <div className="quotation-calculation-flow">
        <div className="quotation-pricing-controls">
          <section className={`quotation-pricing-section ${!targetReady?'quotation-step-locked':''}`}>
            <div className="quotation-control-grid">
              <div className="quotation-control-field"><span>Tipe Diskon</span><Form.Item name="discount_type"><Select disabled={!targetReady} options={[{value:'percentage',label:'Persentase'},{value:'nominal',label:'Nominal Rupiah'}]}/></Form.Item></div>
              <div className="quotation-control-field"><span>Nilai Diskon</span><Form.Item name="discount_value"><InputNumber disabled={!targetReady} min={0} formatter={watchedValues.discount_type==='nominal'?rupiahFormatter:undefined} parser={watchedValues.discount_type==='nominal'?rupiahParser:undefined} addonAfter={watchedValues.discount_type==='percentage'?'%':undefined} style={{width:'100%'}}/></Form.Item></div>
              <div className="quotation-control-field"><span>PPN</span><Form.Item name="vat_enabled" valuePropName="checked"><Checkbox disabled={!targetReady}>Gunakan PPN</Checkbox></Form.Item></div>
              <div className="quotation-control-field"><span>Tarif PPN</span><Form.Item name="vat_rate"><InputNumber disabled={!targetReady} min={0} addonAfter="%" style={{width:'100%'}}/></Form.Item></div>
            </div>
            {!targetReady&&<Text className="quotation-step-hint">Lengkapi data barang dan target markup untuk membuka diskon serta PPN.</Text>}
          </section>
          <section className={`quotation-pricing-section ${!supportingCostsReady?'quotation-step-locked':''}`}>
            <div className="quotation-control-grid">
              <div className="quotation-control-field"><span>Metode Target Markup</span><Form.Item name="target_margin_type"><Select disabled={!supportingCostsReady} options={[{value:'percentage',label:'Persentase dari Total Biaya'},{value:'nominal',label:'Nominal Keuntungan'}]}/></Form.Item></div>
              <div className="quotation-control-field"><span>Target Markup</span><Form.Item name="target_margin_value"><InputNumber disabled={!supportingCostsReady} min={0} max={watchedValues.target_margin_type==='percentage'?100:undefined} formatter={watchedValues.target_margin_type==='nominal'?rupiahFormatter:undefined} parser={watchedValues.target_margin_type==='nominal'?rupiahParser:undefined} addonAfter={watchedValues.target_margin_type==='percentage'?'%':undefined} style={{width:'100%'}}/></Form.Item></div>
              <div className="quotation-control-field"><span>Harga Jual</span><Form.Item name="auto_price" valuePropName="checked"><Checkbox disabled={!targetReady}>Hitung harga jual otomatis</Checkbox></Form.Item></div>
              <div className="quotation-inline-result"><Text type="secondary">Target Keuntungan</Text><Text strong>{money(pricingPlan.targetProfit)}</Text></div>
            </div>
            <div className="quotation-target-summary">
              <span>Modal <b>{money(pricingPlan.itemCost)}</b></span>
              <span>Biaya + modal <b>{money(pricingPlan.totalCost)}</b></span>
              <span>Target bersih <b>{money(pricingPlan.targetNetSales)}</b></span>
              <span>Rekomendasi <b>{money(pricingPlan.targetSubtotal)}</b></span>
            </div>
            {!supportingCostsReady&&<Text className="quotation-step-hint">Isi minimal satu biaya pendukung terlebih dahulu untuk membuka Target Markup.</Text>}
          </section>
        </div>
        <div className={`quotation-supporting-costs ${!itemsReady?'quotation-step-locked':''}`}>
          <div className="quotation-supporting-costs-title">
            <Text strong>Biaya Pendukung</Text>
            <Text type="secondary">Masukkan nominal atau persentase dari penjualan bersih.</Text>
          </div>
          <Form.Item name="cf_enabled" valuePropName="checked" className="quotation-cf-toggle"><Checkbox disabled={!itemsReady} onChange={event=>{
            if(!event.target.checked) {
              form.setFieldValue('cf_cost',0)
              setItems(previous=>previous.map(item=>({...item,cf_applied:false})))
            }
          }}>Gunakan biaya CF</Checkbox></Form.Item>
          <Row className="quotation-cost-row" gutter={[8,8]}>
            {[
              ['cf_cost','CF',!watchedValues.cf_enabled],
              ['mf_cost','MF',false],
              ['installation_cost','Instalasi',false],
              ['shipping_cost','Pengiriman',false],
              ['packing_cost','Packaging',false],
              ['other_cost','Lainnya',false],
            ].map(([key,label,disabled])=><Col className="quotation-cost-column" xs={24} sm={12} md={8} xl={4} key={key}>
              <div className="quotation-cost-card">
                <Text strong>{label}</Text>
                <Form.Item name={key} label="Rp"><InputNumber disabled={disabled || !itemsReady} min={0} formatter={rupiahFormatter} parser={rupiahParser} onChange={value=>{
                  setInternalCostRupiahMode(key)
                  const appliedKey=allocatableCosts.find(([costKey])=>costKey===key)?.[1]
                  if (appliedKey) {
                    if (Number(value || 0) <= 0) {
                      setItems(previous=>previous.map(item=>({...item,[appliedKey]:false})))
                    } else {
                      setItems(previous=>previous.some(item=>item[appliedKey]===true)
                        ? previous
                        : previous.map(item=>({...item,[appliedKey]:true})))
                    }
                  }
                }} style={{width:'100%'}}/></Form.Item>
                <Form.Item label="%"><InputNumber disabled={disabled || !itemsReady || !totals.sales} min={0} precision={2} value={internalCostPercent(key)} onChange={value=>setInternalCostPercent(key,value)} style={{width:'100%'}}/></Form.Item>
              </div>
            </Col>)}
          </Row>
          {!totals.sales&&<Text type="secondary" className="quotation-cost-help">Isi harga jual terlebih dahulu agar nominal dan persentase dapat dihitung.</Text>}
          {!itemsReady&&<Text className="quotation-step-hint">Biaya pendukung terbuka setelah seluruh data barang lengkap.</Text>}
        </div>
        </div>
        <div className="quotation-terms">
          <Text strong italic>TERM CONDITIONS :</Text>
          {[['delivery_term','Delivery Term'],['payment_terms','Payment Terms'],['delivery_time','Delivery time'],['scope_of_works','Scope of works'],['price_validity','Price Validity']].map(([key,label])=><div className="quotation-term-row" key={key}><span>{label}</span><span>:</span><Form.Item name={key}><Input/></Form.Item></div>)}
        </div>
        <div className="quotation-closing">
          Hoping this offer could meet your requirements and may we look forward to receiving your reply soonest.<br/><br/>
          Yours faithfully,<br/><b><i>PT AQPA INDONESIA</i></b><br/>
          <i>{editing?.created_name || user?.name || '{Nama Marketing}'}</i><br/>
          <Form.Item name="marketing_phone" className="quotation-marketing-phone"><Input placeholder="No. telepon marketing"/></Form.Item>
        </div>
      </div>
      <Card className="quotation-internal" title="Perhitungan Internal — Tidak Masuk Print Customer">
        <Row className="quotation-summary-row quotation-summary-final" gutter={[14,14]}><Col span={6}><Statistic title="Penjualan Bersih" value={totals.sales} formatter={money}/></Col><Col span={6}><Statistic title="Total HPP" value={totals.hpp} formatter={money}/></Col><Col span={6}><Statistic title="Biaya Pendukung" value={totals.internal} formatter={money}/></Col><Col span={6}><Statistic title="Margin Penjualan Rencana" value={totals.margin} suffix={`(${totals.marginPct.toFixed(1)}%)`} formatter={money}/></Col></Row>
      </Card>
    </Form>
    <Modal open={!!detail} onCancel={()=>setDetail(null)} footer={null} width={1150} title={detail?`${quotationNumber(detail)} — Revision ${detail.revision}`:''} styles={{body:{background:'#eef1f5',padding:18}}}>{detail&&<QuotationDetailDocument record={detail}/>}</Modal>
  </div>
}
