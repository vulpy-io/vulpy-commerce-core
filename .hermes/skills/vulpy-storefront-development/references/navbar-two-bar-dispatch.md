# Navbar Two-Bar Layout — Dispatch Reference

Dispatched as `feat/navbar-two-bar` (Sep 2026). Reference for future header work.

## Architecture

The header was restructured from a single-bar (logo+search+icons / nav-below) to a
two-bar layout inspired by HF EU store:

- **Row 1 — Top utility bar:** `bg-footer-background` (`#eae3d9`), `hidden lg:block`.
  Left: CMS-driven tagline (`topBarText`). Right: CMS-driven utility links (`topBarLinks`).
- **Row 2 — Main nav bar:** white bg, border-bottom. Logo left (Payload image, 135px
  desktop / 98px mobile), nav strip center (underline active, no orange dot), icons right
  (search, account, bookmark/favourites, cart).

## New CMS fields

Added to `CmsSiteSettings` / Payload `site-settings` global:
- `topBarText: string` — tagline in the utility strip
- `topBarLinks: { label: string; url: string }[]` — right-side utility links

## Seed copy voice rule

When writing seed/default copy for the Vulpy Commerce **template**, the voice must match
the existing demo catalog (levitating objects / small-batch objects). The defaults use:
- `topBarText`: "Small-batch objects, delivered worldwide"
- `topBarLinks`: [Our Story, Contact]

**Never use store-specific copy** (e.g. "Handcrafted in Britain") in template defaults —
that was the reference site's copy. The template voice is: whimsical, deadpan, small-batch
objects, gravity-defying. See `defaults.ts` hero slides and newsletter for the established
register.

## Icon set (stroke-only, 22px header)

All header icons: `fill="none" stroke="currentColor" stroke-width="1.6"` at 22×22.
- **Search:** circle + diagonal line
- **Account:** circle head + curved body path
- **Favourites:** bookmark path `M6 3.5h12V21l-6-4-6 4V3.5Z`
- **Cart:** proper shopping cart with two wheels (circles r=1.5) + basket path — NOT a bag

The cart-vs-bag distinction was an explicit operator requirement.

## Active indicator

The orange dot `NavActiveIndicator` was replaced with a 2px bottom underline
(`bg-content-primary`) for main nav links. The dot may be retained for dropdown sub-items.
The underline uses `after:` pseudo-element with `scaleX(0)→scaleX(1)` transition.

## Header height

`--header-height` CSS var (from `HeaderHeightSync.tsx`) auto-tracks the header.
The two-bar layout adds ~33px on desktop (top bar). No manual padding adjustments needed —
the `ResizeObserver` mechanism handles it.

## Mobile (< xl)

- Top bar hidden
- Main bar: logo (98px) + icon cluster + hamburger
- Nav links in full-screen overlay
- Search trigger visible at all breakpoints
