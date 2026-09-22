/**
 * logStockMove - admin nhập/xuất vật tư ngoài tiêu hao.
 *
 * Chạy trên nhánh mock (isSupabaseConfigured = false). Nhánh Supabase là
 * RPC log_stock_move trong supabase/schema.sql, không test được ở đây -
 * xem chú thích ở đầu api.category.test.ts về việc hai nhánh phải khớp
 * ngữ nghĩa.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Material } from './types'

// Ép về nhánh mock. vite.config.ts cũng đã xoá biến VITE_* khi chạy test,
// nhưng chặn ở đây là chắc chắn: máy dev CÓ .env thật, và một lần chạy
// test gọi nhầm lên Supabase thật là ghi thẳng vào kho của công ty.
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

// store trong mock.ts là state dùng chung ở cấp module, và
// `materials: [...MATERIALS]` chỉ copy nông - các object vật tư dùng
// CHUNG với mảng gốc. Nên phải nạp lại module cho mỗi test, không thì
// tồn kho của test trước rò sang test sau.
beforeEach(async () => {
  vi.resetModules()
  api = await import('./api')
  store = (await import('./mock')).store
})

const ADMIN_ID = 1

/** Một mã 'general' bất kỳ trong mẫu mock, kèm tồn ban đầu > 0. */
function aGeneral(): Material {
  const m = store.materials.find((x) => x.category === 'general' && Number(x.closing_qty) > 0)
  if (!m) throw new Error('Mock thiếu vật tư general có tồn - xem MATERIALS trong mock.ts')
  return m
}

describe('logStockMove - cộng trừ tồn kho', () => {
  it('NHẬP cộng vào tồn kho', async () => {
    const m = aGeneral()
    const before = Number(m.closing_qty)

    const res = await api.logStockMove(ADMIN_ID, m.code, 'IN', 7, { actorRole: 'admin' })

    expect(res.success).toBe(true)
    expect(res.data?.closing_qty).toBe(before + 7)
    expect(Number(store.getMaterial(m.code)!.closing_qty)).toBe(before + 7)
  })

  it('XUẤT trừ khỏi tồn kho', async () => {
    const m = aGeneral()
    const before = Number(m.closing_qty)

    const res = await api.logStockMove(ADMIN_ID, m.code, 'OUT', 3, { actorRole: 'admin' })

    expect(res.success).toBe(true)
    expect(res.data?.closing_qty).toBe(before - 3)
    expect(Number(store.getMaterial(m.code)!.closing_qty)).toBe(before - 3)
  })

  it('cộng dồn qua nhiều lần ghi', async () => {
    const m = aGeneral()
    const before = Number(m.closing_qty)

    await api.logStockMove(ADMIN_ID, m.code, 'IN', 10, { actorRole: 'admin' })
    await api.logStockMove(ADMIN_ID, m.code, 'OUT', 4, { actorRole: 'admin' })
    const last = await api.logStockMove(ADMIN_ID, m.code, 'IN', 1, { actorRole: 'admin' })

    expect(last.data?.closing_qty).toBe(before + 7)
  })
})

describe('logStockMove - ba lệnh ghi bắt buộc', () => {
  // CLAUDE.md: mọi luồng chạm tồn kho phải ghi đủ ba thứ - chứng từ gốc,
  // materials.closing_qty, và một dòng sổ cái movements. Thiếu dòng sổ
  // cái thì tồn kho và báo cáo/Export lệch nhau mà không ai thấy.
  it('ghi một dòng stock_moves với đủ thông tin chứng từ', async () => {
    const m = aGeneral()

    await api.logStockMove(ADMIN_ID, m.code, 'OUT', 2, {
      jobCode: 'WO26-0392',
      vessel: 'MV Ocean Star',
      note: 'xuất cho tàu',
      actorRole: 'admin',
    })

    expect(store.stockMoves).toHaveLength(1)
    expect(store.stockMoves[0]).toMatchObject({
      user_id: ADMIN_ID,
      material_code: m.code,
      type: 'OUT',
      qty: 2,
      job_code: 'WO26-0392',
      vessel: 'MV Ocean Star',
      note: 'xuất cho tàu',
    })
  })

  it('ghi một dòng movements, NHẬP vào cột receipt', async () => {
    const m = aGeneral()

    await api.logStockMove(ADMIN_ID, m.code, 'IN', 5, { actorRole: 'admin' })

    const mv = store.movements.filter((x) => x.source_type === 'stock')
    expect(mv).toHaveLength(1)
    expect(mv[0]).toMatchObject({ code: m.code, receipt: 5, issue: 0 })
  })

  it('ghi một dòng movements, XUẤT vào cột issue', async () => {
    const m = aGeneral()

    await api.logStockMove(ADMIN_ID, m.code, 'OUT', 5, { actorRole: 'admin' })

    const mv = store.movements.filter((x) => x.source_type === 'stock')
    expect(mv).toHaveLength(1)
    expect(mv[0]).toMatchObject({ code: m.code, receipt: 0, issue: 5 })
  })

  it('movements trỏ đúng về dòng stock_moves vừa tạo', async () => {
    const m = aGeneral()

    await api.logStockMove(ADMIN_ID, m.code, 'IN', 1, { actorRole: 'admin' })

    const mv = store.movements.find((x) => x.source_type === 'stock')!
    expect(mv.source_id).toBe(store.stockMoves[0].id)
  })

  it('sổ cái và tồn kho khớp nhau sau nhiều lần ghi', async () => {
    const m = aGeneral()
    const before = Number(m.closing_qty)

    await api.logStockMove(ADMIN_ID, m.code, 'IN', 12, { actorRole: 'admin' })
    await api.logStockMove(ADMIN_ID, m.code, 'OUT', 5, { actorRole: 'admin' })
    await api.logStockMove(ADMIN_ID, m.code, 'OUT', 2, { actorRole: 'admin' })

    // Cùng phép đối soát mà view v_doi_soat_ton_kho làm phía Postgres.
    const theoSoCai = store.movements
      .filter((x) => x.code === m.code)
      .reduce((sum, x) => sum + Number(x.receipt) - Number(x.issue), 0)

    expect(Number(store.getMaterial(m.code)!.closing_qty)).toBe(before + theoSoCai)
  })
})

