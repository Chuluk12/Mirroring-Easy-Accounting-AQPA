import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, Progress, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import { CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import DeliveryViewSwitcher from './DeliveryViewSwitcher'

const { Text, Title } = Typography
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export default function KPITimeOnDelivery({ mode = 'time-on-delivery' }) {
  const isDeliveryBack = mode === 'delivery-back'
  const endpoint = isDeliveryBack ? '/api/kpi/delivery-back' : '/api/kpi/time-on-delivery'
  const lateOneWeight = isDeliveryBack ? 75 : 80
  const pageTitle = isDeliveryBack ? 'KPI Delivery Back' : 'KPI Time On Delivery'
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState([])
  const [year, setYear] = useState(dayjs().year())
  const [availableYears, setAvailableYears] = useState([dayjs().year()])
  const [asOfDate, setAsOfDate] = useState('')

  const fetchKPIData = useCallback(async selectedYear => {
    try {
      const res = await api.get(endpoint, { params: { year: selectedYear } })
      setData(res.data.data || [])
      setAvailableYears(res.data.available_years || [selectedYear])
      setAsOfDate(res.data.as_of_date || '')
    } catch (error) {
      message.error(error.response?.data?.message || `Gagal memuat data ${pageTitle}`)
      setData([])
    } finally {
      setLoading(false)
    }
  }, [endpoint, pageTitle])

  useEffect(() => {
    let active = true
    api.get(endpoint, { params: { year } })
      .then(res => {
        if (!active) return
        setData(res.data.data || [])
        setAvailableYears(res.data.available_years || [year])
        setAsOfDate(res.data.as_of_date || '')
      })
      .catch(error => {
        if (!active) return
        message.error(error.response?.data?.message || `Gagal memuat data ${pageTitle}`)
        setData([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [endpoint, pageTitle, year])

  const summary = useMemo(() => data.reduce((total, row) => ({
    total: total.total + Number(row.total || 0),
    faster: total.faster + Number(row.pengiriman_lebih_cepat || 0),
    onTime: total.onTime + Number(row.tepat_waktu || 0),
    lateOne: total.lateOne + Number(row.telat_1_hari || 0),
    lateTwoPlus: total.lateTwoPlus + Number(row.telat_2_hari_atau_lebih || 0),
    outstanding: total.outstanding + Number(row.outstanding || 0),
  }), { total: 0, faster: 0, onTime: 0, lateOne: 0, lateTwoPlus: 0, outstanding: 0 }), [data])

  const yearlyAchievement = summary.total
    ? ((summary.faster * 125) + (summary.onTime * 100) + (summary.lateOne * lateOneWeight) + (summary.lateTwoPlus * 50)) / summary.total
    : 0
  const numberCell = value => Number(value || 0).toLocaleString('id-ID')

  const columns = [
    {
      title: 'Bulan',
      dataIndex: 'month',
      key: 'month',
      width: 145,
      align: 'center',
      render: value => (
        <div className="kpi-month-cell">
          <span>{String(value).padStart(2, '0')}</span>
          <Text>{MONTH_NAMES[Number(value) - 1]}</Text>
        </div>
      ),
    },
    {
      title: 'Target',
      dataIndex: 'target',
      key: 'target',
      width: 80,
      align: 'center',
      render: value => <strong>{numberCell(value)}</strong>,
    },
    {
      title: 'On Time',
      children: [
        {
          title: 'Diterima',
          dataIndex: 'on_time_diterima',
          key: 'on_time_diterima',
          width: 100,
          align: 'center',
          render: numberCell,
        },
        {
          title: 'Outstanding',
          dataIndex: 'on_time_outstanding',
          key: 'on_time_outstanding',
          width: 105,
          align: 'center',
          render: numberCell,
        },
      ],
    },
    {
      title: 'Late',
      children: [
        {
          title: 'Diterima',
          dataIndex: 'late_diterima',
          key: 'late_diterima',
          width: 100,
          align: 'center',
          render: numberCell,
        },
        {
          title: 'Outstanding',
          dataIndex: 'late_outstanding',
          key: 'late_outstanding',
          width: 105,
          align: 'center',
          render: numberCell,
        },
      ],
    },
    {
      title: 'On Time %',
      dataIndex: 'on_time_percentage',
      key: 'on_time_percentage',
      width: 110,
      align: 'center',
      render: value => (
        <div className="kpi-percentage-cell">
          <strong className={Number(value) >= 90 ? 'is-good' : 'is-warning'}>{Number(value || 0).toFixed(2)}%</strong>
          <Progress percent={Number(value || 0)} showInfo={false} size="small" strokeColor={Number(value) >= 90 ? '#16a34a' : '#f59e0b'} />
        </div>
      ),
    },
    {
      title: 'Late %',
      dataIndex: 'late_percentage',
      key: 'late_percentage',
      width: 100,
      align: 'center',
      render: value => <Tag color={Number(value) <= 10 ? 'green' : 'red'}>{Number(value || 0).toFixed(2)}%</Tag>,
    },
    {
      title: 'Target',
      dataIndex: 'target_percentage',
      key: 'target_percentage',
      width: 80,
      align: 'center',
      render: value => <Tag color="blue">{value}%</Tag>,
    },
    {
      title: <span title="Pengiriman lebih cepat dari deadline">Lebih Cepat<br /><small>125%</small></span>,
      dataIndex: 'pengiriman_lebih_cepat',
      key: 'pengiriman_lebih_cepat',
      width: 105,
      align: 'center',
      render: numberCell,
    },
    {
      title: <span>Tepat Waktu<br /><small>100%</small></span>,
      dataIndex: 'tepat_waktu',
      key: 'tepat_waktu',
      width: 105,
      align: 'center',
      render: numberCell,
    },
    {
      title: <span>Telat 1 Hari<br /><small>{lateOneWeight}%</small></span>,
      dataIndex: 'telat_1_hari',
      key: 'telat_1_hari',
      width: 100,
      align: 'center',
      render: numberCell,
    },
    {
      title: <span>Telat ≥2 Hari<br /><small>50%</small></span>,
      dataIndex: 'telat_2_hari_atau_lebih',
      key: 'telat_2_hari_atau_lebih',
      width: 110,
      align: 'center',
      render: numberCell,
    },
    {
      title: <span>Outstanding<br /><small>0%</small></span>,
      dataIndex: 'outstanding',
      key: 'outstanding',
      width: 105,
      align: 'center',
      render: numberCell,
    },
    {
      title: 'Total', dataIndex: 'total', key: 'total', width: 85, align: 'center',
      render: value => <strong>{numberCell(value)}</strong>,
    },
    {
      title: 'Pencapaian', dataIndex: 'pencapaian', key: 'pencapaian', width: 115, align: 'center',
      render: value => <Tag color={Number(value) >= 90 ? 'green' : 'orange'}>{Number(value || 0).toFixed(1)}%</Tag>,
    },
  ]

  return (
    <div className="kpi-delivery-page">
      <div className="delivery-view-switcher-bar">
        <DeliveryViewSwitcher active={isDeliveryBack ? 'delivery-back' : 'kpi'} />
      </div>

      <div className="kpi-delivery-hero">
        <div>
          <Text className="kpi-eyebrow">PENJUALAN · DELIVERY PERFORMANCE</Text>
          <Title level={3}>{pageTitle}</Title>
          <Text type="secondary">
            {isDeliveryBack
              ? 'Ringkasan ketepatan waktu pengembalian DO berdasarkan Target DO Kembali.'
              : 'Ringkasan ketepatan waktu pengiriman berdasarkan DO Date.'}
          </Text>
        </div>
        <Space wrap>
          <Select
            value={year}
            suffixIcon={<CalendarOutlined />}
            options={availableYears.map(value => ({ value, label: `Tahun ${value}` }))}
            onChange={value => {
              setLoading(true)
              setYear(value)
            }}
            style={{ width: 140 }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => {
            setLoading(true)
            fetchKPIData(year)
          }}>Refresh</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} className="kpi-summary-row">
        <Col xs={24} sm={12} xl={6}><Card><Statistic title="Total Pengiriman" value={summary.total} prefix={<ClockCircleOutlined />} /></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card><Statistic title="Lebih Cepat" value={summary.faster} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#16a34a' }} /></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card><Statistic title="Outstanding" value={summary.outstanding} prefix={<WarningOutlined />} valueStyle={{ color: '#dc2626' }} /></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card><Statistic title="Pencapaian Tahunan" value={yearlyAchievement} precision={2} suffix="%" valueStyle={{ color: yearlyAchievement >= 90 ? '#16a34a' : '#d97706' }} /></Card></Col>
      </Row>

      <Card
        className="kpi-delivery-card"
        title={<Space><span className="kpi-title-dot" />Performa Bulanan {year}</Space>}
        extra={<Text type="secondary">Update status: {asOfDate ? dayjs(asOfDate).format('DD MMMM YYYY') : '-'}</Text>}
      >
        <Table
          className="kpi-delivery-table"
          columns={columns}
          dataSource={data}
          rowKey="month"
          pagination={false}
          bordered
          loading={loading}
          size="middle"
          scroll={{ x: 1780 }}
          rowClassName={record => Number(record.pencapaian) >= 90 ? 'kpi-row-achieved' : ''}
        />
        <div className="kpi-table-note">
          <Text type="secondary">Target KPI perusahaan</Text>
          <Tag color="blue">90%</Tag>
          <Text type="secondary">Outstanding: DO yang belum memiliki Receive Date. Status Late dihitung terhadap ETA Cust per hari ini.</Text>
        </div>
      </Card>
    </div>
  )
}
