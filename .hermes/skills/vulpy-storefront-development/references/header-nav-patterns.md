# Header / Navigation Rebuild Patterns

Design standards for the two-bar header + flyout nav system (verified on 2026-09-03).

## Worktree base trap (verified 2026-09-11)

`git worktree add <wt> origin/main` uses the STALE remote ref. If local `main` is ahead of `origin/main` (unpushed commits — we found 154 local-only commits covering the whole storefront rework), the worktree silently lacks newer files (e.g. `MobileMenu.test.tsx`, the `.h2` utility, 3-level nav) and a dispatched coder gets confused ("why doesn't `.h2` exist?"). Always base worktrees on local `main` (`git worktree add <wt> -b <branch> main`), and verify expected files exist in the WT before dispatching.

## Two-bar layout structure

```
Row 1 — Top utility strip:  bg-footer-background, hidden lg:block, py-2 text-2xs uppercase tracking-[0.1em]
    Left:  tagline from siteSettings.topBarText
    Right: links from siteSettings.topBarLinks[]
Row 2 — Main nav bar:  bg-white border-b border-header-border, py-3 lg:py-4
    Left:  Payload logo image,  w-[98px] lg:w-[135px]
    Center:  nav links,   xl:block, hidden below xl
    Right:  icon cluster,   gap-1.5 lg:gap-2.5
```

## Icon standards

All icons in the header cluster must be the **same family**: 22px, `fill="none"`, `stroke="currentColor"`, `strokeWidth="1.6"`.

| Icon | SVG path | Notes |
|------|----------|-------|
| Search | `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5" stroke-linecap="round"/>` | Centered at 11,11 not 10.5,10.5 |
| Account | `<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/>` | Stroke-only, not filled |
| Wishlist | `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>` | Outline heart, **never** bookmark |
| Cart | `<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 3h2l.4 2M7 13h10l3-8H6.4"/>` | Must have wheels (2 circles), **never** a bag icon |

Desktop buttons: `lg:h-9 lg:w-9` (36px). Mobile: keep `h-10 w-10` (40px touch targets).

## Active indicator

**Never the orange dot** for main-nav links. Use a **2px underline** in `bg-content-primary`:
- Clickable `NavActiveIndicator` with `variant="underline"` — `absolute inset-x-0 bottom-0 h-0.5 bg-content-primary`
- Orange dot (`variant="dot"`) is for 2nd-level sub-items **inside the first dropdown panel** ONLY
- **3rd-level flyout items (grandchildren) get NO dot and NO indicator** (operator correction 2026-09-03: dots next to 3rd-level cats were wrong) — plain text links in the nested panel
- A 2nd-level parent that has 3rd-level children shows the **right-pointing caret** (`RightChevronIcon`) instead of a dot — that's the "there's more" affordance

## Hover behavior (operator correction 2026-09-03)

**Nav text links must NOT change color on hover** — the underline reveal is the only hover feedback:
- Desktop NavBar links: no `hover:text-*` class (they had none — keep it that way)
- Top bar utility links (Blog/Contact): `className="duration-200 ease-out"` — no `hover:text-content-primary`
- Mobile menu text links (sale, wishlist, account): no `hover:text-content-brand`
- **Exception — icon buttons keep their hover:** search / account / favourites / cart keep `hover:text-content-muted` (operator: "except for the button of course")
- Dropdown submenu items keep `hover:bg-gray-1` (panel background, not color)

## HF EU demo box runs OUR template

`dev.hectorfinch.eu.ecom.demojar.com` (operator: "hf-shop") runs the SAME storefront template, not a separate site. Inspecting its DOM/header = inspecting our own components with HF-seeded content. Use it as a live reference for what the two-bar layout looks like with real catalog data, but the code that renders it lives in `apps/storefront/src/components/Header/`.

## Typography

- Nav links (top level, FINAL approved 2026-09-03): `font-semibold text-caps text-content-primary text-custom-xs` — i.e. semibold 12px, `uppercase tracking-[0.14em]`. (Earlier that day the operator first asked for bold 13px, then corrected to semibold 12px — semibold 12px is the durable value; do not regress to bold/13px.)
- Top utility bar (FINAL approved 2026-09-03): `font-semibold text-[11px] uppercase tracking-[0.08em]` — semibold 11px, 0.08em tracking. (Original port used `text-2xs tracking-[0.1em]`; corrected.)
- Top bar right links: `Blog` (`/blog`) + `Contact` (`/contact`) — NOT "Our Story". Seed defaults in `lib/cms/defaults.ts`; keep tests in sync (`TopBar.utility-strip.test.tsx`, `defaults.test.ts`).
- Apply nav typography consistently to: desktop NavBar links, desktop Dropdown triggers, mobile Menu top-level links, Sale link, mobile Wishlist link
- Submenu items (2nd/3rd level): keep existing `text-custom-sm` / normal weight — do not change

