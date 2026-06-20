import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Form, Input, InputNumber, Modal, Row, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd'
import { EditOutlined, FileSearchOutlined, FileTextOutlined, PrinterOutlined, UnorderedListOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { withTableSorters } from '../../utils/tableSorters'
import { useSearchParams } from 'react-router-dom'

const { Text, Title } = Typography

const formatRp = value => {
  const number = Number(value || 0)
  const formatted = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.abs(number))
  if (number < 0) return `(${formatted})`
  return formatted === '0' ? '-' : formatted
}

const formatDateLong = value => value ? dayjs(value).format('D-MMM-YYYY') : '-'
const formatPct = value => `${Number(value || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
const manualAccounts = new Set([
  '4.00.00.001',
  '4.00.00.003',
  '5.00.00.001',
  '6.00.00.003-CF',
  '6.00.00.003-MF',
])
const revenueAccount = '4.00.00.001'
const hppAccount = '5.00.00.001'
const isNegativeProfitLoss = row => row?.is_total && row?.nama_akun === 'Profit & Loss' && Number(row?.realisasi || 0) < 0
const getOverdueDays = value => {
  if (!value) return null
  const diff = dayjs().startOf('day').diff(dayjs(value).startOf('day'), 'day')
  return diff > 0 ? diff : null
}

function HeaderField({ label, value }) {
  return (
    <div className="project-report-field">
      <Text strong className="project-report-label">{label}</Text>
      <Text className="project-report-value">{value || '-'}</Text>
    </div>
  )
}

export default function LaporanProject() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialProject = searchParams.get('project') || ''
  const initialType = searchParams.get('type') || 'mkt'
  const [options, setOptions] = useState([])
  const [projectNo, setProjectNo] = useState(initialProject)
  const [projectType, setProjectType] = useState(initialType)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [loadingReport, setLoadingReport] = useState(false)
  const [savingManual, setSavingManual] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [manualModalOpen, setManualModalOpen] = useState(false)
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [hppModalOpen, setHppModalOpen] = useState(false)
  const [manualRecord, setManualRecord] = useState(null)
  const [hppLoading, setHppLoading] = useState(false)
  const [hppItems, setHppItems] = useState([])
  const [hppTotal, setHppTotal] = useState(0)
  const [hppSummary, setHppSummary] = useState({})
  const [revenueModalOpen, setRevenueModalOpen] = useState(false)
  const [revenueLoading, setRevenueLoading] = useState(false)
  const [revenueItems, setRevenueItems] = useState([])
  const [revenueTotal, setRevenueTotal] = useState(0)
  const [revenueSummary, setRevenueSummary] = useState({})
  const [transactionModalOpen, setTransactionModalOpen] = useState(false)
  const [transactionLoading, setTransactionLoading] = useState(false)
  const [transactionRecord, setTransactionRecord] = useState(null)
  const [transactionRows, setTransactionRows] = useState([])
  const [transactionTotal, setTransactionTotal] = useState(0)
  const [transactionSummary, setTransactionSummary] = useState({})
  const [header, setHeader] = useState({})
  const [rows, setRows] = useState([])
  const [manualForm] = Form.useForm()
  const [noteForm] = Form.useForm()

  const fetchOptions = useCallback(async (search = '') => {
    setLoadingOptions(true)
    try {
      const res = await api.get('/api/project/options', {
        params: { search, status: 'active', project_type: projectType },
      })
      setOptions(res.data.data || [])
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat pilihan project')
    } finally {
      setLoadingOptions(false)
    }
  }, [projectType])

  const fetchReport = useCallback(async (nextProjectNo, nextProjectType = projectType) => {
    if (!nextProjectNo) return
    setLoadingReport(true)
    try {
      const res = await api.get('/api/project/report', { params: { project_no: nextProjectNo, project_type: nextProjectType } })
      setHeader(res.data.header || {})
      setRows(res.data.data || [])
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat laporan project')
      setHeader({})
      setRows([])
    } finally {
      setLoadingReport(false)
    }
  }, [projectType])

  useEffect(() => {
    fetchOptions()
  }, [fetchOptions])

  useEffect(() => {
    if (!initialProject) return
    setProjectNo(initialProject)
    setProjectType(initialType)
    fetchReport(initialProject, initialType)
  }, [initialProject, initialType, fetchReport])

  const handleProjectTypeChange = value => {
    setSearchParams({})
    setProjectType(value)
    setProjectNo('')
    setHeader({})
    setRows([])
  }

  const handleProjectChange = value => {
    setSearchParams({})
    setProjectNo(value)
    fetchReport(value, projectType)
  }

  const handlePrint = () => {
    window.print()
  }

  const openManualModal = record => {
    setManualRecord(record)
    manualForm.setFieldsValue({
      amount: Number(record.realisasi || 0),
      note: record.manual_note || '',
    })
    setManualModalOpen(true)
  }

  const handleSaveManual = async () => {
    try {
      const values = await manualForm.validateFields()
      setSavingManual(true)
      await api.post('/api/project/manual-realization', {
        project_no: header.no_project,
        account_no: manualRecord.manual_account_key || manualRecord.no_akun,
        amount: values.amount || 0,
        note: values.note || '',
      })
      message.success('Realisasi manual disimpan')
      setManualModalOpen(false)
      setManualRecord(null)
      fetchReport(header.no_project)
    } catch (error) {
      if (error?.errorFields) return
      message.error(error.response?.data?.message || 'Gagal menyimpan realisasi manual')
    } finally {
      setSavingManual(false)
    }
  }

  const openNoteModal = () => {
    noteForm.setFieldsValue({ note: header.report_note || '' })
    setNoteModalOpen(true)
  }

  const openHppItemsModal = async () => {
    if (!header.no_project) return
    setHppModalOpen(true)
    setHppLoading(true)
    setHppItems([])
    setHppTotal(0)
    setHppSummary({})
    try {
      const res = await api.get('/api/project/report/hpp-items', {
        params: { project_no: header.no_project, limit: 500 },
      })
      setHppItems(res.data.data || [])
      setHppTotal(Number(res.data.total || 0))
      setHppSummary(res.data.summary || {})
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat barang HPP')
      setHppItems([])
      setHppTotal(0)
      setHppSummary({})
    } finally {
      setHppLoading(false)
    }
  }

  const openRevenueItemsModal = async () => {
    if (!header.no_project) return
    setRevenueModalOpen(true)
    setRevenueLoading(true)
    setRevenueItems([])
    setRevenueTotal(0)
    setRevenueSummary({})
    try {
      const res = await api.get('/api/project/report/revenue-items', {
        params: { project_no: header.no_project, limit: 500 },
      })
      setRevenueItems(res.data.data || [])
      setRevenueTotal(Number(res.data.total || 0))
      setRevenueSummary(res.data.summary || {})
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat detail pendapatan')
      setRevenueItems([])
      setRevenueTotal(0)
      setRevenueSummary({})
    } finally {
      setRevenueLoading(false)
    }
  }

  const openTransactionModal = async record => {
    if (!header.no_project || !record?.no_akun) return
    setTransactionRecord(record)
    setTransactionModalOpen(true)
    setTransactionLoading(true)
    setTransactionRows([])
    setTransactionTotal(0)
    setTransactionSummary({})
    try {
      const res = await api.get('/api/project/detail', {
        params: {
          project_no: header.no_project,
          project_type: header.project_type || projectType,
          account_no: record.no_akun,
          limit: 500,
        },
      })
      setTransactionRows(res.data.data || [])
      setTransactionTotal(Number(res.data.total || 0))
      setTransactionSummary(res.data.summary || {})
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat detail transaksi')
      setTransactionRows([])
      setTransactionTotal(0)
      setTransactionSummary({})
    } finally {
      setTransactionLoading(false)
    }
  }

  const handleSaveNote = async () => {
    try {
      const values = await noteForm.validateFields()
      setSavingNote(true)
      const res = await api.post('/api/project/report-note', {
        project_no: header.no_project,
        note: values.note || '',
      })
      const saved = res.data.data || {}
      setHeader(current => ({
        ...current,
        report_note: saved.note || '',
        report_note_updated_by: saved.updated_by || '',
        report_note_updated_at: saved.updated_at || '',
      }))
      message.success('Catatan laporan disimpan')
      setNoteModalOpen(false)
    } catch (error) {
      if (error?.errorFields) return
      message.error(error.response?.data?.message || 'Gagal menyimpan catatan laporan')
    } finally {
      setSavingNote(false)
    }
  }

  const columns = withTableSorters([
    { title: 'No. Akun', dataIndex: 'no_akun', width: 150 },
    {
      title: 'Nama Akun',
      dataIndex: 'nama_akun',
      width: 320,
      render: (value, record) => {
        const hasTransactionValue = Number(record.realisasi || 0) > 0 && !record.is_manual
        const canOpenRevenueItems = header.project_type === 'mkt' && record.no_akun === revenueAccount && !record.is_total && !record.is_percentage && hasTransactionValue
        const canOpenHppItems = header.project_type === 'mkt' && record.no_akun === hppAccount && !record.is_total && !record.is_percentage
        const canOpenTransactions = !record.is_total && !record.is_percentage && (hasTransactionValue || canOpenHppItems)
        if (!canOpenTransactions) return value
        return (
          <Button
            type="link"
            className="project-report-account-link"
            icon={canOpenRevenueItems || canOpenHppItems ? <UnorderedListOutlined /> : <FileSearchOutlined />}
            onClick={canOpenRevenueItems ? openRevenueItemsModal : canOpenHppItems ? openHppItemsModal : () => openTransactionModal(record)}
          >
            {value}
          </Button>
        )
      },
    },
    {
      title: 'RAB',
      dataIndex: 'rab',
      width: 160,
      align: 'right',
      render: (value, record) => {
        if (record.is_percentage) return record.show_rab_percentage === false ? '-' : formatPct(value)
        return <span style={{ color: isNegativeProfitLoss(record) ? '#d41452' : undefined }}>{formatRp(value)}</span>
      },
    },
    {
      title: 'Realisasi',
      dataIndex: 'realisasi',
      width: 160,
      align: 'right',
      render: (value, record) => {
        if (record.is_percentage) return record.show_realisasi_percentage ? formatPct(value) : '-'
        const canInputManual = manualAccounts.has(record.manual_account_key || record.no_akun) && !record.has_easy_realization
        return (
          <Space size={6} style={{ justifyContent: 'flex-end', width: '100%' }}>
            <span style={{ color: isNegativeProfitLoss(record) ? '#d41452' : undefined }}>{formatRp(value)}</span>
            {record.is_manual && <Tag color="magenta" style={{ marginInlineEnd: 0 }}>Manual</Tag>}
            {canInputManual && (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => openManualModal(record)}
              />
            )}
          </Space>
        )
      },
    },
  ])

  const hppColumns = withTableSorters([
    { title: 'Jenis', dataIndex: 'jenis', width: 105, render: value => <Tag color={value === 'Add Cost' ? 'volcano' : 'blue'}>{value || 'Barang'}</Tag> },
    { title: 'Tanggal', dataIndex: 'tanggal', width: 100, render: formatDateLong },
    { title: 'No. AI', dataIndex: 'no_penerimaan', width: 140 },
    { title: 'No. PO', dataIndex: 'no_pesanan', width: 140 },
    { title: 'NO SO', dataIndex: 'referensi_ai_pp', width: 140, render: value => value || '-' },
    { title: 'No. Barang', dataIndex: 'no_barang', width: 150 },
    { title: 'Nama Barang', dataIndex: 'nama_barang', width: 260 },
    {
      title: 'Qty',
      dataIndex: 'qty',
      width: 100,
      align: 'right',
      render: value => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 }),
    },
    { title: 'Unit', dataIndex: 'unit', width: 90 },
    { title: 'Pemasok', dataIndex: 'nama_pemasok', width: 220 },
    { title: 'Nilai', dataIndex: 'nilai', width: 130, align: 'right', render: formatRp },
  ])

  const revenueColumns = withTableSorters([
    { title: 'Tanggal', dataIndex: 'tanggal', width: 100, render: formatDateLong },
    { title: 'No. Invoice', dataIndex: 'no_invoice', width: 150 },
    { title: 'No. SO', dataIndex: 'no_so', width: 140, render: value => value || '-' },
    { title: 'PO Customer', dataIndex: 'po_customer', width: 150, render: value => value || '-' },
    { title: 'No. Barang', dataIndex: 'no_barang', width: 150 },
    { title: 'Nama Barang', dataIndex: 'nama_barang', width: 260 },
    {
      title: 'Qty',
      dataIndex: 'qty',
      width: 100,
      align: 'right',
      render: value => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 }),
    },
    { title: 'Unit', dataIndex: 'unit', width: 90 },
    { title: 'Customer', dataIndex: 'nama_customer', width: 220 },
    { title: 'Nilai', dataIndex: 'nilai', width: 130, align: 'right', render: formatRp },
  ])

  const transactionColumns = withTableSorters([
    { title: 'Tanggal', dataIndex: 'tanggal', width: 105, render: formatDateLong },
    { title: 'Sumber', dataIndex: 'sumber', width: 90, render: value => value || '-' },
    { title: 'Tipe', dataIndex: 'tipe_transaksi', width: 90, render: value => value || '-' },
    { title: 'No Dokumen', dataIndex: 'no_dokumen', width: 150, render: value => value || '-' },
    { title: 'Deskripsi', dataIndex: 'deskripsi', width: 420, render: value => value || '-' },
    { title: 'Nilai', dataIndex: 'nilai', width: 130, align: 'right', render: formatRp },
  ])

  const hasReport = Boolean(header.no_project)
  const overdueDays = getOverdueDays(header.tgl_selesai)

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={<Space><FileTextOutlined /> Laporan Project</Space>}
        extra={(
          <Space wrap>
            <Segmented
              value={projectType}
              onChange={handleProjectTypeChange}
              options={[
                { label: 'MKT', value: 'mkt' },
                { label: 'GA', value: 'ga' },
              ]}
            />
            <Select
              showSearch
              allowClear
              value={projectNo || undefined}
              placeholder={`Pilih project ${projectType.toUpperCase()}`}
              style={{ width: 360 }}
              loading={loadingOptions}
              filterOption={false}
              onSearch={fetchOptions}
              onChange={handleProjectChange}
              options={options.map(item => ({
                value: item.no_project,
                label: `${item.no_project} - ${item.nama_project}`,
              }))}
            />
            <Button icon={<PrinterOutlined />} disabled={!hasReport} onClick={handlePrint}>
              Print PDF
            </Button>
          </Space>
        )}
      >
        {!hasReport ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Pilih project untuk menampilkan laporan" />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div className="project-report-paper">
              <img className="project-report-logo" src="/aqpa-indonesia-logo.png" alt="AQPA Indonesia" />
              <Title level={5} italic style={{ margin: 0 }}>LAPORAN LABA RUGI PER PROJECT</Title>
              <Row className="project-report-meta" gutter={[24, 8]} style={{ marginTop: 18 }}>
                <Col xs={24} md={12}><HeaderField label="NO PROJECT" value={header.no_project} /></Col>
                <Col xs={24} md={12}><HeaderField label="Tgl Mulai" value={formatDateLong(header.tgl_mulai)} /></Col>
                <Col xs={24} md={12}><HeaderField label="NAMA PROJECT" value={header.nama_project} /></Col>
                <Col xs={24} md={12}><HeaderField label="Tgl Selesai" value={formatDateLong(header.tgl_selesai)} /></Col>
                <Col xs={24} md={12}><HeaderField label="NAMA CUSTOMER" value={header.nama_customer} /></Col>
                <Col xs={24} md={12}><HeaderField label="Durasi Pekerjaan" value={`${header.durasi_pekerjaan || 0} Hari`} /></Col>
                <Col xs={24} md={12}><HeaderField label="NAMA MARKETING" value={header.nama_marketing} /></Col>
                <Col xs={24} md={12}><HeaderField label="STATUS" value={formatPct(header.status_progress)} /></Col>
              </Row>
              {overdueDays && (
                <Alert
                  showIcon
                  type="error"
                  style={{ marginTop: 12 }}
                  message={`Tgl selesai sudah lewat ${overdueDays} hari dari tanggal berjalan.`}
                />
              )}
              {header.dihentikan && <Tag color="red" style={{ marginTop: 12 }}>Suspended</Tag>}
            </div>
            <Table
              className="project-report-table"
              rowKey={(record, index) => `${record.no_akun || record.nama_akun}-${index}`}
              loading={loadingReport}
              columns={columns}
              dataSource={rows}
              size="small"
              pagination={false}
              scroll={{ x: 820 }}
              rowClassName={record => record.is_total || record.is_percentage ? 'project-report-total-row' : ''}
            />
            <table className="project-report-print-table">
              <thead>
                <tr>
                  <th>No. Akun</th>
                  <th>Nama Akun</th>
                  <th>RAB</th>
                  <th>Realisasi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={`${row.no_akun || row.nama_akun}-${index}`}
                    className={row.is_total || row.is_percentage ? 'project-report-total-row' : ''}
                  >
                    <td>{row.no_akun}</td>
                    <td>{row.nama_akun}</td>
                    <td className="project-report-print-number" style={{ color: isNegativeProfitLoss(row) ? '#d41452' : undefined }}>
                      {row.is_percentage
                        ? (row.show_rab_percentage === false ? '-' : formatPct(row.rab))
                        : formatRp(row.rab)}
                    </td>
                    <td className="project-report-print-number" style={{ color: isNegativeProfitLoss(row) ? '#d41452' : undefined }}>
                      {row.is_percentage
                        ? (row.show_realisasi_percentage ? formatPct(row.realisasi) : '-')
                        : `${formatRp(row.realisasi)}${row.is_manual ? ' (Manual)' : ''}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={`project-report-note ${header.report_note ? '' : 'project-report-note-empty'}`}>
              <div className="project-report-note-head">
                <Text strong>Catatan</Text>
                <Button className="project-report-note-action" size="small" icon={<EditOutlined />} onClick={openNoteModal}>
                  Edit
                </Button>
              </div>
              {header.report_note ? (
                <Text className="project-report-note-text">{header.report_note}</Text>
              ) : (
                <Text type="secondary" className="project-report-note-placeholder">Belum ada catatan.</Text>
              )}
              {header.report_note_updated_at && (
                <Text type="secondary" className="project-report-note-meta">
                  Terakhir diubah {header.report_note_updated_by || '-'} pada {dayjs(header.report_note_updated_at).format('DD/MM/YYYY HH:mm')}
                </Text>
              )}
            </div>
            <div className="project-report-approval">
              <div className="project-report-approval-box">
                <Text strong className="project-report-approval-title">Mgr Project</Text>
                <div className="project-report-signature-space" />
                <div className="project-report-signature-line" />
                <Text strong className="project-report-approval-name">{header.nama_marketing || '-'}</Text>
              </div>
              <div className="project-report-approval-box">
                <Text strong className="project-report-approval-title">Spv Mkt</Text>
                <div className="project-report-signature-space" />
                <div className="project-report-signature-line" />
                <Text strong className="project-report-approval-name">ARIF ISKANDAR</Text>
              </div>
              <div className="project-report-approval-box">
                <Text strong className="project-report-approval-title">Mgr FAT</Text>
                <div className="project-report-signature-space" />
                <div className="project-report-signature-line" />
                <Text strong className="project-report-approval-name">DHOYO ARIS SUSANTO</Text>
              </div>
            </div>
          </Space>
        )}
      </Card>
      <Modal
        title={`Realisasi Manual - ${manualRecord?.nama_akun || manualRecord?.no_akun || ''}`}
        open={manualModalOpen}
        onOk={handleSaveManual}
        okText="Simpan"
        confirmLoading={savingManual}
        onCancel={() => {
          setManualModalOpen(false)
          setManualRecord(null)
        }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            showIcon
            type="info"
            message={manualRecord?.manual_account_key
              ? 'Nilai ini hanya disimpan di dashboard dan tidak mengubah transaksi Easy Accounting.'
              : 'Nilai manual hanya dipakai selama faktur pengiriman barang/invoice Easy Accounting belum ada.'}
          />
          <Form form={manualForm} layout="vertical">
            <Form.Item label="Nilai Realisasi Manual" name="amount" rules={[{ required: true, message: 'Nilai wajib diisi' }]}>
              <InputNumber
                min={0}
                style={{ width: '100%' }}
                formatter={value => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={value => value?.replace(/Rp\s?|\./g, '')}
              />
            </Form.Item>
            <Form.Item label="Catatan" name="note">
              <Input.TextArea rows={3} placeholder="Contoh: Project selesai, invoice menunggu dokumen customer" />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
      <Modal
        title={`Catatan Laporan - ${header.no_project || ''}`}
        open={noteModalOpen}
        onOk={handleSaveNote}
        okText="Simpan"
        confirmLoading={savingNote}
        onCancel={() => setNoteModalOpen(false)}
      >
        <Form form={noteForm} layout="vertical">
          <Form.Item label="Catatan" name="note">
            <Input.TextArea rows={6} placeholder="Isi catatan laporan project" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`Detail HPP Pembelian - ${header.no_project || ''}`}
        open={hppModalOpen}
        onCancel={() => setHppModalOpen(false)}
        footer={null}
        width={1120}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            showIcon
            type="info"
            message={`Total ${hppTotal.toLocaleString('id-ID')} baris barang. Qty ${Number(hppSummary.qty || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}, nilai ${formatRp(hppSummary.nilai)}.`}
          />
          <Table
            rowKey={(record, index) => `${record.no_penerimaan}-${record.no_barang}-${index}`}
            loading={hppLoading}
            columns={hppColumns}
            dataSource={hppItems}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: 1575, y: 430 }}
          />
        </Space>
      </Modal>
      <Modal
        title={`Detail Pendapatan Usaha - ${header.no_project || ''}`}
        open={revenueModalOpen}
        onCancel={() => setRevenueModalOpen(false)}
        footer={null}
        width={1120}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            showIcon
            type="info"
            message={`Total ${revenueTotal.toLocaleString('id-ID')} baris invoice. Qty ${Number(revenueSummary.qty || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}, nilai ${formatRp(revenueSummary.nilai)}.`}
          />
          <Table
            rowKey={(record, index) => `${record.no_invoice}-${record.no_barang}-${index}`}
            loading={revenueLoading}
            columns={revenueColumns}
            dataSource={revenueItems}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: 1490, y: 430 }}
          />
        </Space>
      </Modal>
      <Modal
        title={`Detail Transaksi - ${transactionRecord?.nama_akun || ''}`}
        open={transactionModalOpen}
        onCancel={() => setTransactionModalOpen(false)}
        footer={null}
        width={1040}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            showIcon
            type="info"
            message={`Total ${transactionTotal.toLocaleString('id-ID')} transaksi, nilai ${formatRp(transactionSummary.nilai)}.`}
          />
          <Table
            rowKey={(record, index) => `${record.tanggal}-${record.no_dokumen}-${record.nilai}-${index}`}
            loading={transactionLoading}
            columns={transactionColumns}
            dataSource={transactionRows}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: 990, y: 430 }}
          />
        </Space>
      </Modal>
      <style>{`
        .project-report-paper {
          border: 1px solid #e8d7f2;
          border-top: 4px solid #8e24aa;
          border-radius: 6px;
          padding: 18px;
          background: #fff;
        }
        .project-report-logo {
          display: block;
          width: min(310px, 90%);
          height: auto;
          margin-bottom: 10px;
        }
        .project-report-field {
          display: grid;
          grid-template-columns: 150px 1fr;
          gap: 10px;
          align-items: start;
        }
        .project-report-label::after {
          content: " :";
          float: right;
        }
        .project-report-value {
          white-space: normal;
        }
        .project-report-total-row td {
          font-weight: 700;
          background: #f4ecfa !important;
        }
        .project-report-table .ant-table-thead > tr > th {
          background: #8e24aa !important;
          color: #ffffff !important;
          font-weight: 700;
        }
        .project-report-table .ant-table-thead > tr > th::before {
          display: none;
        }
        .project-report-table .ant-table-tbody > tr > td {
          background: #ded4e8;
          border-color: #ffffff;
        }
        .project-report-table .ant-table-tbody > tr:nth-child(even) > td {
          background: #cfc3dc;
        }
        .project-report-account-link {
          height: auto;
          padding: 0;
          color: #0f4c81;
          font-size: 12px;
        }
        .project-report-account-link:hover {
          color: #8e24aa;
        }
        .project-report-print-table {
          display: none;
        }
        .project-report-note {
          border: 1px solid #e8d7f2;
          border-radius: 6px;
          padding: 12px 14px;
          background: #ffffff;
        }
        .project-report-note-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 8px;
        }
        .project-report-note-text {
          display: block;
          white-space: pre-wrap;
          line-height: 1.55;
        }
        .project-report-note-placeholder {
          display: block;
        }
        .project-report-note-meta {
          display: block;
          margin-top: 8px;
          font-size: 11px;
        }
        .project-report-approval {
          display: none;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
          margin-top: 22px;
        }
        .project-report-approval-box {
          min-height: 112px;
          border: 1px solid #e8d7f2;
          border-radius: 6px;
          padding: 12px;
          text-align: center;
          background: #fff;
        }
        .project-report-approval-title {
          display: block;
        }
        .project-report-signature-space {
          height: 58px;
        }
        .project-report-signature-line {
          border-top: 1px solid #20243a;
          width: 78%;
          margin: 0 auto 8px;
        }
        .project-report-approval-name {
          display: block;
        }
        @media (max-width: 720px) {
          .project-report-field {
            grid-template-columns: 1fr;
            gap: 2px;
          }
          .project-report-label::after {
            content: "";
            float: none;
          }
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 9mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            background: #fff !important;
          }
          .easy-sider,
          .easy-header,
          .ant-card-head,
          .ant-empty {
            display: none !important;
          }
          .easy-content {
            margin: 0 !important;
            padding: 0 !important;
            width: auto !important;
          }
          .ant-card,
          .ant-card-body {
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .project-report-paper {
            border-left: 0;
            border-right: 0;
            border-bottom: 0;
            border-radius: 0;
            padding: 6px 0 8px;
            margin-bottom: 8px;
          }
          .project-report-logo {
            width: 210px;
            margin-bottom: 6px;
          }
          .project-report-paper .ant-typography {
            font-size: 9px !important;
            line-height: 1.25 !important;
          }
          .project-report-meta {
            display: flex !important;
            flex-wrap: wrap !important;
          }
          .project-report-meta .ant-col {
            flex: 0 0 50% !important;
            max-width: 50% !important;
          }
          .project-report-field {
            grid-template-columns: 92px 1fr !important;
            gap: 6px !important;
          }
          .project-report-label::after {
            content: " :" !important;
            float: right !important;
          }
          .project-report-table {
            display: none !important;
          }
          .project-report-print-table {
            display: table;
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            font-size: 8px;
          }
          .project-report-print-table th,
          .project-report-print-table td {
            padding: 3px 4px;
            border: 1px solid #ffffff;
            overflow-wrap: anywhere;
          }
          .project-report-print-table th {
            background: #8e24aa !important;
            color: #ffffff !important;
            font-weight: 700;
          }
          .project-report-print-table td {
            background: #ded4e8 !important;
          }
          .project-report-print-table tbody tr:nth-child(even) td {
            background: #cfc3dc !important;
          }
          .project-report-print-table th:nth-child(1),
          .project-report-print-table td:nth-child(1) {
            width: 18%;
          }
          .project-report-print-table th:nth-child(3),
          .project-report-print-table td:nth-child(3),
          .project-report-print-table th:nth-child(4),
          .project-report-print-table td:nth-child(4) {
            width: 19%;
          }
          .project-report-print-number {
            text-align: right;
          }
          .project-report-note {
            margin-top: 8px;
            padding: 8px 10px;
            border: 1px solid #d9c3e8;
            border-radius: 4px;
            background: #ffffff !important;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .project-report-note-empty {
            display: none !important;
          }
          .project-report-note-action,
          .project-report-note-meta {
            display: none !important;
          }
          .project-report-note-head {
            margin-bottom: 4px;
          }
          .project-report-note-head .ant-typography {
            font-size: 9px !important;
            color: #4a235f !important;
            text-transform: uppercase;
          }
          .project-report-note-text {
            font-size: 8px !important;
            line-height: 1.35 !important;
            color: #111827 !important;
          }
          .ant-alert {
            padding: 4px 6px !important;
            font-size: 8px !important;
            margin-top: 6px !important;
          }
          .project-report-approval {
            display: grid;
            gap: 10px;
            margin-top: 14px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .project-report-approval-box {
            min-height: 118px;
            padding: 10px 10px 12px;
            border: 1px solid #d9c3e8;
            border-top: 3px solid #8e24aa;
            border-radius: 4px;
            background: #ffffff !important;
          }
          .project-report-approval-title {
            font-size: 9px !important;
            color: #4a235f !important;
            text-transform: uppercase;
            letter-spacing: 0;
          }
          .project-report-signature-space {
            height: 58px;
          }
          .project-report-signature-line {
            width: 82%;
            margin: 0 auto 9px;
            border-top: 1px solid #20243a;
          }
          .project-report-approval-name {
            font-size: 9px !important;
            color: #111827 !important;
          }
        }
      `}</style>
    </div>
  )
}
