# Tailwind v4 Migration Reference

Completed 2026-08-04 (commit `e56b5bd`). This project migrated from TW3 → TW4.3.3.

## Package changes

| Before | After |
|---|---|
| `tailwindcss: 3.4.19` | `tailwindcss: ^4.1.18` (resolved 4.3.3) |
| _(none)_ | `@tailwindcss/postcss: ^4.1.18` |
| `autoprefixer: 10.4.15` | **removed** (bundled in TW v4) |
| `tailwind-scrollbar: ^3.1.0` | **removed** (inline utilities) |

`postcss.config.js` after:
```js
module.exports = { plugins: { "@tailwindcss/postcss": {} } };
```

## CSS-first config strategy

`tailwind.config.ts` → tombstoned with `export {};` (bind-mount blocked `rm`; `git rm` it when possible).

All config moved into `apps/storefront/src/app/css/style.css`:

```css
@import "tailwindcss";
@import "./tokens.generated.css";

@theme {
  /* Static primitives: fontFamily, static palette (blue/dark/gray),
     fontSize, maxWidth, zIndex, boxShadow */
}

@theme inline {
  /* CSS-var-backed entries: semantic token aliases, product-card vars,
     boxShadows referencing var(--reference-color-*) */
}

@utility container {
  margin-inline: auto;
  padding-inline: 15px;
  max-width: 1300px;
}

@layer utilities {
  /* Inline scrollbar utilities (replaced tailwind-scrollbar plugin) */
  .scrollbar-thin { scrollbar-width: thin; }
  .scrollbar-track-gray-1 { --scrollbar-track: #F3F5F6; scrollbar-color: var(--scrollbar-thumb, #8D93A5) var(--scrollbar-track); }
  .scrollbar-thumb-gray-4 { --scrollbar-thumb: #8D93A5; }
  .hover\:scrollbar-thumb-gray-5:hover { --scrollbar-thumb: #BBBEC9; }
}
```

### @theme vs @theme inline

- `@theme {}` — for static values (literals, not CSS var references). TW v4 resolves these at build time.
- `@theme inline {}` — for values that reference CSS custom properties (`var(--design-color-*)`). Forces TW to emit `var(...)` in the output rather than inlining the value.

**Pitfall:** putting a `var(...)` reference inside plain `@theme {}` causes TW v4 to try resolving it as a literal — use `@theme inline {}` for anything CSS-var-backed.

## Breaking changes addressed

| Change | What was done |
|---|---|
| `hover:bg-opacity-95` removed | → `hover:bg-(--color-surface-inverse)/95` |
| `flex-shrink-0` removed | → `shrink-0` |
| `!class` prefix → `class!` suffix | Fixed in `@apply` lines in style.css; TSX files audited |
| `darkMode: "class"` | Dropped — never used as CSS variant in any `.tsx` |
| `extend.spacing` | Dropped — all values follow `n * 0.25rem` exactly in v4 |
| `defaultTheme.fontFamily.sans` spread | Replaced with explicit fallback array |
| `container` utility | Preserved via `@utility container {}` block |
| `tailwind-scrollbar` plugin | 4 utility classes inlined into `@layer utilities` |
| `autoprefixer` in postcss | Dropped — bundled in v4 |

## Audit before migration (do this before any v4 migration)

```bash
# 1. Find all !class prefix usages in TSX
grep -rn ' !\w' apps/storefront/src --include='*.tsx' | grep -v '// '

# 2. Find flex-shrink-0
grep -rn 'flex-shrink-0' apps/storefront/src

# 3. Find bg-opacity / text-opacity (removed in v4)
grep -rn 'bg-opacity\|text-opacity\|border-opacity' apps/storefront/src

# 4. Check plugin usage (scrollbar etc.)
grep -n 'require(' apps/storefront/tailwind.config.ts

# 5. Check darkMode usage in TSX
grep -rn 'dark:' apps/storefront/src --include='*.tsx' | head -20

# 6. Check container usage
grep -rn '\bcontainer\b' apps/storefront/src --include='*.tsx' | head -10
```

## Lockfile approach

`^4.1.18` resolved to `4.3.3` by pnpm at the time of migration. Used the temp-probe technique (see main skill "Lockfile surgery when upgrading npm dependencies"). The pnpm-lock.yaml received 33 new package entries and 29 new snapshot entries for TW4's dependency tree (`@tailwindcss/oxide`, `lightningcss`, `@tailwindcss/node`, `enhanced-resolve`, `jiti`, `tapable`).