## Logo from Payload

```tsx
import { headerLogoUrl, isSvgLogo, HEADER_LOGO_WIDTH, HEADER_LOGO_HEIGHT } from "@/lib/site-logo";
const logoSrc = headerLogoUrl(siteSettings.logoUrl);
<Image
  alt={siteSettings.siteName}
  className="h-auto w-[98px] lg:w-[135px]"
  height={HEADER_LOGO_HEIGHT}
  src={logoSrc}
  unoptimized={isSvgLogo(logoSrc)}
  width={HEADER_LOGO_WIDTH}
/>
```

## Adding a new CMS header field (site-settings)

Follow the five-file pattern from `references/cms-sitesettings-field-pattern.md`:
1. `lib/cms/types.ts` — add to `CmsSiteSettings`
2. `globals/index.ts` — add Payload field
3. `lib/cms/defaults.ts` — add to `defaultSiteSettings`
4. `lib/cms/queries.ts` — add to `mapSiteSettings()`
5. `lib/cms/defaults.test.ts` — add test assertion

## 3rd-level nav (implemented 2026-09-03, shipped as recursive MEDUSA tree)

3rd level is implemented and shipped. Key decisions (some are corrections of what
the first implementation got wrong):

- Medusa `collectSubmenuItems` is now **recursive** — grandchildren render as real
  nested `submenu` items (no more `"Child › Grandchild"` flat labels).
- `Dropdown.tsx` renders nested submenus via a `SubmenuItem` component; desktop
  flyout = `div.group/sub.relative` wrapper with the nested `<ul class="dropdown dropdown-nested">`
  as a **sibling of the Link** (see hydration pitfall below); mobile = accordion
  rows with `static flex-col pl-4` + their own toggle state.
- `.dropdown-nested` CSS: `xl:absolute xl:left-full xl:top-0`, revealed via
  `xl:group-hover/sub:opacity-100 xl:group-hover/sub:visible`.
- **ALWAYS-OPEN flyout bug (found 2026-09-03):** `.dropdown-nested` ALSO carries the
  base `.dropdown` class, whose own `xl:group-hover:opacity-100 xl:group-hover:visible`
  (hover ANY top-level group) makes the nested panel visible whenever a top-level
  item is hovered. Fix: `.dropdown-nested` must explicitly re-hide on the base
  group and only reveal on the sub group:
  `@apply ... xl:group-hover:opacity-0 xl:group-hover:invisible xl:group-hover/sub:opacity-100 xl:group-hover/sub:visible`.
  Verify compiled CSS with grep on the served style chunk — Tailwind `@apply` of
  nested group variants silently no-ops if the variant isn't generated.
- **DO NOT make the CMS nav field recursive** (attempted, REVERTED): a nested
  array field also named `submenu` breaks Payload's schema generation with
  `Error: There are multiple relations with name "submenu" in table
  "navigation_items_submenu"` — every `getNavigation` call fails and the nav
  silently falls back to defaults. CMS nav stays **single-level** (`navSubmenuItemFields`
  in `linkFields.ts`); deeper trees come ONLY from the Medusa category merge
  (which is also where the demo 3rd level lives). The recursive `Menu` TS type +
  `mapNavItem` pass-through are fine — only the Payload field must stay shallow.
- Active state on parents must be a **recursive descendant check** (`isPathActive`
  walks the whole submenu tree) — a top-level trigger shows its underline when ANY
  descendant path matches.
- Demo seed: grandchildren live under one child (Paperweights → Desk/Cabinet
  Paperweights), each needs at least one product or `categoryHasProducts` hides it
  (`DEMO_PRODUCT_EXTRA_CATEGORY_HANDLES` maps products → extra category handles).
- **Every Medusa category needs `metadata.image_url`** or its tile/thumb renders
  blank (found 2026-09-03: `levitating-objects` parent had NO image metadata at all
  — only children did). Add `imageFile` to `DEMO_PARENT_CATEGORY` and emit
  `image_url: \`/images/products/demo/${imageFile}\`` in the seed's metadata for
  parent + children + grandchildren. Verify with psql
  (`SELECT handle, metadata->>'image_url' FROM product_category` — all 9 rows set).
