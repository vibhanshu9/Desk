import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../', '')
  const signalingPort = env.SIGNALING_PORT || '3000'

  return {
    plugins: [react()],
    // Load .env from repo root
    envDir: '../',
    server: {
      port: 5173,
      host: true,
      proxy: {
        // Proxy WebSocket signaling through same origin (avoids CORS & mixed-content)
        '/ws': {
          target: `http://localhost:${signalingPort}`,
          ws: true,
          changeOrigin: true,
        },
        '/health': {
          target: `http://localhost:${signalingPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  }
})
