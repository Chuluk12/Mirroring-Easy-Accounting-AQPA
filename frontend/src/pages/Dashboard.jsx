import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Col, DatePicker, Divider, Modal, Pagination, Popover, Progress, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography, message } from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  FileExcelOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  InboxOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SafetyCertificateOutlined,
  TrophyOutlined,
  ToolOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { downloadWorkbookXLS } from '../utils/exportXls'

const { RangePicker } = DatePicker
const { Text, Title } = Typography

const emptySummary = {
  period: { date_from: '', date_to: '' },
  stock: {
    total: 0, kosong: 0, ada: 0,
    total_items: 0, category_count: 0, categories: [],
    standardized_items: 0, below_minimum_items: 0,
  },
  purchasing: {
    po_period: 0,
    po_month: 0,
    item_period: 0,
    item_month: 0,
    total_easy: 0,
    discount: 0,
    grand_total: 0,
    vendor_total: 0,
    vendor_ppn: 0,
    vendor_non_ppn: 0,
    vendor_ppn_pct: 0,
    vendor_non_ppn_pct: 0,
    pb_total: 0,
    pb_received: 0,
    pb_pending: 0,
    pb_late: 0,
    pb_on_time: 0,
    pb_late_pct: 0,
    pb_on_time_pct: 0,
    pb_avg_late_days: 0,
    pb_max_late_days: 0,
  },
  sales: {
    so_period: 0,
    so_month: 0,
    do_period: 0,
    do_month: 0,
    do_vs_so_pct: 0,
    sales_amount_period: 0,
    sales_amount_previous: 0,
    sales_amount_change_pct: 0,
    sales_amount_direction: 'up',
    target_sales_amount: 0,
    target_source_label: '',
    target_achievement_pct: 0,
    target_remaining_amount: 0,
    top_products: [],
    top_qty_product: { itemno: '', description: '', qty: 0, amount: 0 },
    top_qty_products: [],
    top_customers: [],
    top_salesmen: [],
    salesman_yearly: [],
    marketing_customer_yearly: [],
    sales_receivables_by_salesman: [],
    sold_by_category: [],
    sold_by_code_product: [],
    customer_cities: [],
    so_month_status: {
      total: 0,
      open: 0,
      process: 0,
      received: 0,
      closed: 0,
      active_customers: 0,
      repeat_customers: 0,
      new_customers: 0,
    },
    outstanding_receivables: [],
    receivable_aging: [],
    invoice_period: 0,
    invoice_month: 0,
    invoice_amount_period: 0,
    invoice_amount_month: 0,
  },
  production: {
    spk_total_month: 0,
    spk_finished_month: 0,
    spk_active_month: 0,
    spk_progress_percent: 0,
    spm_total_month: 0,
    spm_done_month: 0,
    spm_partial_month: 0,
    spm_open_month: 0,
    spm_progress_percent: 0,
    gp_total_month: 0,
    gp_done_month: 0,
    gp_partial_month: 0,
    gp_open_month: 0,
    gp_progress_percent: 0,
  },
  accounting: {
    hpp_total: 0,
    nilai_jual: 0,
    laba_rugi: 0,
    margin_pct: 0,
    profit_products: 0,
    loss_products: 0,
    asset_purchase_amount: 0,
    asset_purchase_count: 0,
  },
}

const red = '#d41452'
const purple = '#7c3cff'
const cyan = '#11b7d8'
const green = '#00a92f'
const orange = '#ff7a00'
const softBorder = '1px solid rgba(226,231,240,0.88)'
const SHOW_DASHBOARD_ACCOUNTING = false
const MARKETING_SALES_PAGE_SIZE = 4

function defaultDateRange() {
  return [dayjs().startOf('month'), dayjs()]
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function formatCompactCurrency(value) {
  const abs = Math.abs(Number(value || 0))
  if (abs >= 1000000000) return `${(Number(value) / 1000000000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}M`
  if (abs >= 1000000) return `${(Number(value) / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}jt`
  if (abs >= 1000) return `${(Number(value) / 1000).toLocaleString('id-ID', { maximumFractionDigits: 0 })}rb`
  return Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('id-ID')
}

function formatQty(value) {
  const numberValue = Number(value || 0)
  return numberValue.toLocaleString('id-ID', {
    maximumFractionDigits: numberValue % 1 === 0 ? 0 : 2,
  })
}

function safeFilename(value, fallback = 'export') {
  return String(value || fallback)
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || fallback
}

function SummaryCard({ title, value, suffix, icon, color, loading, children }) {
  return (
    <Card
      style={{
        borderRadius: 8,
        border: softBorder,
        height: '100%',
        width: '100%',
        background: `
          radial-gradient(circle at 92% 18%, ${color}2b 0%, transparent 30%),
          linear-gradient(135deg, ${color}1f 0%, #ffffff 48%, ${color}10 100%)
        `,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: 18,
          top: 18,
          width: 52,
          height: 52,
          borderRadius: 8,
          background: `linear-gradient(135deg, ${color}24, transparent)`,
          clipPath: 'polygon(50% 0, 94% 25%, 94% 75%, 50% 100%, 6% 75%, 6% 25%)',
        }}
      />
      <Statistic
        title={title}
        value={value}
        suffix={suffix}
        prefix={icon}
        valueStyle={{ color }}
        loading={loading}
      />
      {children}
    </Card>
  )
}

function ModuleSection({ title, subtitle, color, icon, children }) {
  return (
    <section style={{ marginTop: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 8,
          border: softBorder,
          background: `
            radial-gradient(circle at 96% 10%, ${color}22 0%, transparent 28%),
            linear-gradient(135deg, ${color}12 0%, rgba(255,255,255,0.82) 58%, ${color}08 100%)
          `,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            color,
            background: `${color}14`,
          }}
        >
          {icon}
        </div>
        <div>
          <Text strong style={{ display: 'block', color: '#20243a', fontSize: 15 }}>{title}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{subtitle}</Text>
        </div>
      </div>
      {children}
    </section>
  )
}

function TrendBadge({ percent, direction, label = 'periode lalu' }) {
  const up = direction !== 'down'
  const value = Math.abs(Number(percent || 0)).toLocaleString('id-ID', { maximumFractionDigits: 1 })
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        marginTop: 8,
        padding: '3px 8px',
        borderRadius: 8,
        color: up ? green : red,
        background: up ? 'rgba(0,169,47,0.09)' : 'rgba(212,20,82,0.09)',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
      {value}% vs {label}
    </div>
  )
}

