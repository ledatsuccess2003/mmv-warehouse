import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Printer } from 'lucide-react'
import { getMovements, exportMovementExcel } from '@/lib/api'
import { toast } from '@/store/useToast'
import type { Movement } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtQty, lastNDays } from '@/lib/format'

export default function ReportWeekly() {
  const def = lastNDays(7)
  const [rows, setRows] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [start, setStart] = useState(def.start)
  const [end, setEnd] = useState(def.end)

  async function load() {
    setLoading(true)
    const res = await getMovements({ start, end })
    if (res.success && res.data) setRows(res.data)
    else toast.error(res.error ?? 'Không tải được báo cáo')
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end])

  const summary = useMemo(() => {
    const agg = new Map<string, { code: string; description: string; unit: string; receipt: number; issue: number }>()
    rows.forEach((m) => {
      const code = m.code ?? '(?)'
      const cur = agg.get(code) ?? { code, description: m.description ?? '', unit: m.unit ?? '', receipt: 0, issue: 0 }
      cur.receipt += Number(m.receipt) || 0
      cur.issue += Number(m.issue) || 0
      agg.set(code, cur)
    })
    return Array.from(agg.values()).sort((a, b) => a.code.localeCompare(b.code))
  }, [rows])

  const totals = useMemo(() => ({
    receipt: summary.reduce((s, r) => s + r.receipt, 0),
    issue: summary.reduce((s, r) => s + r.issue, 0),
  }), [summary])

  async function doExport() {
    const res = await exportMovementExcel(start, end)
    if (!res.success) toast.error(res.error ?? 'Xuất Excel thất bại')
  }

  return (
    <div>
      <PageHeader
        title="Báo cáo tuần / tháng"
        subtitle={`${summary.length} mã hàng`}
        back="/home"
        right={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-5 w-5" /> In
            </Button>
            <Button variant="outline" onClick={doExport}>
              <FileSpreadsheet className="h-5 w-5" /> Excel
            </Button>
          </div>
        }
      />

      <div className="no-print mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>

      {loading ? (
        <LoadingScreen />
      ) : (
        <div className="rounded-xl border border-border bg-card print:border-black">
          <Table className="text-sm">
            <THead>
              <TR>
                <TH>STT</TH>
                <TH>Code</TH>
                <TH>Tên hàng</TH>
                <TH>ĐVT</TH>
                <TH className="text-right">Tổng nhập</TH>
                <TH className="text-right">Tổng xuất</TH>
              </TR>
            </THead>
            <TBody>
              {summary.map((r, i) => (
                <TR key={r.code}>
                  <TD className="text-center">{i + 1}</TD>
                  <TD className="font-mono">{r.code}</TD>
                  <TD>{r.description}</TD>
                  <TD>{r.unit}</TD>
                  <TD className="text-right text-confirm-dark">{r.receipt ? fmtQty(r.receipt) : ''}</TD>
                  <TD className="text-right text-danger">{r.issue ? fmtQty(r.issue) : ''}</TD>
                </TR>
              ))}
              {summary.length === 0 && (
                <TR>
                  <TD colSpan={6} className="py-8 text-center text-muted-foreground">Không có dữ liệu</TD>
                </TR>
              )}
              {summary.length > 0 && (
                <TR className="bg-muted/50 font-bold">
                  <TD colSpan={4} className="text-right">TỔNG CỘNG</TD>
                  <TD className="text-right text-confirm-dark">{fmtQty(totals.receipt)}</TD>
                  <TD className="text-right text-danger">{fmtQty(totals.issue)}</TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  )
}
