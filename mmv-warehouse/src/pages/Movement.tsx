import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { getMovements, exportMovementExcel } from '@/lib/api'
import { toast } from '@/store/useToast'
import type { Movement as Mv } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtDateShort, fmtQty, lastNDays } from '@/lib/format'

export default function Movement() {
  const def = lastNDays(30)
  const [rows, setRows] = useState<Mv[]>([])
  const [loading, setLoading] = useState(true)
  const [start, setStart] = useState(def.start)
  const [end, setEnd] = useState(def.end)
  const [jobCode, setJobCode] = useState('')
  const [code, setCode] = useState('')

  async function load() {
    setLoading(true)
    const res = await getMovements({ start, end, jobCode: jobCode || undefined, code: code || undefined })
    if (res.success && res.data) setRows(res.data)
    else toast.error(res.error ?? 'Không tải được movement')
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, jobCode, code])

  const totals = useMemo(
    () => ({
      receipt: rows.reduce((s, r) => s + Number(r.receipt || 0), 0),
      issue: rows.reduce((s, r) => s + Number(r.issue || 0), 0),
    }),
    [rows]
  )

  // STT khởi lại theo phiếu
  let lastKey = ''
  let counter = 0

  async function doExport() {
    const res = await exportMovementExcel(start, end)
    if (!res.success) toast.error(res.error ?? 'Xuất Excel thất bại')
  }

  return (
    <div>
      <PageHeader
        title="Movement"
        subtitle={`${rows.length} dòng · Nhập ${fmtQty(totals.receipt)} · Xuất ${fmtQty(totals.issue)}`}
        back="/home"
        right={
          <Button variant="outline" onClick={doExport}>
            <FileSpreadsheet className="h-5 w-5" /> Export Excel
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        <Input placeholder="Lọc JOB..." value={jobCode} onChange={(e) => setJobCode(e.target.value)} />
        <Input placeholder="Lọc mã hàng..." value={code} onChange={(e) => setCode(e.target.value)} />
      </div>

      {loading ? (
        <LoadingScreen />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <Table className="text-sm">
            <THead>
              <TR>
                <TH>ITEMS</TH>
                <TH>DATE</TH>
                <TH>CODE</TH>
                <TH>DESCRIPTION</TH>
                <TH>UNIT</TH>
                <TH className="text-right">RECEIPT</TH>
                <TH className="text-right">ISSUE</TH>
                <TH>JOB CODE</TH>
                <TH>VESSEL</TH>
                <TH>NGƯỜI THỰC HIỆN</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((m) => {
                const key = `${m.source_type}:${m.source_id}`
                if (key !== lastKey) {
                  counter = 1
                  lastKey = key
                } else counter++
                return (
                  <TR key={m.id}>
                    <TD className="text-center">{counter}</TD>
                    <TD className="whitespace-nowrap">{fmtDateShort(m.date)}</TD>
                    <TD className="font-mono">{m.code}</TD>
                    <TD>{m.description}</TD>
                    <TD>{m.unit}</TD>
                    <TD className="text-right text-confirm-dark">{m.receipt ? fmtQty(m.receipt) : ''}</TD>
                    <TD className="text-right text-danger">{m.issue ? fmtQty(m.issue) : ''}</TD>
                    <TD className="whitespace-nowrap">{m.job_code}</TD>
                    <TD>{m.vessel}</TD>
                    <TD className="whitespace-nowrap font-semibold text-navy">{m.user_name}</TD>
                  </TR>
                )
              })}
              {rows.length === 0 && (
                <TR>
                  <TD colSpan={10} className="py-8 text-center text-muted-foreground">
                    Không có dữ liệu trong khoảng này
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  )
}
