// =====================================================================
//  MMV WAREHOUSE - API layer (Supabase)
//  Mọi hàm trả về { success, data, error }.
// =====================================================================
import { supabase, isSupabaseConfigured } from './supabase'
import { toISODate, monthsUntil, monthRange } from './format'
import { store as mock } from './mock'
import type {
  ApiResult,
  Material,
  Job,
  User,
  ConsumableLog,
  Voucher,
  VoucherItem,
  Movement,
  RollTracking,
  RollCut,
  VoucherType,
  CreateVoucherData,
  CostByJobRow,
  MovementReportRow,
} from './types'
import {
  buildMaterialWorkbook,
  buildMovementWorkbook,
  buildVoucherWorkbook,
  saveWorkbook,
} from './excel'

function ok<T>(data: T, warning?: string): ApiResult<T> {
  return { success: true, data, error: null, warning }
}
function fail<T = never>(error: unknown): ApiResult<T> {
  const msg = error instanceof Error ? error.message : String(error)
  console.error('[MMV api]', msg)
  return { success: false, data: null, error: msg }
}

// =====================================================================
//  ĐỌC DỮ LIỆU CHUNG (cho các màn hình)
// =====================================================================
export async function getMaterials(category?: string): Promise<ApiResult<Material[]>> {
  if (!isSupabaseConfigured) {
    let mats = mock.materials
    if (category) mats = mats.filter(m => m.category === category)
    return ok(mats.sort((a, b) => a.code.localeCompare(b.code)))
  }
  try {
    let q = supabase.from('materials').select('*').order('code')
    if (category) q = q.eq('category', category)
    const { data, error } = await q
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return fail(e)
  }
}

export async function getConsumableMaterials(): Promise<ApiResult<Material[]>> {
  if (!isSupabaseConfigured) {
    return ok(mock.materials.filter(m => m.category !== 'roll').sort((a, b) => (a.description_vi ?? '').localeCompare(b.description_vi ?? '')))
  }
  try {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .neq('category', 'roll')
      .order('description_vi')
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return fail(e)
  }
}

export async function getJobs(onlyOpen = false): Promise<ApiResult<Job[]>> {
  if (!isSupabaseConfigured) {
    const { JOBS } = await import('./mock')
    let jobs = [...JOBS]
    if (onlyOpen) jobs = jobs.filter(j => j.status === 'open')
    return ok(jobs)
  }
  try {
    let q = supabase.from('jobs').select('*').order('job_code', { ascending: false })
    if (onlyOpen) q = q.eq('status', 'open')
    const { data, error } = await q
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return fail(e)
  }
}

export async function getJob(jobCode: string): Promise<ApiResult<Job | null>> {
  if (!isSupabaseConfigured) {
    const { JOBS } = await import('./mock')
    return ok(JOBS.find(j => j.job_code === jobCode) ?? null)
  }
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('job_code', jobCode)
      .maybeSingle()
    if (error) throw error
    return ok(data)
  } catch (e) {
    return fail(e)
  }
}

export async function getUsers(role?: string): Promise<ApiResult<User[]>> {
  if (!isSupabaseConfigured) {
    const { USERS } = await import('./mock')
    let users = USERS.filter(u => u.active)
    if (role) users = users.filter(u => u.role === role)
    return ok(users.sort((a, b) => a.name.localeCompare(b.name)))
  }
  try {
    let q = supabase.from('users').select('*').eq('active', true).order('name')
    if (role) q = q.eq('role', role)
    const { data, error } = await q
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return fail(e)
  }
}

