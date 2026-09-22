import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Search, Package, CheckCircle2, MapPin } from 'lucide-react'
import { searchMaterials, logStockMove, getStockMoves, getJobs } from '@/lib/api'
import { useAuth } from '@/store/useAuth'
import { toast } from '@/store/useToast'
import type { Job, Material, StockMove, VoucherType } from '@/lib/types'
import { MATERIAL_CATEGORY_LABEL } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { fmtDateTime, fmtQty } from '@/lib/format'
import { cn } from '@/lib/utils'

type Row = StockMove & { material?: Material }

/**
 * Nhập/Xuất kho - CHỈ ADMIN.
 *
 * Vật tư tiêu hao thì KTV tự lấy ở màn Lấy vật tư, cuộn dài thì ở màn
 * Cắt cuộn. Mọi thứ còn lại trong kho (1466 mã 'general' nạp từ
 * Material.xlsx) đi qua đây, và chỉ admin mới vào được - xem quyền khai
 * trong App.tsx và Layout.tsx.
 *
 * Danh mục có 1501 mã nên KHÔNG tải hết về rồi lọc ở client như màn Tồn
 * kho: gõ vào ô tìm, searchMaterials lọc phía Supabase và trả tối đa 50
 * mã.
 */
export default function Stock() {
  const user = useAuth((s) => s.user)!

  const [q, setQ] = useState('')
  const [results, setResults] = useState<Material[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<Material | null>(null)

  const [type, setType] = useState<VoucherType>('IN')
  const [qty, setQty] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobCode, setJobCode] = useState('')
  const [vessel, setVessel] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [recent, setRecent] = useState<Row[]>([])

  const loadRecent = useCallback(() => {
    getStockMoves(30).then((r) => {
      if (r.success && r.data) setRecent(r.data)
    })
  }, [])

  useEffect(() => {
    getJobs(true).then((r) => r.success && r.data && setJobs(r.data))
    loadRecent()
  }, [loadRecent])

  // Gõ tới đâu tìm tới đó, nhưng chờ 300ms cho người dùng gõ xong rồi
  // mới gọi - mỗi phím một truy vấn lên Supabase là quá nhiều.
  const timer = useRef<number>()
  useEffect(() => {
    window.clearTimeout(timer.current)
    const kw = q.trim()
    if (kw.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    timer.current = window.setTimeout(() => {
      searchMaterials(kw, { limit: 50 }).then((r) => {
        if (r.success && r.data) setResults(r.data)
        else toast.error(r.error ?? 'Không tìm được vật tư')
        setSearching(false)
      })
    }, 300)
    return () => window.clearTimeout(timer.current)
  }, [q])

  const nextQty = useMemo(() => {
    if (!picked) return null
    const n = Number(qty)
    if (!n || n <= 0) return null
    return Number(picked.closing_qty) + (type === 'IN' ? n : -n)
  }, [picked, qty, type])

  function pick(m: Material) {
    setPicked(m)
    setResults([])
    setQ('')
  }

  async function submit() {
    if (!picked) return toast.error('Hãy chọn một mã vật tư')
    const n = Number(qty)
    if (!n || n <= 0) return toast.error('Số lượng phải lớn hơn 0')

    setSaving(true)
    const res = await logStockMove(user.id, picked.code, type, n, {
      jobCode: jobCode.trim() || null,
      vessel: vessel.trim() || null,
      note: note.trim() || null,
      userName: user.name,
      actorRole: user.role,
    })
    setSaving(false)

    if (!res.success || !res.data) {
      return toast.error(res.error ?? 'Ghi nhập/xuất thất bại')
    }

    toast.success(
      `Đã ${type === 'IN' ? 'nhập' : 'xuất'} ${fmtQty(n)} ${picked.unit ?? ''} ${picked.code} · ` +
        `tồn còn ${fmtQty(res.data.closing_qty)}`
    )
    if (res.warning) toast.error(res.warning)

    // Giữ lại mã đang chọn để nhập/xuất tiếp cùng mã, chỉ xoá số lượng
    // và ghi chú - kho thường làm nhiều lượt liên tiếp trên một mã.
    setPicked({ ...picked, closing_qty: res.data.closing_qty })
    setQty('')
    setNote('')
    loadRecent()
  }

  return (
    <div>
      <PageHeader
        title="Nhập / Xuất kho"
        subtitle="Vật tư ngoài tiêu hao — chỉ admin"
        back="/home"
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_430px]">
        <section>
          {/* --- Tìm và chọn mã --- */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-11 text-lg"
              placeholder="Gõ mã hoặc tên hàng để tìm..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoCapitalize="characters"
            />
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            {q.trim().length > 0 && q.trim().length < 2
              ? 'Gõ thêm ít nhất 2 ký tự'
              : searching
                ? 'Đang tìm...'
                : results.length > 0
                  ? `${results.length} kết quả${results.length === 50 ? ' đầu tiên — gõ cụ thể hơn để thu hẹp' : ''}`
                  : 'Tìm trong toàn bộ danh mục kho'}
          </p>

          {results.length > 0 && (
            <div className="mb-5 overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <THead>
                  <TR>
                    <TH>Code</TH>
                    <TH>Tên hàng</TH>
                    <TH>Vị trí</TH>
                    <TH className="text-right">Tồn</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {results.map((m) => (
                    <TR key={m.id}>
                      <TD className="font-mono text-sm">{m.code}</TD>
                      <TD className="font-semibold">{m.description_vi ?? m.description}</TD>
                      <TD className="whitespace-nowrap text-sm text-muted-foreground">
                        {m.location ?? '—'}
                      </TD>
                      <TD className="text-right font-bold">
                        {fmtQty(m.closing_qty)} {m.unit}
                      </TD>
                      <TD className="text-right">
                        <Button size="sm" onClick={() => pick(m)}>
                          Chọn
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}

          {/* --- Lịch sử gần đây --- */}
          <h2 className="mb-3 text-xl font-extrabold text-navy">Nhập/xuất gần đây</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Table>
              <THead>
                <TR>
                  <TH>Thời điểm</TH>
                  <TH>Code</TH>
                  <TH>Tên hàng</TH>
                  <TH className="text-center">Loại</TH>
                  <TH className="text-right">SL</TH>
                  <TH>JOB</TH>
                  <TH>Ghi chú</TH>
                </TR>
              </THead>
              <TBody>
                {recent.map((mv) => (
                  <TR key={mv.id}>
                    <TD className="whitespace-nowrap text-sm">{fmtDateTime(mv.timestamp)}</TD>
                    <TD className="font-mono text-sm">{mv.material_code}</TD>
                    <TD>{mv.material?.description_vi ?? mv.material?.description ?? '—'}</TD>
                    <TD className="text-center">
                      <span
                        className={cn(
                          'rounded-full px-3 py-1 text-sm font-bold text-white',
                          mv.type === 'IN' ? 'bg-confirm' : 'bg-danger'
                        )}
                      >
                        {mv.type === 'IN' ? 'NHẬP' : 'XUẤT'}
                      </span>
                    </TD>
                    <TD className="text-right font-bold">{fmtQty(mv.qty)}</TD>
                    <TD className="whitespace-nowrap text-sm">{mv.job_code ?? '—'}</TD>
                    <TD className="text-sm text-muted-foreground">{mv.note ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {recent.length === 0 && (
              <p className="p-6 text-center text-muted-foreground">Chưa có lần nhập/xuất nào</p>
            )}
          </div>
        </section>

        {/* --- Cột phải: mã đang chọn + form --- */}
        <aside className="h-fit rounded-3xl border border-navy/15 bg-card p-4 shadow-lg xl:sticky xl:top-28">
          {!picked ? (
            <div className="rounded-xl bg-muted p-6 text-center text-muted-foreground">
              <Package className="mx-auto mb-2 h-8 w-8" />
              Chưa chọn vật tư. Tìm mã ở bên trái rồi bấm “Chọn”.
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-xl border border-border p-3">
                <p className="font-mono text-sm text-muted-foreground">{picked.code}</p>
                <p className="text-lg font-extrabold leading-tight text-navy">
                  {picked.description_vi ?? picked.description}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {picked.location ?? 'chưa có vị trí'}
                  </span>
                  {picked.mat_type && <span>Nhóm {picked.mat_type}</span>}
                  <span>{MATERIAL_CATEGORY_LABEL[picked.category]}</span>
                </div>
                <p className="mt-2 text-base font-bold">
                  Tồn hiện tại: {fmtQty(picked.closing_qty)} {picked.unit}
                </p>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2">
                <Button
                  variant={type === 'IN' ? 'confirm' : 'outline'}
                  size="lg"
                  onClick={() => setType('IN')}
                >
                  <ArrowDownToLine className="h-5 w-5" /> NHẬP
                </Button>
                <Button
                  variant={type === 'OUT' ? 'danger' : 'outline'}
                  size="lg"
                  onClick={() => setType('OUT')}
                >
                  <ArrowUpFromLine className="h-5 w-5" /> XUẤT
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Số lượng *</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder={`Số ${picked.unit ?? 'đơn vị'}`}
                    className="text-lg"
                  />
                  {nextQty !== null && (
                    <p
                      className={cn(
                        'mt-1 text-sm font-semibold',
                        nextQty < 0 ? 'text-danger' : 'text-muted-foreground'
                      )}
                    >
                      Sau khi ghi: {fmtQty(nextQty)} {picked.unit}
                      {nextQty < 0 && ' — TỒN ÂM'}
                    </p>
                  )}
                </div>

                <div>
                  <Label>Số JOB</Label>
                  <Select value={jobCode} onChange={(e) => setJobCode(e.target.value)}>
                    <option value="">-- Không gắn JOB --</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.job_code}>
                        {j.job_code} {j.vessel ? `· ${j.vessel}` : ''}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label>Tàu</Label>
                  <Input
                    value={vessel}
                    onChange={(e) => setVessel(e.target.value)}
                    placeholder="Tên tàu (nếu có)"
                  />
                </div>

                <div>
                  <Label>Ghi chú</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Lý do nhập/xuất, số PO, nhà cung cấp..."
                  />
                </div>
              </div>

              <Button
                variant="confirm"
                size="xl"
                className="mt-5 w-full"
                disabled={saving || !Number(qty)}
                onClick={submit}
              >
                <CheckCircle2 className="h-7 w-7" />
                {saving ? 'Đang ghi...' : type === 'IN' ? 'XÁC NHẬN NHẬP' : 'XÁC NHẬN XUẤT'}
              </Button>

              <button
                type="button"
                onClick={() => setPicked(null)}
                className="mt-3 w-full text-center text-sm font-semibold text-navy hover:underline"
              >
                Chọn mã khác
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
