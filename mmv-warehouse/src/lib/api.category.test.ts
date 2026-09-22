/**
 * materials.category là TRỤC PHÂN QUYỀN, không phải nhãn hiển thị:
 *
 *   consumable -> KTV tự lấy ở màn Lấy vật tư
 *   roll       -> KTV cắt ở màn Cắt cuộn
 *   general    -> CHỈ ADMIN, ở màn Nhập/Xuất kho
 *
 * Đây là nhóm test quan trọng nhất của tính năng. Cái hỏng ở đây không
 * báo lỗi, không đỏ màn hình - nó chỉ lặng lẽ mở cho KTV tự xuất 1466 mã
 * hàng ngoài tiêu hao, và nhiều tuần sau mới lộ ra qua chênh lệch kiểm kê.
 *
 * LƯU Ý phạm vi: chạy trên nhánh mock. Mỗi hàm ở đây còn một bản Supabase
 * (RPC trong supabase/schema.sql) với cùng ngữ nghĩa, KHÔNG được test ở
 * đây. Sửa quy tắc quyền thì phải sửa cả hai nhánh.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Material, MaterialCategory } from './types'

vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, {
    get() {
      throw new Error('Test chạm vào Supabase client - đáng lẽ phải đi nhánh mock')
    },
  }),
  isSupabaseConfigured: false,
}))

type Api = typeof import('./api')
type Store = (typeof import('./mock'))['store']

let api: Api
let store: Store

beforeEach(async () => {
  vi.resetModules()
  api = await import('./api')
  store = (await import('./mock')).store
})

function firstOf(category: MaterialCategory): Material {
  const m = store.materials.find((x) => x.category === category)
  if (!m) throw new Error(`Mock thiếu vật tư nhóm ${category}`)
  return m
}

describe('getConsumableMaterials - danh sách cho phép, không phải danh sách loại trừ', () => {
  it('chỉ trả về vật tư tiêu hao', async () => {
    const res = await api.getConsumableMaterials()

    expect(res.success).toBe(true)
    expect(res.data!.length).toBeGreaterThan(0)
    expect(res.data!.every((m) => m.category === 'consumable')).toBe(true)
  })

  it('KHÔNG trả về vật tư ngoài tiêu hao', async () => {
    // Bản cũ lọc `category !== 'roll'` - đọc thì tưởng là "vật tư tiêu
    // hao", nhưng khi danh mục đầy đủ 1501 mã về thì nó có nghĩa là
    // "cả kho". Test này là chốt chặn để không ai quay lại cách lọc đó.
    const res = await api.getConsumableMaterials()

    expect(res.data!.some((m) => m.category === 'general')).toBe(false)
    expect(store.materials.some((m) => m.category === 'general')).toBe(true) // mock phải có general để test có nghĩa
  })

  it('KHÔNG trả về cuộn cắt dần', async () => {
    const res = await api.getConsumableMaterials()

    expect(res.data!.some((m) => m.category === 'roll')).toBe(false)
  })
})

describe('logConsumable - KTV chỉ lấy được vật tư tiêu hao', () => {
  it('cho phép lấy vật tư tiêu hao', async () => {
    const m = firstOf('consumable')
    const before = Number(m.closing_qty)

    const res = await api.logConsumable(2, m.code, 3, 'WO26-0392')

    expect(res.success).toBe(true)
    expect(Number(store.getMaterial(m.code)!.closing_qty)).toBe(before - 3)
  })

  it('từ chối vật tư ngoài tiêu hao và KHÔNG động vào tồn kho', async () => {
    const m = firstOf('general')
    const before = Number(m.closing_qty)

    const res = await api.logConsumable(2, m.code, 3, 'WO26-0392')

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/không phải vật tư tiêu hao/)
    expect(Number(store.getMaterial(m.code)!.closing_qty)).toBe(before)
    expect(store.logs).toHaveLength(0)
    expect(store.movements).toHaveLength(0)
  })

  it('từ chối cuộn cắt dần - cuộn đi qua logRollCut, không qua đây', async () => {
    const m = firstOf('roll')
    const before = Number(m.closing_qty)

    const res = await api.logConsumable(2, m.code, 3, 'WO26-0392')

    expect(res.success).toBe(false)
    expect(Number(store.getMaterial(m.code)!.closing_qty)).toBe(before)
  })

  it('thông báo lỗi chỉ đúng chỗ cần làm', async () => {
    const m = firstOf('general')
    const res = await api.logConsumable(2, m.code, 1, 'WO26-0392')

    expect(res.error).toContain(m.code)
    expect(res.error).toMatch(/Nhập\/Xuất kho/)
  })
})

describe('confirmVoucher - phiếu có mã ngoài tiêu hao thì chỉ admin duyệt', () => {
  async function draftVoucherFor(code: string) {
    const res = await api.createVoucher('OUT', {
      date: '2026-09-18',
      items: [{ material_code: code, qty_theory: 2, qty_actual: 2 }],
    })
    return res.data!.voucher
  }

  it('chặn vai trò kho khi phiếu có vật tư ngoài tiêu hao', async () => {
    const m = firstOf('general')
    const before = Number(m.closing_qty)
    const v = await draftVoucherFor(m.code)

    const res = await api.confirmVoucher(v.id, 'warehouse')

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/chỉ admin/i)
    // Phiếu phải còn nháp và kho không được trừ - duyệt hụt mà vẫn trừ
    // kho là kiểu sai tệ nhất, vì bấm lại lần nữa sẽ trừ hai lần.
    expect(store.vouchers.find((x) => x.id === v.id)!.status).toBe('draft')
    expect(Number(store.getMaterial(m.code)!.closing_qty)).toBe(before)
    expect(store.movements).toHaveLength(0)
  })

  it('cho phép admin duyệt phiếu đó', async () => {
    const m = firstOf('general')
    const before = Number(m.closing_qty)
    const v = await draftVoucherFor(m.code)

    const res = await api.confirmVoucher(v.id, 'admin')

    expect(res.success).toBe(true)
    expect(store.vouchers.find((x) => x.id === v.id)!.status).toBe('confirmed')
    expect(Number(store.getMaterial(m.code)!.closing_qty)).toBe(before - 2)
  })

  it('vai trò kho vẫn duyệt được phiếu toàn vật tư tiêu hao', async () => {
    const m = firstOf('consumable')
    const v = await draftVoucherFor(m.code)

    const res = await api.confirmVoucher(v.id, 'warehouse')

    expect(res.success).toBe(true)
  })

  it('bỏ trống vai trò thì giữ nguyên hành vi cũ, không kiểm', async () => {
    const m = firstOf('general')
    const v = await draftVoucherFor(m.code)

    const res = await api.confirmVoucher(v.id)

    expect(res.success).toBe(true)
  })

  it('nêu tên mã có vấn đề để người duyệt biết bỏ dòng nào ra', async () => {
    const m = firstOf('general')
    const v = await draftVoucherFor(m.code)

    const res = await api.confirmVoucher(v.id, 'ktv')

    expect(res.error).toContain(m.code)
  })
})

describe('updateMaterialCategory - admin đổi nhóm', () => {
  it('đổi được nhóm của một mã', async () => {
    const m = firstOf('general')

    const res = await api.updateMaterialCategory(m.code, 'consumable', { actorRole: 'admin' })

    expect(res.success).toBe(true)
    expect(store.getMaterial(m.code)!.category).toBe('consumable')
  })

  it('mã vừa đổi sang tiêu hao thì KTV thấy ngay ở màn Lấy vật tư', async () => {
    const m = firstOf('general')
    await api.updateMaterialCategory(m.code, 'consumable', { actorRole: 'admin' })

    const res = await api.getConsumableMaterials()

    expect(res.data!.some((x) => x.code === m.code)).toBe(true)
  })

  it('đổi sang tiêu hao thì đặt luôn ngưỡng tồn thấp', async () => {
    // general được nạp với min_stock = 0 (không theo dõi đặt hàng lại).
    // Giữ nguyên 0 thì mã đó không bao giờ vào cảnh báo tồn thấp.
    const m = firstOf('general')
    expect(Number(m.min_stock)).toBe(0)

    await api.updateMaterialCategory(m.code, 'consumable', { actorRole: 'admin' })

    expect(Number(store.getMaterial(m.code)!.min_stock)).toBeGreaterThan(0)
  })

  it('đổi sang general thì thôi theo dõi đặt hàng lại', async () => {
    const m = firstOf('consumable')

    await api.updateMaterialCategory(m.code, 'general', { actorRole: 'admin' })

    expect(Number(store.getMaterial(m.code)!.min_stock)).toBe(0)
  })

  it.each(['ktv', 'warehouse', 'manager', 'sales'])('từ chối vai trò %s', async (role) => {
    const m = firstOf('general')

    const res = await api.updateMaterialCategory(m.code, 'consumable', { actorRole: role })

    expect(res.success).toBe(false)
    expect(store.getMaterial(m.code)!.category).toBe('general')
  })

  it('từ chối mã không có trong danh mục', async () => {
    const res = await api.updateMaterialCategory('KHONG-CO', 'consumable', { actorRole: 'admin' })

    expect(res.success).toBe(false)
  })
})

describe('getStockAlerts - bỏ qua mã không theo dõi đặt hàng lại', () => {
  it('không báo động mã có min_stock = 0', async () => {
    // 1466 mã general để min_stock = 0, trong đó ~889 mã tồn bằng 0.
    // Không lọc thì Dashboard báo gần 900 mã và chôn mất vài mã tiêu hao
    // thật sự cần mua.
    const res = await api.getStockAlerts(20)

    expect(res.success).toBe(true)
    expect(res.data!.every((m) => Number(m.min_stock) > 0)).toBe(true)
  })

  it('mẫu mock thật sự có mã tồn 0 bị bỏ qua - nếu không test trên vô nghĩa', async () => {
    const bequiet = store.materials.filter(
      (m) => Number(m.min_stock) === 0 && Number(m.closing_qty) <= 20
    )
    expect(bequiet.length).toBeGreaterThan(0)

    const res = await api.getStockAlerts(20)
    expect(res.data!.some((m) => m.code === bequiet[0].code)).toBe(false)
  })

  it('vẫn báo động vật tư tiêu hao xuống dưới ngưỡng', async () => {
    const m = firstOf('consumable')
    m.closing_qty = 1

    const res = await api.getStockAlerts(20)

    expect(res.data!.some((x) => x.code === m.code)).toBe(true)
  })
})

describe('searchMaterials - ô tìm của màn Nhập/Xuất kho', () => {
  it('tìm theo mã', async () => {
    const m = firstOf('general')

    const res = await api.searchMaterials(m.code)

    expect(res.data!.some((x) => x.code === m.code)).toBe(true)
  })

  it('tìm theo tên hàng, không phân biệt hoa thường', async () => {
    const m = store.materials.find((x) => (x.description ?? '').length > 6)!
    const fragment = m.description!.slice(2, 8)

    const res = await api.searchMaterials(fragment.toUpperCase(), { limit: 200 })

    expect(res.data!.some((x) => x.code === m.code)).toBe(true)
  })

  it('tìm được cả vật tư ngoài tiêu hao - đây là mục đích của nó', async () => {
    const res = await api.searchMaterials('', { limit: 500 })

    expect(res.data!.some((x) => x.category === 'general')).toBe(true)
  })

  it('lọc được theo nhóm', async () => {
    const res = await api.searchMaterials('', { category: 'consumable', limit: 500 })

    expect(res.data!.every((x) => x.category === 'consumable')).toBe(true)
  })

  it('tôn trọng limit - danh mục 1501 mã không đổ hết lên màn hình', async () => {
    const res = await api.searchMaterials('', { limit: 5 })

    expect(res.data).toHaveLength(5)
  })

  it('không tìm thấy thì trả mảng rỗng, không phải lỗi', async () => {
    const res = await api.searchMaterials('zzz-khong-ton-tai-zzz')

    expect(res.success).toBe(true)
    expect(res.data).toEqual([])
  })
})