// =====================================================================
//  1. logConsumable - KTV lấy vật tư tiêu hao
// =====================================================================
export async function logConsumable(
  userId: number,
  materialCode: string,
  qty: number,
  jobCode: string,
  notes?: string
): Promise<ApiResult<{ log: ConsumableLog; closing_qty: number }>> {
  if (!isSupabaseConfigured) {
    if (!qty || qty <= 0) return fail('Số lượng phải lớn hơn 0')
    const mat = mock.getMaterial(materialCode)
    if (!mat) return fail('Không tìm thấy mã vật tư ' + materialCode)
    const log = mock.addLog(userId, materialCode, qty, jobCode, notes)
    const warning = mat.closing_qty < 0 ? `TỒN ÂM: ${mat.description_vi} còn ${mat.closing_qty} ${mat.unit}` : undefined
    return ok({ log, closing_qty: mat.closing_qty }, warning)
  }
  try {
    if (!qty || qty <= 0) throw new Error('Số lượng phải lớn hơn 0')

    const { data: mat, error: matErr } = await supabase
      .from('materials')
      .select('*')
      .eq('code', materialCode)
      .single()
    if (matErr) throw matErr
    if (!mat) throw new Error('Không tìm thấy mã vật tư ' + materialCode)

    // 1) ghi nhật ký
    const { data: log, error: logErr } = await supabase
      .from('consumable_logs')
      .insert({
        user_id: userId,
        material_code: materialCode,
        qty,
        job_code: jobCode,
        notes: notes ?? null,
      })
      .select()
      .single()
    if (logErr) throw logErr

    // 2) trừ tồn kho
    const newClosing = Number(mat.closing_qty) - qty
    const { error: updErr } = await supabase
      .from('materials')
      .update({ closing_qty: newClosing })
      .eq('code', materialCode)
    if (updErr) throw updErr

    // 3) ghi movements
    const { error: movErr } = await supabase.from('movements').insert({
      source_type: 'consumable',
      source_id: log.id,
      date: toISODate(new Date(log.timestamp)),
      code: materialCode,
      description: mat.description || mat.description_vi,
      unit: mat.unit,
      receipt: 0,
      issue: qty,
      job_code: jobCode,
      vessel: null,
    })
    if (movErr) throw movErr

    const warning = newClosing < 0 ? `TỒN ÂM: ${mat.description_vi} còn ${newClosing} ${mat.unit}` : undefined
    return ok({ log: log as ConsumableLog, closing_qty: newClosing }, warning)
  } catch (e) {
    return fail(e)
  }
}

/** Nhật ký hôm nay của 1 KTV (kèm tên hàng) */
export async function getTodayLogs(userId: number): Promise<ApiResult<(ConsumableLog & { material?: Material })[]>> {
  if (!isSupabaseConfigured) {
    const logs = mock.getTodayLogs().filter(l => l.user_id === userId)
    return ok(logs.map(l => ({ ...l, material: mock.getMaterial(l.material_code ?? '') })).reverse() as any)
  }
  try {
    const start = toISODate() + 'T00:00:00'
    const { data, error } = await supabase
      .from('consumable_logs')
      .select('*, material:materials(*)')
      .eq('user_id', userId)
      .gte('timestamp', start)
      .order('timestamp', { ascending: false })
    if (error) throw error
    return ok((data ?? []) as (ConsumableLog & { material?: Material })[])
  } catch (e) {
    return fail(e)
  }
}

/** Sửa nhật ký (chỉ trong ngày) - điều chỉnh lại tồn kho theo chênh lệch */
export async function updateConsumableLog(
  logId: number,
  newQty: number
): Promise<ApiResult<ConsumableLog>> {
  if (!isSupabaseConfigured) {
    const log = mock.logs.find(l => l.id === logId)
    if (!log) return fail('Không tìm thấy nhật ký')
    const diff = newQty - log.qty
    log.qty = newQty
    const mat = mock.getMaterial(log.material_code ?? '')
    if (mat) mat.closing_qty -= diff
    return ok(log)
  }
  try {
    const { data: log, error: e1 } = await supabase
      .from('consumable_logs')
      .select('*')
      .eq('id', logId)
      .single()
    if (e1) throw e1
    const isToday = toISODate(new Date(log.timestamp)) === toISODate()
    if (!isToday) throw new Error('Chỉ sửa được nhật ký trong ngày')

    const diff = newQty - Number(log.qty) // dương = lấy thêm
    const { data: updated, error: e2 } = await supabase
      .from('consumable_logs')
      .update({ qty: newQty })
      .eq('id', logId)
      .select()
      .single()
    if (e2) throw e2

    if (log.material_code) {
      const { data: mat } = await supabase
        .from('materials')
        .select('closing_qty')
        .eq('code', log.material_code)
        .single()
      if (mat) {
        await supabase
          .from('materials')
          .update({ closing_qty: Number(mat.closing_qty) - diff })
          .eq('code', log.material_code)
      }
      await supabase.from('movements').update({ issue: newQty }).eq('source_type', 'consumable').eq('source_id', logId)
    }
    return ok(updated as ConsumableLog)
  } catch (e) {
    return fail(e)
  }
}

