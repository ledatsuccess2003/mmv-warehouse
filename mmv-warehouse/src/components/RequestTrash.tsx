import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { rpc, type WarehouseRequest, type WarehouseSession } from '@/lib/workflow';

export function RequestTrash({ session, renderRequest, onChanged }: {
  session: WarehouseSession; renderRequest: (request: WarehouseRequest) => ReactNode;
  onChanged: () => Promise<void>;
}) {
  const [rows, setRows] = useState<WarehouseRequest[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const mounted = useRef(true);
  const token = session.token;
  async function load(before: string | null = null) {
    setLoading(true); setError('');
    try {
      const page = await rpc<WarehouseRequest[]>('mmv_trash_list', { p_token: token, p_before: before, p_limit: 50 });
      if (!mounted.current) return;
      setRows(previous => before ? [...previous.filter(r => !page.some(p => p.id === r.id)), ...page] : page);
      setMore(page.length === 50);
    } catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { if (mounted.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="space-y-4">
    <div className="rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">Thùng rác — lưu để truy vết</h2>
      <p className="my-2">Không xóa vĩnh viễn. Giữ nguyên mã phiếu, trạng thái gốc, duyệt, hàng đã cấp và lịch sử. Đưa vào đây hoặc khôi phục không cộng/trừ tồn. Tổng hợp và OUT thực cấp vẫn bao gồm phiếu đã cấp trong Thùng rác.</p>
      <Button variant="outline" disabled={loading} onClick={() => void load()}>Làm mới Thùng rác</Button>
    </div>
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {rows.map(r => <div key={r.id}>{renderRequest(r)}<TrashAction session={session} request={r} onChanged={async () => { await load(); await onChanged(); }} /></div>)}
    {!rows.length && !loading && <p>Thùng rác hiện trống.</p>}
    {loading && <p role="status">Đang tải…</p>}
    {more && <Button disabled={loading} onClick={() => void load(rows[rows.length - 1].request_no)}>Tải tiếp phiếu trong Thùng rác</Button>}
  </section>;
}

export function TrashAction({ session, request, through, onChanged }: {
  session: WarehouseSession; request?: WarehouseRequest; through?: string; onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const canManage = ['admin', 'warehouse'].includes(session.user.role);
  if (!canManage || (!request && (session.user.role !== 'admin' || !through))) return null;
  const label = request ? request.trashed_at ? 'Khôi phục phiếu' : 'Đưa phiếu vào Thùng rác' : 'Dọn toàn bộ phiếu hiện tại vào Thùng rác';
  return <div className="my-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
    <Button variant="outline" disabled={busy} onClick={() => { setOpen(!open); setError(''); }}>{label}</Button>
    {open && <form className="mt-3 space-y-3" onSubmit={async event => {
      event.preventDefault(); if (lock.current || !reason.trim()) return; lock.current = true; setBusy(true); setError('');
      try {
        if (request) await rpc('mmv_trash_request', { p_token: session.token, p_request_id: request.id, p_restore: !!request.trashed_at, p_reason: reason.trim() });
        else await rpc('mmv_clear_requests', { p_token: session.token, p_through: through, p_reason: reason.trim() });
        setOpen(false); setReason(''); await onChanged();
      } catch (e) { setError((e as Error).message); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <p>{request ? `Phiếu #${request.request_no} · ${request.job_code}` : `Dọn các phiếu đến số #${through}, kể cả phiếu chờ duyệt. Phiếu mới phát sinh sau mốc này không bị dọn.`} Không xóa vĩnh viễn, không hoàn tồn; có thể khôi phục trong Thùng rác.</p>
      <label className="block">Lý do lưu vào dấu vết (bắt buộc)<textarea aria-label="Lý do Thùng rác" required maxLength={4000} disabled={busy} className="mt-2 block w-full rounded border p-2" value={reason} onChange={e => setReason(e.target.value)} /></label>
      <Button type="submit" disabled={busy || !reason.trim()}>{busy ? 'Đang lưu…' : 'Xác nhận thao tác Thùng rác'}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Không thực hiện</Button>
      {error && <p role="alert" className="text-red-800">{error}</p>}
    </form>}
  </div>;
}
