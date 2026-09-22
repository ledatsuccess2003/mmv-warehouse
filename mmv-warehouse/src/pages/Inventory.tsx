import { useEffect, useMemo, useState } from 'react'
import { Search, FileSpreadsheet } from 'lucide-react'
import { getMaterials, exportMaterialExcel, updateMaterialCategory } from '@/lib/api'
import { useAuth } from '@/store/useAuth'
import { toast } from '@/store/useToast'
import type { Material, MaterialCategory } from '@/lib/types'
import { MATERIAL_CATEGORY_LABEL } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtQty } from '@/lib/format'
import { cn } from '@/lib/utils'

// Danh muc that co 1501 ma. Ve het mot luc thi trinh duyet tren tablet
// dung hinh vai giay, nen chi ve PAGE_SIZE dong dau va de nguoi dung go
// tim de thu hep.
const PAGE_SIZE = 200

const CATEGORIES: MaterialCategory[] = ['consumable', 'roll', 'general']

function statusOf(m: Material) {
  // min_stock = 0 nghia la KHONG theo doi dat hang lai - phan lon 1466 ma
  // 'general' nap tu Material.xlsx roi vao dien nay, trong do 889 ma ton
  // bang 0 vi da het tu lau. Bao do het thi ca bang do ruc va khong con
  // noi bat duoc may ma tieu hao that su can mua.
  const min = Number(m.min_stock) || 0
  if (min <= 0) return { icon: '', label: '—', cls: '' }
  const q = Number(m.closing_qty)
  if (q <= 5) return { icon: '🔴', label: 'Cạn', cls: 'bg-danger/10' }
  if (q <= min) return { icon: '🟡', label: 'Thấp', cls: 'bg-amber-100/60' }
  return { icon: '✅', label: 'Đủ', cls: '' }
}

export default function Inventory() {
  const isAdmin = useAuth((s) => s.user?.role === 'admin')
  const [mats, setMats] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [type, setType] = useState('')
  const [savingCode, setSavingCode] = useState<string | null>(null)

  useEffect(() => {
    getMaterials().then((res) => {
      if (res.success && res.data) setMats(res.data)
      else toast.error(res.error ?? 'Không tải được tồn kho')
      setLoading(false)
    })
  }, [])

  // Nhom hang (cot Type trong Material.xlsx): VIK, ZODI, RFD, FE...
  const types = useMemo(
    () => Array.from(new Set(mats.map((m) => m.mat_type).filter(Boolean) as string[])).sort(),
    [mats]
  )

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return mats.filter((m) => {
      if (cat && m.category !== cat) return false
      if (type && m.mat_type !== type) return false
      if (!s) return true
      return (
        m.code.toLowerCase().includes(s) ||
        (m.description_vi ?? '').toLowerCase().includes(s) ||
        (m.description ?? '').toLowerCase().includes(s) ||
        (m.location ?? '').toLowerCase().includes(s)
      )
    })
  }, [mats, q, cat, type])

  const shown = filtered.slice(0, PAGE_SIZE)

  async function doExport() {
    const res = await exportMaterialExcel()
    if (!res.success) toast.error(res.error ?? 'Xuất Excel thất bại')
  }

  async function changeCategory(m: Material, next: MaterialCategory) {
    if (next === m.category) return
    setSavingCode(m.code)
    const res = await updateMaterialCategory(m.code, next, { actorRole: 'admin' })
    setSavingCode(null)
    if (!res.success || !res.data) {
      return toast.error(res.error ?? 'Không đổi được nhóm vật tư')
    }
    setMats((rows) => rows.map((x) => (x.code === m.code ? res.data! : x)))
    toast.success(`${m.code} → ${MATERIAL_CATEGORY_LABEL[next]}`)
  }

  if (loading) return <LoadingScreen />

  return (
    <div>
      <PageHeader
        title="Tồn kho"
        subtitle={
          filtered.length > PAGE_SIZE
            ? `${filtered.length} mã hàng — đang hiện ${PAGE_SIZE} mã đầu`
            : `${filtered.length} mã hàng`
        }
        back="/home"
        right={
          <Button variant="outline" onClick={doExport}>
            <FileSpreadsheet className="h-5 w-5" /> Export Material
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-11"
            placeholder="Tìm mã / tên hàng / vị trí..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Tất cả nhóm quyền</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {MATERIAL_CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tất cả loại hàng</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Tên hàng</TH>
              <TH>Vị trí</TH>
              <TH>Loại</TH>
              <TH>ĐVT</TH>
              <TH className="text-right">Tồn</TH>
              <TH className="text-right">Tối thiểu</TH>
              <TH className="text-center">Trạng thái</TH>
              {isAdmin && <TH>Nhóm quyền</TH>}
            </TR>
          </THead>
          <TBody>
            {shown.map((m) => {
              const s = statusOf(m)
              return (
                <TR key={m.id} className={cn(s.cls)}>
                  <TD className="font-mono text-sm">{m.code}</TD>
                  <TD className="font-semibold">{m.description_vi ?? m.description}</TD>
                  <TD className="whitespace-nowrap text-sm text-muted-foreground">
                    {m.location ?? '—'}
                  </TD>
                  <TD className="whitespace-nowrap text-sm text-muted-foreground">
                    {m.mat_type ?? '—'}
                  </TD>
                  <TD>{m.unit}</TD>
                  <TD className="text-right text-lg font-bold">{fmtQty(m.closing_qty)}</TD>
                  <TD className="text-right text-muted-foreground">
                    {Number(m.min_stock) > 0 ? m.min_stock : '—'}
                  </TD>
                  <TD className="whitespace-nowrap text-center">
                    {s.icon && <span className="text-xl">{s.icon}</span>} {s.label}
                  </TD>
                  {isAdmin && (
                    <TD>
                      {/* Doi nhom = doi quyen: 'consumable' thi KTV tu lay duoc
                          o man Lay vat tu, 'general' thi chi admin nhap/xuat. */}
                      <Select
                        value={m.category}
                        disabled={savingCode === m.code}
                        onChange={(e) => changeCategory(m, e.target.value as MaterialCategory)}
                        className="min-h-[40px] py-1 text-sm"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {MATERIAL_CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </Select>
                    </TD>
                  )}
                </TR>
              )
            })}
          </TBody>
        </Table>
        {filtered.length > PAGE_SIZE && (
          <p className="border-t border-border p-4 text-center text-muted-foreground">
            Còn {filtered.length - PAGE_SIZE} mã nữa — gõ vào ô tìm hoặc chọn bộ lọc để thu hẹp.
          </p>
        )}
        {filtered.length === 0 && (
          <p className="p-6 text-center text-muted-foreground">Không tìm thấy mã nào</p>
        )}
      </div>
    </div>
  )
}
