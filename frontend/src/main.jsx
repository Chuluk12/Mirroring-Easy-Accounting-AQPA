import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import idID from 'antd/locale/id_ID'
import App from './App'
import 'antd/dist/reset.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider locale={idID} theme={{
      token: { colorPrimary: '#1a73e8' }
    }}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
)