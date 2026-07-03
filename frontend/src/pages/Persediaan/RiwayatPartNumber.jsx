import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge, Button, Card, Col, Drawer, Empty, Input, List, Pagination, Row, Space,
  Statistic, Table, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  ApartmentOutlined, ArrowLeftOutlined, HistoryOutlined, ReloadOutlined,
  SearchOutlined, ShopOutlined, ShoppingCartOutlined, TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api, { getApiErrorMessage } from '../../api/client'
import { withTableSorters } from '../../utils/tableSorters'

const { Search } = Input
const { Text, Title } = Typography
const categoryAccents = ['#6b8afd', '#52b788', '#a78bfa', '#f59e6b', '#38a3a5', '#e879a9']

function SummaryCard({ title, value, icon, color, note }) {
  return (
    <Card
      size="small"
      styles={{ body: { padding: '14px 16px' } }}
      style={{
        height: '100%',
        borderColor: `${color}33`,
        background: `linear-gradient(135deg, ${color}14 0%, #ffffff 72%)`,
      }}
    >
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
        <Statistic title={title} value={value || 0} valueStyle={{ color, fontSize: 24 }} />
        <span style={{ color, fontSize: 22, opacity: 0.8 }}>{icon}</span>
      </Space>
      {note && <Text type="secondary" style={{ fontSize: 11 }}>{note}</Text>}
    </Card>
  )
}

