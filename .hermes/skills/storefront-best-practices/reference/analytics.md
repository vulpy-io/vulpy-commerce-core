# Storefront analytics (Matomo + optional GTM)

Use this reference whenever adding or changing storefront UX that affects discovery, cart/checkout, forms, or engagement.

**Canonical project rules:** repo root `AGENTS.md` → **Matomo analytics**. Ops/deploy: `deploy/README.md`.

## Architecture

Call sites emit domain events through a **provider-agnostic bus** (`lib/analytics/bus.ts` + `catalog.ts`). Adapters register at bootstrap:

| Provider | Env | Notes |
|----------|-----|--------|
| Matomo | `NEXT_PUBLIC_MATOMO_URL` + `SITE_ID` | Self-hosted; purchase uses pseudonymized order id |
| GTM / GA4 dataLayer | `NEXT_PUBLIC_GTM_ID` | Optional; Consent Mode v2 deny-default; purchase uses merchant `display_id` / order id |

Empty env = provider not registered (no-op). Both share analytics consent + GPC. Add a future provider by implementing `AnalyticsProvider` and registering in `providers/bootstrap.ts` — do not call Matomo/GTM APIs from UI.

Public helpers (`trackCustomEvent`, `submitCartSnapshot`, `trackProductImpression`, …) call `emit(...)`.

## Google Consent Mode v2 (GTM)

When `NEXT_PUBLIC_GTM_ID` is set:

1. On boot, push `consent` / `default` with `ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization` **denied**.
2. After cookie analytics opt-in, push `consent` / `update` → **granted**, then load `gtm.js`.
3. On withdraw, push `update` → **denied** again (script may remain; tags respect Consent Mode).

Cookie banner consent is required in addition to Consent Mode — never load trackers without analytics purpose opt-in.

## When to instrument

Instrument in the **same PR** as the feature when you add or change:

- Forms (contact, newsletter, account, custom CMS forms, multi-step wizards)
- Product listing interactions (filters, sort, pagination, impressions/clicks)
- Cart / checkout steps and payment outcomes
- Wishlist, drawers, modals, promotions, search submit
- Auth outcomes (success/failure categories only — no emails)

Skip Matomo for pure layout/CSS. Prefer Medusa `commerceReporting` for server-side order lifecycle totals that must not depend on consent.

## Implementation checklist

1. Client component only (or call from a client child).
2. Import from `@/lib/analytics` and/or `@/context/ConsentContext`.
3. Fire **after** success (or with an allowlisted error code) — never on every keystroke for search (submitted search only).
4. Consent: `useHasAnalyticsConsent()` **or** rely on adapter no-ops when Matomo is disabled/denied.
5. Payload allowlist only: ids, handles used as product refs, quantities, major-unit money, currency, coarse codes, result counts.
6. No email, name, address, phone, free-text answers, JWTs, raw `order_…` / `cus_…` ids (use `hashAnalyticsUserId` / `pseudonymizeOrderId`).
7. Cart changes: `applyCartResult(result, { mutation: "add"|"update"|"remove"|"clear", source: "…" })` after successful server mutation.
8. Purchases: only `PurchaseTracker` on order confirmation (deduped). Never payment-return polling.
9. Catalog lists: pass real `listId` / `listName` into `ProductItem` (or `catalogListIdentity(...)`) — not a hardcoded `product_grid` for every surface.

## Forms

```tsx
"use client";

import { useHasAnalyticsConsent } from "@/context/ConsentContext";
import { trackCustomEvent } from "@/lib/analytics";

export function ExampleForm() {
  const hasAnalytics = useHasAnalyticsConsent();

  async function onSubmit() {
    try {
      await submitAction();
      if (hasAnalytics) {
        trackCustomEvent("Engagement", "contact_form_submit", "contact");
      }
    } catch {
      if (hasAnalytics) {
        trackCustomEvent("Engagement", "form_validation_error", "submit_failed");
      }
    }
  }

  // …
}
```

Patterns:

| Situation | Event |
|-----------|--------|
| Successful submit | `Engagement` / `contact_form_submit` (or `newsletter_subscribe`, `…_form_submit`) |
| Step completed | `Engagement` / `form_step` / step id |
| Validation failure | `Engagement` / `form_validation_error` / error **type** (not message text) |
| Abandoned multi-step (optional) | only with analytics consent; no field values |

## Catalog / cart / checkout helpers

| Need | API |
|------|-----|
| Custom event | `trackCustomEvent(category, action, name?, value?)` |
| Product impression (deduped/session) | `trackProductImpression({ productId, name, listId, listName, … })` |
| Product click | `trackSelectItem({ … })` |
| Cart snapshot | `applyCartResult(..., { mutation, source })` |
| View cart | `submitViewCart(cart)` |
| Begin checkout | `submitBeginCheckout(cart)` |
| Shipping / payment info | `submitAddShippingInfo` / `submitAddPaymentInfo` |
| PDP ecommerce view | `ProductViewTracker` on product page |
| Search | `SearchAnalytics` / `SearchTracker` (submitted query + count) |
| Purchase | `PurchaseTracker` on `/order/confirmed/[id]` |
| Hashed user id | `AnalyticsUserIdSync` (layout) — do not pass raw customer ids |

## GTM / GA4 merchant checklist

Template ships dataLayer ecommerce + Consent Mode. Merchant still configures in GTM:

1. GA4 Configuration tag (reads `user_id` from dataLayer when present).
2. GA4 Event tags for: `view_item`, `view_item_list`, `select_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase`, plus search/filter as needed.
3. Enable Consent Mode in the GA4 / Ads tags.
4. Verify with GTM Preview + GA4 DebugView (funnel view → cart → checkout → purchase).
5. Never hardcode a client’s `GTM-…` id in the template — use `NEXT_PUBLIC_GTM_ID`.

## Naming

- Categories: `Catalog`, `Cart`, `Checkout`, `Wishlist`, `Engagement`
- Actions: `snake_case` verbs (`add_to_cart`, `filter_applied`, `payment_failure`)
- Names: short allowlisted identifiers (`contact`, `card`, provider category) — never PII

## Tests

- Sanitization / mapping / consent parsing → `apps/storefront/src/lib/analytics/*.test.ts`
- Manual: Accept cookies → Network shows `matomo.js` / `matomo.php` (and GTM when configured); Reject/GPC → silent; Consent Mode defaults denied before grant

## Do not

- Import Matomo Tag Manager or cookieless-proxy packages
- Reconstruct denied visitors from server logs into Matomo
- Divide money by 100
- Emit cart events on hydrate / address-only checkout updates (`mutation: "hydrate"|"checkout"` is ignored for ecommerce snapshots)
- Send raw Medusa customer or order ids to GA4/Matomo
