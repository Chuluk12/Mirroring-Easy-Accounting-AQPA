import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Input, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import {
  FileExcelOutlined, FileTextOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../../utils/columnPermissions'
import DocumentDetailDrawer from '../../components/DocumentDetailDrawer'

const { Search } = Input
const { Text } = Typography

const FORMULA_EXPORT_COLS = [
  { key: 'no_formula', label: 'No. Formula' },
  { key: 'kategori_produk', label: 'Kategori Produk' },
  { key: 'deskripsi_formula', label: 'Deskripsi Formula' },
  { key: 'no_barang', label: 'No. Barang' },
  { key: 'spesifikasi_produk', label: 'Spesifikasi Produk' },
  { key: 'qty_build', label: 'Qty Build', type: 'number' },
  { key: 'unit', label: 'Unit' },
  { key: 'status', label: 'Status' },
  { key: 'total_material', label: 'Total Material', type: 'number' },
]

const formatQty = value =>
  Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 4 })

export default function Formula() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [materials, setMaterials] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })

  const searchRef = useRef('')
  const categoryRef = useRef('')
  const statusRef = useRef('')
  const pageRef = useRef(1)
  const pageSizeRef = useRef(20)

  const fetchData = useCallback(async (
    page = 1,
    pageSize = 20,
    searchVal = '',
    categoryVal = '',
    statusVal = '',
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal) params.search = searchVal
      if (categoryVal) params.category = categoryVal
      if (statusVal) params.status = statusVal

      const res = await api.get('/api/formula', { params })
      const rows = res.data.data || []
      setData(rows)
      setCategories(res.data.categories || [])
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: res.data.total || rows.length,
      }))
    } catch (error) {
      console.error('Gagal fetch formula:', error)
      message.error('Gagal memuat data formula')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => {
      fetchData(pageRef.current, pageSizeRef.current, searchRef.current, categoryRef.current, statusRef.current, false)
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  const openDetail = async record => {
    setSelected(record)
    setDetailLoading(true)
    try {
      const res = await api.get(`/api/formula/${record.formula_id}/materials`)
      setMaterials(res.data.data || [])
    } catch (error) {
      console.error('Gagal fetch detail formula:', error)
      setMaterials([])
      message.error('Gagal memuat material formula')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleSearch = value => {
    searchRef.current = value
    setSearch(value)
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, value, categoryRef.current, statusRef.current)
  }

  const handleCategory = value => {
    categoryRef.current = value || ''
    setCategory(value || '')
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, value || '', statusRef.current)
  }

  const handleStatus = value => {
    statusRef.current = value || ''
    setStatus(value || '')
    pageRef.current = 1
    fetchData(1, pageSizeRef.current, searchRef.current, categoryRef.current, value || '')
  }

  const handleReset = () => {
    searchRef.current = ''
    categoryRef.current = ''
    statusRef.current = ''
    setSearch('')
    setCategory('')
    setStatus('')
    pageRef.current = 1
    fetchData(1, 20, '', '', '')
  }

  const handleExport = () => exportRowsToXLS({
    fetchRows: async () => {
      const params = {}
      if (searchRef.current) params.search = searchRef.current
      if (categoryRef.current) params.category = categoryRef.current
      if (statusRef.current) params.status = statusRef.current
      const res = await api.get('/api/formula/export', { params })
      return res.data.data || []
    },
    columns: filterExportColumnsByPermission('formula', FORMULA_EXPORT_COLS, user),
    filename: 'DaftarFormula',
    sheetName: 'Daftar Formula',
    message,
    setExporting,
    loadingText: 'Mengambil semua data formula...',
  })

  const columns = [
    {
      title: 'No. Formula',
      dataIndex: 'no_formula',
      key: 'no_formula',
      width: 170,
      fixed: 'left',
      render: value => <Text strong style={{ color: '#1a73e8' }}>{value || '-'}</Text>,
    },
    {
      title: 'Kategori Produk',
      dataIndex: 'kategori_produk',
      key: 'kategori_produk',
      width: 180,
      render: value => value ? <Tag color="geekblue">{value}</Tag> : '-',
    },
    {
      title: 'Deskripsi Formula',
      dataIndex: 'deskripsi_formula',
      key: 'deskripsi_formula',
      width: 300,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'No. Barang',
      dataIndex: 'no_barang',
      key: 'no_barang',
      width: 170,
      render: value => <Text code style={{ fontSize: 12 }}>{value || '-'}</Text>,
    },
    {
      title: 'Spesifikasi Produk',
      dataIndex: 'spesifikasi_produk',
      key: 'spesifikasi_produk',
      width: 300,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
    {
      title: 'Qty Build',
      dataIndex: 'qty_build',
      key: 'qty_build',
      width: 105,
      align: 'right',
      render: (value, record) => `${formatQty(value)} ${record.unit || ''}`,
    },
    {
      title: 'Material',
      dataIndex: 'total_material',
      key: 'total_material',
      width: 90,
      align: 'right',
      render: value => <Tag color="cyan">{value || 0}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      fixed: 'right',
      render: value => <Tag color={value === 'Aktif' ? 'green' : 'red'}>{value}</Tag>,
    },
  ]

  const detailFields = [
    { key: 'no_formula', label: 'No. Formula', render: value => <Text strong>{value}</Text> },
    { key: 'kategori_produk', label: 'Kategori Produk' },
    { key: 'deskripsi_formula', label: 'Deskripsi Formula' },
    { key: 'no_barang', label: 'No. Barang' },
    { key: 'spesifikasi_produk', label: 'Spesifikasi Produk' },
    { key: 'qty_build', label: 'Qty Build', render: value => `${formatQty(value)} ${selected?.unit || ''}` },
    { key: 'status', label: 'Status', render: value => <Tag color={value === 'Aktif' ? 'green' : 'red'}>{value}</Tag> },
  ]

  const materialColumns = [
    { title: 'No', dataIndex: 'seq', width: 60, align: 'right' },
    { title: 'No Barang', dataIndex: 'no_barang', width: 150, render: value => <Text code>{value || '-'}</Text> },
    { title: 'Nama Barang', dataIndex: 'nama_barang', width: 260, ellipsis: true },
    { title: 'Qty', dataIndex: 'qty', width: 95, align: 'right', render: (value, record) => `${formatQty(value)} ${record.unit || ''}` },
    { title: 'Keterangan', dataIndex: 'keterangan', width: 180, ellipsis: true },
  ]

  const visibleColumns = filterColumnsByPermission('formula', columns, user)
  const visibleDetailFields = detailFields.filter(field => !field.key || filterExportColumnsByPermission('formula', [{ key: field.key }], user).length)

  return (
    <Card
      title={<span><FileTextOutlined style={{ marginRight: 8, color: '#1a73e8' }} />Daftar Formula</span>}
      extra={
        <Space wrap>
          <Select
            placeholder="Kategori Produk"
            allowClear
            showSearch
            optionFilterProp="label"
            value={category || undefined}
            options={categories}
            onChange={handleCategory}
            style={{ width: 210 }}
          />
          <Select
            placeholder="Semua Status"
            allowClear
            value={status || undefined}
            options={[
              { value: 'active', label: 'Aktif' },
              { value: 'inactive', label: 'Tidak Aktif' },
            ]}
            onChange={handleStatus}
            style={{ width: 140 }}
          />
          <Search
            prefix={<SearchOutlined />}
            placeholder="Cari no formula, barang, deskripsi..."
            allowClear
            value={search}
            style={{ width: 290 }}
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
      <Table
        rowKey="formula_id"
        columns={withTableSorters(visibleColumns)}
        dataSource={data}
        loading={loading}
        size="small"
        scroll={{ x: 1500 }}
        onRow={record => ({
          onClick: () => openDetail(record),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} formula`,
          onChange: (page, pageSize) => {
            pageRef.current = page
            pageSizeRef.current = pageSize
            fetchData(page, pageSize, searchRef.current, categoryRef.current, statusRef.current)
          },
        }}
      />
      <DocumentDetailDrawer
        open={!!selected}
        onClose={() => {
          setSelected(null)
          setMaterials([])
        }}
        title={`Detail Formula ${selected?.no_formula || ''}`}
        subtitle={selected?.spesifikasi_produk}
        record={selected}
        fields={visibleDetailFields}
        lineTitle={detailLoading ? 'Memuat material...' : 'Material Formula'}
        lineRows={materials}
        lineColumns={materialColumns}
        width={860}
      />
    </Card>
  )
}