function EditablePartNumber({ value, placeholder, onSave }) {
  const [text, setText] = useState(value || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => setText(value || ''), [value])

  const save = async () => {
    const normalized = text.trim()
    if (normalized === (value || '').trim()) return
    setSaving(true)
    try {
      await onSave(normalized)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Input
      value={text}
      maxLength={150}
      placeholder={placeholder}
      status={saving ? 'warning' : undefined}
      onChange={event => setText(event.target.value)}
      onBlur={save}
      onPressEnter={event => event.currentTarget.blur()}
    />
  )
}

export default function RiwayatPartNumber() {
  const [categories, setCategories] = useState([])
  const [categorySummary, setCategorySummary] = useState({})
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [rows, setRows] = useState([])
  const [detailSummary, setDetailSummary] = useState({})
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [vendorItem, setVendorItem] = useState(null)
  const [vendors, setVendors] = useState([])
  const [vendorLoading, setVendorLoading] = useState(false)

  const fetchCategories = useCallback(async (query = '') => {
    setCategoryLoading(true)
    try {
      const res = await api.get('/api/part-number-history/categories', {
        params: { search: query },
      })
      setCategories(res.data.data || [])
      setCategorySummary(res.data.summary || {})
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat kategori produk'))
    } finally {
      setCategoryLoading(false)
    }
  }, [])

  const fetchRows = useCallback(async (
    category,
    page = 1,
    pageSize = 20,
    query = '',
  ) => {
    if (!category) return
    setLoading(true)
    try {
      const res = await api.get('/api/part-number-history', {
        params: {
          category,
          search: query,
          grouped: true,
          offset: (page - 1) * pageSize,
          limit: pageSize,
        },
      })
      setRows(res.data.data || [])
      setDetailSummary(res.data.summary || {})
      setPagination({ current: page, pageSize, total: res.data.total || 0 })
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat riwayat part number'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const chooseCategory = category => {
    setSelectedCategory(category)
    setSearch('')
    fetchRows(category, 1, pagination.pageSize, '')
  }

  const savePartNumber = useCallback(async (kind, itemNo, partyNo, partNumber) => {
    try {
      await api.post('/api/part-number-history/part-number', {
        kind,
        item_no: itemNo,
        party_no: partyNo,
        part_number: partNumber,
      })
      message.success('Part number disimpan.')
      if (kind === 'customer') {
        await fetchRows(
          selectedCategory,
          pagination.current,
          pagination.pageSize,
          search,
        )
      } else if (vendorItem) {
        const res = await api.get('/api/part-number-history/vendors', {
          params: { item_no: vendorItem.item_no },
        })
        setVendors(res.data.data || [])
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal menyimpan part number'))
      throw error
    }
  }, [fetchRows, pagination.current, pagination.pageSize, search, selectedCategory, vendorItem])

  const openVendors = async record => {
    setVendorItem(record)
    setVendorLoading(true)
    try {
      const res = await api.get('/api/part-number-history/vendors', {
        params: { item_no: record.item_no },
      })
      setVendors(res.data.data || [])
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat riwayat vendor'))
    } finally {
      setVendorLoading(false)
    }
  }

  const customerColumns = useMemo(() => [
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      width: 240,
      render: (value, record) => (
        <Space direction="vertical" size={0}>
          <Text>{value}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{record.customer_no}</Text>
        </Space>
      ),
    },
    {
      title: 'PN Customer',
      dataIndex: 'customer_part_number',
      width: 210,
      render: (value, record) => (
        <EditablePartNumber
          value={value}
          placeholder="Input PN Customer"
          onSave={partNumber => savePartNumber(
            'customer', record.item_no, record.customer_no, partNumber,
          )}
        />
      ),
    },
    {
      title: 'Repeat Order',
      dataIndex: 'order_count',
      width: 105,
      align: 'center',
      render: value => <Badge count={value} showZero color={value > 1 ? '#1677ff' : '#8c8c8c'} />,
    },
    {
      title: 'Order Terakhir',
      dataIndex: 'last_order_date',
      width: 125,
      render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Riwayat SO',
      dataIndex: 'so_numbers',
      width: 220,
      ellipsis: { showTitle: false },
      render: value => <Tooltip title={value}><span>{value || '-'}</span></Tooltip>,
    },
  ], [savePartNumber])

  const groupedRows = useMemo(() => {
    const groups = new Map()
    rows.forEach(row => {
      if (!groups.has(row.item_no)) {
        groups.set(row.item_no, {
          item_no: row.item_no,
          category: row.category,
          description: row.description,
          customers: [],
        })
      }
      groups.get(row.item_no).customers.push(row)
    })
    return Array.from(groups.values())
  }, [rows])

  const vendorColumns = [
    {
      title: 'Vendor',
      dataIndex: 'vendor_name',
      width: 230,
      render: (value, record) => (
        <Space direction="vertical" size={0}>
          <Text>{value}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{record.vendor_no}</Text>
        </Space>
      ),
    },
    {
      title: 'PN Vendor',
      dataIndex: 'vendor_part_number',
      width: 210,
      render: (value, record) => (
        <EditablePartNumber
          value={value}
          placeholder="Input PN Vendor"
          onSave={partNumber => savePartNumber(
            'vendor', record.item_no, record.vendor_no, partNumber,
          )}
        />
      ),
    },
    { title: 'Jumlah PO', dataIndex: 'purchase_count', width: 90, align: 'center' },
    {
      title: 'Terakhir Dibeli',
      dataIndex: 'last_purchase_date',
      width: 120,
      render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-',
    },
  ]

  return (
    <div>
      {!selectedCategory ? (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard title="Category Produk" value={categorySummary.category_count} color="#5271ff" icon={<TagsOutlined />} />
            </Col>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard title="Barang Pernah Diorder" value={categorySummary.item_count} color="#168aad" icon={<ApartmentOutlined />} />
            </Col>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard title="Customer" value={categorySummary.customer_count} color="#6f42c1" icon={<TeamOutlined />} />
            </Col>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard title="Sales Order" value={categorySummary.order_count} color="#e67e22" icon={<ShoppingCartOutlined />} />
            </Col>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard title="Belum Ada Category" value={categorySummary.uncategorized_item_count} color="#d46b08" icon={<TagsOutlined />} />
            </Col>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard
                title="Order Terakhir"
                value={categorySummary.last_order_date ? dayjs(categorySummary.last_order_date).format('DD/MM/YYYY') : '-'}
                color="#2f855a"
                icon={<HistoryOutlined />}
              />
            </Col>
          </Row>
          <Card
            title={<Space><TagsOutlined style={{ color: '#1677ff' }} />Riwayat Part Number</Space>}
            extra={(
              <Space>
                <Search
                  allowClear
                  value={categorySearch}
                  prefix={<SearchOutlined />}
                  placeholder="Cari kategori, barang, customer..."
                  style={{ width: 280 }}
                  onChange={event => setCategorySearch(event.target.value)}
                  onSearch={fetchCategories}
                />
                <Button icon={<ReloadOutlined />} onClick={() => {
                  setCategorySearch('')
                  fetchCategories('')
                }}>
                  Reset
                </Button>
              </Space>
            )}
          >
          <List
            loading={categoryLoading}
            grid={{ gutter: 12, xs: 1, sm: 2, md: 3, lg: 4, xl: 5, xxl: 6 }}
            dataSource={categories}
            locale={{ emptyText: 'Belum ada riwayat barang yang pernah dipesan customer.' }}
            renderItem={(item, index) => {
              const accent = item.category === 'Belum Ada Category'
                ? '#a0aec0'
                : categoryAccents[index % categoryAccents.length]
              const activity = Math.min(
                100,
                Math.round(item.order_count / Math.max(item.item_count, 1) * 35),
              )
              return (
              <List.Item>
                <Card
                  hoverable
                  size="small"
                  className="part-number-category-card"
                  onClick={() => chooseCategory(item.category)}
                  style={{
                    '--category-accent': accent,
                    borderColor: `${accent}45`,
                    background: `linear-gradient(145deg, ${accent}12 0%, #ffffff 65%)`,
                  }}
                >
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Title level={5} ellipsis={{ tooltip: item.category }} style={{ margin: 0 }}>
                      {item.category}
                    </Title>
                    <TagsOutlined style={{ color: accent, fontSize: 18 }} />
                  </Space>
                  <Row gutter={8} style={{ marginTop: 12 }}>
                    <Col span={8}><Text type="secondary">Barang</Text><br /><Text strong>{item.item_count}</Text></Col>
                    <Col span={8}><Text type="secondary">Customer</Text><br /><Text strong>{item.customer_count}</Text></Col>
                    <Col span={8}><Text type="secondary">SO</Text><br /><Text strong>{item.order_count}</Text></Col>
                  </Row>
                  <div className="part-number-activity-track">
                    <div style={{ width: `${activity}%`, background: accent }} />
                  </div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Order terakhir: {item.last_order_date ? dayjs(item.last_order_date).format('DD/MM/YYYY') : '-'}
                  </Text>
                </Card>
              </List.Item>
              )
            }}
          />
          </Card>
        </>
      ) : (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard title="Barang" value={detailSummary.item_count} color="#168aad" icon={<ApartmentOutlined />} />
            </Col>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard title="Customer" value={detailSummary.customer_count} color="#6f42c1" icon={<TeamOutlined />} />
            </Col>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard title="Sales Order" value={detailSummary.order_count} color="#e67e22" icon={<ShoppingCartOutlined />} />
            </Col>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard title="Relasi Barang-Customer" value={detailSummary.relation_count} color="#5271ff" icon={<TagsOutlined />} />
            </Col>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard title="Repeat Order" value={detailSummary.repeat_relation_count} color="#2f855a" icon={<HistoryOutlined />} />
            </Col>
            <Col xs={12} md={8} xl={4}>
              <SummaryCard
                title="PN Customer Terisi"
                value={detailSummary.customer_pn_count}
                color="#c24173"
                icon={<TagsOutlined />}
                note={`Dari ${detailSummary.relation_count || 0} relasi`}
              />
            </Col>
          </Row>
          <Card
          title={(
            <Space>
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setSelectedCategory('')} />
              <HistoryOutlined style={{ color: '#1677ff' }} />
              <span>Riwayat Part Number</span>
              <Tag color={selectedCategory === 'Belum Ada Category' ? 'default' : 'blue'}>
                {selectedCategory}
              </Tag>
            </Space>
          )}
          extra={(
            <Space>
              <Search
                allowClear
                value={search}
                prefix={<SearchOutlined />}
                placeholder="Cari barang, customer, SO..."
                style={{ width: 260 }}
                onChange={event => setSearch(event.target.value)}
                onSearch={value => fetchRows(selectedCategory, 1, pagination.pageSize, value)}
              />
              <Button icon={<ReloadOutlined />} onClick={() => {
                setSearch('')
                fetchRows(selectedCategory, 1, pagination.pageSize, '')
              }}>
                Reset
              </Button>
            </Space>
          )}
        >
          <List
            loading={loading}
            dataSource={groupedRows}
            locale={{ emptyText: 'Tidak ada riwayat barang dan customer.' }}
            renderItem={item => (
              <List.Item className="part-number-item-list-row">
                <Card
                  size="small"
                  className="part-number-item-card"
                  title={(
                    <Space wrap>
                      <Text code strong className="part-number-item-code">{item.item_no}</Text>
                      <Tag color={item.category === 'Belum Ada Category' ? 'default' : 'blue'}>
                        {item.category}
                      </Tag>
                      <Badge count={`${item.customers.length} customer`} color="#1677ff" />
                    </Space>
                  )}
                  extra={(
                    <Button size="small" icon={<ShopOutlined />} onClick={() => openVendors(item)}>
                      Lihat Vendor
                    </Button>
                  )}
                >
                  <Text type="secondary" className="part-number-item-description">
                    {item.description || '-'}
                  </Text>
                  <Table
                    rowKey={record => `${record.item_no}:${record.customer_no}`}
                    size="small"
                    bordered
                    dataSource={item.customers}
                    columns={withTableSorters(customerColumns)}
                    pagination={false}
                    scroll={{ x: 900 }}
                    style={{ marginTop: 12 }}
                  />
                </Card>
              </List.Item>
            )}
          />
          {pagination.total > 0 && (
            <Pagination
              {...pagination}
              showSizeChanger
              pageSizeOptions={[10, 20, 50, 100]}
              showTotal={total => `${total} barang`}
              onChange={(page, pageSize) => fetchRows(selectedCategory, page, pageSize, search)}
              style={{ marginTop: 16, textAlign: 'right' }}
            />
          )}
          </Card>
        </>
      )}

      <Drawer
        width={760}
        open={Boolean(vendorItem)}
        onClose={() => {
          setVendorItem(null)
          setVendors([])
        }}
        title={(
          <Space direction="vertical" size={0}>
            <Text strong>Riwayat Vendor & Part Number</Text>
            <Text type="secondary">{vendorItem?.item_no} • {vendorItem?.description}</Text>
          </Space>
        )}
      >
        {vendors.length === 0 && !vendorLoading ? (
          <Empty description="Barang ini belum memiliki riwayat pembelian dari vendor." />
        ) : (
          <Table
            rowKey={record => `${record.item_no}:${record.vendor_no}`}
            size="small"
            bordered
            loading={vendorLoading}
            dataSource={vendors}
            columns={vendorColumns}
            pagination={false}
            scroll={{ x: 650 }}
          />
        )}
      </Drawer>
    </div>
  )
}
