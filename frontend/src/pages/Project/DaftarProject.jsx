import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Col, Input, Row, Segmented, Space, Table, Tag, Typography, message } from 'antd'
import { ClockCircleOutlined, ExclamationCircleOutlined, FileExcelOutlined, ProjectOutlined, ReloadOutlined, SearchOutlined, StopOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'
import { withTableSorters } from '../../utils/tableSorters'
import { useNavigate } from 'react-router-dom'

const { Search } = Input
const { Text, Title } = Typography

const BASE_EXPORT_COLUMNS = [
  { key: 'no', label: 'No', type: 'number' },
  { key: 'no_project', label: 'No. Proyek' },
  { key: 'deskripsi', label: 'Deskripsi Proyek' },
  { key: 'tanggal_mulai', label: 'Tgl Mulai', type: 'date' },
  { key: 'tanggal_selesai', label: 'Tgl Selesai', type: 'date' },
  { key: 'komplit', label: 'Progress %', type: 'number' },
  { key: 'status', label: 'Status' },
  { key: 'rab', label: 'RAB', type: 'number' },
  { key: 'realisasi', label: 'Realisasi', type: 'number' },
]
const MKT_EXPORT_COLUMNS = [
  ...BASE_EXPORT_COLUMNS,
  { key: 'profit_rab', label: 'Profit RAB %', type: 'number' },
  { key: 'profit_realisasi', label: 'Profit Realisasi %', type: 'number' },
  { key: 'selisih', label: 'Selisih', type: 'number' },
]
const GA_EXPORT_COLUMNS = [
  ...BASE_EXPORT_COLUMNS,
  { key: 'profit_realisasi', label: '%', type: 'number' },
  { key: 'selisih', label: 'Selisih', type: 'number' },
]

const renderDate = value => value ? <Tag color="blue">{dayjs(value).format('DD/MM/YYYY')}</Tag> : '-'
const formatNumber = value => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })
const formatPercent = value => `${Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`
const progressOptions = Array.from({ length: 11 }, (_, index) => {
  const value = String(index * 10)
  return { value, label: `${value}%` }
})
const statusLabels = {
  all: 'Semua',
  active: 'Aktif',
  suspended: 'Suspended',
}
const getSummary = rows => rows.reduce((acc, row) => ({
  rab: acc.rab + Number(row.rab || 0),
  realisasi: acc.realisasi + Number(row.realisasi || 0),
  selisih: acc.selisih + Number(row.selisih || 0),
}), { rab: 0, realisasi: 0, selisih: 0 })

