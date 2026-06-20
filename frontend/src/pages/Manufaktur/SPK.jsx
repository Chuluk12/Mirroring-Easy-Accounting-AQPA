import { useEffect, useState, useCallback } from 'react'
import {
  Table, Input, Card, DatePicker, Space, Tag, Tooltip, Select,
  Statistic, Row, Col, Typography, Button, Badge, Progress
} from 'antd'
import {
  FileExcelOutlined, SearchOutlined, ReloadOutlined, ToolOutlined,
  CheckCircleOutlined, ClockCircleOutlined
} from '@ant-design/icons'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import useVisiblePolling from '../../hooks/useVisiblePolling'
import dayjs from 'dayjs'

const { Search } = Input
const { RangePicker } = DatePicker
const { Text } = Typography
const DEFAULT_PAGE_SIZE = 20

const STATUS_MAP = {
  0: { label: 'Belum Mulai', color: 'default' },
  1: { label: 'Diproses',    color: 'processing' },
  2: { label: 'Selesai',     color: 'success' },
  3: { label: 'Ditunda',     color: 'warning' },
  4: { label: 'Dibatalkan',  color: 'error' },
}

const formatQty = (val) =>
  parseFloat(val || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })
const formatOptionalQty = (val) =>
  val === null || val === undefined ? '-' : formatQty(val)
const formatQtyWithUnit = (val, unit) =>
  val === null || val === undefined ? '-' : `${formatQty(val)} ${unit || ''}`.trim()

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

const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]
const SPK_EXPORT_COLS = [
  { key: 'no_spk', label: 'No Perintah Kerja' },
  { key: 'tanggal', label: 'Tanggal', type: 'date' },
  { key: 'estimasi', label: 'Estimasi Selesai', type: 'date' },
  { key: 'tgl_selesai', label: 'Tgl Selesai Produksi', type: 'date' },
  { key: 'deskripsi', label: 'Deskripsi Pekerjaan' },
  { key: 'no_barang', label: 'No Barang' },
  { key: 'nama_barang', label: 'Nama Barang' },
  { key: 'qty', label: 'Qty', type: 'number' },
  { key: 'uom', label: 'UoM' },
  { key: 'total_mat_plan', label: 'Total Bahan Rencana', type: 'number' },
  { key: 'total_mat_keluar', label: 'Total Bahan Keluar', type: 'number' },
  { key: 'material_progress', label: 'Progress Bahan (%)', type: 'number' },
  { key: 'production_status', label: 'Status Barang' },
  { key: 'no_pesanan', label: 'No Pesanan' },
  { key: 'no_po', label: 'No PO' },
]

