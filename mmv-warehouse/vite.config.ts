// defineConfig lay tu 'vitest/config' chu khong phai 'vite': ban nay la
// ban cua vite co them khoa `test`. Nho vay alias '@' chi khai o MOT cho
// cho ca app lan test - them mot file vitest.config.ts rieng se thanh
// cho thu ba phai giu dong bo (xem CLAUDE.md), sinh lech som muon.
import { defineConfig } from 'vitest/config'
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
  test: {
    // Chi test tang du lieu (src/lib), khong render component, nen khong
    // can jsdom - moi truong node nhe hon va khoi them testing-library.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    // Tat cac bien VITE_* khi chay test. supabase.ts doc import.meta.env
    // de dat isSupabaseConfigured; may dev CO .env that, neu khong chan
    // thi test se goi thang len Supabase that. Cac file test con
    // vi.mock('@/lib/supabase') lam lop chan thu hai.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
})
