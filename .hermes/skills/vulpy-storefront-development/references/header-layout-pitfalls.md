# Header-height math, layout alignment & Tailwind pitfalls

Compiled from the Aug 2026 storefront polish rounds. These are recurring failure modes on
this codebase — check them BEFORE claiming a layout change is done.

## 1. Fixed-header clearance: `--header-height` is the single source of truth (current mechanism)

The header is `position: fixed`. Since the Task-6 refactor, its height is measured and
published once as the CSS custom property **`--header-height`** on the document root
(`apps/storefront/src/lib/header-height.ts` + `components/Common/HeaderHeightSync.tsx` —
`applyHeaderHeight` writes `header.getBoundingClientRect().height`, kept in sync by a
`ResizeObserver`). Content below the header must reference the var, NOT hand-tuned px
padding:

- `:root { --header-height: 62px; }` default in `style.css` `@layer base` guards the
  pre-hydration / no-JS / SSR frame — `HeaderHeightSync` overwrites it once hydrated.
- `html { scroll-padding-top: var(--header-height); }` — anchor jumps land below the
  header.
- Tuned sites all use `var(--header-height)` today: `Breadcrumb.tsx`
  (`pt-[var(--header-height)]`), `Home/Hero/index.tsx` (`pt-[var(--header-height)]`),
  `Header/MobileMenu.tsx` (`top-[var(--header-height)]`), `ShopWithSidebar/index.tsx`
  (sticky filter row + floating mobile button `top-[var(--header-height)]`),
  `CategoryRegister/index.tsx` (sticky rail `top-[calc(var(--header-height)+48px)]`).

**When you change the header, do NOT start tuning paddings.** The measured var tracks
header structure (utility strip, sticky shrink, desktop nav bar appearing at `xl`)
automatically. If a page still uses a hardcoded px offset for header clearance, that is
the bug — switch it to `var(--header-height)` rather than re-measuring. Verify with
`browser_console` + `getBoundingClientRect`: content should clear the header bottom
exactly, and `--header-height` on the root should equal the rendered `<header>` height
per breakpoint. (Historical note: before Task 6, every breakpoint pair was hand-tuned —
`pt-[80px] lg:pt-[124px]` for heroes, `mt-[72px] lg:mt-[124px]` for first-block banners,
`top-[70px]` drawers — and every header change required a per-breakpoint delta sweep of
all of them. That failure mode is superseded by the var.)

## 2. Swiper pagination: mirror the container, don't eyeball offsets

`.container` = `margin-inline:auto; padding-inline:15px; max-width:1300px` (style.css
`@utility container`). Align the hero pagination to it EXACTLY:

```css
.hero-carousel-full .swiper-pagination {
  @apply bottom-8 left-1/2 flex w-full max-w-[1300px] -translate-x-1/2 justify-start px-[15px];
}
.hero-carousel-full .swiper-pagination-bullet {
  @apply h-0.5 w-7 rounded-none bg-white/40 opacity-100 transition-colors duration-200 first:ml-0;
}
```

Pitfalls:
- Swiper bullets have a baked-in `margin: 0 4px` → the FIRST bullet sits 4px right of the
  container edge. Zero it with `first:ml-0` on the bullet rule.
- Arbitrary `pl-6 sm:pl-12 xl:pl-16` offsets drift from the content column at other
  viewports. Center the pagination element the same way the container is centered.

## 3. Hero arrows: never use ‹ › text glyphs; SVG chevrons only

`‹`/`›` at `text-3xl` have asymmetric font metrics — they render visibly off-center even
inside `flex items-center justify-center` boxes. Use the site's chevron path (the nav
dropdown chevron, 16 viewBox) rendered as an SVG (left = `rotate-90`, right = `-rotate-90`)
at ~20px in the 44px box. Verify with `getBoundingClientRect`: icon center must equal box
center (offset 0/0).

If the user says "it was at the right position before", check `git diff` / `git show
HEAD:` on the CSS — a prior uncommitted session may have drifted the position (e.g. hero
arrows were `bottom-7` at HEAD, moved to `top-1/2` by an earlier edit). Restore from HEAD,
then apply the icon fix on top. The arrows live at `bottom-7` (28px, 4px below the dots'
`bottom-8`) with `hidden sm:flex` — hidden on mobile, visible from sm up.

## 4. Equal-height controls: the border-box trap

Tailwind `h-12` = 48px INCLUDING border. But a flex container with no explicit height whose
children are `h-12` measures `48 + 2*border` = 50px. Mixed controls (qty stepper vs CTA vs
icon button) then differ by 2px.