// =====================================================================
//  2. createVoucher - tạo phiếu + tự đánh số
// =====================================================================
export async function createVoucher(
  type: VoucherType,
  data: CreateVoucherData
): Promise<ApiResult<{ voucher: Voucher; items: VoucherItem[] }>> {
  if (!isSupabaseConfigured) {
    const d = new Date()
    const prefix = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0')
    const seq = String(mock.nextVoucherId).padStart(3, '0')
    const voucher: Voucher = {
      id: mock.nextVoucherId++,
      voucher_no: prefix + seq,
      type,
      date: data.date,
      receiver: data.receiver ?? null,
      supplier: data.supplier ?? null,
      vessel: data.vessel ?? null,
      job_code: data.job_code ?? null,
      status: 'draft',
      created_by: data.created_by ?? null,
      created_at: new Date().toISOString(),
    }
    mock.vouchers.push(voucher)
    const items: VoucherItem[] = data.items.map((item, i) => {
      const vi: VoucherItem = {
        id: mock.nextVoucherItemId++,
        voucher_id: voucher.id,
        material_code: item.material_code,
        description: item.description ?? null,
        qty_theory: item.qty_theory ?? null,
        qty_actual: item.qty_actual ?? null,
        unit: item.unit ?? null,
        remarks: item.remarks ?? null,
      }
      mock.voucherItems.push(vi)
      return vi
    })
    return ok({ voucher, items })
  }
  try {
    const voucher_no = await nextVoucherNo()

    const { data: voucher, error: vErr } = await supabase
      .from('vouchers')
      .insert({
        voucher_no,
        type,
        date: data.date,
        receiver: data.receiver ?? null,
        supplier: data.supplier ?? null,
        vessel: data.vessel ?? null,
        job_code: data.job_code ?? null,
        status: 'draft',
        created_by: data.created_by ?? null,
      })
      .select()
      .single()
    if (vErr) throw vErr

    const rows = (data.items || []).map((it) => ({
      voucher_id: voucher.id,
      material_code: it.material_code,
      description: it.description ?? null,
      qty_theory: it.qty_theory ?? null,
      qty_actual: it.qty_actual ?? null,
      unit: it.unit ?? null,
      remarks: it.remarks ?? null,
    }))

    let items: VoucherItem[] = []
    if (rows.length) {
      const { data: inserted, error: iErr } = await supabase.from('voucher_items').insert(rows).select()
      if (iErr) throw iErr
      items = (inserted ?? []) as VoucherItem[]
    }
    return ok({ voucher: voucher as Voucher, items })
  } catch (e) {
    return fail(e)
  }
}

/** Số phiếu tiếp theo: prefix YYMM (2 chữ số năm + 2 chữ số tháng) + 3 số thứ tự */
export async function nextVoucherNo(): Promise<string> {
  const now = new Date()
  const prefix = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('vouchers')
    .select('voucher_no')
    .like('voucher_no', `${prefix}%`)
    .order('voucher_no', { ascending: false })
    .limit(1)
  if (error) throw error
  let seq = 1
  if (data && data.length) {
    const last = data[0].voucher_no.slice(prefix.length)
    const n = parseInt(last, 10)
    if (!isNaN(n)) seq = n + 1
  }
  return `${prefix}${String(seq).padStart(3, '0')}`
}

// =====================================================================
//  3. confirmVoucher - duyệt phiếu -> ghi movements + trừ/cộng kho
// =====================================================================
export async function confirmVoucher(voucherId: number): Promise<ApiResult<Voucher>> {
  if (!isSupabaseConfigured) {
    const voucher = mock.vouchers.find(v => v.id === voucherId)
    if (!voucher) return fail('Không tìm thấy phiếu')
    if (voucher.status === 'confirmed') return fail('Phiếu đã duyệt rồi')
    voucher.status = 'confirmed'
    const items = mock.voucherItems.filter((i: any) => i.voucher_id === voucherId)
    items.forEach((item: any) => {
      const qty = Number(item.qty_actual) || Number(item.qty_theory) || 0
      if (qty <= 0) return
      const mat = mock.getMaterial(item.material_code)
      if (mat) {
        if (voucher.type === 'OUT') mat.closing_qty -= qty
        else mat.closing_qty += qty
      }
      mock.movements.push({
        id: mock.nextMovId++,
        source_type: 'voucher',
        source_id: voucher.id,
        date: voucher.date,
        code: item.material_code ?? '',
        description: mat?.description_vi ?? mat?.description ?? item.description ?? '',
        unit: item.unit ?? mat?.unit ?? null,
        receipt: voucher.type === 'IN' ? qty : 0,
        issue: voucher.type === 'OUT' ? qty : 0,
        job_code: voucher.job_code,
        vessel: voucher.vessel,
        created_at: new Date().toISOString(),
      })
    })
    return ok(voucher)
  }
  try {
    const { data: voucher, error: vErr } = await supabase
      .from('vouchers')
      .select('*')
      .eq('id', voucherId)
      .single()
    if (vErr) throw vErr
    if (voucher.status === 'confirmed') throw new Error('Phiếu đã được duyệt trước đó')

    const { data: items, error: iErr } = await supabase
      .from('voucher_items')
      .select('*, material:materials(*)')
      .eq('voucher_id', voucherId)
    if (iErr) throw iErr
    if (!items || !items.length) throw new Error('Phiếu chưa có dòng hàng')

    const isIn = voucher.type === 'IN'

    for (const it of items as (VoucherItem & { material?: Material })[]) {
      const qty = Number(it.qty_actual ?? it.qty_theory ?? 0)
      if (!it.material_code || qty <= 0) continue
      const mat = it.material

      // ghi movements
      await supabase.from('movements').insert({
        source_type: 'voucher',
        source_id: voucher.id,
        date: voucher.date,
        code: it.material_code,
        description: mat?.description || mat?.description_vi || it.description || null,
        unit: it.unit || mat?.unit || null,
        receipt: isIn ? qty : 0,
        issue: isIn ? 0 : qty,
        job_code: voucher.job_code,
        vessel: voucher.vessel,
      })

      // cập nhật tồn kho
      if (mat) {
        const newClosing = Number(mat.closing_qty) + (isIn ? qty : -qty)
        await supabase.from('materials').update({ closing_qty: newClosing }).eq('code', it.material_code)
      }
    }

    const { data: updated, error: uErr } = await supabase
      .from('vouchers')
      .update({ status: 'confirmed' })
      .eq('id', voucherId)
      .select()
      .single()
    if (uErr) throw uErr
    return ok(updated as Voucher)
  } catch (e) {
    return fail(e)
  }
}

