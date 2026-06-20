import { useCallback, useEffect, useState } from 'react'
import { Button, Card, DatePicker, Input, Row, Col, Segmented, Space, Statistic, Table, Tag, Tooltip, Typography, message } from 'antd'
import { FileExcelOutlined, FileSearchOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useSearchParams } from 'react-router-dom'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text } = Typography

const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]
const formatRp = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0)

const EXPORT_COLUMNS = [
  { key: 'tanggal', label: 'Tanggal', type: 'date' },
  { key: 'no_project', label: 'No Project' },
  { key: 'nama_project', label: 'Nama Project' },
  { key: 'no_akun', label: 'No Akun' },
  { key: 'nama_akun', label: 'Nama Akun' },
  { key: 'tipe_transaksi', label: 'Tipe Transaksi' },
  { key: 'no_dokumen', label: 'No Dokumen' },
  { key: 'deskripsi', label: 'Deskripsi' },
  { key: 'nilai', label: 'Nilai', type: 'number' },
]

export default function DetailProject() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialProject = searchParams.get('project') || ''
  const initialType = searchParams.get('type') || 'mkt'
  const [data, setData] = useState([])
  const [summary, setSummary] = useState({ total_transaksi: 0, nilai: 0 })
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState(initialProject)
  const [projectType, setProjectType] = useState(initialType)
  const [dateRange, setDateRange] = useState(initialProject ? [null, null] : getCurrentMonthRange)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 })
  const linkedProjectNo = searchParams.get('project') || ''

  const fetchData = useCallback(async (page = 1, pageSize = 50) => {
    setLoading(true)
    try {
      const params = {
        search,
        project_type: projectType,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }
      if (linkedProjectNo) params.project_no = linkedProjectNo
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD')
      const res = await api.get('/api/project/detail', { params })
      setData(res.data.data || [])
      setSummary(res.data.summary || { total_transaksi: 0, nilai: 0 })
      setPagination({ current: page, pageSize, total: res.data.total || 0 })
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat detail project')
    } finally {
      setLoading(false)
    }
  }, [dateRange, projectType, search, linkedProjectNo])

  useEffect(() => {
    fetchData(1, pagination.pageSize)
  }, [fetchData, pagination.pageSize])

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = { search, project_type: projectType }
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD')
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD')
      const res = await api.get('/api/project/detail/export', { params })
      exportRowsToXLS(res.data.data || [], EXPORT_COLUMNS, `DetailProject-${projectType.toUpperCase()}-${dayjs().format('YYYYMMDD-HHmm')}`, 'Detail Project')
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal export detail project')
    } finally {
      setExporting(false)
    }
  }

  const columns = withTableSorters([
    { title: 'Tanggal', dataIndex: 'tanggal', width: 120, fixed: 'left', render: value => value ? <Tag color="blue">{dayjs(value).format('DD/MM/YYYY')}</Tag> : '-' },
    { title: 'No Project', dataIndex: 'no_project', width: 150, fixed: 'left', render: value => <Text code>{value || '-'}</Text> },
    { title: 'Nama Project', dataIndex: 'nama_project', width: 260, ellipsis: true },
    { title: 'No Akun', dataIndex: 'no_akun', width: 130 },
    { title: 'Nama Akun', dataIndex: 'nama_akun', width: 240, ellipsis: true },
    { title: 'Tipe', dataIndex: 'tipe_transaksi', width: 100 },
    { title: 'No Dokumen', dataIndex: 'no_dokumen', width: 150, render: value => <Text code>{value || '-'}</Text> },
    { title: 'Deskripsi', dataIndex: 'deskripsi', width: 420, ellipsis: { showTitle: false }, render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip> },
    { title: 'Nilai', dataIndex: 'nilai', width: 150, align: 'right', render: value => <Text strong type={Number(value || 0) < 0 ? 'danger' : undefined}>{formatRp(value)}</Text> },
  ])

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card size="small"><Statistic title="Total Transaksi" value={summary.total_transaksi || 0} prefix={<FileSearchOutlined />} /></Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small"><Statistic title="Total Nilai" value={summary.nilai || 0} formatter={formatRp} /></Card>
        </Col>
      </Row>

      <Card
        title={<Space><FileSearchOutlined /> Detail Project</Space>}
        extra={(
          <Space wrap>
            <RangePicker value={dateRange} format="DD/MM/YYYY" onChange={dates => setDateRange(dates || [null, null])} />
            <Search
              allowClear
              placeholder="Cari project, akun, dokumen, deskripsi"
              prefix={<SearchOutlined />}
              style={{ width: 320 }}
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                if (searchParams.get('project')) setSearchParams({})
              }}
              onSearch={() => fetchData(1, pagination.pageSize)}
            />
            <Segmented
              value={projectType}
              onChange={value => {
                setProjectType(value)
                if (searchParams.get('project')) setSearchParams({})
                setPagination(prev => ({ ...prev, current: 1 }))
              }}
              options={[
                { value: 'mkt', label: 'MKT' },
                { value: 'ga', label: 'GA' },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={() => { setSearchParams({}); setSearch(''); setDateRange(getCurrentMonthRange()); fetchData(1, pagination.pageSize) }}>Reset</Button>
            <Button type="primary" icon={<FileExcelOutlined />} loading={exporting} onClick={handleExport}>Export XLS</Button>
          </Space>
        )}
      >
        <Table
          rowKey={(record, index) => `${record.tanggal}-${record.no_project}-${record.no_akun}-${index}`}
          loading={loading}
          columns={columns}
          dataSource={data}
          size="small"
          scroll={{ x: 2100 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100, 200],
            showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} transaksi`,
          }}
          onChange={next => fetchData(next.current, next.pageSize)}
        />
      </Card>
    </div>
  )
}
