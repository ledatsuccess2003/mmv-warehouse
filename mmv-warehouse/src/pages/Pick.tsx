import { useEffect, useMemo, useState } from 'react'
import { Search, Package, Minus, Plus, CheckCircle2, Pencil, List, ClipboardPlus, Trash2, Clock3 } from 'lucide-react'
import { getConsumableMaterials, getJobs, logConsumable, logManualConsumable } from '@/lib/api'
import { useAuth } from '@/store/useAuth'
import { toast } from '@/store/useToast'
import type { Job, Material } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtDateTime, fmtQty } from '@/lib/format'

type CartItem = { key: string; material?: Material; name: string; unit: string; qty: number; manual: boolean }

export default function Pick() {
  const user = useAuth((s) => s.user)!
  const [materials, setMaterials] = useState<Material[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [job, setJob] = useState(localStorage.getItem('mmv.job') || '')
  const [manualJob, setManualJob] = useState(true)
  const [manualName, setManualName] = useState('')
  const [manualUnit, setManualUnit] = useState('cái')
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    Promise.all([getConsumableMaterials(), getJobs(true)]).then(([m, j]) => {
      if (m.success && m.data) setMaterials(m.data)
      if (j.success && j.data) setJobs(j.data)
      setLoading(false)
    })
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return materials
    return materials.filter((m) => (m.description_vi ?? '').toLowerCase().includes(s) || (m.description ?? '').toLowerCase().includes(s) || m.code.toLowerCase().includes(s))
  }, [materials, q])

  function addMaterial(material: Material) {
    setCart((items) => {
      const existing = items.find((item) => item.material?.code === material.code)
      return existing
        ? items.map((item) => item.key === existing.key ? { ...item, qty: item.qty + 1 } : item)
        : [...items, { key: material.code, material, name: material.description_vi ?? material.description ?? material.code, unit: material.unit ?? 'đơn vị', qty: 1, manual: false }]
    })
  }

  function addManual() {
    const name = manualName.trim()
    const unit = manualUnit.trim()
    if (!name || !unit) return toast.error('Hãy nhập tên và đơn vị tính của vật tư')
    setCart((items) => [...items, { key: `manual-${Date.now()}`, name, unit, qty: 1, manual: true }])
    setManualName('')
    setManualUnit('cái')
  }

  function updateQty(key: string, delta: number) {
    setCart((items) => items.map((item) => item.key === key ? { ...item, qty: Math.max(1, item.qty + delta) } : item))
  }

  async function confirm() {
    if (!job.trim()) return toast.error('Hãy nhập số JOB trước khi chốt sổ')
    if (!cart.length) return toast.error('Hãy thêm ít nhất một vật tư')
    setSaving(true)
    const occurredAt = new Date().toISOString()
    const errors: string[] = []
    const warnings: string[] = []
    for (const item of cart) {
      const result = item.manual
        ? await logManualConsumable(user.id, item.name, item.unit, item.qty, job.trim(), user.name, occurredAt)
        : await logConsumable(user.id, item.material!.code, item.qty, job.trim(), undefined, user.name, occurredAt)
      if (!result.success) errors.push(`${item.name}: ${result.error ?? 'ghi thất bại'}`)
      if (result.warning) warnings.push(result.warning)
    }
    setSaving(false)
    if (errors.length) return toast.error(errors.join(' · '))
    localStorage.setItem('mmv.job', job.trim())
    setCart([])
    toast.success(`Đã chốt ${cart.length} vật tư lúc ${fmtDateTime(occurredAt)}`)
    warnings.forEach((warning) => toast.error(warning))
  }

  if (loading) return <LoadingScreen />

  return (
    <div>
      <PageHeader title="Lấy vật tư" subtitle="Chọn nhiều vật tư, rồi chốt sổ một lần" back="/home" right={<div className="hidden items-center gap-2 rounded-xl bg-navy/5 px-3 py-2 text-sm font-bold text-navy sm:flex"><Clock3 className="h-4 w-4" /> {fmtDateTime(now)}</div>} />
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-navy/15 bg-navy/5 px-3 py-2 text-sm font-bold text-navy sm:hidden"><Clock3 className="h-4 w-4" /> {fmtDateTime(now)}</div>

      <div className="grid gap-5 xl:grid-cols-[1fr_430px]">
        <section>
          <div className="relative mb-4"><Search className="absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Tìm vật tư để thêm vào phiếu..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-11 text-lg" /></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((m) => <button key={m.id} onClick={() => addMaterial(m)} className="flex min-h-[126px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-navy hover:shadow-md active:scale-95"><Package className="h-8 w-8 text-navy" /><span className="text-base font-bold leading-tight text-foreground">{m.description_vi}</span><span className="text-sm text-muted-foreground">còn {fmtQty(m.closing_qty)} {m.unit}</span><span className="text-xs font-bold text-navy">+ Thêm vào phiếu</span></button>)}
          </div>
          {filtered.length === 0 && <p className="py-10 text-center text-lg text-muted-foreground">Không tìm thấy vật tư nào</p>}

          <div className="mt-5 rounded-2xl border-2 border-dashed border-navy/35 bg-navy/5 p-4">
            <div className="mb-3 flex items-center gap-2 text-navy"><ClipboardPlus className="h-5 w-5" /><h2 className="font-extrabold">Nhập tay vật tư chưa có</h2></div>
            <div className="grid gap-3 sm:grid-cols-[1fr_130px_auto]"><Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Tên vật tư chưa có trong danh mục" /><Input value={manualUnit} onChange={(e) => setManualUnit(e.target.value)} placeholder="Đơn vị" /><Button onClick={addManual}><Plus className="h-5 w-5" /> Thêm</Button></div>
          </div>
        </section>

        <aside className="h-fit rounded-3xl border border-navy/15 bg-card p-4 shadow-lg xl:sticky xl:top-28">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-extrabold text-navy">Phiếu lấy vật tư</h2><span className="rounded-full bg-navy px-3 py-1 text-sm font-bold text-white">{cart.length} hàng</span></div>
          <div className="max-h-[38vh] space-y-2 overflow-y-auto pr-1">
            {cart.length === 0 && <p className="rounded-xl bg-muted p-5 text-center text-muted-foreground">Chưa có vật tư. Bấm “Thêm vào phiếu” để bắt đầu.</p>}
            {cart.map((item) => <div key={item.key} className="rounded-xl border border-border p-3"><div className="flex gap-2"><div className="min-w-0 flex-1"><p className="truncate font-bold text-navy">{item.name}</p><p className="text-sm text-muted-foreground">{item.manual ? 'Mã tạm · cần kho bổ sung' : item.material!.code} · {item.unit}</p></div><button aria-label={`Xóa ${item.name}`} onClick={() => setCart((items) => items.filter((x) => x.key !== item.key))} className="text-danger"><Trash2 className="h-5 w-5" /></button></div><div className="mt-2 flex items-center justify-between"><span className="text-sm font-semibold">Số lượng</span><div className="flex items-center gap-2"><Button variant="outline" size="icon" className="h-9 w-9" onClick={() => updateQty(item.key, -1)}><Minus className="h-4 w-4" /></Button><span className="min-w-8 text-center text-lg font-extrabold">{fmtQty(item.qty)}</span><Button variant="outline" size="icon" className="h-9 w-9" onClick={() => updateQty(item.key, 1)}><Plus className="h-4 w-4" /></Button></div></div></div>)}
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between"><Label>Số JOB *</Label><button type="button" onClick={() => { setManualJob((v) => !v); setJob('') }} className="flex items-center gap-1 text-sm font-bold text-navy hover:underline">{manualJob ? <List className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}{manualJob ? 'Chọn danh sách JOB' : 'Nhập tay số JOB'}</button></div>
            {manualJob ? <Input value={job} onChange={(e) => setJob(e.target.value)} placeholder="Ưu tiên nhập tay, VD: WO26-0900" className="text-lg" autoCapitalize="characters" /> : <Select value={job} onChange={(e) => setJob(e.target.value)} className="text-lg"><option value="">-- Chọn JOB --</option>{jobs.map((j) => <option key={j.id} value={j.job_code}>{j.job_code} {j.vessel ? `· ${j.vessel}` : ''}</option>)}</Select>}
            {!job.trim() && <p className="mt-1 text-sm font-medium text-danger">Cần có JOB để chốt sổ</p>}
          </div>
          <Button variant="confirm" size="xl" className="mt-5 w-full" disabled={!cart.length || !job.trim() || saving} onClick={confirm}><CheckCircle2 className="h-7 w-7" />{saving ? 'Đang chốt sổ...' : 'CHỐT SỔ & XÁC NHẬN'}</Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">Thời điểm chốt: {fmtDateTime(now)}</p>
        </aside>
      </div>
    </div>
  )
}
