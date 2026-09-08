import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getUsers, getUserReport, getUsageByUser } from '@/lib/api'
import { toast } from '@/store/useToast'
import type { User, ConsumableLog, Material } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtQty, fmtDateShort, fmtTime, lastNDays } from '@/lib/format'

type LogRow = ConsumableLog & { material?: Material }

export default function ReportUser() {
  const def = lastNDays(30)
  const [users, setUsers] = useState<User[]>([])
  const [userId, setUserId] = useState<number>(0)
  const [start, setStart] = useState(def.start)
  const [end, setEnd] = useState(def.end)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [usageByUser, setUsageByUser] = useState<{ name: string; total: number }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getUsers('ktv').then((r) => {
      if (r.success && r.data) setUsers(r.data)
    })
    getUsageByUser().then((r) => {
      if (r.success && r.data) setUsageByUser(r.data)
    })
  }, [])

  useEffect(() => {
    if (!userId) {
      setLogs([])
      return
    }
    setLoading(true)
    getUserReport(userId, start, end).then((r) => {
      if (r.success && r.data) setLogs(r.data as LogRow[])
      else toast.error(r.error ?? 'Không tải được báo cáo')
      setLoading(false)
    })
  }, [userId, start, end])

  const totalQty = logs.reduce((s, l) => s + (Number(l.qty) || 0), 0)

  return (
    <div>
      <PageHeader title="Báo cáo theo KTV" subtitle="Thống kê vật tư tiêu hao theo người" back="/home" />

      {/* Filters */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select value={String(userId)} onChange={(e) => setUserId(Number(e.target.value))}>
          <option value="0">-- Chọn KTV --</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>

      {/* Usage by user chart */}
      {usageByUser.length > 0 && !userId && (
        <Card className="mb-5">
          <CardContent className="p-4">
            <h3 className="mb-3 text-lg font-bold">Tổng vật tư theo KTV</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={usageByUser}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="#1F4E79" name="Tổng SL" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {loading && <LoadingScreen />}

      {!loading && userId > 0 && (
        <>
          <Card className="mb-4 border-navy/30 bg-navy/5">
            <CardContent className="flex items-center justify-between p-4">
              <div className="font-bold">{users.find((u) => u.id === userId)?.name}</div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">{logs.length} lượt lấy</div>
                <div className="text-xl font-extrabold">Tổng: {fmtQty(totalQty)}</div>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-border bg-card">
            <Table className="text-sm">
              <THead>
                <TR>
                  <TH>STT</TH>
                  <TH>Ngày</TH>
                  <TH>Giờ</TH>
                  <TH>Code</TH>
                  <TH>Tên hàng</TH>
                  <TH className="text-right">SL</TH>
                  <TH>JOB</TH>
                </TR>
              </THead>
              <TBody>
                {logs.map((l, i) => (
                  <TR key={l.id}>
                    <TD className="text-center">{i + 1}</TD>
                    <TD className="whitespace-nowrap">{fmtDateShort(l.timestamp)}</TD>
                    <TD>{fmtTime(l.timestamp)}</TD>
                    <TD className="font-mono">{l.material_code}</TD>
                    <TD>{(l as any).material?.description_vi ?? ''}</TD>
                    <TD className="text-right font-bold">{fmtQty(l.qty)}</TD>
                    <TD>{l.job_code}</TD>
                  </TR>
                ))}
                {logs.length === 0 && (
                  <TR>
                    <TD colSpan={7} className="py-8 text-center text-muted-foreground">Không có dữ liệu</TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
