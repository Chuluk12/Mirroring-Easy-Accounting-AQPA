import { useCallback, useEffect, useState } from 'react'
import { Card, DatePicker, Input, Select, Space, Table, Tag, Typography } from 'antd'
import { HistoryOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api/client'
import { withTableSorters } from '../utils/tableSorters'
import useVisiblePolling from '../hooks/useVisiblePolling'

const { RangePicker } = DatePicker
const { Text } = Typography
const DEFAULT_PAGE_SIZE = 20

const ACTION_OPTIONS = [
  { value: '', label: 'Semua Aktivitas' },
  { value: 'login', label: 'Login' },
  { value: 'login_failed', label: 'Login Gagal' },
  { value: 'export', label: 'Export Data' },
  { value: 'create_user', label: 'Tambah User' },
  { value: 'delete_user', label: 'Hapus User' },
]

const ACTION_COLOR = {
  login: 'green',
  login_failed: 'red',
  export: 'blue',
  create_user: 'purple',
  delete_user: 'volcano',
}

export default function AuditLog() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [dateRange, setDateRange] = useState([null, null])
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 })

  const fetchData = useCallback(async (
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    q = search,
    actionVal = action,
    dates = dateRange,
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (q) params.search = q
      if (actionVal) params.action = actionVal
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')

      const res = await api.get('/api/audit-logs', { params })
      setData(res.data.data || [])
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: res.data.total || 0,
      }))
    } catch (e) {
      console.error('Gagal memuat audit log:', e)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [action, dateRange, search])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useVisiblePolling(() => {
    fetchData(pagination.current, pagination.pageSize, search, action, dateRange, false)
  }, 30000)

  const columns = [
    {
      title: 'Waktu',
      dataIndex: 'created_at',
      width: 160,
      render: v => v ? dayjs(v).format('DD/MM/YYYY HH:mm:ss') : '-',
    },
    {
      title: 'User',
      dataIndex: 'name',
      width: 190,
      render: (_, rec) => (
        <div>
          <Text strong>{rec.name || rec.username || '-'}</Text>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{rec.username || '-'}</Text></div>
        </div>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      width: 110,
      render: v => v ? <Tag>{v.toUpperCase()}</Tag> : '-',
    },
    {
      title: 'Aktivitas',
      dataIndex: 'action',
      width: 145,
      render: v => <Tag color={ACTION_COLOR[v] || 'default'}>{v}</Tag>,
    },
    {
      title: 'Modul',
      dataIndex: 'module',
      width: 140,
      render: v => v ? <Tag color="geekblue">{v}</Tag> : '-',
    },
    {
      title: 'Keterangan',
      dataIndex: 'description',
      ellipsis: true,
      render: v => v || '-',
    },
    {
      title: 'IP',
      dataIndex: 'ip_address',
      width: 130,
      render: v => v || '-',
    },
  ]

  return (
    <Card
      title={<span><HistoryOutlined style={{ marginRight: 8 }} />Audit Log Aktivitas User</span>}
      extra={
        <Space wrap>
          <Select
            value={action}
            options={ACTION_OPTIONS}
            style={{ width: 170 }}
            onChange={val => {
              setAction(val)
              fetchData(1, pagination.pageSize, search, val, dateRange)
            }}
          />
          <RangePicker
            value={dateRange}
            format="DD/MM/YYYY"
            style={{ width: 230 }}
            onChange={dates => {
              const next = dates || [null, null]
              setDateRange(next)
              fetchData(1, pagination.pageSize, search, action, next)
            }}
          />
          <Input.Search
            allowClear
            value={search}
            placeholder="Cari user / keterangan..."
            style={{ width: 260 }}
            onSearch={val => {
              setSearch(val)
              fetchData(1, pagination.pageSize, val, action, dateRange)
            }}
            onChange={e => {
              setSearch(e.target.value)
              if (!e.target.value) fetchData(1, pagination.pageSize, '', action, dateRange)
            }}
          />
        </Space>
      }
    >
      <Table
        rowKey="id"
        columns={withTableSorters(columns)}
        dataSource={data}
        loading={loading}
        size="small"
        pagination={{
          ...pagination,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} dari ${total} aktivitas`,
          onChange: (page, pageSize) => fetchData(page, pageSize),
        }}
      />
    </Card>
  )
}
