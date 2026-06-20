import { useEffect, useState } from 'react'
import {
  Badge, Button, Card, Checkbox, Col, Divider, Form, Input,
  Modal, Popconfirm, Row, Select, Space, Table, Tag, Typography, message
} from 'antd'
import {
  DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined,
  SafetyOutlined, TeamOutlined, UserOutlined
} from '@ant-design/icons'
import api from '../api/client'
import { withTableSorters } from '../utils/tableSorters'

const { Text } = Typography
const { Option } = Select

const MODULE_META = {
  dashboard:     { label: 'Dashboard',          color: 'blue' },
  stock:         { label: 'Stok Barang',         color: 'cyan' },
  'barang-baru': { label: 'Barang Baru',         color: 'geekblue' },
  riwayat:       { label: 'Riwayat Persediaan',  color: 'purple' },
  penjualan:     { label: 'Dashboard Penjualan',  color: 'green' },
  penjualan_so:  { label: 'Daftar Penjualan',     color: 'green' },
  penjualan_do:  { label: 'Daftar Pengiriman',    color: 'cyan' },
  invoice:       { label: 'Daftar Invoice',       color: 'volcano' },
  customer:      { label: 'Customer',             color: 'green' },
  salesman:      { label: 'Salesman',             color: 'geekblue' },
  pembelian:     { label: 'Daftar Pembelian',    color: 'orange' },
  permintaan:    { label: 'Daftar Permintaan',   color: 'cyan' },
  penerimaan:    { label: 'Daftar Penerimaan',   color: 'blue' },
  fpb:           { label: 'Daftar FPB',          color: 'volcano' },
  kolaborasi:    { label: 'Kolaborasi',          color: 'lime' },
  project:       { label: 'Project',             color: 'purple' },
  akuntansi:     { label: 'Akuntansi',           color: 'gold' },
  hpp:           { label: 'HPP',                 color: 'gold' },
  aset:          { label: 'Aset',                color: 'cyan' },
  beban_gaji:    { label: 'Beban Gaji',          color: 'volcano' },
  beban_etoll:   { label: 'Beban E-TOLL',        color: 'magenta' },
  beban_transport: { label: 'Beban Transport',   color: 'orange' },
  beban_utilitas: { label: 'Beban Utilitas',     color: 'blue' },
  users:         { label: 'User & Permission',   color: 'red' },
  audit:         { label: 'Audit Log',           color: 'magenta' },
}

const MODULE_OPTIONS = Object.entries(MODULE_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}))

const ROLE_COLOR = {
  admin: 'red',
  inventory: 'blue',
  purchasing: 'orange',
  marketing: 'green',
  akuntansi: 'gold',
  produksi: 'purple',
  ppc: 'geekblue',
}

const roleColor = (role) => ROLE_COLOR[role] || 'default'

