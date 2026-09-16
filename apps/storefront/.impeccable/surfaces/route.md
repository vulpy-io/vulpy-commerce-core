---
version: 1
slug: "route"
primary_target: "route:/"
related_targets: []
---

# Homepage surface brief

## Scope
The homepage (`/`) and its marketing blocks: hero, promo banners, product
grids, testimonials, newsletter, CTA, rich text, media.

## Visitor mode
Persuade — a first-time visitor decides whether this shop is worth their
time. The page must make the brand and offer legible in seconds and push
toward browse (`/shop`) and product pages.

## Audience / job / action
Independent-minded shoppers who value craft and ownership. Job: decide "is
this for me?" Action: explore the catalog or subscribe to the newsletter.

## Proof / content
Editorial copy + media from Payload blocks; product truth from Medusa
(real products, real prices — never invented). Homepage supports the funnel:
hero → social proof → product grid → CTA.

## Constraints
- Full creative license on structure WITHIN brand constraints
  (`identity.md`, `DESIGN.md`, warm palette, dual-font split, 4px grid,
  two radii, directional shadow).
- Conversion guardrails: CTA labels must stay truthful; no clickbait; no
  copy that overpromises product/price/availability.
- Performance: Core Web Vitals, no layout shift, no hero autoplay without
  reduced-motion respect.
- Structural block work ships via `hermes-coder` (schema/renderer/migration);
  token-level work happens in `store.tokens.json` via the registry.
- Design-system adoption (OpenDesign) takes precedence over freeform
  concept rolls; use `concept-seed` only when no OpenDesign system exists.

## Chosen direction
None yet — first exercise was Fox-in-the-Box token adoption. Revisit when a
marketing campaign brief arrives.

## Unresolved decisions
- Whether homepage hero stays static or gains a rotating promo slot.
- Whether marketing blocks need the `@layer marketing` isolation wrapper
  before any structural generation (Phase A target state).
