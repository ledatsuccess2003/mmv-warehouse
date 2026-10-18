# MMV request API (2026-10-18)

## Migration and provisioning

1. Apply a **non-destructive** base schema containing `public.users`, `materials`,
   `jobs`, `movements` (original columns). Do not run the DROP section of `schema.sql`.
2. Apply `migrations/20261018_requests.sql` as the SQL-editor database owner.
3. Seed real employee IDs/names/roles, with `pin = NULL`; do not seed demo PINs.
4. Owner calls `mmv_configure_approvers(ARRAY[<Thanh Vinh ID>,<Khac Vinh ID>])`.
   IDs must be checked against actual names first, not guessed from names.
5. Owner privately calls `mmv_set_pin(<ID>, <private credential>)` for the two
   approvers and every warehouse/admin account that will perform elevated actions.
   Use a different secret of 8–72 bytes per person. Known defaults/repeated
   characters are rejected. Never put these calls/values in Git or chat.
6. Import the October Material baseline **before any request is submitted** using
   the owner-only snapshot RPC described below. No seed/example stock qualifies.

The migration removes direct browser access to legacy stock/identity tables,
removes permissive RLS policies, revokes old role-spoofable mutation RPCs, and
clears legacy plaintext `users.pin`. It preserves ledger rows. Private helpers,
PIN hashes, session hashes, device keys and the push outbox are not accessible
to `anon`/`authenticated`. Service-only functions are granted only to
`service_role`; SQL owner has the normal implicit owner permissions.

