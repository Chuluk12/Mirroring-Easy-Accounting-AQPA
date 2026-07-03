import { useCallback, useEffect, useState } from 'react'
import { Card, Col, DatePicker, Row, Segmented, Space, Typography, message } from 'antd'
import { CalendarOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, FileDoneOutlined, LoadingOutlined, SyncOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../../api/client'
import useVisiblePolling from '../../hooks/useVisiblePolling'

const { RangePicker } = DatePicker
const { Text, Title } = Typography

const getThisWeekRange = () => {
  const today = dayjs()
  const mondayOffset = (today.day() + 6) % 7
  return [today.subtract(mondayOffset, 'day').startOf('day'), today.endOf('day')]
}
const getCurrentMonthRange = () => [dayjs().startOf('month'), dayjs().endOf('month')]
const getPeriodRange = period => period === 'week' ? getThisWeekRange() : getCurrentMonthRange()

const emptySummary = {
  so: { total: 0, menunggu: 0, diproses: 0, diterima: 0, ditutup: 0 },
}

const formatNumber = value => Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })
const formatPercent = value => `${Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })}%`

const statusMeta = [
  { key: 'menunggu', label: 'Menunggu', color: '#ff7a00', icon: <ClockCircleOutlined /> },
  { key: 'diproses', label: 'Diproses', color: '#11b7d8', icon: <SyncOutlined /> },
  { key: 'diterima', label: 'Diterima', color: '#00a92f', icon: <CheckCircleOutlined /> },
  { key: 'ditutup', label: 'Ditutup', color: '#697087', icon: <CloseCircleOutlined /> },
]

