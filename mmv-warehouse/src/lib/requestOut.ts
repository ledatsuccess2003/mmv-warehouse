import * as XLSX from 'xlsx-js-style'

/** Canonical Material snapshots captured when the warehouse confirms physical issue. */
export interface RequestOutLine {
  id: string | number
  material_code: string
  description: string
  unit: string
  qty_issued: number
  remarks?: string | null
}

export interface RequestOutRequest {
  id: string | number
  request_no: string
  /** Warehouse-assigned SIV, never an automatically invented monthly voucher number. */
  voucher_no: string
  status: string
  issued_at: string | null
  requester_name: string
  receiver_name?: string | null
  issued_by_name?: string | null
  job_code: string
  vessel?: string | null
  liferaft_no?: string | null
  items: RequestOutLine[]
}

export interface RequestOutPage {
  startRow: number
  endRow: number
  requestId: string
  voucherNo: string
  lineIds: string[]
}

export interface RequestOutWorkbook extends XLSX.WorkBook {
  /** Serializer-only print configuration, not a worksheet or hidden company data. */
  requestOutPages: RequestOutPage[]
}

const TIME_ZONE = 'Asia/Ho_Chi_Minh'
const OUT_WIDTHS = [6.33203125, 17.33203125, 42, 9.33203125, 10, 13.6640625]
const MOVEMENT_WIDTHS = [9.44140625, 11.33203125, 13.88671875, 10.44140625, 17.33203125,
  51.44140625, 6.5546875, 13.44140625, 12.33203125, 13.5546875, 22.6640625, 26]
const HEADERS = ['No\n(STT)', 'Code\n(Mã hàng)', 'Description\n(Tên hàng)',
  'Unit\n(ĐVT)', 'Qty\n(số lượng)', 'Remarks\n(ghi chú)']
const BLACK = { rgb: '000000' }
const THIN = { style: 'thin', color: BLACK }
const HAIR = { style: 'hair', color: BLACK }
type Style = NonNullable<XLSX.CellObject['s']>

function text(value: unknown, field: string, required = false): string {
  if (typeof value !== 'string' || (required && !value.trim())) {
    if (!required && value == null) return ''
    throw new Error(`${field}: thiếu hoặc không đúng định dạng văn bản.`)
  }
  // Do not trim canonical code, description or unit. Material spelling is authoritative.
  if (value.length > 32767 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new Error(`${field}: nội dung không thể lưu nguyên vẹn trong Excel.`)
  }
  return value
}

function identifier(value: string | number, field: string): string {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim() ||
      (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0))) {
    throw new Error(`${field}: thiếu ID ổn định.`)
  }
  return text(String(value), field, true)
}

function calendarDate(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    throw new Error('Ngày cấp hàng phải là thời điểm ISO có múi giờ, không dùng ngày gửi yêu cầu.')
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function validDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
    throw new Error('Chọn ngày xuất hợp lệ theo giờ Việt Nam (YYYY-MM-DD).')
  }
}

