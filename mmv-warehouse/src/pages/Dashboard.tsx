import { useEffect, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, AreaChart, Area,
} from 'recharts'
import {
  getDashboardStats, getTopIssued, getWeeklyTrend, getExpiryAlerts,
  getStockAlerts, getTodayLogs, getUsers,
} from '@/lib/api'
import { toast } from '@/store/useToast'
import { useAuth } from '@/store/useAuth'
import type { Material, User, ConsumableLog } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtQty, fmtDate, fmtTime, fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Package, AlertTriangle, ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react'

type Stats = { totalMaterials: number; lowStock: number; issueThisMonth: number; receiptThisMonth: number }
type TopRow = { code: string; description: string; total: number }
type WeekRow = { week: string; issue: number; receipt: number }
type ExpiryRow = Material & { months_left: number }
type LogRow = ConsumableLog & { material?: Material }

export default function Dashboard() {
  const user = useAuth((s) => s.user)!
  const [stats, setStats] = useState<Stats | null>(null)
  const [top, setTop] = useState<TopRow[]>([])
  const [trend, setTrend] = useState<WeekRow[]>([])
  const [expiry, setExpiry] = useState<ExpiryRow[]>([])
  const [lowStock, setLowStock] = useState<Material[]>([])
  const [recentLogs, setRecentLogs] = useState<LogRow[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getDashboardStats(),
      getTopIssued(10),
      getWeeklyTrend(),
      getExpiryAlerts(18),
      getStockAlerts(),
      getUsers(),
    ]).then(async ([s, t, w, e, l, u]) => {
      if (s.success && s.data) setStats(s.data)
      if (t.success && t.data) setTop(t.data)
      if (w.success && w.data) setTrend(w.data)
      if (e.success && e.data) setExpiry(e.data)
      if (l.success && l.data) setLowStock(l.data.slice(0, 10))
      if (u.success && u.data) {
        setAllUsers(u.data)
        const ktvs = u.data.filter(x => x.role === 'ktv')
        const allLogs: LogRow[] = []
        for (const ktv of ktvs.slice(0, 10)) {
          const r = await getTodayLogs(ktv.id)
          if (r.success && r.data) {
            allLogs.push(...r.data.map(log => ({ ...log, _userName: ktv.name } as any)))
          }
        }
        setRecentLogs(allLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 15))
      }
      if (!s.success) toast.error(s.error ?? 'Không tải được dashboard')
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingScreen />

  const kpis = [
    {
      icon: Package, label: 'Tổng mã hàng', value: stats?.totalMaterials ?? 0,
      bg: 'bg-blue-50', iconBg: 'bg-blue-500', text: 'text-blue-700',
    },
    {
      icon: AlertTriangle, label: 'Hàng tồn thấp', value: stats?.lowStock ?? 0,
      bg: 'bg-amber-50', iconBg: 'bg-amber-500', text: 'text-amber-700',
    },
    {
      icon: ArrowUpRight, label: 'Tổng xuất tháng', value: stats?.issueThisMonth ?? 0,
      bg: 'bg-red-50', iconBg: 'bg-red-500', text: 'text-red-700',
    },
    {
      icon: ArrowDownLeft, label: 'Tổng nhập tháng', value: stats?.receiptThisMonth ?? 0,
      bg: 'bg-emerald-50', iconBg: 'bg-emerald-500', text: 'text-emerald-700',
    },
  ]

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Chào buổi sáng' : now.getHours() < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'

  return (
    <div>
      {/* Header */}
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-navy to-[#2a6db5] p-6 text-white shadow-lg">
        <h1 className="text-2xl font-extrabold">DASHBOARD TỒN KHO & XUẤT NHẬP</h1>
        <p className="mt-1 text-white/70">{greeting}, {user.name} (Quản lý)</p>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={cn('flex items-center gap-4 rounded-2xl p-4 shadow-sm', k.bg)}>
            <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white', k.iconBg)}>
              <k.icon className="h-6 w-6" />
            </div>
            <div>
              <div className={cn('text-2xl font-extrabold', k.text)}>{fmtQty(k.value)}</div>
              <div className="text-sm font-medium text-muted-foreground">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* Weekly trend - Area chart */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-navy">XU THẾ NHẬP - XUẤT KHO (Tuần này)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="gradIssue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradReceipt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="week" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 13 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="receipt" stroke="#3b82f6" fill="url(#gradReceipt)" strokeWidth={2.5} name="Nhập kho" />
              <Area type="monotone" dataKey="issue" stroke="#ef4444" fill="url(#gradIssue)" strokeWidth={2.5} name="Xuất kho" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Top issued - horizontal bar */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-navy">NHÂN VIÊN XUẤT KHO NHIỀU NHẤT</h3>
          {top.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-muted-foreground">
              Chưa có dữ liệu xuất kho
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={top} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="code" width={100} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill="#1F4E79" name="Số lượng" radius={[0, 6, 6, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Activity + Alerts row */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* Recent activity */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-navy" />
            <h3 className="text-lg font-bold text-navy">HOẠT ĐỘNG XUẤT KHO GẦN NHẤT</h3>
          </div>
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <THead>
                <TR>
                  <TH>Nhân viên</TH>
                  <TH>Vật tư</TH>
                  <TH className="text-right">SL</TH>
                  <TH>Giờ</TH>
                </TR>
              </THead>
              <TBody>
                {recentLogs.length === 0 && (
                  <TR><TD colSpan={4} className="py-6 text-center text-muted-foreground">Hôm nay chưa có hoạt động</TD></TR>
                )}
                {recentLogs.map((l) => {
                  const userName = (l as any)._userName ?? allUsers.find(u => u.id === l.user_id)?.name ?? '?'
                  return (
                    <TR key={l.id}>
                      <TD className="font-semibold">{userName}</TD>
                      <TD>{l.material?.description_vi ?? l.material_code}</TD>
                      <TD className="text-right font-bold text-danger">{fmtQty(l.qty)}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{fmtTime(l.timestamp)}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </div>
        </div>

        {/* Low stock alerts */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-bold text-navy">CẢNH BÁO TỒN KHO THẤP</h3>
          </div>
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <THead>
                <TR>
                  <TH>Tên vật tư</TH>
                  <TH>Mã</TH>
                  <TH className="text-right">Tồn hiện tại</TH>
                  <TH className="text-right">Ngưỡng</TH>
                </TR>
              </THead>
              <TBody>
                {lowStock.length === 0 && (
                  <TR><TD colSpan={4} className="py-6 text-center text-muted-foreground">Tồn kho ổn định</TD></TR>
                )}
                {lowStock.map((m) => (
                  <TR key={m.id} className={Number(m.closing_qty) <= 5 ? 'bg-red-50' : 'bg-amber-50/60'}>
                    <TD className="font-semibold">{m.description_vi}</TD>
                    <TD className="font-mono text-xs text-muted-foreground">{m.code}</TD>
                    <TD className="text-right">
                      <span className={cn(
                        'inline-block min-w-[3rem] rounded-full px-3 py-0.5 text-center text-sm font-bold text-white',
                        Number(m.closing_qty) <= 5 ? 'bg-red-500' : 'bg-amber-500'
                      )}>
                        {fmtQty(m.closing_qty)}
                      </span>
                    </TD>
                    <TD className="text-right text-muted-foreground">{m.min_stock}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Expiry alerts */}
      {expiry.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-navy">⏰ CẢNH BÁO HẠN SỬ DỤNG</h3>
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Tên vật tư</TH>
                  <TH>HSD</TH>
                  <TH className="text-right">Còn (tháng)</TH>
                  <TH>Trạng thái</TH>
                </TR>
              </THead>
              <TBody>
                {expiry.map((m) => (
                  <TR key={m.id}>
                    <TD className="font-mono">{m.code}</TD>
                    <TD className="font-semibold">{m.description_vi}</TD>
                    <TD className="whitespace-nowrap">{fmtDate(m.expiry_date)}</TD>
                    <TD className="text-right font-bold">{m.months_left}</TD>
                    <TD>
                      <span className={cn(
                        'inline-block rounded-full px-3 py-0.5 text-xs font-bold',
                        m.months_left < 6 ? 'bg-red-100 text-red-700' :
                        m.months_left < 14 ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      )}>
                        {m.months_left < 6 ? 'Sắp hết hạn' : m.months_left < 14 ? 'Cần theo dõi' : 'Còn thời gian'}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
