import { useEffect, useMemo, useState } from 'react'
import { Search, FileSpreadsheet } from 'lucide-react'
import { getMaterials, exportMaterialExcel } from '@/lib/api'
import { toast } from '@/store/useToast'
import type { Material } from '@/lib/types'
import { PageHeader } from '@/components/PageHeader'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { LoadingScreen } from '@/components/ui/spinner'
import { fmtQty } from '@/lib/format'
import { cn } from '@/lib/utils'

function statusOf(m: Material) {
  const q = Number(m.closing_qty)
  if (q <= 5) return { icon: '🔴', label: 'Cạn', cls: 'bg-danger/10' }
  if (q <= (m.min_stock ?? 20)) return { icon: '🟡', label: 'Thấp', cls: 'bg-amber-100/60' }
  return { icon: '✅', label: 'Đủ', cls: '' }
}

export default function Inventory() {
  const [mats, setMats] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')

  useEffect(() => {
    getMaterials().then((res) => {
      if (res.success && res.data) setMats(res.data)
      else toast.error(res.error ?? 'Không tải được tồn kho')
      setLoading(false)
    })
  }, [])

  const categories = useMemo(() => Array.from(new Set(mats.map((m) => m.category))).sort(), [mats])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return mats.filter((m) => {
      if (cat && m.category !== cat) return false
      if (!s) return true
      return (
        m.code.toLowerCase().includes(s) ||
        (m.description_vi ?? '').toLowerCase().includes(s) ||
        (m.description ?? '').toLowerCase().includes(s)
      )
    })
  }, [mats, q, cat])

  async function doExport() {
    const res = await exportMaterialExcel()
    if (!res.success) toast.error(res.error ?? 'Xuất Excel thất bại')
  }

  if (loading) return <LoadingScreen />

  return (
    <div>
      <PageHeader
        title="Tồn kho"
        subtitle={`${filtered.length} mã hàng`}
        back="/home"
        right={
          <Button variant="outline" onClick={doExport}>
            <FileSpreadsheet className="h-5 w-5" /> Export Material
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-11" placeholder="Tìm mã / tên hàng..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Tất cả nhóm</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
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
              <TH>ĐVT</TH>
              <TH className="text-right">Tồn</TH>
              <TH className="text-right">Tối thiểu</TH>
              <TH className="text-center">Trạng thái</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((m) => {
              const s = statusOf(m)
              return (
                <TR key={m.id} className={cn(s.cls)}>
                  <TD className="font-mono">{m.code}</TD>
                  <TD className="font-semibold">{m.description_vi}</TD>
                  <TD>{m.unit}</TD>
                  <TD className="text-right text-lg font-bold">{fmtQty(m.closing_qty)}</TD>
                  <TD className="text-right text-muted-foreground">{m.min_stock}</TD>
                  <TD className="text-center whitespace-nowrap">
                    <span className="text-xl">{s.icon}</span> {s.label}
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      </div>
    </div>
  )
}
