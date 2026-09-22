# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout — read this first

This git repo (`mmv-warehouse/`) contains **two separate apps**, plus a folder-name trap:

- `mmv-warehouse/mmv-warehouse/` — the real React app (**default focus for feature work**). Yes, the name repeats; the outer folder is the git root, the inner one is the Vite project root (`package.json`, `src/`, `node_modules` all live here). Always run npm commands from this inner folder, not the git root — there is no root `package.json`.
- `app-vat-tu-xuong.html` (git root) — a separate, older standalone tool: a single self-contained HTML file, no build step, no dependencies. It is published as a Claude.ai Artifact for shop-floor tablets; its data lives inline in a `<script id="app-state">` tag and is "deployed" by republishing the artifact, not by this repo's git history. Don't assume changes here affect the React app or vice versa — they share only the material/JOB domain, not code.
- `Material.xlsx` (git root) — the warehouse's real material catalogue, 1501 codes, one sheet whose columns match `buildMaterialWorkbook`'s output exactly. **Untracked** (`.gitignore` excludes `*.xlsx`) and it stays that way; what's committed is the SQL generated from it, `mmv-warehouse/supabase/seed_materials.sql`, via `scripts/gen_seed_materials.py`. So the file has to be present locally to regenerate that seed — don't assume a fresh clone has it.
- `docs/ke-hoach-kho-mmv.html` — a static planning/roadmap document, not app code.
- `README.md` (git root) — documents only the standalone HTML tool (accounts, roles, Excel export format, known limitations). It predates the React app and says nothing about it.

## Running the apps

React app (from the git root, matching `start-warehouse.bat`):
```
cd mmv-warehouse
npm install   # first time only
npm run dev         # vite dev server, port 5173, host: true (LAN/phone access)
npm run dev:mock    # nhu tren nhung CHE DO MOC, port 5174 (xem duoi)
npm run build       # tsc -b && vite build
npm run preview     # vite preview --host, port 4173
npm run typecheck   # tsc --noEmit
npm run lint        # eslint . (flat config: eslint.config.js)
npm run lint:fix    # eslint . --fix
npm run test        # vitest run (chay mot lan)
npm run test:watch  # vitest (watch mode)
```
There is **no CI** — nothing runs these for you. `npm run typecheck && npm run lint && npm run test` is the whole safety net; the `typecheck` skill (`.claude/skills/typecheck/`) wraps it. Run it before calling a React-app change done.

### Tests

Vitest, configured in the `test` block of `vite.config.ts` — deliberately **not** a separate `vitest.config.ts`, so the `@` alias stays declared in one place instead of three (it is already duplicated across `vite.config.ts` and `tsconfig.json`).

Scope is the data layer only: `src/lib/*.test.ts`, `environment: 'node'`, no jsdom, no testing-library, no component rendering. Adding a component test means adding those dependencies — decide that deliberately rather than drifting into it.

Two things every `api.*.test.ts` must do, and both matter:

1. **`vi.mock('@/lib/supabase')`** returning `isSupabaseConfigured: false` plus a `supabase` Proxy that throws on any property access. Dev machines have a real `.env`, and a test that slips into the Supabase branch writes to the **live company warehouse**. `vite.config.ts` also blanks the `VITE_*` vars for test runs; that is the belt, this is the braces.
2. **`vi.resetModules()` + re-import inside `beforeEach`.** `store` in `mock.ts` is module-level mutable state, and `materials: [...MATERIALS]` is a *shallow* copy — the material objects are shared with the source array, so one test's stock change leaks into the next. Re-importing the module is what gives each test a clean warehouse.

These tests only ever exercise the **mock** branch. Every API function's Supabase branch is a `supabase.rpc(...)` into a function in `schema.sql` that they cannot reach. A green suite proves the mock branch and the rule it encodes — not the RPC. Change a permission rule and you must change it in both places by hand.

`src/test/setup.ts` swallows `console.error('[MMV api]', …)` and nothing else. Most tests here fail on purpose (wrong role, wrong quantity, unknown code) and `fail()` logs every one; other `console.error` output still comes through.

`no-explicit-any` and `exhaustive-deps` are `warn` (not `error`) on purpose — see the comments in `eslint.config.js`. The Supabase API layer (`src/lib/api.ts`) uses `any` pragmatically and pages use `useEffect(() => { load() }, [...])` throughout; don't "fix" these opportunistically unless asked.

