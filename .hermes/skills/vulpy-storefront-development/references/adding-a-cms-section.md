# Adding a new CMS section (block) — end-to-end checklist

Use when the operator asks for a new homepage/landing section ("add an X section") that
doesn't map to an existing block. Worked 2026-08-11 (hero `eyebrow` field, categoryGrid
`categoryHandles`). Content ops recipes: `vulpy-content-operations` →
`references/payload-rest-homepage-rebuild.md`.

## The 8 steps (in order)

1. **Decide schema vs content-only.** If the section is a variation of an existing block
   (heading/eyebrow position, new image side, extra CTA) — extend the existing block's
   fields and reuse the renderer. Only create a NEW block when the layout genuinely
   differs. (content-operations "Schema changes" section: new model → storefront-dev flow.)

2. **Schema** — `apps/storefront/src/blocks/index.ts`: add a `Block` entry (fields in the
   existing style; arrays of objects use `fields: [{ name, type }]`). Match `labels` from
   the `blocks` i18n object. Keep fields minimal + names consistent with existing blocks
   (`eyebrow`, `title`, `body`, `ctaLabel`, `ctaUrl`, `image`…).

3. **Types** — `apps/storefront/src/lib/cms/types.ts`: extend the `CmsBlock` union with
   the block's shape. `apps/storefront/src/lib/cms/block-mappers.ts`: add the `case`
   mapping raw payload → typed block (string/number casts; arrays of objects → map
   `.map()` with the same field-name conventions).

4. **Default content** — `apps/storefront/src/lib/cms/defaults.ts`: add the block to the
   default homepage blocks (or the relevant default) so the empty-DB dev fallback renders
   it. **Keep the default OFF-brand-safe** (empty strings / neutral copy).

5. **Renderer** — `apps/storefront/src/components/cms/BlocksRenderer.tsx`: add the case
   (or a new component under `components/cms/`). Server components preferred; `"use
   client"` only when interactive. Section chrome: `cmsSectionProps({ type, index,
   context })` for the CMS-outline/admin hooks. **If the section is the FIRST block on a
   page, it must clear the fixed header** — `pt-[80px] lg:pt-[124px]` for full-bleed
   sections (hero), `mt-[72px] lg:mt-[124px]` for container ones (banner) — see
   content-operations "Fixed-header clearance" note; re-measure on ANY header change.

6. **Regenerate** — `POST /api/dev/generate` (Payload types + admin importMap) after
   schema changes, then `pnpm --filter @apps/storefront typecheck`.

7. **Content** — build the block payload via the REST recipe
   (content-operations: login → PATCH page `blocks` array; **numbers** for relation ids;
   **Lexical root JSON** for richText). Put the real copy/images in the same change.

8. **Verify** — (a) typecheck + `node scripts/design/validate-design.mjs` (5 gates);
   (b) curl the route → grep the RSC flight payload for the section text; (c) if the
   section is a designed surface, extend the design-to-code audit element list with
   its key elements and re-run the audit (design-to-code loop — see
   `vulpy-design-system-adoption` → SKILL.md "It doesn't match the design" pitfall).

## Pitfalls

- `blocks/index.ts` fields are ALSO used by Payload admin — a field name typo shows up
  only in admin, not in typecheck. Re-check the block in the admin UI once after creating.
- Block `slug` must match `blockType` exactly (case-sensitive; admin uses the label).
- `mapBlocks` drops unknown blockTypes silently — a typo in the renderer `case` = blank
  section with no error.
- RichText: legacy array shape renders nothing (silent). Use the Lexical `root` JSON
  helper pattern in `vulpy-content-operations/references/payload-rest-homepage-rebuild.md`.
- Keep the design tokens in mind: new headings/eyebrows should reuse the token scale
  (`text-heading-2`, `text-custom-xs` + tracking), not ad-hoc sizes.
