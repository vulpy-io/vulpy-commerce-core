# v0 Stability Audit — Vulpy Commerce (2026-07-29)

Full pre-v0 audit run against TypeScript, lint, tests, and code paths.

## Baseline health
- TypeScript: **zero errors** (`pnpm --filter @apps/storefront typecheck`)
- Lint: **clean** (521 files, ultracite/biome)
- Tests: **157 passing** (23 test files, storefront only; medusa-backend has 0 tests)

---

## 🔴 Critical — front↔back wiring

### 1. `payment-return` page: no polling, no redirect, no order detection
**Files:** `apps/storefront/src/components/Checkout/PaymentReturnClient.tsx`, `apps/storefront/src/app/actions/payment-return.ts`

`getPaymentReturnStatusAction` returns only `"pending"` | `"not_found"`. It never:
- queries for an order created from the cart
- returns `{ state: "completed", orderId: string }`

`PaymentReturnClient` fires the action once on mount. No retry loop. No redirect to `/order/confirmed/[id]`.

**Effect:** After Stripe payment, users are permanently stuck on "Payment processing." Orders do get placed server-side (Stripe webhook completes them), but the storefront never navigates to the confirmation page.

**Fix required:**
```ts
// payment-return.ts — add completed branch:
const order = await medusa.store.order.list({ cart_id: resolvedCartId });
if (order?.orders?.[0]) {
  return { state: "completed", orderId: order.orders[0].id };
}

// PaymentReturnClient.tsx — poll:
useEffect(() => {
  const interval = setInterval(async () => {
    const result = await getPaymentReturnStatusAction(cartId);
    if (result.state === "completed") {
      clearInterval(interval);
      router.push(`/order/confirmed/${result.orderId}`);
    }
  }, 2000);
  const timeout = setTimeout(() => clearInterval(interval), 30_000);
  return () => { clearInterval(interval); clearTimeout(timeout); };
}, [cartId]);
```

### 2. `CART_FIELDS` duplicate constants drifted out of sync
**Files:** `apps/storefront/src/app/actions/cart.ts` (L10–12), `apps/storefront/src/lib/medusa/cart.ts` (L14–15)

`actions/cart.ts` includes `+items.variant.inventory_quantity, +items.variant.manage_inventory`.
`lib/medusa/cart.ts` does not.

`getEnrichedCart()` (in `cart.ts`) is called after every mutation. Without these fields, inventory-gated UI gets stale data after add/update/remove operations.

**Fix:** export one `CART_FIELDS` const from `lib/medusa/cart.ts`, import it in `actions/cart.ts`.

---

## 🟡 High — UX stability

### 3. `clearCartAction` deletes items serially
**File:** `apps/storefront/src/app/actions/cart.ts`

```ts
for (const item of cart.items) {
  await medusa.store.cart.deleteLineItem(cartId, item.id); // sequential
}
```
N round trips for an N-item cart. Replace with `Promise.all`.

### 4. Checkout `<Checkout />` implicitly depends on ancestor `CartProvider`
`CheckoutPage` → `<Checkout />` → `<CheckoutForm />` → `useCart()`. The `CartProvider` lives in `SiteLayoutClient` (a parent layout). If Next.js parallel route quirks or direct navigation bypasses the layout boundary, `useCart()` will throw. Low probability but worth noting as a fragile implicit coupling.

---

## 🟡 Medium — agentic management

### 5. Agent cmd `--lines` / `--service` stub-documented, not implemented
`vulpy.sh` usage line: `pnpm vulpy agent cmd <cmd> [--env dev|staging|live] [--service name] [--lines N]`

`vulpy-agent-cmd.py` parses only `--env`. `vulpy-agent-cmd-server.py` has no `--lines`/`--service` handling. Log commands have hardcoded tail counts. Passing `--lines 50` silently does nothing.

### 6. `generate-agent-status.sh` `in_hermes()` cgroups v2 heuristic
`grep -q hermes /proc/1/cgroup` does not work on cgroups v2 hosts (unified hierarchy, file has no controller names). Could misdetect host vs. container context.

---

## 🟢 Solid / no action needed
- Stripe card payment confirmation flow (`confirmCardPayment` → `placeOrderAction` → redirect) is correct for direct card payment. The payment-return issue only affects 3DS redirect / async flows.
- Cart recovery on stale/completed cart (404 or 400 + "already completed") → recreate: correct.
- Optimistic UI, analytics consent-gating, analytics event inventory: clean.
- Agent command protocol (file-drop + atomic renames + 300 s timeout): solid design.
- All 157 unit tests cover pure functions in `lib/medusa/` and `lib/analytics/`. No false positives.

---

## Test coverage gap
`apps/medusa-backend/src` has **zero test files**. All server actions (`cart.ts`, `order.ts`, `customer.ts`, `checkout.ts`) have no test coverage at any level. Any regression in the Medusa-storefront wiring is invisible until a human hits it.

Recommended: add at minimum a smoke-level integration test harness (`vitest + msw` or a real Medusa test instance) for `addToCartAction`, `placeOrderAction`, and `getPaymentReturnStatusAction`.
