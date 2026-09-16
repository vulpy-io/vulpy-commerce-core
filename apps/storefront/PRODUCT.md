# Product Context — Vulpy Commerce

## What it is

A self-hosted e-commerce platform (Medusa v2 + Next.js storefront + Payload CMS) that ships with an AI assistant (Fox in the Box / Hermes) to help operators run their shop.

## Who it's for

Small-to-medium independent merchants who want professional e-commerce without SaaS lock-in. Technical enough to deploy to a VPS, but not necessarily developers. They care about:
- Owning their data and platform
- Professional design without hiring a designer
- Fast, accessible storefronts
- Privacy-respecting analytics (self-hosted Matomo)

## Competitive landscape

- **Shopify**: easier but locked-in, expensive at scale, template-dependent
- **WooCommerce**: self-hosted but WordPress overhead, plugin hell
- **Medusa standalone**: developer-first, no storefront, no design system

Vulpy Commerce differentiates by shipping a **complete opinionated stack** with AI-assisted operations, not a framework.

## Brand voice

Warm, confident, clear. Not corporate, not startup-cute. A professional who respects your time. See `design/identity.md` for full brand brief.

## Key product areas

1. **Storefront** — customer-facing shop (SSR, fast, accessible)
2. **Admin** — Medusa dashboard + Payload CMS
3. **Fox** — AI assistant for store operations
4. **Analytics** — self-hosted Matomo, consent-gated

## Design priorities

1. Conversion — nothing impedes the purchase path
2. Trust — professional, consistent, accessible
3. Brand expression — warm, crafted feel (marketing surfaces)
4. Performance — Core Web Vitals, no layout shift

## Content types

- **Marketing blocks** — hero, promo banners, countdown, testimonials, newsletter, CTA, rich text, media
- **Commerce blocks** — product grid, category grid (data-driven, minimal creative intervention)
- **Product pages** — structured: images, options, price, add-to-cart, content blocks below
- **Blog/content** — Payload CMS driven, rich text + embedded media
