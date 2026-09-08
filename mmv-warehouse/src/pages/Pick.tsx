import { useEffect, useMemo, useState } from 'react'
import { Search, Package, Minus, Plus, CheckCircle2 } from 'lucide-react'
import { getConsumableMaterials, getJobs, logConsumable } from '@/lib/api'
import { useAuth } from '@/store/useAuth'
import { toast } from '@/store/useToast'
import type { Job, Material } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtQty } from '@/lib/format'

export default function Pick() {
  const user = useAuth((s) => s.user)!
  const [materials, setMaterials] = useState<Material[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const [selected, setSelected] = useState<Material | null>(null)
  const [qty, setQty] = useState(1)
  const [job, setJob] = useState(localStorage.getItem('mmv.job') || '')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    Promise.all([getConsumableMaterials(), getJobs(true)]).then(([m, j]) => {
      if (m.success && m.data) setMaterials(m.data)
      if (j.success && j.data) setJobs(j.data)
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return materials
    return materials.filter(
      (m) =>
        (m.description_vi ?? '').toLowerCase().includes(s) ||
        (m.description ?? '').toLowerCase().includes(s) ||
        m.code.toLowerCase().includes(s)
    )
  }, [materials, q])

  function choose(m: Material) {
    setSelected(m)
    setQty(1)
  }

  async function confirm() {
    if (!selected || !job) return
    setSaving(true)
    const res = await logConsumable(user.id, selected.code, qty, job)
    setSaving(false)
    if (!res.success) {
      toast.error(res.error ?? 'Ghi thất bại')
      return
    }
    localStorage.setItem('mmv.job', job)
    if (res.warning) toast.error(res.warning)
    setDone(true)
    setTimeout(() => {
      setDone(false)
      setSelected(null)
      setQty(1)
    }, 2000)
  }

  if (loading) return <LoadingScreen />

  // Bước 2/3: đã chọn hàng
  if (selected) {
    return (
      <div>
        <PageHeader title="Lấy vật tư" subtitle="Bước 2: Nhập số lượng & chọn JOB" back={() => setSelected(null)} />

        {done ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-confirm/10 py-16 text-confirm-dark animate-fade-in">
            <CheckCircle2 className="h-20 w-20 text-confirm" />
            <p className="text-2xl font-extrabold">✅ Đã ghi!</p>
          </div>
        ) : (
          <div className="mx-auto max-w-lg space-y-6">
            {/* Tên hàng */}
            <div className="rounded-2xl border-2 border-navy bg-navy/5 p-5 text-center">
              <div className="text-2xl font-extrabold text-navy">{selected.description_vi}</div>
              <div className="text-base text-muted-foreground">
                {selected.code} · còn {fmtQty(selected.closing_qty)} {selected.unit}
              </div>
            </div>

            {/* Số lượng */}
            <div>
              <Label>Số lượng ({selected.unit})</Label>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" className="h-14 w-14" onClick={() => setQty((n) => Math.max(1, n - 1))}>
                  <Minus className="h-7 w-7" />
                </Button>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="h-14 text-center text-3xl font-extrabold"
                />
                <Button variant="outline" size="icon" className="h-14 w-14" onClick={() => setQty((n) => n + 1)}>
                  <Plus className="h-7 w-7" />
                </Button>
              </div>
            </div>

            {/* JOB */}
            <div>
              <Label>Chọn JOB *</Label>
              <Select value={job} onChange={(e) => setJob(e.target.value)} className="text-lg">
                <option value="">-- Chọn JOB --</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.job_code}>
                    {j.job_code} {j.vessel ? `· ${j.vessel}` : ''}
                  </option>
                ))}
              </Select>
              {!job && <p className="mt-1 text-base text-danger">Phải chọn JOB mới ghi được</p>}
            </div>

            {/* Xác nhận */}
            <Button
              variant="confirm"
              size="xl"
              className="w-full"
              disabled={!job || saving || qty <= 0}
              onClick={confirm}
            >
              <CheckCircle2 className="h-7 w-7" />
              {saving ? 'Đang ghi...' : 'XÁC NHẬN'}
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Bước 1: chọn hàng
  return (
    <div>
      <PageHeader title="Lấy vật tư" subtitle="Bước 1: Chọn vật tư" back="/home" />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tìm vật tư..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-11 text-lg"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((m) => (
          <button
            key={m.id}
            onClick={() => choose(m)}
            className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card p-3 text-center transition-all active:scale-95 hover:border-navy"
          >
            <Package className="h-8 w-8 text-navy" />
            <span className="text-base font-bold leading-tight text-foreground">{m.description_vi}</span>
            <span className="text-sm text-muted-foreground">còn {fmtQty(m.closing_qty)} {m.unit}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 && <p className="py-10 text-center text-lg text-muted-foreground">Không tìm thấy vật tư nào</p>}
    </div>
  )
}
