import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devPort = Number(env.VITE_DEV_PORT || 5173)
  const previewPort = Number(env.VITE_PREVIEW_PORT || 4173)

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: devPort,
      strictPort: false,
      allowedHosts: ['aqpa-easy-mirror.gte.co.id'],
    },
    preview: {
      host: '0.0.0.0',
      port: previewPort,
      strictPort: false,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react'
            }
            if (id.includes('antd') || id.includes('@ant-design')) {
              return 'vendor-antd'
            }
            if (id.includes('axios') || id.includes('dayjs')) {
              return 'vendor-utils'
            }
          },
        },
      },
    },
  }
})