describe('logStockMove - chặn sai', () => {
  it('từ chối số lượng bằng 0', async () => {
    const m = aGeneral()
    const res = await api.logStockMove(ADMIN_ID, m.code, 'IN', 0, { actorRole: 'admin' })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/lớn hơn 0/)
  })

  it('từ chối số lượng âm và không ghi gì', async () => {
    const m = aGeneral()
    const before = Number(m.closing_qty)

    const res = await api.logStockMove(ADMIN_ID, m.code, 'OUT', -5, { actorRole: 'admin' })

    expect(res.success).toBe(false)
    expect(Number(store.getMaterial(m.code)!.closing_qty)).toBe(before)
    expect(store.stockMoves).toHaveLength(0)
    expect(store.movements).toHaveLength(0)
  })

  it('từ chối mã vật tư không có trong danh mục', async () => {
    const res = await api.logStockMove(ADMIN_ID, 'KHONG-CO-MA-NAY', 'IN', 1, { actorRole: 'admin' })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Không tìm thấy mã vật tư/)
    expect(store.movements).toHaveLength(0)
  })
})

describe('logStockMove - quyền', () => {
  // Quy tắc của cả tính năng: ngoài vật tư tiêu hao thì chỉ admin được
  // nhập/xuất. Đây là lớp chặn ở tầng API; còn hai lớp nữa là route
  // trong App.tsx và tham số p_actor_role của RPC.
  it.each(['ktv', 'warehouse', 'manager', 'sales'])(
    'từ chối vai trò %s và không ghi gì',
    async (role) => {
      const m = aGeneral()
      const before = Number(m.closing_qty)

      const res = await api.logStockMove(ADMIN_ID, m.code, 'IN', 5, { actorRole: role })

      expect(res.success).toBe(false)
      expect(res.error).toMatch(/[Cc]hỉ admin/)
      expect(Number(store.getMaterial(m.code)!.closing_qty)).toBe(before)
      expect(store.stockMoves).toHaveLength(0)
      expect(store.movements).toHaveLength(0)
    }
  )

  it('cho phép vai trò admin', async () => {
    const m = aGeneral()
    const res = await api.logStockMove(ADMIN_ID, m.code, 'IN', 5, { actorRole: 'admin' })
    expect(res.success).toBe(true)
  })

  it('bỏ trống actorRole thì không kiểm quyền', async () => {
    // Giữ nguyên hành vi cũ cho chỗ gọi chưa truyền vai trò. Lớp chặn
    // thật khi đó là route + RPC.
    const m = aGeneral()
    const res = await api.logStockMove(ADMIN_ID, m.code, 'IN', 5)
    expect(res.success).toBe(true)
  })
})

describe('logStockMove - tồn âm', () => {
  // Giống logConsumable: tồn âm ĐƯỢC PHÉP, chỉ cảnh báo. Kho vẫn phải
  // xuất được hàng khi sổ sách chưa kịp cập nhật.
  it('cho ghi nhưng trả về cảnh báo TỒN ÂM', async () => {
    const m = aGeneral()
    const qty = Number(m.closing_qty) + 10

    const res = await api.logStockMove(ADMIN_ID, m.code, 'OUT', qty, { actorRole: 'admin' })

    expect(res.success).toBe(true)
    expect(res.warning).toMatch(/TỒN ÂM/)
    expect(res.data?.closing_qty).toBe(-10)
  })

  it('không cảnh báo khi tồn còn dương', async () => {
    const m = aGeneral()
    const res = await api.logStockMove(ADMIN_ID, m.code, 'OUT', 1, { actorRole: 'admin' })

    expect(res.success).toBe(true)
    expect(res.warning).toBeUndefined()
  })
})

describe('getStockMoves', () => {
  it('trả về lần ghi mới nhất trước', async () => {
    const m = aGeneral()
    await api.logStockMove(ADMIN_ID, m.code, 'IN', 1, { actorRole: 'admin' })
    await api.logStockMove(ADMIN_ID, m.code, 'IN', 2, { actorRole: 'admin' })

    const res = await api.getStockMoves()

    expect(res.success).toBe(true)
    expect(res.data?.map((x) => x.qty)).toEqual([2, 1])
  })

  it('kèm theo thông tin vật tư để bảng hiện được tên hàng', async () => {
    const m = aGeneral()
    await api.logStockMove(ADMIN_ID, m.code, 'IN', 1, { actorRole: 'admin' })

    const res = await api.getStockMoves()

    expect(res.data?.[0].material?.code).toBe(m.code)
  })

  it('tôn trọng limit', async () => {
    const m = aGeneral()
    for (let i = 0; i < 5; i++) {
      await api.logStockMove(ADMIN_ID, m.code, 'IN', 1, { actorRole: 'admin' })
    }

    const res = await api.getStockMoves(3)

    expect(res.data).toHaveLength(3)
  })
})