export default function SPK() {
  const { user } = useAuth()
  const [data, setData]             = useState([])
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [dateRange, setDateRange]   = useState(getCurrentMonthRange)
  const [status, setStatus]         = useState('')
  const [exporting, setExporting]   = useState(false)
  const [formulaDetails, setFormulaDetails] = useState({})
  const [formulaLoading, setFormulaLoading] = useState({})
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })
  const [summary, setSummary]       = useState({
    total_spk: 0,
    spk_selesai: 0,
    spk_berjalan: 0,
    item_selesai_gp: 0,
    total_item: 0,
  })

  const fetchData = useCallback(async (
    page = 1, pageSize = DEFAULT_PAGE_SIZE, searchVal = '', dates = getCurrentMonthRange(), statusVal = '', showLoading = true
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal) params.search    = searchVal
      if (dates[0])  params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates[1])  params.date_to   = dates[1].format('YYYY-MM-DD')
      if (statusVal) params.status    = statusVal

      const res  = await api.get('/api/spk', { params })
      const rows = res.data.data || []

      setData(rows)
      setSummary({
        total_spk:       res.data.total_spk || 0,
        spk_selesai:     res.data.spk_selesai || 0,
        spk_berjalan:    res.data.spk_berjalan || 0,
        item_selesai_gp: res.data.item_selesai_gp || 0,
        total_item:      res.data.total_item || 0,
      })
      setPagination(prev => ({
        ...prev, current: page, pageSize,
        total: res.data.total || rows.length,
      }))
    } catch (e) {
      console.error('Gagal fetch SPK:', e)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useVisiblePolling(() => {
    fetchData(pagination.current, pagination.pageSize, search, dateRange, status, false)
  }, 30000)

  const loadFormulaDetail = useCallback(async record => {
    const wodetId = record?.wodet_id
    if (!wodetId || formulaDetails[wodetId] || formulaLoading[wodetId]) return

    setFormulaLoading(prev => ({ ...prev, [wodetId]: true }))
    try {
      const res = await api.get('/api/monitoring-formula', {
        params: {
          wodet_id: wodetId,
          offset: 0,
          limit: 1,
          skip_count: 1,
          qty_only: 1,
        },
        timeout: 90000,
      })
      setFormulaDetails(prev => ({ ...prev, [wodetId]: (res.data.data || [])[0] || null }))
    } catch (e) {
      console.error('Gagal fetch detail formula SPK:', e)
      setFormulaDetails(prev => ({ ...prev, [wodetId]: null }))
    } finally {
      setFormulaLoading(prev => ({ ...prev, [wodetId]: false }))
    }
  }, [formulaDetails, formulaLoading])

  const handleSearch     = (val) => { setSearch(val); fetchData(1, pagination.pageSize, val, dateRange, status) }
  const handleDateChange = (dates) => { setDateRange(dates || [null, null]); fetchData(1, pagination.pageSize, search, dates || [null, null], status) }
  const handleStatus     = (val) => { setStatus(val); fetchData(1, pagination.pageSize, search, dateRange, val) }
  const handleReset      = () => {
    const currentMonth = getCurrentMonthRange()
    setSearch('')
    setStatus('')
    setDateRange(currentMonth)
    fetchData(1, pagination.pageSize, '', currentMonth, '')
  }
  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (search) params.search = search
      if (dateRange[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
      if (dateRange[1]) params.date_to = dateRange[1].format('YYYY-MM-DD')
      if (status) params.status = status
      const res = await api.get('/api/spk/export', { params })
      return res.data.data || []
    },
    columns: filterExportColumnsByPermission('spk', SPK_EXPORT_COLS, user),
    filename: 'DaftarSPK',
    sheetName: 'Daftar SPK',
    setExporting,
  })

  // Stripe warna per grup no_spk
  const getRowBg = (() => {
    let lastKey = null; let toggle = false
    return (rec) => {
      if (rec.no_spk !== lastKey) { lastKey = rec.no_spk; toggle = !toggle }
      return toggle ? '#fafafa' : '#ffffff'
    }
  })()

  const columns = [
    {
      title: 'No Perintah Kerja',
      dataIndex: 'no_spk',
      key: 'no_spk',
      width: 170,
      fixed: 'left',
      render: val => (
        <Text code style={{ fontSize: 12, color: '#1a73e8', fontWeight: 600 }}>
          {val || '-'}
        </Text>
      ),
    },
    {
      title: 'No Pesanan',
      dataIndex: 'no_pesanan',
      key: 'no_pesanan',
      width: 155,
      render: val => {
        if (!val) return <Text type="secondary" style={{ fontSize: 11 }}>Internal</Text>
        return (
          <Tag color="geekblue" style={{ fontWeight: 600, fontSize: 11 }}>
            {val}
          </Tag>
        )
      },
    },
    {
      title: 'No PO',
      dataIndex: 'no_po',
      key: 'no_po',
      width: 140,
      render: val => val
        ? <Tag color="purple" style={{ fontSize: 11 }}>{val}</Tag>
        : <Text type="secondary" style={{ fontSize: 11 }}>-</Text>,
    },
    {
      title: 'Tanggal',
      dataIndex: 'tanggal',
      key: 'tanggal',
      width: 105,
      render: val => val ? dayjs(val).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Estimasi Selesai',
      dataIndex: 'estimasi',
      key: 'estimasi',
      width: 130,
      render: (val, rec) => {
        if (!val) return '-'
        const tgl  = dayjs(val)
        const done = !!rec.tgl_selesai
        const late = !done && tgl.isBefore(dayjs(), 'day')
        return (
          <span>
            <span style={{ color: late ? '#ff4d4f' : 'inherit' }}>
              {tgl.format('DD/MM/YYYY')}
            </span>
            {late && (
              <Tag color="error" style={{ marginLeft: 4, fontSize: 10 }}>Terlambat</Tag>
            )}
          </span>
        )
      },
    },
    {
      title: 'Tgl Selesai Produksi',
      dataIndex: 'tgl_selesai',
      key: 'tgl_selesai',
      width: 155,
      render: val => {
        if (!val) return (
          <span style={{ color: '#aaa', fontSize: 12 }}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            Belum selesai
          </span>
        )
        return (
          <span style={{ color: '#52c41a', fontWeight: 600 }}>
            <CheckCircleOutlined style={{ marginRight: 4 }} />
            {dayjs(val).format('DD/MM/YYYY')}
          </span>
        )
      },
    },
    {
      title: 'Deskripsi Pekerjaan',
      dataIndex: 'deskripsi',
      key: 'deskripsi',
      width: 220,
      ellipsis: { showTitle: false },
      render: val => (
        <Tooltip title={
          <pre style={{ maxWidth: 380, fontSize: 12, whiteSpace: 'pre-wrap', margin: 0 }}>
            {val || '-'}
          </pre>
        }>
          <span style={{ display: 'block', maxWidth: 210 }}>
            {(val || '-').replace(/\r?\n/g, ' • ')}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'No Barang',
      dataIndex: 'no_barang',
      key: 'no_barang',
      width: 170,
      render: val => val
        ? <Text code style={{ fontSize: 11 }}>{val}</Text>
        : <Text type="secondary">-</Text>,
    },
    {
      title: 'Nama Barang',
      dataIndex: 'nama_barang',
      key: 'nama_barang',
      width: 250,
      ellipsis: { showTitle: false },
      render: (val, rec) => (
        <Tooltip title={val || rec.job_desc}>
          <span>{val || rec.job_desc || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Qty',
      dataIndex: 'qty',
      key: 'qty',
      width: 80,
      align: 'right',
      render: val => <Text strong>{formatQty(val)}</Text>,
    },
    {
      title: 'UoM',
      dataIndex: 'uom',
      key: 'uom',
      width: 65,
      align: 'center',
      render: val => val ? <Tag>{val}</Tag> : '-',
    },
    {
      title: 'Progress Bahan',
      dataIndex: 'material_progress',
      key: 'material_progress',
      width: 180,
      render: (val, rec) => {
        const pct = Number(val || 0)
        const color = rec.tgl_selesai ? '#52c41a' : pct > 0 ? '#1890ff' : '#d9d9d9'
        return (
          <Tooltip title={`Bahan keluar ${formatQty(rec.total_mat_keluar)} dari rencana ${formatQty(rec.total_mat_plan)}`}>
            <div style={{ minWidth: 145 }}>
              <Progress
                percent={pct}
                size="small"
                strokeColor={color}
                status={rec.tgl_selesai ? 'success' : pct > 0 ? 'active' : 'normal'}
              />
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: 'Status Barang',
      dataIndex: 'production_status',
      key: 'production_status',
      width: 125,
      align: 'center',
      render: (val, rec) => {
        const status = val || STATUS_MAP[rec.status_barang]?.label || 'Belum Mulai'
        const s = PRODUCTION_STATUS_MAP[status] ?? { badge: 'default', color: '#8c8c8c' }
        return <Badge status={s.badge} text={<Text style={{ color: s.color }}>{status}</Text>} />
      },
    },
  ]

  const formulaMaterialColumns = [
    { title: 'No Barang Formula', dataIndex: 'material_no', width: 170, fixed: 'left', render: v => <Text code>{v || '-'}</Text> },
    { title: 'Nama Material', dataIndex: 'material_name', width: 280, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Qty Formula', dataIndex: 'formula_qty', width: 120, align: 'right', render: (v, rec) => formatQtyWithUnit(v, rec.unit) },
    { title: 'Qty Formula x Qty SPK', dataIndex: 'formula_qty_for_spk_qty', width: 170, align: 'right', render: (v, rec) => formatQtyWithUnit(v, rec.unit) },
    { title: 'Qty di SPK', dataIndex: 'spk_qty', width: 120, align: 'right', render: (v, rec) => formatQtyWithUnit(v, rec.unit) },
    { title: 'Qty di SPM', dataIndex: 'spm_qty', width: 120, align: 'right', render: (v, rec) => formatQtyWithUnit(v, rec.unit) },
    {
      title: 'Selisih SPM-SPK',
      key: 'spm_spk_qty_diff',
      width: 145,
      align: 'right',
      render: (_, rec) => {
        if (rec.spk_qty === null || rec.spk_qty === undefined || rec.spm_qty === null || rec.spm_qty === undefined) return '-'
        const diff = Number(rec.spm_qty || 0) - Number(rec.spk_qty || 0)
        return (
          <Text type={diff > 0 ? 'danger' : diff < 0 ? 'warning' : 'secondary'} strong={diff > 0}>
            {`${diff > 0 ? '+' : ''}${formatQty(diff)} ${rec.unit || ''}`.trim()}
          </Text>
        )
      },
    },
    { title: 'Stok', dataIndex: 'stock_qty', width: 120, align: 'right', render: (v, rec) => formatQtyWithUnit(v, rec.unit) },
    {
      title: 'Kurang',
      dataIndex: 'shortage_qty',
      width: 120,
      align: 'right',
      render: (v, rec) => {
        const shortage = Number(v || 0)
        return <Text type={shortage > 0 ? 'danger' : 'secondary'}>{formatQtyWithUnit(v, rec.unit)}</Text>
      },
    },
    { title: 'Status Stok', dataIndex: 'stock_status', width: 120, render: v => <Tag color={statusColor(v)}>{v || '-'}</Tag> },
    { title: 'Formula vs SPK', dataIndex: 'formula_spk_status', width: 150, render: v => <Tag color={statusColor(v)}>{v || '-'}</Tag> },
    { title: 'SPK vs SPM', dataIndex: 'spk_spm_status', width: 150, render: v => <Tag color={statusColor(v)}>{v || '-'}</Tag> },
  ]
  const formulaProductionColumns = [
    { title: 'No Biaya', dataIndex: 'cost_no', width: 190, fixed: 'left', render: v => <Text code>{v || '-'}</Text> },
    { title: 'Deskripsi', dataIndex: 'description', width: 280, ellipsis: { showTitle: false }, render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip> },
    { title: 'Kategori', dataIndex: 'category', width: 130, render: v => v ? <Tag color="geekblue">{v}</Tag> : '-' },
    { title: 'Jam Formula', dataIndex: 'formula_qty', width: 120, align: 'right', render: v => formatOptionalQty(v) },
    { title: 'Jam Formula x Qty SPK', dataIndex: 'formula_qty_for_spk_qty', width: 175, align: 'right', render: v => formatOptionalQty(v) },
    { title: 'Jam SPK', dataIndex: 'spk_qty', width: 110, align: 'right', render: v => formatOptionalQty(v) },
  ]
  const visibleColumns = filterColumnsByPermission('spk', columns, user)

  const renderFormulaDetail = record => {
    const detail = formulaDetails[record.wodet_id]
    const loadingDetail = !!formulaLoading[record.wodet_id]
    return (
      <Space direction="vertical" size={12} style={{ width: '100%', padding: '12px 12px 14px' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center">
          <Space direction="vertical" size={2}>
            <Text strong>{`Detail ${record.no_spk || '-'}`}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {detail?.no_formula ? `Formula ${detail.no_formula}` : 'Detail formula berdasarkan qty'}
            </Text>
          </Space>
        </Space>

        <Text strong>Rincian Material Formula</Text>
        <Table
          rowKey={(row, index) => `${row.material_no || 'material'}-${index}`}
          columns={formulaMaterialColumns}
          dataSource={detail?.materials || []}
          loading={loadingDetail}
          pagination={false}
          size="small"
          scroll={{ x: 1685 }}
          locale={{ emptyText: loadingDetail ? 'Memuat rincian material...' : 'Tidak ada rincian material formula' }}
        />

        <Text strong>Rincian Biaya Produksi</Text>
        <Table
          rowKey={(row, index) => `${row.cost_no || 'produksi'}-${index}`}
          columns={formulaProductionColumns}
          dataSource={detail?.production_details || []}
          loading={loadingDetail}
          pagination={false}
          size="small"
          scroll={{ x: 1005 }}
          locale={{ emptyText: loadingDetail ? 'Memuat rincian produksi...' : 'Tidak ada rincian biaya produksi' }}
        />
      </Space>
    )
  }

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={8} xl={5}>
          <Card size="small">
            <Statistic
              title="Total SPK"
              value={summary.total_spk}
              prefix={<ToolOutlined />}
              valueStyle={{ color: '#1a73e8' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={5}>
          <Card size="small">
            <Statistic
              title="Sudah Selesai"
              value={summary.spk_selesai}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={5}>
          <Card size="small">
            <Statistic
              title="Masih Berjalan"
              value={summary.spk_berjalan}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={5}>
          <Card size="small">
            <Statistic
              title="Barang Selesai GP"
              value={summary.item_selesai_gp}
              valueStyle={{ color: '#13c2c2' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} xl={4}>
          <Card size="small">
            <Statistic
              title="Total Item"
              value={summary.total_item}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <span>
            <ToolOutlined style={{ marginRight: 8, color: '#1a73e8' }} />
            Surat Perintah Kerja (SPK)
          </span>
        }
        extra={
          <Space wrap>
            <RangePicker
              value={dateRange}
              format="DD/MM/YYYY"
              onChange={handleDateChange}
              placeholder={['Tgl Dari', 'Tgl Sampai']}
              style={{ width: 220 }}
            />
            <Select
              value={status}
              options={STATUS_FILTER_OPTIONS}
              onChange={handleStatus}
              style={{ width: 150 }}
            />
            <Search
              placeholder="Cari SPK, pesanan, no barang..."
              allowClear
              value={search}
              style={{ width: 250 }}
              onSearch={handleSearch}
              onChange={e => {
                setSearch(e.target.value)
                if (!e.target.value) handleSearch('')
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              Reset
            </Button>
            <Button
              type="primary"
              icon={<FileExcelOutlined />}
              onClick={handleExport}
              loading={exporting}
              disabled={exporting}
              style={{ background: '#217346', borderColor: '#217346' }}
            >
              Export XLS
            </Button>
          </Space>
        }
      >
        <Table
          rowKey={(rec, idx) => `${rec.no_spk}-${rec.no_barang}-${idx}`}
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1800 }}
          onRow={rec => ({
            style: { background: getRowBg(rec) },
          })}
          expandable={{
            expandedRowRender: renderFormulaDetail,
            onExpand: (expanded, record) => {
              if (expanded) loadFormulaDetail(record)
            },
            rowExpandable: record => !!record.wodet_id,
          }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ~${total} baris`,
            onChange: (page, pageSize) => fetchData(page, pageSize, search, dateRange, status),
          }}
        />
      </Card>
    </div>
  )
}

const PRODUCTION_STATUS_MAP = {
  'Belum Mulai': { badge: 'default',    color: '#8c8c8c' },
  'In Progress': { badge: 'processing', color: '#1890ff' },
  'Selesai':     { badge: 'success',    color: '#52c41a' },
}

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'Belum Mulai', label: 'Belum Mulai' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Selesai', label: 'Selesai' },
]