export default function DaftarProject() {
  const navigate = useNavigate()
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [projectType, setProjectType] = useState('mkt')
  const [projectStatus, setProjectStatus] = useState('all')
  const [progress, setProgress] = useState('')
  const [dashboardSummary, setDashboardSummary] = useState({
    total_project: 0,
    unfinished_project: 0,
    overdue_unfinished_project: 0,
    suspended_completed_project: 0,
  })
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50 })

  const fetchData = useCallback(async (page = pagination.current, pageSize = pagination.pageSize) => {
    setLoading(true)
    try {
      const res = await api.get('/api/project', {
        params: {
          search,
          status: projectStatus,
          project_type: projectType,
          progress,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        },
      })
      setData(res.data.data || [])
      setTotal(res.data.total || 0)
      setDashboardSummary(res.data.summary || {
        total_project: 0,
        unfinished_project: 0,
        overdue_unfinished_project: 0,
        suspended_completed_project: 0,
      })
      setPagination(prev => ({ ...prev, current: page, pageSize }))
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat daftar project')
    } finally {
      setLoading(false)
    }
  }, [pagination.current, pagination.pageSize, search, projectType, projectStatus, progress])

  useEffect(() => {
    fetchData(1, pagination.pageSize)
  }, [fetchData, pagination.pageSize])

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/api/project/export', { params: { search, status: projectStatus, project_type: projectType, progress } })
      const rows = (res.data.data || []).map((row, index) => ({ ...row, no: index + 1 }))
      exportRowsToXLS(rows, projectType === 'ga' ? GA_EXPORT_COLUMNS : MKT_EXPORT_COLUMNS, `DaftarProject-${dayjs().format('YYYYMMDD-HHmm')}`, 'Daftar Project')
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal export daftar project')
    } finally {
      setExporting(false)
    }
  }

  const baseColumns = [
    {
      title: 'No',
      width: 64,
      fixed: 'left',
      render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: 'No. Proyek',
      dataIndex: 'no_project',
      width: 170,
      fixed: 'left',
      render: value => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', fontWeight: 700 }}
          onClick={() => navigate(`/project/laporan?project=${encodeURIComponent(value || '')}&type=${projectType}`)}
        >
          {value || '-'}
        </Button>
      ),
    },
    { title: 'Deskripsi Proyek', dataIndex: 'deskripsi', width: 420, ellipsis: true },
    { title: 'Tgl Mulai', dataIndex: 'tanggal_mulai', width: 130, render: renderDate },
    { title: 'Tgl Selesai', dataIndex: 'tanggal_selesai', width: 130, render: renderDate },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (_, record) => (
        <Tag color={record.dihentikan ? 'red' : 'green'}>
          {record.dihentikan ? 'Suspended' : 'Aktif'}
        </Tag>
      ),
    },
    {
      title: 'Progress %',
      dataIndex: 'komplit',
      width: 120,
      align: 'right',
      render: value => <Tag color={Number(value || 0) >= 100 ? 'green' : 'gold'}>{formatPercent(value)}</Tag>,
    },
    { title: 'RAB', dataIndex: 'rab', width: 150, align: 'right', render: formatNumber },
    {
      title: 'Realisasi',
      dataIndex: 'realisasi',
      width: 150,
      align: 'right',
      render: (value, record) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto' }}
          onClick={() => navigate(`/project/detail?project=${encodeURIComponent(record.no_project)}&type=${projectType}`)}
        >
          {formatNumber(value)}
        </Button>
      ),
    },
  ]
  const projectMetricColumns = projectType === 'ga' ? [
    {
      title: '%',
      dataIndex: 'profit_realisasi',
      width: 120,
      align: 'right',
      render: value => <Text strong type={Number(value || 0) < 0 ? 'danger' : undefined}>{formatPercent(value)}</Text>,
    },
  ] : [
    { title: 'Profit RAB %', dataIndex: 'profit_rab', width: 150, align: 'right', render: value => <Text strong>{formatPercent(value)}</Text> },
    {
      title: 'Profit Realisasi %',
      dataIndex: 'profit_realisasi',
      width: 170,
      align: 'right',
      render: value => <Text strong type={Number(value || 0) < 0 ? 'danger' : undefined}>{formatPercent(value)}</Text>,
    },
  ]
  const columns = withTableSorters([
    ...baseColumns,
    ...projectMetricColumns,
    { title: 'Selisih', dataIndex: 'selisih', width: 150, align: 'right', render: value => <Text type={Number(value || 0) < 0 ? 'danger' : undefined}>{formatNumber(value)}</Text> },
  ])
  const summary = getSummary(data)
  const summaryCards = [
    {
      title: 'Total Project',
      value: dashboardSummary.total_project,
      icon: <ProjectOutlined />,
      tone: 'cyan',
      note: `${statusLabels[projectStatus]} ${projectType.toUpperCase()}`,
    },
    {
      title: 'Belum Selesai',
      value: dashboardSummary.unfinished_project,
      icon: <ClockCircleOutlined />,
      tone: 'gold',
      note: 'Progress < 100%',
    },
    {
      title: 'Lewat Tgl Selesai',
      value: dashboardSummary.overdue_unfinished_project,
      icon: <ExclamationCircleOutlined />,
      tone: 'red',
      note: 'Belum 100%',
    },
    {
      title: 'Suspend 100%',
      value: dashboardSummary.suspended_completed_project || 0,
      icon: <StopOutlined />,
      tone: 'purple',
      note: 'Tidak aktif, progress 100%',
      suffix: 'project',
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {summaryCards.map(card => (
          <Col xs={24} sm={12} lg={6} key={card.title}>
            <div className={`project-summary-tile project-summary-${card.tone}`}>
              <div className="project-summary-icon">{card.icon}</div>
              <Text type="secondary">{card.title}</Text>
              <div className="project-summary-value">
                <Title level={3} style={{ margin: 0 }}>{formatNumber(card.value)}</Title>
                {card.suffix && <Text type="secondary">{card.suffix}</Text>}
              </div>
              <Text className="project-summary-note">{card.note}</Text>
            </div>
          </Col>
        ))}
      </Row>
      <Card
        className="project-list-card"
        title={<Space><ProjectOutlined /> Daftar Project</Space>}
        extra={(
          <Space wrap align="start">
            <Search
              allowClear
              placeholder="Cari no proyek, deskripsi"
              prefix={<SearchOutlined />}
              style={{ width: 280 }}
              value={search}
              onChange={event => setSearch(event.target.value)}
              onSearch={() => fetchData(1, pagination.pageSize)}
            />
            <div className="project-progress-filter">
              <div className="project-progress-grid">
                <button
                  type="button"
                  className={`project-progress-pill ${progress === '' ? 'is-active' : ''}`}
                  onClick={() => {
                    setProgress('')
                    setPagination(prev => ({ ...prev, current: 1 }))
                  }}
                >
                  Semua
                </button>
                {progressOptions.map(option => (
                  <button
                    type="button"
                    key={option.value}
                    title={option.value === '100' ? 'Progress 100% atau lebih' : `Progress ${option.value}-${Number(option.value) + 9}%`}
                    className={`project-progress-pill ${progress === option.value ? 'is-active' : ''}`}
                    onClick={() => {
                      setProgress(option.value)
                      setPagination(prev => ({ ...prev, current: 1 }))
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <Segmented
              value={projectType}
              onChange={value => {
                setProjectType(value)
                setPagination(prev => ({ ...prev, current: 1 }))
              }}
              options={[
                { value: 'mkt', label: 'MKT' },
                { value: 'ga', label: 'GA' },
              ]}
            />
            <Segmented
              value={projectStatus}
              onChange={value => {
                setProjectStatus(value)
                setPagination(prev => ({ ...prev, current: 1 }))
              }}
              options={[
                { value: 'all', label: 'Semua' },
                { value: 'active', label: 'Aktif' },
                { value: 'suspended', label: 'Suspended' },
              ]}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setSearch('')
                setProgress('')
                setProjectStatus('all')
                setPagination(prev => ({ ...prev, current: 1 }))
              }}
            >
              Reset
            </Button>
            <Button type="primary" icon={<FileExcelOutlined />} loading={exporting} onClick={handleExport}>Export XLS</Button>
          </Space>
        )}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Table
            className="project-freeze-table"
            rowKey="project_id"
            loading={loading}
            columns={columns}
            dataSource={data}
            size="small"
            scroll={{ x: 1830, y: 'calc(100vh - 390px)' }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={7}>
                    <Text strong>Grand Total</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right"><Text strong>{formatNumber(summary.rab)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right"><Text strong>{formatNumber(summary.realisasi)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={9} align="right"><Text strong>-</Text></Table.Summary.Cell>
                  {projectType !== 'ga' && <Table.Summary.Cell index={10} align="right"><Text strong>-</Text></Table.Summary.Cell>}
                  <Table.Summary.Cell index={projectType === 'ga' ? 10 : 11} align="right"><Text strong>{formatNumber(summary.selisih)}</Text></Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: [20, 50, 100, 200],
              showTotal: (value, range) => `${range[0]}-${range[1]} dari ${value} project`,
            }}
            onChange={next => fetchData(next.current, next.pageSize)}
          />
        </Space>
      </Card>
      <style>{`
        .project-summary-tile {
          min-height: 104px;
          border: 1px solid #eef2f7;
          border-radius: 8px;
          padding: 14px 16px;
          position: relative;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
        }
        .project-summary-tile::after {
          content: "";
          position: absolute;
          right: 16px;
          top: 18px;
          width: 36px;
          height: 36px;
          clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
          opacity: 0.16;
        }
        .project-summary-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 6px;
          margin-bottom: 8px;
        }
        .project-summary-note {
          display: block;
          max-width: calc(100% - 44px);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .project-summary-value {
          display: flex;
          align-items: baseline;
          gap: 6px;
          margin: 4px 0 2px;
        }
        .project-summary-cyan {
          background: linear-gradient(110deg, #f8fdff, #eefcff);
        }
        .project-summary-cyan::after {
          background: #06b6d4;
        }
        .project-summary-cyan .project-summary-icon {
          background: rgba(6, 182, 212, 0.12);
          color: #0891b2;
        }
        .project-summary-gold::after {
          background: #f59e0b;
        }
        .project-summary-gold .project-summary-icon {
          background: rgba(245, 158, 11, 0.13);
          color: #b45309;
        }
        .project-summary-red::after {
          background: #ef4444;
        }
        .project-summary-red .project-summary-icon {
          background: rgba(239, 68, 68, 0.12);
          color: #dc2626;
        }
        .project-summary-purple::after {
          background: #8b5cf6;
        }
        .project-summary-purple .project-summary-icon {
          background: rgba(139, 92, 246, 0.12);
          color: #7c3aed;
        }
        .project-summary-gold {
          background: linear-gradient(110deg, #fffdf5, #fff7df);
        }
        .project-summary-red {
          background: linear-gradient(110deg, #fff8f8, #fff1f2);
        }
        .project-summary-purple {
          background: linear-gradient(110deg, #fbfaff, #f7f0ff);
        }
        .project-progress-filter {
          min-width: 270px;
        }
        .project-progress-grid {
          display: grid;
          grid-template-columns: repeat(6, 42px);
          gap: 4px;
        }
        .project-progress-pill {
          height: 24px;
          border: 1px solid #eef2f7;
          border-radius: 6px;
          background: #f8fafc;
          color: #64748b;
          font-size: 12px;
          line-height: 1;
          cursor: pointer;
          transition: border-color .15s ease, color .15s ease, background .15s ease, box-shadow .15s ease;
        }
        .project-progress-pill:hover,
        .project-progress-pill.is-active {
          border-color: transparent;
          background: linear-gradient(135deg, #ff2d8f, #8b5cf6) !important;
          color: #ffffff !important;
          box-shadow: 0 5px 12px rgba(236, 72, 153, 0.22);
        }
        .project-freeze-table .ant-table-container {
          border-radius: 8px;
        }
        .project-freeze-table .ant-table-header {
          border-radius: 8px 8px 0 0;
        }
        .project-freeze-table .ant-table-body {
          min-height: 220px;
        }
      `}</style>
    </div>
  )
}
