import { useCallback, useEffect, useRef, useState } from "react";
import {
  Anchor,
  Bell,
  CheckCircle,
  Download,
  LogOut,
  Package,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InstallAppPrompt } from "@/components/InstallAppPrompt";
import { prepareExcelDownload, startExcelDownload, revokeExcelDownload, type PreparedExcelDownload } from "@/lib/browserDownload";
import {
  rpc,
  savedSession,
  keepSession,
  validQty,
  validActualQty,
  vietnamDate,
  enablePush,
  dispatchPush,
  mergeRequestPages,
  matchesHistoryFilter,
  requestIdFromInput,
  shiftVietnamDay,
  validVietnamDay,
} from "@/lib/workflow";
import type {
  WarehouseSession,
  WarehouseUser,
  WarehouseMaterial,
  WarehouseRequest,
  WarehouseNotification,
  RequestHistoryPage,
  RequestHistoryFilter,
  RequestHistoryCursor,
  WarehouseDaySummary,
} from "@/lib/workflow";

const statusName: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt - chờ cấp",
  rejected: "Đã từ chối",
  issued: "Đã cấp thực tế",
  cancelled: "Đã hủy",
};
const time = (s: string) =>
  new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
type Cart = { code: string; qty: number };
const wrappingActionClass = "max-w-full min-w-0 whitespace-normal break-words text-center";
type PendingConfirmation = {
  id: string;
  token: string;
  request: WarehouseRequest;
} & ({ kind: "cancel" | "reject" } | { kind: "issue"; voucherNo: string; lines: { line_id: string; qty: number }[] });

function ConfirmationDialog({ pending, reason, error, busy, onReason, onClose, onConfirm }: {
  pending: PendingConfirmation;
  reason: string;
  error: string;
  busy: boolean;
  onReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => (container.current?.querySelector<HTMLElement>("textarea, button:not([disabled])") || container.current)?.focus());
    return () => { cancelAnimationFrame(frame); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [pending.id]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (!busy) closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = Array.from(container.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex="0"]') || []);
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); container.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === container.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [busy]);
  const title = pending.kind === "issue" ? "Kiểm tra trước khi xác nhận thực cấp" : pending.kind === "cancel" ? "Hủy yêu cầu của tôi" : "Từ chối yêu cầu";
  const confirmLabel = pending.kind === "issue" ? "Xác nhận đã bàn giao và ghi giảm tồn" : pending.kind === "cancel" ? "Xác nhận hủy yêu cầu" : "Xác nhận từ chối";
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={container} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="workflow-confirm-title" aria-describedby="workflow-confirm-description" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <h2 id="workflow-confirm-title" className="text-xl font-bold text-slate-900">{title}</h2>
      <p id="workflow-confirm-description" className="my-3 text-slate-600">Phiếu #{pending.request.request_no} · {pending.request.job_code} · {pending.request.requester_name}</p>
      <form onSubmit={event => { event.preventDefault(); if (!busy) onConfirm(); }}>
        {pending.kind === "issue" ? <>
          <p className="rounded-xl bg-amber-50 p-3 text-amber-900">Chỉ xác nhận khi đã bàn giao hàng thật. Thao tác này ghi giảm tồn và lưu lịch sử, không phải bước xin duyệt.</p>
          <p className="my-3 font-bold">Số SIV đã đối chiếu: {pending.voucherNo}</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Mã / Tên chuẩn</th><th>ĐVT</th><th className="text-right">Số thực cấp sẽ ghi</th></tr></thead><tbody>{pending.request.lines.map(line => <tr className="border-b" key={line.id}><td className="py-3 pr-3"><b>{line.material_code}</b><br />{line.description}</td><td>{line.unit}</td><td className="text-right font-bold">{pending.lines.find(actual => actual.line_id === line.id)?.qty ?? "Thiếu số lượng"}</td></tr>)}</tbody></table></div>
        </> : <>
          <label htmlFor="workflow-confirm-reason" className="mb-2 block font-semibold">Lý do {pending.kind === "cancel" ? "hủy yêu cầu" : "từ chối"} (bắt buộc)</label>
          <textarea id="workflow-confirm-reason" value={reason} required maxLength={4000} rows={4} disabled={busy} onChange={event => onReason(event.target.value)} className="w-full rounded-lg border border-slate-300 p-3" placeholder="Ghi rõ lý do để lưu vào lịch sử xử lý…" />
          <p className="mt-2 text-sm text-slate-600">Lý do được lưu trên máy chủ; {pending.kind === "cancel" ? "hủy" : "từ chối"} không xóa dấu vết và không trừ tồn.</p>
        </>}
        {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-red-800">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-3"><Button className={wrappingActionClass} type="button" variant="outline" disabled={busy} onClick={onClose}>Quay lại, chưa thực hiện</Button><Button className={wrappingActionClass} type="submit" disabled={busy || (pending.kind !== "issue" && !reason.trim())}>{busy ? "Đang lưu…" : confirmLabel}</Button></div>
      </form>
    </div>
  </div>;
}

const emptyHistory = (): RequestHistoryPage => ({ items: [], has_more: false, next_cursor: null, total_count: 0 });
const physicalExportInput = (r: WarehouseRequest) => ({
  id: r.id, request_no: r.request_no, voucher_no: r.voucher_no || "",
  status: "issued" as const, issued_at: r.issued_at!, requester_name: r.requester_name,
  issued_by_name: r.issued_by_name, job_code: r.job_code, vessel: r.vessel,
  items: r.lines.filter(line => Number(line.issued_qty) > 0).map(line => ({
    id: String(line.id), material_code: line.material_code, description: line.description,
    unit: line.unit, qty_issued: Number(line.issued_qty),
  })),
});

type RequestCardProps = {
  request: WarehouseRequest;
  session: WarehouseSession;
  busy: boolean;
  issueQty: Record<string, string>;
  voucher: string;
  onQuantity: (id: string, value: string) => void;
  onVoucher: (value: string) => void;
  onApprove: (request: WarehouseRequest, yes: boolean) => void;
  onIssue: (request: WarehouseRequest) => void;
  onCancel: (request: WarehouseRequest) => void;
  onDownload: (request: WarehouseRequest, physical: boolean) => void;
  preparedDownload?: PreparedExcelDownload;
};

