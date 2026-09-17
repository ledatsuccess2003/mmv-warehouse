// =====================================================================
//  MMV WAREHOUSE - Xuất Excel (SheetJS / xlsx-js-style)
//  Dùng xlsx-js-style để có in đậm + màu chữ + màu nền, nhưng vẫn tạo
//  file .xlsx hợp lệ (mở bằng Excel KHÔNG báo "Repaired").
// =====================================================================
import * as XLSX from 'xlsx-js-style'
import { saveAs } from 'file-saver'
import type { Material, Movement, Voucher, VoucherItem } from './types'
import { fmtDateShort, fmtDate } from './format'

type Style = NonNullable<XLSX.CellObject['s']>

const NAVY = '1F4E79'
const RED = 'C00000'
const WHITE = 'FFFFFF'

function thin() {
  return { style: 'thin', color: { rgb: '999999' } } as const
}
const borderAll = { top: thin(), bottom: thin(), left: thin(), right: thin() }

/** Gán style cho 1 ô (tạo ô rỗng nếu chưa có) */
function st(ws: XLSX.WorkSheet, addr: string, s: Style) {
  if (!ws[addr]) ws[addr] = { t: 's', v: '' } as XLSX.CellObject
  ws[addr].s = s
}

function colWidths(widths: number[]) {
  return widths.map((w) => ({ wch: w }))
}

/** Ghi workbook ra file .xlsx và tải về */
export function saveWorkbook(wb: XLSX.WorkBook, filename: string) {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  saveAs(blob, filename)
}

