import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, DatePicker, Input, message, Space, Table } from 'antd'
import { FileExcelOutlined, SearchOutlined } from '@ant-design/icons'
import { useLocation } from 'react-router-dom'
import dayjs from 'dayjs'
import api, { getApiErrorMessage } from '../api/client'
import { exportRowsToXLS } from '../utils/exportXls'

const { Search } = Input
const { RangePicker } = DatePicker
const DEFAULT_PAGE_SIZE = 20

const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs()]

const barangStaticColumns = [
  { title: 'No', dataIndex: 'no_urut', key: 'no_urut', width: 70 },
  { title: 'No. Barang', dataIndex: 'no_barang', key: 'no_barang', width: 190, fixed: 'left' },
  { title: 'Deskripsi Persediaan', dataIndex: 'deskripsi_persediaan', key: 'deskripsi_persediaan', width: 260 },
  { title: 'Kode Barang Jadi', dataIndex: 'kode_barang_jadi', key: 'kode_barang_jadi', width: 160 },
  { title: 'Jenis Barang Jadi', dataIndex: 'jenis_barang_jadi', key: 'jenis_barang_jadi', width: 170 },
  { title: 'FSA', dataIndex: 'fsa', key: 'fsa', width: 130 },
  { title: 'HS Code', dataIndex: 'hs_code', key: 'hs_code', width: 130 },
  { title: 'KBLI', dataIndex: 'kbli', key: 'kbli', width: 120 },
  { title: 'Barang Jadi', dataIndex: 'barang_jadi', key: 'barang_jadi', width: 180 },
  { title: 'Jenis Persediaan', dataIndex: 'jenis_persediaan', key: 'jenis_persediaan', width: 160 },
  { title: 'Akun Persediaan', dataIndex: 'akun_persediaan', key: 'akun_persediaan', width: 160 },
  { title: 'Nama Pemasok Barang', dataIndex: 'nama_pemasok_barang', key: 'nama_pemasok_barang', width: 190 },
  { title: 'Unit 1', dataIndex: 'unit_1', key: 'unit_1', width: 100 },
  { title: 'Rasio 2 Barang', dataIndex: 'rasio_2_barang', key: 'rasio_2_barang', width: 150 },
  { title: 'Unit 2', dataIndex: 'unit_2', key: 'unit_2', width: 100 },
  { title: 'Rasio 3 Barang', dataIndex: 'rasio_3_barang', key: 'rasio_3_barang', width: 150 },
  { title: 'Unit 3', dataIndex: 'unit_3', key: 'unit_3', width: 100 },
]

