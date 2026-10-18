import { supabase } from "./supabase";

export type WarehouseUser = {
  id: number;
  name: string;
  role: string;
  requires_pin?: boolean;
  can_approve?: boolean;
  can_issue?: boolean;
};
export type WarehouseSession = {
  token: string;
  expires_at: string;
  user: WarehouseUser;
  can_approve: boolean;
};
export type WarehouseMaterial = {
  code: string;
  description: string;
  description_vi?: string;
  unit: string;
  category: string;
  closing_qty: number;
  snapshot_at?: string;
};
export type RequestLine = {
  id: string;
  material_code: string;
  description: string;
  unit: string;
  requested_qty: number;
  issued_qty: number | null;
};
export type WarehouseRequest = {
  id: string;
  request_no: string;
  voucher_no?: string;
  status: string;
  job_code: string;
  vessel?: string;
  note?: string;
  created_at: string;
  issued_at?: string;
  requester_name: string;
  issued_by_name?: string;
  requester_id: number;
  lines: RequestLine[];
  approvals: {
    user_id: number;
    user_name?: string;
    decision?: string;
    approved?: boolean;
    decided_at?: string;
  }[];
  events: {
    event_type?: string;
    action?: string;
    actor_name?: string;
    created_at: string;
    note?: string;
  }[];
};
export type WarehouseNotification = {
  id: number;
  title: string;
  body: string;
  created_at: string;
  read_at?: string;
  request_id?: string;
};
export type RequestHistoryCursor = { created_at: string; id: string };
export type RequestHistoryPage = {
  items: WarehouseRequest[];
  has_more: boolean;
  next_cursor: RequestHistoryCursor | null;
  total_count: number;
};
export type RequestHistoryFilter = { from: string; to: string; status: string };
export type WarehouseDaySummary = {
  date: string;
  created_requests: number;
  requesters: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  issued_requests: number;
  issued_requesters: number;
  issued_lines: number;
  issued_by_item: {
    material_code: string;
    description: string;
    unit: string;
    quantity: number;
  }[];
};

function normalizeRequest(raw: Record<string, unknown>): WarehouseRequest {
  const approvals = Array.isArray(raw.approvals) ? raw.approvals : [];
  const events = Array.isArray(raw.events) ? raw.events : [];
  return {
    ...raw,
    request_no: String(raw.request_no ?? ""),
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    approvals: approvals.map((a: Record<string, unknown>) => ({
      ...a,
      user_id: a.approver_id ?? a.user_id,
      user_name: a.approver_name ?? a.user_name,
    })),
    events: events.map((e: Record<string, unknown>) => ({
      ...e,
      event_type: e.kind ?? e.event_type ?? e.action,
      note: (e.details as { note?: string } | undefined)?.note ?? e.note ?? "",
    })),
  } as WarehouseRequest;
}

/** New server rows replace same-ID cache rows without dropping older loaded pages. */
export function mergeRequestPages(
  previous: WarehouseRequest[],
  incoming: WarehouseRequest[],
): WarehouseRequest[] {
  const rows = new Map(previous.map((r) => [r.id, r]));
  for (const request of incoming) rows.set(request.id, request);
  return [...rows.values()].sort((a, b) => {
    const dateDifference = Date.parse(b.created_at) - Date.parse(a.created_at);
    return dateDifference || (a.id === b.id ? 0 : a.id < b.id ? 1 : -1);
  });
}

export function matchesHistoryFilter(
  request: WarehouseRequest,
  filter: RequestHistoryFilter,
) {
  const createdDay = vietnamDate(new Date(request.created_at));
  return (
    (!filter.from || createdDay >= filter.from) &&
    (!filter.to || createdDay <= filter.to) &&
    (!filter.status || request.status === filter.status)
  );
}

