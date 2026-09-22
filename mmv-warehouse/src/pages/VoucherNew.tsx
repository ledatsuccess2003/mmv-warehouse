import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Save, CheckCircle2 } from 'lucide-react'
import { createVoucher, confirmVoucher, getJobs, getMaterials } from '@/lib/api'
import { useAuth } from '@/store/useAuth'
import { toast } from '@/store/useToast'
import type { Job, Material, VoucherType, VoucherItemInput } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toISODate } from '@/lib/format'

type Row = VoucherItemInput

export default function VoucherNew({ type }: { type: VoucherType }) {
  const isOut = type === 'OUT'
  const user = useAuth((s) => s.user)!
  const navigate = useNavigate()

  const [jobs, setJobs] = useState<Job[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [date, setDate] = useState(toISODate())
  const [receiver, setReceiver] = useState('')
  const [vessel, setVessel] = useState('')
  const [supplier, setSupplier] = useState('')
  const [jobCode, setJobCode] = useState('')
  const [rows, setRows] = useState<Row[]>([{ material_code: '' }])
  const [busy, setBusy] = useState(false)

  // Goi y ma hang: admin duoc chon ca 1501 ma trong kho, cac vai tro
  // khac chi thay vat tu tieu hao. Day chi la goi y - o ma hang van cho
  // go tu do, va confirm_voucher moi la cho chan that: phieu co ma ngoai
  // tieu hao thi chi admin duyet duoc.
  const isAdmin = user.role === 'admin'

  useEffect(() => {
    getJobs().then((r) => r.success && r.data && setJobs(r.data))
    getMaterials(isAdmin ? undefined : 'consumable').then((r) => r.success && r.data && setMaterials(r.data))
  }, [isAdmin])

  const matMap = useMemo(() => {
    const m = new Map<string, Material>()
    materials.forEach((x) => m.set(x.code, x))
    return m
  }, [materials])

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function onCodeChange(i: number, code: string) {
    const mat = matMap.get(code)
    // Chỉ tự điền gợi ý khi khớp danh mục có sẵn; nếu không có thì để trống
    // cho nhân viên tự gõ tay tên hàng + ĐVT (không bắt buộc phải có trong danh mục).
    setRow(i, mat ? { material_code: code, description: mat.description_vi, unit: mat.unit } : { material_code: code })
  }

  function onJobChange(code: string) {
    setJobCode(code)
    const j = jobs.find((x) => x.job_code === code)
    if (j?.vessel) setVessel(j.vessel)
  }

  function addRow() {
    setRows((rs) => [...rs, { material_code: '' }])
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs))
  }

  function validItems(): VoucherItemInput[] {
    return rows
      .filter((r) => r.material_code.trim() || (r.description ?? '').trim())
      .map((r) => ({
        material_code: r.material_code.trim(),
        description: r.description ?? matMap.get(r.material_code)?.description_vi ?? '',
        qty_theory: isOut ? Number(r.qty_theory) || 0 : Number(r.qty_actual) || 0,
        qty_actual: Number(r.qty_actual) || (isOut ? 0 : Number(r.qty_theory) || 0),
        unit: r.unit ?? matMap.get(r.material_code)?.unit ?? '',
        remarks: r.remarks ?? '',
      }))
  }

  async function save(confirmAfter: boolean) {
    const items = validItems()
    if (!items.length) {
      toast.error('Chưa có dòng hàng hợp lệ')
      return
    }
    setBusy(true)
    const res = await createVoucher(type, {
      date,
      receiver,
      vessel: isOut ? vessel : null,
      supplier: isOut ? null : supplier,
      job_code: jobCode || null,
      created_by: user.id,
      items,
    })
    if (!res.success || !res.data) {
      setBusy(false)
      toast.error(res.error ?? 'Tạo phiếu thất bại')
      return
    }
    const id = res.data.voucher.id
    if (confirmAfter) {
      const c = await confirmVoucher(id, user.role)
      if (!c.success) {
        setBusy(false)
        toast.error(c.error ?? 'Duyệt phiếu thất bại')
        return
      }
      toast.success(`Đã tạo & duyệt phiếu ${res.data.voucher.voucher_no}`)
    } else {
      toast.success(`Đã lưu nháp phiếu ${res.data.voucher.voucher_no}`)
    }
    setBusy(false)
    navigate(`/voucher/${id}`)
  }

  return (
    <div>
      <PageHeader
        title={isOut ? 'Phiếu xuất kho' : 'Phiếu nhập kho'}
        subtitle={isOut ? 'ISSUE VOUCHER' : 'RECEIVING VOUCHER'}
        back="/vouchers"
      />

      {/* Header form */}
      <div className="mb-5 grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <div>
          <Label>Ngày {isOut ? 'xuất' : 'nhập'}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Người nhận</Label>
          <Input value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="Tên người nhận" />
        </div>
        <div>
          <Label>Job No.</Label>
          <Input
            value={jobCode}
            onChange={(e) => onJobChange(e.target.value)}
            placeholder="Nhập số JOB, VD: WO26-0900..."
          />
        </div>
        {isOut ? (
          <div>
            <Label>Vessel</Label>
            <Input value={vessel} onChange={(e) => setVessel(e.target.value)} placeholder="Tên tàu" />
          </div>
        ) : (
          <div>
            <Label>Nhà cung cấp (Supplier)</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Tên NCC" />
          </div>
        )}
      </div>

      {!isAdmin && (
        <p className="mb-3 rounded-xl border border-amber-300/70 bg-amber-100/50 px-4 py-3 text-base text-amber-900">
          Gợi ý mã hàng chỉ liệt kê <b>vật tư tiêu hao</b>. Phiếu có vật tư ngoài tiêu hao
          thì chỉ admin duyệt được — admin nhập/xuất những mã đó ở màn <b>Nhập/Xuất kho</b>.
        </p>
      )}

      {/* Bảng dòng hàng */}
      <datalist id="mat-list">
        {materials.map((m) => (
          <option key={m.id} value={m.code}>
            {m.description_vi}
          </option>
        ))}
      </datalist>

      <div className="space-y-3">
        {rows.map((r, i) => {
          return (
            <div key={i} className="rounded-xl border border-border bg-card p-3">
              <div className="grid gap-2 sm:grid-cols-12">
                <div className="sm:col-span-3">
                  <Label className="text-sm">Mã hàng</Label>
                  <Input
                    list="mat-list"
                    value={r.material_code}
                    onChange={(e) => onCodeChange(i, e.target.value)}
                    placeholder="Nhập mã (tự do)..."
                  />
                </div>
                <div className="sm:col-span-3">
                  <Label className="text-sm">Tên hàng</Label>
                  <Input
                    value={r.description ?? ''}
                    onChange={(e) => setRow(i, { description: e.target.value })}
                    placeholder="Nhập tên hàng..."
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label className="text-sm">ĐVT</Label>
                  <Input
                    value={r.unit ?? ''}
                    onChange={(e) => setRow(i, { unit: e.target.value })}
                    placeholder="ĐVT"
                  />
                </div>
                {isOut ? (
                  <>
                    <div className="sm:col-span-2">
                      <Label className="text-sm">SL lý thuyết</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={r.qty_theory ?? ''}
                        onChange={(e) => setRow(i, { qty_theory: Number(e.target.value) })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-sm">SL thực tế</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={r.qty_actual ?? ''}
                        onChange={(e) => setRow(i, { qty_actual: Number(e.target.value) })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="sm:col-span-4">
                    <Label className="text-sm">Số lượng</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={r.qty_theory ?? ''}
                      onChange={(e) => setRow(i, { qty_theory: Number(e.target.value) })}
                    />
                  </div>
                )}
                <div className="flex items-end sm:col-span-1">
                  <Button variant="ghost" size="icon" className="text-danger" onClick={() => removeRow(i)}>
                    <Trash2 className="h-6 w-6" />
                  </Button>
                </div>
              </div>
              <Input
                className="mt-2"
                value={r.remarks ?? ''}
                onChange={(e) => setRow(i, { remarks: e.target.value })}
                placeholder="Ghi chú (remarks)..."
              />
            </div>
          )
        })}
      </div>

      <Button variant="outline" className="mt-3 w-full" onClick={addRow}>
        <Plus className="h-5 w-5" /> Thêm dòng
      </Button>

      {/* Nút lưu */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" size="lg" className="flex-1" disabled={busy} onClick={() => save(false)}>
          <Save className="h-6 w-6" /> Lưu nháp
        </Button>
        <Button variant="confirm" size="lg" className="flex-1" disabled={busy} onClick={() => save(true)}>
          <CheckCircle2 className="h-6 w-6" /> Xác nhận & Trừ kho
        </Button>
      </div>
    </div>
  )
}
