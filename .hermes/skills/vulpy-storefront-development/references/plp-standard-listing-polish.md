# Standard PLP polish + dual-persona card CTAs (WS2 recipe, verified 2026-08-11)

Source of truth: `.design-specs/plp-mockup.html` (standard PLP) — filter sidebar,
sort toolbar, active-filter chips, square pager. Shared foundation modules
(pre-created by the coordinator; **never edit `i18n/en.ts` for persona copy**):
`src/i18n/quotation.ts` (`addToQuotation`, `addingToQuotation`, `guestTradeNote`,
re-exports `storefrontEn`) + `src/lib/medusa/persona.ts`
`getAddActionLabel({ canSeePrices, inStock, pending })`.

## Mockup `:root` → generated-token mapping

Read mockup CSS vars against `src/app/css/tokens.generated.css`; never hardcode hex.

| Mockup var | Value | Tailwind token |
|---|---|---|
| `--ink` / `--text` | #1c1c1c | `content-primary` (same value as `action-primary-background`) |
| `--text-2` | #575757 | `content-secondary` |
| `--text-3` | #838383 | `content-muted` |
| `--border` | #e5e5e5 | `border-subtle` |
| `--border-strong` | #d9d7d2 | `border-strong` |
| `--subtle` | #f7f7f7 | ≈ `surface-muted` (#fafafa) — closest token |
| `--hairline` | #ececec | `header-border` / `border-subtle` |

Radius: every design radius token is 0, so `rounded-lg`/`rounded-md`/
`rounded-control`/`rounded-badge` render SQUARE — never add `rounded-none` for a
"square" look; only `rounded-full` (pill, 999px) is circular.

## Persona CTA on cards + quick view

- **ProductItem:** always render the add button (was `canSeePrices ? … : null`
  so guests saw no action bar). Label:
  `getAddActionLabel({ canSeePrices, inStock, pending: pending || isPending })`.
  Keep the same `handleAddToCart` optimistic-cart flow — a guest's "quotation"
  IS the cart (header bag icon already labelled "Quotation").
- **QuickViewModal:** same call with `{ canSeePrices, inStock: variantInStock,
  pending: isPending }`; its CTA was also guest-hidden — make it visible. While
  touching the button, `font-semibold` → `font-bold` (only the store's loaded font
  weights are available — e.g. a 300/400/700/900-only family renders 600 as 400;
  check the `next/font/google` config in `src/app/(site)/layout.tsx`).
- Keep `LoginToSeePrice` (guest price row) and wishlist buttons unchanged for
  both personas.

## Toolbar / chips / sidebar / pager recipes

- **Toolbar:** replace the card+shadow wrapper with a hairline row
  `mb-6 border-b border-border-subtle py-4`. Left result line
  `text-[13px] tracking-[0.03em] text-content-muted`:
  `{totalCount} design{s} · handcrafted in Britain` (keep the pending "…"
  indicator). Right = existing sort `CustomSelect` (`md:order-3`); grid/list
  toggles `md:order-2` (kept — not in mockup but existing functionality).
- **Chips row** (new, only when `hasActiveFilters`):
  `-mt-2.5 mb-6 flex flex-wrap gap-2` — the negative top margin reproduces the
  mockup's chips sitting ~16px under the toolbar. Chip:
  `inline-flex items-center gap-2 border border-content-primary bg-white px-3 py-1.5
  text-[12px] font-bold tracking-[0.1em] uppercase text-content-primary
  hover:bg-surface-muted` + `<span className="text-[11px] leading-none">✕</span>`.
  "Clear all" chip is the muted variant (`border-border-subtle text-content-muted
  hover:border-content-primary hover:text-content-primary`).
  Per-filter removal goes through `updateFilters` (so `emitFilterDiff` analytics
  still fire): category/size/color filter by id/value, `saleOnly: false`, price →
  `defaultFilters.priceMin/Max`, attributes filter the one value out of
  `attributes[key]`. Labels: `Category: <name>` (id→name via `facets.categories`),
  `Size: <v>`, `Color: <v>`, `Sale`, `Price: <symbol><min> – <symbol><max>`
  (`getCurrencySymbol(useStoreCurrency())`), `<getAttributeFilterLabel(key)>: <v>`.
- **Sidebar headers:** caps 11px labels — `text-[11px] font-bold tracking-[0.14em]
  uppercase text-content-primary` (matches the `.text-caps` utility); "Clear all"
  muted caps `tracking-[0.1em]`; facet counts muted. Replace `font-semibold` on
  dropdown headers (Category/Size/Price/AttributeFilter) with the caps label.
- **Pager:** `mt-14 flex flex-wrap items-center justify-center gap-2` (mt-14 =
  mockup 56px). Number buttons: `min-w-11 h-11 border border-border-subtle bg-white
  text-[13px] text-content-secondary hover:border-content-primary
  hover:text-content-primary`; active =
  `border-content-primary bg-action-primary-background text-white`. Prev/next are
  TEXT buttons `px-[18px] text-[11px] font-bold tracking-[0.12em] uppercase`
  ("← Prev" / "Next →"), always rendered with a disabled state at the ends
  (`opacity-40 cursor-default` span, `aria-disabled`).

## Verification (WS2-style gates)

```bash
corepack pnpm --filter @apps/storefront typecheck
corepack pnpm --filter @apps/storefront exec vitest run src/lib/medusa/persona.test.ts
npx biome check --write apps/storefront/src/components/Common/ProductItem.tsx \
  apps/storefront/src/components/Common/QuickViewModal.tsx \
  apps/storefront/src/components/ShopWithSidebar
corepack pnpm --filter @apps/storefront typecheck   # re-run after biome
corepack pnpm --filter @apps/storefront test
```

- Grep every touched file for `font-medium|font-semibold` — must be 0 hits (the
  store's font family may only load 300/400/700/900 — a 600 semibold request silently
  renders as 400; use `font-bold`).
- Grep for duplicate `className` props after patching (biome `noDuplicateJsxProps`).
- In a parallel-dispatch batch, typecheck failures in another workstream's files
  are transient — verify ownership via `git status --short`, don't touch, re-run
  after the batch lands (see `dispatching-parallel-agents` skill).
