# Storefront page wire map — homepage & category/PDP block slots (verified 2026-08-26)

Field-level audit done during the HF-parity consolidation planning session. Read this
BEFORE proposing code changes for "missing" storefront capabilities: most parity gaps
turned out to be content-seed gaps, not code gaps.

## Audit rule (parity vs reference stores)

1. Grep the repo for the render path AND the schema field before declaring a feature
   missing. A page with no editorial copy may have full machinery waiting on seed
   content; conversely an orphaned component is NOT a working feature — SearchOverlay.tsx
   sat committed-but-unwired (header Search button dead) while looking implemented.
2. Only then probe the live page, using marker greps (SKILL.md → "Verifying streamed
   pages"), not heading greps.

## Homepage — compose entirely from existing Payload blocks (no structural code needed)

| Reference-site section | Our block |
|---|---|
| Hero carousel (slides: eyebrow · title · body · CTA · image) | `hero` |
| Eyebrow "THE COLLECTION" + Shop-by-category card grid | `categoryGrid` (eyebrow/title/limit; pulls Medusa categories, visuals via `metadata.image_url`) |
| "This week's" eyebrow + New Arrivals grid + VIEW ALL | `productGrid` (variant `new-arrivals`, ctaLabel/ctaUrl) |
| Brand statement ("Traditional. Handmade. British.") | `richText` |

Homepage source: `pages` doc slug=`home`; footer newsletter lives in globals/footer
preFooterBlocks (operator-owned — leave).

## Block inventory (apps/storefront/src/blocks/index.ts)

- `allPageBlocks`: hero, categoryGrid, productGrid, promoBanners, countdownPromo,
  testimonials, newsletter, richText, contactInfo, contactForm, cta, mediaWithText, spacer
- `productPageBlocks`: richText, testimonials, faq, productGrid, cta, media,
  mediaWithText, spacer
- `preFooterBlocks`: newsletter, cta, richText, spacer

## Category landing slots (collection `categoryContent`)

Schema (`collections/CategoryContent.ts`): `h1`, `blocksAboveSubcategories`,
`blocksBelowSubcategories`, `blocksBelowListing` (all accept allPageBlocks),
toggles `hideSubcategoryThumbs/hideProductListing/showCategoryFilter`, `seoFields`.

Render rules (`app/(site)/(pages)/categories/[handle]/page.tsx`):
- Editorial head (eyebrow/H1), FINISH facet, count line, grid/list toggle come free
  (HF polish components — FinishSwatch, AttributeFilterDropdown).
- **`blocksBelowListing` renders ONLY on page 1** (`isFirstPage && …`) — the natural
  slot for category SEO texts; deep `?page=N` server renders intentionally omit it.
- Selection pages and `/sale` also render below-listing blocks.

Category SEO-text seeding target: upsert `categoryContent` docs (kind=medusa, handle =
Medusa handle) with `h1` + `seo.title/description` + a richText block (150–300 words,
unique per category, quality-reviewed) in `blocksBelowListing`.

## Product landing structure (collection `productContent`)

`productPageBlocksField` gives per-product ordered blocks rendered on the PDP below
the buy-box. Standard demo set per product: richText story → mediaWithText
materials/craft → richText specs → productGrid related → optional faq. Identity stays
Medusa-synced; only editorial fields are writable. seoFields available per product.

## Full reseed pipeline order (dev wipe-and-rebuild)

1. Wipe medusa + payload databases.
2. Core migrate + minimal Medusa seed (store/region/channel/publishable-key/tax/
   shipping/admin — NO baseline apparel fixtures unless explicitly wanted).
3. Demo catalog seed (`seed:demo` — levitating families, swatches, oos/sale variants).
4. `sync-products-to-payload` + `sync-categories-to-payload`.
5. Editorial content seed: homepage blocks, category h1/SEO/below-listing texts,
   PDP stories, navigation/site-settings (footer untouched).
6. Verify: seed-log lines + marker greps in served HTML (exit codes lie — see SKILL.md
   "Payload seed skip-guards"; a guarded idempotent seed can silently do less than expected).
