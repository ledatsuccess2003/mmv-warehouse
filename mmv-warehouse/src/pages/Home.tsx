import { Link } from 'react-router-dom'
import { Grab, Scissors, ClipboardList, FileText, Boxes, LayoutDashboard, BarChart3, Users, ArrowDownUp } from 'lucide-react'
import { useAuth } from '@/store/useAuth'

const BIG = [
  { to: '/pick', icon: Grab, label: 'LẤY VẬT TƯ', emoji: '🧤', color: 'bg-confirm' },
  { to: '/roll', icon: Scissors, label: 'CẮT CUỘN', emoji: '✂️', color: 'bg-navy' },
  { to: '/history', icon: ClipboardList, label: 'LỊCH SỬ HÔM NAY', emoji: '📋', color: 'bg-navy-light' },
]

const ADMIN_LINKS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', color: 'text-blue-600' },
  { to: '/inventory', icon: Boxes, label: 'Tồn kho', color: 'text-emerald-600' },
  // Vat tu ngoai tieu hao - chi admin, nen chi co o day, khong co trong STAFF.
  { to: '/stock', icon: ArrowDownUp, label: 'Nhập/Xuất kho', color: 'text-sky-600' },
  { to: '/vouchers', icon: FileText, label: 'Phiếu xuất/nhập', color: 'text-orange-600' },
  { to: '/movement', icon: BarChart3, label: 'Movement', color: 'text-violet-600' },
  { to: '/report/weekly', icon: ClipboardList, label: 'Báo cáo tuần', color: 'text-teal-600' },
  { to: '/report/user', icon: Users, label: 'Báo cáo KTV', color: 'text-rose-600' },
]

const STAFF = [
  { to: '/vouchers', icon: FileText, label: 'Phiếu xuất/nhập', roles: ['warehouse', 'manager'] },
  { to: '/inventory', icon: Boxes, label: 'Tồn kho', roles: ['warehouse', 'manager', 'sales'] },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['manager', 'sales'] },
]

export default function Home() {
  const user = useAuth((s) => s.user)!
  const isAdmin = user.role === 'admin'

  if (isAdmin) {
    return (
      <div>
        <div className="mb-6 rounded-3xl border border-white/70 bg-white/70 p-5 shadow-sm backdrop-blur sm:p-6">
          <p className="mb-1 text-sm font-bold uppercase tracking-[0.12em] text-navy-light">MMV Warehouse</p>
          <h1 className="text-2xl font-extrabold text-navy">Xin chào, {user.name} 👋</h1>
          <p className="text-lg text-muted-foreground">Quản trị hệ thống kho vật tư</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {ADMIN_LINKS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card/90 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-navy hover:shadow-md active:scale-[0.98]"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-muted ${a.color}`}>
                <a.icon className="h-6 w-6" />
              </div>
              <span className="text-lg font-bold text-navy">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 rounded-3xl border border-white/70 bg-white/70 p-5 shadow-sm backdrop-blur sm:p-6">
        <p className="mb-1 text-sm font-bold uppercase tracking-[0.12em] text-navy-light">MMV Warehouse</p>
        <h1 className="text-2xl font-extrabold text-navy">Xin chào, {user.name} 👋</h1>
        <p className="text-lg text-muted-foreground">Chọn việc cần làm</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {BIG.map((b) => (
          <Link
            key={b.to}
            to={b.to}
            className={`group relative flex min-h-[160px] overflow-hidden flex-col items-center justify-center gap-3 rounded-3xl ${b.color} p-6 text-white shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl active:scale-95`}
          >
            <span className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/10 transition-transform group-hover:scale-125" />
            <span className="relative text-5xl">{b.emoji}</span>
            <span className="relative text-xl font-extrabold tracking-wide">{b.label}</span>
          </Link>
        ))}
      </div>

      {user.role !== 'ktv' && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-muted-foreground">Quản lý</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {STAFF.filter((s) => s.roles.includes(user.role)).map((s) => (
              <Link
                key={s.to}
                to={s.to}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card/90 p-4 font-bold text-navy shadow-sm transition-all hover:-translate-y-0.5 hover:border-navy hover:shadow-md"
              >
                <s.icon className="h-7 w-7" />
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
