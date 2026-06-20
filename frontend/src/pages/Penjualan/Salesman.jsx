import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, DatePicker, Input, InputNumber, Space, Table, Typography, message } from 'antd'
import { FileExcelOutlined, ReloadOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import { exportRowsToXLS } from '../../utils/exportXls'

const { Search } = Input
const { Text, Title } = Typography

const monthLabels = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const formatRp = value => Number(value || 0).toLocaleString('id-ID')
const parseRp = value => Number(String(value || '').replace(/[^\d]/g, '') || 0)

const buildExportColumns = () => [
  { key: 'no', label: 'No.', type: 'number' },
  { key: 'nama_lengkap', label: 'Marketing' },
  ...monthLabels.map((label, index) => ({
    key: `target_${index + 1}`,
    label,
    type: 'number',
  })),
  { key: 'total_target', label: 'Total Target', type: 'number' },
]

export default function Salesman() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [year, setYear] = useState(dayjs().year())
  const [searchValue, setSearchValue] = useState('')
  const searchRef = useRef('')

  const fetchData = useCallback(async (nextYear = year, search = searchRef.current, showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const res = await api.get('/api/salesman', {
        params: {
          year: nextYear,
          search,
          limit: 100000,
          include_total: 1,
          sort_field: 'nama_lengkap',
          sort_order: 'ascend',
        },
      })
      setRows((res.data.data || []).map(row => ({
        ...row,
        targets: Object.fromEntries(
          monthLabels.map((_, index) => [index + 1, Number(row.targets?.[index + 1] || row.targets?.[String(index + 1)] || 0)])
        ),
      })))
    } catch (error) {
      console.error(error)
      message.error('Gagal memuat target salesman')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [year])

  useEffect(() => {
    const timer = setTimeout(() => fetchData(year, ''), 0)
    return () => clearTimeout(timer)
  }, [fetchData, year])

  const handleSearch = useCallback(value => {
    searchRef.current = value
    fetchData(year, value)
  }, [fetchData, year])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== searchRef.current) handleSearch(searchValue)
    }, 450)
    return () => clearTimeout(timer)
  }, [handleSearch, searchValue])

  const handleYearChange = value => {
    const nextYear = value ? value.year() : dayjs().year()
    setYear(nextYear)
    fetchData(nextYear, searchRef.current)
  }

  const updateTarget = (salesmanId, month, value) => {
    setRows(current => current.map(row => {
      if (row.salesman_id !== salesmanId) return row
      const targets = { ...(row.targets || {}), [month]: Number(value || 0) }
      return {
        ...row,
        targets,
        total_target: Object.values(targets).reduce((sum, item) => sum + Number(item || 0), 0),
      }
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/api/salesman/targets', {
        year,
        rows: rows.map(row => ({
          salesman_id: row.salesman_id,
          salesman_name: row.nama_lengkap,
          targets: row.targets,
        })),
      })
      message.success('Target bulanan salesman berhasil disimpan')
      fetchData(year, searchRef.current, false)
    } catch (error) {
      console.error(error)
      message.error('Gagal menyimpan target salesman')
    } finally {
      setSaving(false)
    }
  }

  const exportRows = useMemo(() => rows.map((row, index) => ({
    no: index + 1,
    nama_lengkap: row.nama_lengkap,
    ...Object.fromEntries(monthLabels.map((_, monthIndex) => [
      `target_${monthIndex + 1}`,
      Number(row.targets?.[monthIndex + 1] || 0),
    ])),
    total_target: monthLabels.reduce((sum, _, monthIndex) => sum + Number(row.targets?.[monthIndex + 1] || 0), 0),
  })), [rows])

  const handleExport = () => exportRowsToXLS({
    rows: exportRows,
    columns: buildExportColumns(),
    filename: `TargetSalesman${year}`,
    sheetName: `Target ${year}`,
    message,
    setExporting,
    auditModule: 'salesman',
    auditDescription: `Export target salesman tahun ${year}`,
  })

  const columns = [
    {
      title: 'No.',
      key: 'no',
      width: 64,
      fixed: 'left',
      align: 'center',
      render: (_value, _record, index) => index + 1,
    },
    {
      title: 'Marketing',
      dataIndex: 'nama_lengkap',
      key: 'nama_lengkap',
      width: 250,
      fixed: 'left',
      sorter: (a, b) => String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''), 'id'),
      render: value => <Text strong>{value || '-'}</Text>,
    },
    ...monthLabels.map((label, index) => {
      const month = index + 1
      return {
        title: label,
        key: `target_${month}`,
        width: 150,
        align: 'right',
        render: (_value, record) => (
          <InputNumber
            min={0}
            value={Number(record.targets?.[month] || 0)}
            formatter={value => `Rp ${formatRp(value)}`}
            parser={parseRp}
            onChange={value => updateTarget(record.salesman_id, month, value)}
            controls={false}
            style={{ width: 130 }}
          />
        ),
      }
    }),
    {
      title: 'Total',
      key: 'total_target',
      width: 160,
      fixed: 'right',
      align: 'right',
      render: (_value, record) => {
        const total = monthLabels.reduce((sum, _label, index) => sum + Number(record.targets?.[index + 1] || 0), 0)
        return <Text strong>Rp {formatRp(total)}</Text>
      },
    },
  ]

  const totalYearTarget = exportRows.reduce((sum, row) => sum + Number(row.total_target || 0), 0)

  return (
    <Card
      title={(
        <Space direction="vertical" size={0}>
          <Title level={4} style={{ margin: 0 }}>Target Penjualan Salesman</Title>
          <Text type="secondary">Nama salesman dari Easy, target bulanan tersimpan di SQLite aplikasi.</Text>
        </Space>
      )}
      extra={(
        <Space wrap>
          <Search
            allowClear
            placeholder="Cari salesman"
            prefix={<SearchOutlined />}
            value={searchValue}
            onChange={event => setSearchValue(event.target.value)}
            onSearch={handleSearch}
            style={{ width: 220 }}
          />
          <DatePicker
            picker="year"
            value={dayjs(`${year}-01-01`)}
            onChange={handleYearChange}
            allowClear={false}
          />
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(year, searchRef.current)}>
            Refresh
          </Button>
          <Button icon={<FileExcelOutlined />} loading={exporting} onClick={handleExport}>
            Export
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            Simpan
          </Button>
        </Space>
      )}
      style={{ borderRadius: 8 }}
    >
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Text strong>{rows.length} salesman</Text>
        <Text strong>Total target {year}: Rp {formatRp(totalYearTarget)}</Text>
      </div>
      <Table
        rowKey="salesman_id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        scroll={{ x: 2200, y: 560 }}
        size="small"
      />
    </Card>
  )
}
