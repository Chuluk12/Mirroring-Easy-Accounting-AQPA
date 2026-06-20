import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Table, Input, Card, DatePicker, Space, Tag, Tooltip, Select,
  Typography, Button, Badge, Progress
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, ToolOutlined,
  CheckCircleOutlined, ClockCircleOutlined
} from '@ant-design/icons'
import api from '../../api/client'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission } from '../../utils/columnPermissions'
import dayjs from 'dayjs'

const { Search } = Input
const { RangePicker } = DatePicker
const { Text } = Typography

const SLIDE_SIZE = 10
const SLIDE_INTERVAL_MS = 60000
const ROW_HIGHLIGHT_INTERVAL_MS = SLIDE_INTERVAL_MS / SLIDE_SIZE

const STATUS_MAP = {
  0: { label: 'Belum Mulai', color: 'default' },
  1: { label: 'Diproses',    color: 'processing' },
  2: { label: 'Selesai',     color: 'success' },
  3: { label: 'Ditunda',     color: 'warning' },
  4: { label: 'Dibatalkan',  color: 'error' },
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

const formatQty = (val) =>
  parseFloat(val || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })

const getCurrentYearRange = () => [dayjs().startOf('year'), dayjs().endOf('year')]

export default function MonitoringSPK() {
  const { user } = useAuth()
  const [data, setData]             = useState([])
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [dateRange, setDateRange]   = useState(getCurrentYearRange)
  const [status, setStatus]         = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: SLIDE_SIZE, total: 0 })

  const rowToneBySpk = useMemo(() => {
    const tones = new Map()
    let tone = 0
    data.forEach(row => {
      if (!tones.has(row.no_spk)) {
        tone = tone === 1 ? 2 : 1
        tones.set(row.no_spk, tone)
      }
    })
    return tones
  }, [data])

  const fetchData = useCallback(async (
    page = 1, pageSize = SLIDE_SIZE, searchVal = '', dates = getCurrentYearRange(), statusVal = ''
  ) => {
    setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchVal) params.search = searchVal
      if (dates[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates[1]) params.date_to = dates[1].format('YYYY-MM-DD')
      if (statusVal) params.status = statusVal

      const res = await api.get('/api/spk', { params })
      const rows = res.data.data || []

      setData(rows)
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: res.data.total || rows.length,
      }))
    } catch (e) {
      console.error('Gagal fetch monitoring SPK:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const totalPages = Math.max(Math.ceil((pagination.total || 0) / SLIDE_SIZE), 1)

    const timer = setInterval(() => {
      const nextPage = totalPages <= 1 || pagination.current >= totalPages ? 1 : pagination.current + 1
      fetchData(nextPage, SLIDE_SIZE, search, dateRange, status)
    }, SLIDE_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [dateRange, fetchData, pagination.current, pagination.total, search, status])

  const handleSearch = (val) => {
    setSearch(val)
    fetchData(1, SLIDE_SIZE, val, dateRange, status)
  }

  const handleDateChange = (dates) => {
    const nextDates = dates || [null, null]
    setDateRange(nextDates)
    fetchData(1, SLIDE_SIZE, search, nextDates, status)
  }

  const handleStatus = (val) => {
    setStatus(val)
    fetchData(1, SLIDE_SIZE, search, dateRange, val)
  }

  const handleReset = () => {
    const currentYear = getCurrentYearRange()
    setSearch('')
    setStatus('')
    setDateRange(currentYear)
    fetchData(1, SLIDE_SIZE, '', currentYear, '')
  }

  const columns = [
    {
      title: 'No Perintah Kerja',
      dataIndex: 'no_spk',
      key: 'no_spk',
      width: 170,
      render: val => (
        <Text className="monitoring-spk-code monitoring-spk-code-primary">
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
          <Tag color="geekblue" className="monitoring-spk-tag">
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
        ? <Tag color="purple" className="monitoring-spk-tag">{val}</Tag>
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
        const tgl = dayjs(val)
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
            {(val || '-').replace(/\r?\n/g, ' - ')}
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
        ? <Text className="monitoring-spk-code">{val}</Text>
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
          <span className="monitoring-spk-item-name">{val || rec.job_desc || '-'}</span>
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
        const statusText = val || STATUS_MAP[rec.status_barang]?.label || 'Belum Mulai'
        const s = PRODUCTION_STATUS_MAP[statusText] ?? { badge: 'default', color: '#8c8c8c' }
        return <Badge status={s.badge} text={<Text strong style={{ color: s.color }}>{statusText}</Text>} />
      },
    },
  ]
  const visibleColumns = filterColumnsByPermission('spk', columns, user)

  const totalPages = Math.max(Math.ceil((pagination.total || 0) / SLIDE_SIZE), 1)

  return (
    <Card
      className="monitoring-spk-page"
      title={
        <span>
          <ToolOutlined style={{ marginRight: 8, color: '#1a73e8' }} />
          Monitoring SPK
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
            prefix={<SearchOutlined />}
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
        </Space>
      }
    >
      <Table
        className="monitoring-spk-table"
        rowKey={(rec, idx) => `${rec.no_spk}-${rec.no_barang}-${idx}`}
        columns={withTableSorters(visibleColumns)}
        dataSource={data}
        loading={loading}
        size="small"
        bordered
        tableLayout="fixed"
        scroll={{ x: 1800 }}
        rowClassName={(rec) => (
          `monitoring-spk-row monitoring-spk-row-${rowToneBySpk.get(rec.no_spk) || 1} monitoring-spk-row-scan`
        )}
        onRow={(_, idx = 0) => ({
          style: {
            '--monitoring-spk-row-delay': `${idx * ROW_HIGHLIGHT_INTERVAL_MS}ms`,
          },
        })}
        pagination={{
          ...pagination,
          pageSize: SLIDE_SIZE,
          showSizeChanger: false,
          showQuickJumper: true,
          showTotal: (total, range) => (
            `${range[0]}-${range[1]} dari ~${total} baris | Slide ${pagination.current}/${totalPages}`
          ),
          onChange: (page) => fetchData(page, SLIDE_SIZE, search, dateRange, status),
        }}
      />
    </Card>
  )
}
