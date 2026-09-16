# Client content packs — handling guide (worked example: Brume & Root)

Operators may skip the question checklist entirely by delivering a **client
content pack**: one xlsx workbook plus numbered image files. Treat this as a
complete answer set — ingest before drafting anything, never re-ask what it
already answers.

## Typical workbook sheets

| Sheet | What it holds | How to use in M3 |
|---|---|---|
| Delivery Notes | Brand, market, store language, currency, catalogue size, recommended build scope | Reconcile against `.hermes/store-profile.md` + M2 visual direction; the recommended homepage scope seeds the section plan |
| Product Import | Handle, name, variant, SKU, price, compare-at, stock, weight, collection, status, image filename, alt text | Prices/status matter for M4; for M3 use names+collections for grid concepts. **Draft status = exclude from homepage features** |
| Product Copy | Eyebrow, short/full description, materials, included, care, SEO per product | Slot directly into section concept copy — real copy beats placeholder copy |
| Collections | Handle, title, short line, description, sort order, featured asset | Feeds the "featured collections" section concept |
| Pages & Copy | Per-page section rows: heading, body copy, CTA label + link | This IS the homepage copy — map each Home row to a section |
| Business Rules | Market, VAT, shipping thresholds/dispatch/returns/guarantee, payments, merchandising rules | Drives trust-bar content, shipping messaging, and constraints (e.g. "charcoal variant must not be promoted while Draft") |
| Asset Map | Filename → asset type, linked product/page, primary use, alt text, aspect ratio, crop guidance | Binding: exact filenames, given alt text, crop guidance respected in every concept |

## Worked example — Brume & Root pack (2026-08-25)

10 images (`01-stillgrove-main.png` … `10-brand-story-lifestyle.png`) +
`BRUME_ROOT_Product_Content_Database.xlsx`: 8 products / 14 variants, PLN
gross prices, 3 collections (Terrariums / Living Decor / Care Tools),
EN-first with PL later. The pack conflicted with the M0 profile's
"Polish primary" — flagged to operator for client confirmation, proceeded
EN-first (pack = newest client signal).

Client's own "recommended build scope" mapped cleanly onto existing blocks:

| Client scope row | Section concept | Block verdict |
|---|---|---|
| Hero | Single statement hero; headline on the empty left side of `09-homepage-hero.png` per asset-map crop guidance; one clay CTA `Shop terrariums` | Adapt `hero` (single slide, no promos/carousel) |
| Featured collections ("Choose your landscape") | 3 collection cards from Collections sheet | Have `categoryGrid` |
| Best sellers ("The terrariums") | productGrid of terrariums | Have `productGrid` |
| Brand story ("Built by hand. Designed to settle in.") | mediaWithText with `10-brand-story-lifestyle.png` | Have `mediaWithText` |
| Care promise ("Low maintenance, not no maintenance.") | mediaWithText or cta variant | Have |
| Newsletter ("Notes from the forest floor") | newsletter block | Have `newsletter` |

Zero builds needed — when the pack includes a "recommended build scope",
map it first; it usually collapses most sections to Have.

Note the voice check still applies: pack copy contained "maintenance-free"
for the preserved-moss frame — banned for *living* products in
`.hermes/brand-voice.md`, arguably acceptable for *preserved* moss.
Preserved ≠ living; verify each occurrence rather than blanket-banning.

## Operator workflow around packs

1. Copy attachments somewhere durable under the workspace (e.g.
   `.hermes/mission3-assets/`) — WebUI attachment paths are ephemeral.
2. Read the xlsx with python3 + openpyxl (`pip3 install openpyxl` if
   missing); dump sheet by sheet, truncate long cells.
3. View key images via vision analysis before writing concepts (hero +
   lifestyle at minimum).
4. Update `.hermes/store-profile.md` notes if the pack supersedes profile
   facts (locale, timeline).
5. Then produce the section-by-section concept using REAL copy/images from
   the pack, keeping placeholders only where the pack has gaps.
