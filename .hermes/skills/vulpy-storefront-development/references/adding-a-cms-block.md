# Adding a new Payload CMS block (recipe, verified 2026-08-11)

Full vertical slice for adding a block content ops can place on pages (`hero`, `banner`,
`productGrid`, …). Verified adding the `banner` block end-to-end: schema → types → mapper →
renderer → regenerate → PATCH page → verify.

## Source files to touch (all in `apps/storefront/src/`)

1. `i18n/admin-labels.ts` — add `blocks.<slug>: { singular, plural }` (keep the map
   alphabetical).
2. `blocks/index.ts` — define `export const <name>Block: Block = { slug, labels: blocks.<slug>,
   fields: [...] }`. Upload fields: `{ name: "image", type: "upload", relationTo: "media",
   required: true, label: f.image }`. Add it to `allPageBlocks` — **position in that array is
   where content ops can insert it** (first position for a page-opening block).
3. `lib/cms/types.ts` — add a `Cms<Name>` type + `| Cms<Name>` member to the `CmsBlock` union.
4. `lib/cms/block-mappers.ts` — add `case "<slug>"` returning the mapped shape; media via
   `getMediaUrl(block.image as never, "")`.
5. `components/cms/BlocksRenderer.tsx` — add `case "<slug>"`; spread the pre-built
   `blockProps` (= `cmsSectionProps({ type, index, context })`) and/or wrap in `CmsSection`
   (default `className="contents"` — in-flow only).

### Full-bleed banner pattern (banner block)

```tsx
case "banner":
  return block.imageUrl ? (
    <section className="relative w-full overflow-hidden" key={key} {...blockProps}>
      <Image alt={block.title || "Banner"} className="object-cover" fill priority sizes="100vw" src={block.imageUrl} />
      <div aria-hidden="true" className="absolute inset-0 z-[1] bg-black/40" />
      <div className="relative z-10 flex min-h-[480px] w-full flex-col items-center justify-center px-6 py-20 text-center sm:min-h-[560px]">
        {/* eyebrow (uppercase tracking), title, body, CTA <Link> — white button: bg-white text-content-primary */}
      </div>
    </section>
  ) : null;
```

Do NOT wrap a full-bleed block in `CmsSection` if you need to escape the container — use the
raw `<section>` + `blockProps` spread, same as the `richText`/`faq` cases.

## Regenerate types

With the dev server up, `POST /api/dev/generate` with an empty JSON body regenerates
`payload-types.ts` + `src/app/(payload)/admin/importMap.js` (no need for `pnpm generate`):

```bash
curl -s -X POST http://host.docker.internal:13100/api/dev/generate -H "Content-Type: application/json" -d '{}'
# → {"ok":true,"generated":["payload-types.ts","importMap.js"]}
```

Verify the new block in `apps/storefront/payload-types.ts` (`blockType: '<slug>'` in the
Page/CategoryContent/ProductContent blocks arrays, `<slug>?` in blocksSelect). **Do NOT grep
importMap.js for the block slug** — it only maps client components (richtext-lexical etc.);
server-side block config never appears there.

## PATCH content

PATCH **replaces the whole `blocks` array** on `/api/pages/<id>` — build the new array from a
prior GET with jq (kept blocks verbatim, new block first, dropped blocks removed), then:

```bash
curl -s -X PATCH http://host.docker.internal:13100/api/pages/<id> \
  -H "Authorization: JWT $TOKEN" -H "Content-Type: application/json" -d @patch.json
```

Upload fields accept the plain media id (`"image": 1026`). Verify the PATCH response:
first-block `blockType`/`id` + media relation (`blocks[0].image.id`, `.url`).

## Verification greps (dev)

- **Flight-payload escaping:** CMS markers in served HTML are JSON-escaped — grep
  `data-cms-type\\":\\"banner\\"` (escaped quotes), not the plain `data-cms-type="banner"`.
- **Dev CSS chunks:** chunk names are URL-encoded
  (`/_next/static/chunks/%5Broot-of-the-server%5D__<hash>._.css` — find via the HTML's
  `stylesheet` href) and arbitrary-value utilities keep backslash escapes in the CSS text
  (`min-h-\\[480px\\]`, `bg-black\\/40`). Grep the escaped literal.
- `corepack pnpm --filter @apps/storefront typecheck` must stay clean.
- After patching TSX, run `npx biome check --write <files>` (duplicate-prop / class-sorting
  hazards).

## Pitfalls

- The `patch` tool's fuzzy matcher can land a block definition at a surprising offset (one run
  anchored inside the previous block's closing braces). After patching `blocks/index.ts`,
  re-read the region and confirm each `};` closes the right block before moving on.
- `blockType` in the DB is the block slug — the mapper `switch` must use the slug.
- DB block order ≠ `allPageBlocks` order; content order lives in the page doc.
