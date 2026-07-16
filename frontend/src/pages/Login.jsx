import { useState } from 'react'
import { Button, Card, Form, Input, message } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../api/client'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const user = await login(values.username, values.password)
      message.success(`Selamat datang, ${user.name}!`)
      navigate('/')
    } catch (e) {
      message.error(getApiErrorMessage(e, 'Username atau password salah!'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="easy-login">
      <div className="easy-login-pattern" />
      <div className="easy-login-shell">
        <section className="easy-login-showcase">
          <div className="easy-login-showcase-top">
            <img src="/aqpa-indonesia-logo.png" alt="AQPA Indonesia" className="easy-login-wordmark" />
          </div>
          <div className="easy-login-showcase-copy">
            <span className="easy-login-kicker">Integrated Business Monitoring</span>
            <h1>AQPA Indonesia Dashboard</h1>
            <p>Kontrol data accounting, persediaan, pembelian, penjualan, dan project dalam satu ruang kerja.</p>
          </div>
          <div className="easy-login-metrics" aria-hidden="true">
            <span>ERP</span>
            <span>Finance</span>
            <span>Operations</span>
          </div>
        </section>
        <Card className="easy-login-card">
          <div className="easy-login-card-head">
            <div className="easy-login-logo-wrap">
              <img src="/aqpa-indonesia-logo.png" alt="AQPA Indonesia" className="easy-login-logo" />
            </div>
            <h2>Masuk Dashboard</h2>
            <p>Gunakan akun internal AQPA Indonesia</p>
          </div>
          <Form onFinish={onFinish} layout="vertical">
            <Form.Item name="username" rules={[{ required: true, message: 'Masukkan username!' }]}>
              <Input prefix={<UserOutlined />} placeholder="Username" size="large" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: 'Masukkan password!' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                Login
              </Button>
            </Form.Item>
          </Form>
          <p className="easy-login-footer">
            (c) 2026 AQPA Indonesia Monitoring System
          </p>
        </Card>
      </div>
    </div>
  )
}