Fix pattern (ProductQuantityStepper): put the height on the CONTAINER
(`flex h-12 items-center ... border border-gray-3`), make children `h-full` instead of
`h-12`. Border-box then includes the border for everyone. Re-measure ALL three controls
afterwards — don't trust the class math.

## 5. Tailwind: never stack two same-property size utilities

`text-custom-xs` in a shared base string + `text-custom-sm` appended in a branch = both
single-class utilities with equal specificity. The winner is whichever appears LATER in the
generated stylesheet, NOT the later class in the attribute — unpredictable. Make size
classes exclusive per variant (base has no size; each branch adds exactly one).

Also check COMPONENT-LAYER classes for baked-in properties before claiming a fix:
`.dropdown { @apply ... mt-2 lg:mt-0 ... }` in `style.css` — removing a Tailwind `mt-2`
utility did nothing because the `.dropdown` component class still supplied the margin.
Override explicitly (`mt-0`) and measure computed `marginTop`, not just height.

The same `.dropdown` class ALSO bakes in `py-2.5` — after zeroing the margin the gap
persisted because the collapsed grid still rendered 20px of padding. Lesson: when a
component class is fighting you, audit ALL its layout properties (margin AND padding AND
border), not just the one you noticed. Mobile overrides for `.dropdown` ended up as
`static mt-0 grid py-0 border-0 bg-transparent shadow-none`.

## 6. Card hover actions: equal boxes AND balanced icon sizes

Quick view + favourites on product cards must share box size (44×44) AND optically balanced
icons (~20px each). A 16px eye next to a 24px bookmark in equal boxes still looks broken.
WishlistButton's `card` variant passes `size={20}` to the bookmark icon; the quick-view eye
renders 20px.

## 7. Header iconography

- Stroke icons: `fill="none" stroke="currentColor" stroke-width="1.6"`, 22px in header,
  24px on PDP/buttons, 20px in card variants.
