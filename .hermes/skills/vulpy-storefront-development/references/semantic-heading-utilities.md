# Semantic Heading Utilities (added 2026-09-03)

Defined in `@layer utilities` in `apps/storefront/src/app/css/style.css`.

## Utility table

| Class | Expands to | Use on |
|---|---|---|
| `.h1` | Sora font-family, font-light, clamp(26px,3vw,38px), text-content-primary, leading-[1.15], tracking-[-0.015em] | All interior page h1s via Breadcrumb; PDP, PLP, Checkout, error pages |
| `.h2` | font-normal text-3xl xl:text-heading-2 text-content-primary | Section headings (Shop by Category, New Arrivals, etc.) |
| `.h3` | font-medium text-heading-3 text-content-primary | Sub-section headings |
| `.h4` | font-semibold text-heading-4 text-content-primary | Card/carousel headings, FAQ titles, CTA titles |
| `.eyebrow` | font-bold uppercase text-content-secondary text-custom-xs tracking-[0.06em] | Section overline labels ("THIS WEEK'S", "THE COLLECTION") |

**NOTE on `.eyebrow`:** uses `uppercase` directly, NOT `@apply text-caps`. `.text-caps`
is defined in `@layer components` — cross-layer `@apply` in `@layer utilities` throws
`CssSyntaxError` in Tailwind v4. See `references/tailwind-v4-apply-pitfalls.md`.

**NOTE on `.h1`:** uses raw `font-family: var(--font-sora)` directly, NOT `@apply font-heading`.
`font-heading` is derived from `@theme` and can't be `@apply`'d inside `@layer utilities`.

## Scope rules

- **Marketing/homepage components:** always use `.h2`, `.h4`, `.eyebrow` — never repeat
  `font-normal text-3xl text-content-primary xl:text-heading-2` inline.
- **Commerce components** (checkout, cart, account, PDP): use `.h1` for page-level h1s;
  sub-headings can use inline classes since they're structural UI, not repeated section headers.
- **CategoryRegister hero:** keep its custom `clamp(40px,5vw,64px)` — deliberate marketing
  display size, not the standard interior page `.h1`.

## Sweep coverage (verified 2026-09-03)

Applied to: `ProductCarousel` (all 4 header layouts), `Categories`, `Testimonials`,
`Newsletter`, `BlocksRenderer` (richText editorial, FAQ, CTA, contactInfo), `MediaWithTextBlock`,
`Breadcrumb` (all CMS interior pages), `ProductDetails` (PDP h1), `ShopWithSidebar` (PLP h1),
`Checkout/CheckoutLayout`, `PaymentReturnClient`, `PaymentReturnPoller`, `OrderConfirmedView`,
error/not-found/global-error pages.

## Brand inverse-weight hierarchy (non-negotiable)

| Level | Font | Weight | Size | Class |
|---|---|---|---|---|
| h1 (page) | Sora | 320 (light) | clamp(26–38px) | `.h1` |
| h2 (section) | Manrope | 400 (normal) | 30px/32px | `.h2` |
| h3 (sub-section) | Manrope | 500 (medium) | 28px | `.h3` |
| h4 (card/carousel) | Manrope | 600 (semibold) | 24px | `.h4` |
| eyebrow | Manrope | 700 (bold) + uppercase | 12px | `.eyebrow` |
| body | Manrope | 450 (regular) | 16px | default |
| button | Manrope | 800 (button) | 14px | `font-button` |

Larger text = lighter weight. This is intentional brand design — do NOT normalise headings to bold.