`npm run dev:mock` runs the same app against the in-memory fixtures in `src/lib/mock.ts` instead of Supabase, on port 5174 — so both can run at once. It works by pointing Vite's `envDir` at the git root (which has no `.env`), so `isSupabaseConfigured` comes out false; it never reads, renames or deletes the real `mmv-warehouse/.env`. Config is `vite.config.mock.ts`.

This exists because the mock branch is otherwise unreachable on any machine that has been set up: `.env` is present, so Supabase always wins, and the branch nobody can run is the branch that rots. Use it to exercise write flows without touching the live warehouse. Caveat: the mock store is in-memory, so a **full page load wipes it** — navigate inside the app (click the nav) to keep state across screens.

Standalone HTML tool: open `app-vat-tu-xuong.html` directly in a browser, or run `start-web.bat` (serves it via `server.ps1` on port 8080 for LAN/tablet access).

## Stack (React app)

Vite + React 18 + TypeScript (strict), Tailwind, shadcn/ui-style components under `src/components/ui/`, Zustand for state, React Router v6, Recharts, Supabase (`@supabase/supabase-js`) as backend, `xlsx-js-style` + `file-saver` for Excel export. `@/*` is aliased to `src/*` in **both** `vite.config.ts` and `tsconfig.json` — keep them in sync.

## Architecture (React app) — the parts you can't see from one file

### Every API function has two implementations

`src/lib/api.ts` (~1150 lines) is the single data-access layer. Every exported function starts with `if (!isSupabaseConfigured) { ...mock branch... }` and falls through to a Supabase branch. `isSupabaseConfigured` comes from `src/lib/supabase.ts` and is false when `.env` is missing, so the whole app runs offline against `src/lib/mock.ts` — an in-memory mutable store that mirrors `supabase/seed.sql`.

**When you add or change an API function, implement both branches.** A Supabase-only change silently breaks the no-`.env` path; a mock-only change passes local testing and breaks production.

### The `ApiResult` contract

Every API function returns `ApiResult<T>` = `{ success, data, error, warning? }` and **never throws** — internal errors go through the `fail()` helper, successes through `ok()`. Pages consume it uniformly:

```ts
useEffect(() => {
  getMaterials().then((res) => {
    if (res.success && res.data) setMats(res.data)
    else toast.error(res.error ?? 'Không tải được tồn kho')
    setLoading(false)
  })
}, [])
```

`toast` is imported from `@/store/useToast` (a Zustand store with a non-React `toast.success/error/info` facade). Follow this shape in new pages rather than introducing a fetching library or error boundary.

### Stock/ledger logic lives in the client, not the database

`supabase/schema.sql` defines tables and indexes only — **no triggers, no RPC functions, no computed stock**. Each stock-changing flow (`logConsumable`, `logManualConsumable`, `confirmVoucher`, `logRollCut`) performs the same three writes by hand, in separate non-transactional calls:

1. insert the source record (`consumable_logs` / `voucher_items` / `roll_cuts`),
2. `update materials.closing_qty` with a read-modify-write,
3. insert a row into `movements` (the append-only ledger that feeds reports and Excel export).

So `movements` is populated only by application code. Any new flow that moves stock must replicate all three writes — in both the Supabase and mock branches. Negative stock is allowed and surfaced via `ApiResult.warning` ("TỒN ÂM"), not blocked.

Since the RPC work (commits `9066481`…`2e8ad35`) the Supabase side of each flow is a single `create or replace function` in `schema.sql` that wraps all three writes in one transaction — `log_consumable`, `log_manual_consumable`, `log_roll_cut`, `confirm_voucher`, `log_stock_move`. The client just calls `supabase.rpc(...)`. The **mock** branch still does the three writes by hand in `mock.ts`, so it is the one that can go out of sync; keep the two semantically identical.

### Material categories are the permission axis

`materials.category` is not a display grouping — it decides **who may move that stock**:

| category | who moves it | where |
|---|---|---|
| `consumable` | any KTV | `/pick` (`logConsumable`) |
| `roll` | any KTV | `/roll` (`logRollCut`) |
| `general` | **admin only** | `/stock` (`logStockMove`) |