- Favourites = BOOKMARK `M6 3.5h12V21l-6-4-6 4V3.5Z`. Active state fills DARK GRAY
  (`fill-content-muted stroke-content-muted`, #838383) — never black (too attention-pulling).
- **Cart icon = shopping cart with wheels, NOT a bag.** Explicit operator decision (Sep 2026).
  The quotation/bag icon was HF-specific; the Vulpy Commerce template uses a proper cart.
- Cart/bag counter: render ONLY when `itemCount > 0` (an empty "0" badge is noise).
- Search icon is visible on ALL breakpoints (mobile header: logo + search + favourites +
  cart + burger).

**Two-bar layout (Sep 2026):** Header restructured into Row 1 (utility strip,
`bg-footer-background`, desktop-only) + Row 2 (main nav: logo 135px + nav strip + icons).
Active indicator changed from orange dot to 2px underline (`bg-content-primary`).
See `references/navbar-two-bar-dispatch.md` for full architecture and CMS field additions.

## 8. Favourites rename (applied Aug 2026)

Visible strings say "Favourites" (British spelling). Route stays `/wishlist`; redux slice,
component names, and Matomo event names (`Wishlist`/`add_to_wishlist`) stay as-is to
preserve analytics continuity. CMS fallback strings in `lib/cms/defaults.ts` were renamed;
the live Payload nav has no wishlist/favourites item.

## 9. Burger drawer (mobile menu) rules

- `top-[var(--header-height)]` (current) must equal the header's exact rendered height;
  drawer padding mirrors the navbar (`px-[15px]`, top padding = nav `gap-5` = 20px).
- Search/call-us were removed from the drawer; search lives in the navbar icon (opening it
  must also `setNavigationOpen(false)`).
- Sale pseudo-category link removed from drawer.
- Caret items: same font/treatment as plain items (`text-custom-sm` on mobile);
  caret rotates 180° when open; submenu animates via `grid-rows-[0fr]→[1fr]` +
  `transition-[grid-template-rows]` with a single `min-h-0 overflow-hidden` wrapper child;
  the `mt-2` spacing lives on the INNER list so closed items leave no gap (see §5 for the
  `.dropdown` mt-2 trap).

## 10. Search overlay

- Suggestion click + "Show all results" must close the overlay (`onNavigate` callback on
  `ProductSearchTypeahead`; wrap `onShowAll`).
- Mobile: suggestions must span the FULL form width (select + input). The input needs
  `min-w-0 flex-1` on mobile (fixed 333px overflows next to the 200px select), and the
  dropdown uses `left-[calc(-1*var(--search-overlay-select-width,200px))]
  w-[calc(100%+var(--search-overlay-select-width,200px))] sm:left-0 sm:w-full` with the var
  set on the form. Desktop (≥sm) stays `left-0 w-full`.

## 11. Verify layout by DOM measurement, not screenshots

The vision/screenshot path can be unavailable (model without image support). The reliable
verification loop is: `browser_console` + `getBoundingClientRect` comparing real geometry
(header bottom vs content top, icon center vs box center, margins + heights — remember
margins are OUTSIDE `getBoundingClientRect().height`). Always measure computed
`marginTop` when a gap looks wrong.

TRAP: `getBoundingClientRect` returns **0 for every element inside a `display:none`
subtree** (e.g. `xl:hidden` drawers at desktop viewport). Computed styles via
`getComputedStyle` still report real values there, but rects lie — a "0px" measurement of
a hidden drawer proves nothing. Verify hidden-subtree layout either by forcing the
viewport to a breakpoint where it's visible, or by reading computed properties
(font-size, margin, padding) rather than rects.

## 12. Drawer outside-click vs toggle button: mousedown/click race

A drawer that closes on outside `mousedown` (document listener) AND has a toggle button
with `onClick` double-fires: mousedown closes the drawer, React re-renders, then the
button's click handler toggles against the ALREADY-CLOSED state and reopens it instantly.
The close button appears dead. Fix: exclude the toggle button from the outside-click
handler — `!target?.closest(".sidebar-content") && !target?.closest('[aria-label="Close
filters"], [aria-label="Open filters"]')`. Same pattern applies to any outside-click
overlay whose own control is outside the guarded region.

## 13. Removing a hero slide (Payload REST, not DB)

Hero slides are Payload content — never touch the DB directly (Payload-only write path).
Recipe (verified): login `POST {url}/api/users/login` with the seed user from
`apps/storefront/.env` → `GET /api/pages/{id}?depth=0` → find the
`blockType: "hero"` block → filter `slides` by title → `PATCH /api/pages/{id}` with the
full `blocks` array minus the slide. URL-encode the `where` filter brackets when querying
by slug (`where%5Bslug%5D%5Bequals%5D=home`). Re-verify with a GET afterwards; a PATCH
response with empty arrays usually means your response parser read the wrong shape, not
that the write failed.

## 14. Mobile verification when the browser viewport can't be resized

The WebUI browser session is stuck at ~1280px and the vision model may reject images —
so Tailwind breakpoint changes (`lg:` etc.) can't be verified by screenshot. Ground
truth: drive a local headless Chromium over CDP and read computed styles / geometry at a
real mobile width.

Launch once per session (reuse the instance — VPS memory rule: heavy tools SERIAL):

```
/app/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
  --headless=new --no-sandbox --disable-gpu \
  --remote-debugging-port=9222 --window-size=390,844 --force-device-scale-factor=1 \
  about:blank
```

Then evaluate via the CDP HTTP/websocket (`/json` + Runtime.evaluate) — or any local
Playwright script — at `window-size=390,844` and at ≥1024px. Key verification patterns:
- `getComputedStyle(el).display / order / paddingLeft` — the truth for `hidden lg:flex`
  swaps, flex-order reordering, and padding fixes; sample at 390px (mobile) AND at
  ≥1024px (desktop) to confirm both breakpoints.
- Measure `header.getBoundingClientRect()` at y=0/150/400 to prove a fixed header is
  immovable before blaming scroll code.
- Confirm `--header-height` on the root tracks the LIVE header measurement
  (`getComputedStyle(document.documentElement).getPropertyValue('--header-height')`).

## 15. Fixed header "moves up" on mobile scroll = Android URL-bar collapse

A `fixed top-0` header that provably never moves at any scrollY in headless but visibly
slides up on a real phone is the Android Chrome URL-bar collapse (fixed elements are
anchored to the layout viewport, which shifts when the bar hides; iOS anchors to the
visual viewport and does not move). It shows up on pages with tap-to-smooth-scroll
(register rail `scrollIntoView`) because that's where the user watches while scrolling —
"this page only" reports usually mean "the only page where I scroll programmatically".

Fix: `interactiveWidget: "resizes-content"` in the Next.js `viewport` export
(`(site)/layout.tsx`) — fixed elements stay anchored while the bar collapses. It is a
global meta change but invisible on desktop/iOS. Do NOT chase per-page scroll code for
this symptom.