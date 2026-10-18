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
import {
  rpc,
  savedSession,
  keepSession,
  validQty,
  validActualQty,
  vietnamDate,
  enablePush,
  dispatchPush,
} from "@/lib/workflow";
import type {
  WarehouseSession,
  WarehouseUser,
  WarehouseMaterial,
  WarehouseRequest,
  WarehouseNotification,
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
    [tab, setTab] = useState<"pick" | "requests" | "notices">("pick"),
    [day, setDay] = useState(vietnamDate());
  const [lastSync, setLastSync] = useState(""),
    [issueQty, setIssueQty] = useState<Record<string, string>>({}),
    [voucher, setVoucher] = useState<Record<string, string>>({});
  const submitKey = useRef(crypto.randomUUID()),
    issueKeys = useRef<Record<string, string>>({}),
    syncing = useRef(new Set<string>()),
    activeToken = useRef<string | null>(null);
  const isWarehouse =
    session && ["admin", "warehouse"].includes(session.user.role);
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
      setNotices(n);
      setLastSync(new Date().toISOString());
      setError("");
      void dispatchPush(s.token);
    } catch (e) {
      if (activeToken.current === s.token) setError((e as Error).message);
    } finally {
      syncing.current.delete(s.token);
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    rpc<WarehouseUser[]>("mmv_directory")
      .then((d) => {
        if (!disposed) setUsers(d);
      })
      .catch((e) => setError(e.message));
    const old = savedSession();
    if (old)
      rpc<WarehouseSession>("mmv_session", { p_token: old.token })
        .then((s) => {
          if (!disposed && !activeToken.current) {
            const fresh = { ...old, ...s, token: old.token };
            activeToken.current = old.token;
            setSession(fresh);
            keepSession(fresh);
          }
        })
        .catch(() => {
          if (!activeToken.current && savedSession()?.token === old.token)
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
      keepSession(null);
      setSession(null);
      setMaterials([]);
      setRequests([]);
      setNotices([]);
      setCart([]);
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
    const id = new URL(window.location.href).searchParams.get("request");
    if (id && requests.some((r) => r.id === id)) {
      setTab("requests");
      requestAnimationFrame(() =>
        document
          .getElementById(`request-${id}`)
          ?.scrollIntoView({ block: "center" }),
      );
    }
  }, [requests]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(u: WarehouseUser, password = "") {
    await action(async () => {
      const s = await rpc<WarehouseSession>("mmv_login", {
        p_user_id: u.id,
        p_pin: password,
      });
      activeToken.current = s.token;
      keepSession(s);
      setSession(s);
      setSelected(null);
      setPin("");
      setTab("pick");
    });
  }
  async function logout() {
    activeToken.current = null;
    if (session)
      await rpc("mmv_logout", { p_token: session.token }).catch(() => {});
    keepSession(null);
    setSession(null);
    setRequests([]);
    setMaterials([]);
    setNotices([]);
    setCart([]);
    setPin("");
  }
  const visible = materials.filter((m) =>
    `${m.code} ${m.description} ${m.description_vi || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  async function submit() {
    if (!session) return;
    await action(async () => {
      if (!job.trim()) throw new Error("Cần nhập JOB thực tế");
      if (!cart.length) throw new Error("Chưa chọn vật tư");
      await rpc("mmv_submit_request", {
        p_token: session.token,
        p_idempotency_key: submitKey.current,
        p_job_code: job.trim(),
        p_lines: cart.map((x) => ({ code: x.code, qty: validQty(x.qty) })),
        p_note: note.trim(),
        p_vessel: vessel.trim() || null,
      });
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
    if (!session) return;
    await action(async () => {
      await rpc("mmv_approve_request", {
        p_token: session.token,
        p_request_id: r.id,
        p_approve: yes,
        p_note: yes
          ? "Đồng ý theo phiếu yêu cầu"
          : "Từ chối - cần trao đổi lại với người yêu cầu",
      });
      void dispatchPush(session.token);
      setMessage(
        yes
          ? "Đã lưu quyết định duyệt. Chỉ kho xác nhận cấp thực tế mới trừ tồn."
          : "Đã từ chối yêu cầu.",
      );
      await load(session);
    });
  }
  async function issue(r: WarehouseRequest) {
    if (!session) return;
    await action(async () => {
      if (!voucher[r.id]?.trim())
        throw new Error(
          "Nhập số SIV/phiếu xuất đã kiểm tra không trùng với file Excel trước khi cấp hàng.",
        );
      const lines = r.lines.map((l) => ({
        line_id: l.id,
        qty: validActualQty(
          issueQty[String(l.id)] ?? l.requested_qty,
          Number(l.requested_qty),
        ),
      }));
      if (lines.some((l) => !Number.isFinite(l.qty) || l.qty < 0))
        throw new Error("Số lượng thực cấp không hợp lệ");
      if (
        !window.confirm(
          "Bạn xác nhận đã bàn giao hàng thực tế đúng số lượng nhập? Thao tác này ghi giảm tồn và lưu lịch sử.",
        )
      )
        return;
      issueKeys.current[r.id] ||= crypto.randomUUID();
      await rpc("mmv_issue_request", {
        p_token: session.token,
        p_request_id: r.id,
        p_idempotency_key: issueKeys.current[r.id],
        p_lines: lines,
        p_note: "Kho xác nhận đã cấp hàng thực tế",
        p_voucher_no: voucher[r.id].trim(),
      });
      void dispatchPush(session.token);
      setMessage("Đã ghi nhận thực cấp và giảm tồn đúng một lần.");
      await load(session);
    });
  }
  async function exportDay() {
    if (!session) return;
    await action(async () => {
      // Fetch a fresh server result for the chosen day; never export a pending cart or stale page cache.
      const data = await rpc<WarehouseRequest[]>("mmv_export_day", {
        p_token: session.token,
        p_date: day,
      });
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
      const wb = buildRequestOutWorkbook(
        issued.map((r) => ({
          id: r.id,
          request_no: r.request_no,
          voucher_no: r.voucher_no || "",
          status: "issued" as const,
          issued_at: r.issued_at!,
          requester_name: r.requester_name,
          issued_by_name: r.issued_by_name,
          job_code: r.job_code,
          vessel: r.vessel,
          items: r.lines
            .filter((l) => Number(l.issued_qty) > 0)
            .map((l) => ({
              id: String(l.id),
              material_code: l.material_code,
              description: l.description,
              unit: l.unit,
              qty_issued: Number(l.issued_qty),
            })),
        })),
        day,
      );
      saveRequestOutWorkbook(wb, `OUT_MMV_${day}.xlsx`);
    });
  }
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
              Không bắt buộc cài app. Người duyệt và kho dùng thêm mật khẩu
              riêng để tránh duyệt thay.
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
                Duyệt / Cấp / Lịch sử
              </Button>
              <Button
                variant={tab === "notices" ? "default" : "outline"}
                onClick={() => setTab("notices")}
              >
                Thông báo ({notices.filter((n) => !n.read_at).length})
              </Button>
            </nav>
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
                    className="w-full"
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
                    <Button disabled={busy} onClick={exportDay}>
                      <Download className="h-4 w-4" />
                      Tải OUT + Movement 2
                    </Button>
                    <p className="w-full text-sm text-amber-800">
                      Chỉ phiếu đã thực cấp. Dán OUT chưa trừ Material; đối
                      chiếu và nhập Movement 2 một lần, theo ID trong file xuất.
                    </p>
                  </div>
                )}
                {requests.map((r) => (
                  <article
                    id={`request-${r.id}`}
                    key={r.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <h2 className="mr-auto text-lg font-bold">
                        {r.request_no} · {r.job_code}
                      </h2>
                      <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-900">
                        {statusName[r.status] || r.status}
                      </span>
                    </div>
                    <p className="my-2 text-sm text-slate-500">
                      {r.requester_name} · {time(r.created_at)}{" "}
                      {r.vessel && `· ${r.vessel}`}
                    </p>
                    {r.note && <p>{r.note}</p>}
                    <div className="overflow-x-auto">
                      <table className="my-3 w-full text-left text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="py-2">Mã / Tên chuẩn</th>
                            <th>ĐVT</th>
                            <th>Yêu cầu</th>
                            <th>Thực cấp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.lines.map((l) => (
                            <tr key={l.id} className="border-b">
                              <td className="py-3 pr-2">
                                <b>{l.material_code}</b>
                                <br />
                                {l.description}
                              </td>
                              <td>{l.unit}</td>
                              <td>{l.requested_qty}</td>
                              <td>
                                {r.status === "approved" && isWarehouse ? (
                                  <Input
                                    aria-label={`Thực cấp ${l.material_code} ${r.request_no}`}
                                    className="w-24"
                                    type="number"
                                    min="0"
                                    max={l.requested_qty}
                                    step="any"
                                    value={
                                      issueQty[String(l.id)] ?? l.requested_qty
                                    }
                                    onChange={(e) =>
                                      setIssueQty((q) => ({
                                        ...q,
                                        [String(l.id)]: e.target.value,
                                      }))
                                    }
                                  />
                                ) : (
                                  (l.issued_qty ?? "Chưa cấp")
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-sm text-slate-600">
                      Phê duyệt:{" "}
                      {r.approvals
                        .map(
                          (a) =>
                            `${a.user_name || a.user_id}: ${a.decision || (a.decided_at ? (a.approved ? "đồng ý" : "từ chối") : "chờ")}`,
                        )
                        .join(" · ")}
                    </p>
                    {session.can_approve && r.status === "pending" && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          disabled={busy}
                          onClick={() => approve(r, true)}
                        >
                          <CheckCircle className="h-4 w-4" />
                          Đồng ý
                        </Button>
                        <Button
                          disabled={busy}
                          variant="outline"
                          onClick={() => approve(r, false)}
                        >
                          Từ chối
                        </Button>
                      </div>
                    )}
                    {isWarehouse && r.status === "approved" && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Input
                          className="max-w-xs"
                          aria-label={`Số phiếu ${r.request_no}`}
                          placeholder="Số SIV đã đối chiếu với Excel"
                          value={voucher[r.id] || ""}
                          onChange={(e) =>
                            setVoucher((v) => ({
                              ...v,
                              [r.id]: e.target.value,
                            }))
                          }
                        />
                        <Button disabled={busy} onClick={() => issue(r)}>
                          Xác nhận đã cấp thực tế
                        </Button>
                      </div>
                    )}
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer font-semibold">
                        Lịch sử xử lý
                      </summary>
                      {r.events.map((ev, i) => (
                        <p className="py-1" key={i}>
                          {time(ev.created_at)} · {ev.actor_name} ·{" "}
                          {ev.event_type || ev.action} {ev.note}
                        </p>
                      ))}
                    </details>
                  </article>
                ))}
                {!requests.length && (
                  <p className="rounded-xl bg-white p-6">
                    Chưa có yêu cầu trong phạm vi tài khoản này.
                  </p>
                )}
              </section>
            )}
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
      <InstallAppPrompt />
    </div>
  );
}