Security-definer functions use an empty pinned `search_path`, schema-qualified
relations, and explicit EXECUTE grants, following
[Supabase's function guidance](https://supabase.com/docs/guides/database/functions).

## Session and reading (browser-safe RPCs)

All calls use ordinary Supabase REST/RPC with the public project key, but every
non-directory read/mutation requires an opaque `p_token` issued by the database.
It is a 32-byte random bearer token, stored **hashed** in the database, expires
after 8 hours, and maps to one server-verified active user ID. Never send a
client-provided actor ID/role to a lifecycle mutation. Do not log bearer tokens.
The client should clear its token on logout/401 and never fall back to demo data.

| RPC | Parameters | Result |
| --- | --- | --- |
| `mmv_directory` | none | Array of `{id,name,role,active,requires_pin,can_approve}`; no PIN/hash |
| `mmv_login` | `p_user_id`, `p_pin=''` | `{ok,token,expires_at,user}` or `{ok:false,error,requires_pin?,setup_required?,retry_at?}` |
| `mmv_session` | `p_token` | `{user:{id,name,role,active,requires_pin,can_approve,can_issue}}` |
| `mmv_logout` | `p_token` | `{ok:true}`; revokes this token |
| `mmv_materials` | `p_token` | Array of canonical consumable/roll materials: `id,code,description,description_vi,unit,category,closing_qty,min_stock,location,snapshot_at,snapshot_import_id` |
| `mmv_jobs` | `p_token` | Existing job rows (new exact typed job/reference is also accepted on submission) |
| `mmv_requests` | `p_token,p_limit=100` | Visible nested requests; hard limit 500 |
| `mmv_request` | `p_token,p_request_id` | One visible nested request |
| `mmv_export_day` | `p_token,p_date DATE` | All physically issued requests for that Vietnamese calendar day, no pagination; warehouse/admin only |

Worker click-name entry is **attribution, not proof of physical identity**. It
allows submitting requests only. It cannot grant approval, stock issue or import
powers. Shared/kiosk workers can impersonate a requester name; if that is
unacceptable MMV must provision authenticated worker credentials separately.
Managers/warehouse/admin and explicitly designated approvers must enter a
privately provisioned credential. Five wrong privileged attempts block that user
for 15 minutes; counters are persistent/transactionally locked. Failed logins
return JSON rather than raising so counters are not rolled back.

## Request lifecycle

`pending → approved → issued`, or `pending → rejected`.
Requester or warehouse/admin may cancel a pending/approved request. Cancellation
and rejection require reasons. No quantity is deducted by submission/approval.

Nested request fields include:

```text
id UUID, request_no integer (application reference, NOT automatically a real SIV),
requester_id, requester_name, job_code, vessel, note,
status, required_approver_ids, created_at, updated_at,
issued_at, issued_by, issued_by_name, issue_note, voucher_no (nullable),
lines: [{id,request_id,line_no,material_code,description,unit,requested_qty,issued_qty}],
approvals: [{request_id,approver_id,approver_name,approved,note,decided_at}],
events: [{id,request_id,actor_id,actor_name,kind,details,created_at}]
```

1. `mmv_submit_request(p_token,p_idempotency_key UUID,p_job_code TEXT,
   p_lines JSONB,p_note TEXT=NULL,p_vessel TEXT=NULL)`.
   Lines are `[{"code":"EXACT-MATERIAL-CODE","qty":2}]`, 1–100 unique codes.
   Quantities must be positive JSON numbers, not numeric strings/NaN. Names and
   units are taken from the server's canonical Material, never the client.
   A repeated key and identical payload returns the existing request; a reused
   key with changed data fails. Each request snapshots **two configured approver
   IDs**. New requests notify requester, both approvers and all active warehouse/
   admin identities **before approval**. No stock reservation/deduction occurs.

2. `mmv_approve_request(p_token,p_request_id UUID,p_approve BOOLEAN,
   p_note TEXT=NULL)`. Only an explicitly designated approver listed on that
   request can decide. One decision per approver is append-only; both approvals
   are required. A single rejection terminates the request. Repeating the exact
   decision is safe; changing it requires a new request, not editing history.

3. `mmv_issue_request(p_token,p_request_id UUID,p_idempotency_key UUID,
   p_lines JSONB,p_note TEXT=NULL,p_voucher_no TEXT=NULL)`.
   Only credential-authenticated warehouse/admin can confirm **physical issue**.
   Lines must contain **every request line once**:
   `[{"line_id":"UUID","qty":2}]`; use 0 for not supplied. Actual quantity
   cannot exceed the approved/requested quantity. At least one must be positive.
   A short supply closes this request; the remainder requires a new request.
   Exact canonical name/unit is checked again. Insufficient recorded stock is
   blocked, not silently clipped/hidden as ex-stock. An approved reconciliation
   is required before issuing against insufficient records.

   Header/line updates, stock decrement, movements, evidence and notifications
   are **one transaction**, with request/stock row locks and deterministic SKU
   lock order. A request can be issued once only. Retries return the issued
   request (`already_issued:true`), without a second stock subtraction. A reused
   key with changed same-request payload fails. Keep the same UUID across retries.

   `p_voucher_no` must be a nonblank **operator-supplied real voucher number**,
   unique case-insensitively inside this application. Do not invent a real SIV.
   The UI must ask the operator to reconcile with existing Excel voucher numbers:
   this database cannot know numbers already used outside the app. The parameter
   has a SQL default only for API compatibility; a missing value is rejected.

4. `mmv_cancel_request(p_token,p_request_id UUID,p_note TEXT)`.

Once issued, `issued_qty>0` rows are the physical stock issue/OUT export source.
Draft requests/approvals must not be exported as physical issues. Exporting does
not perform a second database decrement. The Excel workbook is separate: MMV's
OUT → Movement → reviewed Movement (2) process still requires an operator.
Avoid importing the same issued application reference twice into inventory.
Server timestamps and issue dates use `Asia/Ho_Chi_Minh`, not a device clock.

## Notifications and push

Browser RPCs:

- `mmv_notifications(p_token,p_limit=100)` → this user's notifications only.
- `mmv_read_notification(p_token,p_notification_id BIGINT)` → `{ok:boolean}`.
- `mmv_push_subscribe(p_token,p_subscription JSONB)` accepts standard
  `{endpoint,keys:{p256dh,auth}}`. Underlying equivalent:
  `mmv_register_push(p_token,p_endpoint,p_p256dh,p_auth)`.
- `mmv_unregister_push(p_token,p_endpoint)`.

In-app notifications are durable for submission, individual approval, rejection,
cancellation and physical issue. Durable push-outbox rows exist independently
of whether a phone has subscribed. Browser permission and supported browser/OS
are required for phone push; installation is never required to use the site.
iOS home-screen Web Push may require add-to-home-screen due to platform rules;
do not turn this limitation into a mandatory install wall for the website.

Server worker **only**, with a private service role key and private VAPID key:

- `mmv_claim_push_outbox(p_limit=30)` (alias `mmv_push_claim`) →
  `[{id,lease_token,notification:{id,user_id,request_id,title,body,...},
  subscriptions:[{id,endpoint,keys:{p256dh,auth}}]}]`.
  Uses `FOR UPDATE SKIP LOCKED`, 2-minute leases, at most 8 attempts.
- Send each device a payload containing at least `title`, `body`,
  `url: /requests/<request_id>`, `notification_id`, `request_id`.
- `mmv_complete_push_outbox(p_id,p_lease_token,p_delivered BOOLEAN,
  p_error TEXT=NULL)` (alias `mmv_push_complete`, parameter is `p_success` there).
  A matching lease is mandatory so stale workers cannot acknowledge new work.
- `mmv_push_remove_expired(p_subscription_id UUID)` after a real provider 404/410.

Never place service-role/VAPID private keys in `VITE_*`. Validate incoming worker
trigger authorization; do not expose an unauthenticated notification dispatcher.
Endpoint hosts are allowlisted to Google FCM, Mozilla Push, Apple Push and
Windows notifications to reduce SSRF. A worker should retain the same allowlist
and reject redirects. Retry means push can be delivered more than once; use
`notification_id` as the browser notification `tag` to collapse duplicates. Push
delivery is best-effort; durable in-app notifications are the source of truth.

## October source import (owner/service only)

```text
mmv_import_material_snapshot(
 p_snapshot_key UUID,
 p_source_hash TEXT,       -- lowercase SHA256 of the actual source Excel
 p_source_name TEXT,       -- actual path/name + Material sheet provenance
 p_rows JSONB,
 p_cutoff TIMESTAMPTZ
)
```

Rows: `{code,description,unit,category:'consumable'|'roll',closing_qty:number,
description_vi?,min_stock?:integer,location?,mat_type?,remark?,stock_status?}`.
Codes, English names and units are preserved exactly from Material. Negative
source quantities remain negative in storage. Missing/duplicate codes,
nonnumeric quantities, missing names/units are rejected. Canonical English text
must not be replaced with historic request text. Translation is optional only.

The RPC stores an immutable import header and before/after JSON per SKU, with
snapshot timestamp on Material. Repeating the same source hash/key is safe.
**Any existing request or movement blocks a new baseline import**: overwriting
live stock with Excel would erase unexported issues/double-count movements.
This is a safe bootstrap importer, not recurring synchronization. Later imports
need an approved reconciliation/adjustment design with export checkpoints.

## Required end-to-end verification before claiming production

- Anonymous users cannot read `users.pin` or private tables, mutate materials,
  call legacy mutation RPCs, set PINs, configure approvers, import or claim push.
- Name-only worker token cannot approve/issue another's request or view it.
- Both elevated approvers need private credentials, not client-side role changes.
- Duplicate submit returns one request; changed payload with same key fails.
- Submission reaches warehouse/admin and both approvers before either approves.
- First approval leaves stock unchanged; second makes request `approved` only.
- Non-warehouse issue, premature issue, malformed quantities, over-approval
  quantity, duplicate/missing lines, insufficient stock all fail with no partial writes.
- Physical issue reduces stock once; retry/concurrent retry cannot double-issue.
- Actual OUT export contains exact Material code/name/unit, only actual issued
  quantities, the right Vietnamese date/job/person, and no invented SIV number.
- Phone permission granted/device registered; live push works when tab is closed;
  notification deep link opens the correct request. No unsupported guarantee of
  notifications if OS/browser/network permissions block them.
- Imported October row counts/codes/names/units/quantities reconcile to source;
  no production data/credential values appear in the Git repository.

Migration authoring/static parsing is not equivalent to applying it to live
Supabase or passing these runtime checks; record actual evidence separately.
