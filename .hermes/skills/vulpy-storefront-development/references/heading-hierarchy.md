# Heading hierarchy — `.h2`/`.h3`/`.h4` utilities (verified 2026-09-11)

## Where the utilities live

`apps/storefront/src/app/css/style.css`, `@layer utilities` block:

- `.h2` = `font-normal text-3xl text-content-primary xl:text-heading-2` — page/
  section heading ("Shop by Category", "New Arrivals", "You may also like").
- `.h3` = `font-medium text-heading-3 text-content-primary` — sub-section.
- `.h4` = `font-semibold text-heading-4 text-content-primary` — card/carousel heading.
- `.eyebrow` — small uppercase section overline.

## Decision rule (when auditing/normalizing headings)

- Page/section hero headings → `<h2 className="h2">`. Drop inline scale/font
  utilities (`text-[40px]`, `text-2xl text-caps`, `font-light text-[32px]`) —
  `.h2` owns them.
- Sub-headings that sit UNDER a page h1 (checkout steps, auth form titles) →
  demote one level to `<h3>` (use `h3` class or keep scale classes per context).
- Widget/card/drawer/sidebar mini-headings (blog sidebar, cart drawer title,
  consent modal, home promo/countdown) → KEEP their small scale; do not flatten
  to `.h2`, that reads oversized.

## Already normalized (polish batch 2026-09-11)

- → `.h2`: `ProductCarousel` editorial header (PDP "You may also like"),
  `ContactPageLayout` "Contact information", `ContactFormBlock` "Contact us",
  `SavedProductsLayout` (wishlist/recently-viewed title), `Cart` "Your cart",
  `CategoryRegister` collection title.
- → `<h3 h3>`: Checkout `Billing` "Billing details", `CheckoutSteps` "Contact
  details", Auth `Signin`/`Signup` titles.
- Kept as-is by judgment: Blog sidebar/widget titles, `CartSidebarModal` drawer
  title, `ConsentPreferences` modal title, Home `Countdown`/`PromoBanner`/
  `Testimonials`.

## Pitfall — ProductCarousel has four header layouts

`default`, `eyebrow-cta`, `centered` (all `h4 text-caps`) and `editorial` (the
big `.h2`-scale heading, used by `SimilarProducts` → "You may also like"). When
touching this component, normalize `editorial`; leave the other three on `h4`.

## Two PDP carousels render `.h2` via `headerLayout="editorial"` (verified 2026-09-11)

Both PDP sections that should read as `.h2` pass `headerLayout="editorial"` to
`ProductCarousel`:

- `ShopDetails/SimilarProducts` — title "You may also like"
- `ShopDetails/RecentlyViewedBlock` — title "Recently viewed" (operator
  correction 2026-09-11: "recently viewed on pdp should be .h2 as well")

If a future PDP section needs a `.h2` heading, pass `headerLayout="editorial"`
rather than writing a raw `text-[40px]` (the pre-fix anti-pattern).