import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Cảnh báo rõ ràng khi chưa cấu hình .env
  // (App vẫn chạy để xem giao diện, nhưng mọi query sẽ lỗi)
  console.warn(
    '[MMV] Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY. ' +
      'Hãy sao chép .env.example thành .env và điền khóa Supabase.'
  )
}

export const supabase = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key',
  {
    auth: { persistSession: false },
  }
)

export const isSupabaseConfigured = Boolean(url && anonKey)