// =====================================================================
//  4. getStockAlerts - hàng tồn thấp
// =====================================================================
export async function getStockAlerts(threshold = 20): Promise<ApiResult<Material[]>> {
  if (!isSupabaseConfigured) {
    return ok(mock.materials.filter(m => Number(m.closing_qty) <= threshold).sort((a, b) => Number(a.closing_qty) - Number(b.closing_qty)))
  }
  try {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .lte('closing_qty', threshold)
      .order('closing_qty', { ascending: true })
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return fail(e)
  }
}

// =====================================================================
//  5. getExpiryAlerts - cảnh báo hạn sử dụng
// =====================================================================
export async function getExpiryAlerts(
  monthsThreshold = 18
): Promise<ApiResult<(Material & { months_left: number })[]>> {
  if (!isSupabaseConfigured) {
    const rows = mock.materials
      .filter(m => m.has_expiry && m.expiry_date)
      .map(m => ({ ...m, months_left: monthsUntil(m.expiry_date) ?? 999 }))
      .filter(m => m.months_left <= monthsThreshold)
      .sort((a, b) => a.months_left - b.months_left)
    return ok(rows)
  }
  try {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('has_expiry', true)
      .not('expiry_date', 'is', null)
    if (error) throw error
    const rows = (data ?? [])
      .map((m) => ({ ...m, months_left: monthsUntil(m.expiry_date) ?? 999 }))
      .filter((m) => m.months_left <= monthsThreshold)
      .sort((a, b) => a.months_left - b.months_left)
    return ok(rows)
  } catch (e) {
    return fail(e)
  }
}

