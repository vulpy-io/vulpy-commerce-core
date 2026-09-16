# Worked example: checkout epic QA gate (feat/3-checkout-stripe-e2e)

Storefront/pnpm/turbo gate on a Next.js + Medusa monorepo. Branch: 12 commits, 83 files
(+6330/−396). Worktree: `/data/state/worktrees/vulpy-checkout-3`, brief at `/tmp/review-brief-qa.md`.

## Commands and real results (Aug 2026)

| Gate | Command | Result |
|---|---|---|
| tests | `cd apps/storefront && XDG_CONFIG_HOME=/tmp/.config corepack pnpm vitest run` | 36 files, 300 tests, 300 passed, exit 0 (4.17s) |
| typecheck | same dir, `corepack pnpm typecheck` (`tsc --noEmit`) | **exit 1** — `CheckoutForm.tsx(384,27): TS2345` |
| lint | repo root, `corepack pnpm check` (`ultracite check`) | exit 0 — 606 files checked, no fixes applied (needed PATH shim, see below) |
| build | `apps/storefront && corepack pnpm build` (`next build` 16.2.9/Turbopack) | **exit 1** — 2 errors: `client.ts:2:1` and `cookies.ts:1:1` "next/headers only available in Server Components... Pages Router" (needed same-fs node_modules, see below) |
| CI install proof | `pnpm install --frozen-lockfile --ignore-scripts` on HEAD's lockfile | **exit 1** — "specifiers in the lockfile don't match specifiers in package.json: 1 dependencies were added: @playwright/test@1.55.0" |
| playwright config | `corepack pnpm exec playwright test e2e/checkout --list` | exit 0 — 7 tests / 4 files / 3 projects (structural 3, stripe 2, chromium 2) |
| e2e preflight | `bash scripts/tests/checkout-e2e.sh --preflight-only` | "checkout-e2e preflight: PASS (structural)", exit 0 |
| stripe guard | `CHECKOUT_E2E_IGNORE_DOTENV=1 bash scripts/tests/checkout-e2e.sh --grep @stripe --preflight-only` | exit 78 "test publishable and secret keys are required; values are never logged" |

## Findings (severity — file — finding)

1. **CRITICAL** — `pnpm-lock.yaml` committed state stale: `@playwright/test@1.55.0` added to root
   package.json in b207f68 but lockfile never regenerated. CI uses `--frozen-lockfile` in 8 jobs
   (ci.yml:112–261, pnpm/action-setup@v6 → pnpm@10.15.0 from `packageManager` field) → every CI job fails.
   Detection: `git log --oneline -3 -- package.json pnpm-lock.yaml` shows package.json change without
   a lockfile change. Proof: snapshot/swap/restore frozen install (exit 1, verbatim above).
2. **HIGH** — `apps/storefront/src/components/Checkout/PaymentReturnPoller.tsx:8-9` (new, `"use client"`)
   imports `getMedusaClient`/`getCartId` → `lib/medusa/client.ts` + `cookies.ts` both `import { cookies } from "next/headers"`.
   Import traces show `[Client Component Browser]` entries. `git grep -ln 'lib/medusa/client' origin/main -- apps/storefront/src/components` =
   empty on main → branch-introduced chain. Build fails with the two Turbopack errors.
3. **HIGH** — `CheckoutForm.tsx:384` TS2345: `initiatePaymentSessionAction` union not assignable to
   `EnrichedCartResult` (`{ cart: StoreCart|null; issues; checkoutBlocked }` from `lib/medusa/cart-result.ts`).
4. **MEDIUM** — `apps/storefront/src/app/actions/order.ts:129-131`: region-error return is
   `{ error: string }` with NO `status` discriminant; TS can't narrow it away at the call site.
   Fix direction: `{ status: "error", error: string }` or `"status" in result` guard.
5. **LOW** — Next 16 warns `middleware` file convention deprecated (use `proxy`); warning only.

## Environment workarounds (sandbox artifacts, NOT repo defects)

- **Turbopack cross-fs panic**: worktree `node_modules -> /app/workspace/node_modules` (symlink to main
  checkout on another mount; store at `/app/.pnpm-store/v10`). `next build` → "Symlink
  [project]/apps/storefront/node_modules/next is invalid, it points out of the filesystem root".
  Fix used (no tracked changes):
  ```
  cp -a /app/.pnpm-store/v10 <worktree>/.pnpm-store        # same fs as worktree; gitignored
  rm <worktree>/node_modules                                # removes symlink only
  corepack pnpm install --store-dir <worktree>/.pnpm-store --prefer-offline \
    --config.strict-store-pkg-content-check=false
  ```
  Then build passed the symlink check and surfaced the REAL code errors. Note: first install attempt
  hung on pnpm prompt "The modules directories will be removed and reinstalled from scratch.
  Proceed?" — triggered by the foreign node_modules symlink; pre-removing the symlink avoids it.
  `readlink -f node_modules/.modules.yaml`'s `storeDir` tells you which store links resolve to.
- **`pnpm` not on child PATH**: `corepack pnpm check` → `/bin/sh: 1: pnpm: not found` (ultracite
  spawns `pnpm` via sh). Shim:
  `mkdir -p /tmp/qabin && ln -sf ~/.cache/node/corepack/v1/pnpm/10.15.0/bin/pnpm.cjs /tmp/qabin/pnpm`
  then `PATH=/tmp/qabin:$PATH corepack pnpm check` → exit 0, 606 files.

## Reusable one-liners

- Prove lockfile CI failure without dirtying the repo:
  `cp pnpm-lock.yaml /tmp/lock.orig && git show HEAD:pnpm-lock.yaml > pnpm-lock.yaml && pnpm install --frozen-lockfile --ignore-scripts; cp /tmp/lock.orig pnpm-lock.yaml && git status --short`
- Attribute a build error to the branch: `git diff --name-status origin/main..HEAD -- <file>` +
  `git grep -ln '<module>' origin/main -- apps/storefront/src/components` (empty = new chain).
- Stray-process check after gates: `ps aux | grep -E '[n]ext build|[p]npm install|[v]itest'` — other
  worktrees' leftover processes (e.g. `wt-billing-bridge` vitest fork) are NOT yours; don't kill them.
