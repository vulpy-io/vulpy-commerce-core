---
version: "1.0"
name: "Fox in the Box"
description: "Warm, architectural commerce design system. Dual-font inverse-weight hierarchy, 4px grid, two radii, chromatic warm neutrals."
---

# Design System — Fox in the Box

## 1. Overview

A restrained commerce foundation built on warmth and craft. The system uses semantic design tokens compiled from DTCG sources; components consume `--design-*` and `--reference-*` CSS custom properties, never hard-coded values.

**Core principles:**
- Inverse weight hierarchy (large = light, small = bold)
- Chromatic warm neutrals (never cool grays)
- Two radii only (5px interactive, 10px containers)
- 4px spacing grid
- Dual-font split: geometric display (Sora) + humanist body (Manrope)

**Surface model:**
- `commerce-core` — checkout, cart, PDP, shop, account: token-level changes only, structure frozen
- `marketing` — homepage blocks, landing pages, blog: full creative license

---

## 2. Colors

### Palette

| Role | Token | Value | Usage |
|---|---|---|---|
| Canvas | `neutral.50` | `#fbf9f4` | Page background — warm cream |
| Surface raised | `neutral.0` | `#ffffff` | Cards, modals, dropdowns |
| Surface muted | `neutral.100` | `#f2f0eb` | Section alternation, aside |
| Border subtle | `neutral.200` | `#edebe6` | Dividers, card outlines |
| Border strong | `neutral.300` | `#d9d7d2` | Input borders, emphasis |
| Text muted | `neutral.500` | `#94928f` | Placeholders, disabled |
| Text secondary | `neutral.600` | `#676562` | Metadata, timestamps |
| Text primary | `neutral.800` | `#171513` | Body text — warm charcoal |
| Brand accent | `brand.500` | `#b8a089` | Hover states, decorative borders, icons |
| Brand light | `brand.50` | `#f7f2e9` | Tinted surfaces, tag fills |
| Brand dark | `brand.700` | `#917964` | Active/pressed accent |
| CTA/Action | `action.primary.bg` | `#c8743a` | Buttons, links — Fox orange |
| CTA hover | `action.primary.hover` | `#a15427` | Button hover |
| CTA text | `action.primary.fg` | `#ffffff` | Text on CTA |
| Danger | `danger.500` | `#b60802` | Errors, sale badges |
| Success | `success.500` | `#22ad5c` | In-stock, confirmations |
| Warning | `warning.500` | `#fbbf24` | Low stock, caution |
| Focus ring | `highlight.500` | `#c8743a` | Focus indicators (matches CTA) |

### Accessibility floors

- **Body text on canvas**: `#171513` on `#fbf9f4` = 14.8:1 (WCAG AAA)
- **CTA text on button**: `#ffffff` on `#c8743a` = 4.5:1 (WCAG AA minimum)
- **Secondary text on canvas**: `#676562` on `#fbf9f4` = 5.1:1 (WCAG AA)
- **Muted text**: `#94928f` on `#fbf9f4` = 3.1:1 (large text only — decorative/placeholder use)

All interactive text must meet WCAG AA (4.5:1 normal, 3:1 large). Decorative/non-essential text may use muted palette.

---

## 3. Typography

### Type scale (Fox inverse weight hierarchy)

| Token | Font | Size | Weight | Line-height | Letter-spacing | Usage |
|---|---|---|---|---|---|---|
| `h1` | Sora | 48px | **320** | 1.4 (67.2px) | -0.0146em | Hero headlines, page titles |
| `h2` | Sora | 32px | **400** | 1.25 (40px ✓4px) | -0.0375em | Section headings |
| `h3` | Manrope | 28px | **500** | 1.357 (38px) | +0.0018em | Subsection headings |
| `h4` | Manrope | 24px | **600** | 1.333 (32px ✓4px) | +0.0021em | Card titles, product names |
| `h5` | Manrope | 22px | **500** | 1.25 | 0em | Widget headings, accordion |
| `body-lg` | Manrope | 20px | 450 | 1.6 | — | Lead paragraphs, feature text |
| `body` | Manrope | 16px | **450** | 1.625 (26px) | +0.009em | Default body |
| `body-sm` | Manrope | 15px | 450 | 1.6 (24px ✓4px) | — | Secondary body, button labels |
| `caption` | Manrope | 14px | 450 | 1.571 (22px) | — | Metadata, timestamps |
| `overline` | Manrope | 13px | **600** | — | +0.00625em | Labels, badges, eyebrows |
| `xs` | Manrope | 12px | 450 | — | — | Fine print, legal |