function excelDate(day: string) {
  return (Date.parse(`${day}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000
}

function importId(request: RequestOutRequest, line: RequestOutLine) {
  return `MMV:${encodeURIComponent(identifier(request.id, 'Request ID'))}:${encodeURIComponent(identifier(line.id, 'Line ID'))}`
}

function cell(ws: XLSX.WorkSheet, row: number, col: number, value: string | number,
  style: Style = {}, format?: string) {
  // Explicit string cells prevent descriptions/notes starting with =,+,-,@ becoming formulas.
  ws[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })] = {
    t: typeof value === 'number' ? 'n' : 's', v: value,
    s: { font: { name: 'Arial', sz: 10, color: BLACK },
      alignment: { vertical: 'center', horizontal: 'left' }, ...style },
    ...(format ? { z: format } : {}),
  }
}

function rowHeight(ws: XLSX.WorkSheet, row: number, height: number) {
  ws['!rows'] ??= []
  ws['!rows'][row - 1] = { hpt: height }
}

function merge(ws: XLSX.WorkSheet, row: number, startCol: number, endCol: number) {
  ws['!merges'] ??= []
  ws['!merges'].push({ s: { r: row - 1, c: startCol - 1 }, e: { r: row - 1, c: endCol - 1 } })
}

function wrappedLines(value: string, width: number) {
  return value.split(/\r?\n/).reduce((count, segment) => count + Math.max(1, Math.ceil(segment.length / width)), 0)
}

function itemHeight(line: RequestOutLine) {
  const count = Math.max(wrappedLines(line.description, 42), wrappedLines(line.material_code, 17),
    wrappedLines(line.unit, 8), wrappedLines(line.remarks ?? '', 13))
  const height = Math.max(13.2, count * 12 + 2)
  if (height > 490) throw new Error(`Mã ${line.material_code}: nội dung quá dài để in nguyên vẹn trên một trang A4.`)
  return height
}

function paginate(lines: RequestOutLine[]) {
  const pages: RequestOutLine[][] = []
  let page: RequestOutLine[] = []
  let height = 0
  for (const line of lines) {
    const nextHeight = itemHeight(line)
    if (page.length && (page.length === 24 || height + nextHeight > 490)) {
      pages.push(page); page = []; height = 0
    }
    page.push(line); height += nextHeight
  }
  if (page.length) pages.push(page)
  return pages
}

function addVoucherPage(ws: XLSX.WorkSheet, request: RequestOutRequest, lines: RequestOutLine[],
  day: string, start: number, lineOffset: number): RequestOutPage {
  const title: Style = { font: { name: 'Arial', sz: 14, bold: true, color: { rgb: 'FF0000' } },
    alignment: { horizontal: 'center', vertical: 'center' } }
  cell(ws, start, 1, `ISSUE VOUCHER-No:${request.voucher_no}`, title)
  cell(ws, start + 1, 1, `XUẤT KHO SỐ: ${request.voucher_no}`, title)
  merge(ws, start, 1, 6); merge(ws, start + 1, 1, 6)
  rowHeight(ws, start, 17.4); rowHeight(ws, start + 1, 17.4)
  const [year, month, date] = day.split('-')
  cell(ws, start + 2, 1, `Date(ngày xuất): ${date}/${month}/${year.slice(2)}`)
  cell(ws, start + 3, 1, `Receiver(người nhận): ${request.receiver_name || request.requester_name}`)
  cell(ws, start + 4, 1, `Vessel(tên tàu): ${request.vessel ?? ''}`)
  cell(ws, start + 5, 1, `Liferaft No: ${request.liferaft_no ?? ''}`)
  cell(ws, start + 5, 4, 'Job No.')
  cell(ws, start + 5, 6, request.job_code)
  for (let i = 2; i <= 6; i++) rowHeight(ws, start + i, 13.2)
  const headerStyle: Style = { font: { name: 'Arial', sz: 10, bold: true },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: { top: THIN, bottom: THIN, left: THIN, right: THIN } }
  HEADERS.forEach((value, i) => cell(ws, start + 7, i + 1, value, headerStyle))
  rowHeight(ws, start + 7, 39.6)
  // Source has 24 table lines per ordinary page. Keep that footprint unless long text needs the space.
  const usedHeight = lines.reduce((sum, line) => sum + itemHeight(line), 0)
  const blankCount = Math.min(24 - lines.length, Math.max(0, Math.floor((490 - usedHeight) / 13.2)))
  const tableRows = lines.length + blankCount
  for (let i = 0; i < tableRows; i++) {
    const line = lines[i]
    const values = line ? [lineOffset + i + 1, line.material_code, line.description, line.unit,
      line.qty_issued, line.remarks ?? ''] : ['', '', '', '', '', '']
    const row = start + 8 + i
    values.forEach((value, c) => cell(ws, row, c + 1, value, {
      alignment: { horizontal: c === 0 || c === 3 || c === 4 ? 'center' : 'left',
        vertical: 'center', wrapText: true },
      border: { left: THIN, right: THIN,
        ...(c > 0 && c < 5 ? { top: HAIR, bottom: HAIR } : {}),
        ...(i === tableRows - 1 ? { bottom: THIN } : {}) },
    }, c === 4 ? 'General' : undefined))
    rowHeight(ws, row, line ? itemHeight(line) : 13.2)
  }
  const signature = start + 8 + tableRows + 1
  cell(ws, signature, 1, '                   RECEIVED BY')
  cell(ws, signature, 3, 'CHECKED BY', { font: { name: 'Arial', sz: 10, bold: true } })
  cell(ws, signature, 5, 'STORE KEEPER', { font: { name: 'Arial', sz: 10, bold: true } })
  // These are names only; never generate signatures or certify an unperformed check.
  cell(ws, signature + 1, 1, request.receiver_name || request.requester_name)
  cell(ws, signature + 1, 5, request.issued_by_name ?? '')
  rowHeight(ws, signature, 13.2); rowHeight(ws, signature + 1, 13.2)
  return { startRow: start, endRow: signature + 1, requestId: String(request.id),
    voucherNo: request.voucher_no, lineIds: lines.map(line => importId(request, line)) }
}

/**
 * October 2026 source: OUT A:F, voucher block rows 33344:33378; widths, fonts,
 * bilingual headers, red titles, six metadata rows and signature labels inspected read-only.
 * No source workbook, customer data, credentials, formulas or side columns are bundled.
 * Only physical issues on the selected Vietnam date are eligible. An OUT paste by itself
 * does not change Material: warehouse must reconcile Movement before importing Movement 2.
 */
export function buildRequestOutWorkbook(requests: RequestOutRequest[], date: string): RequestOutWorkbook {
  validDay(date)
  const issued = requests.filter(request => request.status === 'issued' &&
    request.issued_at && calendarDate(request.issued_at) === date)
  if (!issued.length) throw new Error('Không có phiếu đã cấp thực tế trong ngày đã chọn.')
  const seen = new Set<string>()
  const vouchers = new Set<string>()
  for (const request of issued) {
    identifier(request.id, 'Request ID')
    text(request.request_no, 'Số yêu cầu', true)
    text(request.voucher_no, 'Số phiếu SIV: kho phải cấp trước khi xuất Excel', true)
    if (vouchers.has(request.voucher_no)) throw new Error(`Trùng số phiếu SIV ${request.voucher_no}.`)
    vouchers.add(request.voucher_no)
    text(request.requester_name, 'Người yêu cầu', true)
    text(request.job_code, 'Job code', true)
    for (const key of ['receiver_name', 'issued_by_name', 'vessel', 'liferaft_no'] as const) {
      text(request[key], key)
    }
    if (!Array.isArray(request.items) || !request.items.length) throw new Error('Phiếu đã cấp chưa có dòng vật tư.')
    for (const line of request.items) {
      text(line.material_code, 'Mã Material', true); text(line.description, 'Tên Material', true)
      text(line.unit, 'ĐVT Material', true); text(line.remarks, 'Ghi chú')
      if (typeof line.qty_issued !== 'number' || !Number.isFinite(line.qty_issued) || line.qty_issued <= 0) {
        throw new Error(`Mã ${line.material_code}: số lượng cấp thực tế phải lớn hơn 0, không dùng số lượng đề nghị.`)
      }
      const id = importId(request, line)
      if (seen.has(id)) throw new Error(`Dòng cấp bị lặp ID ${id}. Không xuất trùng.`)
      seen.add(id)
    }
  }

  const wb = XLSX.utils.book_new() as RequestOutWorkbook
  wb.requestOutPages = []
  const out: XLSX.WorkSheet = { '!cols': OUT_WIDTHS.map(width => ({ width })),
    '!margins': { left: .3, right: 0, top: 1.03, bottom: .3, header: .54, footer: 0 } }
  const movement: (string | number)[][] = [
    [`MOVEMENT ${date.slice(0, 7)}`], [], [],
    ['ITEMS', '', 'SIV', 'DATE', 'CODE', 'DESCRIPTION', 'UNIT', 'RECEIPT', 'ISSUE', 'JOB CODE', 'VESSEL', 'REMAKS'],
  ]
  const manifest: (string | number)[][] = [[
    'IMPORT ID', 'REQUEST ID', 'REQUEST NO', 'LINE ID', 'SIV', 'ISSUED AT (ISO)',
    'DATE (VIETNAM)', 'CODE', 'DESCRIPTION', 'UNIT', 'ACTUAL ISSUE',
  ]]
  let nextRow = 1
  for (const request of issued) {
    let offset = 0
    for (const lines of paginate(request.items)) {
      const page = addVoucherPage(out, request, lines, date, nextRow, offset)
      wb.requestOutPages.push(page)
      nextRow = page.endRow + 2
      offset += lines.length
    }
    request.items.forEach((line, index) => {
      const id = importId(request, line)
      movement.push([index + 1, '', request.voucher_no, excelDate(date), line.material_code,
        line.description, line.unit, '', line.qty_issued, request.job_code, request.vessel ?? '',
        [line.remarks, `APP ID: ${id}`].filter(Boolean).join('\n')])
      manifest.push([id, String(request.id), request.request_no, String(line.id), request.voucher_no,
        request.issued_at!, date, line.material_code, line.description, line.unit, line.qty_issued])
    })
  }
  out['!ref'] = `A1:F${nextRow - 2}`
  const move = XLSX.utils.aoa_to_sheet(movement)
  move['!cols'] = MOVEMENT_WIDTHS.map(width => ({ width }))
  move.H3 = { t: 'n', f: `SUM(H5:H${movement.length})`, v: 0 }
  move.I3 = { t: 'n', f: `SUM(I5:I${movement.length})`,
    v: issued.flatMap(request => request.items).reduce((sum, line) => sum + line.qty_issued, 0) }
  for (let r = 5; r <= movement.length; r++) move[`D${r}`].z = 'dd/mm/yy'
  const manifestSheet = XLSX.utils.aoa_to_sheet(manifest)
  manifestSheet['!cols'] = [48, 38, 22, 38, 20, 28, 18, 22, 50, 12, 18].map(wch => ({ wch }))
  const guide = XLSX.utils.aoa_to_sheet([
    ['HƯỚNG DẪN XUẤT KHO'],
    ['Ngày cấp thực tế (giờ Việt Nam)', date],
    ['Phạm vi', 'Chỉ các phiếu có trạng thái đã cấp thực tế. Không gồm chờ duyệt, đã duyệt nhưng chưa cấp hoặc đã hủy.'],
    ['OUT', 'Mẫu A:F theo sheet OUT, Inventory 10-26. Mã, tên, ĐVT lấy bản chụp Material tại lúc kho xác nhận cấp.'],
    ['Ghi sổ', 'Dán OUT không tự trừ Material. Đối chiếu OUT → Movement, kiểm tra mã/ĐVT/số lượng rồi mới chuyển Movement 2 theo quy trình kho.'],
    ['Chống nhập trùng', 'Đối chiếu SIV và APP ID trong Remarks/Import IDs với các dòng đã nhập. Tải lại cùng ngày vẫn có cùng ID, không nhập lại.'],
    ['Ngày', 'Ngày Excel là ngày cấp thực tế theo Asia/Ho_Chi_Minh, không phải ngày gửi yêu cầu hoặc ngày tải file.'],
    ['Số phiếu', 'SIV do kho cấp. Request number không tự thay thế số phiếu của Excel.'],
    ['Tồn âm/chênh lệch', 'Không bỏ dòng xuất thật, không giảm số lượng và không dùng ex-stock để che số âm. Rà soát, giải trình và phê duyệt điều chỉnh riêng.'],
    ['Đơn vị', 'Không cộng số lượng khác đơn vị thành tổng tồn. Tổng ISSUE của Movement chỉ giữ cấu trúc mẫu, không là tổng cùng ĐVT.'],
    ['In', 'OUT: A4 dọc; mỗi khối phiếu/trang tiếp theo có ngắt trang. Dùng hàm xuất chuyên dụng để giữ thiết lập in.'],
  ])
  guide['!cols'] = [{ wch: 28 }, { wch: 110 }]
  for (let row = 1; row <= 11; row++) {
    for (let col = 0; col < 2; col++) {
      const address = XLSX.utils.encode_cell({ r: row - 1, c: col })
      if (guide[address]) guide[address].s = { font: { name: 'Arial', sz: 11 }, alignment: { wrapText: true, vertical: 'top' } }
    }
  }
  XLSX.utils.book_append_sheet(wb, out, 'OUT')
  XLSX.utils.book_append_sheet(wb, move, 'Movement 2')
  XLSX.utils.book_append_sheet(wb, manifestSheet, 'Import IDs')
  XLSX.utils.book_append_sheet(wb, guide, 'Huong dan')
  wb.Workbook = { Names: [{ Name: '_xlnm.Print_Area', Sheet: 0,
    Ref: wb.requestOutPages.map(page => `'OUT'!$A$${page.startRow}:$F$${page.endRow}`).join(',') }] }
  return wb
}

/**
 * SheetJS style exports do not emit all native page setup fields. Patch only the generated
 * sheet XML using its public CFB ZIP API; no source/template workbook or private data is read.
 * Call this serializer rather than the generic saveWorkbook helper.
 */
export function serializeRequestOutWorkbook(wb: RequestOutWorkbook): Uint8Array {
  if (!wb.requestOutPages?.length || wb.SheetNames[0] !== 'OUT') throw new Error('Thiếu cấu hình trang OUT.')
  const zip = XLSX.CFB.read(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })), { type: 'buffer' })
  const path = 'xl/worksheets/sheet1.xml'
  const index = zip.FullPaths.findIndex((name: string) => name.endsWith(`/${path}`))
  if (index < 0) throw new Error('Không tìm thấy sheet OUT trong file xuất.')
  let xml = new TextDecoder().decode(zip.FileIndex[index].content)
  xml = xml.replace(/<sheetPr(?:\s[^>]*)?>[\s\S]*?<\/sheetPr>|<sheetPr\b[^>]*\/>/g, '')
  xml = xml.replace(/(<worksheet\b[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>')
  xml = xml.replace(/<pageSetup\b[^>]*(?:\/>|>[\s\S]*?<\/pageSetup>)/g, '')
  xml = xml.replace(/<rowBreaks\b[^>]*>[\s\S]*?<\/rowBreaks>/g, '')
  const setup = '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>'
  const breaks = wb.requestOutPages.slice(0, -1).map(page =>
    `<brk id="${page.endRow + 1}" max="16383" man="1"/>`).join('')
  const rowBreaks = breaks ? `<rowBreaks count="${wb.requestOutPages.length - 1}" manualBreakCount="${wb.requestOutPages.length - 1}">${breaks}</rowBreaks>` : ''
  // OOXML ordering: pageMargins, pageSetup, headerFooter, rowBreaks, ...
  xml = xml.replace(/(<pageMargins\b[^>]*\/>)/, `$1${setup}${rowBreaks}`)
  // Leading slash replaces the existing ZIP member. Without it CFB can append a duplicate.
  XLSX.CFB.utils.cfb_add(zip, `/${path}`, new TextEncoder().encode(xml))
  const bytes = XLSX.CFB.write(zip, { type: 'array', fileType: 'zip', compression: true })
  return new Uint8Array(bytes)
}

export function downloadRequestOutWorkbook(requests: RequestOutRequest[], date: string): void {
  saveRequestOutWorkbook(buildRequestOutWorkbook(requests, date), `MMV_OUT_${date}.xlsx`)
}

/** Download only after a deliberate button click; never called automatically on page load. */
export function saveRequestOutWorkbook(wb: RequestOutWorkbook, filename: string): void {
  const bytes = serializeRequestOutWorkbook(wb)
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
