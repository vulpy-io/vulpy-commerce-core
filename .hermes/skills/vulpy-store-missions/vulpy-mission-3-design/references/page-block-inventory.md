# Page-block inventory (Brume & Root / vulpy-commerce storefront)

Source of truth for the M3 "have / adapt / build" map step. All page blocks are
registered in **`apps/storefront/src/fields/blocksField.ts`** (homepage/pages use
`pageBlocksField` → `allPageBlocks`) and **defined** in
**`apps/storefront/src/blocks/index.ts`**. Re-read these files rather than
trusting stale names — block schemas change.

## `allPageBlocks` (usable on the homepage / generic pages)

| Block slug | Shape (key fields) | Notes for design mapping |
|---|---|---|
| `hero` | `slides[]`(title, discountValue, body, ctaLabel/Url, image), `promos[]`(title, priceLabel, offerText, link, image), `badges[]`(title, description, icon) | **Carousel by default** — a calm single-statement hero means repurposing to one slide, NOT adding more slides. Sale/discount-oriented fields are marketing-flavored. |
| `categoryGrid` | eyebrow, title, limit | Simple category tiles |
| `productGrid` | title, eyebrow, subtitle, ctaLabel/Url, `variant` (new-arrivals/best-sellers/related), limit | The standard catalog rail |
| `promoBanners` | `banners[]` (eyebrow, title, subtitle, ctaLabel/Url, image) | |
| `countdownPromo` | eyebrow, title, body, productName, deadline, cta, image | Time-limited promo (e.g. sale) |
| `testimonials` | eyebrow, title, `items[]` (quote, authorName, authorRole, avatar) | Social proof |
| `newsletter` | title, subtitle, placeholder, bgImage | Signup strip |
| `richText` | content (richText) | Editorial copy |
| `contactInfo` / `contactForm` | contact fields / form | Contact page, not homepage |
| `cta` | title, body, `theme` (blue/teal/dark), image, `links[]` (label+url) | Themes are **blue/teal/dark** — no brand-clay theme; mapping a clay CTA may need theme adaptation or styling override |
| `media` | caption, image | Product pages only |
| `mediaWithText` | title, content(richText), cta, `mediaType`(image/upload/youtube/vimeo), `mediaPosition`(left/right), swapOnMobile | The natural "story / craft" section vehicle |
| `spacer` | size | Vertical rhythm |

## `productPageBlocks`
richText, testimonials, faq, productGrid, cta, media, mediaWithText, spacer

## `preFooterBlocks` (above footer on every page)
newsletter, cta, richText, spacer

## Brand-flavored mapping gotchas (M3)
- **`cta` themes are blue/teal/dark** — default `"blue"`. The Moss & Limestone
  direction wants a **clay** CTA and a **deep-forest** option; neither exists as
  a theme. Expect an **Adapt** verdict (add a brand theme, e.g. `clay`/`forest`)
  for any section whose CTA carries the brand color.
- **`hero` is a sale-style carousel** (discountValue, promos, badges). The
  "single calm statement" editorial hero is an **Adapt**, not a Have.
- `categoryGrid` / `productGrid` exist cleanly — "Have" for catalog sections.
- No bespoke "craft / care ritual / story" block exists → the `mediaWithText`
  block is the cheap **Have** for those, or a **Build** if the editorial
  treatment (overlay, asymmetric) goes beyond what it supports.

Always confirm against `blocks/index.ts` before finalizing a verdict.