function RequestCard({ request: r, session, busy, issueQty, voucher, onQuantity, onVoucher, onApprove, onIssue, onCancel, onDownload, preparedDownload }: RequestCardProps) {
  const canIssue = ["admin", "warehouse"].includes(session.user.role);
  return <article id={`request-${r.id}`} className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-start gap-3">
      <h2 className="mr-auto text-lg font-bold">#{r.request_no} · {r.job_code}</h2>
      <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-900">{statusName[r.status] || r.status}</span>
    </div>
    <p className="my-2 text-sm text-slate-500">{r.requester_name} · Tạo {time(r.created_at)} {r.vessel ? `· ${r.vessel}` : ""}</p>
    <p className="break-all text-xs text-slate-500">ID phiếu: {r.id}</p>
    {r.issued_at ? <p className="mt-1 text-sm text-emerald-800">Thực cấp {time(r.issued_at)} · SIV {r.voucher_no || "chưa có"}</p> : null}
    {r.note ? <p className="mt-2">{r.note}</p> : null}
    <div className="overflow-x-auto"><table className="my-3 w-full text-left text-sm">
      <thead><tr className="border-b"><th className="py-2">Mã / Tên chuẩn</th><th>ĐVT</th><th>Yêu cầu</th><th>Thực cấp</th></tr></thead>
      <tbody>{r.lines.map(l => <tr key={l.id} className="border-b">
        <td className="py-3 pr-2"><b>{l.material_code}</b><br />{l.description}</td><td>{l.unit}</td><td>{l.requested_qty}</td>
        <td>{r.status === "approved" && canIssue ? <Input aria-label={`Thực cấp ${l.material_code} ${r.request_no}`} className="w-24" type="number" min="0" max={l.requested_qty} step="any" value={issueQty[l.id] ?? ""} placeholder="Nhập thực cấp" onChange={e => onQuantity(l.id, e.target.value)} /> : r.status === "issued" ? (l.issued_qty ?? "Chưa ghi nhận") : "Chưa cấp"}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="text-sm text-slate-600">Phê duyệt: {r.approvals.length ? r.approvals.map(a => `${a.user_name || a.user_id}: ${a.decision || (a.decided_at ? (a.approved ? "đồng ý" : "từ chối") : "chờ")}`).join(" · ") : "Đang chờ hai người duyệt"}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {r.status !== "issued" ? <Button className={wrappingActionClass} disabled={busy} variant="outline" onClick={() => onDownload(r, false)}><Download className="h-4 w-4 shrink-0" />Tải Excel mẫu OUT (chưa xuất kho)</Button> : canIssue ? <Button className={wrappingActionClass} disabled={busy} variant="outline" onClick={() => onDownload(r, true)}><Download className="h-4 w-4 shrink-0" />Tải OUT thực cấp của phiếu</Button> : null}
      {session.can_approve && r.status === "pending" ? <><Button disabled={busy} onClick={() => onApprove(r, true)}><CheckCircle className="h-4 w-4" />Đồng ý</Button><Button disabled={busy} variant="outline" onClick={() => onApprove(r, false)}>Từ chối</Button></> : null}
      {r.requester_id === session.user.id && ["pending", "approved"].includes(r.status) ? <Button className={wrappingActionClass} disabled={busy} variant="outline" onClick={() => onCancel(r)}>Hủy yêu cầu của tôi</Button> : null}
    </div>
    {preparedDownload ? <div role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
      <p className="font-semibold">File Excel theo bố cục OUT đã sẵn sàng.</p>
      <p className="my-2 break-all text-sm">{preparedDownload.filename}</p>
      <a href={preparedDownload.url} download={preparedDownload.filename} aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }} className={`inline-flex min-h-12 items-center justify-center rounded-lg bg-emerald-800 px-4 py-3 font-bold text-white focus-visible:outline focus-visible:outline-2 ${wrappingActionClass}`}>Bấm để lưu file Excel vào máy</a>
      <p className="mt-2 text-sm">Nếu lần tải đầu chưa xuất hiện, bấm nút trên để tải trực tiếp. {r.status === "issued" ? "Bản OUT dùng số lượng thực cấp đã lưu." : "Đây là bản CHƯA XUẤT KHO, không dùng để ghi giảm tồn."}</p>
    </div> : null}
    {canIssue && r.status === "approved" ? <div className="mt-4 flex flex-wrap gap-3"><Input className="max-w-xs" aria-label={`Số phiếu ${r.request_no}`} placeholder="Số SIV đã đối chiếu với Excel" value={voucher} onChange={e => onVoucher(e.target.value)} /><Button className={wrappingActionClass} disabled={busy} onClick={() => onIssue(r)}>Xác nhận đã cấp thực tế</Button><p className="w-full text-sm text-amber-800">Nhập số thực cấp cho từng dòng; nhập 0 nếu không cấp. Không tự lấy số yêu cầu làm số thực cấp.</p></div> : null}
    <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Dấu vết xử lý được lưu trên máy chủ</summary>{r.events.map((event, index) => <p className="py-1" key={`${event.created_at}-${index}`}>{time(event.created_at)} · {event.actor_name} · {event.event_type || event.action} {event.note}</p>)}</details>
  </article>;
}