### Design intent

- **Large type is light**: Display (320) commands through scale, not weight — creates elegance
- **Small type is bold**: Buttons (800), overlines (600) need weight to be legible and tappable
- **Font split at h3**: Sora (geometric, architectural) for hero impact; Manrope (humanist, warm) for content readers linger on
- **Body at 450**: Slightly heavier than standard 400 — adds warmth and substance without feeling heavy
- **Tracking tightens with size**: Large display text (-0.0375em) is tighter; small body (+0.009em) is slightly wider for readability

### Responsive modifiers

| Breakpoint | h1 | h2 | h3 | body |
|---|---|---|---|---|
| Desktop (≥1024px) | 48px | 32px | 28px | 16px |
| Tablet (≥768px) | 40px | 28px | 24px | 16px |
| Mobile (<768px) | 32px | 24px | 22px | 16px |

Scale linearly within each breakpoint. Never go below 14px for any readable text.

---

## 4. Spacing

### 4px grid system

All spacing values are multiples of 4px. The base unit is `--reference-space-1` = 4px.

| Token | Value | Usage |
|---|---|---|
| `space.1` | 4px | Minimum gap (icon to label) |
| `space.2` | 8px | Tight internal (stack items) |
| `space.3` | 12px | Button padding (vertical) |
| `space.4` | 16px | Default gap, card padding |
| `space.5` | 20px | — |
| `space.6` | 24px | Grid gutter, comfortable gap |
| `space.7` | 28px | — |
| `space.8` | 32px | Section internal padding |
| `space.9` | 36px | — |
| `space.10` | 40px | Large internal spacing |
| `space.12` | 48px | Section spacing (small) |
| `space.14` | 56px | — |
| `space.15` | 60px | Section spacing (medium) |
| `space.28` | 112px | Hero top spacing |
| `space.32` | 128px | Hero section (large) |

### Rhythm rules

- **Between sections**: 48–60px minimum
- **Within sections**: 16–32px between elements
- **Component internal**: 8–16px
- **Icon-to-text**: 4–8px
- **Button padding**: 12px vertical × 32px horizontal (3×8 multiplier)

---

## 5. Layout

### Grid

- **Columns**: 12
- **Gutter**: 24px
- **Max width**: 1280px (320px per column at max)
- **Margin**: 16px (mobile), 24px (tablet), auto-centered (desktop)

### Breakpoints

| Name | Min-width | Columns | Gutter |
|---|---|---|---|
| `sm` | 640px | 4 | 16px |
| `md` | 768px | 8 | 20px |
| `lg` | 1024px | 12 | 24px |
| `xl` | 1280px | 12 | 24px |
| `2xl` | 1440px | 12 | 24px |

### Content widths

- Full-bleed: 100vw (hero, promo banners)
- Wide: 1280px (product grids, shop page)
- Content: 768px (blog posts, rich text)
- Narrow: 560px (forms, auth pages)

---

## 6. Shapes

### Corner radius

Only two radius values in the system:

| Token | Value | Usage |
|---|---|---|
| `radius.control` | **5px** | Buttons, inputs, selects, chips |
| `radius.panel` | **10px** | Cards, images, modals, tooltips |

No other radius values. No pills (radius.pill exists in primitives but is reserved for badges only at `badge` = 30px).

### Shadows

One shadow style — warm, directional, never centered diffuse:

```css
box-shadow: 5px 5px 10px 0 rgb(184 160 137 / 60%);
```

- Offset: 5px right, 5px down (consistent light source: upper-left)
- Blur: 10px (tight, not fluffy)
- Color: brand accent at 60% opacity (warm, not black)
- Usage: cards on hover, elevated modals, floating elements

### Borders

- Default: 1px solid `neutral.200` (`#edebe6`)
- Emphasis: 2px solid `neutral.300` (`#d9d7d2`)
- Focus: 2px solid `highlight.500` (`#c8743a`), offset 2px
- Never use border-bottom-only for nav items (use full border or background change)

---

## 7. Motion

| Token | Duration | Easing | Usage |
|---|---|---|---|
| `fast` | 100ms | `ease-out` | Micro-interactions: hover color, opacity |
| `normal` | 200ms | `ease-in-out` | Standard: dropdowns, tooltips, drawers |
| `slow` | 300ms | `ease-in-out` | Page-level: modals, route transitions |

### Rules

- Prefer `opacity` and `transform` (GPU-composited) over `height`/`width`
- No motion for users with `prefers-reduced-motion: reduce`
- No motion on initial page load (no entrance animations)
- Hover effects: 100ms in, 200ms out (fast engage, graceful disengage)
- Never animate layout-triggering properties in lists/grids

---

## 8. Components

### Button

```
Height: 48px (touch target)
Padding: 12px 32px (vertical × horizontal)
Font: Manrope, 15px, weight 800
Radius: 5px
Min-width: 160px (2 grid columns)
Border: none (primary), 1px solid neutral.300 (secondary)
Shadow: none (default), brand shadow on hover
```

**Variants:**
- **Primary**: bg `#c8743a`, text `#ffffff`, hover bg `#a15427`
- **Secondary**: bg transparent, border `neutral.300`, text `neutral.800`, hover bg `brand.50`
- **Ghost**: no border, text `neutral.800`, hover bg `neutral.100`

### Card (product)

```
Background: #ffffff
Radius: 10px
Padding: 0 (image bleeds to edges), 16px (content area)
Border: 1px solid neutral.200
Shadow: none (default), brand shadow (hover)
Transition: shadow 200ms, transform 200ms
Hover: translateY(-2px) + shadow
```

### Input

```
Height: 48px
Padding: 12px 16px
Font: Manrope, 16px, weight 450
Radius: 5px
Border: 1px solid neutral.300
Focus: 2px solid highlight.500, offset 2px
Background: #ffffff
Placeholder: neutral.500
```

---

## 9. Do's and Don'ts

### Do

- ✅ Use semantic tokens (`--design-color-content-primary`) in components
- ✅ Use the 4px spacing grid for all margins/padding
- ✅ Keep display text light (320–400 weight) — let size carry hierarchy
- ✅ Use warm neutrals for all surfaces and borders
- ✅ Apply brand shadow (warm, directional) for elevation
- ✅ Maintain ≥4.5:1 contrast for all interactive text
- ✅ Use `radius.control` (5px) for buttons/inputs, `radius.panel` (10px) for cards
- ✅ Gate creative structural changes to marketing surfaces only
- ✅ Test responsive modifiers at all breakpoints

### Don't

- ❌ Hard-code color values in components (use tokens)
- ❌ Use cool grays (`#f3f4f6`, `#e5e7eb` Tailwind defaults)
- ❌ Make display headings bold (600+) — that's the anti-pattern
- ❌ Use more than two radius values (5px and 10px)
- ❌ Apply centered/diffuse box-shadows (always directional)
- ❌ Introduce pill buttons (max radius is 10px for containers)
- ❌ Use pure `#000000` or `#ffffff` as primary surfaces
- ❌ Structurally modify commerce-core pages without explicit override + warning
- ❌ Animate layout-triggering properties in product grids
- ❌ Skip focus indicators on interactive elements
- ❌ Use letter-spacing > 0.02em on any text
- ❌ Set body weight below 400 or above 500 (450 is the sweet spot)
