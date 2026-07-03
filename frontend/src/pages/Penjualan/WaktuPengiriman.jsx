import { useCallback, useEffect, useState } from 'react'
import {
  Button, Card, Col, DatePicker, Input, Row, Select, Space,
  Statistic, Table, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  ReloadOutlined, SearchOutlined, SendOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { withTableSorters } from '../../utils/tableSorters'
import { useAuth } from '../../context/AuthContext'
import { filterColumnsByPermission } from '../../utils/columnPermissions'
import DeliveryViewSwitcher from './DeliveryViewSwitcher'

const { RangePicker } = DatePicker
const { Search } = Input
const { Text } = Typography

const DOCUMENT_TYPES = [
  'Delivery Order',
  'Good Receipt',
  'Sample Request',
  'TDO',
  'Surat Jalan Lainnya',
]

function EditableText({ record, field, placeholder, multiline = false, onSaved }) {
  const [value, setValue] = useState(record[field] || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => setValue(record[field] || ''), [field, record])

  const save = async () => {
    const normalized = value.trim()
    if (normalized === (record[field] || '').trim()) return
    setSaving(true)
    try {
      const res = await api.post('/api/waktu-pengiriman/manual', {
        ...record,
        [field]: normalized,
      })
      onSaved(record.arinvoice_id, res.data.data)
    } catch (error) {
      setValue(record[field] || '')
      message.error(error.response?.data?.message || 'Gagal menyimpan data.')
    } finally {
      setSaving(false)
    }
  }

  const commonProps = {
    value,
    maxLength: 1000,
    placeholder,
    status: saving ? 'warning' : undefined,
    onChange: event => setValue(event.target.value),
    onBlur: save,
  }
  return multiline
    ? <Input.TextArea {...commonProps} autoSize={{ minRows: 1, maxRows: 3 }} />
    : <Input {...commonProps} />
}

function WaktuDatePicker({ record, field, onSaved }) {
  const [saving, setSaving] = useState(false)
  const save = async value => {
    const normalized = value ? value.format('YYYY-MM-DD') : ''
    if (normalized === (record[field] || '')) return
    setSaving(true)
    try {
      const res = await api.post('/api/waktu-pengiriman/manual', {
        ...record,
        [field]: normalized,
      })
      onSaved(record.arinvoice_id, res.data.data)
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal menyimpan tanggal.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <DatePicker
      value={record[field] ? dayjs(record[field]) : null}
      format="DD/MM/YYYY"
      allowClear
      disabled={saving}
      onChange={save}
      style={{ width: 130 }}
    />
  )
}

export default function WaktuPengiriman() {
  const { user } = useAuth()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState([null, null])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })

  const fetchData = useCallback(async (
    page = 1,
    pageSize = 20,
    searchValue = '',
    dates = [null, null],
    showLoading = true,
  ) => {
    if (showLoading) setLoading(true)
    try {
      const params = { offset: (page - 1) * pageSize, limit: pageSize }
      if (searchValue) params.search = searchValue
      if (dates?.[0]) params.date_from = dates[0].format('YYYY-MM-DD')
      if (dates?.[1]) params.date_to = dates[1].format('YYYY-MM-DD')
      const res = await api.get('/api/waktu-pengiriman', { params })
      setData(res.data.data || [])
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: res.data.total || 0,
      }))
    } catch (error) {
      console.error(error)
      message.error('Gagal memuat Waktu Pengiriman.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSaved = useCallback((arinvoiceId, saved) => {
    setData(rows => rows.map(row => (
      row.arinvoice_id === arinvoiceId ? { ...row, ...saved } : row
    )))
    message.success('Data tersimpan.')
  }, [])

  const handleSearch = value => {
    setSearch(value)
    fetchData(1, pagination.pageSize, value, dateRange)
  }
  const handleDate = value => {
    const next = value || [null, null]
    setDateRange(next)
    fetchData(1, pagination.pageSize, search, next)
  }
  const handleReset = () => {
    setSearch('')
    setDateRange([null, null])
    fetchData(1, 20, '', [null, null])
  }

  const columns = [
    {
      title: 'No. Pengiriman',
      dataIndex: 'no_pengiriman',
      key: 'no_pengiriman',
      width: 165,
      fixed: 'left',
      render: value => <Text strong style={{ color: '#1677ff' }}>{value || '-'}</Text>,
    },
    {
      title: 'Tgl Pengiriman',
      dataIndex: 'tgl_pengiriman',
      key: 'tgl_pengiriman',
      width: 125,
      render: value => value ? <Tag color="blue">{dayjs(value).format('DD/MM/YYYY')}</Tag> : '-',
    },
    {
      title: 'No. SO',
      dataIndex: 'no_so',
      key: 'no_so',
      width: 170,
      ellipsis: { showTitle: false },
      render: value => value ? (
        <Tooltip title={value}>
          <Tag color="cyan" className="waktu-pengiriman-value-tag">{value}</Tag>
        </Tooltip>
      ) : '-',
    },
    {
      title: 'No. PO',
      dataIndex: 'no_po',
      key: 'no_po',
      width: 210,
      ellipsis: { showTitle: false },
      render: value => value ? (
        <Tooltip title={value}>
          <Tag color="purple" className="waktu-pengiriman-value-tag">{value}</Tag>
        </Tooltip>
      ) : '-',
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      key: 'customer',
      width: 240,
      ellipsis: { showTitle: false },
      render: value => (
        <Tooltip title={value}>
          <span className="waktu-pengiriman-ellipsis">{value || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Jenis Dokumen',
      dataIndex: 'jenis_dokumen',
      key: 'jenis_dokumen',
      width: 180,
      render: (_, record) => (
        <Select
          value={record.jenis_dokumen || undefined}
          allowClear
          placeholder="Pilih dokumen"
          style={{ width: '100%' }}
          options={DOCUMENT_TYPES.map(value => ({ value, label: value }))}
          onChange={async value => {
            try {
              const res = await api.post('/api/waktu-pengiriman/manual', {
                ...record,
                jenis_dokumen: value || '',
              })
              handleSaved(record.arinvoice_id, res.data.data)
            } catch (error) {
              message.error(error.response?.data?.message || 'Gagal menyimpan jenis dokumen.')
            }
          }}
        />
      ),
    },
    {
      title: 'Remaks DO',
      dataIndex: 'remarks_do',
      key: 'remarks_do',
      width: 220,
      render: (_, record) => (
        <EditableText record={record} field="remarks_do" placeholder="Input remaks DO" multiline onSaved={handleSaved} />
      ),
    },
    {
      title: 'Expedition',
      dataIndex: 'expedition',
      key: 'expedition',
      width: 180,
      render: (_, record) => (
        <EditableText record={record} field="expedition" placeholder="Input expedition" onSaved={handleSaved} />
      ),
    },
    {
      title: 'Ket Pengiriman',
      dataIndex: 'ket_pengiriman',
      key: 'ket_pengiriman',
      width: 220,
      render: (_, record) => (
        <EditableText record={record} field="ket_pengiriman" placeholder="Input keterangan" multiline onSaved={handleSaved} />
      ),
    },
    {
      title: 'Resi',
      dataIndex: 'resi',
      key: 'resi',
      width: 180,
      render: (_, record) => (
        <EditableText record={record} field="resi" placeholder="Input nomor resi" onSaved={handleSaved} />
      ),
    },
    {
      title: 'ETD',
      dataIndex: 'etd',
      key: 'etd',
      width: 150,
      render: (_, record) => <WaktuDatePicker record={record} field="etd" onSaved={handleSaved} />,
    },
    {
      title: 'ETA Cust',
      dataIndex: 'eta_cust',
      key: 'eta_cust',
      width: 150,
      render: (_, record) => <WaktuDatePicker record={record} field="eta_cust" onSaved={handleSaved} />,
    },
    {
      title: 'Receive Date',
      dataIndex: 'receive_date',
      key: 'receive_date',
      width: 150,
      render: (_, record) => <WaktuDatePicker record={record} field="receive_date" onSaved={handleSaved} />,
    },
    {
      title: 'Status Pengiriman',
      dataIndex: 'status_pengiriman',
      key: 'status_pengiriman',
      width: 165,
      render: value => {
        if (!value) return '-'
        return <Tag color={value.startsWith('Ontime') ? 'green' : 'red'}>{value}</Tag>
      },
    },
    {
      title: 'Target DO Kembali',
      dataIndex: 'target_do_kembali',
      key: 'target_do_kembali',
      width: 170,
      render: (_, record) => <WaktuDatePicker record={record} field="target_do_kembali" onSaved={handleSaved} />,
    },
    {
      title: 'DO Kembali',
      dataIndex: 'do_kembali',
      key: 'do_kembali',
      width: 150,
      render: (_, record) => <WaktuDatePicker record={record} field="do_kembali" onSaved={handleSaved} />,
    },
    {
      title: 'Status DO Kembali',
      dataIndex: 'status_do_kembali',
      key: 'status_do_kembali',
      width: 170,
      render: value => {
        if (!value) return '-'
        return <Tag color={value.startsWith('Ontime') ? 'green' : 'red'}>{value}</Tag>
      },
    },
    {
      title: 'Isue Pengiriman',
      dataIndex: 'isue_pengiriman',
      key: 'isue_pengiriman',
      width: 240,
      fixed: 'right',
      render: (_, record) => (
        <EditableText record={record} field="isue_pengiriman" placeholder="Input isue pengiriman" multiline onSaved={handleSaved} />
      ),
    },
  ]

  const serialColumn = {
    title: 'No',
    key: 'no',
    width: 65,
    fixed: 'left',
    align: 'center',
    render: (_, __, index) => ((pagination.current - 1) * pagination.pageSize) + index + 1,
  }
  const visibleColumns = [
    serialColumn,
    ...filterColumnsByPermission('waktu_pengiriman', columns, user),
  ]

  return (
    <div>
      <div className="delivery-view-switcher-bar">
        <DeliveryViewSwitcher active="delivery" />
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8} lg={6}>
          <Card size="small">
            <Statistic
              title="Total Transaksi Pengiriman"
              value={pagination.total}
              prefix={<SendOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="Waktu Pengiriman"
        extra={(
          <Space wrap>
            <RangePicker
              value={dateRange}
              format="DD/MM/YYYY"
              onChange={handleDate}
              placeholder={['Tgl Pengiriman Dari', 'Sampai']}
              style={{ width: 255 }}
            />
            <Search
              value={search}
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Cari DO, SO, PO, customer..."
              style={{ width: 280 }}
              onSearch={handleSearch}
              onChange={event => {
                setSearch(event.target.value)
                if (!event.target.value) handleSearch('')
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset</Button>
          </Space>
        )}
      >
        <Table
          className="waktu-pengiriman-table"
          rowKey="arinvoice_id"
          columns={withTableSorters(visibleColumns)}
          dataSource={data}
          loading={loading}
          size="small"
          sticky={{ offsetHeader: 0 }}
          tableLayout="fixed"
          scroll={{ x: 3405, y: 'calc(100vh - 345px)' }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: total => `${total} transaksi`,
            onChange: (page, pageSize) => fetchData(page, pageSize, search, dateRange),
          }}
        />
      </Card>
    </div>
  )
}
