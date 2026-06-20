import { useEffect, useState } from 'react'
import { Table, Card, Badge, Empty, DatePicker, Button, message } from 'antd'
import { FileExcelOutlined, PlusCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import api from '../api/client'
import { withTableSorters } from '../utils/tableSorters'
import { exportRowsToXLS } from '../utils/exportXls'
import { useAuth } from '../context/AuthContext'
import { filterColumnsByPermission, filterExportColumnsByPermission } from '../utils/columnPermissions'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

const BARANG_BARU_EXPORT_COLS = [
  { key: 'created_at', label: 'Waktu Dibuat', type: 'datetime' },
  { key: 'itemno', label: 'No. Barang' },
  { key: 'description', label: 'Deskripsi' },
  { key: 'description2', label: 'Deskripsi 2' },
  { key: 'unit', label: 'Satuan' },
]

export default function BarangBaru() {
  const { user } = useAuth()
  const [allData, setAllData] = useState([])
  const [filteredData, setFilteredData] = useState([])
  const [count, setCount] = useState(0)
  const [dateRange, setDateRange] = useState(null)
  const [exporting, setExporting] = useState(false)

  const fetchData = async (showLoading = false) => {
    try {
      const res = await api.get('/api/barang-baru', {
        params: { t: Date.now() }
      })
      setAllData(res.data.data)
      setCount(res.data.count)
    } catch (e) {
      console.error(e)
    }
  }

  // Filter berdasarkan tanggal
  useEffect(() => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) {
      setFilteredData(allData)
    } else {
      const start = dateRange[0].startOf('day')
      const end = dateRange[1].endOf('day')
      const filtered = allData.filter(item => {
        const d = dayjs(item.created_at)
        return d.isAfter(start) && d.isBefore(end)
      })
      setFilteredData(filtered)
    }
  }, [allData, dateRange])

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => fetchData(), 3000)
    return () => clearInterval(interval)
  }, [])

  const handleExport = () => exportRowsToXLS({
    rows: filteredData,
    columns: filterExportColumnsByPermission('barang-baru', BARANG_BARU_EXPORT_COLS, user),
    filename: 'BarangBaru',
    sheetName: 'Barang Baru',
    message,
    setExporting,
    loadingText: 'Menyiapkan data barang baru...',
  })

  const columns = [
    {
      title: 'Waktu Dibuat',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: val => <span style={{ color: '#1a73e8' }}>{val || '-'}</span>
    },
    {
      title: 'No. Barang',
      dataIndex: 'itemno',
      key: 'itemno',
      width: 200,
      render: val => <b style={{ color: '#52c41a' }}>{val}</b>
    },
    {
      title: 'Deskripsi',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Deskripsi 2',
      dataIndex: 'description2',
      key: 'description2',
    },
    {
      title: 'Satuan',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
  ]
  const visibleColumns = filterColumnsByPermission('barang-baru', columns, user)

  return (
    <Card
      title={
        <span>
          <PlusCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
          Barang Baru{' '}
          <Badge
            count={filteredData.length}
            overflowCount={999}
            style={{ backgroundColor: '#52c41a' }}
          />
        </span>
      }
      extra={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <RangePicker
            showTime
            format="YYYY-MM-DD HH:mm"
            placeholder={['Dari tanggal', 'Sampai tanggal']}
            onChange={val => setDateRange(val)}
            allowClear
          />
          <ReloadOutlined
            style={{ cursor: 'pointer', color: '#1a73e8', fontSize: 16 }}
            onClick={() => fetchData(true)}
          />
          <Button icon={<FileExcelOutlined />} onClick={handleExport} loading={exporting}>
            Export XLS
          </Button>
        </div>
      }
    >
      {filteredData.length === 0 ? (
        <Empty description="Belum ada barang baru" />
      ) : (
        <Table
          rowKey="itemid"
          columns={withTableSorters(visibleColumns)}
          dataSource={filteredData}
          pagination={{
            pageSize: 20,
            showTotal: (total) => `Total ${total} barang baru`
          }}
          scroll={{ x: 900 }}
          size="middle"
        />
      )}
    </Card>
  )
}
