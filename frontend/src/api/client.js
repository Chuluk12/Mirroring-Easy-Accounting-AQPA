import axios from 'axios'

const DEFAULT_API_PORT = import.meta.env.VITE_API_PORT || '5000'

function getDefaultApiBaseURL() {
  if (typeof window === 'undefined') {
    return `http://localhost:${DEFAULT_API_PORT}`
  }

  return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_API_PORT}`
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || getDefaultApiBaseURL(),
  timeout: 90000,
})

export function getApiErrorMessage(error, fallback = 'Gagal memuat data') {
  if (error.code === 'ECONNABORTED') {
    return 'API terlalu lama merespons. Coba persempit filter tanggal atau pastikan backend/database tidak sedang berat.'
  }

  if (!error.response) {
    return 'Tidak bisa terhubung ke API. Pastikan backend aktif dan IP di .env sudah benar.'
  }

  return error.response?.data?.error || error.response?.data?.message || fallback
}

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  }
}

export function clearAuthToken() {
  delete api.defaults.headers.common.Authorization
}

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      clearAuthToken()

      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }

    return Promise.reject(error)
  },
)

export default api
