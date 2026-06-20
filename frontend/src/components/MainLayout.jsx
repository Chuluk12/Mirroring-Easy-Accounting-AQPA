import { useEffect, useRef, useState } from 'react'
import { Badge, Dropdown, Layout, Menu, Tag, theme } from 'antd'
import {
  BellOutlined,
  CalculatorOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileTextOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  HistoryOutlined,
  ImportOutlined,
  InboxOutlined,
  InteractionOutlined,
  LineChartOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusCircleOutlined,
  ProjectOutlined,
  SafetyOutlined,
  SendOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import useVisiblePolling from '../hooks/useVisiblePolling'

const { Header, Sider, Content } = Layout

const ROLE_COLOR = {
  admin: 'magenta',
  inventory: 'cyan',
  purchasing: 'orange',
  marketing: 'green',
  akuntansi: 'gold',
  produksi: 'purple',
  ppc: 'geekblue',
}

function DevelopmentMenuLabel({ children }) {
  return (
    <span
      title="Menu masih dalam Pengembangan"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}
    >
      <span>{children}</span>
      <Tag
        color="gold"
        style={{
          marginInlineEnd: 0,
          paddingInline: 5,
          fontSize: 9,
          lineHeight: '16px',
        }}
      >
        Pengembangan
      </Tag>
    </span>
  )
}

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [todayCount, setTodayCount] = useState(0)
  const [backendStatus, setBackendStatus] = useState('checking')
  const previousCollapsedRef = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const { user, logout, hasPermission } = useAuth()

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') {
        logout()
        navigate('/login')
      }
    },
  }

  const canSeeRiwayat = hasPermission('riwayat')

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement)
      setFullscreen(active)
      if (active) {
        setCollapsed(true)
      } else {
        setCollapsed(previousCollapsedRef.current)
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        previousCollapsedRef.current = collapsed
        await document.documentElement.requestFullscreen()
      }
    } catch {
      setFullscreen(Boolean(document.fullscreenElement))
    }
  }

  const fetchNotif = async () => {
    try {
      const res = await api.get('/api/riwayat', {
        params: { limit: 1, offset: 0 },
      })
      setTodayCount(res.data.today_count)
    } catch {
      setTodayCount(0)
    }
  }

  useVisiblePolling(fetchNotif, 30000, canSeeRiwayat, true)

  const checkBackendHealth = async () => {
    try {
      const res = await api.get('/api/health', { timeout: 4000 })
      setBackendStatus(res.data?.status === 'ok' ? 'online' : 'offline')
    } catch {
      setBackendStatus('offline')
    }
  }

  useVisiblePolling(checkBackendHealth, 10000, true, true)

  const buildMenuItems = () => {
    const items = [
      { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    ]

    const persediaanChildren = []
    if (hasPermission('stock')) {
      persediaanChildren.push({ key: '/stock', icon: <InboxOutlined />, label: 'Stok Barang' })
    }
    if (hasPermission('barang-baru')) {
      persediaanChildren.push({ key: '/barang-baru', icon: <PlusCircleOutlined />, label: 'Barang Baru' })
    }
    if (hasPermission('riwayat')) {
      persediaanChildren.push({
        key: '/riwayat',
        icon: <HistoryOutlined />,
        label: (
          <span>
            Riwayat Persediaan{' '}
            {todayCount > 0 && (
              <Badge
                count={todayCount}
                overflowCount={999}
                style={{ marginLeft: 4, backgroundColor: '#d41452', fontSize: 10 }}
              />
            )}
          </span>
        ),
      })
    }
    if (persediaanChildren.length > 0) {
      items.push({
        key: 'persediaan',
        icon: <InboxOutlined />,
        label: 'Persediaan',
        children: persediaanChildren,
      })
    }

    if (hasPermission('pembelian') || hasPermission('permintaan') || hasPermission('penerimaan') || hasPermission('fpb')) {
      const pembelianChildren = []
      if (hasPermission('pembelian')) {
        pembelianChildren.push({ key: '/pembelian/pembelian', icon: <ShoppingCartOutlined />, label: 'Daftar Pembelian' })
      }
      if (hasPermission('permintaan')) {
        pembelianChildren.push({ key: '/pembelian/permintaan', icon: <FileTextOutlined />, label: 'Daftar Permintaan' })
      }
      if (hasPermission('penerimaan')) {
        pembelianChildren.push({ key: '/pembelian/penerimaan', icon: <ImportOutlined />, label: 'Daftar Penerimaan' })
      }
      if (hasPermission('fpb')) {
        pembelianChildren.push({ key: '/pembelian/fpb', icon: <DollarOutlined />, label: 'Daftar FPB' })
      }

      items.push({
        key: 'pembelian-group',
        icon: <ShoppingCartOutlined />,
        label: 'Pembelian',
        children: pembelianChildren,
      })
    }

    const penjualanChildren = []
    if (hasPermission('penjualan_so')) {
      penjualanChildren.push({ key: '/penjualan/penjualan', icon: <ShoppingOutlined />, label: 'Daftar Penjualan' })
    }
    if (hasPermission('penjualan_do')) {
      penjualanChildren.push({ key: '/penjualan/pengiriman', icon: <SendOutlined />, label: 'Daftar Pengiriman' })
    }
    if (hasPermission('invoice')) {
      penjualanChildren.push({ key: '/penjualan/invoice', icon: <FileTextOutlined />, label: 'Daftar Invoice' })
    }
    if (hasPermission('customer')) {
      penjualanChildren.push({ key: '/penjualan/customer', icon: <TeamOutlined />, label: 'Customer' })
    }
    if (hasPermission('salesman')) {
      penjualanChildren.push({ key: '/penjualan/salesman', icon: <UserOutlined />, label: 'Salesman' })
    }
    if ((hasPermission('penjualan') || hasPermission('penjualan_do')) && penjualanChildren.length > 0) {
      items.push({
        key: 'penjualan-group',
        icon: <ShoppingOutlined />,
        label: 'Penjualan',
        children: penjualanChildren,
      })
    }

    if (hasPermission('akuntansi')) {
      items.push({
        key: 'akuntansi-group',
        icon: <CalculatorOutlined />,
        label: 'Akuntansi',
        children: [
          { key: '/akuntansi/profit-loss', icon: <LineChartOutlined />, label: 'Profit & Loss' },
          { key: '/akuntansi/hpp', icon: <DollarOutlined />, label: <DevelopmentMenuLabel>HPP</DevelopmentMenuLabel>, disabled: true },
          { key: '/akuntansi/aset', icon: <CalculatorOutlined />, label: 'Aset' },
          { key: '/akuntansi/beban-gaji', icon: <DollarOutlined />, label: <DevelopmentMenuLabel>Beban</DevelopmentMenuLabel>, disabled: true },
        ],
      })
    }

    if (hasPermission('kolaborasi')) {
      items.push({
        key: 'kolaborasi-group',
        icon: <InteractionOutlined />,
        label: 'Kolaborasi',
        children: [
          { key: '/kolaborasi/liw-pur-mkt', icon: <ShoppingCartOutlined />, label: 'LIW PUR MKT' },
        ],
      })
    }

    if (hasPermission('project')) {
      items.push({
        key: 'project-group',
        icon: <ProjectOutlined />,
        label: 'Project',
        children: [
          { key: '/project/daftar', icon: <ProjectOutlined />, label: 'Daftar Project' },
          { key: '/project/laporan', icon: <FileTextOutlined />, label: 'Laporan Project' },
          { key: '/project/detail', icon: <FileTextOutlined />, label: 'Detail Project' },
        ],
      })
    }

    if (hasPermission('users')) {
      items.push({
        key: 'admin-group',
        icon: <SafetyOutlined />,
        label: 'Administrasi',
        children: [
          { key: '/users', icon: <TeamOutlined />, label: 'User & Permission' },
          { key: '/audit-log', icon: <HistoryOutlined />, label: 'Audit Log' },
        ],
      })
    }

    return items
  }

  const getDefaultOpenKeys = () => {
    const path = location.pathname
    if (['/stock', '/barang-baru', '/riwayat'].includes(path)) return ['persediaan']
    if (path.startsWith('/pembelian')) return ['pembelian-group']
    if (path.startsWith('/penjualan')) return ['penjualan-group']
    if (path.startsWith('/akuntansi')) return ['akuntansi-group']
    if (path.startsWith('/kolaborasi')) return ['kolaborasi-group']
    if (path.startsWith('/project')) return ['project-group']
    if (path === '/users' || path === '/audit-log') return ['admin-group']
    return []
  }

  return (
    <Layout className={`easy-app-shell${fullscreen ? ' is-fullscreen' : ''}`} style={{ minHeight: '100vh', background: '#f4f7fb' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={0}
        width={248}
        className="easy-sider"
      >
        <div className="easy-brand">
          {!collapsed && <div className="easy-brand-panel" />}
          <img src="/logo.png" alt="logo" className="easy-brand-logo" />
          {!collapsed && (
            <div className="easy-brand-copy">
              <div className="easy-brand-title">Easy Dashboard</div>
              <div className="easy-brand-subtitle">Accounting Monitor</div>
            </div>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          className="easy-menu"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={getDefaultOpenKeys()}
          items={buildMenuItems()}
          onClick={({ key }) => {
            if (key.startsWith('/')) navigate(key)
          }}
        />
      </Sider>

      <Layout style={{ background: 'transparent' }}>
        <Header
          className="easy-header"
          style={{ background: token.colorBgContainer }}
        >
          <div className="easy-header-left">
            <button
              type="button"
              className="easy-icon-button easy-sidebar-toggle"
              onClick={() => setCollapsed(value => !value)}
              aria-label={collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
              title={collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
            <button
              type="button"
              className="easy-icon-button easy-fullscreen-button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? 'Keluar layar penuh' : 'Masuk layar penuh'}
              title={fullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
            >
              {fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            </button>
            <div className="easy-header-title">
              <div className="easy-header-mark">
                <DashboardOutlined />
              </div>
              <div>
                <div className="easy-header-name">Easy Accounting</div>
                <div className="easy-header-subtitle">Monitoring System</div>
              </div>
            </div>
          </div>

          <div className="easy-header-actions">
            <Tag
              color={backendStatus === 'online' ? 'green' : backendStatus === 'checking' ? 'blue' : 'red'}
              style={{ marginInlineEnd: 4 }}
            >
              {backendStatus === 'online' ? 'Backend Online' : backendStatus === 'checking' ? 'Cek Backend' : 'Backend Offline'}
            </Tag>
            {hasPermission('riwayat') && (
              <Badge count={todayCount} overflowCount={999}>
                <button
                  type="button"
                  className="easy-icon-button"
                  onClick={() => navigate('/riwayat')}
                  aria-label="Riwayat persediaan hari ini"
                >
                  <BellOutlined />
                </button>
              </Badge>
            )}
            <Dropdown menu={userMenu} placement="bottomRight">
              <span className="easy-user-chip">
                <UserOutlined className="easy-user-icon" />
                <span className="easy-user-name">{user?.name}</span>
                <Tag color={ROLE_COLOR[user?.role] || 'default'} className="easy-user-role">
                  {user?.role?.toUpperCase()}
                </Tag>
              </span>
            </Dropdown>
          </div>
        </Header>

        <Content className="easy-content" style={{ margin: 24, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
