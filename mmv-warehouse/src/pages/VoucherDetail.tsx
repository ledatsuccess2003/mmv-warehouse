import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Printer, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { getVoucher, confirmVoucher, exportVoucherExcel } from '@/lib/api'
import { toast } from '@/store/useToast'
import type { Voucher, VoucherItem, Material } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { VoucherPrint } from '@/components/VoucherPrint'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingScreen } from '@/components/ui/spinner'

type Item = VoucherItem & { material?: Material }

export default function VoucherDetail() {
  const { id } = useParams()
  const [voucher, setVoucher] = useState<Voucher | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await getVoucher(Number(id))
    if (res.success && res.data) {
      setVoucher(res.data.voucher)
      setItems(res.data.items)
    } else toast.error(res.error ?? 'Không đọc được phiếu')
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function doConfirm() {
    if (!voucher) return
    setBusy(true)
    const res = await confirmVoucher(voucher.id)
    setBusy(false)
    if (!res.success) {
      toast.error(res.error ?? 'Duyệt thất bại')
      return
    }
    toast.success('Đã duyệt phiếu & cập nhật kho')
    load()
  }

  async function doExport() {
    if (!voucher) return
    const res = await exportVoucherExcel(voucher.id)
    if (!res.success) toast.error(res.error ?? 'Xuất Excel thất bại')
  }

  if (loading) return <LoadingScreen />
  if (!voucher) return <p className="py-12 text-center text-lg">Không tìm thấy phiếu.</p>

  return (
    <div>
      <PageHeader
        title={`Phiếu ${voucher.voucher_no}`}
        subtitle={voucher.type === 'OUT' ? 'ISSUE VOUCHER' : 'RECEIVING VOUCHER'}
        back="/vouchers"
        right={
          voucher.status === 'confirmed' ? (
            <Badge variant="confirm">Đã duyệt</Badge>
          ) : (
            <Badge variant="warning">Nháp</Badge>
          )
        }
      />

      {/* Thanh nút */}
      <div className="no-print mb-5 flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-5 w-5" /> In phiếu
        </Button>
        <Button variant="outline" onClick={doExport}>
          <FileSpreadsheet className="h-5 w-5" /> Xuất Excel
        </Button>
        {voucher.status !== 'confirmed' && (
          <Button variant="confirm" onClick={doConfirm} disabled={busy}>
            <CheckCircle2 className="h-5 w-5" /> Xác nhận & Trừ kho
          </Button>
        )}
      </div>

      {/* Bản in / xem trước */}
      <div className="rounded-xl border border-border bg-white shadow-sm">
        <VoucherPrint voucher={voucher} items={items} />
      </div>
    </div>
  )
}
