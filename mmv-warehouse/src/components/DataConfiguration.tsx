import { Database } from 'lucide-react'
import { configurationErrors } from '@/lib/supabase'

export function ConfigurationRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" role="alert">
        <Database className="mb-4 h-10 w-10 text-navy" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-500">KHO VẬT TƯ MMV</p>
        <h1 className="mt-2 text-2xl font-bold text-navy">Chưa kết nối kho dữ liệu</h1>
        <p className="mt-4 text-slate-700">
          Ứng dụng đang chờ cấu hình kết nối. Chưa thể ghi nhận xuất, nhập kho hoặc tra cứu tồn kho.
          Vui lòng liên hệ người quản trị để hoàn tất thiết lập.
        </p>
        <details className="mt-6 rounded-xl bg-slate-50 p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-navy">Hướng dẫn cho người quản trị</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {configurationErrors.map((error) => <li key={error}>{error}</li>)}
          </ul>
          <p className="mt-3">
            Trong Vercel → mmvwarehouse → Settings → Environment Variables, đặt
            VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY cho Production, sau đó Redeploy.
            Chỉ dùng khóa public anon hoặc publishable của đúng project Supabase.
          </p>
        </details>
        <button className="mt-6 min-h-[48px] rounded-lg bg-navy px-5 py-2 font-semibold text-white" onClick={() => window.location.reload()}>
          Tải lại sau khi cấu hình
        </button>
      </section>
    </main>
  )
}
