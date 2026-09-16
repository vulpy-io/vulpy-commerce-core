# Persona-gated money & labels — PRICE_GATE_MODE, quote persona & quote request (shipped)

Updated for the shipped mechanism (Tasks 4/5, Aug 2026): the legacy single boolean
(`REQUIRE_LOGIN_FOR_PRICES`) was replaced by **`PRICE_GATE_MODE`** with three modes —
`off` (prices public, default), `login` (guests see "Login to see price"), `quote`
(guests get the **quotation persona**: "Add to quotation", quotation bag, "Request a
Quote" / "Submit quote request" → creates a Medusa **draft order**). This is a
template-level feature now, not a Hector Finch demo quirk.

## The persona switch

`usePricePersona()` from `@/context/AuthContext` → `"public" | "login" | "quote"`
(logged-in customers are always `public`). `useCanSeePrices()` = `usePricePersona() ===
"public"`. Mode comes from `apps/storefront/src/config.ts` `priceGateMode`
(`next.config.mjs` exposes `PRICE_GATE_MODE`, default `"off"`; env in
`apps/storefront/.env` and root `.env` — app `.env` wins under the turbo dev stack).

Components MVP the hook:
- `ProductItem.tsx` / `QuickViewModal.tsx`: `usePricePersona()`; CTA via
  `getAddActionLabel({ canSeePrices, inStock, pending })` and `resolveAddCta(...)` from
  `lib/medusa/persona.ts` (add_to_cart / add_to_quotation / login) + i18n in
  `i18n/quotation.ts` (`addToQuotation`, `requestAQuote`, `submitQuoteRequest`) — never
  `i18n/en.ts` for persona copy.
- `LoginToSeePrice` (`components/Product/LoginToSeePrice.tsx`) renders the guest price
  row (login/quote personas), `GatedAmount` (`components/Product/GatedAmount.tsx`)
  hides amounts for guests.

## The quote request flow (real, not a stub)

- Guests add products to the cart (the cart doubles as the **quotation bag**; header bag
  already labels it "Quotation" in quote mode).
- Checkout CTA for guests = "Request a Quote"; checkout submit = "Submit quote request".
- `submitQuoteRequestAction(cartId)` (`src/app/actions/submit-quote-request.ts`, a server
  action) POSTs `{ cart_id }` to the backend store route `POST /store/quote/orders`
  (`apps/medusa-backend/src/api/store/quote/orders/route.ts`, env-gated to
  `PRICE_GATE_MODE=quote`). The backend runs `createQuotationDraftOrderWorkflow`, creates
  a **draft order tagged as a quotation**, and consumes the cart; the storefront clears
  the cart cookie on success and returns `{ ok: true, draftOrderId }`.
- Guests never talk to the Medusa admin draft-orders API directly — the store route is
  the only door (publishable key carries sales-channel scope).
- Verification (Playwright, guest + trade):

**Guest (fresh context, no cookies):**
- PDP/cards: no "Login to see price" money rows, no "Subtotal"/"Total" text on cart,
  drawer, or checkout.
- Drawer: add item → CTA reads "Request a Quote", no "Checkout"; cart page CTA
  "Request a Quote"; checkout `h1` = "Request a Quote".
- Submit quote request with a non-empty cart → success + quotation bag resets
  (`draftOrderId` present in the response; cart cookie cleared).

**Trade (create a real session):**
- Sign up via `/signup` (inputs First name, Last name, Email, Password; submit = button
  text "Create account" — the HEADER search button is ALSO `type="submit"`, don't target
  `button[type=submit]`). Success → redirect `/my-account`.
- Then: PDP shows real prices, drawer shows "Subtotal" + "Checkout", no "Request a Quote".

## Playwright traps that cost cycles

- **`.modal-content` is shared by QuickViewModal AND CartSidebarModal.** When both
  are open, `page.locator('.modal-content')` resolves to 2 elements → strict-mode
  violation. Read the drawer as the LAST modal:
  `document.querySelectorAll('.modal-content')[modals.length - 1]`.
- **Multi-variant cards open QUICK VIEW on "Add to quotation/cart"**, not the drawer.
  The add flow is: hover card → click add → quick view opens → click a finish chip →
  click add inside the modal → drawer opens. Single-variant products add directly.
- **Hooks-scope trap:** when a persona helper (`usePricePersona`, `useCanSeePrices`) is
  consumed in MULTIPLE components, each component body needs its own hook call. The LSP
  diagnostic block after a multi-file edit batch is computed against an intermediate
  state — trust the final `typecheck`, not the per-edit diagnostics.
- **Escaped-class selectors in the browser throw** — `closest('.aspect-\\[6\\/7\\]')`
  fails with "not a valid selector". Navigate parents instead:
  `badge.parentElement.parentElement.querySelector('img')`.

## Badge restyle (square, recolored, over PDP image) — design-token driven

Design spec (from the design mockups / shared badge components in-tree):
- Typography (shared by all badges): `rounded-none px-[9px] py-[5px] font-bold
  text-[10px] uppercase tracking-[0.14em]`
- **New** (`ProductStoreTagBadges.tsx`, match by `tag.label.toLowerCase()`):
  `bg-white text-content-primary border border-border-subtle` (style prop must be
  `undefined` for design-mapped tags — inline backgroundColor would override)
- **Bestseller**: `bg-action-primary-background text-white`
- **Sale** (`ProductSaleBadge.tsx`): `bg-commerce-sale` white text, label `−{percent}%`;
  `getDiscountPercent` from `@/lib/medusa/stock`
- Sale badge is UNGATED for guests (designs show it in guest view): on cards drop the
  `canSeePrices &&` from the badge container condition; on the PDP use the variant
  display product comparison (`displayProduct.discountedPrice < displayProduct.price`).
  `ProductDetail` has NO `minPrice`/`maxPrice` — don't reuse the ProductItem pattern
  there; the variant display-product comparison is the type-safe check.