/**
 * buildMaterialWorkbook - bản Export Material.
 *
 * Bản xuất ra phải dựng lại ĐÚNG Material.xlsx của kho: cùng thứ tự cột,
 * cùng ý nghĩa từng cột. Bố cục ở đây là theo vị trí (dòng tiêu đề, dòng
 * trống, dòng header, rồi dữ liệu) nên chèn thêm một dòng là lệch hết
 * mọi tham chiếu style và merge - xem CLAUDE.md mục Excel export.
 */
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx-js-style'
import { buildMaterialWorkbook } from './excel'
import type { Material, Movement } from './types'

// Vị trí cột trong sheet Material, đếm từ 0.
const COL = {
  ITEMS: 0,
  LOCATION: 1,
  TYPE: 2,
  REMARK: 3,
  STATUS: 4,
  CODE: 5,
  DESCRIPTION: 6,
  UNIT: 7,
  BEGINNING: 8,
  RECEIPT: 9,
  ISSUE: 10,
  CLOSING: 11,
} as const

const HEADER_ROW = 2
const FIRST_DATA_ROW = 3

function material(over: Partial<Material> = {}): Material {
  return {
    id: 1,
    code: 'VIK1055229',
    description: 'Do not pull label',
    description_vi: null,
    unit: 'pcs',
    category: 'general',
    min_stock: 0,
    closing_qty: 5,
    lead_time_days: 60,
    has_expiry: false,
    expiry_date: null,
    unit_price: 0,
    location: 'B3.1.2',
    mat_type: 'VIK',
    remark: 'audit 2024',
    stock_status: 'fast',
    created_at: '2026-01-01',
    ...over,
  }
}

function sheetRows(materials: Material[], movements: Pick<Movement, 'code' | 'receipt' | 'issue'>[] = []) {
  const wb = buildMaterialWorkbook(materials, movements)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    blankrows: true,
    defval: '',
  })
}

describe('bố cục sheet', () => {
  it('đặt tên sheet là Material', () => {
    const wb = buildMaterialWorkbook([material()], [])
    expect(wb.SheetNames).toEqual(['Material'])
  })

  it('giữ đúng 12 cột theo đúng thứ tự của Material.xlsx', () => {
    const rows = sheetRows([material()])

    expect(rows[HEADER_ROW]).toEqual([
      'ITEMS', 'Location', 'Type', 'Remark', 'Status',
      'Code', 'Description', 'R', 'Beginning', 'Receipt', 'Issue', 'Closing',
    ])
  })

  it('dữ liệu bắt đầu ngay dưới dòng header', () => {
    const rows = sheetRows([material({ code: 'ABC' })])

    expect(rows[FIRST_DATA_ROW][COL.CODE]).toBe('ABC')
  })

  it('đánh số ITEMS từ 1', () => {
    const rows = sheetRows([
      material({ code: 'A' }),
      material({ code: 'B' }),
      material({ code: 'C' }),
    ])

    expect(rows.slice(FIRST_DATA_ROW).map((r) => r[COL.ITEMS])).toEqual([1, 2, 3])
  })
})

describe('bốn cột lấy từ Material.xlsx', () => {
  it('Location / Type / Remark / Status lấy từ đúng cột của bảng materials', () => {
    const rows = sheetRows([material()])
    const r = rows[FIRST_DATA_ROW]

    expect(r[COL.LOCATION]).toBe('B3.1.2')
    expect(r[COL.TYPE]).toBe('VIK')
    expect(r[COL.REMARK]).toBe('audit 2024')
    expect(r[COL.STATUS]).toBe('fast')
  })

  it('cột Type là nhóm hàng, KHÔNG phải category', () => {
    // Bản cũ ghi m.category ('consumable'/'roll') vào cột Type, nên file
    // xuất ra không khớp file gốc của kho. Đây là chốt chặn cho việc đó.
    const rows = sheetRows([material({ category: 'consumable', mat_type: 'ZODI' })])

    expect(rows[FIRST_DATA_ROW][COL.TYPE]).toBe('ZODI')
    expect(rows[FIRST_DATA_ROW][COL.TYPE]).not.toBe('consumable')
  })

  it('để trống chứ không ghi null khi bảng chưa có dữ liệu bốn cột đó', () => {
    const rows = sheetRows([
      material({ location: null, mat_type: null, remark: null, stock_status: null }),
    ])
    const r = rows[FIRST_DATA_ROW]

    expect([r[COL.LOCATION], r[COL.TYPE], r[COL.REMARK], r[COL.STATUS]]).toEqual(['', '', '', ''])
  })
})