function PurchasingModule({ purchasing, loading }) {
  const ppnPct = Number(purchasing.vendor_ppn_pct || 0)
  const nonPpnPct = Number(purchasing.vendor_non_ppn_pct || 0)
  const pbLatePct = Number(purchasing.pb_late_pct || 0)
  const pbOnTimePct = Number(purchasing.pb_on_time_pct || 0)
  const discountRate = Number(purchasing.total_easy || 0)
    ? (Number(purchasing.discount || 0) / Number(purchasing.total_easy || 0)) * 100
    : 0
  const netAfterDiscount = Number(purchasing.total_easy || 0) - Number(purchasing.discount || 0)

  const metricPanels = [
    { title: 'PO Periode', value: formatNumber(purchasing.po_period), tone: green, icon: <ShoppingCartOutlined /> },
    { title: 'PO per Barang', value: formatNumber(purchasing.item_period), tone: orange, icon: <FileDoneOutlined /> },
    { title: 'Vendor Aktif', value: formatNumber(purchasing.vendor_total), tone: cyan, icon: <SafetyCertificateOutlined /> },
  ]

  return (
    <div
      style={{
        border: softBorder,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 55%, #f5fff9 100%)',
        boxShadow: '0 18px 42px rgba(23, 28, 51, 0.07)',
      }}
    >
      <Row gutter={[0, 0]}>
        <Col xs={24} xl={10}>
          <div
            style={{
              height: '100%',
              minHeight: 246,
              padding: 22,
              borderRight: '1px solid rgba(226,231,240,0.78)',
              background: `
                radial-gradient(circle at 92% 12%, ${green}24 0%, transparent 30%),
                linear-gradient(135deg, rgba(0,169,47,0.10), rgba(17,183,216,0.08) 58%, #ffffff 100%)
              `,
            }}
          >
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 700 }}>Nilai pembelian periode berjalan</Text>
            <div style={{ marginTop: 10, color: green, fontSize: 30, fontWeight: 850, lineHeight: 1.05 }}>
              {loading ? '-' : formatCurrency(purchasing.grand_total)}
            </div>
            <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
              Grand total Easy Accounting
            </Text>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
              <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.78)', border: softBorder }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Total Easy</Text>
                <div style={{ marginTop: 5, color: cyan, fontWeight: 800, fontSize: 17 }}>{formatCurrency(purchasing.total_easy)}</div>
              </div>
              <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.78)', border: softBorder }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Diskon</Text>
                <div style={{ marginTop: 5, color: orange, fontWeight: 800, fontSize: 17 }}>{formatCurrency(purchasing.discount)}</div>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Setelah diskon</Text>
                <Text strong style={{ color: '#20243a' }}>{formatCurrency(netAfterDiscount)}</Text>
              </div>
              <Progress
                percent={Math.min(Math.max(discountRate, 0), 100)}
                showInfo={false}
                strokeColor={orange}
                trailColor="rgba(255,122,0,0.13)"
                style={{ marginTop: 6 }}
              />
              <Text type="secondary" style={{ fontSize: 11 }}>Diskon {discountRate.toLocaleString('id-ID', { maximumFractionDigits: 2 })}% dari Total Easy</Text>
            </div>
          </div>
        </Col>

        <Col xs={24} xl={14}>
          <div style={{ padding: 18 }}>
            <Row gutter={[12, 12]}>
              {metricPanels.map(panel => (
                <Col key={panel.title} xs={24} sm={8}>
                  <div
                    style={{
                      minHeight: 92,
                      padding: 14,
                      borderRadius: 8,
                      border: softBorder,
                      background: `linear-gradient(135deg, ${panel.tone}12, #ffffff 82%)`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <Text type="secondary" style={{ fontSize: 12, fontWeight: 700 }}>{panel.title}</Text>
                      <span style={{ color: panel.tone }}>{panel.icon}</span>
                    </div>
                    <div style={{ marginTop: 8, color: panel.tone, fontSize: 24, fontWeight: 850 }}>{loading ? '-' : panel.value}</div>
                  </div>
                </Col>
              ))}
            </Row>

            <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
              <Col xs={24} lg={12}>
                <div
                  style={{
                    height: '100%',
                    padding: 16,
                    borderRadius: 8,
                    border: softBorder,
                    background: `
                      radial-gradient(circle at 94% 18%, ${cyan}18 0%, transparent 26%),
                      linear-gradient(135deg, #ffffff 0%, rgba(17,183,216,0.06) 100%)
                    `,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <Text strong style={{ color: '#20243a' }}>Komposisi Vendor PPN</Text>
                      <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                        {formatNumber(purchasing.vendor_total)} vendor unik periode berjalan
                      </Text>
                    </div>
                    <Space size={8} wrap>
                      <Tag color="cyan">PPN {formatNumber(purchasing.vendor_ppn)}</Tag>
                      <Tag color="default">Non PPN {formatNumber(purchasing.vendor_non_ppn)}</Tag>
                    </Space>
                  </div>

                  <div style={{ marginTop: 15 }}>
                    <div style={{ display: 'flex', height: 16, borderRadius: 999, overflow: 'hidden', background: '#edf2f7' }}>
                      <Tooltip title={`Vendor PPN ${ppnPct}%`}>
                        <div style={{ width: `${ppnPct}%`, background: `linear-gradient(90deg, ${cyan}, #36cfc9)` }} />
                      </Tooltip>
                      <Tooltip title={`Vendor Non PPN ${nonPpnPct}%`}>
                        <div style={{ width: `${nonPpnPct}%`, background: 'linear-gradient(90deg, #cbd5e1, #94a3b8)' }} />
                      </Tooltip>
                    </div>
                    <Row gutter={[10, 8]} style={{ marginTop: 12 }}>
                      <Col xs={12}>
                        <div style={{ padding: 10, borderRadius: 8, background: 'rgba(17,183,216,0.08)' }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>Vendor PPN</Text>
                          <div style={{ color: cyan, fontSize: 21, fontWeight: 850 }}>{ppnPct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</div>
                        </div>
                      </Col>
                      <Col xs={12}>
                        <div style={{ padding: 10, borderRadius: 8, background: 'rgba(148,163,184,0.12)' }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>Vendor Non PPN</Text>
                          <div style={{ color: '#64748b', fontSize: 21, fontWeight: 850 }}>{nonPpnPct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</div>
                        </div>
                      </Col>
                    </Row>
                  </div>
                </div>
              </Col>

              <Col xs={24} lg={12}>
                <div
                  style={{
                    height: '100%',
                    padding: 16,
                    borderRadius: 8,
                    border: softBorder,
                    background: `
                      radial-gradient(circle at 94% 18%, ${red}12 0%, transparent 26%),
                      linear-gradient(135deg, #ffffff 0%, rgba(0,169,47,0.06) 100%)
                    `,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <Text strong style={{ color: '#20243a' }}>Tgl Ekspetasi vs Tgl PB</Text>
                      <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                        {formatNumber(purchasing.pb_received)} dari {formatNumber(purchasing.pb_total)} barang sudah PB
                      </Text>
                    </div>
                    <Tag color={Number(purchasing.pb_late || 0) > 0 ? 'red' : 'green'}>
                      {formatNumber(purchasing.pb_late)} telat
                    </Tag>
                  </div>

                  <div style={{ marginTop: 15 }}>
                    <div style={{ display: 'flex', height: 16, borderRadius: 999, overflow: 'hidden', background: '#edf2f7' }}>
                      <Tooltip title={`Tepat/lebih cepat ${pbOnTimePct}%`}>
                        <div style={{ width: `${pbOnTimePct}%`, background: `linear-gradient(90deg, ${green}, #36cfc9)` }} />
                      </Tooltip>
                      <Tooltip title={`Telat ${pbLatePct}%`}>
                        <div style={{ width: `${pbLatePct}%`, background: `linear-gradient(90deg, ${orange}, ${red})` }} />
                      </Tooltip>
                    </div>
                    <Row gutter={[10, 8]} style={{ marginTop: 12 }}>
                      <Col xs={12}>
                        <div style={{ padding: 10, borderRadius: 8, background: 'rgba(0,169,47,0.08)' }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>Tepat/Cepat</Text>
                          <div style={{ color: green, fontSize: 21, fontWeight: 850 }}>{formatNumber(purchasing.pb_on_time)}</div>
                        </div>
                      </Col>
                      <Col xs={12}>
                        <div style={{ padding: 10, borderRadius: 8, background: 'rgba(212,20,82,0.08)' }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>Telat</Text>
                          <div style={{ color: red, fontSize: 21, fontWeight: 850 }}>{formatNumber(purchasing.pb_late)}</div>
                        </div>
                      </Col>
                    </Row>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Belum PB: {formatNumber(purchasing.pb_pending)}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Rata-rata telat {Number(purchasing.pb_avg_late_days || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })} hari, maks {formatNumber(purchasing.pb_max_late_days)} hari
                      </Text>
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
          </div>
        </Col>
      </Row>
    </div>
  )
}

function SoftBarChart({ title, icon, rows, getName, getMeta, color, loading, metricKey = 'amount', formatValue = formatCompactCurrency, onRowClick }) {
  const max = Math.max(...(rows || []).map(row => Number(row[metricKey] || 0)), 1)
  const chartRows = (rows || []).slice(0, 3)
  const gradientId = `rankGradient${title.replace(/\s/g, '')}`
  return (
    <Card
      title={<span>{icon} {title}</span>}
      loading={loading}
      style={{ borderRadius: 8, border: softBorder, height: '100%' }}
    >
      <div style={{ minHeight: 230, display: 'grid', gridTemplateColumns: '82px 1fr', gap: 18 }}>
        <div style={{ borderRadius: 8, background: `linear-gradient(180deg, ${color}12, ${color}05)`, overflow: 'hidden' }}>
          <svg viewBox="0 0 82 230" style={{ width: '100%', height: '100%', display: 'block' }}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="1" y2="0">
                <stop offset="0%" stopColor={color} stopOpacity="0.95" />
                <stop offset="100%" stopColor={color} stopOpacity="0.32" />
              </linearGradient>
            </defs>
            <path d="M8 48 C24 18, 42 72, 58 36 S76 48, 78 24" fill="none" stroke={color} strokeOpacity="0.34" strokeWidth="3" strokeLinecap="round" />
            {[0, 1, 2].map(index => {
              const row = chartRows[index] || {}
              const metricValue = Number(row[metricKey] || 0)
              const h = Math.max((metricValue / max) * 148, metricValue ? 18 : 0)
              const x = 14 + index * 19
              const y = 190 - h
              return (
                <g key={index}>
                  <rect x={x} y={42} width={12} height={148} rx={6} fill="rgba(226,231,240,0.78)" />
                  <rect x={x} y={y} width={12} height={h} rx={6} fill={`url(#${gradientId})`} />
                  <circle cx={x + 6} cy={Math.max(y, 42)} r={6} fill="#fff" stroke={color} strokeWidth="2" />
                  <text x={x + 6} y="214" textAnchor="middle" fontSize="10" fill="#697087">{index + 1}</text>
                </g>
              )
            })}
          </svg>
        </div>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {chartRows.map((row, index) => {
            const metricValue = Number(row[metricKey] || 0)
            const pct = Math.max((metricValue / max) * 100, 5)
            return (
              <div
                key={`${getName(row)}-${index}`}
                style={{
                  padding: '10px 11px',
                  borderRadius: 8,
                  cursor: onRowClick ? 'pointer' : 'default',
                  background: `
                    radial-gradient(circle at 96% 18%, ${color}18 0%, transparent 28%),
                    linear-gradient(135deg, ${color}0e 0%, #ffffff 72%)
                  `,
                  boxShadow: 'inset 0 0 0 1px rgba(226,231,240,0.55)',
                }}
                onClick={() => onRowClick?.(row)}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 24, height: 24, borderRadius: 8, display: 'grid', placeItems: 'center', color, background: '#fff', fontWeight: 800 }}>
                    {index + 1}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <Text strong ellipsis style={{ display: 'block' }}>{getName(row) || '-'}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{getMeta(row)}</Text>
                  </div>
                  <Text strong style={{ color, whiteSpace: 'nowrap' }}>{formatValue(metricValue, row)}</Text>
                </div>
                <div style={{ height: 9, marginTop: 9, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${color}, ${color}88, ${color}cc)`,
                      boxShadow: `0 0 14px ${color}33`,
                    }}
                  />
                </div>
              </div>
            )
          })}
          {chartRows.length === 0 && <Text type="secondary">Belum ada data pada periode ini.</Text>}
        </Space>
      </div>
    </Card>
  )
}

const pieColors = [cyan, purple, orange, green, red, '#64748b']

function SoftPieChart({ title, icon, rows, loading, accent = cyan, onRowClick }) {
  const chartRows = (rows || []).filter(row => Number(row.qty || 0) > 0).slice(0, 6)
  const total = chartRows.reduce((sum, row) => sum + Number(row.qty || 0), 0)
  const topRow = chartRows[0] || {}
  const topPct = total > 0 ? Math.round((Number(topRow.qty || 0) / total) * 100) : 0
  const radius = 45
  const circumference = 2 * Math.PI * radius
  const shadowId = `pieShadow${title.replace(/\s/g, '')}`
  let offset = 0

  return (
    <Card
      title={<span>{icon} {title}</span>}
      loading={loading}
      extra={total > 0 ? <Text strong style={{ color: accent, fontSize: 13 }}>{formatCompactCurrency(total)} qty</Text> : null}
      style={{
        borderRadius: 8,
        border: softBorder,
        height: '100%',
        overflow: 'hidden',
        background: `
          radial-gradient(circle at 12% 0%, ${accent}16 0%, transparent 28%),
          radial-gradient(circle at 96% 8%, ${purple}10 0%, transparent 32%),
          linear-gradient(135deg, #ffffff 0%, #fbfdff 100%)
        `,
      }}
      styles={{ body: { padding: 18 } }}
    >
      <div
        style={{
          minHeight: 270,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        <div
          onClick={() => topRow.label && onRowClick?.(topRow)}
          style={{
            minHeight: 238,
            flex: '0 1 220px',
            borderRadius: 8,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: onRowClick && topRow.label ? 'pointer' : 'default',
            background: `
              radial-gradient(circle at 24% 16%, ${accent}24 0%, transparent 34%),
              radial-gradient(circle at 82% 84%, ${purple}18 0%, transparent 38%),
              linear-gradient(145deg, #ffffff 0%, #f7fbff 100%)
            `,
            boxShadow: 'inset 0 0 0 1px rgba(226,231,240,0.62)',
          }}
        >
          <svg viewBox="0 0 132 132" style={{ width: 178, height: 178, display: 'block', overflow: 'visible' }}>
            <defs>
              <filter id={shadowId} x="-25%" y="-25%" width="150%" height="150%">
                <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#162033" floodOpacity="0.13" />
              </filter>
            </defs>
            <circle cx="66" cy="66" r={radius + 11} fill="#fff" opacity="0.72" filter={`url(#${shadowId})`} />
            <circle cx="66" cy="66" r={radius} fill="none" stroke="#edf2f7" strokeWidth="20" />
            {chartRows.map((row, index) => {
              const dash = total > 0 ? (Number(row.qty || 0) / total) * circumference : 0
              const segment = (
                <circle
                  key={`${row.label}-${index}`}
                  cx="66"
                  cy="66"
                  r={radius}
                  fill="none"
                  stroke={pieColors[index % pieColors.length]}
                  strokeWidth="20"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(dash - 2, 0)} ${circumference}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 66 66)"
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  onClick={event => {
                    event.stopPropagation()
                    onRowClick?.(row)
                  }}
                />
              )
              offset += dash
              return segment
            })}
            <circle cx="66" cy="66" r="30" fill="#fff" />
            <text x="66" y="63" textAnchor="middle" fontSize="14" fontWeight="800" fill="#20243a">
              {formatCompactCurrency(total)}
            </text>
            <text x="66" y="80" textAnchor="middle" fontSize="9" fill="#697087">
              qty
            </text>
          </svg>
          <div style={{ marginTop: 8, textAlign: 'center', width: '100%' }}>
            <Text type="secondary" style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0 }}>
              Terbesar
            </Text>
            <Text strong ellipsis style={{ display: 'block', color: accent }}>
              {topRow.label || '-'}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {topPct}% dari total
            </Text>
          </div>
        </div>
        <Space direction="vertical" size={8} style={{ flex: '1 1 270px', minWidth: 0 }}>
          {chartRows.map((row, index) => {
            const color = pieColors[index % pieColors.length]
            const pct = total > 0 ? Math.round((Number(row.qty || 0) / total) * 100) : 0
            return (
              <div
                key={`${row.label}-${index}`}
                onClick={() => onRowClick?.(row)}
                style={{
                  padding: '9px 10px',
                  borderRadius: 8,
                  cursor: onRowClick ? 'pointer' : 'default',
                  background: `
                    radial-gradient(circle at 98% 8%, ${color}16 0%, transparent 26%),
                    linear-gradient(135deg, ${color}0c 0%, #ffffff 74%)
                  `,
                  boxShadow: 'inset 0 0 0 1px rgba(226,231,240,0.60)',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 25,
                      height: 25,
                      borderRadius: 8,
                      display: 'grid',
                      placeItems: 'center',
                      color,
                      background: '#fff',
                      boxShadow: `inset 0 0 0 1px ${color}24`,
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ minWidth: 0 }}>
                  <Text strong ellipsis style={{ display: 'block' }}>{row.label || '-'}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatCompactCurrency(row.qty)} qty - {formatCompactCurrency(row.amount)}
                  </Text>
                  </div>
                  <Tag
                  style={{
                    marginInlineEnd: 0,
                    borderRadius: 999,
                    color,
                    borderColor: `${color}33`,
                    background: `${color}10`,
                    fontWeight: 700,
                    minWidth: 44,
                    textAlign: 'center',
                  }}
                >
                  {pct}%
                  </Tag>
                </div>
                <div style={{ height: 6, marginTop: 8, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${color}, ${color}90)`,
                    }}
                  />
                </div>
              </div>
            )
          })}
          {chartRows.length === 0 && <Text type="secondary">Belum ada data pada periode ini.</Text>}
        </Space>
      </div>
    </Card>
  )
}

const RECEIVABLE_AGING_CONFIG = {
  '0_30': {
    bg: `radial-gradient(circle at 88% 18%, ${cyan}26 0%, transparent 30%), linear-gradient(135deg, ${cyan}12 0%, #ffffff 48%, ${green}0f 100%)`,
    border: 'rgba(226,231,240,0.88)',
    color: cyan,
    accent: green,
  },
  '31_60': {
    bg: `radial-gradient(circle at 88% 18%, ${purple}26 0%, transparent 30%), linear-gradient(135deg, ${purple}12 0%, #ffffff 48%, ${cyan}0f 100%)`,
    border: 'rgba(226,231,240,0.88)',
    color: purple,
    accent: cyan,
  },
  '61_90': {
    bg: `radial-gradient(circle at 88% 18%, ${orange}26 0%, transparent 30%), linear-gradient(135deg, ${orange}12 0%, #ffffff 48%, ${red}0f 100%)`,
    border: 'rgba(226,231,240,0.88)',
    color: orange,
    accent: red,
  },
  'gt_90': {
    bg: `radial-gradient(circle at 88% 18%, ${red}24 0%, transparent 30%), linear-gradient(135deg, ${red}10 0%, #ffffff 48%, ${orange}0f 100%)`,
    border: 'rgba(226,231,240,0.88)',
    color: red,
    accent: orange,
  },
}

const defaultReceivableAging = [
  { key: '0_30', range: '0 - 30 hari', amount: 0, invoice_count: 0 },
  { key: '31_60', range: '31 - 60 hari', amount: 0, invoice_count: 0 },
  { key: '61_90', range: '61 - 90 hari', amount: 0, invoice_count: 0 },
  { key: 'gt_90', range: '> 90 hari', amount: 0, invoice_count: 0 },
]

function buildReceivableAgingFromInvoices(invoices = []) {
  const agingMap = new Map(defaultReceivableAging.map(row => [row.key, { ...row }]))
  invoices.forEach(invoice => {
    const days = Math.max(Number(invoice.overdue_days || 0), 0)
    const key = days > 90 ? 'gt_90' : days > 60 ? '61_90' : days > 30 ? '31_60' : '0_30'
    const current = agingMap.get(key)
    current.amount += Number(invoice.amount || 0)
    current.invoice_count += 1
  })
  return defaultReceivableAging.map(row => agingMap.get(row.key))
}

function ReceivableAging({ rows, fallbackRows, loading }) {
  const [selectedAging, setSelectedAging] = useState(null)
  const [selectedSalesman, setSelectedSalesman] = useState('')
  const hasAgingData = (rows || []).some(row => Number(row.amount || 0) > 0 || Number(row.invoice_count || 0) > 0)
  const sourceRows = hasAgingData ? rows : buildReceivableAgingFromInvoices(fallbackRows)
  const salesmanOptions = useMemo(() => {
    const optionMap = new Map()
    ;(sourceRows || []).forEach(row => {
      ;(row.customers || []).forEach(customer => {
        ;(customer.pos || []).forEach(po => {
          const label = po.salesman_name || 'Tanpa Marketing'
          const value = `${po.salesman_id || 0}|${label}`
          optionMap.set(value, label)
        })
      })
    })
    return Array.from(optionMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }))
  }, [sourceRows])
  const filteredSourceRows = useMemo(() => {
    if (!selectedSalesman) return sourceRows
    return (sourceRows || []).map(row => {
      const customerMap = new Map()
      ;(row.customers || []).forEach(customer => {
        ;(customer.pos || []).forEach(po => {
          const salesmanKey = `${po.salesman_id || 0}|${po.salesman_name || 'Tanpa Marketing'}`
          if (salesmanKey !== selectedSalesman) return
          const current = customerMap.get(customer.customer) || {
            customer: customer.customer,
            amount: 0,
            invoice_count: 0,
            po_count: 0,
            pos: [],
            poSeen: new Set(),
          }
          current.amount += Number(po.amount || 0)
          current.invoice_count += 1
          const poKey = po.no_po || po.no_pesanan || po.no_faktur || current.invoice_count
          if (!current.poSeen.has(poKey)) {
            current.poSeen.add(poKey)
            current.po_count += 1
          }
          current.pos.push(po)
          customerMap.set(customer.customer, current)
        })
      })
      const customers = Array.from(customerMap.values()).map(customer => {
        const { poSeen, ...cleanCustomer } = customer
        return {
          ...cleanCustomer,
          amount: Math.round(cleanCustomer.amount * 100) / 100,
        }
      }).sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      return {
        ...row,
        amount: customers.reduce((sum, customer) => sum + Number(customer.amount || 0), 0),
        invoice_count: customers.reduce((sum, customer) => sum + Number(customer.invoice_count || 0), 0),
        customers,
      }
    })
  }, [sourceRows, selectedSalesman])
  const rowMap = new Map((filteredSourceRows || []).map(row => [row.key, row]))
  const agingRows = defaultReceivableAging.map(row => ({ ...row, ...(rowMap.get(row.key) || {}) }))
  const totalAmount = agingRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const totalInvoices = agingRows.reduce((sum, row) => sum + Number(row.invoice_count || 0), 0)

  return (
    <Card
      title={<span><FileTextOutlined style={{ color: red }} /> Piutang Belum Lunas</span>}
      extra={(
        <Space size={10} wrap>
          <Select
            allowClear
            size="small"
            placeholder="Semua Marketing"
            value={selectedSalesman || undefined}
            onChange={value => {
              setSelectedSalesman(value || '')
              setSelectedAging(null)
            }}
            options={salesmanOptions}
            style={{ minWidth: 190 }}
          />
          <Text strong style={{ color: '#20243a', fontSize: 13 }}>{formatCurrency(totalAmount)}</Text>
        </Space>
      )}
      loading={loading}
      style={{
        borderRadius: 8,
        border: softBorder,
        overflow: 'hidden',
        background: `
          radial-gradient(circle at 92% 12%, ${red}10 0%, transparent 28%),
          linear-gradient(135deg, #ffffff 0%, #fbfdff 100%)
        `,
      }}
      styles={{ body: { paddingTop: 16 } }}
    >
      <Row gutter={[12, 12]}>
        {agingRows.map(row => {
          const styleConfig = RECEIVABLE_AGING_CONFIG[row.key] || RECEIVABLE_AGING_CONFIG['0_30']
          const pct = totalAmount ? Math.round((Number(row.amount || 0) / totalAmount) * 100) : 0
          const statusLabel = row.key === 'gt_90' ? 'Kritis' : row.key === '61_90' ? 'Perlu ditagih' : row.key === '31_60' ? 'Pantau' : 'Lancar'
          const statusIcon = row.key === 'gt_90' ? <WarningOutlined /> : row.key === '0_30' ? <CheckCircleOutlined /> : <ClockCircleOutlined />
          return (
            <Col key={row.key} xs={24} sm={12} xl={6}>
              <div
                style={{
                  minHeight: 118,
                  height: '100%',
                  padding: '14px 14px 13px',
                  border: `1px solid ${styleConfig.border}`,
                  borderRadius: 8,
                  background: styleConfig.bg,
                  boxShadow: '0 10px 24px rgba(24, 33, 58, 0.04), inset 0 1px 0 rgba(255,255,255,0.72)',
                  cursor: 'pointer',
                }}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedAging(row)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedAging(row)
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <Text strong style={{ color: '#20243a', fontSize: 13 }}>{row.range}</Text>
                  <Tag
                    style={{
                      marginInlineEnd: 0,
                      borderRadius: 999,
                      color: styleConfig.color,
                      borderColor: `${styleConfig.color}33`,
                      background: `${styleConfig.color}10`,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {statusIcon} {statusLabel}
                  </Tag>
                </div>
                <div style={{ marginTop: 12, color: styleConfig.color, fontSize: 23, fontWeight: 800, lineHeight: 1.1 }}>
                  Rp{formatCompactCurrency(row.amount)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 5 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>{row.invoice_count || 0} invoice</Text>
                  <Text strong style={{ color: styleConfig.color, fontSize: 11 }}>{pct}% dari total</Text>
                </div>
                <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 11 }}>
                  {(row.customers || []).length} customer, klik untuk detail PO
                </Text>
                <div style={{ height: 7, marginTop: 10, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.max(pct, Number(row.amount || 0) > 0 ? 2 : 0)}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${styleConfig.color}, ${styleConfig.accent})`,
                      boxShadow: `0 0 14px ${styleConfig.color}33`,
                    }}
                  />
                </div>
              </div>
            </Col>
          )
        })}
      </Row>
      <Text type="secondary" style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
        Total {totalInvoices} invoice belum lunas dalam periode jatuh tempo.
      </Text>
      <Modal
        title={selectedAging ? `Detail Piutang ${selectedAging.range}` : 'Detail Piutang'}
        open={!!selectedAging}
        onCancel={() => setSelectedAging(null)}
        footer={null}
        width={920}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Text type="secondary">
              {(selectedAging?.customers || []).length} customer, {selectedAging?.invoice_count || 0} invoice
            </Text>
            <Text strong>{formatCurrency(selectedAging?.amount || 0)}</Text>
          </div>
          {(selectedAging?.customers || []).length ? (
            (selectedAging.customers || []).map(customer => (
              <div
                key={customer.customer}
                style={{
                  border: softBorder,
                  borderRadius: 8,
                  padding: 12,
                  background: 'linear-gradient(135deg, #ffffff 0%, #fbfdff 100%)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <Text strong style={{ color: '#20243a' }}>{customer.customer}</Text>
                    <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      {customer.invoice_count || 0} invoice, {customer.po_count || 0} PO
                    </Text>
                  </div>
                  <Text strong style={{ color: red }}>{formatCurrency(customer.amount || 0)}</Text>
                </div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {(customer.pos || []).map((po, index) => (
                    <div
                      key={`${po.no_faktur || po.no_po || po.no_pesanan || index}-${index}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(150px, 1fr) minmax(130px, 0.9fr) minmax(110px, 0.7fr) minmax(120px, auto)',
                        gap: 10,
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: 'rgba(245,247,251,0.78)',
                      }}
                    >
                      <Text style={{ fontSize: 12 }}><Text type="secondary">PO </Text>{po.no_po || '-'}</Text>
                      <Text style={{ fontSize: 12 }}><Text type="secondary">SO </Text>{po.no_pesanan || '-'}</Text>
                      <Text style={{ fontSize: 12 }}><Text type="secondary">Faktur </Text>{po.no_faktur || '-'}</Text>
                      <Text strong style={{ fontSize: 12, textAlign: 'right' }}>{formatCurrency(po.amount || 0)}</Text>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <Text type="secondary">Belum ada detail customer untuk bucket ini.</Text>
          )}
        </Space>
      </Modal>
    </Card>
  )
}

function SalesOrderStatusCard({ status = {}, loading }) {
  const total = Number(status.total || 0)
  const repeatCustomers = Number(status.repeat_customers || 0)
  const activeCustomers = Number(status.active_customers || 0)
  const newCustomers = Number(status.new_customers || 0)
  const repeatPct = activeCustomers ? Math.round((repeatCustomers / activeCustomers) * 100) : 0
  const statusRows = [
    { key: 'open', label: 'Menunggu', value: Number(status.open || 0), color: orange },
    { key: 'process', label: 'Diproses', value: Number(status.process || 0), color: cyan },
    { key: 'received', label: 'Diterima', value: Number(status.received || 0), color: green },
    { key: 'closed', label: 'Ditutup', value: Number(status.closed || 0), color: '#8a93a6' },
  ]
  const receivedPct = total ? Math.round((Number(status.received || 0) / total) * 100) : 0
  const pendingTotal = Number(status.open || 0) + Number(status.process || 0)
  const activeSharePct = activeCustomers ? Math.round((newCustomers / activeCustomers) * 100) : 0

  return (
    <Card
      title={<span><FileDoneOutlined style={{ color: purple }} /> Status SO</span>}
      extra={<Text strong style={{ color: purple, fontSize: 13 }}>{formatNumber(total)} SO bulan ini</Text>}
      loading={loading}
      style={{
        borderRadius: 8,
        border: softBorder,
        height: '100%',
        overflow: 'hidden',
        background: `
          radial-gradient(circle at 92% 16%, ${purple}1f 0%, transparent 30%),
          linear-gradient(135deg, ${purple}0f 0%, #ffffff 48%, ${cyan}0d 100%)
        `,
      }}
      styles={{ body: { paddingTop: 16 } }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, alignItems: 'stretch' }}>
        <div
          style={{
            borderRadius: 8,
            padding: 16,
            background: 'linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(226,231,240,0.68), 0 12px 26px rgba(24,33,58,0.04)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center' }}>
            <div>
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Total sales order</Text>
              <div style={{ marginTop: 3, color: '#20243a', fontSize: 30, lineHeight: 1, fontWeight: 800 }}>
                {formatNumber(total)}
              </div>
            </div>
            <Progress
              type="circle"
              percent={receivedPct}
              size={82}
              strokeColor={green}
              trailColor="#edf2f7"
              format={value => <span style={{ color: green, fontWeight: 800, fontSize: 17 }}>{value}%</span>}
            />
          </div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: '10px 11px', borderRadius: 8, background: `${orange}0f`, boxShadow: `inset 0 0 0 1px ${orange}20` }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Belum selesai</Text>
              <div style={{ color: orange, fontSize: 18, fontWeight: 800 }}>{formatNumber(pendingTotal)} SO</div>
            </div>
            <div style={{ padding: '10px 11px', borderRadius: 8, background: `${green}0f`, boxShadow: `inset 0 0 0 1px ${green}20` }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Diterima</Text>
              <div style={{ color: green, fontSize: 18, fontWeight: 800 }}>{formatNumber(status.received || 0)} SO</div>
            </div>
          </div>
          <div style={{ height: 11, marginTop: 14, display: 'flex', overflow: 'hidden', borderRadius: 999, background: '#edf2f7' }}>
            {statusRows.map(row => {
              const pct = total ? (row.value / total) * 100 : 0
              return (
                <div
                  key={row.key}
                  title={`${row.label}: ${formatNumber(row.value)}`}
                  style={{
                    width: `${pct}%`,
                    minWidth: row.value ? 4 : 0,
                    background: row.color,
                  }}
                />
              )
            })}
          </div>
        </div>

        <div
          style={{
            borderRadius: 8,
            padding: 16,
            background: 'rgba(255,255,255,0.72)',
            boxShadow: 'inset 0 0 0 1px rgba(226,231,240,0.62)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <Text strong style={{ color: '#20243a' }}>Breakdown status</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>bulan ini</Text>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {statusRows.map(row => {
              const pct = total ? Math.round((row.value / total) * 100) : 0
              return (
                <div key={row.key}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#343a56' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, marginRight: 8, borderRadius: 999, background: row.color }} />
                      {row.label}
                    </Text>
                    <Text strong style={{ color: '#20243a' }}>{formatNumber(row.value)}</Text>
                    <Tag style={{ marginInlineEnd: 0, borderRadius: 999, border: `1px solid ${row.color}28`, color: row.color, background: `${row.color}12`, fontWeight: 700, minWidth: 44, textAlign: 'center' }}>
                      {pct}%
                    </Tag>
                  </div>
                  <div style={{ height: 6, marginTop: 6, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(pct, row.value ? 2 : 0)}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${row.color}, ${row.color}90)` }} />
                  </div>
                </div>
              )
            })}
            </Space>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              {[
                { label: 'Pelanggan aktif', value: formatNumber(activeCustomers), suffix: 'pelanggan', color: purple },
                { label: 'Repeat order', value: `${formatNumber(repeatCustomers)} (${repeatPct}%)`, suffix: 'pelanggan', color: cyan },
                { label: 'Pelanggan baru', value: `${formatNumber(newCustomers)} (${activeSharePct}%)`, suffix: 'dari aktif', color: green },
              ].map(item => (
                <div
                  key={item.label}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: `linear-gradient(135deg, ${item.color}10 0%, #ffffff 80%)`,
                    boxShadow: `inset 0 0 0 1px ${item.color}1f`,
                  }}
                >
                  <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>{item.label}</Text>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginTop: 2 }}>
                    <Text strong style={{ color: item.color, fontSize: 17 }}>{item.value}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{item.suffix}</Text>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

const monthShortLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function SalesmanYearlyPerformance({ rows = [], loading }) {
  const [selectedMonth, setSelectedMonth] = useState(null)
  const visibleRows = rows || []
  const year = visibleRows[0]?.year || dayjs().year()
  const totalActual = visibleRows.reduce((sum, row) => sum + Number(row.total_actual || 0), 0)
  const totalTarget = visibleRows.reduce((sum, row) => sum + Number(row.total_target || 0), 0)
  const totalPreviousActual = visibleRows.reduce((sum, row) => sum + Number(row.total_previous_actual || 0), 0)
  const totalAchievement = totalTarget ? Math.round((totalActual / totalTarget) * 100) : null
  const previousAchievement = totalPreviousActual ? Math.round((totalActual / totalPreviousActual) * 100) : (totalActual > 0 ? 100 : 0)
  const maxMonthAmount = Math.max(
    ...visibleRows.flatMap(row => (row.months || []).flatMap(month => [
      Number(month.actual || 0),
      Number(month.target || 0),
      Number(month.previous_actual || 0),
    ])),
    1,
  )

  return (
    <Card
      title={<span><UserOutlined style={{ color: purple }} /> Target vs Actual Salesman</span>}
      extra={<Text strong style={{ color: purple, fontSize: 13 }}>{year}</Text>}
      loading={loading}
      style={{
        borderRadius: 8,
        border: softBorder,
        overflow: 'hidden',
        background: `
          radial-gradient(circle at 92% 10%, ${purple}18 0%, transparent 28%),
          radial-gradient(circle at 12% 0%, ${cyan}12 0%, transparent 30%),
          linear-gradient(135deg, #ffffff 0%, #fbfdff 100%)
        `,
      }}
      styles={{ body: { paddingTop: 16 } }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
        {[
          { label: 'Actual YTD', value: formatCurrency(totalActual), color: cyan },
          { label: 'Target Input YTD', value: formatCurrency(totalTarget), color: purple },
          { label: `Actual ${year - 1} YTD`, value: formatCurrency(totalPreviousActual), color: orange },
          { label: 'Achv Input', value: totalAchievement === null ? 'Belum input' : `${totalAchievement}%`, color: totalAchievement === null ? '#64748b' : totalAchievement >= 100 ? green : red },
          { label: `Achv ${year - 1}`, value: `${previousAchievement}%`, color: previousAchievement >= 100 ? green : red },
        ].map(item => (
          <div
            key={item.label}
            style={{
              padding: '11px 12px',
              borderRadius: 8,
              background: `linear-gradient(135deg, ${item.color}10 0%, #ffffff 82%)`,
              boxShadow: `inset 0 0 0 1px ${item.color}1f`,
            }}
          >
            <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>{item.label}</Text>
            <Text strong style={{ color: item.color, fontSize: 16 }}>{item.value}</Text>
          </div>
        ))}
      </div>
      <Space wrap size={14} style={{ marginBottom: 12 }}>
        {[
          { label: 'Target input', color: purple },
          { label: `Actual ${year - 1}`, color: orange },
          { label: 'Actual', color: green },
        ].map(item => (
          <Text key={item.label} type="secondary" style={{ fontSize: 12 }}>
            <span style={{ display: 'inline-block', width: 9, height: 9, marginRight: 6, borderRadius: 999, background: item.color }} />
            {item.label}
          </Text>
        ))}
      </Space>

      <div style={{ display: 'grid', gap: 10, maxHeight: 430, overflowY: 'auto', paddingRight: 4 }}>
        {visibleRows.map((row, index) => {
          const achievement = Number(row.achievement_pct || 0)
          const achieved = achievement >= 100
          const gap = Number(row.gap_amount || 0)
          const achievementColor = achieved ? green : red
          const rowMaxMonthAmount = Math.max(
            ...(row.months || []).flatMap(month => [
              Number(month.actual || 0),
              Number(month.target || 0),
              Number(month.previous_actual || 0),
            ]),
            1,
          )
          return (
            <div
              key={row.id}
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: index === 0 ? `linear-gradient(135deg, ${cyan}0f 0%, #ffffff 80%)` : 'rgba(255,255,255,0.86)',
                boxShadow: `inset 0 0 0 1px ${index === 0 ? `${cyan}26` : 'rgba(226,231,240,0.72)'}, 0 10px 24px rgba(24,33,58,0.035)`,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 0.95fr) minmax(420px, 1.55fr)', gap: 16, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <Text strong ellipsis style={{ display: 'block', color: '#20243a', fontSize: 14 }}>{row.name || 'Tanpa Salesman'}</Text>
                  <Text type="secondary" style={{ display: 'block', marginTop: 2, fontSize: 11 }}>
                    {formatNumber(row.so_count)} SO · {formatCompactCurrency(row.qty)} qty
                  </Text>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                    <Tag style={{ marginInlineEnd: 0, borderRadius: 999, color: cyan, borderColor: `${cyan}30`, background: `${cyan}10`, fontWeight: 700 }}>
                      Actual Rp{formatCompactCurrency(row.total_actual)}
                    </Tag>
                    <Tag style={{ marginInlineEnd: 0, borderRadius: 999, color: purple, borderColor: `${purple}30`, background: `${purple}10`, fontWeight: 700 }}>
                      Target Input Rp{formatCompactCurrency(row.total_target)}
                    </Tag>
                    <Tag style={{ marginInlineEnd: 0, borderRadius: 999, color: orange, borderColor: `${orange}30`, background: `${orange}10`, fontWeight: 700 }}>
                      Actual {year - 1} Rp{formatCompactCurrency(row.total_previous_actual)}
                    </Tag>
                    <Tag style={{ marginInlineEnd: 0, borderRadius: 999, color: achieved ? green : red, borderColor: `${achieved ? green : red}30`, background: `${achieved ? green : red}10`, fontWeight: 700 }}>
                      {achieved ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {achievement}%
                    </Tag>
                  </div>
                  <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 11 }}>
                    Gap {gap >= 0 ? '+' : '-'}Rp{formatCompactCurrency(Math.abs(gap))}
                  </Text>
                </div>

                <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: `repeat(${Math.max((row.months || []).length, 1)}, minmax(46px, 1fr))`, gap: 8 }}>
                  {(row.months || []).map(month => {
                    const actual = Number(month.actual || 0)
                    const target = Number(month.target || 0)
                    const previousActual = Number(month.previous_actual || 0)
                    const actualPct = Math.max((actual / maxMonthAmount) * 100, actual ? 5 : 0)
                    const targetPct = Math.max((target / maxMonthAmount) * 100, target ? 5 : 0)
                    const previousPct = Math.max((previousActual / maxMonthAmount) * 100, previousActual ? 5 : 0)
                    const monthAchieved = target ? actual >= target : actual > 0
                    return (
                      <Tooltip
                        key={month.month}
                        title={`${monthShortLabels[month.month - 1]}: Actual ${formatCurrency(actual)} | Target Input ${formatCurrency(target)} | Actual ${year - 1} ${formatCurrency(previousActual)}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedMonth({ row, month })}
                          style={{
                            minWidth: 0,
                            width: '100%',
                            border: 0,
                            padding: 0,
                            background: 'transparent',
                            cursor: 'pointer',
                            textAlign: 'initial',
                          }}
                        >
                          <Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 10 }}>
                            {monthShortLabels[month.month - 1]}
                          </Text>
                          <div style={{ height: 54, display: 'flex', alignItems: 'end', justifyContent: 'center', gap: 4, marginTop: 4 }}>
                            <div style={{ width: 9, height: `${targetPct}%`, minHeight: target ? 4 : 0, borderRadius: 999, background: `${purple}55` }} />
                            <div style={{ width: 9, height: `${previousPct}%`, minHeight: previousActual ? 4 : 0, borderRadius: 999, background: `${orange}66` }} />
                            <div style={{ width: 12, height: `${actualPct}%`, minHeight: actual ? 4 : 0, borderRadius: 999, background: monthAchieved ? green : red, boxShadow: `0 0 12px ${monthAchieved ? green : red}30` }} />
                          </div>
                        </button>
                      </Tooltip>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
        {visibleRows.length === 0 && <Text type="secondary">Belum ada data salesman untuk tahun berjalan.</Text>}
      </div>

      <Modal
        open={Boolean(selectedMonth)}
        title={selectedMonth ? `${selectedMonth.row.name} - ${monthShortLabels[selectedMonth.month.month - 1]} ${year}` : ''}
        footer={null}
        width={1120}
        onCancel={() => setSelectedMonth(null)}
      >
        {selectedMonth && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Row gutter={[12, 12]}>
              {[
                { label: `Actual ${year}`, value: selectedMonth.month.actual, color: cyan },
                { label: `Actual ${year - 1}`, value: selectedMonth.month.previous_actual, color: orange },
                { label: 'Selisih YoY', value: Number(selectedMonth.month.actual || 0) - Number(selectedMonth.month.previous_actual || 0), color: Number(selectedMonth.month.actual || 0) >= Number(selectedMonth.month.previous_actual || 0) ? green : red },
                { label: `Growth vs ${year - 1}`, value: `${selectedMonth.month.previous_achievement_pct || 0}%`, color: Number(selectedMonth.month.previous_achievement_pct || 0) >= 100 ? green : red, isText: true },
              ].map(item => (
                <Col key={item.label} xs={24} sm={12} lg={6}>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: `linear-gradient(135deg, ${item.color}10 0%, #ffffff 82%)`,
                      boxShadow: `inset 0 0 0 1px ${item.color}24`,
                    }}
                  >
                    <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>{item.label}</Text>
                    <Text strong style={{ color: item.color, fontSize: 16 }}>
                      {item.isText ? item.value : formatCurrency(item.value)}
                    </Text>
                  </div>
                </Col>
              ))}
            </Row>

            <Row gutter={[12, 12]}>
              <Col xs={24} md={8}>
                <Statistic
                  title="Achv vs Target Input"
                  value={selectedMonth.month.achievement_pct || 0}
                  suffix="%"
                  valueStyle={{ color: Number(selectedMonth.month.achievement_pct || 0) >= 100 ? green : red }}
                />
              </Col>
              <Col xs={24} md={8}>
                <Statistic
                  title="Gap Target Input"
                  value={Number(selectedMonth.month.actual || 0) - Number(selectedMonth.month.target || 0)}
                  formatter={value => formatCurrency(value)}
                  valueStyle={{ color: Number(selectedMonth.month.actual || 0) >= Number(selectedMonth.month.target || 0) ? green : red, fontSize: 18 }}
                />
              </Col>
              <Col xs={24} md={8}>
                <Statistic
                  title="Customer Terbanding"
                  value={comparisonCustomers.length}
                  valueStyle={{ color: '#20243a', fontSize: 18 }}
                />
              </Col>
            </Row>

            <Divider style={{ margin: '2px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <Text strong style={{ color: '#20243a' }}>Analisa Customer & PO</Text>
                <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  {comparison?.period ? `${comparison.period.current_from} s/d ${comparison.period.current_to} dibanding ${comparison.period.previous_from} s/d ${comparison.period.previous_to}` : 'Memuat periode perbandingan'}
                </Text>
              </div>
              <Tag
                style={{
                  marginInlineEnd: 0,
                  borderRadius: 999,
                  color: Number(comparisonTotals.diff_amount || 0) >= 0 ? green : red,
                  borderColor: `${Number(comparisonTotals.diff_amount || 0) >= 0 ? green : red}30`,
                  background: `${Number(comparisonTotals.diff_amount || 0) >= 0 ? green : red}10`,
                  fontWeight: 800,
                }}
              >
                YoY {Number(comparisonTotals.growth_pct || 0)}% | {formatCurrency(comparisonTotals.diff_amount || 0)}
              </Tag>
            </div>

            <Table
              size="small"
              loading={comparisonLoading}
              rowKey={record => `${record.customer_no || 'no'}-${record.customer_name}`}
              dataSource={comparisonCustomers}
              pagination={{ pageSize: 6, size: 'small', showSizeChanger: false }}
              scroll={{ x: 980 }}
              expandable={{
                expandedRowRender: record => (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(record.pos || []).map((po, poIndex) => (
                      <div
                        key={`${po.year}-${po.so_no || poIndex}-${po.po_no || poIndex}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '70px minmax(120px, 1fr) minmax(140px, 1fr) minmax(90px, 0.8fr) minmax(120px, auto)',
                          gap: 10,
                          alignItems: 'center',
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: po.year === year ? `${cyan}0d` : `${orange}0d`,
                        }}
                      >
                        <Tag color={po.year === year ? 'cyan' : 'orange'} style={{ marginInlineEnd: 0 }}>{po.year}</Tag>
                        <Text style={{ fontSize: 12 }}><Text type="secondary">SO </Text>{po.so_no || '-'}</Text>
                        <Text style={{ fontSize: 12 }}><Text type="secondary">PO </Text>{po.po_no || '-'}</Text>
                        <Text style={{ fontSize: 12 }}>{po.so_date || '-'}</Text>
                        <Text strong style={{ fontSize: 12, textAlign: 'right' }}>{formatCurrency(po.amount || 0)}</Text>
                      </div>
                    ))}
                  </div>
                ),
              }}
              columns={[
                {
                  title: 'Customer',
                  dataIndex: 'customer_name',
                  width: 220,
                  fixed: 'left',
                  render: (value, record) => (
                    <div>
                      <Text strong ellipsis style={{ display: 'block', maxWidth: 200 }}>{value || 'Tanpa Customer'}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{record.customer_no || '-'}</Text>
                    </div>
                  ),
                },
                {
                  title: year,
                  dataIndex: 'current_amount',
                  width: 140,
                  align: 'right',
                  render: value => <Text strong style={{ color: cyan }}>{formatCurrency(value || 0)}</Text>,
                },
                {
                  title: year - 1,
                  dataIndex: 'previous_amount',
                  width: 140,
                  align: 'right',
                  render: value => <Text strong style={{ color: orange }}>{formatCurrency(value || 0)}</Text>,
                },
                {
                  title: 'Grafik',
                  width: 210,
                  render: (_, record) => {
                    const currentPct = Math.max((Number(record.current_amount || 0) / maxCustomerComparisonAmount) * 100, Number(record.current_amount || 0) ? 4 : 0)
                    const previousPct = Math.max((Number(record.previous_amount || 0) / maxCustomerComparisonAmount) * 100, Number(record.previous_amount || 0) ? 4 : 0)
                    return (
                      <div style={{ display: 'grid', gap: 5 }}>
                        <div style={{ height: 8, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                          <div style={{ width: `${currentPct}%`, height: '100%', borderRadius: 999, background: cyan }} />
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                          <div style={{ width: `${previousPct}%`, height: '100%', borderRadius: 999, background: orange }} />
                        </div>
                      </div>
                    )
                  },
                },
                {
                  title: 'Selisih',
                  dataIndex: 'diff_amount',
                  width: 145,
                  align: 'right',
                  render: value => {
                    const color = Number(value || 0) >= 0 ? green : red
                    return <Text strong style={{ color }}>{formatCurrency(value || 0)}</Text>
                  },
                },
                {
                  title: 'Growth',
                  dataIndex: 'growth_pct',
                  width: 95,
                  align: 'right',
                  render: value => {
                    const color = Number(value || 0) >= 0 ? green : red
                    return <Tag style={{ marginInlineEnd: 0, color, borderColor: `${color}30`, background: `${color}10`, fontWeight: 700 }}>{value || 0}%</Tag>
                  },
                },
                {
                  title: 'SO/PO',
                  width: 90,
                  align: 'right',
                  render: (_, record) => (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {Number(record.current_so_count || 0) + Number(record.previous_so_count || 0)} SO
                    </Text>
                  ),
                },
              ]}
            />
          </Space>
        )}
      </Modal>
    </Card>
  )
}

function SalesmanYearlyPerformancePreview({ rows = [], loading }) {
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const visibleRows = rows || []
  const year = visibleRows[0]?.year || dayjs().year()
  const totalActual = visibleRows.reduce((sum, row) => sum + Number(row.total_actual || 0), 0)
  const totalTarget = visibleRows.reduce((sum, row) => sum + Number(row.total_target || 0), 0)
  const totalPreviousActual = visibleRows.reduce((sum, row) => sum + Number(row.total_previous_actual || 0), 0)
  const totalAchievement = totalTarget ? Math.round((totalActual / totalTarget) * 100) : null
  const previousAchievement = totalPreviousActual ? Math.round((totalActual / totalPreviousActual) * 100) : (totalActual > 0 ? 100 : 0)
  const comparisonCustomers = comparison?.customers || []
  const comparisonTotals = comparison?.totals || {}
  const maxCustomerComparisonAmount = Math.max(
    ...comparisonCustomers.flatMap(customer => [
      Number(customer.current_amount || 0),
      Number(customer.previous_amount || 0),
    ]),
    1,
  )

  const handleExportComparison = async () => {
    if (!selectedMonth || comparisonLoading) return
    if (!comparisonCustomers.length) {
      message.warning('Belum ada data analisa customer & PO untuk diekspor')
      return
    }

    const salesmanName = selectedMonth.row?.name || 'Tanpa Salesman'
    const selectedMonthLabel = monthShortLabels[selectedMonth.month.month - 1]
    const filename = safeFilename(`Target Actual ${salesmanName} ${selectedMonthLabel} ${year}`)
    const summaryRows = [
      {
        salesman: salesmanName,
        bulan: selectedMonthLabel,
        tahun: year,
        actual: Number(selectedMonth.month.actual || 0),
        target_input: Number(selectedMonth.month.target || 0),
        actual_tahun_lalu: Number(selectedMonth.month.previous_actual || 0),
        achv_target_pct: Number(selectedMonth.month.achievement_pct || 0),
        growth_yoy_pct: Number(selectedMonth.month.previous_achievement_pct || 0),
        gap_target: Number(selectedMonth.month.actual || 0) - Number(selectedMonth.month.target || 0),
        gap_yoy: Number(selectedMonth.month.actual || 0) - Number(selectedMonth.month.previous_actual || 0),
        periode_current: comparison?.period ? `${comparison.period.current_from} s/d ${comparison.period.current_to}` : '',
        periode_tahun_lalu: comparison?.period ? `${comparison.period.previous_from} s/d ${comparison.period.previous_to}` : '',
      },
    ]
    const customerRows = comparisonCustomers.map(customer => ({
      customer_no: customer.customer_no || '',
      customer_name: customer.customer_name || 'Tanpa Customer',
      actual: Number(customer.current_amount || 0),
      actual_tahun_lalu: Number(customer.previous_amount || 0),
      selisih: Number(customer.diff_amount || 0),
      growth_pct: Number(customer.growth_pct || 0),
      so_current: Number(customer.current_so_count || 0),
      so_tahun_lalu: Number(customer.previous_so_count || 0),
      qty_current: Number(customer.current_qty || 0),
      qty_tahun_lalu: Number(customer.previous_qty || 0),
      status: customer.status || '',
    }))
    const detailRows = comparisonCustomers.flatMap(customer => (
      (customer.pos || []).map(po => ({
        customer_no: customer.customer_no || '',
        customer_name: customer.customer_name || 'Tanpa Customer',
        tahun: Number(po.year || 0),
        tanggal_so: po.so_date || '',
        no_so: po.so_no || '',
        no_po: po.po_no || '',
        qty: Number(po.qty || 0),
        nilai: Number(po.amount || 0),
      }))
    ))

    downloadWorkbookXLS([
      {
        name: 'Ringkasan',
        rows: summaryRows,
        columns: [
          { key: 'salesman', label: 'Salesman' },
          { key: 'bulan', label: 'Bulan' },
          { key: 'tahun', label: 'Tahun', type: 'number' },
          { key: 'actual', label: `Actual ${year}`, type: 'number' },
          { key: 'target_input', label: 'Target Input', type: 'number' },
          { key: 'actual_tahun_lalu', label: `Actual ${year - 1}`, type: 'number' },
          { key: 'achv_target_pct', label: 'Achv Target %', type: 'number' },
          { key: 'growth_yoy_pct', label: `Growth vs ${year - 1} %`, type: 'number' },
          { key: 'gap_target', label: 'Gap Target', type: 'number' },
          { key: 'gap_yoy', label: `Gap ${year - 1}`, type: 'number' },
          { key: 'periode_current', label: `Periode ${year}` },
          { key: 'periode_tahun_lalu', label: `Periode ${year - 1}` },
        ],
      },
      {
        name: 'Customer',
        rows: customerRows,
        columns: [
          { key: 'customer_no', label: 'Kode Customer' },
          { key: 'customer_name', label: 'Customer' },
          { key: 'actual', label: `Actual ${year}`, type: 'number' },
          { key: 'actual_tahun_lalu', label: `Actual ${year - 1}`, type: 'number' },
          { key: 'selisih', label: 'Selisih', type: 'number' },
          { key: 'growth_pct', label: 'Growth %', type: 'number' },
          { key: 'so_current', label: `SO ${year}`, type: 'number' },
          { key: 'so_tahun_lalu', label: `SO ${year - 1}`, type: 'number' },
          { key: 'qty_current', label: `Qty ${year}`, type: 'number' },
          { key: 'qty_tahun_lalu', label: `Qty ${year - 1}`, type: 'number' },
          { key: 'status', label: 'Status' },
        ],
      },
      {
        name: 'Detail SO PO',
        rows: detailRows,
        columns: [
          { key: 'customer_no', label: 'Kode Customer' },
          { key: 'customer_name', label: 'Customer' },
          { key: 'tahun', label: 'Tahun', type: 'number' },
          { key: 'tanggal_so', label: 'Tanggal SO', type: 'date' },
          { key: 'no_so', label: 'No SO' },
          { key: 'no_po', label: 'No PO' },
          { key: 'qty', label: 'Qty', type: 'number' },
          { key: 'nilai', label: 'Nilai', type: 'number' },
        ],
      },
    ], filename)

    try {
      await api.post('/api/audit/event', {
        action: 'export',
        module: 'dashboard',
        description: `Export target vs actual salesman ${salesmanName} ${selectedMonthLabel} ${year}`,
        metadata: {
          salesman_id: selectedMonth.row?.id,
          salesman_name: salesmanName,
          year,
          month: selectedMonth.month.month,
          customers: customerRows.length,
          details: detailRows.length,
        },
      })
    } catch {
      // Audit failure should not block the downloaded export.
    }

    message.success(`${customerRows.length} customer dan ${detailRows.length} detail SO/PO berhasil diekspor`)
  }

  useEffect(() => {
    if (!selectedMonth || !String(selectedMonth.row?.id || '').match(/^\d+$/)) {
      setComparison(null)
      return undefined
    }

    let cancelled = false
    setComparisonLoading(true)
    setComparison(null)
    api.get('/api/dashboard-salesman-month-comparison', {
      params: {
        salesman_id: selectedMonth.row.id,
        year,
        month: selectedMonth.month.month,
      },
    })
      .then(res => {
        if (!cancelled) setComparison(res.data || null)
      })
      .catch(err => {
        console.error('Gagal memuat perbandingan customer salesman:', err)
        if (!cancelled) setComparison(null)
      })
      .finally(() => {
        if (!cancelled) setComparisonLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedMonth, year])

  return (
    <Card
      title={<span><UserOutlined style={{ color: purple }} /> Target vs Actual Salesman</span>}
      extra={<Text strong style={{ color: purple, fontSize: 13 }}>{year}</Text>}
      loading={loading}
      style={{
        borderRadius: 8,
        border: softBorder,
        overflow: 'hidden',
        background: `
          radial-gradient(circle at 92% 10%, ${purple}14 0%, transparent 27%),
          radial-gradient(circle at 12% 0%, ${cyan}10 0%, transparent 30%),
          linear-gradient(135deg, #ffffff 0%, #fbfdff 100%)
        `,
      }}
      styles={{ body: { paddingTop: 16 } }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
        {[
          { label: 'Actual YTD', value: formatCurrency(totalActual), color: cyan },
          { label: 'Target Input YTD', value: formatCurrency(totalTarget), color: purple },
          { label: `Actual ${year - 1} YTD`, value: formatCurrency(totalPreviousActual), color: orange },
          { label: 'Achv Input', value: totalAchievement === null ? 'Belum input' : `${totalAchievement}%`, color: totalAchievement === null ? '#64748b' : totalAchievement >= 100 ? green : red },
          { label: `Achv ${year - 1}`, value: `${previousAchievement}%`, color: previousAchievement >= 100 ? green : red },
        ].map(item => (
          <div
            key={item.label}
            style={{
              padding: '11px 12px',
              borderRadius: 8,
              background: `linear-gradient(135deg, ${item.color}10 0%, #ffffff 82%)`,
              boxShadow: `inset 0 0 0 1px ${item.color}1f`,
            }}
          >
            <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>{item.label}</Text>
            <Text strong style={{ color: item.color, fontSize: 16 }}>{item.value}</Text>
          </div>
        ))}
      </div>

      <Space wrap size={14} style={{ marginBottom: 12 }}>
        {[
          { label: 'Target input', color: purple },
          { label: `Actual ${year - 1}`, color: orange },
          { label: 'Actual', color: green },
        ].map(item => (
          <Text key={item.label} type="secondary" style={{ fontSize: 12 }}>
            <span style={{ display: 'inline-block', width: 9, height: 9, marginRight: 6, borderRadius: 999, background: item.color }} />
            {item.label}
          </Text>
        ))}
      </Space>

      <div style={{ display: 'grid', gap: 10, maxHeight: 430, overflowY: 'auto', paddingRight: 4 }}>
        {visibleRows.map((row, index) => {
          const hasTarget = Number(row.total_target || 0) > 0
          const achievement = hasTarget ? Number(row.achievement_pct || 0) : null
          const achieved = hasTarget && achievement >= 100
          const achievementColor = !hasTarget ? '#64748b' : achieved ? green : red
          const previousAchievement = Number(row.previous_achievement_pct || 0)
          const previousAchieved = previousAchievement >= 100
          const previousAchievementColor = previousAchieved ? green : red
          const gap = Number(row.gap_amount || 0)
          const rowMaxMonthAmount = Math.max(
            ...(row.months || []).flatMap(month => [
              Number(month.actual || 0),
              Number(month.target || 0),
              Number(month.previous_actual || 0),
            ]),
            1,
          )

          return (
            <div
              key={row.id}
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: index === 0 ? `linear-gradient(135deg, ${cyan}0f 0%, #ffffff 80%)` : 'rgba(255,255,255,0.86)',
                boxShadow: `inset 0 0 0 1px ${index === 0 ? `${cyan}26` : 'rgba(226,231,240,0.72)'}, 0 10px 24px rgba(24,33,58,0.035)`,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 0.95fr) minmax(420px, 1.55fr)', gap: 16, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <Text strong ellipsis style={{ display: 'block', color: '#20243a', fontSize: 14 }}>{row.name || 'Tanpa Salesman'}</Text>
                      <Text type="secondary" style={{ display: 'block', marginTop: 2, fontSize: 11 }}>
                        {formatNumber(row.so_count)} SO | {formatCompactCurrency(row.qty)} qty
                      </Text>
                    </div>
                    <Space size={6} wrap style={{ justifyContent: 'flex-end' }}>
                      <Tag style={{ marginInlineEnd: 0, borderRadius: 999, color: achievementColor, borderColor: `${achievementColor}30`, background: `${achievementColor}10`, fontWeight: 800 }}>
                        {hasTarget
                          ? <>{achieved ? <ArrowUpOutlined /> : <ArrowDownOutlined />} Achv Target {achievement}%</>
                          : 'Target belum diinput'}
                      </Tag>
                      <Tag style={{ marginInlineEnd: 0, borderRadius: 999, color: previousAchievementColor, borderColor: `${previousAchievementColor}30`, background: `${previousAchievementColor}10`, fontWeight: 800 }}>
                        {previousAchieved ? <ArrowUpOutlined /> : <ArrowDownOutlined />} Vs {year - 1} {previousAchievement}%
                      </Tag>
                    </Space>
                  </div>

                  <Progress
                    percent={hasTarget ? Math.min(Math.max(achievement, 0), 100) : 0}
                    showInfo={false}
                    strokeColor={achievementColor}
                    trailColor="#edf2f7"
                    style={{ margin: '8px 0 2px' }}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7, marginTop: 9 }}>
                    {[
                      { label: 'Actual', value: `Rp${formatCompactCurrency(row.total_actual)}`, color: cyan },
                      { label: 'Target', value: `Rp${formatCompactCurrency(row.total_target)}`, color: purple },
                      { label: `LY ${year - 1}`, value: `Rp${formatCompactCurrency(row.total_previous_actual)}`, color: orange },
                    ].map(item => (
                      <div
                        key={item.label}
                        style={{
                          minWidth: 0,
                          padding: '7px 8px',
                          borderRadius: 8,
                          background: `${item.color}0d`,
                          boxShadow: `inset 0 0 0 1px ${item.color}1f`,
                        }}
                      >
                        <Text type="secondary" style={{ display: 'block', fontSize: 10, lineHeight: 1.15 }}>{item.label}</Text>
                        <Text strong ellipsis style={{ display: 'block', color: item.color, fontSize: 12, lineHeight: 1.35 }}>{item.value}</Text>
                      </div>
                    ))}
                  </div>

                  <Text type="secondary" style={{ display: 'block', marginTop: 7, fontSize: 11 }}>
                    Gap {gap >= 0 ? '+' : '-'}Rp{formatCompactCurrency(Math.abs(gap))}
                  </Text>
                </div>

                <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: `repeat(${Math.max((row.months || []).length, 1)}, minmax(46px, 1fr))`, gap: 8 }}>
                  {(row.months || []).map(month => {
                    const actual = Number(month.actual || 0)
                    const target = Number(month.target || 0)
                    const previousActual = Number(month.previous_actual || 0)
                    const actualPct = Math.max((actual / rowMaxMonthAmount) * 100, actual ? 8 : 0)
                    const targetPct = Math.max((target / rowMaxMonthAmount) * 100, target ? 8 : 0)
                    const previousPct = Math.max((previousActual / rowMaxMonthAmount) * 100, previousActual ? 8 : 0)
                    const monthAchieved = target ? actual >= target : actual > 0
                    const monthColor = monthAchieved ? green : red

                    return (
                      <Tooltip
                        key={month.month}
                        title={`${monthShortLabels[month.month - 1]}: Actual ${formatCurrency(actual)} | Target Input ${formatCurrency(target)} | Actual ${year - 1} ${formatCurrency(previousActual)}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedMonth({ row, month })}
                          style={{
                            minWidth: 0,
                            width: '100%',
                            border: 0,
                            padding: 0,
                            background: 'transparent',
                            cursor: 'pointer',
                            textAlign: 'initial',
                          }}
                        >
                          <Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 10 }}>
                            {monthShortLabels[month.month - 1]}
                          </Text>
                          <div style={{ height: 60, display: 'flex', alignItems: 'end', justifyContent: 'center', gap: 4, marginTop: 4, padding: '0 2px 1px', borderRadius: 8, background: '#f8fafc' }}>
                            <div style={{ width: 8, height: `${targetPct}%`, minHeight: target ? 5 : 0, borderRadius: 999, background: `${purple}58` }} />
                            <div style={{ width: 8, height: `${previousPct}%`, minHeight: previousActual ? 5 : 0, borderRadius: 999, background: `${orange}68` }} />
                            <div style={{ width: 12, height: `${actualPct}%`, minHeight: actual ? 5 : 0, borderRadius: 999, background: monthColor, boxShadow: `0 0 12px ${monthColor}30` }} />
                          </div>
                          <Text strong style={{ display: 'block', marginTop: 3, textAlign: 'center', color: monthColor, fontSize: 10, lineHeight: 1.1 }}>
                            {month.achievement_pct || 0}%
                          </Text>
                        </button>
                      </Tooltip>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
        {visibleRows.length === 0 && <Text type="secondary">Belum ada data salesman untuk tahun berjalan.</Text>}
      </div>

      <Modal
        open={Boolean(selectedMonth)}
        title={selectedMonth ? `${selectedMonth.row.name} - ${monthShortLabels[selectedMonth.month.month - 1]} ${year}` : ''}
        footer={null}
        width={1120}
        onCancel={() => setSelectedMonth(null)}
      >
        {selectedMonth && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {[
              { label: 'Actual', value: selectedMonth.month.actual, color: cyan },
              { label: 'Target Input', value: selectedMonth.month.target, color: purple },
              { label: `Actual ${year - 1}`, value: selectedMonth.month.previous_actual, color: orange },
            ].map(item => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: `linear-gradient(135deg, ${item.color}10 0%, #ffffff 82%)`,
                  boxShadow: `inset 0 0 0 1px ${item.color}24`,
                }}
              >
                <Text type="secondary">{item.label}</Text>
                <Text strong style={{ color: item.color }}>{formatCurrency(item.value)}</Text>
              </div>
            ))}
            <Divider style={{ margin: '4px 0' }} />
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Statistic
                  title="Achv vs Target Input"
                  value={selectedMonth.month.achievement_pct || 0}
                  suffix="%"
                  valueStyle={{ color: Number(selectedMonth.month.achievement_pct || 0) >= 100 ? green : red }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title={`Achv vs ${year - 1}`}
                  value={selectedMonth.month.previous_achievement_pct || 0}
                  suffix="%"
                  valueStyle={{ color: Number(selectedMonth.month.previous_achievement_pct || 0) >= 100 ? green : red }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Gap Target Input"
                  value={Number(selectedMonth.month.actual || 0) - Number(selectedMonth.month.target || 0)}
                  formatter={value => formatCurrency(value)}
                  valueStyle={{ color: Number(selectedMonth.month.actual || 0) >= Number(selectedMonth.month.target || 0) ? green : red, fontSize: 18 }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title={`Gap ${year - 1}`}
                  value={Number(selectedMonth.month.actual || 0) - Number(selectedMonth.month.previous_actual || 0)}
                  formatter={value => formatCurrency(value)}
                  valueStyle={{ color: Number(selectedMonth.month.actual || 0) >= Number(selectedMonth.month.previous_actual || 0) ? green : red, fontSize: 18 }}
                />
              </Col>
            </Row>
            <Divider style={{ margin: '2px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <Text strong style={{ color: '#20243a' }}>Analisa Customer & PO</Text>
                <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  {comparison?.period ? `${comparison.period.current_from} s/d ${comparison.period.current_to} dibanding ${comparison.period.previous_from} s/d ${comparison.period.previous_to}` : 'Memuat periode perbandingan'}
                </Text>
              </div>
              <Space wrap size={8}>
                <Tag
                  style={{
                    marginInlineEnd: 0,
                    borderRadius: 999,
                    color: Number(comparisonTotals.diff_amount || 0) >= 0 ? green : red,
                    borderColor: `${Number(comparisonTotals.diff_amount || 0) >= 0 ? green : red}30`,
                    background: `${Number(comparisonTotals.diff_amount || 0) >= 0 ? green : red}10`,
                    fontWeight: 800,
                  }}
                >
                  YoY {Number(comparisonTotals.growth_pct || 0)}% | {formatCurrency(comparisonTotals.diff_amount || 0)}
                </Tag>
                <Button
                  icon={<FileExcelOutlined />}
                  size="small"
                  onClick={handleExportComparison}
                  loading={comparisonLoading}
                  disabled={!comparisonCustomers.length}
                >
                  Export Excel
                </Button>
              </Space>
            </div>
            <Table
              size="small"
              loading={comparisonLoading}
              rowKey={record => `${record.customer_no || 'no'}-${record.customer_name}`}
              dataSource={comparisonCustomers}
              pagination={{ pageSize: 6, size: 'small', showSizeChanger: false }}
              scroll={{ x: 980 }}
              expandable={{
                expandedRowRender: record => (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(record.pos || []).map((po, poIndex) => (
                      <div
                        key={`${po.year}-${po.so_no || poIndex}-${po.po_no || poIndex}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '70px minmax(120px, 1fr) minmax(140px, 1fr) minmax(90px, 0.8fr) minmax(120px, auto)',
                          gap: 10,
                          alignItems: 'center',
                          padding: '8px 10px',
                          borderRadius: 8,
                          background: po.year === year ? `${cyan}0d` : `${orange}0d`,
                        }}
                      >
                        <Tag color={po.year === year ? 'cyan' : 'orange'} style={{ marginInlineEnd: 0 }}>{po.year}</Tag>
                        <Text style={{ fontSize: 12 }}><Text type="secondary">SO </Text>{po.so_no || '-'}</Text>
                        <Text style={{ fontSize: 12 }}><Text type="secondary">PO </Text>{po.po_no || '-'}</Text>
                        <Text style={{ fontSize: 12 }}>{po.so_date || '-'}</Text>
                        <Text strong style={{ fontSize: 12, textAlign: 'right' }}>{formatCurrency(po.amount || 0)}</Text>
                      </div>
                    ))}
                  </div>
                ),
              }}
              columns={[
                {
                  title: 'Customer',
                  dataIndex: 'customer_name',
                  width: 220,
                  fixed: 'left',
                  render: (value, record) => (
                    <div>
                      <Text strong ellipsis style={{ display: 'block', maxWidth: 200 }}>{value || 'Tanpa Customer'}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{record.customer_no || '-'}</Text>
                    </div>
                  ),
                },
                {
                  title: year,
                  dataIndex: 'current_amount',
                  width: 140,
                  align: 'right',
                  render: value => <Text strong style={{ color: cyan }}>{formatCurrency(value || 0)}</Text>,
                },
                {
                  title: year - 1,
                  dataIndex: 'previous_amount',
                  width: 140,
                  align: 'right',
                  render: value => <Text strong style={{ color: orange }}>{formatCurrency(value || 0)}</Text>,
                },
                {
                  title: 'Grafik',
                  width: 210,
                  render: (_, record) => {
                    const currentPct = Math.max((Number(record.current_amount || 0) / maxCustomerComparisonAmount) * 100, Number(record.current_amount || 0) ? 4 : 0)
                    const previousPct = Math.max((Number(record.previous_amount || 0) / maxCustomerComparisonAmount) * 100, Number(record.previous_amount || 0) ? 4 : 0)
                    return (
                      <div style={{ display: 'grid', gap: 5 }}>
                        <div style={{ height: 8, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                          <div style={{ width: `${currentPct}%`, height: '100%', borderRadius: 999, background: cyan }} />
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                          <div style={{ width: `${previousPct}%`, height: '100%', borderRadius: 999, background: orange }} />
                        </div>
                      </div>
                    )
                  },
                },
                {
                  title: 'Selisih',
                  dataIndex: 'diff_amount',
                  width: 145,
                  align: 'right',
                  render: value => {
                    const color = Number(value || 0) >= 0 ? green : red
                    return <Text strong style={{ color }}>{formatCurrency(value || 0)}</Text>
                  },
                },
                {
                  title: 'Growth',
                  dataIndex: 'growth_pct',
                  width: 95,
                  align: 'right',
                  render: value => {
                    const color = Number(value || 0) >= 0 ? green : red
                    return <Tag style={{ marginInlineEnd: 0, color, borderColor: `${color}30`, background: `${color}10`, fontWeight: 700 }}>{value || 0}%</Tag>
                  },
                },
                {
                  title: 'SO/PO',
                  width: 90,
                  align: 'right',
                  render: (_, record) => (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {Number(record.current_so_count || 0) + Number(record.previous_so_count || 0)} SO
                    </Text>
                  ),
                },
              ]}
            />
          </Space>
        )}
      </Modal>
    </Card>
  )
}

const cityLatLngMap = {
  jakarta: [-6.2088, 106.8456],
  'jakarta barat': [-6.1683, 106.7588],
  'jakarta pusat': [-6.1865, 106.8341],
  'jakarta selatan': [-6.2615, 106.8106],
  'jakarta timur': [-6.2250, 106.9004],
  'jakarta utara': [-6.1384, 106.8637],
  bekasi: [-6.2383, 106.9756],
  'kab.bekasi': [-6.2474, 107.1485],
  bogor: [-6.5971, 106.8060],
  depok: [-6.4025, 106.7942],
  tangerang: [-6.1783, 106.6319],
  'kab tangerang': [-6.1870, 106.4870],
  cilegon: [-6.0025, 106.0111],
  bandung: [-6.9175, 107.6191],
  'bandung barat': [-6.8332, 107.4832],
  karawang: [-6.3054, 107.2977],
  sukabumi: [-6.9277, 106.9290],
  cirebon: [-6.7320, 108.5523],
  semarang: [-6.9667, 110.4167],
  kudus: [-6.8048, 110.8405],
  pati: [-6.7559, 111.0380],
  solo: [-7.5755, 110.8243],
  surakarta: [-7.5755, 110.8243],
  yogyakarta: [-7.7956, 110.3695],
  surabaya: [-7.2575, 112.7521],
  gresik: [-7.1567, 112.6555],
  sidoarjo: [-7.4498, 112.7183],
  malang: [-7.9666, 112.6326],
  pasuruan: [-7.6453, 112.9075],
  medan: [3.5952, 98.6722],
  batam: [1.0456, 104.0305],
  riau: [0.2933, 101.7068],
  pekanbaru: [0.5071, 101.4478],
  padang: [-0.9471, 100.4172],
  palembang: [-2.9761, 104.7754],
  lampung: [-5.3971, 105.2668],
  balikpapan: [-1.2379, 116.8529],
  'balikpapan timur': [-1.2290, 116.9400],
  samarinda: [-0.4948, 117.1436],
  berau: [2.1551, 117.4970],
  'takarang barat': [3.3000, 117.5800],
  'takaran barat': [3.3000, 117.5800],
  'kalimantan utara': [3.0731, 116.0414],
  'kalimantan timur': [0.5387, 116.4194],
  'kalimantan selatan': [-3.0926, 115.2838],
  kalimantan: [-0.7893, 113.9213],
  banjarmasin: [-3.3186, 114.5944],
  pontianak: [-0.0263, 109.3425],
  'dki jakarta': [-6.2088, 106.8456],
  'jawa barat': [-6.9175, 107.6191],
  'jawa tengah': [-7.1500, 110.1400],
  'jawa timur': [-7.5361, 112.2384],
  banten: [-6.4058, 106.0640],
  'sumatera selatan': [-3.3194, 103.9144],
  makassar: [-5.1477, 119.4327],
  manado: [1.4748, 124.8421],
  kendari: [-3.9985, 122.5120],
  ambon: [-3.6554, 128.1908],
  jayapura: [-2.5916, 140.6690],
}

const normalizeCityName = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')

function fallbackCityLatLng(row) {
  const text = normalizeCityName(`${row.city || ''} ${row.province || ''}`)
  let hash = 0
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) % 997
  const province = normalizeCityName(row.province || row.city || '')
  const zones = province.includes('kalimantan') ? [[-1.0, 109.5, 2.8, 117.8]]
    : province.includes('sumatera') || province.includes('riau') ? [[-4.8, 96.0, 3.8, 104.8]]
      : province.includes('sulawesi') ? [[-5.8, 119.0, 1.8, 124.8]]
        : province.includes('papua') ? [[-6.0, 132.0, -1.5, 141.0]]
          : province.includes('jawa') || province.includes('banten') || province.includes('jakarta') ? [[-8.2, 105.5, -5.8, 114.8]]
            : [
              [-4.8, 96.0, 3.8, 104.8],
              [-8.2, 105.5, -5.8, 114.8],
              [-1.0, 109.5, 2.8, 117.8],
              [-5.8, 119.0, 1.8, 124.8],
              [-6.0, 132.0, -1.5, 141.0],
            ]
  const zone = zones[hash % zones.length]
  return [
    zone[0] + (hash % 100) / 100 * (zone[2] - zone[0]),
    zone[1] + (Math.floor(hash / 10) % 100) / 100 * (zone[3] - zone[1]),
  ]
}

function getMapLatLng(row) {
  const joined = `${row.province || ''} ${row.city || ''}`
  const normalized = normalizeCityName(joined)
  const matchedKey = Object.keys(cityLatLngMap)
    .sort((a, b) => b.length - a.length)
    .find(key => normalized.includes(key))
  return matchedKey ? cityLatLngMap[matchedKey] : fallbackCityLatLng(row)
}

const indonesiaMapBounds = {
  minLat: -11.4,
  maxLat: 6.2,
  minLng: 94.2,
  maxLng: 141.6,
}

const mapTileZoom = 5
const tileSize = 256

function lngToTileX(lng, zoom = mapTileZoom) {
  return ((lng + 180) / 360) * (2 ** zoom)
}

function latToTileY(lat, zoom = mapTileZoom) {
  const latRad = lat * Math.PI / 180
  return (1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2 * (2 ** zoom)
}

function getMapTiles() {
  const minX = Math.floor(lngToTileX(indonesiaMapBounds.minLng))
  const maxX = Math.floor(lngToTileX(indonesiaMapBounds.maxLng))
  const minY = Math.floor(latToTileY(indonesiaMapBounds.maxLat))
  const maxY = Math.floor(latToTileY(indonesiaMapBounds.minLat))
  const tiles = []
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push({ x, y, key: `${x}-${y}` })
    }
  }
  return { tiles, minX, minY, width: (maxX - minX + 1) * tileSize, height: (maxY - minY + 1) * tileSize }
}

function latLngToMapPoint(lat, lng, tileMeta) {
  return {
    x: (lngToTileX(lng) - tileMeta.minX) * tileSize,
    y: (latToTileY(lat) - tileMeta.minY) * tileSize,
  }
}

function CustomerCityMap({ rows = [], loading }) {
  const [zoomScale, setZoomScale] = useState(1.8)
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 })
  const [isDraggingMap, setIsDraggingMap] = useState(false)
  const [selectedProvince, setSelectedProvince] = useState(null)
  const svgRef = useRef(null)
  const dragRef = useRef({ dragging: false, x: 0, y: 0 })
  const visibleRows = rows || []
  const filledRows = visibleRows.filter(row => !row.is_empty)
  const emptyRow = visibleRows.find(row => row.is_empty)
  const maxCount = Math.max(...filledRows.map(row => Number(row.count || 0)), 1)
  const total = visibleRows.reduce((sum, row) => sum + Number(row.count || 0), 0)
  const totalFilled = filledRows.reduce((sum, row) => sum + Number(row.count || 0), 0)
  const tileMeta = useMemo(getMapTiles, [])
  const labelOffsets = [[10, -30], [12, 18], [-88, -26], [-92, 14], [12, -8], [-92, -4]]
  const centerX = tileMeta.width / 2
  const centerY = tileMeta.height / 2

  const handleMapPointerDown = event => {
    if (!svgRef.current) return
    dragRef.current = { dragging: true, x: event.clientX, y: event.clientY }
    setIsDraggingMap(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleMapPointerMove = event => {
    if (!dragRef.current.dragging || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const dx = (event.clientX - dragRef.current.x) * (tileMeta.width / rect.width)
    const dy = (event.clientY - dragRef.current.y) * (tileMeta.height / rect.height)
    dragRef.current = { dragging: true, x: event.clientX, y: event.clientY }
    setMapPan(current => ({ x: current.x + dx, y: current.y + dy }))
  }

  const handleMapPointerUp = event => {
    dragRef.current = { dragging: false, x: 0, y: 0 }
    setIsDraggingMap(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const updateZoom = nextZoom => {
    setZoomScale(Number(Math.min(2.6, Math.max(0.8, nextZoom)).toFixed(2)))
  }

  const handleMapWheel = event => {
    if (!svgRef.current) return
    event.preventDefault()
    const rect = svgRef.current.getBoundingClientRect()
    const pointer = {
      x: (event.clientX - rect.left) * (tileMeta.width / rect.width),
      y: (event.clientY - rect.top) * (tileMeta.height / rect.height),
    }
    const factor = event.deltaY < 0 ? 1.14 : 0.88
    const nextZoom = Math.min(2.6, Math.max(0.8, zoomScale * factor))
    const worldPoint = {
      x: centerX + ((pointer.x - centerX - mapPan.x) / zoomScale),
      y: centerY + ((pointer.y - centerY - mapPan.y) / zoomScale),
    }
    setZoomScale(Number(nextZoom.toFixed(2)))
    setMapPan({
      x: pointer.x - centerX - (nextZoom * (worldPoint.x - centerX)),
      y: pointer.y - centerY - (nextZoom * (worldPoint.y - centerY)),
    })
  }

  return (
    <Card
      title={<span><EnvironmentOutlined style={{ color: cyan }} /> Sebaran Provinsi Customer</span>}
      extra={(
        <Space size={8}>
          <Button size="small" onClick={() => updateZoom(zoomScale - 0.2)}>-</Button>
          <Text type="secondary" style={{ minWidth: 44, textAlign: 'center', fontSize: 12 }}>{Math.round(zoomScale * 100)}%</Text>
          <Button size="small" onClick={() => updateZoom(zoomScale + 0.2)}>+</Button>
          <Text strong style={{ color: cyan, fontSize: 13 }}>{formatNumber(totalFilled)} customer terpetakan</Text>
        </Space>
      )}
      loading={loading}
      style={{
        borderRadius: 8,
        border: softBorder,
        overflow: 'hidden',
        background: `
          radial-gradient(circle at 88% 8%, ${cyan}18 0%, transparent 26%),
          linear-gradient(135deg, #ffffff 0%, #fbfdff 100%)
        `,
      }}
      styles={{ body: { paddingTop: 14 } }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div
          style={{
            minWidth: 0,
            borderRadius: 8,
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #eef8fb 0%, #f8fcff 48%, #f1faf5 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(17,183,216,0.12), 0 16px 34px rgba(27,53,78,0.08)',
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${tileMeta.width} ${tileMeta.height}`}
            role="img"
            aria-label="Sebaran kota customer"
            onPointerDown={handleMapPointerDown}
            onPointerMove={handleMapPointerMove}
            onPointerUp={handleMapPointerUp}
            onPointerCancel={handleMapPointerUp}
            onWheel={handleMapWheel}
            style={{
              display: 'block',
              width: '100%',
              height: 430,
              cursor: isDraggingMap ? 'grabbing' : 'grab',
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            <defs>
              <linearGradient id="customerMapWater" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#eef9fb" />
                <stop offset="48%" stopColor="#f8fcff" />
                <stop offset="100%" stopColor="#f1faf5" />
              </linearGradient>
              <filter id="customerMapMarkerShadow" x="-80%" y="-80%" width="260%" height="260%">
                <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#0f3f52" floodOpacity="0.16" />
              </filter>
              <filter id="customerMapLabelShadow" x="-30%" y="-60%" width="160%" height="220%">
                <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#1f3444" floodOpacity="0.13" />
              </filter>
            </defs>
            <rect width={tileMeta.width} height={tileMeta.height} fill="url(#customerMapWater)" />
            <g transform={`translate(${centerX + mapPan.x} ${centerY + mapPan.y}) scale(${zoomScale}) translate(${-centerX} ${-centerY})`}>
              {tileMeta.tiles.map(tile => (
                <image
                  key={tile.key}
                  href={`https://tile.openstreetmap.org/${mapTileZoom}/${tile.x}/${tile.y}.png`}
                  x={(tile.x - tileMeta.minX) * tileSize}
                  y={(tile.y - tileMeta.minY) * tileSize}
                  width={tileSize}
                  height={tileSize}
                  opacity="0.56"
                  style={{ filter: 'saturate(0.34) contrast(0.78) brightness(1.18) hue-rotate(10deg)' }}
                />
              ))}
              <rect width={tileMeta.width} height={tileMeta.height} fill="#ffffff" opacity="0.24" />
              <rect width={tileMeta.width} height={tileMeta.height} fill={cyan} opacity="0.025" />
              <path
                d={`M ${tileMeta.width * 0.08} ${tileMeta.height * 0.18} C ${tileMeta.width * 0.28} ${tileMeta.height * 0.1}, ${tileMeta.width * 0.44} ${tileMeta.height * 0.24}, ${tileMeta.width * 0.64} ${tileMeta.height * 0.17} S ${tileMeta.width * 0.9} ${tileMeta.height * 0.18}, ${tileMeta.width * 0.96} ${tileMeta.height * 0.08}`}
                fill="none"
                stroke="#ffffff"
                strokeWidth="28"
                strokeLinecap="round"
                opacity="0.2"
              />
            {filledRows.slice(0, 65).map((row, index) => {
              const [lat, lng] = getMapLatLng(row)
              const { x, y } = latLngToMapPoint(lat, lng, tileMeta)
              const count = Number(row.count || 0)
              const radius = 6 + Math.sqrt(count / maxCount) * 17
              const color = index < 4 ? cyan : index < 12 ? '#62b6cb' : purple
              const showLabel = index < 10 || normalizeCityName(row.province).includes('kalimantan')
              const offset = labelOffsets[index % labelOffsets.length]
              return (
                <g
                  key={`${row.province}-${index}`}
                  onPointerDown={event => event.stopPropagation()}
                  onPointerUp={event => event.stopPropagation()}
                  onClick={event => {
                    event.stopPropagation()
                    setSelectedProvince(row)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={x} cy={y} r={radius + 13} fill={color} opacity="0.10" />
                  <circle cx={x} cy={y} r={radius + 6} fill={color} opacity="0.13" />
                  <circle cx={x} cy={y} r={radius} fill="#ffffff" stroke={color} strokeWidth="2.2" opacity="0.96" filter="url(#customerMapMarkerShadow)" />
                  <circle cx={x} cy={y} r={Math.max(radius - 7, 4)} fill={color} opacity="0.76" />
                  <circle cx={x - radius * 0.24} cy={y - radius * 0.24} r={Math.max(radius * 0.18, 2)} fill="#ffffff" opacity="0.7" />
                  {showLabel && (
                    <g>
                      <line x1={x} y1={y} x2={x + offset[0] - 4} y2={y + offset[1] - 4} stroke="#466b78" strokeWidth="1.3" opacity="0.28" />
                      <rect
                        x={x + offset[0] - 3}
                        y={y + offset[1] - 20}
                        width={Math.min(String(row.city || '').length * 10 + 54, 190)}
                        height="28"
                        rx="7"
                        fill="#ffffff"
                        opacity="0.82"
                        filter="url(#customerMapLabelShadow)"
                      />
                      <text x={x + offset[0] + 8} y={y + offset[1] - 2} fill="#31515d" fontSize="15" fontWeight="650">
                        {String(row.province || '').slice(0, 16)}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
            </g>
            <rect x={tileMeta.width - 382} y={tileMeta.height - 48} width="360" height="34" rx="8" fill="#ffffff" opacity="0.54" />
            <text x={tileMeta.width - 362} y={tileMeta.height - 26} fill="#60727f" fontSize="16" fontWeight="600" opacity="0.76">
              Map data © OpenStreetMap contributors
            </text>
          </svg>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {filledRows.slice(0, 12).map((row, index) => {
            const count = Number(row.count || 0)
            const color = index < 3 ? cyan : purple
            return (
              <Tooltip
                key={`${row.province}-${index}`}
                title={`${row.province}: ${formatNumber(count)} customer. Klik untuk lihat kota.`}
              >
                <Tag
                  onClick={() => setSelectedProvince(row)}
                  style={{
                    marginInlineEnd: 0,
                    borderRadius: 999,
                    padding: '4px 9px',
                    borderColor: `${color}32`,
                    background: `${color}10`,
                    color,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 8px 18px rgba(25,44,64,0.04)',
                    transition: 'transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
                  }}
                >
                  <span style={{ maxWidth: 160, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>
                    {row.province}
                  </span>
                  <span style={{ marginLeft: 6 }}>{formatNumber(count)}</span>
                </Tag>
              </Tooltip>
            )
          })}
          {!filledRows.length && <Text type="secondary">Belum ada data kota customer.</Text>}
          {emptyRow && (
            <Tag
              style={{
                marginInlineEnd: 0,
                borderRadius: 999,
                padding: '4px 9px',
                borderColor: 'rgba(148,163,184,0.28)',
                background: '#f8fafc',
                color: '#697087',
                fontWeight: 700,
              }}
            >
              Belum diinput {formatNumber(emptyRow.count)}
            </Tag>
          )}
        </div>
      </div>
      <Modal
        open={Boolean(selectedProvince)}
        title={selectedProvince ? `Kota di ${selectedProvince.province}` : ''}
        footer={null}
        onCancel={() => setSelectedProvince(null)}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {(selectedProvince?.cities || []).map(city => (
            <div
              key={city.city}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '9px 11px',
                borderRadius: 8,
                background: city.is_empty ? '#f8fafc' : `linear-gradient(135deg, ${cyan}10 0%, #ffffff 82%)`,
                boxShadow: `inset 0 0 0 1px ${city.is_empty ? 'rgba(148,163,184,0.18)' : `${cyan}1f`}, 0 8px 18px rgba(25,44,64,0.035)`,
              }}
            >
              <Text strong={Boolean(!city.is_empty)} type={city.is_empty ? 'secondary' : undefined}>{city.city}</Text>
              <Text strong style={{ color: city.is_empty ? '#697087' : cyan }}>{formatNumber(city.count)}</Text>
            </div>
          ))}
        </Space>
      </Modal>
    </Card>
  )
}

const dailyReportEmpty = {
  rows: [],
  marketing_summary: [],
  quantity_summary: [],
  totals: { total_so: 0, total_faktur: 0, quantity: {} },
  category_keys: ['EJF', 'GPP', 'OTM', 'SWG', 'NON GTE'],
}

function SalesDailyReport({ dateRange }) {
  const [report, setReport] = useState(dailyReportEmpty)
  const [loading, setLoading] = useState(false)
  const today = dayjs()

  useEffect(() => {
    let ignore = false

    const fetchReport = async () => {
      try {
        setLoading(true)
        const res = await api.get('/api/dashboard-sales-daily-report', {
          params: {
            date_from: today.format('YYYY-MM-DD'),
            date_to: today.format('YYYY-MM-DD'),
          },
        })
        if (!ignore) {
          setReport({
            ...dailyReportEmpty,
            ...res.data,
            totals: { ...dailyReportEmpty.totals, ...(res.data.totals || {}) },
            category_keys: res.data.category_keys || dailyReportEmpty.category_keys,
          })
        }
      } catch (error) {
        console.error(error)
        if (!ignore) setReport(dailyReportEmpty)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    fetchReport()
    return () => {
      ignore = true
    }
  }, [])

  const periodTitle = today.format('DD MMMM YYYY').toUpperCase()

  const salesColumns = [
    { title: 'Penjual', dataIndex: 'penjual', width: 118, fixed: 'left', ellipsis: true },
    { title: 'No. Customer', dataIndex: 'no_customer', width: 86, ellipsis: true },
    { title: 'Customer', dataIndex: 'customer', width: 142, ellipsis: true },
    { title: 'No. SO', dataIndex: 'no_so', width: 96, ellipsis: true },
    { title: 'No. PO', dataIndex: 'no_po', width: 128, ellipsis: true, render: value => value || '-' },
    { title: 'Tgl. SO', dataIndex: 'tgl_so', width: 72, render: value => value ? dayjs(value).format('DD/MM/YY') : '-' },
    { title: 'Target Kirim', dataIndex: 'target_kirim', width: 82, render: value => value ? dayjs(value).format('DD/MM/YY') : '-' },
    { title: 'Sub Total', dataIndex: 'sub_total', width: 96, align: 'right', render: formatCurrency },
    { title: 'Nilai Faktur', dataIndex: 'nilai_faktur', width: 96, align: 'right', render: formatCurrency },
    { title: 'Jumlah Faktur', dataIndex: 'jumlah_faktur', width: 104, align: 'right', render: value => <Text strong>{formatCurrency(value)}</Text> },
    {
      title: 'Status Faktur',
      dataIndex: 'status_faktur',
      width: 88,
      render: value => (
        <Tag style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: '17px' }} color={value === 'Diterima' ? 'green' : value === 'Diproses' ? 'blue' : value === 'Ditutup' ? 'default' : 'gold'}>
          {value || 'Menunggu'}
        </Tag>
      ),
    },
  ]

  const marketingColumns = [
    { title: 'Marketing', dataIndex: 'marketing', ellipsis: true },
    { title: 'Total SO', dataIndex: 'total_so', width: 72, align: 'center' },
    { title: 'Total Faktur', dataIndex: 'total_faktur', width: 118, align: 'right', render: value => <Text strong>{formatCurrency(value)}</Text> },
  ]

  const quantityColumns = [
    { title: 'Marketing', dataIndex: 'marketing', fixed: 'left', width: 170, ellipsis: true },
    ...(report.category_keys || dailyReportEmpty.category_keys).map(key => ({
      title: key,
      dataIndex: key,
      width: 72,
      align: 'center',
      render: value => value ? formatQty(value) : '',
    })),
    { title: 'Grand Total', dataIndex: 'grand_total', width: 86, align: 'center', render: value => <Text strong>{formatQty(value)}</Text> },
  ]

  const quantityTotals = report.totals?.quantity || {}

  return (
    <Card
      title={<span><FileDoneOutlined style={{ color: red }} /> Report Harian Penjualan SO</span>}
      extra={<Text type="secondary">Periode {periodTitle}</Text>}
      loading={loading}
      style={{ borderRadius: 8, border: softBorder }}
      styles={{ body: { padding: 8 } }}
      className="sales-daily-report-card"
    >
      <Table
        rowKey="key"
        size="small"
        columns={salesColumns}
        dataSource={report.rows || []}
        pagination={false}
        scroll={{ x: 1104 }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={9}>
                <Text strong>Grand Total</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={9} align="right">
                <Text strong>{formatCurrency(report.totals?.total_faktur || 0)}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={10} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />

      <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
        <Col xs={24} xl={9}>
          <Table
            rowKey="key"
            size="small"
            columns={marketingColumns}
            dataSource={report.marketing_summary || []}
            pagination={false}
            scroll={{ x: 380 }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><Text strong>Grand Total</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center"><Text strong>{formatNumber(report.totals?.total_so || 0)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right"><Text strong>{formatCurrency(report.totals?.total_faktur || 0)}</Text></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Col>
        <Col xs={24} xl={15}>
          <Table
            rowKey="key"
            size="small"
            columns={quantityColumns}
            dataSource={report.quantity_summary || []}
            pagination={false}
            scroll={{ x: 616 }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><Text strong>Grand Total</Text></Table.Summary.Cell>
                {(report.category_keys || dailyReportEmpty.category_keys).map((key, index) => (
                  <Table.Summary.Cell key={key} index={index + 1} align="center">
                    <Text strong>{formatQty(quantityTotals[key] || 0)}</Text>
                  </Table.Summary.Cell>
                ))}
                <Table.Summary.Cell index={(report.category_keys || dailyReportEmpty.category_keys).length + 1} align="center">
                  <Text strong>{formatQty(quantityTotals.grand_total || 0)}</Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Col>
      </Row>
      <style>{`
        .sales-daily-report-card .ant-card-head {
          min-height: 38px;
          padding: 0 10px;
        }
        .sales-daily-report-card .ant-card-head-title,
        .sales-daily-report-card .ant-card-extra {
          padding: 8px 0;
          font-size: 12px;
        }
        .sales-daily-report-card .ant-table {
          font-size: 10.5px;
        }
        .sales-daily-report-card .ant-table-thead > tr > th,
        .sales-daily-report-card .ant-table-tbody > tr > td,
        .sales-daily-report-card .ant-table-summary > tr > td {
          padding: 5px 6px;
          line-height: 1.2;
        }
        .sales-daily-report-card .ant-table-tbody > tr > td {
          height: 28px;
        }
        .sales-daily-report-card .ant-table-cell {
          white-space: nowrap;
        }
      `}</style>
    </Card>
  )
}

function MarketingReceivableOverview({ marketingRows = [], receivableRows = [], loading }) {
  const [selectedSales, setSelectedSales] = useState(null)
  const [salesPage, setSalesPage] = useState(1)
  const safeMarketingRows = Array.isArray(marketingRows) ? marketingRows : []
  const safeReceivableRows = Array.isArray(receivableRows) ? receivableRows : []
  const receivableMap = new Map(safeReceivableRows.map(row => [String(row.salesman_id ?? 'none'), row]))
  const marketingIds = new Set(safeMarketingRows.map(row => String(row.id ?? 'none')))
  const combinedRows = [...safeMarketingRows.map(marketing => {
    const receivable = receivableMap.get(String(marketing.id ?? 'none')) || {}
    const currentAmount = Number(marketing.current_amount || 0)
    const previousAmount = Number(marketing.previous_amount || 0)
    const receivableAmount = Number(receivable.amount || 0)
    const dueAmount = Number(receivable.due_amount || 0)
    return {
      ...marketing,
      salesman_id: marketing.id,
      current_amount: currentAmount,
      previous_amount: previousAmount,
      receivable_amount: receivableAmount,
      due_amount: dueAmount,
      not_due_amount: Number(receivable.not_due_amount || 0),
      due_ratio: receivableAmount ? (dueAmount / receivableAmount) * 100 : 0,
      invoice_count: Number(receivable.invoice_count || 0),
      receivable_customers: receivable.customers || [],
      oldest_overdue_days: Number(receivable.oldest_overdue_days || 0),
    }
  }), ...safeReceivableRows
    .filter(receivable => !marketingIds.has(String(receivable.salesman_id ?? 'none')))
    .map(receivable => ({
      id: String(receivable.salesman_id ?? 'none'),
      salesman_id: receivable.salesman_id,
      name: receivable.salesman_name || 'Tanpa Salesman',
      year: dayjs().year(),
      previous_year: dayjs().year() - 1,
      customer_count: Number(receivable.customer_count || 0),
      customers: [],
      current_amount: 0,
      previous_amount: 0,
      achievement_pct: 0,
      receivable_amount: Number(receivable.amount || 0),
      due_amount: Number(receivable.due_amount || 0),
      not_due_amount: Number(receivable.not_due_amount || 0),
      due_ratio: Number(receivable.amount || 0) ? (Number(receivable.due_amount || 0) / Number(receivable.amount || 0)) * 100 : 0,
      invoice_count: Number(receivable.invoice_count || 0),
      receivable_customers: receivable.customers || [],
      oldest_overdue_days: Number(receivable.oldest_overdue_days || 0),
    }))].sort((a, b) => b.current_amount - a.current_amount || b.due_amount - a.due_amount)
  const paginatedRows = combinedRows.slice(
    (salesPage - 1) * MARKETING_SALES_PAGE_SIZE,
    salesPage * MARKETING_SALES_PAGE_SIZE,
  )

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(combinedRows.length / MARKETING_SALES_PAGE_SIZE))
    if (salesPage > lastPage) setSalesPage(lastPage)
  }, [combinedRows.length, salesPage])

  const currentYear = combinedRows[0]?.year || dayjs().year()
  const previousYear = combinedRows[0]?.previous_year || currentYear - 1
  const totalCurrent = combinedRows.reduce((sum, row) => sum + row.current_amount, 0)
  const totalPrevious = combinedRows.reduce((sum, row) => sum + row.previous_amount, 0)
  const totalReceivable = safeReceivableRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const totalDue = safeReceivableRows.reduce((sum, row) => sum + Number(row.due_amount || 0), 0)
  const growthPct = totalPrevious ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : (totalCurrent > 0 ? 100 : 0)
  const dueRatio = totalReceivable ? (totalDue / totalReceivable) * 100 : 0
  const maxSales = Math.max(...combinedRows.flatMap(row => [row.current_amount, row.previous_amount]), 1)
  const maxReceivable = Math.max(...combinedRows.map(row => row.receivable_amount), 1)

  const selectedCustomerRows = useMemo(() => {
    if (!selectedSales) return []
    const salesCustomerMap = new Map((selectedSales.customers || []).map(customer => [
      String(customer.customer_id || customer.customer_name),
      customer,
    ]))
    const receivableCustomerMap = new Map((selectedSales.receivable_customers || []).map(customer => [
      String(customer.customer_id || customer.customer_name),
      customer,
    ]))
    return Array.from(new Set([...salesCustomerMap.keys(), ...receivableCustomerMap.keys()])).map(key => {
      const salesCustomer = salesCustomerMap.get(key) || {}
      const receivableCustomer = receivableCustomerMap.get(key) || {}
      return {
        key,
        customer_no: salesCustomer.customer_no || receivableCustomer.customer_no || '',
        customer_name: salesCustomer.customer_name || receivableCustomer.customer_name || 'Tanpa Customer',
        current_amount: Number(salesCustomer.current_amount || 0),
        previous_amount: Number(salesCustomer.previous_amount || 0),
        receivable_amount: Number(receivableCustomer.amount || 0),
        due_amount: Number(receivableCustomer.due_amount || 0),
        oldest_overdue_days: Number(receivableCustomer.oldest_overdue_days || 0),
      }
    }).sort((a, b) => (b.due_amount - a.due_amount) || (b.current_amount - a.current_amount))
  }, [selectedSales])

  return (
    <Card
      title={<span><TrophyOutlined style={{ color: purple }} /> Kinerja Marketing & Risiko Piutang</span>}
      extra={<Text type="secondary">Klik sales untuk detail customer</Text>}
      loading={loading}
      style={{
        borderRadius: 8,
        border: softBorder,
        overflow: 'hidden',
        background: `
          radial-gradient(circle at 8% 0%, ${cyan}16 0%, transparent 28%),
          radial-gradient(circle at 94% 8%, ${red}12 0%, transparent 30%),
          linear-gradient(135deg, #ffffff 0%, #fbfdff 100%)
        `,
        boxShadow: '0 16px 38px rgba(23,28,51,0.055)',
      }}
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        {[
          { label: `Sales ${currentYear} YTD`, value: formatCurrency(totalCurrent), color: cyan },
          { label: `Growth vs ${previousYear}`, value: `${growthPct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`, color: growthPct >= 0 ? green : red },
          { label: 'Total Piutang', value: formatCurrency(totalReceivable), color: purple },
          { label: 'Sudah Jatuh Tempo', value: `${formatCurrency(totalDue)} (${dueRatio.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%)`, color: totalDue > 0 ? red : green },
        ].map(item => (
          <Col key={item.label} xs={24} sm={12} xl={6}>
            <div style={{ height: '100%', padding: '12px 14px', borderRadius: 8, background: `${item.color}0d`, boxShadow: `inset 0 0 0 1px ${item.color}20` }}>
              <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>{item.label}</Text>
              <Text strong style={{ display: 'block', marginTop: 3, color: item.color, fontSize: 17 }}>{item.value}</Text>
            </div>
          </Col>
        ))}
      </Row>

      <div style={{ display: 'grid', gap: 10 }}>
        {paginatedRows.map((row, index) => {
          const ranking = ((salesPage - 1) * MARKETING_SALES_PAGE_SIZE) + index
          const currentPct = Math.max((row.current_amount / maxSales) * 100, row.current_amount ? 2 : 0)
          const previousPct = Math.max((row.previous_amount / maxSales) * 100, row.previous_amount ? 2 : 0)
          const receivablePct = Math.max((row.receivable_amount / maxReceivable) * 100, row.receivable_amount ? 2 : 0)
          const achievement = Number(row.achievement_pct || 0)
          return (
            <button
              type="button"
              key={row.id}
              onClick={() => setSelectedSales(row)}
              style={{
                width: '100%',
                border: 0,
                padding: '11px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                textAlign: 'initial',
                background: ranking === 0 ? `linear-gradient(135deg, ${cyan}10, #ffffff 78%)` : 'rgba(255,255,255,0.82)',
                boxShadow: `inset 0 0 0 1px ${ranking === 0 ? `${cyan}2b` : 'rgba(226,231,240,0.78)'}`,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 0.7fr) minmax(260px, 1.5fr) minmax(230px, 1.1fr)', gap: 16, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <Text strong ellipsis style={{ display: 'block', color: '#20243a' }}>{ranking + 1}. {row.name || 'Tanpa Salesman'}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{formatNumber(row.customer_count)} customer</Text>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>Sales YTD {formatCompactCurrency(row.current_amount)}</Text>
                    <Tag color={achievement >= 100 ? 'green' : 'orange'} style={{ marginInlineEnd: 0 }}>{achievement.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</Tag>
                  </div>
                  <Tooltip title={`${currentYear}: ${formatCurrency(row.current_amount)}`}>
                    <div style={{ height: 8, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                      <div style={{ width: `${currentPct}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${cyan}, #36cfc9)` }} />
                    </div>
                  </Tooltip>
                  <Tooltip title={`${previousYear}: ${formatCurrency(row.previous_amount)}`}>
                    <div style={{ height: 5, marginTop: 4, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                      <div style={{ width: `${previousPct}%`, height: '100%', borderRadius: 999, background: orange }} />
                    </div>
                  </Tooltip>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>Piutang {formatCompactCurrency(row.receivable_amount)}</Text>
                    <Text strong style={{ color: row.due_amount > 0 ? red : green, fontSize: 11 }}>
                      Jatuh tempo {row.due_ratio.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
                    </Text>
                  </div>
                  <Tooltip title={`Total piutang: ${formatCurrency(row.receivable_amount)}`}>
                    <div style={{ height: 8, borderRadius: 999, background: '#edf2f7', overflow: 'hidden' }}>
                      <div style={{ width: `${receivablePct}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${purple}, ${red})` }} />
                    </div>
                  </Tooltip>
                  <div style={{ height: 5, marginTop: 4, borderRadius: 999, background: `${cyan}55`, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(Math.max(row.due_ratio, 0), 100)}%`, height: '100%', borderRadius: 999, background: red }} />
                  </div>
                </div>
              </div>
            </button>
          )
        })}
        {combinedRows.length === 0 && <Text type="secondary">Belum ada data marketing pada periode ini.</Text>}
      </div>

      {combinedRows.length > MARKETING_SALES_PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <Pagination
            current={salesPage}
            pageSize={MARKETING_SALES_PAGE_SIZE}
            total={combinedRows.length}
            showSizeChanger={false}
            onChange={setSalesPage}
          />
        </div>
      )}

      <Space wrap size={16} style={{ marginTop: 14 }}>
        <Text type="secondary" style={{ fontSize: 11 }}><span style={{ display: 'inline-block', width: 9, height: 9, marginRight: 5, borderRadius: 999, background: cyan }} />Sales {currentYear}</Text>
        <Text type="secondary" style={{ fontSize: 11 }}><span style={{ display: 'inline-block', width: 9, height: 9, marginRight: 5, borderRadius: 999, background: orange }} />Sales {previousYear}</Text>
        <Text type="secondary" style={{ fontSize: 11 }}><span style={{ display: 'inline-block', width: 9, height: 9, marginRight: 5, borderRadius: 999, background: purple }} />Total piutang</Text>
        <Text type="secondary" style={{ fontSize: 11 }}><span style={{ display: 'inline-block', width: 9, height: 9, marginRight: 5, borderRadius: 999, background: red }} />Porsi jatuh tempo</Text>
      </Space>

      <Modal
        open={Boolean(selectedSales)}
        onCancel={() => setSelectedSales(null)}
        footer={null}
        width="92vw"
        title={`Kinerja & Piutang ${selectedSales?.name || ''}`}
      >
        <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
          {[
            { label: `Sales ${currentYear} YTD`, value: formatCurrency(selectedSales?.current_amount), color: cyan },
            { label: `Sales ${previousYear}`, value: formatCurrency(selectedSales?.previous_amount), color: orange },
            { label: 'Total Piutang', value: formatCurrency(selectedSales?.receivable_amount), color: purple },
            { label: 'Jatuh Tempo', value: formatCurrency(selectedSales?.due_amount), color: red },
          ].map(item => (
            <Col key={item.label} xs={24} sm={12} xl={6}>
              <div style={{ padding: 11, borderRadius: 8, background: `${item.color}0d`, boxShadow: `inset 0 0 0 1px ${item.color}20` }}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>{item.label}</Text>
                <Text strong style={{ color: item.color }}>{item.value}</Text>
              </div>
            </Col>
          ))}
        </Row>
        <Table
          rowKey="key"
          size="small"
          dataSource={selectedCustomerRows}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1000, y: 460 }}
          columns={[
            { title: 'No Customer', dataIndex: 'customer_no', width: 125, fixed: 'left', render: value => value || '-' },
            { title: 'Customer', dataIndex: 'customer_name', width: 250, fixed: 'left', ellipsis: true },
            { title: `Sales ${previousYear}`, dataIndex: 'previous_amount', width: 150, align: 'right', render: formatCurrency },
            { title: `Sales ${currentYear} YTD`, dataIndex: 'current_amount', width: 160, align: 'right', render: value => <Text strong style={{ color: cyan }}>{formatCurrency(value)}</Text> },
            { title: 'Piutang', dataIndex: 'receivable_amount', width: 150, align: 'right', render: value => <Text style={{ color: purple }}>{formatCurrency(value)}</Text> },
            { title: 'Jatuh Tempo', dataIndex: 'due_amount', width: 150, align: 'right', render: value => <Text strong style={{ color: Number(value || 0) > 0 ? red : green }}>{formatCurrency(value)}</Text> },
            { title: 'Overdue Tertua', dataIndex: 'oldest_overdue_days', width: 125, align: 'center', render: value => Number(value || 0) > 0 ? <Tag color="red">{formatNumber(value)} hari</Tag> : <Tag>Belum tempo</Tag> },
          ]}
        />
      </Modal>
    </Card>
  )
}

function MarketingCustomerPerformance({ rows = [], loading }) {
  const [selectedMarketing, setSelectedMarketing] = useState(null)
  const safeRows = Array.isArray(rows) ? rows : []
  const totalCustomers = safeRows.reduce((sum, row) => sum + Number(row.customer_count || 0), 0)
  const totalPrevious = safeRows.reduce((sum, row) => sum + Number(row.previous_amount || 0), 0)
  const totalCurrent = safeRows.reduce((sum, row) => sum + Number(row.current_amount || 0), 0)
  const totalRemaining = Math.max(totalPrevious - totalCurrent, 0)
  const totalAchievement = totalPrevious ? (totalCurrent / totalPrevious) * 100 : (totalCurrent > 0 ? 100 : 0)
  const currentYear = safeRows[0]?.year || dayjs().year()
  const previousYear = safeRows[0]?.previous_year || currentYear - 1
  const currentPeriodLabel = safeRows[0]?.current_to ? dayjs(safeRows[0].current_to).format('DD MMM YYYY') : 'periode berjalan'
  const textSorter = key => (a, b) => String(a?.[key] || '').localeCompare(String(b?.[key] || ''), 'id-ID', { numeric: true, sensitivity: 'base' })
  const numberSorter = key => (a, b) => Number(a?.[key] || 0) - Number(b?.[key] || 0)

  const statusColor = status => ({
    Achieved: 'green',
    Progress: 'blue',
    'Belum Ada Sales': 'red',
    'New Sales': 'cyan',
    'Tidak Ada Sales': 'default',
  }[status] || 'default')

  const summaryColumns = [
    {
      title: 'Marketing',
      dataIndex: 'name',
      width: 220,
      fixed: 'left',
      sorter: textSorter('name'),
      render: (value, record) => (
        <Button type="link" onClick={() => setSelectedMarketing(record)} style={{ padding: 0, fontWeight: 700 }}>
          {value || 'Tanpa Salesman'}
        </Button>
      ),
    },
    { title: 'Customer', dataIndex: 'customer_count', width: 90, align: 'center', sorter: numberSorter('customer_count'), render: value => formatNumber(value) },
    { title: `Sales ${previousYear}`, dataIndex: 'previous_amount', width: 150, align: 'right', sorter: numberSorter('previous_amount'), render: value => formatCurrency(value) },
    { title: `Sales ${currentYear} YTD`, dataIndex: 'current_amount', width: 160, align: 'right', sorter: numberSorter('current_amount'), render: value => formatCurrency(value) },
    {
      title: 'Achv',
      dataIndex: 'achievement_pct',
      width: 95,
      align: 'right',
      sorter: numberSorter('achievement_pct'),
      render: value => <Tag color={Number(value || 0) >= 100 ? 'green' : 'orange'}>{Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</Tag>,
    },
    {
      title: 'Selisih',
      dataIndex: 'diff_amount',
      width: 145,
      align: 'right',
      sorter: numberSorter('diff_amount'),
      render: value => <Text style={{ color: Number(value || 0) >= 0 ? green : red }}>{formatCurrency(value)}</Text>,
    },
    { title: 'Belum Sales', dataIndex: 'zero_with_previous_count', width: 105, align: 'center', sorter: numberSorter('zero_with_previous_count'), render: value => value ? <Tag color="red">{formatNumber(value)}</Tag> : <Tag>0</Tag> },
  ]

  const detailColumns = [
    { title: 'No Customer', dataIndex: 'customer_no', width: 125, fixed: 'left', sorter: textSorter('customer_no'), render: value => value || '-' },
    { title: 'Customer', dataIndex: 'customer_name', width: 250, ellipsis: { showTitle: false }, sorter: textSorter('customer_name'), render: value => <Tooltip title={value}>{value || '-'}</Tooltip> },
    { title: `Sales ${previousYear}`, dataIndex: 'previous_amount', width: 145, align: 'right', sorter: numberSorter('previous_amount'), render: value => formatCurrency(value) },
    { title: `Sales ${currentYear} YTD`, dataIndex: 'current_amount', width: 155, align: 'right', sorter: numberSorter('current_amount'), render: value => formatCurrency(value) },
    {
      title: 'Achv',
      dataIndex: 'achievement_pct',
      width: 90,
      align: 'right',
      sorter: numberSorter('achievement_pct'),
      render: value => <Tag color={Number(value || 0) >= 100 ? 'green' : 'orange'}>{Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</Tag>,
    },
    {
      title: 'Selisih',
      dataIndex: 'diff_amount',
      width: 135,
      align: 'right',
      sorter: numberSorter('diff_amount'),
      render: value => <Text style={{ color: Number(value || 0) >= 0 ? green : red }}>{formatCurrency(value)}</Text>,
    },
    { title: 'SO 2025', dataIndex: 'previous_so_count', width: 80, align: 'center', sorter: numberSorter('previous_so_count'), render: value => formatNumber(value) },
    { title: `SO ${currentYear}`, dataIndex: 'current_so_count', width: 85, align: 'center', sorter: numberSorter('current_so_count'), render: value => formatNumber(value) },
    { title: 'Status', dataIndex: 'status', width: 130, sorter: textSorter('status'), render: value => <Tag color={statusColor(value)}>{value}</Tag> },
  ]

  return (
    <Card
      title={<span><UserOutlined style={{ color: purple }} /> Performance Marketing per Customer</span>}
      loading={loading}
      className="marketing-customer-performance-card"
      style={{
        borderRadius: 8,
        border: '1px solid rgba(226,231,240,0.72)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(247,252,251,0.92) 100%)',
        boxShadow: '0 14px 34px rgba(23,28,51,0.045)',
      }}
      extra={<Text type="secondary">{previousYear} Jan-Des vs {currentYear} Jan-{currentPeriodLabel}</Text>}
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={12} xl={4}><Statistic title="Total Marketing" value={safeRows.length} valueStyle={{ color: purple, fontSize: 20 }} /></Col>
        <Col xs={24} sm={12} xl={4}><Statistic title="Total Customer" value={totalCustomers} valueStyle={{ color: cyan, fontSize: 20 }} /></Col>
        <Col xs={24} sm={12} xl={4}><Statistic title={`Sales ${previousYear} Jan-Des`} value={formatCurrency(totalPrevious)} valueStyle={{ color: orange, fontSize: 20 }} /></Col>
        <Col xs={24} sm={12} xl={4}><Statistic title={`Sales ${currentYear} YTD`} value={formatCurrency(totalCurrent)} valueStyle={{ color: cyan, fontSize: 20 }} /></Col>
        <Col xs={24} sm={12} xl={4}><Statistic title={`Achv ${currentYear} YTD`} value={totalAchievement.toLocaleString('id-ID', { maximumFractionDigits: 1 })} suffix="%" valueStyle={{ color: totalAchievement >= 100 ? green : red, fontSize: 20 }} /></Col>
        <Col xs={24} sm={12} xl={4}><Statistic title="Masih Kurang" value={formatCurrency(totalRemaining)} valueStyle={{ color: totalRemaining > 0 ? red : green, fontSize: 20 }} /></Col>
      </Row>
      <Table
        rowKey="id"
        size="small"
        columns={summaryColumns}
        dataSource={safeRows}
        pagination={{ pageSize: 8, showSizeChanger: false }}
        scroll={{ x: 1065 }}
      />
      <Modal
        open={!!selectedMarketing}
        onCancel={() => setSelectedMarketing(null)}
        footer={null}
        width="92vw"
        title={`Detail Customer ${selectedMarketing?.name || ''}`}
      >
        <Space size={[8, 8]} wrap style={{ marginBottom: 12 }}>
          <Tag color="blue">{formatNumber(selectedMarketing?.customer_count)} customer</Tag>
          <Tag color="orange">{previousYear}: {formatCurrency(selectedMarketing?.previous_amount)}</Tag>
          <Tag color="cyan">{currentYear} YTD: {formatCurrency(selectedMarketing?.current_amount)}</Tag>
          <Tag color={Number(selectedMarketing?.achievement_pct || 0) >= 100 ? 'green' : 'red'}>
            Achv {Number(selectedMarketing?.achievement_pct || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
          </Tag>
          <Tag color="red">Belum sales: {formatNumber(selectedMarketing?.zero_with_previous_count)}</Tag>
        </Space>
        <Table
          rowKey="customer_id"
          size="small"
          columns={detailColumns}
          dataSource={selectedMarketing?.customers || []}
          pagination={{ pageSize: 12, showSizeChanger: false }}
          scroll={{ x: 1195, y: 470 }}
        />
      </Modal>
      <style>{`
        .marketing-customer-performance-card .ant-card-head {
          border-bottom-color: rgba(226,231,240,0.58);
        }
        .marketing-customer-performance-card .ant-card-body {
          padding-top: 16px;
        }
        .marketing-customer-performance-card .ant-statistic-title {
          color: #697087;
          font-size: 12px;
        }
        .marketing-customer-performance-card .ant-statistic-content {
          letter-spacing: 0;
        }
        .marketing-customer-performance-card .ant-table {
          background: rgba(255,255,255,0.72);
          border-radius: 8px;
        }
        .marketing-customer-performance-card .ant-table-thead > tr > th {
          background: rgba(247,249,253,0.78);
          border-bottom-color: rgba(226,231,240,0.7);
          color: #475166;
          font-weight: 700;
        }
        .marketing-customer-performance-card .ant-table-tbody > tr > td {
          border-bottom-color: rgba(226,231,240,0.54);
        }
        .marketing-customer-performance-card .ant-table-tbody > tr:hover > td {
          background: rgba(244,250,255,0.86);
        }
        .marketing-customer-performance-card .ant-pagination {
          margin-bottom: 0;
        }
      `}</style>
    </Card>
  )
}

function SalesReceivablesBySalesman({ rows = [], loading }) {
  const [selectedSalesman, setSelectedSalesman] = useState(null)
  const safeRows = Array.isArray(rows) ? rows : []
  const textSorter = key => (a, b) => String(a?.[key] || '').localeCompare(String(b?.[key] || ''), 'id-ID', { numeric: true, sensitivity: 'base' })
  const numberSorter = key => (a, b) => Number(a?.[key] || 0) - Number(b?.[key] || 0)
  const totalAmount = safeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const totalDueAmount = safeRows.reduce((sum, row) => sum + Number(row.due_amount || 0), 0)
  const totalNotDueAmount = safeRows.reduce((sum, row) => sum + Number(row.not_due_amount || 0), 0)
  const totalCustomers = safeRows.reduce((sum, row) => sum + Number(row.customer_count || 0), 0)
  const totalInvoices = safeRows.reduce((sum, row) => sum + Number(row.invoice_count || 0), 0)
  const totalPo = safeRows.reduce((sum, row) => sum + Number(row.po_count || 0), 0)

  const statusTag = record => {
    const status = record?.status
    const label = record?.status_label || '-'
    if (status === 'overdue') return <Tag color="red">{label}</Tag>
    if (status === 'today') return <Tag color="orange">{label}</Tag>
    return <Tag color="blue">{label}</Tag>
  }

  const summaryColumns = [
    {
      title: 'Sales',
      dataIndex: 'salesman_name',
      width: 230,
      fixed: 'left',
      sorter: textSorter('salesman_name'),
      render: (value, record) => (
        <Button type="link" onClick={() => setSelectedSalesman(record)} style={{ padding: 0, fontWeight: 700 }}>
          {value || 'Tanpa Marketing'}
        </Button>
      ),
    },
    { title: 'Customer', dataIndex: 'customer_count', width: 95, align: 'center', sorter: numberSorter('customer_count'), render: value => formatNumber(value) },
    { title: 'PO', dataIndex: 'po_count', width: 80, align: 'center', sorter: numberSorter('po_count'), render: value => formatNumber(value) },
    { title: 'Invoice', dataIndex: 'invoice_count', width: 90, align: 'center', sorter: numberSorter('invoice_count'), render: value => formatNumber(value) },
    { title: 'Belum Bayar', dataIndex: 'amount', width: 155, align: 'right', sorter: numberSorter('amount'), render: value => <Text strong>{formatCurrency(value)}</Text> },
    { title: 'Jatuh Tempo', dataIndex: 'due_amount', width: 155, align: 'right', sorter: numberSorter('due_amount'), render: value => <Text style={{ color: Number(value || 0) > 0 ? red : green }}>{formatCurrency(value)}</Text> },
    { title: 'Belum Tempo', dataIndex: 'not_due_amount', width: 155, align: 'right', sorter: numberSorter('not_due_amount'), render: value => <Text style={{ color: cyan }}>{formatCurrency(value)}</Text> },
    {
      title: 'Overdue Tertua',
      dataIndex: 'oldest_overdue_days',
      width: 125,
      align: 'center',
      sorter: numberSorter('oldest_overdue_days'),
      render: value => Number(value || 0) > 0 ? <Tag color="red">{formatNumber(value)} hari</Tag> : <Tag>Belum tempo</Tag>,
    },
  ]

  const customerColumns = [
    { title: 'No Customer', dataIndex: 'customer_no', width: 120, fixed: 'left', sorter: textSorter('customer_no'), render: value => value || '-' },
    { title: 'Customer', dataIndex: 'customer_name', width: 250, ellipsis: { showTitle: false }, sorter: textSorter('customer_name'), render: value => <Tooltip title={value}>{value || '-'}</Tooltip> },
    { title: 'PO', dataIndex: 'po_count', width: 75, align: 'center', sorter: numberSorter('po_count'), render: value => formatNumber(value) },
    { title: 'Invoice', dataIndex: 'invoice_count', width: 85, align: 'center', sorter: numberSorter('invoice_count'), render: value => formatNumber(value) },
    { title: 'Belum Bayar', dataIndex: 'amount', width: 145, align: 'right', sorter: numberSorter('amount'), render: value => <Text strong>{formatCurrency(value)}</Text> },
    { title: 'Jatuh Tempo', dataIndex: 'due_amount', width: 145, align: 'right', sorter: numberSorter('due_amount'), render: value => <Text style={{ color: Number(value || 0) > 0 ? red : green }}>{formatCurrency(value)}</Text> },
    { title: 'Belum Tempo', dataIndex: 'not_due_amount', width: 145, align: 'right', sorter: numberSorter('not_due_amount'), render: value => <Text style={{ color: cyan }}>{formatCurrency(value)}</Text> },
    {
      title: 'Overdue Tertua',
      dataIndex: 'oldest_overdue_days',
      width: 120,
      align: 'center',
      sorter: numberSorter('oldest_overdue_days'),
      render: value => Number(value || 0) > 0 ? <Tag color="red">{formatNumber(value)} hari</Tag> : <Tag>Belum tempo</Tag>,
    },
  ]

  const invoiceColumns = [
    { title: 'No Faktur', dataIndex: 'no_faktur', width: 135, sorter: textSorter('no_faktur'), render: value => value || '-' },
    { title: 'Tgl Faktur', dataIndex: 'tgl_faktur', width: 105, sorter: textSorter('tgl_faktur'), render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'Jatuh Tempo', dataIndex: 'due_date', width: 110, sorter: textSorter('due_date'), render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'No PO', dataIndex: 'no_po', width: 145, sorter: textSorter('no_po'), render: value => value || '-' },
    { title: 'No SO', dataIndex: 'no_pesanan', width: 135, sorter: textSorter('no_pesanan'), render: value => value || '-' },
    { title: 'No DO', dataIndex: 'no_pengiriman', width: 135, sorter: textSorter('no_pengiriman'), render: value => value || '-' },
    { title: 'Nilai Faktur', dataIndex: 'nilai_faktur', width: 135, align: 'right', sorter: numberSorter('nilai_faktur'), render: value => formatCurrency(value) },
    { title: 'Terbayar', dataIndex: 'nilai_terbayar', width: 125, align: 'right', sorter: numberSorter('nilai_terbayar'), render: value => formatCurrency(value) },
    { title: 'Belum Bayar', dataIndex: 'terhutang', width: 135, align: 'right', sorter: numberSorter('terhutang'), render: value => <Text strong style={{ color: red }}>{formatCurrency(value)}</Text> },
    { title: 'Status', dataIndex: 'status_label', width: 150, sorter: textSorter('status_label'), render: (_, record) => statusTag(record) },
  ]

  return (
    <Card
      title={<span><DollarOutlined style={{ color: red }} /> Piutang Customer per Sales</span>}
      loading={loading}
      className="sales-receivables-card"
      style={{
        borderRadius: 8,
        border: '1px solid rgba(226,231,240,0.74)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(253,248,249,0.9) 100%)',
        boxShadow: '0 14px 34px rgba(23,28,51,0.045)',
      }}
      extra={<Text type="secondary">{formatNumber(totalInvoices)} invoice belum lunas</Text>}
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} sm={12} xl={4}><Statistic title="Total Sales" value={safeRows.length} valueStyle={{ color: purple, fontSize: 20 }} /></Col>
        <Col xs={24} sm={12} xl={4}><Statistic title="Total Customer" value={totalCustomers} valueStyle={{ color: cyan, fontSize: 20 }} /></Col>
        <Col xs={24} sm={12} xl={4}><Statistic title="Total PO" value={totalPo} valueStyle={{ color: orange, fontSize: 20 }} /></Col>
        <Col xs={24} sm={12} xl={4}><Statistic title="Belum Bayar" value={formatCurrency(totalAmount)} valueStyle={{ color: red, fontSize: 20 }} /></Col>
        <Col xs={24} sm={12} xl={4}><Statistic title="Jatuh Tempo" value={formatCurrency(totalDueAmount)} valueStyle={{ color: totalDueAmount > 0 ? red : green, fontSize: 20 }} /></Col>
        <Col xs={24} sm={12} xl={4}><Statistic title="Belum Tempo" value={formatCurrency(totalNotDueAmount)} valueStyle={{ color: cyan, fontSize: 20 }} /></Col>
      </Row>
      <Table
        rowKey="salesman_id"
        size="small"
        columns={summaryColumns}
        dataSource={safeRows}
        pagination={{ pageSize: 8, showSizeChanger: false }}
        scroll={{ x: 1185 }}
      />
      <Modal
        open={!!selectedSalesman}
        onCancel={() => setSelectedSalesman(null)}
        footer={null}
        width="94vw"
        title={`Detail Piutang ${selectedSalesman?.salesman_name || ''}`}
      >
        <Space size={[8, 8]} wrap style={{ marginBottom: 12 }}>
          <Tag color="blue">{formatNumber(selectedSalesman?.customer_count)} customer</Tag>
          <Tag color="orange">{formatNumber(selectedSalesman?.po_count)} PO</Tag>
          <Tag color="purple">{formatNumber(selectedSalesman?.invoice_count)} invoice</Tag>
          <Tag color="red">Belum bayar: {formatCurrency(selectedSalesman?.amount || 0)}</Tag>
          <Tag color={Number(selectedSalesman?.due_amount || 0) > 0 ? 'red' : 'green'}>Jatuh tempo: {formatCurrency(selectedSalesman?.due_amount || 0)}</Tag>
          <Tag color="cyan">Belum tempo: {formatCurrency(selectedSalesman?.not_due_amount || 0)}</Tag>
        </Space>
        <Table
          rowKey={record => record.customer_id || record.customer_name}
          size="small"
          columns={customerColumns}
          dataSource={selectedSalesman?.customers || []}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1185, y: 470 }}
          expandable={{
            expandedRowRender: record => (
              <Table
                rowKey={item => item.invoice_id || item.no_faktur}
                size="small"
                columns={invoiceColumns}
                dataSource={record.invoices || []}
                pagination={false}
                scroll={{ x: 1310 }}
              />
            ),
          }}
        />
      </Modal>
      <style>{`
        .sales-receivables-card .ant-card-head {
          border-bottom-color: rgba(226,231,240,0.58);
        }
        .sales-receivables-card .ant-card-body {
          padding-top: 16px;
        }
        .sales-receivables-card .ant-statistic-title {
          color: #697087;
          font-size: 12px;
        }
        .sales-receivables-card .ant-table {
          background: rgba(255,255,255,0.74);
          border-radius: 8px;
        }
        .sales-receivables-card .ant-table-thead > tr > th {
          background: rgba(248,249,253,0.82);
          border-bottom-color: rgba(226,231,240,0.72);
          color: #475166;
          font-weight: 700;
        }
        .sales-receivables-card .ant-table-tbody > tr > td {
          border-bottom-color: rgba(226,231,240,0.54);
        }
        .sales-receivables-card .ant-table-tbody > tr:hover > td {
          background: rgba(255,247,247,0.76);
        }
        .sales-receivables-card .ant-pagination {
          margin-bottom: 0;
        }
      `}</style>
    </Card>
  )
}

function SalesModule({ sales, loading, canViewInvoice = true, dateRange }) {
  const targetReached = Number(sales.target_achievement_pct || 0) >= 100
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productDetails, setProductDetails] = useState({ data: [], summary: {} })
  const [productDetailsLoading, setProductDetailsLoading] = useState(false)
  const [selectedParty, setSelectedParty] = useState(null)
  const [partyDetails, setPartyDetails] = useState({ data: [], summary: {} })
  const [partyDetailsLoading, setPartyDetailsLoading] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [groupDetails, setGroupDetails] = useState({ data: [], summary: {} })
  const [groupDetailsLoading, setGroupDetailsLoading] = useState(false)

  const openProductDetails = async (row, sourceLabel) => {
    if (!row?.itemno) return
    setSelectedProduct({ ...row, sourceLabel })
    setProductDetails({ data: [], summary: {} })
    try {
      setProductDetailsLoading(true)
      const [dateFrom, dateTo] = dateRange
      const res = await api.get('/api/dashboard-product-transactions', {
        params: {
          itemno: row.itemno,
          date_from: dateFrom.format('YYYY-MM-DD'),
          date_to: dateTo.format('YYYY-MM-DD'),
        },
      })
      setProductDetails({
        data: res.data.data || [],
        summary: res.data.summary || {},
      })
    } catch (error) {
      console.error(error)
      message.error('Gagal memuat detail transaksi produk')
    } finally {
      setProductDetailsLoading(false)
    }
  }

  const productDetailColumns = [
    { title: 'Tgl SO', dataIndex: 'so_date', width: 96, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'No SO', dataIndex: 'so_no', width: 130 },
    { title: 'No PO', dataIndex: 'po_no', width: 140, render: value => value || '-' },
    { title: 'Customer', dataIndex: 'customer_name', width: 220, render: (value, record) => value || record.customer_no || '-' },
    { title: 'Salesman', dataIndex: 'salesman', width: 160, render: value => value || '-' },
    { title: 'Qty', dataIndex: 'qty', align: 'right', width: 96, render: (value, record) => `${formatQty(value)} ${record.unit || ''}`.trim() },
    { title: 'Harga', dataIndex: 'unit_price', align: 'right', width: 128, render: value => formatCurrency(value) },
    { title: 'DPP', dataIndex: 'amount', align: 'right', width: 136, render: value => formatCurrency(value) },
  ]

  const openPartyDetails = async (row, type) => {
    const id = type === 'customer' ? row?.customer_id : row?.salesman_id
    if (!id) return
    setSelectedParty({
      ...row,
      type,
      sourceLabel: type === 'customer' ? 'Pelanggan Terbesar' : 'Penjual Teratas',
    })
    setPartyDetails({ data: [], summary: {} })
    try {
      setPartyDetailsLoading(true)
      const [dateFrom, dateTo] = dateRange
      const res = await api.get('/api/dashboard-party-transactions', {
        params: {
          type,
          id,
          date_from: dateFrom.format('YYYY-MM-DD'),
          date_to: dateTo.format('YYYY-MM-DD'),
        },
      })
      setPartyDetails({
        data: res.data.data || [],
        summary: res.data.summary || {},
      })
    } catch (error) {
      console.error(error)
      message.error('Gagal memuat detail transaksi')
    } finally {
      setPartyDetailsLoading(false)
    }
  }

  const partyDetailColumns = [
    { title: 'Tgl SO', dataIndex: 'so_date', width: 96, render: value => value ? dayjs(value).format('DD/MM/YYYY') : '-' },
    { title: 'No SO', dataIndex: 'so_no', width: 130 },
    { title: 'No PO', dataIndex: 'po_no', width: 140, render: value => value || '-' },
    { title: 'Customer', dataIndex: 'customer_name', width: 210, render: (value, record) => value || record.customer_no || '-' },
    { title: 'Salesman', dataIndex: 'salesman', width: 150, render: value => value || '-' },
    { title: 'No Barang', dataIndex: 'itemno', width: 125 },
    { title: 'Deskripsi Barang', dataIndex: 'description', width: 230, ellipsis: true },
    { title: 'Qty', dataIndex: 'qty', align: 'right', width: 96, render: (value, record) => `${formatQty(value)} ${record.unit || ''}`.trim() },
    { title: 'Harga', dataIndex: 'unit_price', align: 'right', width: 128, render: value => formatCurrency(value) },
    { title: 'DPP', dataIndex: 'amount', align: 'right', width: 136, render: value => formatCurrency(value) },
  ]

  const openGroupDetails = async (row, type) => {
    if (!row?.label) return
    setSelectedGroup({
      ...row,
      type,
      sourceLabel: type === 'category' ? 'Category' : 'Code Product',
    })
    setGroupDetails({ data: [], summary: {} })
    try {
      setGroupDetailsLoading(true)
      const [dateFrom, dateTo] = dateRange
      const res = await api.get('/api/dashboard-group-transactions', {
        params: {
          type,
          label: row.label,
          date_from: dateFrom.format('YYYY-MM-DD'),
          date_to: dateTo.format('YYYY-MM-DD'),
        },
      })
      setGroupDetails({
        data: res.data.data || [],
        summary: res.data.summary || {},
      })
    } catch (error) {
      console.error(error)
      message.error('Gagal memuat detail transaksi kelompok produk')
    } finally {
      setGroupDetailsLoading(false)
    }
  }

  return (
    <>
    <Row gutter={[16, 16]} align="stretch">
      <Col xs={24} sm={12} xl={6} style={{ display: 'flex' }}>
        <SummaryCard
          title="Resume Total SO"
          value={sales.so_period}
          icon={<ShoppingOutlined />}
          color={cyan}
          loading={loading}
        />
      </Col>
      <Col xs={24} sm={12} xl={6} style={{ display: 'flex' }}>
        <Card
          loading={loading}
          style={{
            borderRadius: 8,
            border: softBorder,
            height: '100%',
            width: '100%',
            background: `
              radial-gradient(circle at 92% 18%, ${purple}2b 0%, transparent 30%),
              linear-gradient(135deg, ${purple}16 0%, #ffffff 48%, ${cyan}0f 100%)
            `,
          }}
        >
          <Text type="secondary">Resume Total DO</Text>
          <div style={{ marginTop: 4, color: purple, fontSize: 24, fontWeight: 800 }}>
            <FileTextOutlined /> {sales.do_period || 0}
          </div>
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            {sales.do_period || 0} DO dari {sales.so_period || 0} SO ({sales.do_vs_so_pct || 0}%)
          </Text>
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6} style={{ display: 'flex' }}>
        <Card
          loading={loading}
          style={{
            borderRadius: 8,
            border: softBorder,
            height: '100%',
            width: '100%',
            background: `
              radial-gradient(circle at 92% 18%, ${orange}2b 0%, transparent 30%),
              linear-gradient(135deg, ${red}12 0%, #ffffff 48%, ${orange}12 100%)
            `,
          }}
        >
                    <Text type="secondary">Total DPP Penjualan</Text>
          <div style={{ marginTop: 4, color: orange, fontSize: 24, fontWeight: 800 }}>
            {formatCurrency(sales.sales_amount_period)}
          </div>
          <TrendBadge
            percent={sales.sales_amount_change_pct}
            direction={sales.sales_amount_direction}
            label="periode lalu"
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} xl={6} style={{ display: 'flex' }}>
        <Card
          loading={loading}
          style={{
            borderRadius: 8,
            border: softBorder,
            height: '100%',
            width: '100%',
            background: `
              radial-gradient(circle at 92% 18%, ${green}2b 0%, transparent 30%),
              linear-gradient(135deg, ${green}12 0%, #ffffff 48%, ${cyan}0f 100%)
            `,
          }}
        >
          <Text type="secondary">Target Bulanan</Text>
          <div style={{ marginTop: 4, color: green, fontSize: 24, fontWeight: 800 }}>
            {formatCurrency(sales.target_sales_amount)}
          </div>
          <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 11 }}>
            Target dari {sales.target_source_label || 'DPP - diskon bulan sama tahun lalu'}
          </Text>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              marginTop: 8,
              color: targetReached ? green : red,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {targetReached ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            <span>{sales.target_achievement_pct || 0}% tercapai, sisa {formatCompactCurrency(sales.target_remaining_amount)}</span>
          </div>
        </Card>
      </Col>
      <Col xs={24}>
        <SalesOrderStatusCard status={sales.so_month_status} loading={loading} />
      </Col>
      <Col xs={24}>
        <SalesDailyReport dateRange={dateRange} />
      </Col>
      <Col xs={24}>
        <MarketingReceivableOverview
          marketingRows={sales.marketing_customer_yearly}
          receivableRows={sales.sales_receivables_by_salesman}
          loading={loading}
        />
      </Col>
      <Col xs={24}>
        <MarketingCustomerPerformance rows={sales.marketing_customer_yearly} loading={loading} />
      </Col>
      <Col xs={24}>
        <SalesReceivablesBySalesman rows={sales.sales_receivables_by_salesman} loading={loading} />
      </Col>
      <Col xs={24}>
        <CustomerCityMap rows={sales.customer_cities} loading={loading} />
      </Col>
      <Col xs={24} xl={12}>
        <SoftPieChart
          title="Banyak Terjual per Category"
          icon={<AppstoreOutlined style={{ color: cyan }} />}
          rows={sales.sold_by_category}
          accent={cyan}
          loading={loading}
          onRowClick={row => openGroupDetails(row, 'category')}
        />
      </Col>
      <Col xs={24} xl={12}>
        <SoftPieChart
          title="Banyak Terjual per Code Product"
          icon={<SafetyCertificateOutlined style={{ color: purple }} />}
          rows={sales.sold_by_code_product}
          accent={purple}
          loading={loading}
          onRowClick={row => openGroupDetails(row, 'code_product')}
        />
      </Col>
      <Col xs={24} xl={6}>
        <SoftBarChart
          title="Produk Terlaris"
          icon={<TrophyOutlined style={{ color: orange }} />}
          rows={sales.top_products}
          getName={row => row.description || row.itemno}
          getMeta={row => `${row.itemno || '-'} · ${formatCompactCurrency(row.qty)} qty`}
          color={orange}
          loading={loading}
          onRowClick={row => openProductDetails(row, 'Produk Terlaris')}
        />
      </Col>
      <Col xs={24} xl={6}>
        <SoftBarChart
          title="Produk Sering Dipesan"
          icon={<ShoppingCartOutlined style={{ color: green }} />}
          rows={sales.top_qty_products}
          getName={row => row.description || row.itemno}
          getMeta={row => `${row.itemno || '-'} · ${formatQty(row.qty)} qty · ${formatCurrency(row.amount)}`}
          color={green}
          loading={loading}
          metricKey="order_count"
          formatValue={value => `${formatNumber(value)} SO`}
          onRowClick={row => openProductDetails(row, 'Produk Sering Dipesan')}
        />
      </Col>
      <Col xs={24} xl={6}>
        <SoftBarChart
          title="Pelanggan Terbesar"
          icon={<UserOutlined style={{ color: cyan }} />}
          rows={sales.top_customers}
          getName={row => row.name || row.customerno}
          getMeta={row => `${row.customerno || '-'} · ${row.so_count || 0} SO`}
          color={cyan}
          loading={loading}
          onRowClick={row => openPartyDetails(row, 'customer')}
        />
      </Col>
      <Col xs={24} xl={6}>
        <SoftBarChart
          title="Penjual Teratas"
          icon={<ShoppingOutlined style={{ color: purple }} />}
          rows={sales.top_salesmen}
          getName={row => row.name}
          getMeta={row => `${row.so_count || 0} SO`}
          color={purple}
          loading={loading}
          onRowClick={row => openPartyDetails(row, 'salesman')}
        />
      </Col>
      {canViewInvoice && (
        <Col xs={24}>
          <ReceivableAging rows={sales.receivable_aging} fallbackRows={sales.outstanding_receivables} loading={loading} />
        </Col>
      )}
    </Row>
    <Modal
      open={Boolean(selectedProduct)}
      title={selectedProduct ? `Detail Transaksi - ${selectedProduct.sourceLabel}` : 'Detail Transaksi'}
      footer={null}
      width={1180}
      onCancel={() => setSelectedProduct(null)}
    >
      {selectedProduct && (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Text strong style={{ display: 'block', color: '#20243a' }}>{selectedProduct.description || selectedProduct.itemno}</Text>
            <Text type="secondary">{selectedProduct.itemno}</Text>
          </div>
          <Row gutter={[10, 10]}>
            {[
              { label: 'Total SO', value: formatNumber(productDetails.summary.order_count), color: green },
              { label: 'Total Qty', value: formatQty(productDetails.summary.qty), color: cyan },
              { label: 'Total DPP', value: formatCurrency(productDetails.summary.amount), color: orange },
            ].map(item => (
              <Col key={item.label} xs={24} sm={8}>
                <div style={{ padding: 12, borderRadius: 8, border: softBorder, background: `${item.color}0d` }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
                  <div style={{ marginTop: 4, color: item.color, fontWeight: 800, fontSize: 18 }}>{item.value}</div>
                </div>
              </Col>
            ))}
          </Row>
          <Table
            size="small"
            rowKey={(record, index) => `${record.so_no}-${record.itemno}-${index}`}
            loading={productDetailsLoading}
            columns={productDetailColumns}
            dataSource={productDetails.data}
            pagination={{ pageSize: 8, size: 'small', showSizeChanger: false }}
            scroll={{ x: 1110 }}
          />
        </Space>
      )}
    </Modal>
    <Modal
      open={Boolean(selectedParty)}
      title={selectedParty ? `Detail Transaksi - ${selectedParty.sourceLabel}` : 'Detail Transaksi'}
      footer={null}
      width={1280}
      onCancel={() => setSelectedParty(null)}
    >
      {selectedParty && (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Text strong style={{ display: 'block', color: '#20243a' }}>{selectedParty.name || '-'}</Text>
            <Text type="secondary">
              {selectedParty.type === 'customer' ? selectedParty.customerno || '-' : 'Salesman'}
              {' · '}
              {dateRange[0].format('DD MMM YYYY')} - {dateRange[1].format('DD MMM YYYY')}
            </Text>
          </div>
          <Row gutter={[10, 10]}>
            {[
              { label: 'Total SO', value: formatNumber(partyDetails.summary.order_count), color: green },
              { label: 'Total Qty', value: formatQty(partyDetails.summary.qty), color: cyan },
              { label: 'Total DPP', value: formatCurrency(partyDetails.summary.amount), color: selectedParty.type === 'customer' ? cyan : purple },
            ].map(item => (
              <Col key={item.label} xs={24} sm={8}>
                <div style={{ padding: 12, borderRadius: 8, border: softBorder, background: `${item.color}0d` }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
                  <div style={{ marginTop: 4, color: item.color, fontWeight: 800, fontSize: 18 }}>{item.value}</div>
                </div>
              </Col>
            ))}
          </Row>
          <Table
            size="small"
            rowKey={(record, index) => `${record.so_no}-${record.itemno}-${index}`}
            loading={partyDetailsLoading}
            columns={partyDetailColumns}
            dataSource={partyDetails.data}
            pagination={{ pageSize: 8, size: 'small', showSizeChanger: false }}
            scroll={{ x: 1440 }}
          />
        </Space>
      )}
    </Modal>
    <Modal
      open={Boolean(selectedGroup)}
      title={selectedGroup ? `Detail Transaksi - ${selectedGroup.sourceLabel}` : 'Detail Transaksi'}
      footer={null}
      width={1280}
      onCancel={() => setSelectedGroup(null)}
    >
      {selectedGroup && (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Text strong style={{ display: 'block', color: '#20243a' }}>{selectedGroup.label}</Text>
            <Text type="secondary">
              {selectedGroup.sourceLabel}
              {' · '}
              {dateRange[0].format('DD MMM YYYY')} - {dateRange[1].format('DD MMM YYYY')}
            </Text>
          </div>
          <Row gutter={[10, 10]}>
            {[
              { label: 'Total SO', value: formatNumber(groupDetails.summary.order_count), color: green },
              { label: 'Jenis Barang', value: formatNumber(groupDetails.summary.item_count), color: orange },
              { label: 'Total Qty', value: formatQty(groupDetails.summary.qty), color: cyan },
              { label: 'Total DPP', value: formatCurrency(groupDetails.summary.amount), color: selectedGroup.type === 'category' ? cyan : purple },
            ].map(item => (
              <Col key={item.label} xs={24} sm={12} xl={6}>
                <div style={{ padding: 12, borderRadius: 8, border: softBorder, background: `${item.color}0d` }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
                  <div style={{ marginTop: 4, color: item.color, fontWeight: 800, fontSize: 18 }}>{item.value}</div>
                </div>
              </Col>
            ))}
          </Row>
          <Table
            size="small"
            rowKey={(record, index) => `${record.so_no}-${record.itemno}-${index}`}
            loading={groupDetailsLoading}
            columns={partyDetailColumns}
            dataSource={groupDetails.data}
            pagination={{ pageSize: 8, size: 'small', showSizeChanger: false }}
            scroll={{ x: 1440 }}
          />
        </Space>
      )}
    </Modal>
    </>
  )
}

function InventoryModule({ stock, loading }) {
  const categoryItems = stock.categories || []
  const visibleCategoryItems = categoryItems.slice(0, 2)
  const hiddenCategoryCount = Math.max(categoryItems.length - visibleCategoryItems.length, 0)
  const categoryPopover = (
    <div style={{ width: 250, maxHeight: 260, overflowY: 'auto' }}>
      <Space size={6} direction="vertical" style={{ width: '100%' }}>
        {categoryItems.map(item => (
          <Tag key={item.category} color="purple" style={{ marginInlineEnd: 0, width: '100%' }}>
            {item.category}: {formatNumber(item.count)}
          </Tag>
        ))}
      </Space>
    </div>
  )

  return (
    <Row gutter={[12, 12]} align="stretch">
      <Col xs={24} sm={12} xl={5} style={{ display: 'flex' }}>
        <SummaryCard
          title="Total Barang"
          value={stock.total_items}
          icon={<ShoppingOutlined />}
          color={cyan}
          loading={loading}
        />
      </Col>
      <Col xs={24} sm={24} xl={9} style={{ display: 'flex' }}>
        <SummaryCard
          title="Kategori Barang"
          value={stock.category_count}
          icon={<AppstoreOutlined />}
          color={purple}
          loading={loading}
        >
          <Space size={[5, 5]} wrap style={{ marginTop: 10, maxWidth: 'calc(100% - 42px)' }}>
            {visibleCategoryItems.map(item => (
              <Tooltip key={item.category} title={`${item.category}: ${formatNumber(item.count)} barang`}>
                <Tag color="purple">{item.category}: {formatNumber(item.count)}</Tag>
              </Tooltip>
            ))}
            {hiddenCategoryCount > 0 && (
              <Popover content={categoryPopover} title="Semua Kategori" trigger="click" placement="bottom">
                <Button
                  size="small"
                  type="text"
                  style={{
                    height: 22,
                    paddingInline: 8,
                    borderRadius: 999,
                    color: 'rgba(124,60,255,0.78)',
                    background: 'rgba(124,60,255,0.055)',
                    border: '1px solid rgba(124,60,255,0.10)',
                    fontWeight: 500,
                  }}
                >
                  Lihat semua
                </Button>
              </Popover>
            )}
            {!categoryItems.length && <Text type="secondary">Belum ada kategori</Text>}
          </Space>
        </SummaryCard>
      </Col>
      <Col xs={24} sm={12} xl={10} style={{ display: 'flex' }}>
        <SummaryCard
          title="Lewat Minimum"
          value={stock.below_minimum_items}
          icon={<WarningOutlined />}
          color={orange}
          loading={loading}
        />
      </Col>
    </Row>
  )
}

function MiniBar({ label, value, max, color }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 8 : 0) : 0
  return (
    <div>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 6 }}>
        <Text type="secondary">{label}</Text>
        <Text strong>{value}</Text>
      </Space>
      <div style={{ height: 9, background: '#f1f3f5', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            width: `${width}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            borderRadius: 8,
            transition: 'width 0.25s ease',
          }}
        />
      </div>
    </div>
  )
}

function DonutChart({ percent, color, label, value }) {
  const safePercent = Math.max(0, Math.min(percent || 0, 100))
  return (
    <div
      style={{
        width: 132,
        height: 132,
        borderRadius: '50%',
        background: `conic-gradient(${color} ${safePercent * 3.6}deg, #eef1f4 0deg)`,
        display: 'grid',
        placeItems: 'center',
        flex: '0 0 auto',
      }}
    >
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: '50%',
          background: '#fff',
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          boxShadow: 'inset 0 0 0 1px #f0f0f0',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color }}>{safePercent}%</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{value}</div>
        </div>
      </div>
    </div>
  )
}

function StockChart({ stock, loading }) {
  const total = stock.total || 0
  const emptyPercent = total ? Math.round((stock.kosong / total) * 100) : 0

  return (
    <Card title="Kondisi Stok Saat Ini" loading={loading} style={{ borderRadius: 8, border: softBorder }}>
      <Space size={20} align="center" style={{ width: '100%' }}>
        <DonutChart
          percent={emptyPercent}
          color={red}
          label="Kosong"
          value={`${stock.kosong} item`}
        />
        <Space direction="vertical" size={12} style={{ flex: 1 }}>
          <MiniBar label="Stok Tersedia" value={stock.ada} max={total || 1} color={green} />
          <MiniBar label="Stok Kosong" value={stock.kosong} max={total || 1} color={red} />
          <Divider style={{ margin: '4px 0' }} />
          <Text type="secondary">Total master barang: {total}</Text>
        </Space>
      </Space>
    </Card>
  )
}

function ProductionProgress({ title, total, done, partial, open, percent, loading }) {
  return (
    <Card loading={loading} style={{ borderRadius: 8, border: softBorder, height: '100%', width: '100%' }}>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Text strong>{title}</Text>
          <Text type="secondary">{total} item</Text>
        </Space>
        <Space size={18} align="center" style={{ width: '100%' }}>
          <DonutChart percent={percent} color={green} label="Selesai" value={`${done}/${total}`} />
          <Space direction="vertical" size={12} style={{ flex: 1 }}>
            <MiniBar label="Selesai" value={done} max={total || 1} color={green} />
            <MiniBar label="Sebagian" value={partial} max={total || 1} color={orange} />
            <MiniBar label="Belum" value={open} max={total || 1} color={red} />
          </Space>
        </Space>
      </Space>
    </Card>
  )
}

function ProfitLossMiniChart({ rows }) {
  const totalProfit = rows.reduce((sum, row) => sum + Math.max(Number(row.laba_rugi || 0), 0), 0)
  const totalLoss = rows.reduce((sum, row) => sum + Math.abs(Math.min(Number(row.laba_rugi || 0), 0)), 0)
  const net = totalProfit - totalLoss
  const statusColor = net >= 0 ? green : red

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <div>
        <Text strong>Profit vs Loss</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>Arah visual laba/rugi dari filter grafik ini.</Text>
      </div>
      <div
        style={{
          borderRadius: 8,
          border: 'none',
          background: '#ffffff',
          boxShadow: 'none',
          overflow: 'hidden',
        }}
      >
        <svg viewBox="0 0 300 132" style={{ width: '100%', height: 118, display: 'block' }}>
          <defs>
            <linearGradient id="profitArrow3d" x1="0" x2="1" y1="1" y2="0">
              <stop offset="0%" stopColor="#75c827" />
              <stop offset="55%" stopColor="#4fb11f" />
              <stop offset="100%" stopColor="#a9df3f" />
            </linearGradient>
            <linearGradient id="lossArrow3d" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#ff4a4a" />
              <stop offset="58%" stopColor="#d41452" />
              <stop offset="100%" stopColor="#a91636" />
            </linearGradient>
            <filter id="profitLossSoftShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="7" dy="9" stdDeviation="5" floodColor="#1f2937" floodOpacity="0.18" />
            </filter>
          </defs>
          <rect x="0" y="0" width="300" height="132" fill="#ffffff" />
          <path d="M 72 36 L 116 64 L 139 54 L 164 86 L 203 112" fill="none" stroke="#8e1730" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" filter="url(#profitLossSoftShadow)" />
          <path d="M 68 32 L 112 60 L 135 50 L 160 82 L 198 107" fill="none" stroke="url(#lossArrow3d)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          <polygon points="197,92 229,119 184,113" fill="url(#lossArrow3d)" filter="url(#profitLossSoftShadow)" />
          <polygon points="193,90 223,115 183,109" fill="#ff3b30" opacity="0.9" />
          <path d="M 55 101 L 88 74 L 112 86 L 144 50 L 168 70 L 221 25" fill="none" stroke="#326d24" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" filter="url(#profitLossSoftShadow)" />
          <path d="M 51 96 L 84 70 L 108 82 L 140 47 L 164 67 L 216 22" fill="none" stroke="url(#profitArrow3d)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
          <polygon points="201,20 236,8 223,43" fill="#326d24" filter="url(#profitLossSoftShadow)" />
          <polygon points="198,18 230,8 219,40" fill="url(#profitArrow3d)" />
          <path d="M 55 92 L 83 70 L 107 81 L 139 47 L 162 66 L 212 23" fill="none" stroke="#d9ff84" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.62" />
        </svg>
        <div style={{ padding: '0 6px 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ color: green, fontWeight: 700, fontSize: 11 }}>Profit {formatCompactCurrency(totalProfit)}</Text>
            <Text style={{ color: red, fontWeight: 700, fontSize: 11 }}>Loss {formatCompactCurrency(totalLoss)}</Text>
          </div>
          <div
            style={{
              marginTop: 7,
              borderRadius: 6,
              padding: '6px 8px',
              background: `${statusColor}12`,
              border: 'none',
            }}
          >
            <Text strong style={{ color: statusColor, fontSize: 12 }}>
              {net >= 0 ? 'Net Profit' : 'Net Loss'} {formatCurrency(Math.abs(net))}
            </Text>
          </div>
        </div>
      </div>
    </Space>
  )
}

function HppTrendChart({ rows, loading, dateRange, onDateChange, onResetDate }) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const width = 900
  const height = 380
  const pad = { top: 34, right: 82, bottom: 54, left: 18 }
  const chartW = width - pad.left - pad.right
  const chartH = height - pad.top - pad.bottom
  const safeRows = rows.length ? rows : [{
    date: '-',
    nilai_jual: 0,
    hpp_total: 0,
    laba_rugi: 0,
    cumulative_laba_rugi: 0,
    asset_purchase_amount: 0,
    building_maintenance_amount: 0,
    salary_expense_amount: 0,
    etoll_expense_amount: 0,
    transport_expense_amount: 0,
    utility_expense_amount: 0,
  }]
  const series = [
    { key: 'nilai_jual', label: 'Pendapatan', color: '#38bdf8', width: 1.8 },
    { key: 'hpp_total', label: 'HPP', color: '#f59e0b', width: 1.7 },
    { key: 'asset_purchase_amount', label: 'Aset', color: '#a78bfa', width: 1.6 },
    { key: 'building_maintenance_amount', label: 'Bangunan', color: '#fb7185', width: 1.6 },
    { key: 'salary_expense_amount', label: 'Gaji', color: '#f472b6', width: 1.6 },
    { key: 'etoll_expense_amount', label: 'E-TOLL', color: '#22d3ee', width: 1.6 },
    { key: 'transport_expense_amount', label: 'BBM/Parkir/Tol', color: '#fb923c', width: 1.6 },
    { key: 'utility_expense_amount', label: 'Listrik/Internet', color: '#60a5fa', width: 1.6 },
  ]
  const candleRows = safeRows.map((row, index) => {
    const close = Number(row.cumulative_laba_rugi || 0)
    const open = index === 0 ? 0 : Number(safeRows[index - 1].cumulative_laba_rugi || 0)
    const daily = Number(row.laba_rugi || 0)
    const spread = Math.max(Math.abs(daily) * 0.22, Math.max(Math.abs(open), Math.abs(close)) * 0.015, 1)
    return {
      ...row,
      open,
      close,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
    }
  })
  const maRows = candleRows.map((row, index) => {
    const start = Math.max(0, index - 4)
    const windowRows = candleRows.slice(start, index + 1)
    return windowRows.reduce((sum, item) => sum + item.close, 0) / windowRows.length
  })
  const allValues = [
    ...candleRows.flatMap(row => [row.open, row.close, row.high, row.low]),
    ...maRows,
    ...series.flatMap(item => safeRows.map(row => Number(row[item.key] || 0))),
  ]
  const minY = Math.min(0, ...allValues)
  const maxY = Math.max(1, ...allValues)
  const yRange = maxY - minY || 1
  const xFor = index => pad.left + (safeRows.length === 1 ? chartW / 2 : (index / (safeRows.length - 1)) * chartW)
  const yFor = value => pad.top + ((maxY - value) / yRange) * chartH
  const zeroY = yFor(0)
  const candleSlot = chartW / Math.max(safeRows.length, 1)
  const candleW = Math.min(12, Math.max(4, candleSlot * 0.42))
  const buildPath = key => {
    const points = safeRows.map((row, index) => ({ x: xFor(index), y: yFor(Number(row[key] || 0)) }))
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
    return points.reduce((path, point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`
      const prev = points[index - 1]
      const midX = (prev.x + point.x) / 2
      return `${path} C ${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`
    }, '')
  }
  const maPath = maRows.map((value, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(value)}`).join(' ')
  const hoverRow = hoverIndex !== null ? safeRows[hoverIndex] : null
  const hoverCandle = hoverIndex !== null ? candleRows[hoverIndex] : null
  const labelEvery = safeRows.length <= 31 ? 1 : Math.max(1, Math.ceil(safeRows.length / 8))
  const formatDateLabel = value => value && value !== '-'
    ? (safeRows.length <= 31 ? dayjs(value).format('D') : dayjs(value).format('DD MMM'))
    : '-'
  const tooltipX = hoverIndex !== null ? xFor(hoverIndex) : 0
  const tooltipLeft = Math.min(Math.max(tooltipX - 130, pad.left + 8), width - pad.right - 260)
  const tooltipTop = 46

  return (
    <Card
      title="Grafik HPP Laba & Beban"
      extra={
        <Space wrap>
          <RangePicker
            value={dateRange}
            format="DD/MM/YYYY"
            allowClear={false}
            onChange={value => onDateChange(value || defaultDateRange())}
            style={{ width: 225 }}
          />
          <Button onClick={onResetDate}>Bulan Ini</Button>
        </Space>
      }
      loading={loading}
      style={{ borderRadius: 8, border: softBorder, height: '100%' }}
    >
      <Row gutter={[18, 18]} align="middle">
        <Col xs={24} xl={17}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: '100%', height: 390, display: 'block', borderRadius: 8 }}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id="cryptoChartBg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="48%" stopColor="#fbfdff" />
                <stop offset="100%" stopColor="#f6fbff" />
              </linearGradient>
              <radialGradient id="easyLogoGlowA" cx="6%" cy="0%" r="68%">
                <stop offset="0%" stopColor="#d41452" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#d41452" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="easyLogoGlowB" cx="92%" cy="4%" r="72%">
                <stop offset="0%" stopColor="#11b7d8" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#11b7d8" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="easyLogoGlowC" cx="62%" cy="100%" r="70%">
                <stop offset="0%" stopColor="#7c3cff" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#7c3cff" stopOpacity="0" />
              </radialGradient>
              <filter id="hppTooltipShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#171c33" floodOpacity="0.16" />
              </filter>
            </defs>
            <rect x={0} y={0} width={width} height={height} rx={8} fill="url(#cryptoChartBg)" />
            <rect x={0} y={0} width={width} height={height} rx={8} fill="url(#easyLogoGlowA)" />
            <rect x={0} y={0} width={width} height={height} rx={8} fill="url(#easyLogoGlowB)" />
            <rect x={0} y={0} width={width} height={height} rx={8} fill="url(#easyLogoGlowC)" />
            {[0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map(tick => {
              const y = pad.top + tick * chartH
              const value = maxY - tick * yRange
              return (
                <g key={tick}>
                  <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(100,116,139,0.13)" />
                  <text x={width - pad.right + 8} y={y + 4} fontSize="10" fill="#697087">
                    {formatCompactCurrency(value)}
                  </text>
                </g>
              )
            })}
            {safeRows.map((row, index) => {
              const x = xFor(index)
              if (index % Math.max(1, Math.ceil(safeRows.length / 18)) !== 0) return null
              return <line key={`vgrid-${row.date}-${index}`} x1={x} x2={x} y1={pad.top} y2={pad.top + chartH} stroke="rgba(100,116,139,0.09)" />
            })}
            <line x1={pad.left} x2={width - pad.right} y1={zeroY} y2={zeroY} stroke="rgba(100,116,139,0.32)" strokeDasharray="4 6" />
            {candleRows.map((row, index) => {
              const x = xFor(index)
              const up = row.close >= row.open
              const color = up ? '#2dd4bf' : '#fb7185'
              const bodyTop = yFor(Math.max(row.open, row.close))
              const bodyBottom = yFor(Math.min(row.open, row.close))
              const bodyH = Math.max(2, bodyBottom - bodyTop)
              return (
                <g key={`candle-${row.date}-${index}`} opacity={0.92}>
                  <line x1={x} x2={x} y1={yFor(row.high)} y2={yFor(row.low)} stroke={color} strokeWidth={1.2} />
                  <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} rx={2} fill={color} />
                </g>
              )
            })}
            <path d={maPath} fill="none" stroke="#eab308" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
            {series.map(item => (
              <path
                key={item.key}
                d={buildPath(item.key)}
                fill="none"
                stroke={item.color}
                strokeWidth={item.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.62}
              />
            ))}
            {safeRows.map((row, index) => (
              <g key={`hover-${row.date}-${index}`}>
                <rect
                  x={xFor(index) - Math.max(8, candleSlot / 2)}
                  y={pad.top}
                  width={Math.max(16, candleSlot)}
                  height={chartH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(index)}
                />
              </g>
            ))}
            {safeRows.map((row, index) => {
              const shouldLabel = index === 0 || index === safeRows.length - 1 || index % labelEvery === 0
              if (!shouldLabel) return null
              return (
                <text key={`label-${row.date}-${index}`} x={xFor(index)} y={height - 18} textAnchor="middle" fontSize="10" fill="#697087">
                  {formatDateLabel(row.date)}
                </text>
              )
            })}
            {safeRows.length <= 31 && (
              <text x={width - pad.right} y={height - 4} textAnchor="end" fontSize="10" fill="#697087">
                Tanggal per hari
              </text>
            )}
            <text x={pad.left + 8} y={22} fontSize="11" fill="#697087">
              Candle: akumulasi laba/rugi | Garis warna: pendapatan, HPP, aset, dan beban
            </text>
            {hoverRow && (
              <g>
                <line x1={tooltipX} x2={tooltipX} y1={pad.top} y2={pad.top + chartH} stroke="rgba(100,116,139,0.34)" strokeDasharray="4 4" />
                <rect
                  x={tooltipLeft}
                  y={tooltipTop}
                  width={260}
                  height={222}
                  rx={8}
                  fill="rgba(255,255,255,0.96)"
                  stroke="rgba(226,232,240,0.95)"
                  filter="url(#hppTooltipShadow)"
                />
                <text x={tooltipLeft + 12} y={tooltipTop + 20} fontSize="12" fontWeight="700" fill="#20243a">
                  {hoverRow.date && hoverRow.date !== '-' ? dayjs(hoverRow.date).format('DD MMMM YYYY') : '-'}
                </text>
                <text x={tooltipLeft + 12} y={tooltipTop + 40} fontSize="11" fill={hoverCandle?.close >= hoverCandle?.open ? '#2dd4bf' : '#fb7185'}>
                  Laba/Rugi: {formatCurrency(hoverRow.laba_rugi)} | Akumulasi: {formatCurrency(hoverRow.cumulative_laba_rugi)}
                </text>
                {series.map((item, index) => (
                  <g key={`tooltip-${item.key}`}>
                    <circle cx={tooltipLeft + 14} cy={tooltipTop + 62 + index * 18} r={3.5} fill={item.color} />
                    <text x={tooltipLeft + 24} y={tooltipTop + 66 + index * 18} fontSize="10.5" fill="#697087">
                      {item.label}: {formatCurrency(hoverRow[item.key])}
                    </text>
                  </g>
                ))}
              </g>
            )}
          </svg>
        </Col>
        <Col xs={24} xl={7}>
          <ProfitLossMiniChart rows={rows} />
        </Col>
      </Row>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Text type="secondary">
          Cara baca: candle hijau/merah menunjukkan perubahan akumulasi laba/rugi. Garis warna menampilkan pendapatan, HPP, aset, dan setiap akun beban secara terpisah.
        </Text>
        <Space wrap size={18}>
          <Text><span style={{ color: '#2dd4bf', fontWeight: 700 }}>Candle</span> Akumulasi Laba/Rugi</Text>
          <Text><span style={{ color: '#eab308', fontWeight: 700 }}>MA</span> Rata-rata 5 hari</Text>
          {series.map(item => (
            <Text key={item.key}>
              <span style={{ color: item.color, fontWeight: 700 }}>{item.label}</span>
            </Text>
          ))}
        </Space>
      </Space>
    </Card>
  )
}

export default function Dashboard() {
  const { user, hasPermission } = useAuth()
  const [summary, setSummary] = useState(emptySummary)
  const [hppTrend, setHppTrend] = useState([])
  const [dateRange, setDateRange] = useState(defaultDateRange)
  const [hppTrendRange, setHppTrendRange] = useState(defaultDateRange)
  const [loading, setLoading] = useState(true)
  const [hppTrendLoading, setHppTrendLoading] = useState(true)
  const summaryRequestRef = useRef(0)
  const canViewStock = hasPermission('stock')
  const canViewSales = hasPermission('penjualan')
  const canViewPurchasing = hasPermission('pembelian') && user?.role !== 'marketing'
  const canViewAccounting = SHOW_DASHBOARD_ACCOUNTING && hasPermission('akuntansi')
  const canViewInvoice = hasPermission('invoice')

  useEffect(() => {
    fetchSummary()
  }, [dateRange])

  useEffect(() => {
    if (canViewAccounting) fetchHppTrend()
  }, [hppTrendRange, canViewAccounting])

  const fetchSummary = async () => {
    const requestId = summaryRequestRef.current + 1
    summaryRequestRef.current = requestId
    try {
      setLoading(true)
      const [dateFrom, dateTo] = dateRange
      const params = {
        date_from: dateFrom.format('YYYY-MM-DD'),
        date_to: dateTo.format('YYYY-MM-DD'),
      }
      const res = await api.get('/api/dashboard-summary', {
        params: { ...params, fast: 1 },
      })
      if (summaryRequestRef.current !== requestId) return
      setSummary({ ...emptySummary, ...res.data })
      setLoading(false)

      api.get('/api/dashboard-summary', { params })
        .then(fullRes => {
          if (summaryRequestRef.current === requestId) {
            setSummary({ ...emptySummary, ...fullRes.data })
          }
        })
        .catch(e => {
          console.error(e)
        })
    } catch (e) {
      console.error(e)
    } finally {
      if (summaryRequestRef.current === requestId) {
        setLoading(false)
      }
    }
  }

  const fetchHppTrend = async () => {
    try {
      setHppTrendLoading(true)
      const [dateFrom, dateTo] = hppTrendRange
      const params = {
        date_from: dateFrom.format('YYYY-MM-DD'),
        date_to: dateTo.format('YYYY-MM-DD'),
      }
      const trendRes = await api.get('/api/hpp/trend', { params })
      setHppTrend(trendRes.data.data || [])
    } catch (trendError) {
      setHppTrend([])
      console.error(trendError)
    } finally {
      setHppTrendLoading(false)
    }
  }

  const periodLabel = useMemo(() => {
    const [dateFrom, dateTo] = dateRange
    return `${dateFrom.format('DD MMM YYYY')} - ${dateTo.format('DD MMM YYYY')}`
  }, [dateRange])

  const profitAfterAsset = (summary.accounting.laba_rugi || 0) - (summary.accounting.asset_purchase_amount || 0)
  const assetReinvestmentPct = summary.accounting.laba_rugi > 0
    ? ((summary.accounting.asset_purchase_amount || 0) / summary.accounting.laba_rugi) * 100
    : 0
  return (
    <div className="easy-dashboard-page" style={{ maxWidth: 1440 }}>
      <div
        style={{
          marginBottom: 20,
          padding: '22px 24px',
          borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(212,20,82,0.12) 0%, rgba(224,24,168,0.09) 32%, rgba(17,183,216,0.11) 72%, rgba(0,169,47,0.10) 100%)',
          border: softBorder,
          boxShadow: '0 18px 42px rgba(23,28,51,0.08)',
        }}
      >
        <Row gutter={[16, 16]} align="middle" justify="space-between">
          <Col>
            <Title level={2} style={{ marginBottom: 4 }}>Dashboard</Title>
            <Text type="secondary">Ringkasan transaksi dan produksi periode {periodLabel}</Text>
          </Col>
          <Col>
            <Space wrap>
              <RangePicker
                value={dateRange}
                format="DD/MM/YYYY"
                allowClear={false}
                onChange={value => setDateRange(value || defaultDateRange())}
              />
              <Button onClick={() => setDateRange(defaultDateRange())}>
                Bulan Ini
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {canViewStock && (
        <ModuleSection
          title="Modul Persediaan"
          subtitle="Ringkasan barang, kategori, dan minimum stok."
          color={cyan}
          icon={<InboxOutlined />}
        >
          <InventoryModule stock={summary.stock} loading={loading} />
        </ModuleSection>
      )}

      {canViewSales && (
        <ModuleSection
          title="Modul Penjualan"
          subtitle="Resume SO, DO, nilai penjualan, produk, dan pelanggan terbesar."
          color={red}
          icon={<ShoppingOutlined />}
        >
          <SalesModule sales={summary.sales} loading={loading} canViewInvoice={canViewInvoice} dateRange={dateRange} />
        </ModuleSection>
      )}

      {canViewPurchasing && (
        <ModuleSection
          title="Modul Pembelian"
          subtitle="Ringkasan transaksi pembelian periode aktif."
          color={green}
          icon={<ShoppingCartOutlined />}
        >
          <PurchasingModule purchasing={summary.purchasing} loading={loading} />
        </ModuleSection>
      )}

      {canViewAccounting && (
        <ModuleSection
          title="Modul Akuntansi"
          subtitle="Nilai jual, HPP, laba rugi, dan aset periode aktif."
          color={purple}
          icon={<DollarOutlined />}
        >
          <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <SummaryCard title="Sisa Setelah Aset" value={formatCurrency(profitAfterAsset)} icon={<DollarOutlined />} color={profitAfterAsset >= 0 ? cyan : red} loading={loading} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <SummaryCard title="Rasio Reinvestasi Aset" value={assetReinvestmentPct.toFixed(2)} suffix="%" icon={<DollarOutlined />} color={assetReinvestmentPct <= 60 ? green : orange} loading={loading} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <SummaryCard title="Produk Laba" value={summary.accounting.profit_products} icon={<DollarOutlined />} color={green} loading={loading} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <SummaryCard title="Jumlah Aset Dibeli" value={summary.accounting.asset_purchase_count} icon={<DollarOutlined />} color={purple} loading={loading} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <SummaryCard title="Nilai Jual Produk" value={formatCurrency(summary.accounting.nilai_jual)} icon={<DollarOutlined />} color={green} loading={loading} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <SummaryCard title="HPP Produk" value={formatCurrency(summary.accounting.hpp_total)} icon={<DollarOutlined />} color={orange} loading={loading} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <SummaryCard title="Laba/Rugi Produk" value={formatCurrency(summary.accounting.laba_rugi)} icon={<DollarOutlined />} color={summary.accounting.laba_rugi >= 0 ? green : red} loading={loading} />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <SummaryCard title="Pembelian Aset" value={formatCurrency(summary.accounting.asset_purchase_amount)} icon={<DollarOutlined />} color={purple} loading={loading} />
          </Col>
          </Row>
        </ModuleSection>
      )}

      {canViewAccounting && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <HppTrendChart
              rows={hppTrend}
              loading={hppTrendLoading}
              dateRange={hppTrendRange}
              onDateChange={setHppTrendRange}
              onResetDate={() => setHppTrendRange(defaultDateRange())}
            />
          </Col>
        </Row>
      )}

    </div>
  )
}