- **2nd-level category that has 3rd-level children must NOT get an editorial
  block above subcategories** (operator correction 2026-09-03): it should render
  the grandchild thumbs directly. In `seed-editorial.ts`, paperweights gets
  `blocksAboveSubcategories: []` (guard the `configured` check: empty above =
  configured for it, `mediaWithText` for the rest) and guard the image assignment
  with `if (aboveBlock[0])` — the seed crashes with
  `Cannot set properties of undefined (setting 'image')` on empty arrays.
- Mobile accordion: expand 3rd-level with indent (`pl-4` per level), leaf links close menu.
- **3rd-level "All …" entries (verified 2026-09-11):** `collectSubmenuItems` (`lib/medusa/categories.ts`) prepends `{ title: getCategoryNavAllLabel(child), path: categoryPagePath(child), newTab: false, mobileOnly: true }` into every nested submenu whose parent has visible grandchildren — mirroring the 2nd-level pattern in `buildCategoryNavItems`. A 3rd-level group (e.g. Paperweights) renders "All Paperweights" as the first item of its nested submenu. `categories.test.ts` asserts `["All Shirts", "T-Shirts", "Button-Downs"]`.
- **Burger consistency (verified 2026-09-11):** every top-level burger item shares `flex min-h-11 items-center font-semibold text-caps text-content-primary text-custom-xs ${navItemIndicatorPadding}` + `NavActiveIndicator position="left"` — including the account/sign-in link (which previously lacked `text-caps`/`text-custom-xs`/padding). The search form was REMOVED from the burger (dedicated SearchOverlay covers it); `MobileMenuProps` no longer carries search props.

### HYDRATION KILLER — `<ul>` inside `<Link>` aborts React 19 hydration on EVERY page

The first flyout implementation put the nested `<ul class="dropdown dropdown-nested">`
**inside** the `<Link>` (`<a>`). `<ul>` cannot be a descendant of `<a>`; React 19
logs `<a> cannot contain a nested <a>` / `Hydration failed because the server
rendered HTML didn't match the client` and **aborts hydration site-wide**:
- SSR looks perfect (all markup present), but the client never attaches — no React
  fiber keys anywhere, no page errors, clicks dead, `aria-expanded` never flips.
- Detect: `window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size === 0` on a
  page that renders fine; or grep dev.log for `Hydration failed`.
- Fix: keep the nested `<ul>` a **sibling** of the link inside a `group/sub`
  wrapper div. Always verify with a real interaction (click toggle, check
  `aria-expanded`) after merging anything that nests interactive elements.

### Playwright gotcha — duplicate mobile/desktop nav buttons

The mobile menu has BOTH the hidden desktop trigger and the visible mobile
trigger with the same text (e.g. two "Levitating Objects" buttons). Use
`:visible` in locators (`nav button:has-text("Levitating Objects"):visible`)
or you'll click a hidden element and time out.

## Seed gotcha — `assignExtraDemoCategories` drops memberships (found 2026-09-03)

`updateProducts` **replaces** category membership wholesale. On the existing-product path,
`assignExtraDemoCategories` loaded `categories = undefined`, so assigning a product to a new
grandchild category silently DROPPED its existing `paperweights` membership. Fix: load the
`categories` relation on the existing product BEFORE `updateProducts` so the merge preserves
current memberships. If a dev DB is already corrupted this way, strip → reseed (the strip
script handles the 3-level tree).

## Verification checklist

- [ ] Desktop (1440px): top bar visible with footer bg, tagline + links
- [ ] Desktop: logo 135px, nav links semibold 12px caps tracking, underline on active
- [ ] Desktop: icons 36px, gap-2.5, stroke-1.6 family (search, account, heart, cart-wheels)
- [ ] Desktop: dropdowns hover-reveal, 3rd-level flyout to right
- [ ] Mobile (390px): no top bar, logo 98px, icons + hamburger visible
- [ ] Mobile: menu opens full-screen, nav semibold 12px caps, underline active, expandable accordion for submenus
- [ ] Mobile: leaf links navigate and close menu
- [ ] No horizontal overflow at either viewport
- [ ] SSR renders the new header (not cached old markup)
- [ ] Seed reseed needed after CMS field changes (topBarText, topBarLinks)