// =====================================================================
//  6. getCostByJob - tổng hợp vật tư theo JOB
// =====================================================================
export async function getCostByJob(jobCode: string): Promise<ApiResult<CostByJobRow[]>> {
  if (!isSupabaseConfigured) {
    const logs = mock.logs.filter(l => l.job_code === jobCode)
    const agg = new Map<string, { theory: number; actual: number }>()
    logs.forEach(l => {
      const cur = agg.get(l.material_code ?? '') ?? { theory: 0, actual: 0 }
      cur.actual += Number(l.qty) || 0
      cur.theory += Number(l.qty) || 0
      agg.set(l.material_code ?? '', cur)
    })
    const rows: CostByJobRow[] = []
    agg.forEach((v, code) => {
      const mat = mock.getMaterial(code)
      rows.push({
        material_code: code,
        description_vi: mat?.description_vi ?? null,
        unit: mat?.unit ?? null,
        qty_theory: v.theory,
        qty_actual: v.actual,
        diff: v.actual - v.theory,
        unit_price: mat?.unit_price ?? 0,
        amount: v.actual * (mat?.unit_price ?? 0),
      })
    })
    return ok(rows)
  }
  try {
    const [{ data: logs }, { data: vitems }, { data: mats }] = await Promise.all([
      supabase.from('consumable_logs').select('material_code, qty').eq('job_code', jobCode),
      supabase
        .from('voucher_items')
        .select('material_code, qty_theory, qty_actual, voucher:vouchers!inner(job_code, type)')
        .eq('voucher.job_code', jobCode),
      supabase.from('materials').select('*'),
    ])

    const matMap = new Map<string, Material>()
    ;(mats ?? []).forEach((m) => matMap.set(m.code, m as Material))

    const agg = new Map<string, { theory: number; actual: number }>()
    const bump = (code: string, theory: number, actual: number) => {
      const cur = agg.get(code) ?? { theory: 0, actual: 0 }
      cur.theory += theory
      cur.actual += actual
      agg.set(code, cur)
    }

    // log KTV = thực tế
    ;(logs ?? []).forEach((l) => {
      if (l.material_code) bump(l.material_code, 0, Number(l.qty) || 0)
    })
    // voucher OUT: qty_theory = lý thuyết, qty_actual = thực tế
    ;(vitems ?? []).forEach((v: any) => {
      if (!v.material_code) return
      const th = Number(v.qty_theory) || 0
      const ac = Number(v.qty_actual) || 0
      bump(v.material_code, th, ac)
    })

    const rows: CostByJobRow[] = []
    agg.forEach((val, code) => {
      const m = matMap.get(code)
      const price = m ? Number(m.unit_price) || 0 : 0
      rows.push({
        material_code: code,
        description_vi: m?.description_vi ?? null,
        unit: m?.unit ?? null,
        qty_theory: val.theory,
        qty_actual: val.actual,
        diff: val.actual - val.theory,
        unit_price: price,
        amount: val.actual * price,
      })
    })
    rows.sort((a, b) => b.amount - a.amount)
    return ok(rows)
  } catch (e) {
    return fail(e)
  }
}

// =====================================================================
//  7. getMovementReport - gộp movements theo mã hàng
// =====================================================================
export async function getMovementReport(
  startDate: string,
  endDate: string
): Promise<ApiResult<MovementReportRow[]>> {
  try {
    const { data, error } = await supabase
      .from('movements')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
    if (error) throw error

    const agg = new Map<string, MovementReportRow>()
    ;(data ?? []).forEach((m) => {
      const code = m.code ?? '(?)'
      const cur =
        agg.get(code) ??
        ({ code, description: m.description, unit: m.unit, receipt: 0, issue: 0 } as MovementReportRow)
      cur.receipt += Number(m.receipt) || 0
      cur.issue += Number(m.issue) || 0
      agg.set(code, cur)
    })
    return ok(Array.from(agg.values()).sort((a, b) => a.code.localeCompare(b.code)))
  } catch (e) {
    return fail(e)
  }
}

/** Danh sách movements thô (cho màn hình Movement) */
export async function getMovements(filters?: {
  start?: string
  end?: string
  jobCode?: string
  code?: string
}): Promise<ApiResult<Movement[]>> {
  if (!isSupabaseConfigured) {
    let mvs = [...mock.movements]
    if (filters?.start) mvs = mvs.filter(m => (m.date ?? '') >= filters.start!)
    if (filters?.end) mvs = mvs.filter(m => (m.date ?? '') <= filters.end!)
    if (filters?.jobCode) mvs = mvs.filter(m => m.job_code === filters.jobCode)
    if (filters?.code) mvs = mvs.filter(m => m.code === filters.code)
    return ok(mvs)
  }
  try {
    let q = supabase.from('movements').select('*').order('date', { ascending: true }).order('id')
    if (filters?.start) q = q.gte('date', filters.start)
    if (filters?.end) q = q.lte('date', filters.end)
    if (filters?.jobCode) q = q.eq('job_code', filters.jobCode)
    if (filters?.code) q = q.eq('code', filters.code)
    const { data, error } = await q
    if (error) throw error
    return ok((data ?? []) as Movement[])
  } catch (e) {
    return fail(e)
  }
}

