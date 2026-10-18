import { describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx-js-style'
import { buildRequestOutWorkbook, buildRequestVoucherWorkbook, serializeRequestOutWorkbook,
  type RequestOutRequest, type RequestVoucherInput } from './requestOut'

function request(over: Partial<RequestOutRequest> = {}): RequestOutRequest {
  return { id: 'synthetic-request-1', request_no: 'REQ-TEST-01', voucher_no: '2610TEST01',
    status: 'issued', issued_at: '2026-10-17T18:05:00Z', requester_name: 'Test Receiver',
    issued_by_name: 'Test Warehouse', job_code: '26-TEST-1', vessel: 'SYNTHETIC VESSEL',
    liferaft_no: '', items: [{ id: 'line-1', material_code: 'TEST-001',
      description: 'Synthetic gloves', unit: 'pair', qty_issued: 2 }], ...over }
}

function requested(over: Partial<RequestVoucherInput> = {}): RequestVoucherInput {
  return { id: 'requested-monday', request_no: 'REQUEST-TEST-MONDAY',
    created_at: '2026-10-12T01:05:00Z', requester_name: 'SYNTHETIC REQUESTER',
    job_code: '26-TEST-1', vessel: 'SYNTHETIC VESSEL', note: 'Original purpose note', status: 'pending',
    lines: [{ id: 'line-requested-1', material_code: 'TEST-REQUEST', description: 'Synthetic Material name',
      unit: 'pair', requested_qty: 3.5 }], ...over }
}

function xml(wb: ReturnType<typeof buildRequestOutWorkbook>, path: string) {
  const zip = XLSX.CFB.read(serializeRequestOutWorkbook(wb), { type: 'buffer' })
  const i = zip.FullPaths.findIndex((name: string) => name.endsWith(`/${path}`))
  return i < 0 ? '' : new TextDecoder().decode(zip.FileIndex[i].content)
}

describe('OUT follows the inspected October source A:F voucher block', () => {
  it('retains original six columns, widths, bilingual headers and signature rows', () => {
    const wb = buildRequestOutWorkbook([request()], '2026-10-18')
    const out = wb.Sheets.OUT
    expect(wb.SheetNames).toEqual(['OUT', 'Movement 2', 'Import IDs', 'Huong dan'])
    expect(out['!cols']!.map(column => column.width)).toEqual([6.33203125, 17.33203125, 42, 9.33203125, 10, 13.6640625])
    expect(out.A1.v).toBe('ISSUE VOUCHER-No:2610TEST01')
    expect(out.A2.v).toBe('XUẤT KHO SỐ: 2610TEST01')
    expect(out.A3.v).toBe('Date(ngày xuất): 18/10/26')
    expect(out.A4.v).toBe('Receiver(người nhận): Test Receiver')
    expect(out.D6.v).toBe('Job No.')
    expect(out.F6.v).toBe('26-TEST-1')
    expect(['A8', 'B8', 'C8', 'D8', 'E8', 'F8'].map(address => out[address].v)).toEqual([
      'No\n(STT)', 'Code\n(Mã hàng)', 'Description\n(Tên hàng)', 'Unit\n(ĐVT)', 'Qty\n(số lượng)', 'Remarks\n(ghi chú)',
    ])
    expect(out.A9.v).toBe(1)
    expect(out.B9.v).toBe('TEST-001')
    expect(out.C9.v).toBe('Synthetic gloves')
    expect(out.D9.v).toBe('pair')
    expect(out.E9.v).toBe(2)
    expect(out.A34.v).toContain('RECEIVED BY')
    expect(out.C34.v).toBe('CHECKED BY')
    expect(out.E34.v).toBe('STORE KEEPER')
    expect(wb.requestOutPages[0].endRow).toBe(35)
    expect(out['!ref']).toBe('A1:F35')
    expect(out['!merges']).toEqual([
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
    ])
  })

  it('preserves canonical code, description and unit exactly, including spaces and Unicode', () => {
    const r = request()
    r.items = [{ id: 'line-1', material_code: ' 001-ABC ', description: '=A1 + mô tả "gốc" & <test>',
      unit: ' pcs ', qty_issued: .125, remarks: '@Untrusted note' }]
    const out = buildRequestOutWorkbook([r], '2026-10-18').Sheets.OUT
    expect(out.B9.v).toBe(' 001-ABC ')
    expect(out.C9.v).toBe('=A1 + mô tả "gốc" & <test>')
    expect(out.C9.t).toBe('s')
    expect(out.C9.f).toBeUndefined()
    expect(out.D9.v).toBe(' pcs ')
    expect(out.E9.v).toBe(.125)
    expect(out.F9.v).toBe('@Untrusted note')
  })

  it('retains repeated material lines with distinct immutable IDs instead of consolidating quantities', () => {
    const r = request()
    r.items.push({ ...r.items[0], id: 'line-2', qty_issued: 3 })
    const wb = buildRequestOutWorkbook([r], '2026-10-18')
    expect(wb.Sheets.OUT.B9.v).toBe(wb.Sheets.OUT.B10.v)
    expect(wb.Sheets.OUT.E9.v).toBe(2)
    expect(wb.Sheets.OUT.E10.v).toBe(3)
    expect(wb.Sheets['Import IDs'].A2.v).not.toBe(wb.Sheets['Import IDs'].A3.v)
  })
})

describe('physical issue eligibility and ID safeguards', () => {
  it('filters by actual issue date in Vietnam and excludes approved / pending / cancelled', () => {
    const rows = [request(), ...['pending', 'approved', 'cancelled'].map((status, i) =>
      request({ id: `not-issued-${i}`, status })),
    request({ id: 'yesterday', issued_at: '2026-10-17T16:59:59Z' })]
    const wb = buildRequestOutWorkbook(rows, '2026-10-18')
    expect(wb.requestOutPages).toHaveLength(1)
    expect(wb.Sheets['Import IDs']['!ref']).toBe('A1:K2')
  })

  it('requires a warehouse-assigned SIV and never substitutes request_no', () => {
    expect(() => buildRequestOutWorkbook([request({ voucher_no: '' })], '2026-10-18')).toThrow('SIV')
  })

  it('requires actual numeric positive quantities and complete canonical Material names/units', () => {
    for (const qty of [0, -1, NaN, Infinity, '2']) {
      const r = request()
      r.items[0].qty_issued = qty as number
      expect(() => buildRequestOutWorkbook([r], '2026-10-18')).toThrow('cấp thực tế')
    }
    for (const field of ['material_code', 'description', 'unit'] as const) {
      const r = request()
      r.items[0][field] = ''
      expect(() => buildRequestOutWorkbook([r], '2026-10-18')).toThrow('Material')
    }
  })

  it('rejects duplicate line IDs, duplicate SIVs, missing timezone, and an empty day', () => {
    const r = request()
    r.items.push({ ...r.items[0] })
    expect(() => buildRequestOutWorkbook([r], '2026-10-18')).toThrow('lặp ID')
    expect(() => buildRequestOutWorkbook([request(), request({ id: 'second' })], '2026-10-18')).toThrow('Trùng số phiếu')
    expect(() => buildRequestOutWorkbook([request({ issued_at: '2026-10-18T08:00:00' })], '2026-10-18')).toThrow('múi giờ')
    expect(() => buildRequestOutWorkbook([], '2026-10-18')).toThrow('Không có phiếu')
    expect(() => buildRequestOutWorkbook([request()], '2026-02-30')).toThrow('ngày xuất hợp lệ')
  })

  it('generates stable import IDs across repeat downloads without suppressing legitimate same-code lines', () => {
    const first = buildRequestOutWorkbook([request()], '2026-10-18')
    const again = buildRequestOutWorkbook([request()], '2026-10-18')
    expect(first.Sheets['Import IDs'].A2.v).toBe(again.Sheets['Import IDs'].A2.v)
    expect(first.Sheets['Movement 2'].L5.v).toContain(`APP ID: ${first.Sheets['Import IDs'].A2.v}`)
  })
})

describe('Movement 2 transfer and native XLSX print settings', () => {
  it('maps actual issue to I, SIV to C, date to numeric D, and no receipt', () => {
    const wb = buildRequestOutWorkbook([request()], '2026-10-18')
    const m = wb.Sheets['Movement 2']
    expect(['A4', 'B4', 'C4', 'D4', 'E4', 'F4', 'G4', 'H4', 'I4', 'J4', 'K4', 'L4'].map(a => m[a].v)).toEqual([
      'ITEMS', '', 'SIV', 'DATE', 'CODE', 'DESCRIPTION', 'UNIT', 'RECEIPT', 'ISSUE', 'JOB CODE', 'VESSEL', 'REMAKS',
    ])
    expect(m.C5.v).toBe('2610TEST01')
    expect(m.D5.t).toBe('n')
    expect(m.D5.z).toBe('dd/mm/yy')
    expect(XLSX.SSF.format('yyyy-mm-dd', m.D5.v)).toBe('2026-10-18')
    expect(m.H5.v).toBe('')
    expect(m.I5.v).toBe(2)
    expect(m.I3.f).toBe('SUM(I5:I5)')
    expect(m.I3.v).toBe(2)
  })

  it('exports all 25 lines on two complete voucher pages, not one truncated table', () => {
    const r = request()
    r.items = Array.from({ length: 25 }, (_, i) => ({ ...r.items[0], id: `line-${i}`, material_code: `TEST-${i}` }))
    const wb = buildRequestOutWorkbook([r], '2026-10-18')
    expect(wb.requestOutPages).toHaveLength(2)
    expect(wb.requestOutPages.flatMap(page => page.lineIds)).toHaveLength(25)
    expect(wb.Sheets.OUT.A45.v).toBe(25)
    const sheetXml = xml(wb, 'xl/worksheets/sheet1.xml')
    expect(sheetXml).toContain('paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"')
    expect(sheetXml).toContain('<pageSetUpPr fitToPage="1"/>')
    expect(sheetXml).toContain('<rowBreaks count="1" manualBreakCount="1">')
    expect(sheetXml).toContain('<brk id="36" max="16383" man="1"/>')
    expect(sheetXml).toContain('STORE ISSUE VOUCHER(PHIẾU XUẤT KHO)')
    expect(sheetXml).toContain('MMV-SIM.Rev.01')
    expect(sheetXml).toContain('Feb 2021')
    expect(sheetXml).toContain('Page &amp;P of &amp;N')
    const workbookXml = xml(wb, 'xl/workbook.xml')
    expect(workbookXml).toContain('_xlnm.Print_Area')
    expect(workbookXml).toContain('$A$1:$F$35')
    expect(workbookXml).toContain('$A$37:$F$71')
    const roundtrip = XLSX.read(serializeRequestOutWorkbook(wb), { type: 'array' })
    expect(roundtrip.Sheets.OUT.B45.v).toBe('TEST-24')
    expect(roundtrip.Sheets['Import IDs']['!ref']).toBe('A1:K26')
    expect(workbookXml).not.toContain('externalReference')
  })

  it('uses additional pages for long descriptions and refuses a single unprintable line, without truncating text', () => {
    const r = request()
    r.items = Array.from({ length: 5 }, (_, i) => ({ ...r.items[0], id: `line-${i}`, description: 'Long source description '.repeat(30) }))
    const wb = buildRequestOutWorkbook([r], '2026-10-18')
    expect(wb.requestOutPages.length).toBeGreaterThan(1)
    expect(wb.Sheets.OUT.C9.v).toBe(r.items[0].description)
    r.items[0].description = 'x'.repeat(3000)
    expect(() => buildRequestOutWorkbook([r], '2026-10-18')).toThrow('quá dài')
  })
})

describe('historical requested-only copies remain separate from actual OUT', () => {
  it('exports Monday requested quantities on Friday, never substituting default issued zero', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-16T09:00:00Z'))
    try {
      const input = requested()
      // API records may contain issued_qty:0 before issue. The draft accepts requested_qty only.
      Object.assign(input.lines[0], { issued_qty: 0 })
      const wb = buildRequestVoucherWorkbook(input)
      const sheet = wb.Sheets.REQUEST
      expect(wb.SheetNames).toEqual(['REQUEST', 'Thong tin yeu cau'])
      expect(sheet.A1.v).toBe('PHIẾU YÊU CẦU - CHƯA XUẤT KHO')
      expect(sheet.A2.v).toBe('DỰ THẢO / REQUEST: REQUEST-TEST-MONDAY')
      expect(sheet.A3.v).toBe('Date(ngày yêu cầu): 12/10/26')
      expect(sheet.E9.v).toBe(3.5)
      expect(sheet.A35.v).toBe('')
      expect(sheet.E35.v).toBe('')
      expect(wb.Sheets['Thong tin yeu cau'].B10.v).toBe('Original purpose note')
      expect(wb.requestOutPages[0].voucherNo).toBe('')
      expect(wb.requestOutPages[0].lineIds).toEqual([])
      expect(wb.Sheets['Movement 2']).toBeUndefined()
      expect(wb.Sheets['Import IDs']).toBeUndefined()
      const sheetXml = xml(wb, 'xl/worksheets/sheet1.xml')
      expect(sheetXml).not.toContain('ISSUE VOUCHER-No:')
      expect(sheetXml).not.toContain('XUẤT KHO SỐ:')
      expect(sheetXml).not.toContain('APP ID: MMV:')
      expect(sheetXml).toContain('KHÔNG GHI GIẢM TỒN')
      expect(xml(wb, 'xl/workbook.xml')).toContain('$A$1:$F$35')
      const reread = XLSX.read(serializeRequestOutWorkbook(wb), { type: 'array' })
      expect(reread.SheetNames).toEqual(['REQUEST', 'Thong tin yeu cau'])
      expect(reread.Sheets.REQUEST.E9.v).toBe(3.5)
    } finally { vi.useRealTimers() }
  })

  it('retains all 25 requested lines and exact A:F geometry across two A4 draft pages', () => {
    const input = requested()
    input.lines = Array.from({ length: 25 }, (_, i) => ({ ...input.lines[0], id: `requested-${i}`, material_code: `TEST-REQ-${i}` }))
    const wb = buildRequestVoucherWorkbook(input)
    expect(wb.requestOutPages).toHaveLength(2)
    expect(wb.Sheets.REQUEST['!cols']!.map(c => c.width)).toEqual([6.33203125, 17.33203125, 42, 9.33203125, 10, 13.6640625])
    expect(wb.Sheets.REQUEST.B45.v).toBe('TEST-REQ-24')
    expect(wb.Sheets.REQUEST.E45.v).toBe(3.5)
    expect(wb.Sheets['Thong tin yeu cau']['!ref']).toBe('A1:F38')
    const sheetXml = xml(wb, 'xl/worksheets/sheet1.xml')
    expect(sheetXml).toContain('paperSize="9" orientation="portrait"')
    expect(sheetXml).toContain('<brk id="36" max="16383" man="1"/>')
    expect(sheetXml).toContain('Page &amp;P of &amp;N')
  })

  it('preserves canonical draft identifiers/names/units and treats all user text as literal data', () => {
    const input = requested({ note: '=HYPERLINK("https://synthetic.invalid")' })
    input.lines[0] = { ...input.lines[0], material_code: ' 000TEST ', description: '=A1 + "tên" & <gốc>', unit: ' pcs ' }
    const wb = buildRequestVoucherWorkbook(input)
    expect(wb.Sheets.REQUEST.B9.v).toBe(' 000TEST ')
    expect(wb.Sheets.REQUEST.C9.v).toBe('=A1 + "tên" & <gốc>')
    expect(wb.Sheets.REQUEST.C9.t).toBe('s')
    expect(wb.Sheets.REQUEST.C9.f).toBeUndefined()
    expect(wb.Sheets.REQUEST.D9.v).toBe(' pcs ')
    expect(wb.Sheets['Thong tin yeu cau'].B10.t).toBe('s')
    expect(wb.Sheets['Thong tin yeu cau'].B10.f).toBeUndefined()
  })

  it('does not present an already-issued request as CHƯA XUẤT KHO; rejects missing/invalid requested quantities', () => {
    expect(() => buildRequestVoucherWorkbook(requested({ status: 'issued' }))).toThrow('OUT thực cấp')
    expect(() => buildRequestVoucherWorkbook(requested({ status: 'unknown' }))).toThrow('Trạng thái')
    for (const qty of [0, -1, NaN, Infinity, '2']) {
      const input = requested()
      input.lines[0].requested_qty = qty as number
      expect(() => buildRequestVoucherWorkbook(input)).toThrow('số lượng yêu cầu')
    }
    const input = requested()
    input.lines.push({ ...input.lines[0] })
    expect(() => buildRequestVoucherWorkbook(input)).toThrow('Trùng ID')
  })

  it('actual Monday issues downloaded on Friday retain Monday date and same immutable import IDs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-16T09:00:00Z'))
    try {
      const input = request({ issued_at: '2026-10-12T01:10:00Z' })
      const wb = buildRequestOutWorkbook([input], '2026-10-12')
      const again = buildRequestOutWorkbook([input], '2026-10-12')
      expect(wb.Sheets.OUT.A3.v).toBe('Date(ngày xuất): 12/10/26')
      expect(XLSX.SSF.format('yyyy-mm-dd', wb.Sheets['Movement 2'].D5.v)).toBe('2026-10-12')
      expect(wb.Sheets['Import IDs'].A2.v).toBe(again.Sheets['Import IDs'].A2.v)
      expect(() => buildRequestOutWorkbook([input], '2026-10-16')).toThrow('Không có phiếu')
    } finally { vi.useRealTimers() }
  })
})
