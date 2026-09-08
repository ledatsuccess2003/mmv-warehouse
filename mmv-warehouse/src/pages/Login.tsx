import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Anchor, ShieldCheck, Eye, EyeOff, Search } from 'lucide-react'
import { getUsers } from '@/lib/api'
import { useAuth } from '@/store/useAuth'
import { toast } from '@/store/useToast'
import type { User } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { LoadingScreen } from '@/components/ui/spinner'

const COLORS = [
  'bg-blue-600', 'bg-emerald-600', 'bg-orange-500', 'bg-violet-600',
  'bg-rose-500', 'bg-teal-600', 'bg-amber-600', 'bg-cyan-600',
  'bg-indigo-500', 'bg-pink-600', 'bg-lime-600', 'bg-fuchsia-600',
]

export default function Login() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [adminOpen, setAdminOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [selectedAdmin, setSelectedAdmin] = useState<User | null>(null)
  const [search, setSearch] = useState('')
  const login = useAuth((s) => s.login)
  const navigate = useNavigate()

  useEffect(() => {
    getUsers().then((res) => {
      if (res.success && res.data) setUsers(res.data)
      else toast.error(res.error ?? 'Không tải được danh sách')
      setLoading(false)
    })
  }, [])

  const workers = users.filter((u) => u.role !== 'admin')
  const admins = users.filter((u) => u.role === 'admin')
  const filtered = useMemo(() => {
    if (!search.trim()) return workers
    const q = search.toLowerCase()
    return workers.filter((u) => u.name.toLowerCase().includes(q))
  }, [workers, search])

  function pickWorker(u: User) {
    login(u)
    navigate('/home')
  }

  function submitAdmin() {
    if (!selectedAdmin) return
    if (password !== selectedAdmin.pin) {
      toast.error('Mật khẩu không đúng')
      return
    }
    login(selectedAdmin)
    navigate('/home')
  }

  function openAdmin(u: User) {
    setSelectedAdmin(u)
    setPassword('')
    setShowPw(false)
  }

  if (loading) return <LoadingScreen label="Đang tải danh sách..." />

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f2b46] via-[#1a3a5c] to-[#0d253f]">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-6">
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <Anchor className="h-9 w-9" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Kho vật tư MMV</h1>
          <p className="mt-1 text-lg text-white/60">Mermaid Maritime Vietnam</p>
          <p className="mt-3 text-base text-white/80">Chọn tên của bạn để bắt đầu</p>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên..."
            className="w-full rounded-xl border border-white/20 bg-white/10 py-3 pl-12 pr-4 text-base text-white placeholder-white/40 outline-none backdrop-blur focus:border-white/40 focus:bg-white/15"
          />
        </div>

        {/* Grid nhân viên */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {filtered.map((u, i) => {
            const initials = u.name.split(' ').slice(-2).map(w => w[0]).join('')
            return (
              <button
                key={u.id}
                onClick={() => pickWorker(u)}
                className="group flex flex-col items-center gap-2 rounded-2xl bg-white/[0.07] p-3 backdrop-blur transition-all hover:bg-white/20 hover:scale-[1.03] active:scale-95"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg ${COLORS[i % COLORS.length]}`}>
                  {initials}
                </div>
                <span className="text-center text-sm font-semibold leading-tight text-white/90 group-hover:text-white">
                  {u.name.split(' ').slice(-2).join(' ')}
                </span>
              </button>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <p className="mt-6 rounded-xl bg-white/10 p-4 text-center text-white/80">
            {search ? 'Không tìm thấy nhân viên' : 'Chưa có nhân viên. Kiểm tra kết nối.'}
          </p>
        )}

        {/* Admin login */}
        <div className="mt-auto pt-6">
          <Button
            variant="outline"
            size="lg"
            className="w-full border-white/30 bg-white/5 text-white hover:bg-white/15"
            onClick={() => setAdminOpen(true)}
          >
            <ShieldCheck className="h-5 w-5" />
            Đăng nhập Admin
          </Button>
        </div>
      </div>

      {/* Dialog Admin */}
      <Dialog
        open={adminOpen}
        onClose={() => { setAdminOpen(false); setSelectedAdmin(null); setPassword('') }}
        title="Đăng nhập Admin"
      >
        {!selectedAdmin ? (
          <div className="space-y-3">
            <p className="text-base text-muted-foreground">Chọn tài khoản:</p>
            <div className="grid grid-cols-3 gap-3">
              {admins.map((u) => (
                <button
                  key={u.id}
                  onClick={() => openAdmin(u)}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-border p-4 hover:border-navy hover:bg-navy/5"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy text-lg font-bold text-white">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <span className="text-base font-bold">{u.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-lg">
              Nhập mật khẩu cho <b>{selectedAdmin.name}</b>
            </p>
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitAdmin()}
                placeholder="Mật khẩu..."
                className="pr-12 text-lg"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPw(!showPw)}
              >
                {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setSelectedAdmin(null)}>
                Quay lại
              </Button>
              <Button variant="confirm" className="flex-1" onClick={submitAdmin}>
                Đăng nhập
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
