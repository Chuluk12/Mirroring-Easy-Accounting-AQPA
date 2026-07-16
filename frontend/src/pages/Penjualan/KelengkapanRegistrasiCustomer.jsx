import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Button, Card, Checkbox, Col, Drawer, Empty, Input, Popconfirm,
  Progress, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  CheckCircleOutlined, DeleteOutlined, FileProtectOutlined, PlusOutlined,
  PrinterOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api, { getApiErrorMessage } from '../../api/client'
import { withTableSorters } from '../../utils/tableSorters'

const { Search } = Input
const { Text } = Typography

const DEFAULT_DOCUMENTS = [
  { key: 'npwp', label: 'NPWP', department: 'MKT' },
  { key: 'alamat_ho', label: 'Alamat HO', department: 'MKT' },
  { key: 'alamat_kirim', label: 'Alamat Kirim', department: 'MKT' },
  { key: 'alamat_pajak', label: 'Alamat Pajak', department: 'MKT' },
  { key: 'pic_po', label: 'PIC PO', department: 'MKT' },
  { key: 'pic_invoicing', label: 'PIC Invoicing', department: 'MKT' },
  { key: 'top', label: 'TOP', department: 'MKT' },
]
const DEFAULT_DOCUMENT_KEYS = new Set(DEFAULT_DOCUMENTS.map(document => document.key))

function normalizeDocumentTypes(documentTypes) {
  const types = Array.isArray(documentTypes) && documentTypes.length ? documentTypes : DEFAULT_DOCUMENTS
  return types.filter(document => DEFAULT_DOCUMENT_KEYS.has(document.key))
}

const departmentColor = {
  LOG: 'blue',
  QC: 'purple',
  MKT: 'green',
  ACC: 'gold',
}

const statusMeta = {
  complete: { label: 'Lengkap', color: 'success' },
  incomplete: { label: 'Belum Lengkap', color: 'warning' },
  unconfigured: { label: 'Belum Diatur', color: 'default' },
}

function DocumentHeader({ document }) {
  return (
    <Space direction="vertical" size={1} align="center">
      <Tag color={departmentColor[document.department]} style={{ marginInlineEnd: 0 }}>
        {document.department}
      </Tag>
      <Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{document.label}</Text>
    </Space>
  )
}
function PrintCheckbox({ checked }) {
  return <span className={`sales-document-print-checkbox${checked ? ' is-checked' : ''}`} aria-hidden="true" />
}

