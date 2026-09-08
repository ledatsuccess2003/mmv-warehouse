import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // cho phép điện thoại/máy khác trong LAN truy cập
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
