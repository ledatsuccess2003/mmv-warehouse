import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { getTodayLogs, updateConsumableLog } from '@/lib/api'
import { useAuth } from '@/store/useAuth'
import { toast } from '@/store/useToast'
import type { ConsumableLog, Material } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtTime, fmtQty } from '@/lib/format'

type Log = ConsumableLog & { material?: Material }

export default function History() {
  const user = useAuth((s) => s.user)!
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<Log | null>(null)
  const [qty, setQty] = useState(0)

  async function load() {
    const res = await getTodayLogs(user.id)
    if (res.success && res.data) setLogs(res.data)
    else toast.error(res.error ?? 'Không tải được lịch sử')
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    if (!edit) return
    const res = await updateConsumableLog(edit.id, qty)
    if (!res.success) {
      toast.error(res.error ?? 'Sửa thất bại')
      return
    }
    toast.success('Đã sửa')
    setEdit(null)
    load()
  }

  if (loading) return <LoadingScreen />

  const total = logs.reduce((s, l) => s + Number(l.qty), 0)

  return (
    <div>
      <PageHeader title="Lịch sử hôm nay" subtitle={`${logs.length} lần lấy · tổng ${fmtQty(total)} món`} back="/home" />

      {logs.length === 0 ? (
        <p className="py-12 text-center text-lg text-muted-foreground">Hôm nay chưa lấy vật tư nào.</p>
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Giờ</TH>
                <TH>Hàng</TH>
                <TH className="text-right">SL</TH>
                <TH>JOB</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap font-mono">{fmtTime(l.timestamp)}</TD>
                  <TD className="font-semibold">{l.material?.description_vi ?? l.material_code}</TD>
                  <TD className="text-right font-bold">
                    {fmtQty(l.qty)} {l.material?.unit}
                  </TD>
                  <TD className="whitespace-nowrap">{l.job_code}</TD>
                  <TD>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEdit(l)
                        setQty(Number(l.qty))
                      }}
                    >
                      <Pencil className="h-5 w-5" />
                      Sửa
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <Dialog open={!!edit} onClose={() => setEdit(null)} title="Sửa số lượng">
        {edit && (
          <div className="space-y-4">
            <p className="text-lg">
              <b>{edit.material?.description_vi}</b> · {edit.job_code}
            </p>
            <div>
              <Label>Số lượng mới ({edit.material?.unit})</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="h-14 text-center text-2xl font-bold"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setEdit(null)}>
                Huỷ
              </Button>
              <Button variant="confirm" className="flex-1" onClick={save} disabled={qty <= 0}>
                Lưu
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
