import { Button, Space } from 'antd'
import { ClockCircleOutlined, LineChartOutlined, RollbackOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function DeliveryViewSwitcher({ active }) {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()

  return (
    <Space.Compact className="delivery-view-switcher">
      {hasPermission('waktu_pengiriman') && (
        <Button
          type={active === 'delivery' ? 'primary' : 'default'}
          icon={<ClockCircleOutlined />}
          onClick={() => navigate('/penjualan/waktu-pengiriman')}
        >
          Waktu Pengiriman
        </Button>
      )}
      {hasPermission('kpi_time_on_delivery') && (
        <Button
          type={active === 'kpi' ? 'primary' : 'default'}
          icon={<LineChartOutlined />}
          onClick={() => navigate('/penjualan/kpi-time-on-delivery')}
        >
          KPI Time On Delivery
        </Button>
      )}
      {hasPermission('kpi_time_on_delivery') && (
        <Button
          type={active === 'delivery-back' ? 'primary' : 'default'}
          icon={<RollbackOutlined />}
          onClick={() => navigate('/penjualan/kpi-delivery-back')}
        >
          KPI Delivery Back
        </Button>
      )}
    </Space.Compact>
  )
}