// =====================================================================
//  1. buildMaterialWorkbook -> sheet "Material"
// =====================================================================
export function buildMaterialWorkbook(
  materials: Material[],
  movements: Pick<Movement, 'code' | 'receipt' | 'issue'>[]
): XLSX.WorkBook {
  // SUMIF receipt/issue theo code
  const rec = new Map<string, number>()
  const iss = new Map<string, number>()
  movements.forEach((m) => {
    if (!m.code) return
    rec.set(m.code, (rec.get(m.code) ?? 0) + (Number(m.receipt) || 0))
    iss.set(m.code, (iss.get(m.code) ?? 0) + (Number(m.issue) || 0))
  })

  const mm = new Date().toISOString().slice(0, 7)
  const aoa: (string | number)[][] = []
  aoa.push([`INVENTORY ${mm}`]) // row 1
  aoa.push([]) // row 2
  aoa.push([
    'ITEMS',
    'Location',
    'Type',
    'Remark',
    'Status',
    'Code',
    'Description',
    'R',
    'Beginning',
    'Receipt',
    'Issue',
    'Closing',
  ]) // row 3

  materials.forEach((m, i) => {
    const receipt = rec.get(m.code) ?? 0
    const issue = iss.get(m.code) ?? 0
    const closing = Number(m.closing_qty) || 0
    const beginning = closing - receipt + issue
    aoa.push([
      i + 1,
      '',
      m.category ?? '',
      '',
      '',
      m.code,
      m.description ?? m.description_vi ?? '',
      m.unit ?? '',
      beginning,
      receipt,
      issue,
      closing,
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = colWidths([7, 10, 8, 12, 9, 20, 45, 7, 10, 10, 10, 10])
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }]

  // Tiêu đề
  st(ws, 'A1', {
    font: { bold: true, sz: 14, color: { rgb: NAVY } },
    alignment: { horizontal: 'left', vertical: 'center' },
  })
  // Header row 3 (index 2)
  const headStyle: Style = {
    font: { bold: true, color: { rgb: WHITE } },
    fill: { patternType: 'solid', fgColor: { rgb: NAVY } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: borderAll,
  }
  for (let c = 0; c < 12; c++) {
    st(ws, XLSX.utils.encode_cell({ r: 2, c }), headStyle)
  }
  // Viền cho dữ liệu
  for (let r = 3; r < aoa.length; r++) {
    for (let c = 0; c < 12; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const align = c >= 8 ? 'right' : c === 0 ? 'center' : 'left'
      st(ws, addr, { border: borderAll, alignment: { horizontal: align, vertical: 'center' } })
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Material')
  return wb
}

// =====================================================================
//  2. buildMovementWorkbook -> sheet "Movement 2"
// =====================================================================
export function buildMovementWorkbook(
  movements: Movement[],
  _startDate: string,
  _endDate: string
): XLSX.WorkBook {
  const mm = new Date().toISOString().slice(0, 7)
  const sumReceipt = movements.reduce((s, m) => s + (Number(m.receipt) || 0), 0)
  const sumIssue = movements.reduce((s, m) => s + (Number(m.issue) || 0), 0)

  const aoa: (string | number)[][] = []
  aoa.push([`MOVEMENT ${mm}`]) // row1
  aoa.push([]) // row2
  aoa.push(['', '', '', '', '', '', '', sumReceipt, sumIssue]) // row3: totals H3, I3
  aoa.push([
    'ITEMS',
    'SRV',
    'SIV',
    'DATE',
    'CODE',
    'DESCRIPTION',
    'UNIT',
    'RECEIPT',
    'ISSUE',
    'JOB CODE',
    'VESSEL',
    'REMAKS',
    'NGUOI THUC HIEN',
  ]) // row4 headers

  // STT khởi lại từ 1 mỗi phiếu (group theo source_type+source_id)
  let lastKey = ''
  let counter = 0
  movements.forEach((m) => {
    const key = `${m.source_type}:${m.source_id}`
    if (key !== lastKey) {
      counter = 1
      lastKey = key
    } else {
      counter++
    }
    aoa.push([
      counter,
      '',
      '',
      fmtDateShort(m.date),
      m.code ?? '',
      m.description ?? '',
      m.unit ?? '',
      Number(m.receipt) || 0,
      Number(m.issue) || 0,
      m.job_code ?? '',
      m.vessel ?? '',
      '',
      m.user_name ?? '',
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = colWidths([9, 11, 14, 10, 17, 51, 7, 13, 12, 14, 23, 26, 22])
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }]

  st(ws, 'A1', { font: { bold: true, sz: 14, color: { rgb: NAVY } } })
  st(ws, 'H3', { font: { bold: true, color: { rgb: NAVY } }, alignment: { horizontal: 'right' } })
  st(ws, 'I3', { font: { bold: true, color: { rgb: NAVY } }, alignment: { horizontal: 'right' } })

  const headStyle: Style = {
    font: { bold: true, color: { rgb: WHITE } },
    fill: { patternType: 'solid', fgColor: { rgb: NAVY } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: borderAll,
  }
  for (let c = 0; c < 13; c++) st(ws, XLSX.utils.encode_cell({ r: 3, c }), headStyle)

  for (let r = 4; r < aoa.length; r++) {
    for (let c = 0; c < 13; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const align = c === 7 || c === 8 ? 'right' : c === 0 ? 'center' : 'left'
      st(ws, addr, { border: borderAll, alignment: { horizontal: align, vertical: 'center' } })
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Movement 2')
  return wb
}

// =====================================================================
//  3-4. buildVoucherWorkbook -> ISSUE / RECEIVING VOUCHER
// =====================================================================
export function buildVoucherWorkbook(
  voucher: Voucher,
  items: (VoucherItem & { material?: Material })[]
): XLSX.WorkBook {
  const isOut = voucher.type === 'OUT'
  const title = isOut ? `ISSUE VOUCHER-No:${voucher.voucher_no}` : `RECEIVING VOUCHER-No:${voucher.voucher_no}`

  const aoa: (string | number)[][] = []
  aoa.push(['MERMAID MARITIME VIETNAM']) // r0
  aoa.push([title]) // r1 - đỏ đậm
  aoa.push([]) // r2
  aoa.push([`Date: ${fmtDate(voucher.date)}`, '', '', `Job No.: ${voucher.job_code ?? ''}`]) // r3
  if (isOut) {
    aoa.push([`Receiver: ${voucher.receiver ?? ''}`, '', '', `Vessel: ${voucher.vessel ?? ''}`]) // r4
  } else {
    aoa.push([`Receiver: ${voucher.receiver ?? ''}`, '', '', `Supplier: ${voucher.supplier ?? ''}`]) // r4
  }
  aoa.push([]) // r5
  const headRow = aoa.length // index of header row
  aoa.push(['No', 'Code', 'Description', 'Unit', 'Qty', 'Remarks']) // header

  items.forEach((it, i) => {
    const qty = Number(it.qty_actual ?? it.qty_theory ?? 0)
    aoa.push([
      i + 1,
      it.material_code ?? '',
      it.material?.description ?? it.material?.description_vi ?? it.description ?? '',
      it.unit ?? it.material?.unit ?? '',
      qty,
      it.remarks ?? '',
    ])
  })
  const dataEnd = aoa.length
  aoa.push([]) // spacer
  aoa.push([]) // spacer
  const signRow = aoa.length
  aoa.push(['RECEIVED BY', '', 'CHECKED BY', '', 'STORE KEEPER', ''])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = colWidths([6, 18, 40, 8, 10, 24])
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 2 } },
    { s: { r: signRow, c: 0 }, e: { r: signRow, c: 1 } },
    { s: { r: signRow, c: 2 }, e: { r: signRow, c: 3 } },
    { s: { r: signRow, c: 4 }, e: { r: signRow, c: 5 } },
  ]

  st(ws, 'A1', {
    font: { bold: true, sz: 13, color: { rgb: NAVY } },
    alignment: { horizontal: 'center' },
  })
  st(ws, 'A2', {
    font: { bold: true, sz: 16, color: { rgb: RED } },
    alignment: { horizontal: 'center', vertical: 'center' },
  })

  // header bảng
  const headStyle: Style = {
    font: { bold: true, color: { rgb: WHITE } },
    fill: { patternType: 'solid', fgColor: { rgb: NAVY } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: borderAll,
  }
  for (let c = 0; c < 6; c++) st(ws, XLSX.utils.encode_cell({ r: headRow, c }), headStyle)

  for (let r = headRow + 1; r < dataEnd; r++) {
    for (let c = 0; c < 6; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const align = c === 4 ? 'right' : c === 0 ? 'center' : 'left'
      st(ws, addr, { border: borderAll, alignment: { horizontal: align, vertical: 'center' } })
    }
  }

  // dòng chữ ký
  for (let c = 0; c < 6; c++) {
    st(ws, XLSX.utils.encode_cell({ r: signRow, c }), {
      font: { bold: true },
      alignment: { horizontal: 'center' },
    })
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, isOut ? 'ISSUE VOUCHER' : 'RECEIVING VOUCHER')
  return wb
}
