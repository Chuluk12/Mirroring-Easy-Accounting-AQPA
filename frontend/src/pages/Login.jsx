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
      <Card className="easy-login-card">
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div className="easy-login-logo-wrap">
            <img src="/logo.png" alt="logo" className="easy-login-logo" />
          </div>
          <h2 style={{ margin: '12px 0 4px', color: '#20243a' }}>Easy Dashboard</h2>
          <p style={{ color: '#697087', margin: 0 }}>Accounting Monitoring System</p>
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
        <p style={{ textAlign: 'center', color: '#99a1b3', fontSize: 12, margin: 0 }}>
          (c) 2026 Easy Accounting Monitoring System
        </p>
      </Card>
    </div>
  )
}