`general` is the bulk of the catalogue (1466 of 1501 codes). The rule is enforced in three places and all three must agree: the `roles` prop / `NAV` entry, the API function in `api.ts`, and the RPC in `schema.sql` (which takes a `p_actor_role` argument — client-supplied, so it's a second line of defence, not the only one, consistent with the table-lookup auth described below).

Two filters look similar but are not: `getMaterials(category?)` is a plain filter, while `getConsumableMaterials()` is an **allow-list** (`category = 'consumable'`). It used to be the exclusion `category != 'roll'`, which silently meant "the whole warehouse" once the full catalogue landed. Don't reintroduce exclusion filters here.

`min_stock = 0` means "not tracked for reorder" — every `general` code is seeded that way, and `getStockAlerts` / `Inventory.statusOf` both skip those rows. Without that, ~900 zero-stock codes drown the real consumable alerts.

### Auth is a table lookup, not Supabase Auth

The Supabase client is created with `auth: { persistSession: false }`. Login (`src/pages/Login.tsx`) reads the `users` table and:
- **non-admin users log in by tapping their name — no password at all** (shop-floor tablet UX),
- **admins** are checked against a plaintext `pin` column, compared client-side.

The session is a Zustand `persist` store (`src/store/useAuth.ts`) in localStorage under `mmv.auth`. RLS is enabled on every table but every policy is `allow_all ... to anon, authenticated using (true)` — the anon key is effectively full access. This is deliberate for an internal prototype (the schema comment says "SIẾT LẠI khi lên production"); don't harden it unprompted.

### Role gating is duplicated in two places

Roles in the React app are `ktv | warehouse | manager | sales | admin` (five — **not** the standalone tool's three). Access is declared twice and must be kept in sync:
- `src/App.tsx` — the `roles` prop on each `<ProtectedRoute>`; `ProtectedRoute` also wraps children in `Layout`, so routes and chrome are coupled.
- `src/components/Layout.tsx` — the `NAV` array, which filters nav links by the same role lists.

Adding a page means touching both. `src/pages/Home.tsx` has a *third* copy (the `ADMIN_LINKS` / `STAFF` arrays) — check it too. The `isAdmin/isManager/isWarehouse` helpers on `useAuth` encode a separate, overlapping hierarchy — read them before relying on them.

### Excel export

`src/lib/excel.ts` builds workbooks as arrays-of-arrays with `xlsx-js-style`, applying explicit cell styles, `!cols` widths, and `!merges`; `api.ts` wraps each builder in an `export*Excel` function that calls `saveWorkbook` (file-saver). Layout is positional — title row, blank row, totals row, then the header row — so inserting a row shifts every hardcoded style reference (`A1`, `H3`, `I3`) and merge range.

The **Material** export reproduces `Material.xlsx` column for column, including `Location`, `Type`, `Remark` and `Status` — which is why those four live on `materials` as `location`, `mat_type`, `remark`, `stock_status`. `Type` is the supplier/group code (VIK, ZODI, RFD…), **not** `category`; an earlier version wrote `category` into that column and left the other three blank.

The **Movement** export targets the warehouse workbook's `Movement` sheet: the 12 spec columns (`ITEMS, SRV, SIV, DATE, CODE, DESCRIPTION, UNIT, RECEIPT, ISSUE, JOB CODE, VESSEL, REMAKS`) **plus a 13th, `NGUOI THUC HIEN`**, added by commit `a976237`. The 12-column form in `README.md` describes the standalone tool, not this app. `ITEMS` restarts at 1 per source voucher (grouped by `source_type:source_id`).

### Supabase schema changes

There is no Supabase CLI and no migrations folder. `supabase/*.sql` are run by hand in the Supabase SQL editor; edit them directly. A schema change means updating **three** places: the SQL file, the `Database`/entity types in `src/lib/types.ts`, and the mock fixtures in `src/lib/mock.ts`.

`schema.sql` opens with `drop table … cascade`, so it is **only** for building a fresh database — never tell anyone to re-run it against a live one. Changing a live database means writing a separate idempotent `migrate_*.sql` alongside it (see `migrate_2026_09_vat_tu_ngoai_tieu_hao.sql`, which `ALTER`s the columns and re-declares the changed functions) and keeping `schema.sql` as the canonical definition.

Run order on a new database: `schema.sql` → `seed.sql` → `seed_materials.sql`. `seed_materials.sql` is generated, not hand-edited: it holds all 1501 codes from `Material.xlsx` and is re-runnable, with `on conflict (code) do update` touching only the xlsx-owned columns so `description_vi`, `unit_price`, `min_stock` and expiry data from `seed.sql` survive. Regenerate it with `python scripts/gen_seed_materials.py` when a new `Material.xlsx` arrives.

`mock.ts` deliberately carries only a 48-code **sample** of the `general` materials, not all 1466 — the full list would ship in the production bundle for the benefit of the no-`.env` path alone.

### PWA

Hand-rolled, no Vite PWA plugin: `public/manifest.webmanifest` + `public/sw.js` (network-first, falls back to cache, then `/`), registered in `src/main.tsx`. `src/components/InstallAppPrompt.tsx` renders the install affordance. Bump the `CACHE` constant in `sw.js` when the shell changes, or tablets keep the old bundle.

### UI conventions

`tailwind.config.js` overrides the default type scale upward (`base` = 18px, `lg` = 20px, …) and defines `minHeight.touch` = 48px plus the MMV palette (`navy`, `confirm`, `danger`) alongside the shadcn CSS-variable tokens. This is a gloved-hands tablet UI — keep controls at `min-h-touch` and prefer the named colors over ad-hoc Tailwind shades. `.no-print` and the `@media print` blocks in `src/index.css` drive `VoucherPrint.tsx`; print layout breaks if header/nav lose `no-print`.

## Env vars

`mmv-warehouse/.env` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`). Without them the app boots into mock mode with a console warning instead of failing. Never commit real Supabase keys — `.gitignore` calls this out explicitly.

## Deployment

Deployed on Vercel via `vercel.json` at the git root: `buildCommand` cd's into `mmv-warehouse` before `npm install && npm run build`, `outputDirectory` is `mmv-warehouse/dist`, `installCommand` is a no-op, and a catch-all rewrite serves `/index.html` for client-side routing. If you touch build config, keep these paths in sync with the nested folder structure — commit `f9025d1` had to fix this exact path after a broken deploy.

Note there are two `.claude/launch.json` files with different arg lists: the root one uses `npm run dev --prefix mmv-warehouse`, the inner one plain `npm run dev`. Both target port 5173.

## Domain terms

- **KTV** = kỹ thuật viên (workshop technician). The standalone tool has three roles (`ktv`, `kho`, `admin`); the React app has five (see above).
- **JOB**, **Movement**, **Voucher** — warehouse transaction concepts reflected in the React app's page names (`Movement`, `Vouchers`, `Pick`, `Roll`). A *voucher* is a draft IN/OUT slip that becomes real stock only on `confirmVoucher`; a *movement* is an immutable ledger line.
- **Stock move** (`Stock.tsx`, `stock_moves`) — an admin nhập/xuất straight onto a `general` material, with no voucher number and no printout. Vouchers stay for goods handed to a customer; stock moves are the short path for everything else.
- **Roll** (`Roll.tsx`, `roll_tracking`/`roll_cuts`) — materials with `category = 'roll'` are cut down over time rather than issued whole; they're excluded from `getConsumableMaterials`.
- **PR_PRO_002**, **PR_FRM_005** — internal procurement procedure/form codes referenced as the target spec the tooling is working toward (see README "Việc tiếp theo").

## Known limitations — leave alone unless asked

The standalone tool's README documents accepted limitations of an internal prototype: plaintext lowercase passwords (default admin `admin`/`mmv2026`), no real offline support, and log entries that aren't truly deletable. The React app has its equivalents (passwordless worker login, plaintext admin PIN, permissive RLS, non-transactional stock writes). These are known and intentional for now — don't flag or fix them proactively; only touch auth/security behavior if explicitly asked.

## Language

Commits, docs, comments, and UI strings mix Vietnamese and English (commit messages sometimes use no-diacritics Vietnamese). Code identifiers are English, user-facing strings and inline comments are Vietnamese. Match the existing language of whatever file or area you're editing rather than converting it.

## Data hygiene

Real business data must never be committed: `.gitignore` excludes `users.txt`, `data.json`, `movement-app-xuong-*.csv/txt`, and any `*.xlsx`/`*.pdf`/`*.docx`. Don't add exceptions for these patterns.
