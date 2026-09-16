# PDP & CMS Block Token Standards (audited 2026-09-03)

## Verified clean token state after full sweep

All PDP-surface components and CMS block renderers have been audited and corrected.
Reference this before touching any of these files.

## Correct tokens by surface

### Radii
| Element | Class | Value |
|---|---|---|
| Cards, panels, containers | `rounded-panel` | 10px |
| Buttons, inputs | `rounded-control` | 5px |
| Circular icon containers | `rounded-full` | OK — circles only |
| Video, iframe wrappers | `rounded-panel` | 10px |
| Gallery images | `rounded-panel` | 10px |
| Thumbnails | `rounded-panel` | 10px |

**Never use:** `rounded-lg` (8px), `rounded-md` (6px), `rounded-xl`, `rounded-sm` on brand surfaces.

### Colors
| Slot | Token class | Hex |
|---|---|---|
| Page/section background | `bg-surface` | #fbf9f4 (warm cream) |
| Muted fill (alternate rows, placeholders) | `bg-surface-muted` | cooler cream |
| Subtle fill (section backgrounds, FAQ surround) | `bg-surface-subtle` | slightly deeper |
| Raised interactive controls | `bg-surface-raised` | #ffffff — option pills etc. |
| Borders (default) | `border-border-subtle` | warm gray |
| Borders (strong) | `border-border-strong` | deeper gray |
| Primary text | `text-content-primary` | warm charcoal |
| Secondary text | `text-content-secondary` | muted |
| Muted text | `text-content-muted` | quieter |
| CTAs | `bg-action-primary-background` + `hover:bg-action-primary-hover` | Fox orange |

**Never use on brand surfaces:** `bg-white`, `bg-gray-1/2/3`, `border-gray-3/4`,
`text-dark`, `text-dark-*`, `bg-[#F5F5F7]`, `bg-[#DBF4F3]`, `text-teal`.

### Buttons
All CTA/submit buttons must use:
- `rounded-control` (5px)
- `font-button` (weight 800)
- `bg-action-primary-background hover:bg-action-primary-hover text-white`

### Shadows
- `shadow-1`, `shadow-2` → remove (not brand tokens); use `bg-surface-raised` + border for elevation
- Brand directional shadow: `shadow-brand` (when token exists); otherwise no shadow

## CMS block renderer — corrected patterns (BlocksRenderer.tsx)

### FAQ block
```tsx
<section className="container py-12 xl:py-16">
  <h2 className="mb-6 h4">{title}</h2>   {/* only if title exists */}
  <div className="divide-y divide-border-subtle">
    <details className="group py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-content-primary">
        {question}
        <span aria-hidden className="shrink-0 text-content-muted transition-transform duration-200 group-open:rotate-180">↓</span>
      </summary>
      <p className="mt-3 text-content-muted leading-relaxed">{answer}</p>
    </details>
  </div>
</section>
```
**Not:** flat `<article>` cards with `rounded-lg border border-gray-3`.

### contactInfo block
```tsx
<div className="rounded-panel bg-surface-subtle p-6">
  <h3 className="mb-4 h4">Contact information</h3>
  ...
</div>
```

### media block
```tsx
<Image className="h-auto w-full rounded-panel object-cover" ... />
```

### mediaWithText block
- Container variants (video, iframe, placeholder): `rounded-panel`
- Placeholder background: `bg-surface-muted`
- h2 title: `h2` class (or `mb-4 h2`)
- CTA: `rounded-control font-button`

### cta block
- Container: `rounded-panel px-6 py-10 text-white`
- h2: `h4 text-caps text-white`
- Button: `rounded-control font-button`
- Dark theme border: `border-border-subtle border-y bg-surface-inverse`

## ProductDetailsAccordion.tsx
- Container: `rounded-panel bg-surface` (no shadow)
- Icon: `rounded-full bg-surface-muted text-content-primary`
- Border: `border-border-subtle border-t`
- Section background: `bg-surface-subtle`

## VariantOptions.tsx (option pills)
- Background: `bg-surface-raised` (#ffffff — intentionally white to pop against bg-surface cream)

## ProductItem.tsx (quick-add button)
- `rounded-control bg-action-primary-background font-button`

## Removed from PDP
- `productGrid` (`related` variant) is NOT in `productPageBlocks` — native `relatedProducts`
  in `ProductDetails.tsx` already renders related products. Do not re-add it to the seed
  or block list.