export function requestIdFromInput(input: string): string | null {
  const text = input.trim();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuid.test(text)) return text.toLowerCase();
  try {
    const value = new URL(text).searchParams.get("request") || "";
    return uuid.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function validVietnamDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

export function shiftVietnamDay(day: string, days: number): string {
  if (!validVietnamDay(day) || !Number.isInteger(days))
    throw new Error("Ngày Việt Nam không hợp lệ");
  const parsed = new Date(`${day}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (error.code === "28000")
      window.dispatchEvent(
        new CustomEvent("mmv-session-expired", {
          detail: { token: args.p_token },
        }),
      );
    throw new Error(error.message || "Không kết nối được kho dữ liệu");
  }
  if (data?.ok === false)
    throw new Error(data.error || "Thao tác không thành công");
  if (data?.user) return { ...data, can_approve: !!data.user.can_approve } as T;
  if (Array.isArray(data) && (name === "mmv_requests" || name === "mmv_export_day"))
    return data.map(normalizeRequest) as T;
  if (name === "mmv_history" && data && Array.isArray(data.items))
    return { ...data, items: data.items.map(normalizeRequest) } as T;
  if (data && ["mmv_request", "mmv_export_request", "mmv_submit_request", "mmv_approve_request", "mmv_cancel_request", "mmv_issue_request"].includes(name))
    return normalizeRequest(data) as T;
  return data as T;
}
const storage = "mmv.workflow.session.v2";
export function savedSession(): WarehouseSession | null {
  try {
    const value = sessionStorage.getItem(storage),
      s = value ? JSON.parse(value) : null;
    if (
      !s ||
      !s.user ||
      !Number.isInteger(s.user.id) ||
      !/^[a-f0-9]{64}$/.test(s.token) ||
      !(Date.parse(s.expires_at) > Date.now())
    ) {
      sessionStorage.removeItem(storage);
      return null;
    }
    return s;
  } catch {
    sessionStorage.removeItem(storage);
    return null;
  }
}
export function keepSession(session: WarehouseSession | null) {
  if (session) sessionStorage.setItem(storage, JSON.stringify(session));
  else sessionStorage.removeItem(storage);
}
export function validQty(value: unknown): number {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && !value.trim())
  )
    throw new Error("Số lượng không được để trống");
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error("Số lượng phải là số hữu hạn lớn hơn 0");
  return n;
}
export function validActualQty(raw: unknown, ceiling: number): number {
  if (
    raw === null ||
    raw === undefined ||
    typeof raw === "boolean" ||
    (typeof raw === "string" && !raw.trim())
  )
    throw new Error(
      "Không được để trống số thực cấp. Nhập 0 nếu không cấp dòng này.",
    );
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > ceiling)
    throw new Error("Thực cấp phải từ 0 đến số lượng đã duyệt");
  return n;
}
export function vietnamDate(date = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)!.value)
    .join("-");
}
export async function enablePush(token: string) {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error(
      "Trình duyệt chưa hỗ trợ thông báo nền. iPhone cần thêm web vào Màn hình chính. Bạn vẫn dùng web bình thường.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Chưa được cấp quyền thông báo. Yêu cầu vẫn được lưu trong hộp thông báo trên web.",
    );
  const config = await fetch("/api/push").then(async (r) => {
    if (!r.ok) throw new Error("Máy chủ thông báo chưa được cấu hình");
    return r.json();
  });
  if (!config.enabled)
    throw new Error(
      "Thông báo trên web đã sẵn sàng. Thông báo nền cần cấu hình máy chủ gửi trước khi bật thiết bị.",
    );
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const padding = "=".repeat((4 - (config.publicKey.length % 4)) % 4);
  const raw = atob(
    (config.publicKey + padding).replace(/-/g, "+").replace(/_/g, "/"),
  );
  const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  await rpc("mmv_push_subscribe", {
    p_token: token,
    p_subscription: subscription.toJSON(),
  });
  void dispatchPush(token);
}
export async function dispatchPush(token: string) {
  // The durable database outbox is authoritative. Delivery is retried separately;
  // a push transport failure must never undo or duplicate the inventory operation.
  try {
    await fetch("/api/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* inbox remains durable */
  }
}
