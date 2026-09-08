import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getCostByJob, getJobs } from '@/lib/api'
import { toast } from '@/store/useToast'
import type { Job, CostByJobRow } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtQty, fmtMoney } from '@/lib/format'

export default function CostByJob() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobCode, setJobCode] = useState('')
  const [rows, setRows] = useState<CostByJobRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    getJobs().then((r) => r.success && r.data && setJobs(r.data))
  }, [])

  async function search() {
    if (!jobCode.trim()) {
      toast.error('Vui lòng chọn Job')
      return
    }
    setLoading(true)
    setSearched(true)
    const res = await getCostByJob(jobCode.trim())
    if (res.success && res.data) setRows(res.data)
    else toast.error(res.error ?? 'Không tải được dữ liệu')
    setLoading(false)
  }

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)

  const chartData = rows.slice(0, 15).map((r) => ({
    code: r.material_code,
    'Lý thuyết': r.qty_theory,
    'Thực tế': r.qty_actual,
  }))

  return (
    <div>
      <PageHeader title="Chi phí theo JOB" subtitle="Cost by Job" back="/home" />

      <div className="mb-5 flex gap-3">
        <div className="flex-1">
          <Input
            list="job-list-cost"
            value={jobCode}
            onChange={(e) => setJobCode(e.target.value)}
            placeholder="Chọn Job No..."
          />
          <datalist id="job-list-cost">
            {jobs.map((j) => (
              <option key={j.id} value={j.job_code}>{j.vessel}</option>
            ))}
          </datalist>
        </div>
        <Button variant="confirm" onClick={search} disabled={loading}>Xem báo cáo</Button>
      </div>

      {loading && <LoadingScreen />}

      {!loading && searched && rows.length === 0 && (
        <p className="py-12 text-center text-lg text-muted-foreground">Không có dữ liệu cho JOB này</p>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* Summary card */}
          <Card className="mb-5 border-navy/30 bg-navy/5">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm text-muted-foreground">JOB: {jobCode}</div>
                <div className="text-lg font-bold">{rows.length} mã hàng</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Tổng chi phí</div>
                <div className="text-2xl font-extrabold text-danger">{fmtMoney(totalAmount)} ₫</div>
              </div>
            </CardContent>
          </Card>

          {/* Chart */}
          {chartData.length > 0 && (
            <Card className="mb-5">
              <CardContent className="p-4">
                <h3 className="mb-3 text-lg font-bold">So sánh Lý thuyết vs Thực tế</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="code" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Lý thuyết" fill="#1F4E79" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Thực tế" fill="#C00000" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Detail table */}
          <div className="rounded-xl border border-border bg-card">
            <Table className="text-sm">
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Tên hàng</TH>
                  <TH>ĐVT</TH>
                  <TH className="text-right">SL lý thuyết</TH>
                  <TH className="text-right">SL thực tế</TH>
                  <TH className="text-right">Chênh lệch</TH>
                  <TH className="text-right">Đơn giá</TH>
                  <TH className="text-right">Thành tiền</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.material_code}>
                    <TD className="font-mono">{r.material_code}</TD>
                    <TD>{r.description_vi}</TD>
                    <TD>{r.unit}</TD>
                    <TD className="text-right">{fmtQty(r.qty_theory)}</TD>
                    <TD className="text-right">{fmtQty(r.qty_actual)}</TD>
                    <TD className={`text-right font-bold ${r.diff > 0 ? 'text-danger' : 'text-confirm-dark'}`}>
                      {r.diff > 0 ? '+' : ''}{fmtQty(r.diff)}
                    </TD>
                    <TD className="text-right">{fmtMoney(r.unit_price)}</TD>
                    <TD className="text-right font-bold">{fmtMoney(r.amount)}</TD>
                  </TR>
                ))}
                <TR className="bg-muted/50 font-bold">
                  <TD colSpan={7} className="text-right">TỔNG CỘNG</TD>
                  <TD className="text-right text-lg text-danger">{fmtMoney(totalAmount)} ₫</TD>
                </TR>
              </TBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
