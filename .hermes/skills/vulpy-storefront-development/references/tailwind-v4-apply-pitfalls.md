# Tailwind v4 @apply Pitfalls

## Cross-layer @apply is rejected (verified 2026-09-03)

**Symptom:** `CssSyntaxError: tailwindcss: Cannot apply unknown utility class 'X'`
at `style.css:1:1`, crashing the Next.js Turbopack dev server with a 500 on every page.

**Root cause:** In Tailwind v4, `@apply` inside `@layer utilities` (or `@layer components`)
cannot reference classes defined in a *different* layer — including other component-layer
classes like `.text-caps`, or font-family utilities like `font-heading` that are derived
from an `@theme` entry. Tailwind v4's PostCSS pass resolves `@apply` before layer
ordering is finalized, so cross-layer references fail.

**Hit twice in the same session:**

1. `.eyebrow { @apply font-bold text-caps ... }` inside `@layer components` — failed
   because `.text-caps` is defined in another `@layer components` block earlier in the
   file.
2. `.h1 { @apply font-heading ... }` inside `@layer utilities` — failed because
   `font-heading` is a Tailwind utility derived from `--font-family-heading` in `@theme`,
   not available to `@apply` in a utilities block during the same pass.

**Fix pattern:**

Instead of `@apply`-ing a class that may not resolve, expand it inline using raw CSS:

```css
/* ✗ fails */
.h1 { @apply font-heading font-light ...; }

/* ✓ works — size is clamp(26px,3vw,38px); CategoryRegister hero is the only larger exception */
.h1 {
  font-family: var(--font-sora), Sora, ui-sans-serif, system-ui, sans-serif;
  @apply font-light text-[clamp(26px,3vw,38px)] text-content-primary leading-[1.15] tracking-[-0.015em];
}

/* ✗ fails */
.eyebrow { @apply font-bold text-caps text-content-secondary text-custom-xs tracking-[0.06em]; }

/* ✓ works — expand text-caps (uppercase + tracking) directly */
.eyebrow { @apply font-bold uppercase text-content-secondary text-custom-xs tracking-[0.06em]; }
```

**Rule:** Only `@apply` primitive Tailwind utilities (colors, spacing, font-size, font-weight,
flex, grid etc.) inside `@layer utilities` blocks. Never `@apply` a named class from
`.cms-prose`, another `@layer components` block, or a font-family utility.

## @theme vs @theme inline (existing pitfall, see tailwind-v4-migration.md)

Briefly: `@theme {}` for static literals; `@theme inline {}` for `var(--...)` references.
Cross-contaminating them causes TW to inline a `var()` string as a literal token.

## font-weight and font-family @theme wiring required for utilities

Custom font-weight values (e.g. 320 for `font-light`, 800 for `font-button`) are only
available as `font-*` Tailwind utilities if they are registered in `@theme`:

```css
/* These MUST be in @theme, not just in tokens.generated.css */
--font-weight-light: var(--reference-font-weight-light);     /* → font-light (320) */
--font-weight-regular: var(--reference-font-weight-regular); /* → font-regular (450) */
--font-weight-button: var(--reference-font-weight-button);   /* → font-button (800) */
--font-family-heading: var(--font-sora), Sora, ...;          /* → font-heading */
```

`tokens.generated.css` defines `--reference-font-weight-button: 800` but that alone
does NOT create a `font-button` utility. The `@theme` wire-up is required. Missing it
is a silent failure — the class is applied to elements in JSX but generates no CSS, so
the weight simply doesn't change and there's no build error.

**Verified fix location:** `apps/storefront/src/app/css/style.css` `@theme` block.