// =====================================================================
//  8. logRollCut - cắt cuộn dài
// =====================================================================
export async function logRollCut(
  rollId: string,
  userId: number,
  jobCode: string,
  lengthUsed: number
): Promise<ApiResult<{ remaining: number; finished: boolean }>> {
  if (!isSupabaseConfigured) {
    if (!lengthUsed || lengthUsed <= 0) return fail('Số mét cắt phải lớn hơn 0')
    const roll = mock.rolls.find(r => r.roll_id === rollId)
    if (!roll) return fail('Không tìm thấy cuộn ' + rollId)
    roll.used_length += lengthUsed
    const remaining = roll.total_length - roll.used_length
    const finished = remaining <= 0
    if (finished) roll.status = 'finished'
    mock.rollCuts.push({ id: mock.nextRollCutId++, roll_id: rollId, user_id: userId, job_code: jobCode, length_used: lengthUsed, timestamp: new Date().toISOString() })
    return ok({ remaining: Math.max(0, remaining), finished })
  }
  try {
    if (!lengthUsed || lengthUsed <= 0) throw new Error('Số mét cắt phải lớn hơn 0')

    const { data: roll, error: rErr } = await supabase
      .from('roll_tracking')
      .select('*')
      .eq('roll_id', rollId)
      .single()
    if (rErr) throw rErr

    const { error: cErr } = await supabase.from('roll_cuts').insert({
      roll_id: rollId,
      user_id: userId,
      job_code: jobCode,
      length_used: lengthUsed,
    })
    if (cErr) throw cErr

    const newUsed = Number(roll.used_length) + lengthUsed
    const remaining = Number(roll.total_length) - newUsed
    const finished = remaining <= 0

    const { error: uErr } = await supabase
      .from('roll_tracking')
      .update({ used_length: newUsed, status: finished ? 'finished' : 'active' })
      .eq('roll_id', rollId)
    if (uErr) throw uErr

    // trừ tồn kho vật tư cuộn + ghi movement
    if (roll.material_code) {
      const { data: mat } = await supabase
        .from('materials')
        .select('closing_qty, unit, description, description_vi')
        .eq('code', roll.material_code)
        .single()
      if (mat) {
        await supabase
          .from('materials')
          .update({ closing_qty: Number(mat.closing_qty) - lengthUsed })
          .eq('code', roll.material_code)
        await supabase.from('movements').insert({
          source_type: 'roll',
          source_id: roll.id,
          date: toISODate(),
          code: roll.material_code,
          description: mat.description || mat.description_vi,
          unit: mat.unit,
          receipt: 0,
          issue: lengthUsed,
          job_code: jobCode,
          vessel: null,
        })
      }
    }
    return ok({ remaining, finished })
  } catch (e) {
    return fail(e)
  }
}

export async function getActiveRolls(): Promise<ApiResult<(RollTracking & { material?: Material })[]>> {
  if (!isSupabaseConfigured) {
    const rolls = mock.rolls.filter(r => r.status === 'active').map(r => ({
      ...r, material: mock.getMaterial(r.material_code ?? '')
    }))
    return ok(rolls as any)
  }
  try {
    const { data, error } = await supabase
      .from('roll_tracking')
      .select('*, material:materials(*)')
      .eq('status', 'active')
      .order('roll_id')
    if (error) throw error
    return ok((data ?? []) as (RollTracking & { material?: Material })[])
  } catch (e) {
    return fail(e)
  }
}

export async function getRollCuts(rollId: string): Promise<ApiResult<RollCut[]>> {
  if (!isSupabaseConfigured) {
    return ok(mock.rollCuts.filter(c => c.roll_id === rollId).reverse())
  }
  try {
    const { data, error } = await supabase
      .from('roll_cuts')
      .select('*')
      .eq('roll_id', rollId)
      .order('timestamp', { ascending: false })
    if (error) throw error
    return ok((data ?? []) as RollCut[])
  } catch (e) {
    return fail(e)
  }
}

// =====================================================================
//  PHIẾU: danh sách + chi tiết
// =====================================================================
export async function getVouchers(filters?: {
  type?: VoucherType
  status?: string
  month?: string // yyyy-mm
}): Promise<ApiResult<Voucher[]>> {
  if (!isSupabaseConfigured) {
    let vs = [...mock.vouchers]
    if (filters?.type) vs = vs.filter(v => v.type === filters.type)
    if (filters?.status) vs = vs.filter(v => v.status === filters.status)
    if (filters?.month) vs = vs.filter(v => v.date.startsWith(filters.month!))
    return ok(vs.reverse())
  }
  try {
    let q = supabase.from('vouchers').select('*').order('created_at', { ascending: false })
    if (filters?.type) q = q.eq('type', filters.type)
    if (filters?.status) q = q.eq('status', filters.status)
    if (filters?.month) {
      q = q.gte('date', `${filters.month}-01`).lte('date', `${filters.month}-31`)
    }
    const { data, error } = await q
    if (error) throw error
    return ok((data ?? []) as Voucher[])
  } catch (e) {
    return fail(e)
  }
}