const valuasiColumns = [
  { title: 'Tgl. Faktur', dataIndex: 'tgl_faktur', key: 'tgl_faktur', width: 120, type: 'date', render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
  { title: 'No Barang', dataIndex: 'no_barang', key: 'no_barang', width: 220 },
  { title: 'Deskripsi Barang', dataIndex: 'deskripsi_barang', key: 'deskripsi_barang', width: 360 },
  { title: 'Kode Barang Jadi', dataIndex: 'kode_barang_jadi', key: 'kode_barang_jadi', width: 160 },
  { title: 'Jenis Barang Jadi', dataIndex: 'jenis_barang_jadi', key: 'jenis_barang_jadi', width: 170 },
  { title: 'FSA', dataIndex: 'fsa', key: 'fsa', width: 120 },
  { title: 'HS Code', dataIndex: 'hs_code', key: 'hs_code', width: 130 },
  { title: 'KBLI', dataIndex: 'kbli', key: 'kbli', width: 120 },
  { title: 'Produk Jadi', dataIndex: 'barang_jadi', key: 'barang_jadi', width: 180 },
  { title: 'No. Faktur', dataIndex: 'no_faktur', key: 'no_faktur', width: 180 },
  { title: 'Tipe Transaksi', dataIndex: 'tipe_transaksi', key: 'tipe_transaksi', width: 190 },
  { title: 'Unit 1 Barang', dataIndex: 'unit_1', key: 'unit_1', width: 130 },
  { title: 'Masuk', dataIndex: 'masuk', key: 'masuk', width: 110, align: 'right', type: 'number', render: value => Number(value || 0).toFixed(2) },
  { title: 'Keluar', dataIndex: 'keluar', key: 'keluar', width: 110, align: 'right', type: 'number', render: value => Number(value || 0).toFixed(2) },
  { title: 'Nama Pelanggan/Pemasok', dataIndex: 'nama_pelanggan_pemasok', key: 'nama_pelanggan_pemasok', width: 230 },
  { title: 'Negara Pelanggan/Pemasok', dataIndex: 'negara_pelanggan_pemasok', key: 'negara_pelanggan_pemasok', width: 230 },
  { title: 'Tipe Persediaan Barang', dataIndex: 'tipe_persediaan_barang', key: 'tipe_persediaan_barang', width: 210 },
  { title: 'Akun Persediaan Barang', dataIndex: 'akun_persediaan_barang', key: 'akun_persediaan_barang', width: 220 },
  { title: 'Rasio 3 Barang', dataIndex: 'rasio_3_barang', key: 'rasio_3_barang', width: 150 },
]

function makePagination(pagination, onChange) {
  return {
    ...pagination,
    showSizeChanger: true,
    pageSizeOptions: [20, 50, 100, 200],
    showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} item`,
    onChange,
  }
}

export default function SIINAS() {
  const location = useLocation()
  const routeTab = location.pathname.includes('/valuasi-rinci') ? 'valuasi' : 'barang'
  const [barangRows, setBarangRows] = useState([])
  const [barangExtras, setBarangExtras] = useState([])
  const [barangLoading, setBarangLoading] = useState(false)
  const [barangSearch, setBarangSearch] = useState('')
  const [barangSorter, setBarangSorter] = useState({})
  const [barangPagination, setBarangPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })

  const [valuasiRows, setValuasiRows] = useState([])
  const [valuasiLoading, setValuasiLoading] = useState(false)
  const [valuasiSearch, setValuasiSearch] = useState('')
  const [valuasiRange, setValuasiRange] = useState(getCurrentMonthRange)
  const [valuasiPagination, setValuasiPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })

  const barangColumns = useMemo(() => barangStaticColumns.map(column => ({
    ...column,
    sorter: true,
    sortOrder: barangSorter.field === column.dataIndex ? barangSorter.order : null,
  })), [barangSorter])

  const fetchBarang = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE, search = barangSearch, sorter = barangSorter) => {
    setBarangLoading(true)
    try {
      const res = await api.get('/api/siinas/barang', {
        params: {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          search,
          sort_field: sorter.field || '',
          sort_order: sorter.order || '',
        },
      })
      setBarangRows(res.data.data || [])
      setBarangExtras(res.data.extra_columns || [])
      setBarangPagination({ current: page, pageSize, total: Number(res.data.total || 0) })
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat data Siinas Barang'))
    } finally {
      setBarangLoading(false)
    }
  }, [barangSearch, barangSorter])

  const fetchValuasi = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE, search = valuasiSearch, dateRange = valuasiRange) => {
    setValuasiLoading(true)
    try {
      const res = await api.get('/api/siinas/valuasi-rinci', {
        params: {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          search,
          date_from: dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : '',
          date_to: dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : '',
        },
      })
      setValuasiRows(res.data.data || [])
      setValuasiPagination({ current: page, pageSize, total: Number(res.data.total || 0) })
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat data Valuasi Rinci'))
    } finally {
      setValuasiLoading(false)
    }
  }, [valuasiRange, valuasiSearch])

  useEffect(() => {
    fetchBarang(1, DEFAULT_PAGE_SIZE, '')
  }, [fetchBarang])

  useEffect(() => {
    if (routeTab === 'valuasi' && valuasiRows.length === 0) {
      fetchValuasi(1, valuasiPagination.pageSize, valuasiSearch)
    }
  }, [routeTab, fetchValuasi, valuasiPagination.pageSize, valuasiRows.length, valuasiSearch])

  const exportBarang = () => exportRowsToXLS({
    rows: barangRows,
    columns: barangColumns.map(column => ({ key: column.dataIndex, label: column.title })),
    filename: 'siinas-barang.xls',
  })

  const exportValuasi = () => exportRowsToXLS({
    rows: valuasiRows,
    columns: valuasiColumns.map(column => ({ key: column.dataIndex, label: column.title, type: column.type })),
    filename: 'siinas-valuasi-rinci.xls',
  })

  const barangToolbar = (
    <Space>
      <Search
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Cari no barang, deskripsi, atau kolom tambahan..."
        style={{ width: 360 }}
        onSearch={(value) => {
          setBarangSearch(value)
          fetchBarang(1, barangPagination.pageSize, value, barangSorter)
        }}
      />
      <Button type="primary" icon={<FileExcelOutlined />} onClick={exportBarang}>
        Export XLS
      </Button>
    </Space>
  )

  const valuasiToolbar = (
    <Space>
      <RangePicker
        value={valuasiRange}
        format="DD/MM/YYYY"
        onChange={(value) => {
          const nextRange = value || null
          setValuasiRange(nextRange)
          fetchValuasi(1, valuasiPagination.pageSize, valuasiSearch, nextRange)
        }}
        style={{ width: 245 }}
      />
      <Search
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Cari kode barang..."
        style={{ width: 360 }}
        onSearch={(value) => {
          setValuasiSearch(value)
          fetchValuasi(1, valuasiPagination.pageSize, value)
        }}
      />
      <Button type="primary" icon={<FileExcelOutlined />} onClick={exportValuasi}>
        Export XLS
      </Button>
    </Space>
  )

  return (
    <Card
      style={{ borderRadius: 8, border: '1px solid rgba(226,231,240,0.88)' }}
      styles={{ body: { padding: 16 } }}
    >
      {routeTab === 'valuasi' ? (
        <Table
          rowKey={(record, index) => `${record.no_faktur}-${record.no_barang}-${index}`}
          title={() => valuasiToolbar}
          columns={valuasiColumns}
          dataSource={valuasiRows}
          loading={valuasiLoading}
          size="small"
          bordered={false}
          scroll={{ x: 3100, y: 'calc(100vh - 300px)' }}
          pagination={makePagination(valuasiPagination, (page, pageSize) => fetchValuasi(page, pageSize, valuasiSearch))}
        />
      ) : (
        <Table
          rowKey={(record) => `${record.no_urut}-${record.no_barang}`}
          title={() => barangToolbar}
          columns={barangColumns}
          dataSource={barangRows}
          loading={barangLoading}
          size="small"
          bordered={false}
          scroll={{ x: 2600, y: 'calc(100vh - 300px)' }}
          pagination={makePagination(barangPagination)}
          onChange={(pagination, filters, sorter, extra) => {
            const nextSorter = {
              field: sorter?.field || '',
              order: sorter?.order || '',
            }
            const nextPage = extra?.action === 'sort' ? 1 : pagination.current
            setBarangSorter(nextSorter)
            fetchBarang(nextPage, pagination.pageSize, barangSearch, nextSorter)
          }}
        />
      )}
    </Card>
  )
}
