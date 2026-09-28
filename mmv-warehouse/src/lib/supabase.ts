import { createClient } from '@supabase/supabase-js'
import { readSupabaseConfig } from '../../config/supabase-env.mjs'

// An explicit demo build must never use the real project from a local .env.
const config = readSupabaseConfig(import.meta.env.MODE === 'demo' ? {} : import.meta.env)
export const isSupabaseConfigured = config.isConfigured
export const configurationErrors = config.errors
export const isDemoMode = !isSupabaseConfigured && (import.meta.env.DEV || import.meta.env.MODE === 'demo')
export const authStorageKey = isSupabaseConfigured
  ? `mmv.auth.supabase:${new URL(config.url).origin}`
  : 'mmv.auth.demo'

if (!isSupabaseConfigured) {
  console.warn('[MMV] ' + config.errors.join(' ') + (isDemoMode
    ? ' Đang dùng dữ liệu mẫu; thay đổi không được lưu lên kho chung.'
    : ' Ứng dụng tạm dừng để tránh ghi nhận bằng dữ liệu mẫu.'))
}

// A valid inert client keeps imports safe. App blocks routes when configuration is invalid.
export const supabase = createClient(
  isSupabaseConfigured ? config.url : 'http://localhost:54321',
  isSupabaseConfigured ? config.anonKey : 'public-anon-key',
  {
    auth: { persistSession: false },
  }
)