export async function getVoucher(
  id: number
): Promise<ApiResult<{ voucher: Voucher; items: (VoucherItem & { material?: Material })[] }>> {
  if (!isSupabaseConfigured) {
    const voucher = mock.vouchers.find(v => v.id === id)
    if (!voucher) return fail('Không tìm thấy phiếu')
    const items = mock.voucherItems.filter((i: any) => i.voucher_id === id).map((i: any) => ({
      ...i, material: mock.getMaterial(i.material_code ?? '')
    }))
    return ok({ voucher, items })
  }
  try {
    const { data: voucher, error: vErr } = await supabase.from('vouchers').select('*').eq('id', id).single()
    if (vErr) throw vErr
    const { data: items, error: iErr } = await supabase
      .from('voucher_items')
      .select('*, material:materials(*)')
      .eq('voucher_id', id)
      .order('id')
    if (iErr) throw iErr
    return ok({ voucher: voucher as Voucher, items: (items ?? []) as any })
  } catch (e) {
    return fail(e)
  }
}

// =====================================================================
//  DASHBOARD
// =====================================================================
export async function getDashboardStats(): Promise<
  ApiResult<{
    totalMaterials: number
    lowStock: number
    issueThisMonth: number
    receiptThisMonth: number
  }>
> {
  if (!isSupabaseConfigured) {
    const lowStock = mock.materials.filter(m => Number(m.closing_qty) <= m.min_stock).length
    let issue = 0, receipt = 0
    mock.movements.forEach(m => { issue += Number(m.issue) || 0; receipt += Number(m.receipt) || 0 })
    return ok({ totalMaterials: mock.materials.length, lowStock, issueThisMonth: issue, receiptThisMonth: receipt })
  }
  try {
    const { start, end } = monthRange()
    const startDate = start.slice(0, 10)
    const endDate = end.slice(0, 10)

    const [{ count: totalMaterials }, { data: mats }, { data: movs }] = await Promise.all([
      supabase.from('materials').select('*', { count: 'exact', head: true }),
      supabase.from('materials').select('closing_qty, min_stock'),
      supabase.from('movements').select('receipt, issue, date').gte('date', startDate).lte('date', endDate),
    ])

    const lowStock = (mats ?? []).filter((m) => Number(m.closing_qty) <= Number(m.min_stock)).length
    let issue = 0
    let receipt = 0
    ;(movs ?? []).forEach((m) => {
      issue += Number(m.issue) || 0
      receipt += Number(m.receipt) || 0
    })

    return ok({
      totalMaterials: totalMaterials ?? 0,
      lowStock,
      issueThisMonth: issue,
      receiptThisMonth: receipt,
    })
  } catch (e) {
    return fail(e)
  }
}

/** Top N hàng xuất nhiều nhất tháng này */
export async function getTopIssued(limit = 10): Promise<ApiResult<{ code: string; description: string; total: number }[]>> {
  if (!isSupabaseConfigured) {
    const agg = new Map<string, { code: string; description: string; total: number }>()
    mock.movements.filter(m => Number(m.issue) > 0).forEach(m => {
      const code = m.code ?? '(?)'
      const cur = agg.get(code) ?? { code, description: m.description ?? code, total: 0 }
      cur.total += Number(m.issue) || 0
      agg.set(code, cur)
    })
    return ok(Array.from(agg.values()).sort((a, b) => b.total - a.total).slice(0, limit))
  }
  try {
    const { start, end } = monthRange()
    const { data, error } = await supabase
      .from('movements')
      .select('code, description, issue')
      .gte('date', start.slice(0, 10))
      .lte('date', end.slice(0, 10))
      .gt('issue', 0)
    if (error) throw error
    const agg = new Map<string, { code: string; description: string; total: number }>()
    ;(data ?? []).forEach((m) => {
      const code = m.code ?? '(?)'
      const cur = agg.get(code) ?? { code, description: m.description ?? code, total: 0 }
      cur.total += Number(m.issue) || 0
      agg.set(code, cur)
    })
    return ok(Array.from(agg.values()).sort((a, b) => b.total - a.total).slice(0, limit))
  } catch (e) {
    return fail(e)
  }
}

/** Xu hướng xuất/nhập 4 tuần gần nhất */
export async function getWeeklyTrend(): Promise<ApiResult<{ week: string; issue: number; receipt: number }[]>> {
  if (!isSupabaseConfigured) {
    return ok([
      { week: 'Tuần 1', issue: 0, receipt: 0 },
      { week: 'Tuần 2', issue: 0, receipt: 0 },
      { week: 'Tuần 3', issue: 0, receipt: 0 },
      { week: 'Tuần 4', issue: 0, receipt: 0 },
    ])
  }
  try {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 27)
    const { data, error } = await supabase
      .from('movements')
      .select('date, issue, receipt')
      .gte('date', toISODate(start))
      .lte('date', toISODate(end))
    if (error) throw error

    const weeks: { week: string; issue: number; receipt: number }[] = []
    for (let i = 3; i >= 0; i--) {
      const wStart = new Date()
      wStart.setDate(end.getDate() - i * 7 - 6)
      const wEnd = new Date()
      wEnd.setDate(end.getDate() - i * 7)
      weeks.push({ week: `Tuần ${4 - i}`, issue: 0, receipt: 0 })
      ;(data ?? []).forEach((m) => {
        if (!m.date) return
        const d = new Date(m.date)
        if (d >= new Date(toISODate(wStart)) && d <= new Date(toISODate(wEnd) + 'T23:59:59')) {
          weeks[weeks.length - 1].issue += Number(m.issue) || 0
          weeks[weeks.length - 1].receipt += Number(m.receipt) || 0
        }
      })
    }
    return ok(weeks)
  } catch (e) {
    return fail(e)
  }
}

