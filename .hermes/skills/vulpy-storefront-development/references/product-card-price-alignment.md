# Product-card price bottom alignment (PLP rows)

Goal: prices across a row of cards share one baseline even when a title wraps to 2 lines
(one 2-line title must not drag its price lower than the rest of the row).

## Working pattern (`components/Common/ProductItem.tsx`)

1. Card root `<article>`: `flex h-full flex-col` — grid items stretch by default, so all
   cards in a row get equal height.
2. Wrap the title `<h3>` **and** the finish swatches in a plain
   `<div className="grow">` — the wrapper absorbs leftover vertical space and pushes
   the price block down.
3. Price block keeps `mt-auto` on the card root (it already renders as `flex flex-col gap-1`).

Shared by PLP grid (`ShopWithSidebar`/`SingleGridItem`), category register, and carousels —
the fix lives in the shared card, not per-surface.

## Pitfalls

- **New Tailwind utility classes appear inert after edit (Turbopack + TW4 stale CSS).**
  When a class like `grow` is added to a TSX file, the JS recompiles but the compiled CSS
  chunk is NOT regenerated — Turbopack's content-hash cache is keyed on the CSS file only,
  and a dev restart or `touch` is not enough. The rendered element has the class but
  computes `flex-grow: 0`. Fix: make a REAL content edit to
  `apps/storefront/src/app/css/style.css` (e.g. append a comment) to force the Tailwind
  rescan; verify the rule (`.grow { flex-grow: 1; }`) appears in the served CSS chunk.
  If you suspect it, check the CSS chunk for the rule before assuming the utility is
  invalid — `grow` IS a valid core utility and works fine once the cache is busted.
- **PLP price-position verification requires a logged-in customer session.** Hector Finch
  runs `REQUIRE_LOGIN_FOR_PRICES` (B2B price gating), so anonymous DOM checks of price
  layout are meaningless — prices aren't rendered. Either sign in first (register a throwaway
  customer via the storefront signup) or hand the test to the user.
- **Scope discipline.** When the user scopes a fix to "plp", do NOT drift to carousels,
  homepage rows, or PDP "You may also like" — they may share `ProductItem`, but the user
  asked for one surface. When verification is needed, ask the user to test ("just ask me to
  test when needed") instead of burning turns on browser login/measure loops.
