import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { rpc: mockRpc } }))
import { rpc, keepSession, savedSession, validQty, validActualQty, vietnamDate, dispatchPush, mergeRequestPages, matchesHistoryFilter, requestIdFromInput, shiftVietnamDay, validVietnamDay, type WarehouseSession, type WarehouseRequest, type RequestHistoryPage, type WarehouseDaySummary } from './workflow'

const token = 'a'.repeat(64)
const storageKey = 'mmv.workflow.session.v2'
let store: Map<string, string>
function session(): WarehouseSession {
  return { token, expires_at: new Date(Date.now() + 3600000).toISOString(),
    user: { id: 7, name: 'SYNTHETIC WAREHOUSE', role: 'warehouse', can_issue: true, can_approve: false }, can_approve: false }
}
beforeEach(() => {
  store = new Map()
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) })
  vi.stubGlobal('window', new EventTarget())
  mockRpc.mockReset()
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('canonical workflow API responses', () => {
  it('copies can_approve from the server nested user, not a missing top-level field', async () => {
    mockRpc.mockResolvedValue({ data: { ...session(), can_approve: undefined,
      user: { id: 2, name: 'SYNTHETIC APPROVER', role: 'manager', can_approve: true } }, error: null })
    const result = await rpc<WarehouseSession>('mmv_login', { p_user_id: 2, p_pin: 'synthetic-only' })
    expect(result.can_approve).toBe(true)
    expect(result.user.id).toBe(2)
  })
  it('normalizes integer request number, approval identities, and persistent audit reasons', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'request-uuid', request_no: 42, lines: [],
      approvals: [{ approver_id: 2, approver_name: 'SYNTHETIC APPROVER', approved: false, note: 'Needs revision', decided_at: '2026-10-18T01:00:00Z' }],
      events: [{ kind: 'rejected', details: { note: 'Wrong actual job' }, created_at: '2026-10-18T01:00:00Z' }] }], error: null })
    const result = await rpc<WarehouseRequest[]>('mmv_export_day', { p_token: token, p_date: '2026-10-18' })
    expect(result[0].request_no).toBe('42')
    expect(result[0].approvals[0]).toMatchObject({ user_id: 2, user_name: 'SYNTHETIC APPROVER', approved: false })
    expect(result[0].events[0]).toMatchObject({ event_type: 'rejected', note: 'Wrong actual job' })
    expect(mockRpc).toHaveBeenCalledWith('mmv_export_day', { p_token: token, p_date: '2026-10-18' })
  })
  it('forwards exact issue UUID and warehouse-assigned SIV without mutation', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'request-uuid', status: 'issued' }, error: null })
    const args = { p_token: token, p_request_id: 'request-uuid',
      p_idempotency_key: 'd64a6447-0bde-434f-9d93-fb0276831ab7', p_voucher_no: '2610TEST01',
      p_lines: [{ line_id: 'line-uuid', qty: 0 }] }
    await rpc('mmv_issue_request', args)
    expect(mockRpc).toHaveBeenCalledWith('mmv_issue_request', args)
    expect(args.p_lines[0].qty).toBe(0)
  })
  it('surfaces structured login rejection and database errors, not false success', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: false, error: 'Owner must provision a private credential' }, error: null })
    await expect(rpc('mmv_login')).rejects.toThrow('Owner must provision')
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'Both approvals required' } })
    await expect(rpc('mmv_issue_request')).rejects.toThrow('Both approvals required')
  })
  it('includes the failed token in expiry events so late old-account responses cannot log out a new user', async () => {
    const events: Event[] = []
    window.addEventListener('mmv-session-expired', e => events.push(e))
    mockRpc.mockResolvedValue({ data: null, error: { code: '28000', message: 'Session expired; please sign in again' } })
    await expect(rpc('mmv_materials', { p_token: token })).rejects.toThrow('Session expired')
    expect(events).toHaveLength(1)
    expect((events[0] as CustomEvent).detail.token).toBe(token)
  })
  it('does not interpret notification ok:false as marking another user notification read', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false }, error: null })
    await expect(rpc('mmv_read_notification', { p_token: token, p_notification_id: 99 })).rejects.toThrow()
  })
  it.each(['mmv_request', 'mmv_export_request', 'mmv_cancel_request'])('normalizes a single %s result, including numeric zero and persisted approval/event identities', async name => {
    mockRpc.mockResolvedValue({ data: { id: 'old-request-uuid', request_no: 921,
      lines: [{ id: 'line', requested_qty: 3, issued_qty: 0 }],
      approvals: [{ approver_id: 2, approver_name: 'APPROVER', approved: true }],
      events: [{ kind: 'cancelled', details: { note: 'Synthetic cleanup' }, created_at: '2026-10-18T00:00:00Z' }] }, error: null })
    const request = await rpc<WarehouseRequest>(name, { p_token: token, p_request_id: 'old-request-uuid' })
    expect(request.request_no).toBe('921')
    expect(request.lines[0].issued_qty).toBe(0)
    expect(request.approvals[0]).toMatchObject({ user_id: 2, user_name: 'APPROVER' })
    expect(request.events[0]).toMatchObject({ event_type: 'cancelled', note: 'Synthetic cleanup' })
  })
  it('normalizes every history page item while preserving the server count, cursor and has_more', async () => {
    const cursor = { created_at: '2026-09-01T00:00:00Z', id: 'old-uuid' }
    mockRpc.mockResolvedValue({ data: { items: [{ id: 'old-uuid', request_no: 650, approvals: [], events: [] }], total_count: 920, has_more: true, next_cursor: cursor }, error: null })
    const page = await rpc<RequestHistoryPage>('mmv_history', { p_token: token, p_limit: 50, p_before_id: null })
    expect(page.items[0].request_no).toBe('650')
    expect(page.items[0].lines).toEqual([])
    expect(page.total_count).toBe(920)
    expect(page.has_more).toBe(true)
    expect(page.next_cursor).toEqual(cursor)
  })
  it('keeps whole-database daily counts separate from the latest request page and passes zero totals through', async () => {
    const summary = { date: '2026-10-16', created_requests: 600, requesters: 25, pending: 0, approved: 1, rejected: 2, cancelled: 3,
      issued_requests: 610, issued_requesters: 28, issued_lines: 900, issued_by_item: [{ material_code: 'EXACT-CODE', description: 'Exact Material Name', unit: 'pair', quantity: 12.5 }] }
    mockRpc.mockResolvedValue({ data: summary, error: null })
    const result = await rpc<WarehouseDaySummary>('mmv_day_summary', { p_token: token, p_date: '2026-10-16' })
    expect(result).toEqual(summary)
    expect(result.pending).toBe(0)
    expect(result.issued_requests).not.toBe(result.created_requests)
    expect(mockRpc).toHaveBeenCalledWith('mmv_day_summary', { p_token: token, p_date: '2026-10-16' })
  })
})

