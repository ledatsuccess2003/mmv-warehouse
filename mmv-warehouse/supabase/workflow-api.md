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
   By default use a different secret of 8–72 bytes per person. Known defaults/repeated
   characters are rejected. See the explicitly approved group exception below.
   Never put provisioning calls containing real credentials in Git or chat.
6. Import the October Material baseline **before any request is submitted** using
   the owner-only snapshot RPC described below. No seed/example stock qualifies.

The migration removes direct browser access to legacy stock/identity tables,
removes permissive RLS policies, revokes old role-spoofable mutation RPCs, and
clears legacy plaintext `users.pin`. It preserves ledger rows. Private helpers,
PIN hashes, session hashes, device keys and the push outbox are not accessible
to `anon`/`authenticated`. Service-only functions are granted only to
`service_role`; SQL owner has the normal implicit owner permissions.

### Owner-approved credential sharing (2026-10-19)

Apply `migrations/20261019_credential_groups.sql` after the request migration.
It seeds **no users or credentials** and leaves stock, request history, roles and
the two-approver physical-issue rule unchanged. Membership starts empty.

The owner explicitly approved one shared credential for the two named designated
approvers, and a **different** shared credential for Admin 1/2/3. The owner/service
configures the five IDs with `mmv_configure_credential_groups(integer[],integer[])`
after checking the actual directory names. It accepts exactly two active designated
approvers and three active admins with no overlap. Browser roles cannot call it.

`mmv_set_pin` then allows duplicates **only inside the same configured group**.
Cross-group reuse and reuse by an unlisted employee remain blocked. The configured
approver pair may use a common/default credential as expressly accepted by the
owner; other accounts retain the common-password block. Minimum length, byte
limit, repeated-character checks, salted bcrypt hashes, session revocation on
reset, five-failure login limit and server-side role checks remain enforced.

Do not publish the selected passwords in code, environment variables or tests.
The owner must enter and submit the new credentials privately in Supabase.
Configure membership first; this migration and deploying the frontend alone do
**not** set any password. Rotate credentials if group membership changes. Shared
credentials mean audit records identify the selected account, not reliably the
physical individual who clicked it; both named approvers are still required.

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

## Additive complete history and daily reporting

Apply `migrations/20261018_history.sql` **after** the requests migration. This
additive migration creates three read-only APIs and supporting indexes; it
does not change stock, existing business rows, approval rules, user roles or
credentials. Requests/lines/events have no automatic expiry or weekly reset.
An 8-hour login session expiry requires signing in again; it does not delete
Monday's requests when they are looked up on Friday.

### Complete cursor history

```text
mmv_history(
  p_token TEXT,
  p_from DATE = NULL,
  p_to DATE = NULL,
  p_status TEXT = NULL,
  p_before_created_at TIMESTAMPTZ = NULL,
  p_before_id UUID = NULL,
  p_limit INTEGER = 50
) -> {
  items: [full nested request...],
  has_more: BOOLEAN,
  next_cursor: {created_at: ISO timestamp, id: UUID} | null,
  total_count: INTEGER
}
```

- `p_from` and `p_to` are inclusive **Vietnamese submission/created dates**.
  A date's interval is `[00:00, next 00:00)` in `Asia/Ho_Chi_Minh`, regardless
  of a browser/server/session's local timezone. They are not physical issue dates.
- Null status means all statuses; otherwise it must be exactly `pending`,
  `approved`, `rejected`, `cancelled`, or `issued`. Reversed date ranges fail.
- Page size must be 1–100. Pass both cursor fields or neither. For another page,
  pass the **unaltered** `next_cursor` from the previous response and the same
  filters. Reset the cursor when changing a filter or refreshing history.
- Ordering is `created_at DESC, id DESC`, including when hundreds of requests
  share an identical timestamp. The cursor is the last returned item, not the
  extra row used to detect another page. The final response has `has_more:false`
  and `next_cursor:null`. The filtered total is computed across the entire
  authorized database, not just the current page or last 500 requests.
- Scope is enforced server-side: requester sees their own, designated approvers
  see requests that include them, warehouse/admin see all. Counts obey the same
  scope. A client-provided requester ID or role cannot expand it.
- Unlike the legacy `mmv_requests` convenience feed, this API is not capped to
  500 records overall. Continue loading pages to reach the oldest record.
  Filter/current-status changes between refreshes can change the matching set;
  this is live reporting, not a frozen historical status reconstruction.

The client RPC adapter must normalize `response.items`, not just array-shaped
responses. Old notification links should fetch `mmv_request(p_token,UUID)`
directly instead of assuming a UUID exists in the latest loaded history page.
That authorized full-detail endpoint remains independent of pagination.

### Full export source by stable request UUID

`mmv_export_request(p_token TEXT,p_request_id UUID)` returns the same full nested
request snapshot, including canonical code/name/unit, approved and actual
quantities, real SIV number, actor, timestamps, approvals and complete events.
Only credential-authenticated warehouse/admin may call it; an unknown request,
draft/pending/approved/rejected/cancelled request or request with no positive
physical issue is rejected. It does not change stock, mark an Excel import as
complete, or create a new issue. Zero-quantity lines are retained in the source
evidence but must not become positive OUT/Movement rows in the workbook.

`mmv_export_day` remains the unpaginated source of **all physically issued**
requests on an issue date. A request created Monday but issued Friday belongs
to Monday's submission history and Friday's physical OUT export, not Monday's
OUT export. Exporting an old request again does not subtract database stock;
operators must still prevent importing the same line IDs into Excel twice.

### Complete daily summaries (today, yesterday, or an older day)

`mmv_day_summary(p_token TEXT,p_date DATE)` returns:

```text
{
  date,
  created_requests, requesters,
  pending, approved, rejected, cancelled,
  issued_requests, issued_requesters, issued_lines,
  issued_by_item: [{material_code, description, unit, quantity}]
}
```

Every number is computed over **all authorized matching rows**, with no recent-
history/page/500-row cap. `requesters` and `issued_requesters` are distinct-person
**counts**, not lists. Empty days explicitly return zero counts and an empty
item array. Unauthorized requests never affect a worker's visible totals.

The two date bases are intentionally different and must be labeled clearly:

- `created_requests`, `requesters` and the four status counts refer to requests
  **created on that Vietnamese date**, using their **current** status. They do
  not claim to show how many were pending at that historical day's close. The
  four status counts omit requests now issued, so they need not add up to all
  created requests.
- `issued_requests`/`issued_requesters` refer to requests physically issued on
  the chosen Vietnamese date, even if submitted earlier. `issued_lines` counts
  positive actual-issued lines only. Zero/unissued lines are not counted.
- `issued_by_item` sums positive actual quantities separately by exact
  **code + recorded description + unit**. It never combines pairs, metres,
  litres or other incompatible units into one misleading grand quantity.

The UI should compute today/yesterday as Vietnamese calendar dates. Do not
derive yesterday from a browser's local midnight or display the latest 500-row
client list as a complete daily total.

Regression coverage is in `tests/history.sql`: more than 500 issued requests,
identical timestamp cursors across 13 pages, private worker visibility, a Monday
request looked up/exported on Friday, Vietnamese midnight boundaries under a
non-Vietnamese database session timezone, zero-quantity evidence and no stock/
ledger mutation. Run only against a fresh disposable database; fixtures roll
back. Production execution/UI verification must be recorded separately.
