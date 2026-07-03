import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import { AuthProvider, useAuth } from './context/AuthContext'
import MainLayout from './components/MainLayout'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Stock = lazy(() => import('./pages/Stock'))
const BarangBaru = lazy(() => import('./pages/BarangBaru'))
const Riwayat = lazy(() => import('./pages/Riwayat'))
const RiwayatPartNumber = lazy(() => import('./pages/Persediaan/RiwayatPartNumber'))
const Users = lazy(() => import('./pages/Users'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const Login = lazy(() => import('./pages/Login'))

// Sub-halaman Pembelian
const DaftarPermintaan = lazy(() => import('./pages/Pembelian/DaftarPermintaan'))
const DaftarPembelian = lazy(() => import('./pages/Pembelian/DaftarPembelian'))
const DaftarPenerimaan = lazy(() => import('./pages/Pembelian/DaftarPenerimaan'))
const DaftarFPB = lazy(() => import('./pages/Pembelian/DaftarFPB'))

// Sub-halaman Penjualan
const DaftarPenjualan = lazy(() => import('./pages/Penjualan/DaftarPenjualan'))
const ModulPengiriman = lazy(() => import('./pages/Penjualan/ModulPengiriman'))
const DaftarPengiriman = lazy(() => import('./pages/Penjualan/DaftarPengiriman'))
const WaktuPengiriman = lazy(() => import('./pages/Penjualan/WaktuPengiriman'))
const KPITimeOnDelivery = lazy(() => import('./pages/Penjualan/KPITimeOnDelivery'))
const KPIDeliveryBack = lazy(() => import('./pages/Penjualan/KPIDeliveryBack'))
const DaftarInvoice = lazy(() => import('./pages/Penjualan/DaftarInvoice'))
const Customer = lazy(() => import('./pages/Penjualan/Customer'))
const Salesman = lazy(() => import('./pages/Penjualan/Salesman'))
const KelengkapanDokumen = lazy(() => import('./pages/Penjualan/KelengkapanDokumen'))

const HPP = lazy(() => import('./pages/Akuntansi/HPP'))
const ProfitLoss = lazy(() => import('./pages/Akuntansi/ProfitLoss'))
const Aset = lazy(() => import('./pages/Akuntansi/Aset'))
const BebanGaji = lazy(() => import('./pages/Akuntansi/BebanGaji'))
const LIWPurMkt = lazy(() => import('./pages/Kolaborasi/LIWPurMkt'))
const DaftarProject = lazy(() => import('./pages/Project/DaftarProject'))
const LaporanProject = lazy(() => import('./pages/Project/LaporanProject'))
const DetailProject = lazy(() => import('./pages/Project/DetailProject'))

function PrivateRoute({ children, module }) {
  const { user, loading, hasPermission } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" />
  if (module && !hasPermission(module)) return <Navigate to="/" />
  return children
}

function HomeRoute() {
  const { hasPermission } = useAuth()
  if (hasPermission('dashboard')) return <Dashboard />
  if (hasPermission('akuntansi')) return <Navigate to="/akuntansi/profit-loss" replace />
  if (hasPermission('project')) return <Navigate to="/project/daftar" replace />
  return null
}

function AppRoutes() {
  const { hasPermission } = useAuth()
  const pembelianIndex = hasPermission('pembelian') ? '/pembelian/pembelian' : '/pembelian/permintaan'

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
          <Route index element={<HomeRoute />} />
          <Route path="stock"       element={<PrivateRoute module="stock"><Stock /></PrivateRoute>} />
          <Route path="siinas/*" element={<Navigate to="/" replace />} />
          <Route path="barang-baru" element={<PrivateRoute module="barang-baru"><BarangBaru /></PrivateRoute>} />
          <Route path="riwayat"     element={<PrivateRoute module="riwayat"><Riwayat /></PrivateRoute>} />
          <Route path="riwayat-part-number" element={<PrivateRoute module="stock"><RiwayatPartNumber /></PrivateRoute>} />
          <Route path="users"       element={<PrivateRoute module="users"><Users /></PrivateRoute>} />
          <Route path="audit-log"   element={<PrivateRoute module="audit"><AuditLog /></PrivateRoute>} />

          {/* Sub-menu Pembelian */}
          <Route path="pembelian/permintaan" element={<PrivateRoute module="permintaan"><DaftarPermintaan /></PrivateRoute>} />
          <Route path="pembelian/pembelian"  element={<PrivateRoute module="pembelian"><DaftarPembelian /></PrivateRoute>} />
          <Route path="pembelian/penerimaan" element={<PrivateRoute module="penerimaan"><DaftarPenerimaan /></PrivateRoute>} />
          <Route path="pembelian/fpb"        element={<PrivateRoute module="fpb"><DaftarFPB /></PrivateRoute>} />
          <Route path="pembelian" element={<Navigate to={pembelianIndex} replace />} />

          {/* Sub-menu Penjualan */}
          <Route path="penjualan/penjualan"  element={<PrivateRoute module="penjualan_so"><DaftarPenjualan /></PrivateRoute>} />
          <Route path="penjualan/modul-pengiriman" element={<PrivateRoute module="penjualan_do"><ModulPengiriman /></PrivateRoute>} />
          <Route path="penjualan/pengiriman" element={<PrivateRoute module="penjualan_do"><DaftarPengiriman /></PrivateRoute>} />
          <Route path="penjualan/waktu-pengiriman" element={<PrivateRoute module="waktu_pengiriman"><WaktuPengiriman /></PrivateRoute>} />
          <Route path="penjualan/kpi-time-on-delivery" element={<PrivateRoute module="kpi_time_on_delivery"><KPITimeOnDelivery /></PrivateRoute>} />
          <Route path="penjualan/kpi-delivery-back" element={<PrivateRoute module="kpi_time_on_delivery"><KPIDeliveryBack /></PrivateRoute>} />
          <Route path="penjualan/invoice"    element={<PrivateRoute module="invoice"><DaftarInvoice /></PrivateRoute>} />
          <Route path="penjualan/customer"   element={<PrivateRoute module="customer"><Customer /></PrivateRoute>} />
          <Route path="penjualan/salesman"   element={<PrivateRoute module="salesman"><Salesman /></PrivateRoute>} />
          <Route path="penjualan/kelengkapan-dokumen" element={<PrivateRoute module="penjualan_so"><KelengkapanDokumen /></PrivateRoute>} />
          <Route path="penjualan" element={<Navigate to="/penjualan/penjualan" replace />} />

          <Route path="manufaktur/*" element={<Navigate to="/" replace />} />
          <Route path="spk" element={<Navigate to="/" replace />} />

          {/* Sub-menu Akuntansi */}
          <Route path="akuntansi/profit-loss" element={<PrivateRoute module="akuntansi"><ProfitLoss /></PrivateRoute>} />
          <Route path="akuntansi/hpp" element={<PrivateRoute module="akuntansi"><HPP /></PrivateRoute>} />
          <Route path="akuntansi/aset" element={<PrivateRoute module="akuntansi"><Aset /></PrivateRoute>} />
          <Route path="akuntansi/beban-gaji" element={<PrivateRoute module="akuntansi"><BebanGaji /></PrivateRoute>} />
          <Route path="akuntansi" element={<Navigate to="/akuntansi/profit-loss" replace />} />

          {/* Sub-menu Kolaborasi */}
          <Route path="kolaborasi/liw-pur-mkt" element={<PrivateRoute module="kolaborasi"><LIWPurMkt /></PrivateRoute>} />
          <Route path="kolaborasi" element={<Navigate to="/kolaborasi/liw-pur-mkt" replace />} />

          {/* Sub-menu Project */}
          <Route path="project/daftar" element={<PrivateRoute module="project"><DaftarProject /></PrivateRoute>} />
          <Route path="project/laporan" element={<PrivateRoute module="project"><LaporanProject /></PrivateRoute>} />
          <Route path="project/detail" element={<PrivateRoute module="project"><DetailProject /></PrivateRoute>} />
          <Route path="project" element={<Navigate to="/project/daftar" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#d41452',
          colorSuccess: '#00a92f',
          colorInfo: '#11b7d8',
          colorWarning: '#ff7a00',
          colorError: '#f2293a',
          colorBgLayout: '#f4f7fb',
          colorText: '#20243a',
          colorTextSecondary: '#697087',
          borderRadius: 8,
          wireframe: false,
        },
        components: {
          Layout: {
            bodyBg: '#f4f7fb',
            headerBg: 'rgba(255,255,255,0.88)',
            siderBg: '#14172b',
          },
          Card: {
            headerBg: 'transparent',
            borderRadiusLG: 8,
          },
          Button: {
            borderRadius: 8,
            controlHeight: 36,
          },
          Table: {
            headerBg: '#f7f9fd',
            headerColor: '#343a56',
            rowHoverBg: '#fff5f8',
          },
          Menu: {
            darkItemBg: '#14172b',
            darkSubMenuItemBg: '#101326',
            darkItemSelectedBg: '#d41452',
            darkItemSelectedColor: '#ffffff',
            darkItemHoverBg: 'rgba(255,255,255,0.08)',
          },
        },
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
