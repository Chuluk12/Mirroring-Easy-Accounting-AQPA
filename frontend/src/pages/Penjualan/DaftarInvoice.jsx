import { useEffect, useState, useCallback } from 'react'
import {
  Table, Input, Card, DatePicker, Space, Tag, Tooltip,
  Statistic, Row, Col, Typography, Button, Switch, Divider
} from 'antd'
import {
  ReloadOutlined, FileTextOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, FileExcelOutlined
} from '@ant-design/icons'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import DocumentDetailDrawer from '../../components/DocumentDetailDrawer'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { Text } = Typography


const fmt = (val) =>
  val ? `Rp ${Number(val).toLocaleString('id-ID', { maximumFractionDigits: 0 })}` : 'Rp 0'
const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]

const INVOICE_EXPORT_COLS = [
  { key: 'no', label: 'No', type: 'number' },
  { key: 'no_faktur', label: 'No Faktur' },
  { key: 'tgl_faktur', label: 'Tgl Faktur', type: 'date' },
  { key: 'no_po', label: 'No PO' },
  { key: 'no_pesanan', label: 'No Pesanan' },
  { key: 'no_pengiriman', label: 'No Pengiriman' },
  { key: 'no_pelanggan', label: 'No Pelanggan' },
  { key: 'nama_pelanggan', label: 'Nama Pelanggan' },
  { key: 'nilai_faktur', label: 'Nilai Faktur', type: 'number' },
  { key: 'uang_muka', label: 'Uang Muka', type: 'number' },
  { key: 'nilai_terbayar', label: 'Nilai Terbayar', type: 'number' },
  { key: 'terhutang', label: 'Terhutang', type: 'number' },
  { key: 'umur_hari', label: 'Umur (Hari)', type: 'number' },
  { key: 'umur_label', label: 'Status' },
  { key: 'deskripsi', label: 'Deskripsi' },
]

