# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout — read this first

This git repo (`mmv-warehouse/`) contains **two separate apps**, plus a folder-name trap:

- `mmv-warehouse/mmv-warehouse/` — the real React app (**default focus for feature work**). Yes, the name repeats; the outer folder is the git root, the inner one is the Vite project root (`package.json`, `src/`, `node_modules` all live here). Always run npm commands from this inner folder, not the git root — there is no root `package.json`.
- `app-vat-tu-xuong.html` (git root) — a separate, older standalone tool: a single self-contained HTML file, no build step, no dependencies. It is published as a Claude.ai Artifact for shop-floor tablets; its data lives inline in a `<script id="app-state">` tag and is "deployed" by republishing the artifact, not by this repo's git history. Don't assume changes here affect the React app or vice versa — they share only the material/JOB domain, not code.
- `docs/ke-hoach-kho-mmv.html` — a static planning/roadmap document, not app code.
- `README.md` (git root) — documents only the standalone HTML tool (accounts, roles, Excel export format, known limitations). It predates the React app and says nothing about it.

## Running the apps

React app (from the git root, matching `start-warehouse.bat`):
```
cd mmv-warehouse
npm install   # first time only
npm run dev         # vite dev server, port 5173, host: true (LAN/phone access)
npm run build       # tsc -b && vite build
npm run preview     # vite preview --host, port 4173
npm run typecheck   # tsc --noEmit
npm run lint        # eslint . (flat config: eslint.config.js)
npm run lint:fix    # eslint . --fix
```
There is **no CI and no test framework** — don't invent test commands or assume one exists. `npm run typecheck && npm run lint` is the only automated safety net; the `typecheck` skill (`.claude/skills/typecheck/`) wraps it. Run it before calling a React-app change done.

`no-explicit-any` and `exhaustive-deps` are `warn` (not `error`) on purpose — see the comments in `eslint.config.js`. The Supabase API layer (`src/lib/api.ts`) uses `any` pragmatically and pages use `useEffect(() => { load() }, [...])` throughout; don't "fix" these opportunistically unless asked.

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

So `movements` is populated only by application code, and a partial failure leaves stock and ledger out of sync. Any new flow that moves stock must replicate all three writes — in both the Supabase and mock branches. Negative stock is allowed and surfaced via `ApiResult.warning` ("TỒN ÂM"), not blocked.

### Auth is a table lookup, not Supabase Auth

The Supabase client is created with `auth: { persistSession: false }`. Login (`src/pages/Login.tsx`) reads the `users` table and:
- **non-admin users log in by tapping their name — no password at all** (shop-floor tablet UX),
- **admins** are checked against a plaintext `pin` column, compared client-side.

The session is a Zustand `persist` store (`src/store/useAuth.ts`) in localStorage under `mmv.auth`. RLS is enabled on every table but every policy is `allow_all ... to anon, authenticated using (true)` — the anon key is effectively full access. This is deliberate for an internal prototype (the schema comment says "SIẾT LẠI khi lên production"); don't harden it unprompted.

### Role gating is duplicated in two places

Roles in the React app are `ktv | warehouse | manager | sales | admin` (five — **not** the standalone tool's three). Access is declared twice and must be kept in sync:
- `src/App.tsx` — the `roles` prop on each `<ProtectedRoute>`; `ProtectedRoute` also wraps children in `Layout`, so routes and chrome are coupled.
- `src/components/Layout.tsx` — the `NAV` array, which filters nav links by the same role lists.

Adding a page means touching both. The `isAdmin/isManager/isWarehouse` helpers on `useAuth` encode a separate, overlapping hierarchy — read them before relying on them.

### Excel export

`src/lib/excel.ts` builds workbooks as arrays-of-arrays with `xlsx-js-style`, applying explicit cell styles, `!cols` widths, and `!merges`; `api.ts` wraps each builder in an `export*Excel` function that calls `saveWorkbook` (file-saver). Layout is positional — title row, blank row, totals row, then the header row — so inserting a row shifts every hardcoded style reference (`A1`, `H3`, `I3`) and merge range.

The **Movement** export targets the warehouse workbook's `Movement` sheet: the 12 spec columns (`ITEMS, SRV, SIV, DATE, CODE, DESCRIPTION, UNIT, RECEIPT, ISSUE, JOB CODE, VESSEL, REMAKS`) **plus a 13th, `NGUOI THUC HIEN`**, added by commit `a976237`. The 12-column form in `README.md` describes the standalone tool, not this app. `ITEMS` restarts at 1 per source voucher (grouped by `source_type:source_id`).

### Supabase schema changes

There is no Supabase CLI and no migrations folder. `supabase/schema.sql` and `supabase/seed.sql` are run by hand in the Supabase SQL editor; edit them directly. A schema change means updating **three** places: the SQL file, the `Database`/entity types in `src/lib/types.ts`, and the mock fixtures in `src/lib/mock.ts`.

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
- **Roll** (`Roll.tsx`, `roll_tracking`/`roll_cuts`) — materials with `category = 'roll'` are cut down over time rather than issued whole; they're excluded from `getConsumableMaterials`.
- **PR_PRO_002**, **PR_FRM_005** — internal procurement procedure/form codes referenced as the target spec the tooling is working toward (see README "Việc tiếp theo").

## Known limitations — leave alone unless asked

The standalone tool's README documents accepted limitations of an internal prototype: plaintext lowercase passwords (default admin `admin`/`mmv2026`), no real offline support, and log entries that aren't truly deletable. The React app has its equivalents (passwordless worker login, plaintext admin PIN, permissive RLS, non-transactional stock writes). These are known and intentional for now — don't flag or fix them proactively; only touch auth/security behavior if explicitly asked.

## Language

Commits, docs, comments, and UI strings mix Vietnamese and English (commit messages sometimes use no-diacritics Vietnamese). Code identifiers are English, user-facing strings and inline comments are Vietnamese. Match the existing language of whatever file or area you're editing rather than converting it.

## Data hygiene

Real business data must never be committed: `.gitignore` excludes `users.txt`, `data.json`, `movement-app-xuong-*.csv/txt`, and any `*.xlsx`/`*.pdf`/`*.docx`. Don't add exceptions for these patterns.