describe('Beginning / Receipt / Issue / Closing', () => {
  it('cộng dồn movements theo từng mã', () => {
    const rows = sheetRows(
      [material({ code: 'A', closing_qty: 100 })],
      [
        { code: 'A', receipt: 30, issue: 0 },
        { code: 'A', receipt: 20, issue: 0 },
        { code: 'A', receipt: 0, issue: 15 },
      ]
    )
    const r = rows[FIRST_DATA_ROW]

    expect(r[COL.RECEIPT]).toBe(50)
    expect(r[COL.ISSUE]).toBe(15)
    expect(r[COL.CLOSING]).toBe(100)
  })

  it('Beginning = Closing - Receipt + Issue', () => {
    const rows = sheetRows(
      [material({ code: 'A', closing_qty: 100 })],
      [{ code: 'A', receipt: 30, issue: 15 }]
    )
    const r = rows[FIRST_DATA_ROW]

    expect(r[COL.BEGINNING]).toBe(100 - 30 + 15)
  })

  it('không lẫn movements của mã khác', () => {
    const rows = sheetRows(
      [material({ code: 'A', closing_qty: 10 }), material({ code: 'B', closing_qty: 20 })],
      [
        { code: 'A', receipt: 5, issue: 0 },
        { code: 'B', receipt: 0, issue: 7 },
      ]
    )

    expect(rows[FIRST_DATA_ROW][COL.RECEIPT]).toBe(5)
    expect(rows[FIRST_DATA_ROW][COL.ISSUE]).toBe(0)
    expect(rows[FIRST_DATA_ROW + 1][COL.RECEIPT]).toBe(0)
    expect(rows[FIRST_DATA_ROW + 1][COL.ISSUE]).toBe(7)
  })

  it('mã chưa phát sinh movement nào thì Beginning bằng Closing', () => {
    const rows = sheetRows([material({ closing_qty: 42 })], [])
    const r = rows[FIRST_DATA_ROW]

    expect(r[COL.RECEIPT]).toBe(0)
    expect(r[COL.ISSUE]).toBe(0)
    expect(r[COL.BEGINNING]).toBe(42)
  })

  it('giữ nguyên tồn âm, không kẹp về 0', () => {
    // Tồn âm được phép trong app (chỉ cảnh báo), nên bản xuất phải phản
    // ánh đúng con số đó thì kho mới biết mà đối soát.
    const rows = sheetRows([material({ closing_qty: -221 })], [])

    expect(rows[FIRST_DATA_ROW][COL.CLOSING]).toBe(-221)
  })

  it('bỏ qua movement không có mã', () => {
    const rows = sheetRows(
      [material({ code: 'A', closing_qty: 10 })],
      [{ code: null, receipt: 99, issue: 99 }]
    )

    expect(rows[FIRST_DATA_ROW][COL.RECEIPT]).toBe(0)
  })
})

describe('Description', () => {
  it('ưu tiên tên tiếng Anh - file gốc của kho là tiếng Anh', () => {
    const rows = sheetRows([material({ description: 'Wool gloves', description_vi: 'Bao tay len' })])

    expect(rows[FIRST_DATA_ROW][COL.DESCRIPTION]).toBe('Wool gloves')
  })

  it('không có tiếng Anh thì lấy tiếng Việt', () => {
    const rows = sheetRows([material({ description: null, description_vi: 'Bao tay len' })])

    expect(rows[FIRST_DATA_ROW][COL.DESCRIPTION]).toBe('Bao tay len')
  })
})
