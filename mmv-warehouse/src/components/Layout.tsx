import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, Anchor } from 'lucide-react'
import { useAuth } from '@/store/useAuth'
import { cn } from '@/lib/utils'
import type { Role } from '@/lib/types'

interface NavItem {
  to: string
  label: string
  roles: Role[]
}

const NAV: NavItem[] = [
  { to: '/home', label: 'Trang chủ', roles: ['ktv', 'warehouse', 'manager', 'sales', 'admin'] },
  { to: '/pick', label: 'Lấy vật tư', roles: ['ktv', 'warehouse', 'manager', 'admin'] },
  { to: '/roll', label: 'Cắt cuộn', roles: ['ktv', 'warehouse', 'manager', 'admin'] },
  { to: '/history', label: 'Lịch sử', roles: ['ktv', 'warehouse', 'manager', 'sales', 'admin'] },
  { to: '/vouchers', label: 'Phiếu', roles: ['warehouse', 'manager', 'admin'] },
  { to: '/inventory', label: 'Tồn kho', roles: ['warehouse', 'manager', 'sales', 'admin'] },
  { to: '/movement', label: 'Movement', roles: ['warehouse', 'manager', 'admin'] },
  { to: '/dashboard', label: 'Dashboard', roles: ['manager', 'sales', 'admin'] },
  { to: '/report/weekly', label: 'Báo cáo tuần', roles: ['manager', 'sales', 'warehouse', 'admin'] },
  { to: '/report/user', label: 'Báo cáo KTV', roles: ['manager', 'sales', 'warehouse', 'admin'] },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const navigate = useNavigate()

  const items = NAV.filter((n) => (user ? n.roles.includes(user.role) : false))

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="no-print sticky top-0 z-30 bg-navy text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
            <Anchor className="h-6 w-6" />
          </div>
          <div className="leading-tight">
            <div className="text-lg font-extrabold">Kho MMV</div>
            <div className="text-sm text-white/70">Mermaid Maritime Vietnam</div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {user && (
              <>
                <span className="hidden text-base font-semibold sm:inline">{user.name}</span>
                <button
                  onClick={() => {
                    logout()
                    navigate('/login')
                  }}
                  className="flex min-h-touch items-center gap-2 rounded-lg bg-white/10 px-4 font-semibold hover:bg-white/20"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="hidden sm:inline">Đăng xuất</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Nav */}
        {items.length > 0 && (
          <nav className="border-t border-white/10 bg-navy-dark">
            <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 py-1">
              {items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    cn(
                      'whitespace-nowrap rounded-lg px-4 py-2 text-base font-semibold transition-colors',
                      isActive ? 'bg-white text-navy' : 'text-white/85 hover:bg-white/10'
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
    </div>
  )
}