function CustomerRegistrationPrintSheet({ record, documentTypes }) {
  if (!record) return null

  const documents = [
    ...documentTypes.map(document => record.documents?.[document.key] || document),
    ...(record.custom_documents || []),
  ]

  return createPortal(
    <section className="sales-document-print-sheet">
      <header className="sales-document-print-title">
        <h1>CHECKLIST DOKUMEN REGISTRASI CUSTOMER</h1>
        <span>Form Kontrol Registrasi Customer</span>
      </header>

      <div className="sales-document-print-info">
        <h2>Informasi Customer</h2>
        <div className="sales-document-print-info-grid">
          <div>
            <span>No Cust</span>
            <strong>:&nbsp;&nbsp; {record.no_pelanggan || '-'}</strong>
          </div>
          <div>
            <span>Sales</span>
            <strong>:&nbsp;&nbsp; {record.nama_salesman || '-'}</strong>
          </div>
          <div>
            <span>Customer</span>
            <strong>:&nbsp;&nbsp; {record.nama_pelanggan || '-'}</strong>
          </div>
          <div>
            <span>Kota</span>
            <strong>:&nbsp;&nbsp; {record.kota || '-'}</strong>
          </div>
          <div>
            <span>Kontak</span>
            <strong>:&nbsp;&nbsp; {record.kontak || '-'}</strong>
          </div>
          <div>
            <span>Telepon</span>
            <strong>:&nbsp;&nbsp; {record.telepon || '-'}</strong>
          </div>
        </div>
      </div>

      <div className="sales-document-print-checklist">
        <div className="sales-document-print-checklist-heading">
          <span>Centang kolom Wajib dan Validasi sesuai kelengkapan dokumen</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Nama Dokumen</th>
              <th>PIC</th>
              <th>Wajib</th>
              <th>Validasi</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document, index) => (
              <tr key={document.key}>
                <td>{index + 1}</td>
                <td>{document.label}</td>
                <td>
                  <span className={`sales-document-print-pic pic-${String(document.department || '').toLowerCase()}`}>
                    {document.department}
                  </span>
                </td>
                <td><PrintCheckbox checked={Boolean(document.required)} /></td>
                <td><PrintCheckbox checked={Boolean(document.completed)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>,
    document.body,
  )
}

export default function KelengkapanRegistrasiCustomer() {
  const [data, setData] = useState([])
  const [documentTypes, setDocumentTypes] = useState(DEFAULT_DOCUMENTS)
  const [summary, setSummary] = useState({ total: 0, complete: 0, incomplete: 0, unconfigured: 0 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState({})
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [customerStatus, setCustomerStatus] = useState('active')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [drawerCustomer, setDrawerCustomer] = useState('')
  const [newDocumentName, setNewDocumentName] = useState('')
  const [newDepartment, setNewDepartment] = useState('MKT')
  const [addingDocument, setAddingDocument] = useState(false)
  const [printRecord, setPrintRecord] = useState(null)
  const filtersRef = useRef({ search: '', status: '', customerStatus: 'active' })
  const activeRecord = data.find(row => row.customer_no === drawerCustomer)

  const fetchData = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true)
    try {
      const filters = filtersRef.current
      const res = await api.get('/api/customer-registration-document-completeness', {
        params: {
          search: filters.search,
          status: filters.status,
          customer_status: filters.customerStatus,
          offset: (page - 1) * pageSize,
          limit: pageSize,
        },
      })
      setData(res.data.data || [])
      setDocumentTypes(normalizeDocumentTypes(res.data.document_types))
      setSummary(res.data.summary || {})
      setPagination({ current: page, pageSize, total: res.data.total || 0 })
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal memuat kelengkapan dokumen'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const applyFilters = useCallback((next = {}) => {
    filtersRef.current = { ...filtersRef.current, ...next }
    fetchData(1, pagination.pageSize)
  }, [fetchData, pagination.pageSize])

  const saveDocument = useCallback(async (record, documentKey, changes) => {
    const current = record.documents?.[documentKey] || {}
    const next = { ...current, ...changes }
    const savingKey = `${record.customer_no}:${documentKey}`
    setSaving(value => ({ ...value, [savingKey]: true }))
    setData(rows => rows.map(row => {
      if (row.customer_no !== record.customer_no) return row
      const documents = {
        ...row.documents,
        [documentKey]: { ...row.documents[documentKey], ...next },
      }
      const required = Object.values(documents).filter(doc => doc.required)
      const completed = required.filter(doc => doc.completed)
      return {
        ...row,
        documents,
        required_count: required.length,
        completed_count: completed.length,
        progress_pct: required.length ? Math.round(completed.length / required.length * 100) : 0,
        status: required.length === 0
          ? 'unconfigured'
          : completed.length === required.length ? 'complete' : 'incomplete',
      }
    }))
    try {
      await api.post('/api/customer-registration-document-completeness/checklist', {
        customer_no: record.customer_no,
        document_key: documentKey,
        required: next.required,
        completed: next.completed,
      })
      await fetchData(pagination.current, pagination.pageSize)
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal menyimpan checklist'))
      await fetchData(pagination.current, pagination.pageSize)
    } finally {
      setSaving(value => ({ ...value, [savingKey]: false }))
    }
  }, [fetchData, pagination.current, pagination.pageSize])

  const addCustomDocument = useCallback(async () => {
    const label = newDocumentName.trim()
    if (!drawerCustomer || !label || !newDepartment) {
      message.warning('Nama dokumen dan departemen sumber wajib diisi.')
      return
    }
    setAddingDocument(true)
    try {
      await api.post('/api/customer-registration-document-completeness/custom-document', {
        customer_no: drawerCustomer,
        label,
        department: newDepartment,
      })
      setNewDocumentName('')
      setNewDepartment('MKT')
      await fetchData(pagination.current, pagination.pageSize)
      message.success('Dokumen tambahan berhasil dibuat.')
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal menambah dokumen'))
    } finally {
      setAddingDocument(false)
    }
  }, [drawerCustomer, fetchData, newDepartment, newDocumentName, pagination.current, pagination.pageSize])

  const deleteCustomDocument = useCallback(async documentKey => {
    try {
      await api.delete('/api/customer-registration-document-completeness/custom-document', {
        data: { customer_no: drawerCustomer, document_key: documentKey },
      })
      await fetchData(pagination.current, pagination.pageSize)
      message.success('Dokumen tambahan dihapus.')
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Gagal menghapus dokumen'))
    }
  }, [drawerCustomer, fetchData, pagination.current, pagination.pageSize])

  const printItem = useCallback(record => {
    setPrintRecord(record)
    window.setTimeout(() => window.print(), 100)
  }, [])

  useEffect(() => {
    const clearPrintRecord = () => setPrintRecord(null)
    window.addEventListener('afterprint', clearPrintRecord)
    return () => window.removeEventListener('afterprint', clearPrintRecord)
  }, [])

  const documentColumns = useCallback((field) => documentTypes.map((document, index) => ({
    title: <DocumentHeader document={document} />,
    key: `${field}-${document.key}`,
    width: document.key === 'faktur_pajak' ? 105 : 82,
    align: 'center',
    className: [
      field === 'required' ? 'document-required-cell' : 'document-validation-cell',
      index === 0 ? 'document-block-start' : '',
      index === documentTypes.length - 1 ? 'document-block-end' : '',
    ].filter(Boolean).join(' '),
    render: (_, record) => {
      const state = record.documents?.[document.key] || {}
      const isStatus = field === 'completed'
      const checkbox = (
        <Checkbox
          checked={Boolean(state[field])}
          disabled={Boolean(saving[`${record.customer_no}:${document.key}`])}
          onChange={event => saveDocument(record, document.key, {
            [field]: event.target.checked,
          })}
        />
      )
      if (!isStatus || !state.completed) return checkbox
      return (
        <Tooltip title={`Divalidasi ${state.validated_by || 'MKT'}${state.validated_at ? ` • ${dayjs(state.validated_at).format('DD/MM/YYYY HH:mm')}` : ''}`}>
          {checkbox}
        </Tooltip>
      )
    },
  })), [documentTypes, saveDocument, saving])

  const columns = useMemo(() => [
    {
      title: 'No.',
      width: 55,
      fixed: 'left',
      align: 'center',
      render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    { title: 'No Customer', dataIndex: 'customer_no', width: 145, fixed: 'left', render: value => <Text strong>{value}</Text> },
    { title: 'Kota', dataIndex: 'kota', width: 130, render: value => value || '-' },
    { title: 'Customer', dataIndex: 'nama_pelanggan', width: 210, ellipsis: true },
    { title: 'Salesman', dataIndex: 'nama_salesman', width: 170, render: value => value || '-' },
    ...(documentTypes.length ? [{
      title: 'Dokumen Wajib (ditentukan MKT)',
      className: 'document-required-group',
      children: documentColumns('required'),
    },
    {
      title: 'Validasi MKT',
      className: 'document-validation-group',
      children: documentColumns('completed'),
    }] : []),
    {
      title: 'Dokumen Tambahan',
      width: 145,
      fixed: 'right',
      render: (_, record) => {
        const documents = record.custom_documents || []
        const completed = documents.filter(document => document.completed).length
        return (
          <Button
            size="small"
            type={documents.length ? 'default' : 'dashed'}
            icon={<PlusOutlined />}
            onClick={() => setDrawerCustomer(record.customer_no)}
          >
            {documents.length ? `${completed}/${documents.length} Selesai` : 'Tambah'}
          </Button>
        )
      },
    },
    {
      title: 'Progress',
      width: 145,
      fixed: 'right',
      render: (_, record) => (
        <Progress
          percent={record.progress_pct}
          size="small"
          status={record.status === 'complete' ? 'success' : 'normal'}
          format={() => `${record.completed_count}/${record.required_count}`}
        />
      ),
    },
    {
      title: 'Status Akhir',
      width: 120,
      fixed: 'right',
      render: (_, record) => {
        const meta = statusMeta[record.status] || statusMeta.unconfigured
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: 'Print',
      width: 90,
      fixed: 'right',
      align: 'center',
      render: (_, record) => (
        <Button
          className="sales-document-print-button"
          size="small"
          type="primary"
          icon={<PrinterOutlined />}
          onClick={() => printItem(record)}
        >
          Print
        </Button>
      ),
    },
  ], [documentColumns, documentTypes.length, pagination.current, pagination.pageSize, printItem])

  const resetFilters = () => {
    setSearch('')
    setStatus('')
    setCustomerStatus('active')
    filtersRef.current = { search: '', status: '', customerStatus: 'active' }
    fetchData(1, pagination.pageSize)
  }

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Total Customer" value={summary.total || 0} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Lengkap" value={summary.complete || 0} valueStyle={{ color: '#389e0d' }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Belum Lengkap" value={summary.incomplete || 0} valueStyle={{ color: '#d46b08' }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Belum Diatur" value={summary.unconfigured || 0} /></Card></Col>
      </Row>

      <Card
        title={<Space><FileProtectOutlined style={{ color: '#1677ff' }} />Kelengkapan Dokumen Registrasi Customer</Space>}
        extra={(
          <Space wrap>
            <Select
              allowClear
              placeholder="Semua Status"
              style={{ width: 150 }}
              value={status || undefined}
              options={[
                { value: 'complete', label: 'Lengkap' },
                { value: 'incomplete', label: 'Belum Lengkap' },
                { value: 'unconfigured', label: 'Belum Diatur' },
              ]}
              onChange={value => {
                const next = value || ''
                setStatus(next)
                applyFilters({ status: next })
              }}
            />
            <Select
              placeholder="Status Customer"
              style={{ width: 150 }}
              value={customerStatus}
              options={[
                { value: 'active', label: 'Aktif' },
                { value: 'inactive', label: 'Nonaktif' },
                { value: 'all', label: 'Semua Customer' },
              ]}
              onChange={value => {
                setCustomerStatus(value)
                applyFilters({ customerStatus: value })
              }}
            />
            <Search
              allowClear
              value={search}
              prefix={<SearchOutlined />}
              placeholder="Cari customer, no customer, kontak..."
              style={{ width: 235 }}
              onChange={event => setSearch(event.target.value)}
              onSearch={value => applyFilters({ search: value })}
            />
            <Button icon={<ReloadOutlined />} onClick={resetFilters}>Reset</Button>
          </Space>
        )}
      >
        <Table
          className="sales-document-table"
          rowKey="customer_no"
          size="small"
          bordered
          sticky
          loading={loading}
          dataSource={data}
          columns={withTableSorters(columns)}
          scroll={{ x: documentTypes.length ? 1780 : 1280, y: 'calc(100vh - 355px)' }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: total => `${total} Customer`,
          }}
          onChange={next => fetchData(next.current, next.pageSize)}
          locale={{ emptyText: 'Tidak ada Customer pada filter ini.' }}
        />
        <Space style={{ marginTop: 12 }}>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <Text type="secondary">
            Dokumen bersifat opsional. Tambahkan dokumen per customer bila diperlukan, lalu tandai wajib hanya jika dokumen tersebut harus masuk progres.
          </Text>
        </Space>
      </Card>

      <Drawer
        title={`Dokumen Tambahan - ${drawerCustomer || '-'}`}
        width={560}
        open={Boolean(drawerCustomer)}
        onClose={() => setDrawerCustomer('')}
      >
        <Card size="small" title="Tambah Dokumen Registrasi Customer" style={{ marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              value={newDepartment}
              style={{ width: 120 }}
              options={[
                { value: 'LOG', label: 'LOG' },
                { value: 'QC', label: 'QC' },
                { value: 'MKT', label: 'MKT' },
                { value: 'ACC', label: 'ACC' },
                { value: 'LAINNYA', label: 'Lainnya' },
              ]}
              onChange={setNewDepartment}
            />
            <Input
              value={newDocumentName}
              maxLength={100}
              placeholder="Nama dokumen tambahan"
              onChange={event => setNewDocumentName(event.target.value)}
              onPressEnter={addCustomDocument}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={addingDocument}
              onClick={addCustomDocument}
            >
              Tambah
            </Button>
          </Space.Compact>
        </Card>

        {(activeRecord?.custom_documents || []).length === 0 ? (
          <Empty description="Belum ada dokumen tambahan untuk customer ini." />
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {(activeRecord?.custom_documents || []).map(document => (
              <Card
                key={document.key}
                size="small"
                title={(
                  <Space>
                    <Tag color={departmentColor[document.department] || 'default'}>
                      {document.department}
                    </Tag>
                    <Text strong>{document.label}</Text>
                  </Space>
                )}
                extra={(
                  <Popconfirm
                    title="Hapus dokumen tambahan?"
                    description="Checklist dan riwayat validasinya ikut dihapus."
                    okText="Hapus"
                    cancelText="Batal"
                    onConfirm={() => deleteCustomDocument(document.key)}
                  >
                    <Button danger type="text" icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              >
                <Row gutter={16} align="middle">
                  <Col span={9}>
                    <Space>
                      <Checkbox
                        checked={document.required}
                        disabled={Boolean(saving[`${activeRecord.customer_no}:${document.key}`])}
                        onChange={event => saveDocument(activeRecord, document.key, {
                          required: event.target.checked,
                        })}
                      />
                      <Text>Dokumen Wajib</Text>
                    </Space>
                  </Col>
                  <Col span={9}>
                    <Space>
                      <Checkbox
                        checked={document.completed}
                        disabled={Boolean(saving[`${activeRecord.customer_no}:${document.key}`])}
                        onChange={event => saveDocument(activeRecord, document.key, {
                          completed: event.target.checked,
                        })}
                      />
                      <Text>Validasi MKT</Text>
                    </Space>
                  </Col>
                  <Col span={6}>
                    <Tag color={document.completed ? 'success' : document.required ? 'warning' : 'default'}>
                      {document.completed ? 'Selesai' : document.required ? 'Belum Lengkap' : 'Opsional'}
                    </Tag>
                  </Col>
                </Row>
                {document.completed && (
                  <Text type="secondary" style={{ display: 'block', marginTop: 10 }}>
                    Divalidasi {document.validated_by || 'MKT'}
                    {document.validated_at ? ` • ${dayjs(document.validated_at).format('DD/MM/YYYY HH:mm')}` : ''}
                  </Text>
                )}
              </Card>
            ))}
          </Space>
        )}
      </Drawer>

      <CustomerRegistrationPrintSheet record={printRecord} documentTypes={documentTypes} />
    </div>
  )
}

