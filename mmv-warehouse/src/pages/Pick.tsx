import { useEffect, useMemo, useState } from 'react'
import { Search, Package, Minus, Plus, CheckCircle2, Pencil, List, PenLine, ClipboardPlus } from 'lucide-react'
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
import { fmtQty } from '@/lib/format'

export default function Pick() {
  const user = useAuth((s) => s.user)!
  const [materials, setMaterials] = useState<Material[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const [selected, setSelected] = useState<Material | null>(null)
  const [manualMaterial, setManualMaterial] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualUnit, setManualUnit] = useState('cái')
  const [qty, setQty] = useState(1)
  const [job, setJob] = useState(localStorage.getItem('mmv.job') || '')
  const [manualJob, setManualJob] = useState(false)
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
    setManualMaterial(false)
    setQty(1)
  }

  function chooseManual() {
    setSelected(null)
    setManualMaterial(true)
    setQty(1)
  }

  async function confirm() {
    if ((!selected && !manualMaterial) || !job) return
    setSaving(true)
    const res = manualMaterial
      ? await logManualConsumable(user.id, manualName, manualUnit, qty, job, user.name)
      : await logConsumable(user.id, selected!.code, qty, job, undefined, user.name)
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
      setManualMaterial(false)
      setManualName('')
      setQty(1)
    }, 2000)
  }

  if (loading) return <LoadingScreen />

  // Bước 2/3: đã chọn hàng
  if (selected || manualMaterial) {
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
              {manualMaterial ? (
                <div className="space-y-3 text-left">
                  <div className="flex items-center justify-center gap-2 text-navy"><PenLine className="h-5 w-5" /><span className="text-xl font-extrabold">Nhập tay vật tư chưa có</span></div>
                  <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Tên vật tư, ví dụ: Bu lông M10" className="bg-white text-lg" autoFocus />
                  <Input value={manualUnit} onChange={(e) => setManualUnit(e.target.value)} placeholder="Đơn vị: cái, kg, chai..." className="bg-white text-lg" />
                  <p className="text-center text-sm text-muted-foreground">Vật tư sẽ được tạo với mã tạm để kho bổ sung thông tin sau.</p>
                </div>
              ) : (
                <>
                  <div className="text-2xl font-extrabold text-navy">{selected!.description_vi}</div>
                  <div className="text-base text-muted-foreground">{selected!.code} · còn {fmtQty(selected!.closing_qty)} {selected!.unit}</div>
                </>
              )}
            </div>

            {/* Số lượng */}
            <div>
              <Label>Số lượng ({manualMaterial ? manualUnit || 'đơn vị' : selected!.unit})</Label>
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
              <div className="flex items-center justify-between">
                <Label>Số JOB *</Label>
                <button
                  type="button"
                  onClick={() => { setManualJob((v) => !v); setJob('') }}
                  className="flex items-center gap-1 text-sm font-semibold text-navy hover:underline"
                >
                  {manualJob ? <List className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  {manualJob ? 'Chọn từ danh sách' : 'Nhập tay số JOB'}
                </button>
              </div>
              {manualJob ? (
                <Input
                  value={job}
                  onChange={(e) => setJob(e.target.value)}
                  placeholder="Nhập số JOB, VD: WO26-0900..."
                  className="text-lg"
                />
              ) : (
                <Select value={job} onChange={(e) => setJob(e.target.value)} className="text-lg">
                  <option value="">-- Chọn JOB --</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.job_code}>
                      {j.job_code} {j.vessel ? `· ${j.vessel}` : ''}
                    </option>
                  ))}
                </Select>
              )}
              {!job && <p className="mt-1 text-base text-danger">Phải nhập JOB mới ghi được</p>}
            </div>

            {/* Xác nhận */}
            <Button
              variant="confirm"
              size="xl"
              className="w-full"
              disabled={!job || saving || qty <= 0 || (manualMaterial && (!manualName.trim() || !manualUnit.trim()))}
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
        <button
          onClick={chooseManual}
          className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-navy bg-navy/5 p-3 text-center transition-all active:scale-95 hover:bg-navy/10"
        >
          <ClipboardPlus className="h-8 w-8 text-navy" />
          <span className="text-base font-bold leading-tight text-navy">Nhập tay vật tư chưa có</span>
          <span className="text-sm text-muted-foreground">Tạo mã tạm</span>
        </button>
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
