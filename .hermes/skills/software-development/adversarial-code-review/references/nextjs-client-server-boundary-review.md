# Next.js / full-stack review: server/client boundary verification

Session case: adversarial review of a checkout epic branch. Typecheck passed,
300/300 unit tests passed — but `next build` FAILED and the dev server returned
500 on a core route (`/order/payment-return`). The bug: a `"use client"`
component imported server-only modules (`next/headers` transitively via a
cookie helper and the SDK client). Unit tests could never see it because they
mock those modules; no e2e spec visited the route. Verdict went from
"approve-with-fixes" to "needs-work" on the strength of the empirical build
check.

## Why green tests miss boundary violations

- Server actions / cookie helpers (`getCartId()` → `cookies()` from
  `next/headers`) and SDK clients that read `next/headers` are mocked in every
  unit test (`vi.mock("@/lib/medusa/cookies", ...)`). The mock REPLACES the
  module, so the client-component import compiles fine under vitest.
- The real `next/headers` is server-only: importing it into a client bundle is
  a module-graph error at build time. Turbopack message: "You're importing a
  module that depends on 'next/headers'. This API is only available in Server
  Components in the App Router...", followed by an **import trace** listing
  every hop (`client.ts [Client Component Browser] → CheckoutPoller.tsx →
  page.tsx`). Read the trace: the LAST client-component hop before the
  server-only file is the guilty import.
- `tsc --noEmit` cannot catch it (it's a bundler boundary rule, not a type
  rule).

## Empirical verification recipe (read-only, no repo edits)

```bash
# 1) Fast signal: dev server + hit the route (route must be GET-safe / no mutation)
cd apps/storefront && pnpm exec next dev -p 3100 > /tmp/next-dev.log 2>&1 &
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/order/payment-return --max-time 90
# 500 + "Ecmascript file had an error" + import trace in /tmp/next-dev.log ⇒ boundary break

# 2) Definitive signal: fresh production build (mirrors CI's build job)
pnpm next build > /tmp/next-build.log 2>&1; echo "EXIT: $?"
# EXIT: 1 + same error ⇒ CI `build` job is red on this branch; report it as evidence

# 3) Don't trust an existing .next artifact
pnpm exec next start -p 3100   # "Could not find a production build" ⇒ stale/invalid
# BUILD_ID existing is NOT proof of a valid build — always rebuild for the verdict.
```

Restore any working-tree drift after running pnpm (check `git status`; some
pnpm invocations touch `pnpm-lock.yaml` — `git checkout -- pnpm-lock.yaml`).

## Fix pattern

Never pass server-only functions into client components. Move the work behind
a server action (or route handler) that returns a plain serializable result:

- Bad: `"use client"` component imports `getCartId` / `getMedusaClient` and
  runs a polling loop client-side.
- Good: server action `pollPaymentReturnAction()` runs the loop server-side and
  returns `{ outcome, orderId }`; the client component calls the action and
  renders the result.

## Companion checks that catch the rest of this bug class

- **E2E route-coverage audit**: list the routes each spec visits; any route
  that is a live user path (e.g. the Stripe `return_url`) but visited by NO
  spec is where build breaks hide. Suggest a structural spec that GETs every
  new route.
- **Dead-export grep** (tested-but-unused helpers give false confidence):
  `grep -rn "<exportName>" src --include=*.ts --include=*.tsx | grep -v test`
  — zero production hits means the helper's tests validate nothing the app
  runs; the real wiring has no tests.
- **Stale test comments**: a test comment describing mock behavior that the
  mock no longer performs (e.g. "mock returns {error}" while the mock now
  throws) is a signal the test drifted from the code it claims to verify.
- **Money-unit scan** (major-units platforms like Medusa v2):
  `git diff main...HEAD | grep -nE "(\* *100|/ *100|100 *\*|100 */)"` — should
  be empty; then confirm `fromMedusaAmount`-style helpers are identity.
- **Brief scope that doesn't exist**: if the brief lists directories absent
  from the branch (e.g. `apps/backend/src/api/store/checkout/*`), say so in the
  report explicitly instead of silently skipping.
