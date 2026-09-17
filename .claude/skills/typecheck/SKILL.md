---
name: typecheck
description: Run TypeScript type-checking and ESLint on the mmv-warehouse React app. Use before considering a change to the React app (mmv-warehouse/mmv-warehouse/) done, since there is no CI — this is the only automated safety net.
---

Run this from the git root (`mmv-warehouse/`), not from inside the nested app folder:

```
cd mmv-warehouse && npm run typecheck && npm run lint
```

Notes:
- `npm run typecheck` is `tsc --noEmit`. `npm run lint` is ESLint (`eslint.config.js`).
- The nested folder name repeats (`mmv-warehouse/mmv-warehouse/`); double-check you're one level into the git root, not two, before running the command.
- `no-explicit-any` is a warning, not an error — don't treat pre-existing `any` usage in `src/lib/api.ts` as something to fix unless asked.
- Report any type errors or new lint errors with file:line and a one-line fix suggestion. Do not attempt to silence errors with `@ts-ignore` or `eslint-disable` unless asked.