function historyRequest(id: string, created_at: string, status = 'pending'): WarehouseRequest {
  return { id, created_at, status, request_no: id, requester_id: 7, requester_name: 'SYNTHETIC REQUESTER', job_code: 'SYNTHETIC-ONLY', lines: [], approvals: [], events: [] }
}
describe('complete cursor history and old request access', () => {
  it('preserves more than 500 loaded rows under a latest-page poll, deduplicates by UUID and accepts updated status', () => {
    const oldRows = Array.from({ length: 700 }, (_, index) => historyRequest(`uuid-${String(index).padStart(4, '0')}`, '2026-09-01T01:00:00Z'))
    const changed = { ...oldRows[600], status: 'cancelled' }
    const newest = historyRequest('new-uuid', '2026-10-18T01:00:00Z')
    const merged = mergeRequestPages(oldRows, [changed, newest, newest])
    expect(merged).toHaveLength(701)
    expect(merged[0].id).toBe('new-uuid')
    expect(merged.find(row => row.id === changed.id)?.status).toBe('cancelled')
    expect(merged.some(row => row.id === oldRows[699].id)).toBe(true)
    expect(oldRows[600].status).toBe('pending')
  })
  it('uses Vietnam inclusive created-day filters and a separate current status filter', () => {
    const request = historyRequest('uuid', '2026-10-16T17:00:00Z', 'approved')
    expect(matchesHistoryFilter(request, { from: '2026-10-17', to: '2026-10-17', status: 'approved' })).toBe(true)
    expect(matchesHistoryFilter(request, { from: '', to: '2026-10-16', status: '' })).toBe(false)
    expect(matchesHistoryFilter(request, { from: '', to: '', status: 'pending' })).toBe(false)
    expect(matchesHistoryFilter(request, { from: '', to: '', status: '' })).toBe(true)
  })
  it('opens a UUID directly without relying on membership in the latest 500 requests', () => {
    const id = '6AA6545C-26D6-4181-8E0A-9C44C2DF5C25'
    expect(requestIdFromInput(id)).toBe(id.toLowerCase())
    expect(requestIdFromInput(`https://example.test/?request=${id}`)).toBe(id.toLowerCase())
    for (const invalid of ['last Friday', 'https://example.test/?request=not-a-uuid', '123', '']) expect(requestIdFromInput(invalid)).toBeNull()
  })
  it('selects yesterday or any older day without turning download date into physical issue date', () => {
    expect(shiftVietnamDay('2026-10-19', -1)).toBe('2026-10-18')
    expect(shiftVietnamDay('2026-10-19', -3)).toBe('2026-10-16')
    expect(shiftVietnamDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(validVietnamDay('2026-02-29')).toBe(false)
    expect(validVietnamDay('2028-02-29')).toBe(true)
    expect(validVietnamDay('')).toBe(false)
    expect(() => shiftVietnamDay('not-a-day', -1)).toThrow()
  })
})

describe('session persistence and explicit physical quantities', () => {
  it('restores a valid session, rejects expired or malformed saved values, and removes invalid storage', () => {
    const current = session()
    keepSession(current)
    expect(savedSession()).toEqual(current)
    keepSession({ ...current, expires_at: '2020-01-01T00:00:00Z' })
    expect(savedSession()).toBeNull()
    expect(store.has(storageKey)).toBe(false)
    store.set(storageKey, '{broken')
    expect(savedSession()).toBeNull()
    store.set(storageKey, JSON.stringify({ ...current, token: 'not-an-opaque-token' }))
    expect(savedSession()).toBeNull()
  })
  it('distinguishes blank from explicit zero; rejects overapproved, negative and nonfinite issues', () => {
    for (const raw of ['', ' ', null, undefined, true]) expect(() => validActualQty(raw, 3)).toThrow()
    expect(validActualQty('0', 3)).toBe(0)
    expect(validActualQty(0, 3)).toBe(0)
    expect(validActualQty('1.25', 3)).toBe(1.25)
    for (const raw of [-1, 4, NaN, Infinity]) expect(() => validActualQty(raw, 3)).toThrow()
  })
  it('requires positive quantities when submitting, not empty/zero/negative request quantities', () => {
    for (const raw of ['', ' ', null, undefined, false, 0, -1, Infinity]) expect(() => validQty(raw)).toThrow()
    expect(validQty('0.125')).toBe(.125)
  })
  it('uses Vietnam midnight rather than UTC when calculating a daily export date', () => {
    expect(vietnamDate(new Date('2026-10-17T16:59:59Z'))).toBe('2026-10-17')
    expect(vietnamDate(new Date('2026-10-17T17:00:00Z'))).toBe('2026-10-18')
  })
  it('leaves durable stock/request success intact if push dispatch cannot connect', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(dispatchPush(token)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith('/api/push', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  })
})
