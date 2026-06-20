import { createContext, useContext, useState, useEffect } from 'react'
import api, { clearAuthToken, setAuthToken } from '../api/client'

const AuthContext = createContext(null)

const PERMISSION_PARENTS = {
  salesman: 'penjualan',
  customer: 'penjualan',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    if (token && savedUser) {
      setAuthToken(token)
      setUser(JSON.parse(savedUser))
      api.get('/api/me')
        .then(res => {
          localStorage.setItem('user', JSON.stringify(res.data))
          setUser(res.data)
        })
        .catch(() => {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          clearAuthToken()
          setUser(null)
        })
        .finally(() => setLoading(false))
      return
    }
    setLoading(false)
  }, [])

  const login = async (username, password) => {
    const res = await api.post('/api/login', { username, password })
    const { token, user } = res.data
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    setAuthToken(token)
    setUser(user)
    return user
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    clearAuthToken()
    setUser(null)
  }

  const hasPermission = (module) => {
    if (!user) return false
    if (user.role === 'admin') return true
    const permissions = user.permissions || []
    const parentModule = PERMISSION_PARENTS[module]
    return permissions.includes(module) || (parentModule && permissions.includes(parentModule))
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermission, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