export default function Users() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState({})
  const [availableColumns, setAvailableColumns] = useState({})
  const [columnParents, setColumnParents] = useState({})
  const [columnPermissions, setColumnPermissions] = useState({})
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savingRole, setSavingRole] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [previewRole, setPreviewRole] = useState(null)
  const [editingRole, setEditingRole] = useState('')
  const [form] = Form.useForm()
  const [roleForm] = Form.useForm()
  const [passwordForm] = Form.useForm()

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/users')
      setUsers(res.data)
    } catch (e) {
      message.error('Gagal memuat data user')
    } finally {
      setLoading(false)
    }
  }

  const fetchRoles = async () => {
    try {
      const res = await api.get('/api/roles')
      setRoles(res.data || {})
      const colRes = await api.get('/api/column-permissions')
      setAvailableColumns(colRes.data.available || {})
      setColumnParents(colRes.data.parents || {})
      setColumnPermissions(colRes.data.permissions || {})
    } catch (e) {
      message.error('Gagal memuat data role')
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [])

  const handleAdd = async (values) => {
    setSaving(true)
    try {
      const res = await api.post('/api/users', values)
      message.success(res.data.message)
      setModalOpen(false)
      form.resetFields()
      setPreviewRole(null)
      fetchUsers()
    } catch (e) {
      message.error(e.response?.data?.message || 'Gagal menambah user')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/users/${id}`)
      message.success('User berhasil dihapus')
      fetchUsers()
    } catch (e) {
      message.error('Gagal menghapus user')
    }
  }

  const openPasswordModal = (user) => {
    setSelectedUser(user)
    passwordForm.resetFields()
    setPasswordModalOpen(true)
  }

  const handleChangePassword = async (values) => {
    if (!selectedUser) return
    setSavingPassword(true)
    try {
      const res = await api.put(`/api/users/${selectedUser.id}/password`, {
        password: values.password,
      })
      message.success(res.data.message)
      setPasswordModalOpen(false)
      setSelectedUser(null)
      passwordForm.resetFields()
    } catch (e) {
      message.error(e.response?.data?.message || 'Gagal mengganti password')
    } finally {
      setSavingPassword(false)
    }
  }

  const openRoleModal = (role = '') => {
    setEditingRole(role)
    roleForm.setFieldsValue({
      role,
      modules: roles[role] || ['dashboard'],
      column_permissions: columnPermissions[role] || {},
    })
    setRoleModalOpen(true)
  }

  const handleSaveRole = async (values) => {
    setSavingRole(true)
    try {
      const modules = Array.from(new Set([...(values.modules || []), 'dashboard']))
      const res = await api.post('/api/roles', {
        role: editingRole || values.role,
        modules,
        column_permissions: values.column_permissions || {},
      })
      message.success(res.data.message)
      setRoleModalOpen(false)
      setEditingRole('')
      roleForm.resetFields()
      fetchRoles()
    } catch (e) {
      message.error(e.response?.data?.message || 'Gagal menyimpan role')
    } finally {
      setSavingRole(false)
    }
  }

  const handleDeleteRole = async (role) => {
    try {
      const res = await api.delete(`/api/roles/${role}`)
      message.success(res.data.message)
      fetchRoles()
    } catch (e) {
      message.error(e.response?.data?.message || 'Gagal menghapus role')
    }
  }

  const columns = [
    {
      title: '#',
      dataIndex: 'id',
      key: 'id',
      width: 50,
      render: val => <Text type="secondary">{val}</Text>,
    },
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      render: val => (
        <span>
          <UserOutlined style={{ marginRight: 6, color: '#1a73e8' }} />
          <Text strong>{val}</Text>
        </span>
      ),
    },
    {
      title: 'Nama',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: val => (
        <Tag color={roleColor(val)} icon={<SafetyOutlined />}>
          {val?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Akses Modul',
      key: 'permissions',
      render: (_, rec) => {
        const perms = roles[rec.role] || []
        return (
          <Space size={[4, 4]} wrap>
            {perms.map(module => (
              <Tag key={module} color={MODULE_META[module]?.color || 'default'} style={{ fontSize: 11, margin: 2 }}>
                {MODULE_META[module]?.label || module}
              </Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 160,
      render: (_, rec) => (
        rec.username === 'admin' ? (
          <Button size="small" icon={<KeyOutlined />} onClick={() => openPasswordModal(rec)}>
            Ganti Password
          </Button>
        ) : (
          <Space>
            <Button size="small" icon={<KeyOutlined />} onClick={() => openPasswordModal(rec)}>
              Password
            </Button>
            <Popconfirm
              title={`Hapus user "${rec.name}"?`}
              description="Tindakan ini tidak dapat dibatalkan."
              onConfirm={() => handleDelete(rec.id)}
              okText="Hapus"
              cancelText="Batal"
              okButtonProps={{ danger: true }}
            >
              <Button danger size="small" icon={<DeleteOutlined />}>Hapus</Button>
            </Popconfirm>
          </Space>
        )
      ),
    },
  ]

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {Object.entries(roles).map(([role, modules]) => (
          <Col xs={24} sm={12} md={6} key={role}>
            <Card size="small">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Tag color={roleColor(role)} style={{ fontWeight: 'bold' }}>
                  {role.toUpperCase()}
                </Tag>
                <Badge
                  count={users.filter(u => u.role === role).length}
                  showZero
                  color={roleColor(role)}
                  title={`${users.filter(u => u.role === role).length} user`}
                />
              </div>
              <Space size={[2, 2]} wrap>
                {modules.map(module => (
                  <Tag key={module} color={MODULE_META[module]?.color} style={{ fontSize: 10, padding: '0 4px' }}>
                    {MODULE_META[module]?.label || module}
                  </Tag>
                ))}
              </Space>
              <Divider style={{ margin: '10px 0 8px' }} />
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openRoleModal(role)}>
                  Edit
                </Button>
                {role !== 'admin' && (
                  <Popconfirm
                    title={`Hapus role "${role}"?`}
                    description="Role hanya bisa dihapus jika belum dipakai user."
                    onConfirm={() => handleDeleteRole(role)}
                    okText="Hapus"
                    cancelText="Batal"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      Hapus
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        title={
          <span>
            <TeamOutlined style={{ marginRight: 8 }} />
            Manajemen User
          </span>
        }
        extra={
          <Space>
            <Button icon={<SafetyOutlined />} onClick={() => openRoleModal('')}>
              Tambah Role
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => { setModalOpen(true); form.resetFields(); setPreviewRole(null) }}
            >
              Tambah User
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={withTableSorters(columns)}
          dataSource={users}
          loading={loading}
          size="middle"
          pagination={false}
        />
      </Card>

      <Modal
        title={<span><PlusOutlined style={{ marginRight: 8 }} />Tambah User Baru</span>}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setPreviewRole(null) }}
        footer={null}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleAdd} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Nama Lengkap" rules={[{ required: true, message: 'Masukkan nama!' }]}>
            <Input prefix={<UserOutlined />} placeholder="Contoh: Budi Santoso" />
          </Form.Item>

          <Form.Item name="username" label="Username" rules={[{ required: true, message: 'Masukkan username!' }]}>
            <Input placeholder="Contoh: budi.santoso" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: 'Masukkan password!' },
              { min: 6, message: 'Minimal 6 karakter!' },
            ]}
          >
            <Input.Password prefix={<KeyOutlined />} placeholder="Min. 6 karakter" />
          </Form.Item>

          <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Pilih role!' }]}>
            <Select placeholder="Pilih role user" onChange={val => setPreviewRole(val)} showSearch>
              {Object.keys(roles).map(role => (
                <Option key={role} value={role}>
                  <Tag color={roleColor(role)}>{role.toUpperCase()}</Tag>
                  {role === 'admin' ? 'Akses penuh' : `${roles[role]?.length || 0} modul`}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {previewRole && (
            <>
              <Divider style={{ margin: '8px 0 12px' }} />
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <SafetyOutlined style={{ marginRight: 4 }} />
                  Modul yang dapat diakses:
                </Text>
                <div style={{ marginTop: 6 }}>
                  <Space size={[4, 4]} wrap>
                    {(roles[previewRole] || []).map(module => (
                      <Tag key={module} color={MODULE_META[module]?.color || 'default'}>
                        {MODULE_META[module]?.label || module}
                      </Tag>
                    ))}
                  </Space>
                </div>
              </div>
            </>
          )}

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setModalOpen(false); setPreviewRole(null) }}>
                Batal
              </Button>
              <Button type="primary" htmlType="submit" loading={saving}>
                Simpan User
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={<span><KeyOutlined style={{ marginRight: 8 }} />Ganti Password</span>}
        open={passwordModalOpen}
        onCancel={() => { setPasswordModalOpen(false); setSelectedUser(null); passwordForm.resetFields() }}
        footer={null}
        width={460}
      >
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword} style={{ marginTop: 16 }}>
          <Text type="secondary">
            User: <Text strong>{selectedUser?.username}</Text>
          </Text>
          <Form.Item
            name="password"
            label="Password Baru"
            style={{ marginTop: 16 }}
            rules={[
              { required: true, message: 'Masukkan password baru!' },
              { min: 6, message: 'Minimal 6 karakter!' },
            ]}
          >
            <Input.Password prefix={<KeyOutlined />} placeholder="Min. 6 karakter" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="Konfirmasi Password"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Ulangi password baru!' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve()
                  return Promise.reject(new Error('Konfirmasi password tidak sama'))
                },
              }),
            ]}
          >
            <Input.Password prefix={<KeyOutlined />} placeholder="Ulangi password baru" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setPasswordModalOpen(false); setSelectedUser(null); passwordForm.resetFields() }}>
                Batal
              </Button>
              <Button type="primary" htmlType="submit" loading={savingPassword}>
                Simpan Password
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={<span><SafetyOutlined style={{ marginRight: 8 }} />Role & Permission</span>}
        open={roleModalOpen}
        onCancel={() => { setRoleModalOpen(false); setEditingRole('') }}
        footer={null}
        width={620}
      >
        <Form form={roleForm} layout="vertical" onFinish={handleSaveRole} style={{ marginTop: 16 }}>
          <Form.Item
            name="role"
            label="Nama Role"
            normalize={val => (val || '').trim().toLowerCase()}
            rules={[
              { required: true, message: 'Masukkan nama role!' },
              { pattern: /^[a-z0-9_-]+$/, message: 'Gunakan huruf kecil, angka, underscore, atau strip.' },
            ]}
          >
            <Input placeholder="Contoh: finance, manager, supervisor_gudang" disabled={!!editingRole} />
          </Form.Item>

          <Form.Item
            name="modules"
            label="Akses Modul"
            rules={[{ required: true, message: 'Pilih minimal satu modul!' }]}
          >
            <Checkbox.Group style={{ width: '100%' }}>
              <Row gutter={[8, 8]}>
                {MODULE_OPTIONS.map(opt => (
                  <Col xs={24} sm={12} key={opt.value}>
                    <Checkbox value={opt.value} disabled={opt.value === 'dashboard'}>
                      <Tag color={MODULE_META[opt.value]?.color || 'default'} style={{ marginLeft: 4 }}>
                        {opt.label}
                      </Tag>
                    </Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>

          <Form.Item shouldUpdate={(prev, cur) => prev.modules !== cur.modules}>
            {({ getFieldValue }) => {
              const selectedModules = getFieldValue('modules') || []
              const configurableModules = Object.keys(availableColumns)
                .filter(module => module !== 'penjualan')
                .filter(module => (
                  selectedModules.includes(module)
                  || (columnParents[module] !== 'penjualan' && selectedModules.includes(columnParents[module] || module))
                ))
              if (configurableModules.length === 0) return null

              return (
                <div>
                  <Divider style={{ margin: '8px 0 14px' }} />
                  <Text strong>Filter Kolom Transaksi</Text>
                  <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 12 }}>
                    Jika tidak dipilih, role akan melihat semua kolom. Jika dipilih, hanya kolom tersebut yang dikirim dan ditampilkan.
                  </Text>
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    {configurableModules.map(module => (
                      <Form.Item
                        key={module}
                        name={['column_permissions', module]}
                        label={MODULE_META[module]?.label || module.replace(/_/g, ' ').toUpperCase()}
                        style={{ marginBottom: 0 }}
                      >
                        <Checkbox.Group style={{ width: '100%' }}>
                          <Row gutter={[8, 8]}>
                            {availableColumns[module].map(columnKey => (
                              <Col xs={24} sm={12} key={columnKey}>
                                <Checkbox value={columnKey}>
                                  <Tag color={MODULE_META[module]?.color || 'default'} style={{ marginLeft: 4 }}>
                                    {columnKey}
                                  </Tag>
                                </Checkbox>
                              </Col>
                            ))}
                          </Row>
                        </Checkbox.Group>
                      </Form.Item>
                    ))}
                  </Space>
                </div>
              )
            }}
          </Form.Item>

          <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
            Dashboard otomatis aktif untuk setiap role. Role admin tetap dianggap akses penuh oleh sistem.
          </Text>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setRoleModalOpen(false); setEditingRole('') }}>Batal</Button>
              <Button type="primary" htmlType="submit" loading={savingRole}>
                Simpan Role
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
