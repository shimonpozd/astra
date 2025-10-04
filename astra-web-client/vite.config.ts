import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:7030',
        changeOrigin: true,
        secure: false,
      },
      '/admin': {
        target: 'http://localhost:7030',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/admin/, '/api/admin')
      }
    }
  }
})