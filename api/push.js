import webpush from "web-push";
import { timingSafeEqual } from "node:crypto";

const allowedEndpoint =
  /^https:\/\/(fcm\.googleapis\.com|([A-Za-z0-9-]+\.)*push\.services\.mozilla\.com|([A-Za-z0-9-]+\.)*push\.apple\.com|([A-Za-z0-9-]+\.)*notify\.windows\.com)\//;
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const {
    SUPABASE_SERVICE_ROLE_KEY: key,
    VAPID_PUBLIC_KEY: pub,
    VAPID_PRIVATE_KEY: priv,
  } = process.env;
  const url = process.env.SUPABASE_URL;
  const enabled = !!(key && pub && priv && url);
  const cronRequest = req.method === "GET" && req.url.includes("dispatch=1");
  if (req.method === "GET" && !cronRequest)
    return res.status(200).json({ enabled, publicKey: pub || null });
  if (req.method !== "POST" && !cronRequest) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }
  if (!enabled)
    return res
      .status(503)
      .json({
        error:
          "Push delivery is not configured; durable inbox is still available.",
      });
  if (req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host)
        return res.status(403).end();
    } catch {
      return res.status(403).end();
    }
  }
  const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
  if (cronRequest) {
    const expected = process.env.CRON_SECRET || "";
    if (
      !expected ||
      Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    )
      return res.status(401).end();
  } else if (!/^[a-f0-9]{64}$/.test(token)) return res.status(401).end();
  async function rpc(name, args) {
    const headers={apikey:key,"Content-Type":"application/json"};
    // New Supabase sb_secret keys are opaque, not JWT bearer tokens.
    if(key.startsWith("eyJ"))headers.Authorization=`Bearer ${key}`;
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(`Database RPC failed: ${name}`);
      error.rpc = name;
      error.status = response.status;
      error.dbCode = /^[A-Z0-9]{5,12}$/.test(payload.code || '') ? payload.code : 'UNKNOWN';
      throw error;
    }
    return response.json();
  }
  if (!cronRequest) {
    try {
      await rpc("mmv_session", { p_token: token });
    } catch (error) {
      if (error.dbCode === '28000') return res.status(401).json({error:'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.'});
      console.error('mmv_push_failure', { stage:'session_validation', rpc:error.rpc || 'network', status:error.status || 0, code:error.dbCode || 'NETWORK' });
      return res.status(503).json({error:'Máy chủ chưa xác minh được phiên với Supabase. Kiểm tra khóa server và URL dự án trên Vercel.',stage:'session_validation'});
    }
  }
  try {
    webpush.setVapidDetails("https://mmv-warehouse.vercel.app", pub, priv);
    const rows = await rpc("mmv_claim_push_outbox", { p_limit: 5 });
    let delivered = 0;
    await Promise.all(
      rows.map(async (row) => {
        let failureReason = 'No registered device', failed = false,
          sent = 0;
        await Promise.all(
          row.subscriptions.map(async (sub) => {
            if (!allowedEndpoint.test(sub.endpoint)) {
              failed = true;
              failureReason = 'Unsupported push provider';
              return;
            }
            try {
              // Phone lock screens show only a generic message, not item/job details.
              await webpush.sendNotification(
                sub,
                JSON.stringify({
                  id: row.notification.id,
                  request_id: row.notification.request_id,
                  title: "Kho MMV: yêu cầu vật tư",
                  body: "Có cập nhật mới. Mở website để xem và xử lý.",
                }),
                { TTL: 3600, timeout: 7000 },
              );
              sent++;
            } catch (error) {
              failureReason = `Push provider HTTP ${Number(error.statusCode) || 0}`;
              if (error.statusCode === 404 || error.statusCode === 410)
                await rpc("mmv_push_remove_expired", {
                  p_subscription_id: sub.id,
                });
              else failed = true;
            }
          }),
        );
        // No registered device is not a successful delivery. Leave the inbox untouched.
        const success = !failed && sent > 0;
        await rpc("mmv_complete_push_outbox", {
          p_id: row.id,
          p_lease_token: row.lease_token,
          p_delivered: success,
          p_error: success
            ? null
            : failureReason,
        });
        if (success) delivered++;
      }),
    );
    return res.status(200).json({ delivered });
  } catch (error) {
    console.error('mmv_push_failure', {stage:'dispatch',rpc:error.rpc || 'push_transport',status:error.status || 0,code:error.dbCode || 'TRANSPORT'});
    return res
      .status(502)
      .json({
        error: "Máy chủ gửi thông báo gặp lỗi. Hộp thư và phiếu vẫn được giữ nguyên.",
        stage: error.rpc === 'mmv_claim_push_outbox' ? 'outbox_claim' : 'push_dispatch',
      });
  }
}
