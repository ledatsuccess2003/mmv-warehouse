import { useEffect, useMemo, useState } from 'react'
import { Scissors, Pencil, List } from 'lucide-react'
import { getActiveRolls, getJobs, logRollCut } from '@/lib/api'
import { useAuth } from '@/store/useAuth'
import { toast } from '@/store/useToast'
import type { Job, Material, RollTracking } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtQty } from '@/lib/format'

type Roll = RollTracking & { material?: Material }

export default function Roll() {
  const user = useAuth((s) => s.user)!
  const [rolls, setRolls] = useState<Roll[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [rollId, setRollId] = useState('')
  const [length, setLength] = useState<number>(0)
  const [job, setJob] = useState(localStorage.getItem('mmv.job') || '')
  const [manualJob, setManualJob] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load() {
    const [r, j] = await Promise.all([getActiveRolls(), getJobs(true)])
    if (r.success && r.data) {
      setRolls(r.data)
      if (r.data.length && !r.data.some((x) => x.roll_id === rollId)) setRollId(r.data[0].roll_id)
    }
    if (j.success && j.data) setJobs(j.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const roll = useMemo(() => rolls.find((r) => r.roll_id === rollId), [rolls, rollId])
  const remaining = roll ? Number(roll.total_length) - Number(roll.used_length) : 0
  const usedPct = roll ? (Number(roll.used_length) / Number(roll.total_length)) * 100 : 0

  async function confirm() {
    if (!roll || !job || length <= 0) return
    if (length > remaining) {
      toast.error(`Chỉ còn ${fmtQty(remaining)} ${roll.material?.unit}, không cắt được ${length}`)
      return
    }
    setSaving(true)
    const res = await logRollCut(roll.roll_id, user.id, job, length, user.name)
    setSaving(false)
    if (!res.success) {
      toast.error(res.error ?? 'Ghi thất bại')
      return
    }
    localStorage.setItem('mmv.job', job)
    toast.success(`✅ Đã cắt ${length}${roll.material?.unit}. Còn ${fmtQty(res.data!.remaining)}`)
    if (res.data!.finished) toast.info('Cuộn đã hết — chuyển sang "đã dùng xong"')
    setLength(0)
    load()
  }

  if (loading) return <LoadingScreen />

  return (
    <div>
      <PageHeader title="Cắt cuộn" subtitle="Vật tư cuộn dài — cắt theo mét" back="/home" />

      {rolls.length === 0 ? (
        <p className="py-12 text-center text-lg text-muted-foreground">Không có cuộn nào đang hoạt động.</p>
      ) : (
        <div className="mx-auto max-w-lg space-y-6">
          <div>
            <Label>Chọn cuộn</Label>
            <Select value={rollId} onChange={(e) => setRollId(e.target.value)} className="text-lg">
              {rolls.map((r) => (
                <option key={r.roll_id} value={r.roll_id}>
                  {r.material?.description_vi ?? r.material_code} · {r.roll_id}
                </option>
              ))}
            </Select>
          </div>

          {roll && (
            <div className="rounded-2xl border-2 border-navy bg-navy/5 p-5">
              <div className="mb-3 text-xl font-extrabold text-navy">{roll.material?.description_vi}</div>
              <div className="mb-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm text-muted-foreground">Tổng</div>
                  <div className="text-xl font-bold">{fmtQty(roll.total_length)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Đã dùng</div>
                  <div className="text-xl font-bold text-danger">{fmtQty(roll.used_length)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Còn lại</div>
                  <div className="text-xl font-extrabold text-confirm-dark">{fmtQty(remaining)}</div>
                </div>
              </div>
              <Progress value={usedPct} />
              <div className="mt-1 text-right text-sm text-muted-foreground">{Math.round(usedPct)}% đã dùng</div>
            </div>
          )}

          <div>
            <Label>Số mét cắt ({roll?.material?.unit})</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={length || ''}
              onChange={(e) => setLength(Number(e.target.value))}
              placeholder="Nhập số mét..."
              className="h-14 text-center text-3xl font-extrabold"
            />
          </div>

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
          </div>

          <Button
            variant="confirm"
            size="xl"
            className="w-full"
            disabled={!job || length <= 0 || saving}
            onClick={confirm}
          >
            <Scissors className="h-7 w-7" />
            {saving ? 'Đang ghi...' : 'XÁC NHẬN CẮT'}
          </Button>
        </div>
      )}
    </div>
  )
}