export default function DaftarInvoice() {
  const { user } = useAuth()
  const [data,        setData]        = useState([])
  const [loading,     setLoading]     = useState(false)
  const [search,      setSearch]      = useState('')
  const [dateRange,   setDateRange]   = useState(getCurrentMonthRange)
  const [onlyOwing,   setOnlyOwing]   = useState(false)
  const [pagination,  setPagination]  = useState({ current: 1, pageSize: 20, total: 0 })
  const [summary,     setSummary]     = useState({
    total_nilai: 0, total_terbayar: 0, total_dp: 0, total_terhutang: 0
  })
  const [totalFaktur, setTotalFaktur] = useState(0)
  const [selected, setSelected]       = useState(null)

  const fetchData = useCallback(async (
    page = 1, pageSize = 20, q = '', dates = [null, null], owing = false, showLoading = true
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (q)        params.search     = q
      if (dates[0]) params.date_from  = dates[0].format('YYYY-MM-DD')
      if (dates[1]) params.date_to    = dates[1].format('YYYY-MM-DD')
      if (owing)    params.only_owing = '1'

      const res = await api.get(`/api/invoice`, { params })
      setData(res.data.data || [])
      setSummary(res.data.summary || {})
      setTotalFaktur(res.data.total_faktur || 0)
      setPagination(p => ({
        ...p, current: page, pageSize,
        total: res.data.total || 0,
      }))
    } catch (e) {
      console.error('Gagal fetch invoice:', e)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(1, 20, '', getCurrentMonthRange(), false)
    const interval = setInterval(() => {
      fetchData(pagination.current, pagination.pageSize, search, dateRange, onlyOwing, false)
    }, 10000)
    return () => clearInterval(interval)
  }, [dateRange, fetchData, onlyOwing, pagination.current, pagination.pageSize, search])

  const handleSearch  = (val) => { setSearch(val); fetchData(1, pagination.pageSize, val, dateRange, onlyOwing) }
  const handleDate    = (d)   => { setDateRange(d || [null, null]); fetchData(1, pagination.pageSize, search, d || [null, null], onlyOwing) }
  const handleOwing   = (v)   => { setOnlyOwing(v); fetchData(1, pagination.pageSize, search, dateRange, v) }
  const handleReset   = ()    => {
    const currentMonth = getCurrentMonthRange()
    setSearch(''); setDateRange(currentMonth); setOnlyOwing(false)
    fetchData(1, pagination.pageSize, '', currentMonth, false)
  }

  const handleExport = async () => {
    const params = {}
    if (search)       params.search     = search
    if (dateRange[0]) params.date_from  = dateRange[0].format('YYYY-MM-DD')
    if (dateRange[1]) params.date_to    = dateRange[1].format('YYYY-MM-DD')
    if (onlyOwing)    params.only_owing = '1'

    exportRowsToXLS({
      fetchRows: async () => {
        const res = await api.get(`/api/invoice/export`, { params })
        return (res.data.data || []).map((row, index) => ({ no: index + 1, ...row }))
      },
      columns: [
        INVOICE_EXPORT_COLS[0],
        ...filterExportColumnsByPermission('invoice', INVOICE_EXPORT_COLS.slice(1), user),
      ],
      filename: 'DaftarInvoice',
      sheetName: 'Daftar Invoice',
    })
  }

  const serialColumn = {
    title: 'No',
    key: 'no',
    width: 70,
    fixed: 'left',
    align: 'center',
    render: (_, __, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1,
  }

  const columns = [
    {
      title: 'No Faktur', dataIndex: 'no_faktur', key: 'no_faktur',
      width: 160, fixed: 'left',
      render: v => (
        <Text code style={{ fontSize: 11, color: '#1a73e8', fontWeight: 600 }}>{v}</Text>
      ),
    },
    {
      title: 'Tgl Faktur', dataIndex: 'tgl_faktur', key: 'tgl_faktur', width: 108,
      render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'No PO', dataIndex: 'no_po', key: 'no_po', width: 170,
      ellipsis: { showTitle: false },
      render: v => v
        ? <Tooltip title={v}><Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag></Tooltip>
        : '-',
    },
    {
      title: 'No Pesanan', dataIndex: 'no_pesanan', key: 'no_pesanan', width: 155,
      render: v => v
        ? <Tag color="geekblue" style={{ fontSize: 11 }}>{v}</Tag>
        : <Text type="secondary" style={{ fontSize: 11 }}>-</Text>,
    },
    {
      title: 'No Pengiriman', dataIndex: 'no_pengiriman', key: 'no_pengiriman', width: 155,
      render: v => v
        ? <Tag color="purple" style={{ fontSize: 11 }}>{v}</Tag>
        : <Text type="secondary" style={{ fontSize: 11 }}>-</Text>,
    },
    {
      title: 'No Pelanggan', dataIndex: 'no_pelanggan', key: 'no_pelanggan', width: 115,
      render: v => v || '-',
    },
    {
      title: 'Nama Pelanggan', dataIndex: 'nama_pelanggan', key: 'nama_pelanggan',
      width: 200, ellipsis: { showTitle: false },
      render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip>,
    },
    {
      title: 'Nilai Faktur', dataIndex: 'nilai_faktur', key: 'nilai_faktur',
      width: 155, align: 'right',
      render: v => <Text strong>{fmt(v)}</Text>,
    },
    {
      title: 'Uang Muka', dataIndex: 'uang_muka', key: 'uang_muka',
      width: 130, align: 'right',
      render: v => v > 0 ? <Text type="secondary">{fmt(v)}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: 'Terbayar', dataIndex: 'nilai_terbayar', key: 'nilai_terbayar',
      width: 145, align: 'right',
      render: v => v > 0
        ? <Text style={{ color: '#52c41a' }}>{fmt(v)}</Text>
        : <Text type="secondary">-</Text>,
    },
    {
      title: 'Terhutang', dataIndex: 'terhutang', key: 'terhutang',
      width: 155, align: 'right', fixed: 'right',
      render: v => v <= 0
        ? <span style={{ color: '#52c41a', fontWeight: 600 }}>
            <CheckCircleOutlined style={{ marginRight: 4 }} />Lunas
          </span>
        : <Text strong style={{ color: '#ff4d4f' }}>{fmt(v)}</Text>,
    },
    {
      title: 'Umur', dataIndex: 'umur_hari', key: 'umur_hari',
      width: 85, align: 'center', fixed: 'right',
      render: (v, rec) => {
        if (rec.terhutang <= 0) return <Tag color="green">Lunas</Tag>
        const colorMap = { success: 'green', warning: 'gold', orange: 'orange', error: 'red' }
        return <Tag color={colorMap[rec.umur_color] || 'default'} style={{ fontWeight: 600 }}>{v} hr</Tag>
      },
    },
    {
      title: 'Deskripsi', dataIndex: 'deskripsi', key: 'deskripsi',
      width: 200, ellipsis: { showTitle: false },
      render: v => <Tooltip title={v}><span>{v || '-'}</span></Tooltip>,
    },
  ]

  const detailFields = [
    { key: 'no_faktur', label: 'No Faktur', render: v => <Text strong>{v}</Text> },
    { key: 'tgl_faktur', label: 'Tanggal Faktur', render: v => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
    { key: 'no_pesanan', label: 'No Pesanan' },
    { key: 'no_pengiriman', label: 'No Pengiriman' },
    { key: 'no_po', label: 'No PO' },
    { key: 'no_pelanggan', label: 'No Pelanggan' },
    { key: 'nama_pelanggan', label: 'Nama Pelanggan' },
    { key: 'nilai_faktur', label: 'Nilai Faktur', render: v => <Text strong>{fmt(v)}</Text> },
    { key: 'uang_muka', label: 'Uang Muka', render: v => fmt(v) },
    { key: 'nilai_terbayar', label: 'Nilai Terbayar', render: v => <Text style={{ color: '#52c41a' }}>{fmt(v)}</Text> },
    {
      key: 'terhutang',
      label: 'Terhutang',
      render: v => v <= 0 ? <Tag color="green">Lunas</Tag> : <Text strong style={{ color: '#ff4d4f' }}>{fmt(v)}</Text>,
    },
    { key: 'umur_hari', label: 'Umur Piutang', render: (v) => selected?.terhutang <= 0 ? 'Lunas' : `${v || 0} hari` },
    { key: 'deskripsi', label: 'Deskripsi' },
  ]
  const visibleColumns = [serialColumn, ...filterColumnsByPermission('invoice', columns, user)]
  const visibleDetailFields = detailFields.filter(field => !field.key || filterExportColumnsByPermission('invoice', [{ key: field.key }], user).length)

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Total Faktur" value={totalFaktur}
              prefix={<FileTextOutlined />} valueStyle={{ color: '#1a73e8' }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Total Nilai" value={fmt(summary.total_nilai)}
              valueStyle={{ color: '#1a73e8', fontSize: 14 }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Total Terbayar" value={fmt(summary.total_terbayar)}
              valueStyle={{ color: '#52c41a', fontSize: 14 }}
              prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small">
            <Statistic title="Total Terhutang" value={fmt(summary.total_terhutang)}
              valueStyle={{ color: summary.total_terhutang > 0 ? '#ff4d4f' : '#52c41a', fontSize: 14 }}
              prefix={<ExclamationCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space split={<Divider type="vertical" />}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>Umur Piutang:</Typography.Text>
          <Tag color="green">Lunas</Tag>
          <Tag color="gold">≤ 30 hari</Tag>
          <Tag color="orange">31–60 hari</Tag>
          <Tag color="red">&gt; 60 hari</Tag>
        </Space>
      </Card>

      <Card
        title={<span><FileTextOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Daftar Invoice Penjualan</span>}
        extra={
          <Space wrap>
            <Space>
              <Typography.Text style={{ fontSize: 12 }}>Hanya Terhutang</Typography.Text>
              <Switch size="small" checked={onlyOwing} onChange={handleOwing}
                style={{ backgroundColor: onlyOwing ? '#ff4d4f' : undefined }} />
            </Space>
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={handleDate}
              placeholder={['Tgl Dari', 'Tgl Sampai']} style={{ width: 220 }} />
            <Input.Search
              placeholder="Cari no faktur, pelanggan, PO..."
              allowClear value={search} style={{ width: 260 }}
              onSearch={handleSearch}
              onChange={e => { setSearch(e.target.value); if (!e.target.value) handleSearch('') }}
            />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
            <Button
              type="primary"
              icon={<FileExcelOutlined />}
              onClick={handleExport}
              style={{ background: '#217346', borderColor: '#217346' }}
            >
              Export XLS
            </Button>
          </Space>
        }
      >
        <Table
          className="sales-freeze-table"
          rowKey="no_faktur"
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          sticky={{ offsetHeader: 0 }}
          scroll={{ x: 1900, y: 'calc(100vh - 360px)' }}
          onRow={rec => ({
            onClick: () => setSelected(rec),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t, r) => `${r[0]}–${r[1]} dari ${t} faktur`,
            onChange: (p, ps) => fetchData(p, ps, search, dateRange, onlyOwing),
          }}
        />
      </Card>
      <DocumentDetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Detail Invoice ${selected?.no_faktur || ''}`}
        subtitle={selected?.nama_pelanggan}
        record={selected}
        fields={visibleDetailFields}
        lineRows={[]}
        lineColumns={[]}
      />
    </div>
  )
}