export default function WorkflowApp() {
  const [session, setSession] = useState<WarehouseSession | null>(null),
    [users, setUsers] = useState<WarehouseUser[]>([]),
    [selected, setSelected] = useState<WarehouseUser | null>(null),
    [pin, setPin] = useState("");
  const [materials, setMaterials] = useState<WarehouseMaterial[]>([]),
    [requests, setRequests] = useState<WarehouseRequest[]>([]),
    [notices, setNotices] = useState<WarehouseNotification[]>([]);
  const [cart, setCart] = useState<Cart[]>([]),
    [search, setSearch] = useState(""),
    [job, setJob] = useState(""),
    [note, setNote] = useState(""),
    [vessel, setVessel] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState<"pick" | "requests" | "history" | "notices">("pick"),
    [day, setDay] = useState(vietnamDate());
  const [lastSync, setLastSync] = useState(""),
    [issueQty, setIssueQty] = useState<Record<string, string>>({}),
    [voucher, setVoucher] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<RequestHistoryPage>(emptyHistory),
    [historyFilter, setHistoryFilter] = useState<RequestHistoryFilter>({ from: "", to: "", status: "" }),
    [historyLoading, setHistoryLoading] = useState(false),
    [historySearch, setHistorySearch] = useState(""),
    [historyText, setHistoryText] = useState(""),
    [focusedRequest, setFocusedRequest] = useState<WarehouseRequest | null>(null),
    [summaries, setSummaries] = useState<Record<string, WarehouseDaySummary>>({}),
    [today, setToday] = useState(vietnamDate());
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null),
    [confirmationReason, setConfirmationReason] = useState(""),
    [confirmationError, setConfirmationError] = useState("");
  const [preparedDownload, setPreparedDownload] = useState<(PreparedExcelDownload & { requestId: string; requestStatus: string; ownerToken: string }) | null>(null);
  useEffect(() => () => { if (preparedDownload) revokeExcelDownload(preparedDownload); }, [preparedDownload]);
  const submitKey = useRef(crypto.randomUUID()),
    issueKeys = useRef<Record<string, string>>({}),
    syncing = useRef(new Set<string>()),
    activeToken = useRef<string | null>(null),
    historyGeneration = useRef(0),
    historyScope = useRef(""),
    actionGeneration = useRef(0),
    identityGeneration = useRef(0),
    postingConfirmation = useRef<string | null>(null),
    historyFilterRef = useRef(historyFilter),
    historyLoadingRef = useRef(new Set<string>());
  historyFilterRef.current = historyFilter;
  const isWarehouse = Boolean(session && ["admin", "warehouse"].includes(session.user.role));
  const load = useCallback(async (s: WarehouseSession) => {
    if (syncing.current.has(s.token)) return;
    syncing.current.add(s.token);
    try {
      const [m, r, n] = await Promise.all([
        rpc<WarehouseMaterial[]>("mmv_materials", { p_token: s.token }),
        rpc<WarehouseRequest[]>("mmv_requests", {
          p_token: s.token,
          p_limit: 500,
        }),
        rpc<WarehouseNotification[]>("mmv_notifications", { p_token: s.token }),
      ]);
      if (activeToken.current !== s.token) return;
      setMaterials(m);
      setRequests(r);
      setHistory(previous => {
        const loadedIds = new Set(previous.items.map(item => item.id));
        const updates = r.filter(item => loadedIds.has(item.id));
        return { ...previous, items: mergeRequestPages(previous.items, updates).filter(item => matchesHistoryFilter(item, historyFilterRef.current)) };
      });
      setFocusedRequest(previous => previous ? (r.find(item => item.id === previous.id) || previous) : null);
      setNotices(n);
      setLastSync(new Date().toISOString());
      setToday(vietnamDate());
      void dispatchPush(s.token);
    } catch (e) {
      if (activeToken.current === s.token) setError((e as Error).message);
    } finally {
      syncing.current.delete(s.token);
    }
  }, []);
  const loadHistory = useCallback(async (s: WarehouseSession, filter: RequestHistoryFilter, generation: number, cursor: RequestHistoryCursor | null = null) => {
    if ((filter.from && !validVietnamDay(filter.from)) || (filter.to && !validVietnamDay(filter.to)) || (filter.from && filter.to && filter.from > filter.to)) {
      setError("Khoảng ngày tạo phiếu không hợp lệ.");
      setHistoryLoading(false);
      return;
    }
    const key = `${s.token}:${generation}:${cursor?.id || "first"}`;
    if (historyLoadingRef.current.has(key)) return;
    historyLoadingRef.current.add(key);
    setHistoryLoading(true);
    try {
      const page = await rpc<RequestHistoryPage>("mmv_history", {
        p_token: s.token, p_from: filter.from || null, p_to: filter.to || null,
        p_status: filter.status || null, p_before_created_at: cursor?.created_at || null,
        p_before_id: cursor?.id || null, p_limit: 50,
      });
      if (activeToken.current !== s.token || historyGeneration.current !== generation) return;
      setHistory(previous => {
        // An explicit refresh starts a new authoritative query. Ordinary live
        // polling only updates existing IDs and never drops loaded older pages.
        if (!cursor) return page;
        return { ...page, items: mergeRequestPages(previous.items, page.items).filter(item => matchesHistoryFilter(item, filter)) };
      });
    } catch (e) {
      if (activeToken.current === s.token && historyGeneration.current === generation) setError((e as Error).message);
    } finally {
      historyLoadingRef.current.delete(key);
      if (activeToken.current === s.token && historyGeneration.current === generation) setHistoryLoading(false);
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    const initialIdentity = identityGeneration.current;
    rpc<WarehouseUser[]>("mmv_directory")
      .then((d) => {
        if (!disposed) setUsers(d);
      })
      .catch((e) => { if (!disposed) setError(e.message); });
    const old = savedSession();
    if (old)
      rpc<WarehouseSession>("mmv_session", { p_token: old.token })
        .then((s) => {
          if (!disposed && initialIdentity === identityGeneration.current && !activeToken.current) {
            const fresh = { ...old, ...s, token: old.token };
            activeToken.current = old.token;
            setSession(fresh);
            keepSession(fresh);
          }
        })
        .catch(() => {
          if (initialIdentity === identityGeneration.current && !activeToken.current && savedSession()?.token === old.token)
            keepSession(null);
        });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    const expired = (event: Event) => {
      if ((event as CustomEvent).detail?.token !== activeToken.current) return;
      activeToken.current = null;
      identityGeneration.current += 1;
      keepSession(null);
      setSession(null);
      setPreparedDownload(null);
      setMaterials([]);
      setRequests([]);
      setNotices([]);
      setCart([]);
      setIssueQty({});
      setVoucher({});
      setHistorySearch("");
      setHistoryText("");
      setHistory(emptyHistory());
      setFocusedRequest(null);
      setSummaries({});
      setConfirmation(null);
      setConfirmationReason("");
      setConfirmationError("");
      postingConfirmation.current = null;
      historyGeneration.current += 1;
      historyScope.current = "";
      actionGeneration.current += 1;
      setBusy(false);
      setError("Phiên đã hết hạn. Vui lòng chọn tên và đăng nhập lại.");
    };
    window.addEventListener("mmv-session-expired", expired);
    return () => window.removeEventListener("mmv-session-expired", expired);
  }, []);
  useEffect(() => {
    if (!session) return;
    load(session);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(session);
    }, 10000);
    const active = () => load(session);
    window.addEventListener("focus", active);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", active);
    };
  }, [session, load]);
  useEffect(() => {
    if (!session || tab !== "history") return;
    const scope = `${session.token}:${JSON.stringify(historyFilter)}`;
    if (historyScope.current === scope) return;
    historyScope.current = scope;
    const generation = ++historyGeneration.current;
    setHistory(emptyHistory());
    void loadHistory(session, historyFilter, generation);
  }, [session, tab, historyFilter, loadHistory]);
  useEffect(() => {
    if (!session) return;
    const currentToken = session.token;
    let disposed = false;
    let inFlight = false;
    const refresh = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      const currentDay = vietnamDate();
      const days = [...new Set([currentDay, shiftVietnamDay(currentDay, -1), ...(validVietnamDay(day) ? [day] : [])])];
      try {
        const values = await Promise.all(days.map(p_date => rpc<WarehouseDaySummary>("mmv_day_summary", { p_token: currentToken, p_date })));
        if (disposed || activeToken.current !== currentToken) return;
        setSummaries(Object.fromEntries(values.map(value => [value.date, value])));
        setToday(currentDay);
      } catch (e) {
        if (!disposed && activeToken.current === currentToken) setError((e as Error).message);
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 10000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [session, day]);
  const openRequest = useCallback(async (s: WarehouseSession, input: string) => {
    const id = requestIdFromInput(input);
    if (!id) throw new Error("Nhập đúng UUID phiếu hoặc link chứa ?request=UUID.");
    const request = await rpc<WarehouseRequest>("mmv_request", { p_token: s.token, p_request_id: id });
    if (activeToken.current !== s.token) return;
    setFocusedRequest(request);
    setTab("history");
    const url = new URL(window.location.href);
    url.searchParams.set("request", id);
    window.history.replaceState(null, "", url);
  }, []);
  useEffect(() => {
    if (!session) return;
    const id = new URL(window.location.href).searchParams.get("request");
    if (id) void openRequest(session, id).catch(e => { if (activeToken.current === session.token) setError(e.message); });
  }, [session, openRequest]);
  const focusedRequestId = focusedRequest?.id;
  useEffect(() => {
    if (!focusedRequestId || tab !== "history") return;
    requestAnimationFrame(() => document.getElementById(`request-${focusedRequestId}`)?.scrollIntoView({ block: "center" }));
  }, [focusedRequestId, tab]);
  async function action(fn: () => Promise<void>) {
    const generation = ++actionGeneration.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      if (actionGeneration.current === generation) setError((e as Error).message);
    } finally {
      if (actionGeneration.current === generation) setBusy(false);
    }
  }
  async function login(u: WarehouseUser, password = "") {
    identityGeneration.current += 1;
    await action(async () => {
      const generation = actionGeneration.current;
      const s = await rpc<WarehouseSession>("mmv_login", {
        p_user_id: u.id,
        p_pin: password,
      });
      if (generation !== actionGeneration.current) return;
      setHistory(emptyHistory());
      setSummaries({});
      setFocusedRequest(null);
      historyScope.current = "";
      setPreparedDownload(null);
      setConfirmation(null);
      setConfirmationReason("");
      setConfirmationError("");
      postingConfirmation.current = null;
      historyGeneration.current += 1;
      setIssueQty({});
      setVoucher({});
      submitKey.current = crypto.randomUUID();
      issueKeys.current = {};
      activeToken.current = s.token;
      keepSession(s);
      setSession(s);
      setSelected(null);
      setPin("");
      setTab("pick");
    });
  }
  async function logout() {
    const oldToken = session?.token;
    activeToken.current = null;
    identityGeneration.current += 1;
    actionGeneration.current += 1;
    historyGeneration.current += 1;
    historyScope.current = "";
    keepSession(null);
    setSession(null);
    setPreparedDownload(null);
    setRequests([]);
    setMaterials([]);
    setNotices([]);
    setCart([]);
    setPin("");
    setIssueQty({});
    setVoucher({});
    setHistorySearch("");
    setHistoryText("");
    setBusy(false);
    setHistory(emptyHistory());
    setFocusedRequest(null);
    setSummaries({});
    setConfirmation(null);
    setConfirmationReason("");
    setConfirmationError("");
    postingConfirmation.current = null;
    if (oldToken) await rpc("mmv_logout", { p_token: oldToken }).catch(() => {});
  }
  const visible = materials.filter((m) =>
    `${m.code} ${m.description} ${m.description_vi || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  function updateRequest(request: WarehouseRequest) {
    setRequests(previous => mergeRequestPages(previous, [request]));
    setHistory(previous => ({ ...previous, items: mergeRequestPages(previous.items, previous.items.some(item => item.id === request.id) ? [request] : []).filter(item => matchesHistoryFilter(item, historyFilterRef.current)) }));
    setFocusedRequest(previous => previous?.id === request.id ? request : previous);
  }
  async function submit() {
    if (!session) return;
    await action(async () => {
      if (!job.trim()) throw new Error("Cần nhập JOB thực tế");
      if (!cart.length) throw new Error("Chưa chọn vật tư");
      const request = await rpc<WarehouseRequest>("mmv_submit_request", {
        p_token: session.token,
        p_idempotency_key: submitKey.current,
        p_job_code: job.trim(),
        p_lines: cart.map((x) => ({ code: x.code, qty: validQty(x.qty) })),
        p_note: note.trim(),
        p_vessel: vessel.trim() || null,
      });
      if (activeToken.current !== session.token) return;
      updateRequest(request);
      void dispatchPush(session.token);
      submitKey.current = crypto.randomUUID();
      setCart([]);
      setNote("");
      setMessage(
        "Đã lưu yêu cầu. Hai người duyệt và kho đã có thông báo; chưa trừ tồn.",
      );
      setTab("requests");
      await load(session);
    });
  }
  async function approve(r: WarehouseRequest, yes: boolean) {
    if (!session || busy || !session.can_approve || r.status !== "pending") return;
    if (!yes) {
      setConfirmation({ id: crypto.randomUUID(), token: session.token, kind: "reject", request: r });
      setConfirmationReason("");
      setConfirmationError("");
      return;
    }
    await action(async () => {
      const request = await rpc<WarehouseRequest>("mmv_approve_request", {
        p_token: session.token,
        p_request_id: r.id,
        p_approve: true,
        p_note: "Đồng ý theo phiếu yêu cầu",
      });
      if (activeToken.current !== session.token) return;
      updateRequest(request);
      void dispatchPush(session.token);
      setMessage("Đã lưu quyết định duyệt. Chỉ kho xác nhận cấp thực tế mới trừ tồn.");
      await load(session);
    });
  }
  async function cancelRequest(r: WarehouseRequest) {
    if (!session || busy || r.requester_id !== session.user.id || !["pending", "approved"].includes(r.status)) return;
    setConfirmation({ id: crypto.randomUUID(), token: session.token, kind: "cancel", request: r });
    setConfirmationReason("");
    setConfirmationError("");
  }
  async function issue(r: WarehouseRequest) {
    if (!session || busy || !isWarehouse || r.status !== "approved") return;
    await action(async () => {
      if (!voucher[r.id]?.trim())
        throw new Error(
          "Nhập số SIV/phiếu xuất đã kiểm tra không trùng với file Excel trước khi cấp hàng.",
        );
      const lines = r.lines.map((l) => ({
        line_id: l.id,
        qty: validActualQty(
          issueQty[String(l.id)] ?? "",
          Number(l.requested_qty),
        ),
      }));
      if (lines.some((l) => !Number.isFinite(l.qty) || l.qty < 0))
        throw new Error("Số lượng thực cấp không hợp lệ");
      if (!lines.some(line => line.qty > 0)) throw new Error("Cần ít nhất một dòng thực cấp lớn hơn 0; nếu chưa cấp hàng thì không xác nhận xuất.");
      setConfirmation({ id: crypto.randomUUID(), token: session.token, kind: "issue", request: r, voucherNo: voucher[r.id].trim(), lines });
      setConfirmationReason("");
      setConfirmationError("");
    });
  }
  async function confirmPendingAction() {
    const pending = confirmation;
    if (!pending || !session || busy || postingConfirmation.current) return;
    if (pending.token !== session.token || activeToken.current !== pending.token) {
      setConfirmation(null);
      return;
    }
    const reason = confirmationReason.trim();
    if (pending.kind !== "issue" && !reason) { setConfirmationError("Vui lòng ghi rõ lý do trước khi xác nhận."); return; }
    if (reason.length > 4000) { setConfirmationError("Lý do không được quá 4.000 ký tự."); return; }
    if (pending.kind === "cancel" && pending.request.requester_id !== session.user.id) return;
    if (pending.kind === "reject" && !session.can_approve) return;
    if (pending.kind === "issue" && !isWarehouse) return;
    postingConfirmation.current = pending.id;
    setConfirmationError("");
    try {
      await action(async () => {
        try {
          // The intent is bound to the opening account. Never post an old
          // confirmation after logout/account switch, even if its button was queued.
          if (activeToken.current !== pending.token) return;
          let request: WarehouseRequest;
          if (pending.kind === "issue") {
            issueKeys.current[pending.request.id] ||= crypto.randomUUID();
            request = await rpc<WarehouseRequest>("mmv_issue_request", {
              p_token: pending.token, p_request_id: pending.request.id,
              p_idempotency_key: issueKeys.current[pending.request.id],
              p_lines: pending.lines, p_note: "Kho xác nhận đã cấp hàng thực tế", p_voucher_no: pending.voucherNo,
            });
          } else if (pending.kind === "cancel") {
            request = await rpc<WarehouseRequest>("mmv_cancel_request", { p_token: pending.token, p_request_id: pending.request.id, p_note: reason });
          } else {
            request = await rpc<WarehouseRequest>("mmv_approve_request", { p_token: pending.token, p_request_id: pending.request.id, p_approve: false, p_note: reason });
          }
          if (activeToken.current !== pending.token) return;
          updateRequest(request);
          setConfirmation(null);
          setConfirmationReason("");
          setMessage(pending.kind === "issue" ? "Đã ghi nhận thực cấp và giảm tồn đúng một lần." : pending.kind === "cancel" ? "Đã hủy yêu cầu của bạn; lịch sử và lý do vẫn được lưu, không trừ tồn." : "Đã từ chối yêu cầu; lý do đã được lưu vào lịch sử.");
          void dispatchPush(pending.token);
          await load(session);
        } catch (e) {
          if (activeToken.current === pending.token) setConfirmationError((e as Error).message);
          throw e;
        }
      });
    } finally {
      if (postingConfirmation.current === pending.id) postingConfirmation.current = null;
    }
  }
  async function exportDay() {
    if (!session) return;
    await action(async () => {
      if (!isWarehouse) throw new Error("Chỉ kho/admin được tải phiếu xuất thực tế.");
      if (!validVietnamDay(day)) throw new Error("Chọn ngày thực cấp hợp lệ.");
      // Fetch a fresh server result for the chosen day; never export a pending cart or stale page cache.
      const data = await rpc<WarehouseRequest[]>("mmv_export_day", {
        p_token: session.token,
        p_date: day,
      });
      if (activeToken.current !== session.token) return;
      const issued = data.filter(
        (r) =>
          r.status === "issued" &&
          r.issued_at &&
          vietnamDate(new Date(r.issued_at)) === day,
      );
      if (!issued.length)
        throw new Error("Ngày này chưa có phiếu được xác nhận cấp thực tế.");
      const { buildRequestOutWorkbook, saveRequestOutWorkbook } = await import(
        "@/lib/requestOut"
      );
      if (activeToken.current !== session.token) return;
      const wb = buildRequestOutWorkbook(
        issued.map(physicalExportInput),
        day,
      );
      saveRequestOutWorkbook(wb, `OUT_MMV_${day}.xlsx`);
      setMessage("Đã tải bản sao. Phiếu và lịch sử vẫn được lưu trên máy chủ; tải lại không trừ tồn thêm.");
    });
  }
  async function downloadRequest(r: WarehouseRequest, physical: boolean) {
    if (!session) return;
    await action(async () => {
      setPreparedDownload(null);
      if (physical && !isWarehouse) throw new Error("Chỉ kho/admin được tải phiếu OUT thực cấp.");
      const fresh = await rpc<WarehouseRequest>(physical ? "mmv_export_request" : "mmv_request", { p_token: session.token, p_request_id: r.id });
      if (activeToken.current !== session.token) return;
      updateRequest(fresh);
      const exporter = await import("@/lib/requestOut");
      if (activeToken.current !== session.token) return;
      let workbook: ReturnType<typeof exporter.buildRequestOutWorkbook>;
      let filename: string;
      if (physical) {
        if (fresh.status !== "issued" || !fresh.issued_at) throw new Error("Phiếu chưa được xác nhận cấp thực tế.");
        const issuedDay = vietnamDate(new Date(fresh.issued_at));
        workbook = exporter.buildRequestOutWorkbook([physicalExportInput(fresh)], issuedDay);
        filename = `OUT_MMV_${issuedDay}_${fresh.id}.xlsx`;
      } else {
        if (fresh.status === "issued") throw new Error("Phiếu đã thực cấp. Kho/admin cần tải OUT thực cấp, không dùng bản yêu cầu.");
        workbook = exporter.buildRequestVoucherWorkbook(fresh);
        const jobLabel = fresh.job_code.replace(/[<>:"/\\|?*]|\p{Cc}/gu, "_").slice(0, 48);
        filename = `YEU_CAU_MAU_OUT_${fresh.request_no}_${jobLabel}.xlsx`;
      }
      const ready = prepareExcelDownload(exporter.serializeRequestOutWorkbook(workbook), filename);
      setPreparedDownload({ ...ready, requestId: fresh.id, requestStatus: fresh.status, ownerToken: session.token });
      try { startExcelDownload(ready); } catch { /* The visible anchor below is the direct user-gesture fallback. */ }
      setMessage("File Excel đã sẵn sàng. Nếu trình duyệt chưa lưu file, bấm ‘Bấm để lưu file Excel vào máy’ ngay dưới phiếu. Tải file không xác nhận cấp hàng và không trừ tồn.");
    });
  }
  const renderRequest = (r: WarehouseRequest) => session ? <RequestCard key={r.id} request={r} session={session} busy={busy} issueQty={issueQty} voucher={voucher[r.id] || ""} onQuantity={(id, value) => setIssueQty(previous => ({ ...previous, [id]: value }))} onVoucher={value => setVoucher(previous => ({ ...previous, [r.id]: value }))} onApprove={approve} onIssue={issue} onCancel={cancelRequest} onDownload={downloadRequest} preparedDownload={preparedDownload?.ownerToken === session.token && preparedDownload.requestId === r.id && preparedDownload.requestStatus === r.status ? preparedDownload : undefined} /> : null;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-[#143c60] text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <Anchor className="h-8 w-8" />
          <div>
            <h1 className="text-xl font-extrabold">Kho vật tư MMV</h1>
            <p className="text-sm text-blue-100">
              Yêu cầu rõ ràng · Duyệt có dấu vết · Cấp đúng thực tế
            </p>
          </div>
          {session && (
            <Button className="ml-auto" variant="outline" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 pb-24">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
          >
            {message}
          </p>
        )}
        {!session ? (
          <section className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">Chọn tên của bạn</h2>
            <p className="my-3 text-slate-600">
              Không bắt buộc cài app. Người duyệt và kho cần nhập mật khẩu
              để sử dụng đúng quyền tài khoản.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {users.map((u) => (
                <Button
                  disabled={busy}
                  variant="outline"
                  className="h-auto min-h-16 whitespace-normal py-3"
                  key={u.id}
                  onClick={() => (u.requires_pin ? setSelected(u) : login(u))}
                >
                  {u.name}
                  {u.requires_pin && (
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                  )}
                </Button>
              ))}
            </div>
            {selected && (
              <form
                className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  login(selected, pin);
                }}
              >
                <label htmlFor="workflow-pin" className="block font-bold">
                  Mật khẩu của {selected.name}
                </label>
                <Input
                  id="workflow-pin"
                  autoFocus
                  autoComplete="current-password"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button disabled={busy}>Đăng nhập</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSelected(null);
                      setPin("");
                    }}
                  >
                    Hủy
                  </Button>
                </div>
              </form>
            )}
            {!users.length && !error && (
              <p className="py-5">Đang kết nối kho dữ liệu…</p>
            )}
          </section>
        ) : (
          <>
            <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
              <p className="mr-auto">
                <b>{session.user.name}</b>
                <br />
                <span className="text-sm text-slate-500">
                  Đồng bộ: {lastSync ? time(lastSync) : "đang tải"}
                </span>
              </p>
              <Button variant="outline" onClick={() => load(session)}>
                <RefreshCw className="h-4 w-4" />
                Làm mới
              </Button>
              <Button
                className={wrappingActionClass}
                variant="outline"
                onClick={() =>
                  action(async () => {
                    await enablePush(session.token);
                    setMessage("Đã đăng ký thông báo trên thiết bị này.");
                  })
                }
              >
                <Bell className="h-4 w-4" />
                Bật thông báo điện thoại
              </Button>
            </section>
            <section aria-label="Tổng hợp theo ngày Việt Nam" className="grid gap-3 sm:grid-cols-2">
              {[{ date: today, label: "Hôm nay" }, { date: shiftVietnamDay(today, -1), label: "Hôm qua" }].map(({ date, label }) => {
                const summary = summaries[date];
                return <button key={date} onClick={() => { setDay(date); setTab("history"); }} className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-blue-500">
                  <h2 className="font-bold text-blue-900">{label} · {date}</h2>
                  {summary ? <><p className="mt-2"><b>{summary.created_requests}</b> phiếu tạo mới · <b>{summary.requesters}</b> người yêu cầu riêng biệt</p><p><b>{summary.issued_requests}</b> phiếu thực cấp · <b>{summary.issued_requesters}</b> người yêu cầu đã được cấp (đếm riêng biệt)</p></> : <p className="mt-2 text-slate-500">Đang lấy tổng hợp từ máy chủ…</p>}
                </button>;
              })}
            </section>
            <p className="text-sm text-slate-600">Tổng hợp toàn bộ dữ liệu trong quyền tài khoản, không tính từ danh sách 500 phiếu gần đây. Ngày tính theo giờ Việt Nam.</p>
            <nav className="flex flex-wrap gap-2" aria-label="Kho MMV">
              <Button
                variant={tab === "pick" ? "default" : "outline"}
                onClick={() => setTab("pick")}
              >
                Yêu cầu vật tư
              </Button>
              <Button
                variant={tab === "requests" ? "default" : "outline"}
                onClick={() => setTab("requests")}
              >
                Duyệt / Cấp gần đây
              </Button>
              <Button className={wrappingActionClass} variant={tab === "history" ? "default" : "outline"} onClick={() => setTab("history")}>Lịch sử đầy đủ / Tải phiếu</Button>
              <Button
                variant={tab === "notices" ? "default" : "outline"}
                onClick={() => setTab("notices")}
              >
                Thông báo ({notices.filter((n) => !n.read_at).length})
              </Button>
            </nav>
            <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">Yêu cầu, phê duyệt, số thực cấp và lịch sử được lưu trên máy chủ Supabase, không chỉ trên thiết bị này. Tải file là lấy bản sao, không xóa phiếu và không trừ tồn thêm. Không bắt buộc cài app; thông báo nền còn phụ thuộc trình duyệt và quyền thiết bị.</p>
            {tab === "pick" && (
              <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
                <section>
                  <label
                    htmlFor="material-search"
                    className="mb-2 block font-semibold"
                  >
                    Tìm theo mã hoặc tên vật tư
                  </label>
                  <Input
                    id="material-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Mã code / tên vật tư…"
                  />
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {visible.map((m) => (
                      <button
                        className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-500"
                        key={m.code}
                        onClick={() =>
                          setCart((c) =>
                            c.some((x) => x.code === m.code)
                              ? c.map((x) =>
                                  x.code === m.code
                                    ? { ...x, qty: x.qty + 1 }
                                    : x,
                                )
                              : [...c, { code: m.code, qty: 1 }],
                          )
                        }
                      >
                        <Package className="mb-2 h-6 w-6 text-blue-800" />
                        <b className="block">
                          {m.description_vi || m.description}
                        </b>
                        <span className="block text-sm text-slate-500">
                          {m.code}
                        </span>
                        <span className="mt-2 block">
                          Tồn sổ: <b>{m.closing_qty}</b> {m.unit}
                        </span>
                        {m.closing_qty < 0 && (
                          <span className="text-sm text-red-700">
                            Tồn âm - cần kho đối chiếu
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
                <aside className="h-fit space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-bold">
                    Phiếu yêu cầu ({cart.length})
                  </h2>
                  {cart.map((x) => {
                    const m = materials.find((m) => m.code === x.code);
                    return (
                      <div className="border-b pb-3" key={x.code}>
                        <b>{m?.description_vi || m?.description || x.code}</b>
                        <p className="text-sm text-slate-500">
                          {x.code} · {m?.unit}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <Input
                            aria-label={`Số lượng ${x.code}`}
                            type="number"
                            min="0.001"
                            step="any"
                            value={x.qty}
                            onChange={(e) =>
                              setCart((c) =>
                                c.map((i) =>
                                  i.code === x.code
                                    ? { ...i, qty: Number(e.target.value) }
                                    : i,
                                ),
                              )
                            }
                          />
                          <Button
                            variant="outline"
                            aria-label={`Xóa ${x.code}`}
                            onClick={() =>
                              setCart((c) => c.filter((i) => i.code !== x.code))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <label className="block">
                    JOB thực tế
                    <Input
                      value={job}
                      onChange={(e) => setJob(e.target.value)}
                      placeholder="WO26-…"
                    />
                  </label>
                  <label className="block">
                    Tàu / khách hàng (nếu có)
                    <Input
                      value={vessel}
                      onChange={(e) => setVessel(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    Mục đích / ghi chú
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <Button
                    className={`w-full ${wrappingActionClass}`}
                    disabled={busy || !cart.length}
                    onClick={submit}
                  >
                    <Send className="h-4 w-4" />
                    Gửi xin duyệt - chưa trừ tồn
                  </Button>
                  <p className="text-sm text-slate-500">
                    Cả hai người duyệt và kho nhận thông báo ngay khi gửi. Không
                    tự đổi JOB Supply thành Service.
                  </p>
                </aside>
              </div>
            )}
            {tab === "requests" && (
              <section className="space-y-4">
                {isWarehouse && (
                  <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4">
                    <label>
                      Ngày cấp hàng (giờ Việt Nam)
                      <Input
                        type="date"
                        value={day}
                        onChange={(e) => setDay(e.target.value)}
                      />
                    </label>
                    <Button className={wrappingActionClass} disabled={busy} onClick={exportDay}>
                      <Download className="h-4 w-4 shrink-0" />
                      Tải OUT + Movement 2
                    </Button>
                    <p className="w-full text-sm text-amber-800">
                      Chỉ phiếu đã thực cấp. Dán OUT chưa trừ Material; đối
                      chiếu và nhập Movement 2 một lần, theo ID trong file xuất.
                    </p>
                  </div>
                )}
                <p className="text-sm text-slate-600">Phiếu gần đây (tối đa 500 phiếu). Mở “Lịch sử đầy đủ” để tìm và tải các phiếu cũ hơn.</p>
                {requests.map(renderRequest)}
                {!requests.length && (
                  <p className="rounded-xl bg-white p-6">
                    Chưa có yêu cầu trong phạm vi tài khoản này.
                  </p>
                )}
              </section>
            )}
            {tab === "history" && <section className="space-y-4">
              <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold">Tổng hợp và tải phiếu theo ngày thực cấp</h2>
                <div className="flex flex-wrap items-end gap-3">
                  <label>Ngày chọn (giờ Việt Nam)<Input type="date" value={day} onChange={e => setDay(e.target.value)} /></label>
                  <Button variant="outline" onClick={() => setDay(today)}>Hôm nay</Button>
                  <Button variant="outline" onClick={() => setDay(shiftVietnamDay(today, -1))}>Hôm qua</Button>
                  {isWarehouse ? <Button className={wrappingActionClass} disabled={busy || !validVietnamDay(day)} onClick={exportDay}><Download className="h-4 w-4 shrink-0" />Tải OUT + Movement 2 ngày chọn</Button> : null}
                </div>
                {summaries[day] ? <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-blue-50 p-3"><h3 className="font-bold">Phiếu được tạo trong ngày {day}</h3><p>{summaries[day].created_requests} phiếu · {summaries[day].requesters} người yêu cầu riêng biệt</p><p className="text-sm">Trạng thái hiện tại: {summaries[day].pending} chờ duyệt · {summaries[day].approved} đã duyệt chờ cấp · {summaries[day].rejected} từ chối · {summaries[day].cancelled} đã hủy</p></div>
                    <div className="rounded-xl bg-emerald-50 p-3"><h3 className="font-bold">Hàng thực cấp trong ngày {day}</h3><p>{summaries[day].issued_requests} phiếu · {summaries[day].issued_requesters} người yêu cầu đã được cấp (đếm riêng biệt) · {summaries[day].issued_lines} dòng thực cấp</p><p className="text-sm">Ngày thực cấp có thể khác ngày tạo yêu cầu. Không cộng chung số lượng khác mã/ĐVT.</p></div>
                  </div>
                  {summaries[day].issued_by_item.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="py-2 text-left font-semibold">Chi tiết vật tư thực cấp trong ngày {day}</caption><thead><tr className="border-b"><th className="py-2">Mã chuẩn</th><th>Tên chuẩn</th><th>ĐVT</th><th className="text-right">Thực cấp</th></tr></thead><tbody>{summaries[day].issued_by_item.map(item => <tr className="border-b" key={`${item.material_code}-${item.unit}`}><td className="py-2 pr-3">{item.material_code}</td><td className="pr-3">{item.description}</td><td>{item.unit}</td><td className="text-right">{item.quantity}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-600">Không có dòng vật tư đã thực cấp trong ngày chọn.</p>}
                </> : <p className="text-slate-500">{validVietnamDay(day) ? "Đang lấy tổng hợp ngày chọn…" : "Chọn ngày hợp lệ để xem tổng hợp."}</p>}
                <p className="text-sm text-amber-800">Có thể tải lại ngày cũ, ví dụ thứ Sáu tải lại phiếu của thứ Hai. File giữ ngày thực cấp gốc. Chỉ kho/admin tải OUT thực cấp; OUT chưa tự trừ Material khi chỉ dán vào sheet OUT.</p>
              </div>
              <form className="space-y-3 rounded-2xl bg-white p-5 shadow-sm" onSubmit={e => { e.preventDefault(); void action(() => openRequest(session, historySearch)); }}>
                <label htmlFor="request-id-search" className="block font-semibold">Mở trực tiếp phiếu bất kỳ theo UUID hoặc link đã nhận</label>
                <div className="flex flex-wrap gap-2"><Input id="request-id-search" className="min-w-0 flex-1" value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="UUID hoặc https://…?request=UUID" /><Button disabled={busy || !historySearch.trim()}>Mở phiếu</Button></div>
                <p className="text-sm text-slate-600">Tìm trực tiếp trên máy chủ, kể cả phiếu không còn trong 500 phiếu gần đây. Chỉ mở được phiếu thuộc quyền tài khoản.</p>
              </form>
              {focusedRequest ? <div className="space-y-2 rounded-2xl border-2 border-blue-300 p-3"><div className="flex items-center gap-2"><h2 className="mr-auto font-bold">Phiếu mở trực tiếp (không phụ thuộc bộ lọc dưới)</h2><Button variant="outline" size="sm" onClick={() => { setFocusedRequest(null); const url = new URL(window.location.href); url.searchParams.delete("request"); window.history.replaceState(null, "", url); }}>Đóng</Button></div>{renderRequest(focusedRequest)}</div> : null}
              <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold">Lịch sử đầy đủ, phân trang từ máy chủ</h2>
                <div className="flex flex-wrap items-end gap-3">
                  <label>Tạo từ ngày<Input type="date" value={historyFilter.from} onChange={e => setHistoryFilter(previous => ({ ...previous, from: e.target.value }))} /></label>
                  <label>Tạo đến hết ngày<Input type="date" value={historyFilter.to} onChange={e => setHistoryFilter(previous => ({ ...previous, to: e.target.value }))} /></label>
                  <label className="grid gap-1">Trạng thái<select aria-label="Trạng thái lịch sử" className="h-10 rounded-md border border-input bg-white px-3" value={historyFilter.status} onChange={e => setHistoryFilter(previous => ({ ...previous, status: e.target.value }))}><option value="">Tất cả</option>{Object.entries(statusName).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
                  <Button className={wrappingActionClass} variant="outline" disabled={historyLoading} onClick={() => void loadHistory(session, historyFilter, historyGeneration.current)}><RefreshCw className="h-4 w-4 shrink-0" />Làm mới lịch sử từ trang đầu</Button>
                  <Button variant="outline" onClick={() => { setHistoryFilter({ from: "", to: "", status: "" }); setHistoryText(""); }}>Bỏ bộ lọc</Button>
                </div>
                <label className="block">Lọc nội dung trong các phiếu đã tải<Input value={historyText} onChange={e => setHistoryText(e.target.value)} placeholder="Mã vật tư, tên, JOB, tên người, số phiếu…" /></label>
                <p className="text-sm text-slate-600">Máy chủ tìm thấy {history.total_count} phiếu theo bộ lọc. Đã tải {history.items.length} phiếu. Bấm tải tiếp để xem toàn bộ; không giới hạn ở 500. Bộ lọc ngày dùng ngày tạo yêu cầu, không phải ngày thực cấp.</p>
              </div>
              {history.items.filter(r => r.id !== focusedRequest?.id && `${r.id} ${r.request_no} ${r.job_code} ${r.vessel || ""} ${r.requester_name} ${r.lines.map(line => `${line.material_code} ${line.description}`).join(" ")}`.toLocaleLowerCase("vi").includes(historyText.trim().toLocaleLowerCase("vi"))).map(renderRequest)}
              {historyLoading ? <p role="status" className="p-3">Đang lấy lịch sử từ máy chủ…</p> : null}
              {!historyLoading && !history.items.length ? <p className="rounded-xl bg-white p-5">Không có phiếu phù hợp trong quyền tài khoản.</p> : null}
              {history.has_more ? <Button className={`w-full ${wrappingActionClass}`} disabled={historyLoading || !history.next_cursor} onClick={() => void loadHistory(session, historyFilter, historyGeneration.current, history.next_cursor)}>Tải tiếp 50 phiếu cũ hơn</Button> : history.items.length ? <p className="text-center text-sm text-slate-500">Đã tải hết các phiếu của bộ lọc tại lần truy vấn này.</p> : null}
            </section>}
            {tab === "notices" && (
              <section className="space-y-3">
                {notices.map((n) => (
                  <article
                    className={`rounded-xl border p-4 ${n.read_at ? "bg-white" : "border-blue-200 bg-blue-50"}`}
                    key={n.id}
                  >
                    <b>{n.title}</b>
                    <p>{n.body}</p>
                    <p className="my-2 text-sm text-slate-500">
                      {time(n.created_at)}
                    </p>
                    {n.request_id ? <Button className="mr-2" size="sm" variant="outline" disabled={busy} onClick={() => void action(() => openRequest(session, n.request_id!))}>Mở phiếu liên quan</Button> : null}
                    {!n.read_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          action(async () => {
                            await rpc("mmv_read_notification", {
                              p_token: session.token,
                              p_notification_id: n.id,
                            });
                            await load(session);
                          })
                        }
                      >
                        Đánh dấu đã đọc
                      </Button>
                    )}
                  </article>
                ))}
                {!notices.length && <p>Chưa có thông báo.</p>}
              </section>
            )}
          </>
        )}
      </main>
      {session && confirmation && confirmation.token === session.token ? <ConfirmationDialog pending={confirmation} reason={confirmationReason} error={confirmationError} busy={busy} onReason={setConfirmationReason} onClose={() => { if (!busy && !postingConfirmation.current) { setConfirmation(null); setConfirmationReason(""); setConfirmationError(""); } }} onConfirm={() => void confirmPendingAction()} /> : null}
      <InstallAppPrompt />
    </div>
  );
}