/** Báo cáo theo KTV */
export async function getUserReport(
  userId: number,
  start: string,
  end: string
): Promise<ApiResult<(ConsumableLog & { material?: Material })[]>> {
  if (!isSupabaseConfigured) {
    const logs = mock.logs
      .filter(l => l.user_id === userId && l.timestamp >= start + 'T00:00:00' && l.timestamp <= end + 'T23:59:59')
      .map(l => ({ ...l, material: mock.getMaterial(l.material_code ?? '') }))
      .reverse()
    return ok(logs as any)
  }
  try {
    const { data, error } = await supabase
      .from('consumable_logs')
      .select('*, material:materials(*)')
      .eq('user_id', userId)
      .gte('timestamp', start + 'T00:00:00')
      .lte('timestamp', end + 'T23:59:59')
      .order('timestamp', { ascending: false })
    if (error) throw error
    return ok((data ?? []) as any)
  } catch (e) {
    return fail(e)
  }
}

/** Tổng vật tư theo từng KTV (đếm ai xài nhiều) */
export async function getUsageByUser(): Promise<ApiResult<{ name: string; total: number }[]>> {
  if (!isSupabaseConfigured) {
    const { USERS } = await import('./mock')
    const agg = new Map<string, number>()
    mock.logs.forEach(l => {
      const user = USERS.find(u => u.id === l.user_id)
      const name = user?.name ?? '(?)'
      agg.set(name, (agg.get(name) ?? 0) + (Number(l.qty) || 0))
    })
    return ok(Array.from(agg.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total))
  }
  try {
    const { data, error } = await supabase.from('consumable_logs').select('qty, user:users(name)')
    if (error) throw error
    const agg = new Map<string, number>()
    ;(data ?? []).forEach((l: any) => {
      const name = l.user?.name ?? '(?)'
      agg.set(name, (agg.get(name) ?? 0) + (Number(l.qty) || 0))
    })
    return ok(Array.from(agg.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total))
  } catch (e) {
    return fail(e)
  }
}

// =====================================================================
//  9-11. XUẤT EXCEL (delegate sang excel.ts)
// =====================================================================
export async function exportMaterialExcel(): Promise<ApiResult<null>> {
  try {
    const [{ data: mats, error: e1 }, { data: movs, error: e2 }] = await Promise.all([
      supabase.from('materials').select('*').order('code'),
      supabase.from('movements').select('code, receipt, issue'),
    ])
    if (e1) throw e1
    if (e2) throw e2
    const wb = buildMaterialWorkbook((mats ?? []) as Material[], (movs ?? []) as any)
    saveWorkbook(wb, `Material_${new Date().toISOString().slice(0, 7)}.xlsx`)
    return ok(null)
  } catch (e) {
    return fail(e)
  }
}

export async function exportMovementExcel(startDate: string, endDate: string): Promise<ApiResult<null>> {
  try {
    const { data: movs, error } = await supabase
      .from('movements')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')
      .order('id')
    if (error) throw error
    const wb = buildMovementWorkbook((movs ?? []) as Movement[], startDate, endDate)
    saveWorkbook(wb, `Movement_${startDate}_${endDate}.xlsx`)
    return ok(null)
  } catch (e) {
    return fail(e)
  }
}

export async function exportVoucherExcel(voucherId: number): Promise<ApiResult<null>> {
  try {
    const res = await getVoucher(voucherId)
    if (!res.success || !res.data) throw new Error(res.error ?? 'Không đọc được phiếu')
    const { voucher, items } = res.data
    const wb = buildVoucherWorkbook(voucher, items)
    const prefix = voucher.type === 'OUT' ? 'ISSUE' : 'RECEIVING'
    saveWorkbook(wb, `${prefix}_VOUCHER_${voucher.voucher_no}.xlsx`)
    return ok(null)
  } catch (e) {
    return fail(e)
  }
}
