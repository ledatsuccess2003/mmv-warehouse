// Dùng cấu hình Vitest để giữ alias chung cho app và kiểm thử.
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { assertSupabaseBuildConfig } from './config/supabase-env.mjs'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    // Build nào cũng phải có cấu hình Supabase hợp lệ - kể cả trên Vercel.
    // Thiếu thì build hỏng ngay, thay vì deploy một bản không có dữ liệu.
    assertSupabaseBuildConfig(loadEnv(mode, process.cwd(), 'VITE_'))
  }
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: { host: true, port: 5173 },
    preview: { host: true, port: 4173 },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      setupFiles: ['src/test/setup.ts'],
      // Không để kiểm thử dùng cấu hình kho thật từ máy lập trình.
      // Các test API còn mock module Supabase làm lớp chặn thứ hai.
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    },
  }
})
