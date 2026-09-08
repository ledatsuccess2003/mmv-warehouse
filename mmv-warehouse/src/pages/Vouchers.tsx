import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FilePlus2, FileDown } from 'lucide-react'
import { getVouchers } from '@/lib/api'
import { toast } from '@/store/useToast'
import type { Voucher, VoucherType } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtDate, toISODate } from '@/lib/format'

export default function Vouchers() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Voucher[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(toISODate().slice(0, 7))
  const [type, setType] = useState<'' | VoucherType>('')
  const [status, setStatus] = useState('')

  async function load() {
    setLoading(true)
    const res = await getVouchers({
      month: month || undefined,
      type: type || undefined,
      status: status || undefined,
    })
    if (res.success && res.data) setRows(res.data)
    else toast.error(res.error ?? 'Không tải được danh sách phiếu')
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, type, status])

  return (
    <div>
      <PageHeader
        title="Danh sách phiếu"
        back="/home"
        right={
          <div className="flex gap-2">
            <Link to="/voucher/out/new">
              <Button variant="danger" size="sm">
                <FileDown className="h-5 w-5" /> Phiếu xuất
              </Button>
            </Link>
            <Link to="/voucher/in/new">
              <Button variant="confirm" size="sm">
                <FilePlus2 className="h-5 w-5" /> Phiếu nhập
              </Button>
            </Link>
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="min-h-touch rounded-lg border-2 border-input bg-white px-4 text-base"
        />
        <Select value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="">Tất cả loại</option>
          <option value="OUT">Xuất (OUT)</option>
          <option value="IN">Nhập (IN)</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="draft">Nháp</option>
          <option value="confirmed">Đã duyệt</option>
        </Select>
      </div>

      {loading ? (
        <LoadingScreen />
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-lg text-muted-foreground">Không có phiếu nào.</p>
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Số phiếu</TH>
                <TH>Loại</TH>
                <TH>Ngày</TH>
                <TH>Job</TH>
                <TH>Trạng thái</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((v) => (
                <TR
                  key={v.id}
                  className="cursor-pointer hover:bg-accent/40"
                  onClick={() => navigate(`/voucher/${v.id}`)}
                >
                  <TD className="font-mono font-bold">{v.voucher_no}</TD>
                  <TD>
                    <Badge variant={v.type === 'OUT' ? 'danger' : 'confirm'}>{v.type}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap">{fmtDate(v.date)}</TD>
                  <TD>{v.job_code}</TD>
                  <TD>
                    {v.status === 'confirmed' ? (
                      <Badge variant="confirm">Đã duyệt</Badge>
                    ) : (
                      <Badge variant="warning">Nháp</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  )
}
