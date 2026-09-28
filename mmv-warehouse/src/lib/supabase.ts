import { createClient } from '@supabase/supabase-js'
import { readSupabaseConfig } from '../../config/supabase-env.mjs'

// Không có chế độ dữ liệu mẫu: thiếu hoặc sai cấu hình thì App hiện màn hình
// ConfigurationRequired, không làm gì khác. Bản build production thì bị
// vite.config.ts chặn từ trước (assertSupabaseBuildConfig).
const config = readSupabaseConfig(import.meta.env)
export const isSupabaseConfigured = config.isConfigured
export const configurationErrors = config.errors
export const authStorageKey = isSupabaseConfigured
  ? `mmv.auth.supabase:${new URL(config.url).origin}`
  : 'mmv.auth.unconfigured'

if (!isSupabaseConfigured) {
  console.error('[MMV] ' + config.errors.join(' ') + ' Ứng dụng tạm dừng cho tới khi cấu hình xong.')
}

// A valid inert client keeps imports safe. App blocks routes when configuration is invalid.
export const supabase = createClient(
  isSupabaseConfigured ? config.url : 'http://localhost:54321',
  isSupabaseConfigured ? config.anonKey : 'public-anon-key',
  {
    auth: { persistSession: false },
  }
)