export default function ModulPengiriman() {
  const [period, setPeriod] = useState('month')
  const [dateRange, setDateRange] = useState(getCurrentMonthRange)
  const [summary, setSummary] = useState(emptySummary)
  const [loading, setLoading] = useState(false)

  const fetchSummary = useCallback(async (nextPeriod = period, dates = dateRange, showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const res = await api.get('/api/penjualan/flow-summary', {
        params: {
          period: nextPeriod,
          date_from: dates[0].format('YYYY-MM-DD'),
          date_to: dates[1].format('YYYY-MM-DD'),
        },
      })
      setSummary({
        ...emptySummary,
        ...res.data,
        so: { ...emptySummary.so, ...(res.data.so || {}) },
      })
    } catch (error) {
      message.error(error.response?.data?.message || 'Gagal memuat modul pengiriman')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [dateRange, period])

  useEffect(() => {
    fetchSummary(period, dateRange)
  }, [fetchSummary, period, dateRange])

  useVisiblePolling(() => {
    fetchSummary(period, dateRange, false)
  }, 30000)

  const handlePeriodChange = value => {
    const nextRange = getPeriodRange(value)
    setPeriod(value)
    setDateRange(nextRange)
  }

  const handleDateChange = dates => {
    const nextRange = dates || getCurrentMonthRange()
    setPeriod('custom')
    setDateRange(nextRange)
  }

  const totalSo = Number(summary.so.total || 0)
  const waiting = Number(summary.so.menunggu || 0)
  const received = Number(summary.so.diterima || 0)
  const completionPct = totalSo ? (received / totalSo) * 100 : 0
  const periodLabel = period === 'week'
    ? 'SO minggu ini'
    : period === 'month'
      ? 'SO bulan ini'
      : 'SO periode pilihan'

  return (
    <div className="modul-pengiriman-page">
      <div className="modul-pengiriman-heading">
        <div>
          <Title level={2}>Modul Pengiriman</Title>
          <Text type="secondary">Status sales order dan kesiapan pengiriman.</Text>
        </div>
        <Space wrap align="center">
          <Text strong><CalendarOutlined /> Periode</Text>
          <Segmented
            value={period}
            onChange={handlePeriodChange}
            options={[
              { label: 'Minggu ini', value: 'week' },
              { label: 'Bulan ini', value: 'month' },
            ]}
          />
          <RangePicker
            value={dateRange}
            format="DD/MM/YYYY"
            allowClear={false}
            onChange={handleDateChange}
          />
        </Space>
      </div>

      <Card className="delivery-status-card" bordered={false}>
        <div className="delivery-status-head">
          <Text strong><FileDoneOutlined /> Status SO</Text>
          <Text className="delivery-status-period">{periodLabel}</Text>
        </div>
        <Row gutter={[14, 14]} align="stretch">
          <Col xs={24} lg={12}>
            <div className="delivery-total-panel">
              <div className="delivery-total-top">
                <div>
                  <Text type="secondary">Total sales order</Text>
                  <div className="delivery-total-number">
                    {loading ? <LoadingOutlined /> : formatNumber(totalSo)}
                  </div>
                </div>
                <div className="delivery-progress-ring">
                  <span>{formatPercent(completionPct)}</span>
                </div>
              </div>
              <Row gutter={[10, 10]}>
                <Col xs={24} sm={12}>
                  <div className="delivery-mini-tile is-waiting">
                    <Text type="secondary">Belum selesai</Text>
                    <strong>{formatNumber(waiting)} SO</strong>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div className="delivery-mini-tile is-received">
                    <Text type="secondary">Diterima</Text>
                    <strong>{formatNumber(received)} SO</strong>
                  </div>
                </Col>
              </Row>
              <div className="delivery-bottom-bar">
                <span style={{ width: `${Math.min(100, Math.max(0, completionPct))}%` }} />
              </div>
            </div>
          </Col>
          <Col xs={24} lg={12}>
            <div className="delivery-breakdown-panel">
              <Text strong>Breakdown status</Text>
              <div className="delivery-breakdown-list">
                {statusMeta.map(item => {
                  const value = Number(summary.so[item.key] || 0)
                  const pct = totalSo ? (value / totalSo) * 100 : 0
                  return (
                    <div className="delivery-breakdown-row" key={item.key}>
                      <div className="delivery-breakdown-main">
                        <span className="delivery-status-dot" style={{ background: item.color }}>{item.icon}</span>
                        <Text>{item.label}</Text>
                        <strong>{formatNumber(value)}</strong>
                        <span className="delivery-status-pill" style={{ color: item.color, background: `${item.color}18` }}>
                          {formatPercent(pct)}
                        </span>
                      </div>
                      <div className="delivery-breakdown-track">
                        <span style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: item.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      <style>{`
        .modul-pengiriman-page {
          padding: 24px;
          max-width: 1440px;
        }
        .modul-pengiriman-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }
        .modul-pengiriman-heading h2 {
          margin: 0 0 4px;
        }
        .delivery-status-card {
          border: 1px solid #e8edf5;
          border-radius: 8px;
          background: linear-gradient(112deg, #fbfcff 0%, #ffffff 52%, #f1fbff 100%);
          box-shadow: 0 14px 36px rgba(15, 23, 42, 0.07);
        }
        .delivery-status-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 18px;
        }
        .delivery-status-head .anticon,
        .delivery-status-period {
          color: #5b21ff;
        }
        .delivery-total-panel,
        .delivery-breakdown-panel {
          min-height: 255px;
          border: 1px solid #e9eef6;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.82);
          padding: 18px;
        }
        .delivery-total-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 16px;
        }
        .delivery-total-number {
          color: #111827;
          font-size: 32px;
          font-weight: 800;
          line-height: 1.1;
          margin-top: 4px;
        }
        .delivery-progress-ring {
          width: 74px;
          height: 74px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: conic-gradient(#00a92f ${Math.min(100, Math.max(0, completionPct))}%, #e7edf4 0);
          position: relative;
          flex: 0 0 auto;
        }
        .delivery-progress-ring::before {
          content: "";
          position: absolute;
          inset: 5px;
          border-radius: 50%;
          background: #ffffff;
        }
        .delivery-progress-ring span {
          position: relative;
          color: #00a92f;
          font-weight: 800;
        }
        .delivery-mini-tile {
          min-height: 56px;
          border-radius: 6px;
          padding: 10px;
          border: 1px solid transparent;
        }
        .delivery-mini-tile strong {
          display: block;
          margin-top: 3px;
          font-size: 16px;
        }
        .delivery-mini-tile.is-waiting {
          background: #fff8f1;
          border-color: #ffd9ba;
        }
        .delivery-mini-tile.is-waiting strong {
          color: #ff7a00;
        }
        .delivery-mini-tile.is-received {
          background: #effaf4;
          border-color: #bfead0;
        }
        .delivery-mini-tile.is-received strong {
          color: #00a92f;
        }
        .delivery-bottom-bar,
        .delivery-breakdown-track {
          height: 8px;
          overflow: hidden;
          border-radius: 999px;
          background: #e8eef5;
        }
        .delivery-bottom-bar {
          margin-top: 16px;
        }
        .delivery-bottom-bar span,
        .delivery-breakdown-track span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #ff7a00;
        }
        .delivery-breakdown-list {
          display: grid;
          gap: 14px;
          margin-top: 14px;
        }
        .delivery-breakdown-main {
          display: grid;
          grid-template-columns: 18px minmax(90px, 1fr) 52px 56px;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .delivery-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-flex;
          overflow: hidden;
        }
        .delivery-status-dot .anticon {
          display: none;
        }
        .delivery-breakdown-main strong {
          text-align: right;
          color: #20243a;
        }
        .delivery-status-pill {
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          line-height: 22px;
          text-align: center;
        }
        @media (max-width: 768px) {
          .modul-pengiriman-page {
            padding: 16px;
          }
          .modul-pengiriman-heading {
            align-items: flex-start;
            flex-direction: column;
          }
          .delivery-breakdown-main {
            grid-template-columns: 18px minmax(80px, 1fr) 44px 52px;
          }
        }
      `}</style>
    </div>
  )
}
