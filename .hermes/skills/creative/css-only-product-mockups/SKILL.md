---
name: css-only-product-mockups
description: "Build e-commerce product mockups using pure CSS gradients, clip-paths, SVG, and emoji — no external images, no image generation tools."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design, mockup, ecommerce, css, product, visual, sketch, prototyping, zero-image]
    related_skills: [sketch, claude-design, popular-web-designs]
---

# CSS-Only Product Mockups

## ⚠️ This is a fallback, not the default

**Use this skill ONLY when:**
- `image_generate` is unavailable or unreliable
- Web CDN image sources (Unsplash, Pexels) are unreachable
- The user explicitly says "no images" or "CSS-only"
- You're working inside a subagent where `image_generate` hangs (see pitfall below)

**Default approach for store mockups:** pull real images from the web (Unsplash CDN, etc.) and verify with `curl -sI`. Real images produce mockups that look like a real store. CSS-only is the technical fallback when web sources fail, not the primary technique.

## When to Load This

Load this skill when the user asks for:
- "Mockup a store / shop / product page"
- "Show me what the product cards would look like"
- "Design a kit/catalog/collection page"
- "CSS-only, no images" design requests
- Any e-commerce design task where real product images aren't available

## Core Techniques

### 1. Product Silhouette via Clip-Path

The primary technique: a `clip-path: polygon()` shapes the product outline, and CSS `linear-gradient` fills it with brand colors.

```css
.product-shape {
  width: 140px; height: 160px;
  clip-path: polygon(20% 0%, 80% 0%, 100% 20%, 100% 70%, 80% 100%, 20% 100%, 0% 70%, 0% 20%);
  position: relative; overflow: hidden;
}
```

**Common clip-path shapes:**
- **Jersey/shirt:** `polygon(20% 0%, 80% 0%, 100% 20%, 100% 70%, 80% 100%, 20% 100%, 0% 70%, 0% 20%)`
- **Box/package:** `polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%)`
- **Badge/shield:** `polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)`

### 2. Multi-Color Layering

Layer a primary gradient, a secondary trim (reduced opacity), and optional stripes:

```html
<div class="product-shape">
  <div class="fill" style="background: linear-gradient(135deg, #ef0107, #cc0003);"></div>
  <div class="accent" style="inset: 6px; background: #fff; opacity: 0.12;"></div>
  <div class="stripe" style="left: 30%;"></div>
  <div class="stripe" style="left: 50%;"></div>
</div>
```

### 3. Emoji as Product Badges

Emoji are zero-dependency, universally supported, and work as badges, brand marks, or decorative elements:

| ⚽ football | 👑 crown/prestige | 🔥 popular/new | 🏆 trophy | ⭐ star | 🔴🔵🟢 color dots |
|---|---|---|---|---|---|

Place them with `position: absolute; z-index: 2` on the product shape.

### 4. Color Swatch Dots

For DTC-style cards, add small color circles below the product shape:

```html
<div class="swatches" style="display: flex; gap: 4px;">
  <span style="width: 12px; height: 12px; border-radius: 50%; background: #ef0107;"></span>
  <span style="width: 12px; height: 12px; border-radius: 50%; background: #fff;"></span>
</div>
```

### 5. SVG Decorative Elements

Use inline SVG for backgrounds, dividers, and scene elements that need more structure than CSS gradients:

- **Pitch outline** (football store): penalty areas, center circle, halfway line
- **Geometric/diamond patterns** (background tiling)
- **Divider lines** with gradient fades
- **Custom icons** (shopping bag, truck, shield)

### 6. CSS-Only Hero Scenes

Create atmospheric hero sections without images:

- **Gradient sky/atmosphere**: multi-stop radial + linear gradients
- **Crowd silhouettes**: repeated `clip-path` polygon rows
- **Light sparkles**: small dots with `box-shadow` glow
- **Animated floating elements**: CSS `@keyframes` on geometric shapes

## Anatomy of a Product Card

A typical CSS-only product card has these layers:

```
┌─────────────────────────┐
│     Product Shape       │  ← clip-path polygon + gradient fill
│   (emoji badge)   (##)  │  ← absolute-positioned emoji + number
│                         │
│  ● ● color swatches     │  ← small color dots
├─────────────────────────┤
│ LEAGUE                  │  ← category label (small, uppercase)
│ Product Name 26/27      │  ← product title
│ $74.99          S-XXL   │  ← price + size info
└─────────────────────────┘
```

## Example: 6-Product Grid

For a store mockup, create a responsive grid with `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`. Each card should:
- Have a unique gradient fill (club/brand colors)
- Show category (Premier League, La Liga, etc.)
- Show price ($74.99–$79.99 range)
- Show sizes (S-XXL)
- Have hover effects (translate, border highlight, shadow)

## Pitfalls

- **Don't over-engineer the clip-path**: a simple 8-vertex polygon is enough — perfect realism isn't the goal, layout fidelity is.
- **Don't use `img` tags at all**: if the user said "no images", check for `<img` in your HTML before submitting.
- **Don't skip the color swatches**: they're the fastest way to communicate "this product has multiple colorways" without photos.
- **Don't forget responsive breakpoints**: product grids should collapse to 1-2 columns on mobile.
- **Don't invent fake data**: use realistic prices, sizes, and category names. If the user gave brand specs, use them exactly.
- **Check for zero `<img>` tags**: `grep -c '<img' your-file.html` should return 0.
- **No `image_generate` calls**: if the user explicitly said no image generation, don't call it. If you're in a tool loop that called it, cancel and restart with this skill.

## References

See `references/css-only-product-visuals.md` for detailed technique examples, additional clip-path shapes, emoji tables, and SVG pattern templates.

## Related Skills

- **`sketch`** — broader throwaway HTML mockup workflow (2-3 variants, surface-first design). This skill provides the specific product-visualization technique.
- **`popular-web-designs`** — real brand design systems you can steal colors/typography from
- **`claude-design`** — full design process for one-off HTML artifacts