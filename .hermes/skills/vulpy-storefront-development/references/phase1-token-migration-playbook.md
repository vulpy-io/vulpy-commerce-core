# Phase 1 Token Migration Playbook

Executed 2026-08-03. Bulk migration of NextMerce legacy template color classes → semantic
design-token Tailwind classes across 100 files / 635 replacements, zero TS errors introduced.

Phase 1 Extended executed 2026-08-03. SVG `fill="#hex"` migration across 6 files / 24 hits,
plus 2 new semantic tokens (`surface.subtle`, `action.selected`) and Tailwind config cleanup.

Phase 2 (non-color tokens) in progress 2026-08-03. Radius primitives bucketed, shadow-7 added,
shadow hex values de-hardcoded, arbitrary `rounded-[n]` and `z-[n]` replaced with named aliases.

---

## What was migrated (the canonical mapping table)

| Legacy class | Semantic replacement | Semantic meaning |
|---|---|---|
| `bg-blue` | `bg-action-primary-background` | Brand primary CTA fill (`#860044`) |
| `hover:bg-blue-dark` | `hover:bg-action-primary-hover` | Brand primary hover (`#6B003E`) |
| `hover:bg-blue` | `hover:bg-action-primary-background` | Same token, hover prefix |
| `hover:bg-dark/90` | `hover:bg-surface-inverse/90` | Opacity modifier — map base first |
| `bg-dark` | `bg-surface-inverse` | Near-black surface (`#333333`) |
| `hover:bg-dark` | `hover:bg-surface-inverse` | Near-black hover |
| `bg-teal` | `bg-surface-muted` | Teal accent → neutral muted (`#F9FAFB`) |
| `text-dark` | `text-content-primary` | Primary body text (`#333333`) |
| `hover:text-dark` | `hover:text-content-primary` | |
| `text-dark-2` | `text-content-secondary` | Medium grey (`#495270`) |
| `text-dark-4` | `text-content-muted` | Muted/placeholder (`#8D93A5`) |
| `text-dark-5` | `text-content-muted` | Same muted token (placeholder) |
| `text-blue` | `text-content-brand` | Brand-colored inline text |
| `hover:text-blue` | `hover:text-content-brand` | |
| `hover:text-blue-dark` | `hover:text-content-brand` | No separate dark-brand token yet |
| `text-red` | `text-status-danger` | Required asterisks, out-of-stock (`#B60802`) |
| `hover:text-red` | `hover:text-status-danger` | |
| `border-blue bg-blue` | `border-action-primary-background bg-action-primary-background` | Selected/active state — match BOTH |
| `border-blue` | `border-action-primary-background` | Standalone border |
| `ring-blue/20` | `ring-focus-ring/20` | Focus ring with opacity |
| `ring-blue` | `ring-focus-ring` | Focus ring |
| `accent-blue` | `accent-action-primary-background` | Checkbox/radio accent |
| `group-hover:bg-blue` | `group-hover:bg-action-primary-background` | Group hover |

**NOT migrated (intentionally):**
- `bg-gray-*`, `bg-white`, neutral utilities — already correct
- `hover:bg-red-50`, `red-light-*` hover states — structural tints, leave as-is
- `bg-blue-1 / border-blue-1` in `EditOrder.tsx` — stale admin widget, manual review
- `text-dark-3`, `text-dark-6` — not in codebase

---

## Phase 1 Extended: SVG `fill="#hex"` migration

### Strategy

Three tiers depending on the SVG's color complexity:

**Tier 1 — single-color monochrome icon** (most common: brand icons, UI icons)
- Add `className="fill-current"` to the `<svg>` element
- Change all `fill="#hex"` on child `<path>`, `<circle>`, `<rect>` → `fill="currentColor"`
- Set the desired color via a Tailwind `text-*` class on the `<svg>` or a parent element
- Do NOT change `fill="none"` on the `<svg>` itself — this controls the SVG background, not paths

```tsx
// Before
<svg fill="none" ...>
  <path fill="#860044" d="..." />
</svg>

// After
<svg fill="none" className="fill-current text-content-brand" ...>
  <path fill="currentColor" d="..." />
</svg>
```

**Tier 2 — two-color decorative SVG** (e.g. EmptyCart illustration: grey background circle + muted icon)
- Using `fill="currentColor"` is NOT viable because both paths share the same SVG
- Use direct CSS var references on individual elements instead:

```tsx
// fill="#F3F4F6" (background circle) → fill="var(--design-color-surface-subtle)"
// fill="#8D93A5" (icon paths) → fill="var(--design-color-content-muted)"
<circle cx="50" cy="50" fill="var(--design-color-surface-subtle)" r="50" />
<path fill="var(--design-color-content-muted)" d="..." />
```

This is acceptable for multi-color illustrations that are not expected to change together.
Do NOT add `fill-current` to the SVG wrapper in this case.

**Tier 3 — keep as-is**
- `fill="white"` checkmarks inside coloured shapes — part of an inseparable group; leave white
- Subtle `fill="none"` backgrounds and clipPath rect fills — not color tokens

### Hardcoded hex → token mapping (Phase 1 Extended)

| Hex | Token alias | Tailwind class |
|---|---|---|
| `#860044` | `content.brand` | `text-content-brand` |
| `#22AD5C` | `commerce.inStock` | `text-commerce-in-stock` |
| `#F23030` / `#F23030` | `status.danger` | `text-status-danger` |
| `#B60802` | `status.danger` | `text-status-danger` |
| `#8D93A5` | `content.muted` | `text-content-muted` (or CSS var for multi-color SVG) |
| `#F3F4F6` | `surface.subtle` | `text-surface-subtle` (or CSS var for multi-color SVG) |
| `#FDFDFD` | white/near-white | `text-white` |
| `#CCD74D` | `action.selected` | `text-action-selected` |
| `#495270` | `content.secondary` | `text-content-secondary` |

### Tailwind config: `boxShadow` hardcoded hex
The `boxShadow.input` value contained a hardcoded `#CCD74D`. Replace with CSS var:
```ts
// Before
input: "inset 0 0 0 2px #CCD74D",
// After
input: "inset 0 0 0 2px var(--design-color-action-selected)",
```
Always audit `tailwind.config.ts` `boxShadow` entries for hardcoded hex alongside fill/stroke scanning.

### New tokens added in Phase 1 Extended

**reference.tokens.json:**
```json
"highlight": {
  "500": { "$type": "color", "$value": "#ccd74d" }
}
```

**semantic.tokens.json:**
```json
"surface": {
  "subtle": { "$type": "color", "$value": "{reference.color.neutral.100}" }
},
"action": {
  "selected": { "$type": "color", "$value": "{reference.color.highlight.500}" }
}
```

**tailwind.config.ts** additions:
```ts
"surface-subtle": "var(--design-color-surface-subtle)",
"action-selected": "var(--design-color-action-selected)",
```

### Audit commands for SVG fill debt

```bash
# Find all hardcoded hex fills in TSX files
grep -rn 'fill="#[0-9A-Fa-f]' apps/storefront/src --include='*.tsx' | grep -v node_modules

# Find inline styles with hex colors
grep -rn 'style={{.*#\|style=".*#' apps/storefront/src --include='*.tsx' | grep -v node_modules

# Find hardcoded hex in tailwind.config.ts (shadows, borders)
grep '#[0-9A-Fa-f]' apps/storefront/tailwind.config.ts
```

---

## Phase 2: Non-color token migration (radius, shadow, z-index)

Executed 2026-08-03. Arbitrary `rounded-[n]`, `z-[n]` Tailwind JIT values replaced with named
semantic aliases. Shadow-7 gap filled, shadow hex values de-hardcoded.

### Scanning technique

Before adding any tokens, grep to understand actual usage patterns:

```bash
# Arbitrary radius values — count + values
grep -rohn 'rounded-\[[^]]*\]' apps/storefront/src --include='*.tsx' \
  | grep -oP 'rounded-\[[^\]]+\]' | sort | uniq -c | sort -rn

# Arbitrary z-index values
grep -rohn '\bz-\[[^]]*\]' apps/storefront/src --include='*.tsx' \
  | grep -oP 'z-\[[^\]]+\]' | sort | uniq -c | sort -rn

# Named shadow usage (find gaps like shadow-7 with no definition)
grep -rohn '\bshadow-[a-z0-9-]*' apps/storefront/src --include='*.tsx' \
  | grep -oP 'shadow-[a-z0-9-]+' | sort | uniq -c | sort -rn
# Then cross-check against tailwind.config.ts boxShadow keys

# Arbitrary shadow values
grep -rohn 'shadow-\[[^]]*\]' apps/storefront/src --include='*.tsx' \
  | grep -oP 'shadow-\[[^\]]+\]' | sort | uniq -c | sort -rn

# Named z-index usage
grep -rohn '\bz-[0-9]*' apps/storefront/src --include='*.tsx' \
  | grep -oP 'z-[0-9]+' | sort | uniq -c | sort -rn
```

**Key insight:** always scan actual named utility usage too, not just arbitrary values — you'll
find gaps (like `shadow-7`) where a named utility is used but has no definition in tailwind.config.ts.

### Radius bucketing (this codebase)

Arbitrary values mapped to semantic roles:

| Arbitrary | px | Role | Token |
|---|---|---|---|
| `rounded-[4px]` | 4px | control (close enough) | `rounded-control` → 5px |
| `rounded-[5px]` | 5px | controls, inputs, search, variant selectors | `rounded-control` → 5px |
| `rounded-[10px]` | 10px | checkout panels, wishlist cards, blog thumbnails | `rounded-panel` → 10px |
| `rounded-[15px]` | 15px | modal (close enough) | `rounded-panel` → 10px |
| `rounded-[30px]` | 30px | status badges, category pills | `rounded-badge` → 30px |

**Named Tailwind defaults left untouched:** `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`, `rounded-sm`
These are Tailwind built-in defaults — migrate only as part of the Tailwind v4 upgrade.

### Reference + semantic tokens added (Phase 2)

**reference.tokens.json** additions:
```json
"radius": {
  "control": { "$type": "dimension", "$value": { "value": 5, "unit": "px" } },
  "panel":   { "$type": "dimension", "$value": { "value": 10, "unit": "px" } },
  "badge":   { "$type": "dimension", "$value": { "value": 30, "unit": "px" } }
}
```

These join existing `none` (0), `sm` (4), `md` (8), `lg` (12), `pill` (999).

**semantic.tokens.json** additions:
```json
"radius": {
  "control": { "$type": "dimension", "$value": "{reference.radius.control}" },
  "panel":   { "$type": "dimension", "$value": "{reference.radius.panel}" },
  "badge":   { "$type": "dimension", "$value": "{reference.radius.badge}" }
}
```

Joins existing `card` (`reference.radius.md = 8px`) and `overlay` (`reference.radius.lg = 12px`).

**tailwind.config.ts** additions:
```ts
borderRadius: {
  "product-card": "var(--product-card-radius)",
  control: "var(--design-radius-control)",
  panel:   "var(--design-radius-panel)",
  badge:   "var(--design-radius-badge)",
},
```

### Shadow gaps and hex cleanup

**Missing shadow-7:** `shadow-7` was used in `Orders/OrderModal.tsx` but had no definition
in `tailwind.config.ts` — rendering as nothing (invisible shadow). Always cross-check usage
against definitions:

```bash
# Find all named shadow classes used in source
grep -rohn '\bshadow-[a-z0-9-]*' apps/storefront/src --include='*.tsx' \
  | grep -oP 'shadow-[a-z0-9-]+' | sort -u

# Compare against defined keys in config
grep -A 20 'boxShadow:' apps/storefront/tailwind.config.ts
```

Fix: add the missing entry to `tailwind.config.ts` boxShadow.

**Shadow hex cleanup:** `breadcrumb`, `filter`, and `list` shadow definitions used hardcoded
`#E5E7EB`. Replace with `var(--reference-color-neutral-200)`:

```ts
// Before
breadcrumb: "0px 1px 0px 0px #E5E7EB, 0px -1px 0px 0px #E5E7EB",
filter: "0px 1px 0px 0px #E5E7EB",
list: "1px 0px 0px 0px #E5E7EB",
// After
breadcrumb: "0px 1px 0px 0px var(--reference-color-neutral-200), 0px -1px 0px 0px var(--reference-color-neutral-200)",
filter: "0px 1px 0px 0px var(--reference-color-neutral-200)",
list: "1px 0px 0px 0px var(--reference-color-neutral-200)",
```

Note: reference-layer vars (`--reference-color-*`) are acceptable in tailwind.config.ts shadow
definitions because `boxShadow` values aren't first-class token targets yet. When shadow tokens
are wired into the DTCG files, move these to `--design-shadow-*` vars.

### z-index cleanup

This codebase uses named `z-index` values in tailwind.config.ts: `999999, 99999, 9999, 999, 99, 1`.
The arbitrary `z-[9999]` etc. already have exact named equivalents. Replace directly:

```
z-[9999]   → z-9999
z-[99999]  → z-99999
z-[999999] → z-999999  (if found)
```

No new tokens needed for z-index — it's a named-scale cleanup, not a semantic token gap.

### Verification (Phase 2)

```bash
# No arbitrary radius values remain
grep -rn 'rounded-\[' apps/storefront/src --include='*.tsx'
# expected: empty

# No arbitrary z-index values remain
grep -rn '\bz-\[' apps/storefront/src --include='*.tsx'
# expected: empty

# No arbitrary shadow values remain
grep -rn 'shadow-\[' apps/storefront/src --include='*.tsx'
# expected: empty (or only the 1 rgba outlier that has no token)

# Design tests still pass
node --test apps/storefront/scripts/design/*.test.mjs
# expected: 4/4 pass
```

---

## Tailwind v3 semantic token wiring (tailwind.config.ts)

Before running a migration, add CSS-var-backed semantic color entries to the `theme.colors` block.
These names must match the replacement targets above exactly.

```ts
// inside theme.colors, after the "product-card" block:
"action-primary-background": "var(--design-color-action-primary-background)",
"action-primary-hover":      "var(--design-color-action-primary-hover)",
"action-primary-foreground": "var(--design-color-action-primary-foreground)",
"content-primary":           "var(--design-color-content-primary)",
"content-secondary":         "var(--design-color-content-secondary)",
"content-muted":             "var(--design-color-content-muted)",
"content-brand":             "var(--design-color-content-brand)",
"content-inverse":           "var(--design-color-content-inverse)",
"surface-canvas":            "var(--design-color-surface-canvas)",
"surface-inverse":           "var(--design-color-surface-inverse)",
"surface-muted":             "var(--design-color-surface-muted)",
"surface-raised":            "var(--design-color-surface-raised)",
"surface-subtle":            "var(--design-color-surface-subtle)",
"status-danger":             "var(--design-color-status-danger)",
"status-danger-surface":     "var(--design-color-status-danger-surface)",
"status-success":            "var(--design-color-status-success)",
"focus-ring":                "var(--design-color-focus-ring)",
"border-subtle":             "var(--design-color-border-subtle)",
"border-strong":             "var(--design-color-border-strong)",
"commerce-sale":             "var(--design-color-commerce-sale)",
"commerce-price":            "var(--design-color-commerce-price)",
"commerce-in-stock":         "var(--design-color-commerce-in-stock)",
"commerce-out-of-stock":     "var(--design-color-commerce-out-of-stock)",
"action-selected":           "var(--design-color-action-selected)",
```

**Note:** TW3 does NOT support opacity modifiers (`/XX`) on custom CSS var tokens by default.
For `bg-surface-inverse/90`-style usage, the token must also be registered in `extend.colors`
OR the opacity is applied via arbitrary syntax `bg-[--design-color-surface-inverse]/90`.
The migration uses the named token form — this works in Tailwind 3 when the value is a CSS var,
because Tailwind auto-generates `bg-opacity` utilities when colors are specified as plain hex,
but CSS vars are treated as opaque strings. Use the `bg-surface-inverse/90` form only after
verifying it actually resolves; otherwise fall back to `bg-[color:var(--design-color-surface-inverse)]/90`.

---

## Modifying token JSON files from execute_code

**Do NOT use `read_file()["content"]` from `hermes_tools` in execute_code** — it raises `KeyError: 'content'`.
Also do not use the line-number stripping approach: `read_file` output format is unreliable in execute_code context.

**Correct pattern: use `terminal("cat ...")` to load JSON:**

```python
from hermes_tools import terminal, write_file
import json

ref = json.loads(terminal("cat apps/storefront/design/tokens/reference.tokens.json", workdir="/app/workspace")["output"])
sem = json.loads(terminal("cat apps/storefront/design/tokens/semantic.tokens.json", workdir="/app/workspace")["output"])

# mutate...
ref["reference"]["radius"]["control"] = {"$type": "dimension", "$value": {"value": 5, "unit": "px"}}

write_file("/app/workspace/apps/storefront/design/tokens/reference.tokens.json", json.dumps(ref, indent=2) + "\n")
```

This is the only reliable pattern for read-modify-write on JSON token files inside execute_code.
After writing, regenerate CSS:
```bash
node apps/storefront/scripts/design/generate-design.mjs
```

---

## Migration script technique

Location: `apps/storefront/scripts/design/migrate-legacy-tokens.mjs`

**Critical: class-boundary anchors**

Naive string replace hits partial matches (e.g. `text-dark` inside `text-dark-4`). The script
uses a lookbehind + lookahead that only fires inside a class attribute string:

```js
const re = new RegExp(
  `(?<=[\\s"'\`{:/\\\\])${esc}(?=[\\s"'\`}:/\\\\\\n])`,
  "g"
);
```

This fires only when the token is preceded/followed by a class delimiter (space, quote, backtick,
`{`, `}`, `/`, `\\`, newline). This correctly handles:
- `"text-dark"` at string boundaries
- `text-dark ` (space-separated in className lists)
- `` `text-dark ${...}` `` (template literals)
- `text-dark-4` — NOT matched by `text-dark` because `4` is not a delimiter

**Ordering discipline:**
- Most-specific tokens first (`hover:bg-dark/90` before `hover:bg-dark` before `bg-dark`)
- Combined states first (`border-blue bg-blue` before `border-blue`)
- Longer prefixes first (`text-dark-4` before `text-dark`, `hover:text-blue-dark` before `hover:text-blue`)

**idempotency:**
Re-running the script after a successful migration produces 0 changes because the new class names
don't match any `from` pattern in the table.

---

## Manual fixes required after bulk migration

**1. Stale "active Sale nav" item in Header**

The `text-blue-dark` (a template shade, not a standard utility) is used for the active Sale
nav link in two places (`Header/index.tsx` line ~435 and ~542). Since there's no
`hover:text-blue-dark` TW utility, the regex doesn't catch it. Patch manually:

```tsx
// Before
pathUrl === PSEUDO_CATEGORY_SALE.route ? "text-blue-dark" : "text-content-brand"
// After
pathUrl === PSEUDO_CATEGORY_SALE.route ? "text-content-brand" : "text-content-brand"
```

Both branches collapse to the same token — the active state just means "always brand color."
If a bolder active indicator is needed, add an underline or `font-semibold` instead of a color shift.

**2. EditOrder.tsx double-class artifact**

`bg-blue` migrated correctly to `bg-action-primary-background`, BUT the original class string
was `border border-blue-1 bg-blue bg-blue-1` — a stale template artifact. After migration:
`border border-blue-1 bg-action-primary-background bg-blue-1` (duplicated junk). Clean to:

```tsx
className="mt-5 w-full rounded-[10px] bg-action-primary-background px-5 py-3.5 text-content-inverse text-custom-sm"
```

Remove the `border-blue-1` and `bg-blue-1` stale classes entirely — `blue-1` is not a defined
Tailwind color and was never rendering.

**3. Pre-existing TS2865 in BlogItem.tsx**

`BlogItem.tsx` imports `{ BlogItem }` from its type module but names the component `BlogItem` too.
With `isolatedModules`, this requires `import type`:

```tsx
// Before
import { BlogItem } from "@/types/blogItem";
// After
import type { BlogItem } from "@/types/blogItem";
```

This error existed before the migration but is surfaced because the file was touched. Fix it
in the same pass.

---

## Verification checklist

```bash
# 1. No legacy template color classes remain
grep -rn 'bg-blue\|text-dark\b\|text-dark-4\|bg-dark\b\|accent-blue\|text-blue\b\|bg-teal\|text-red\b' \
  apps/storefront/src --include='*.tsx' --include='*.ts'
# expected: empty

# 2. No hardcoded hex fills remain in SVG elements
grep -rn 'fill="#[0-9A-Fa-f]' apps/storefront/src --include='*.tsx'
# expected: empty (or only whitelisted decorative exceptions with a comment)

# 3. No hardcoded hex in tailwind.config.ts boxShadow / borders
grep '#[0-9A-Fa-f]' apps/storefront/tailwind.config.ts
# expected: only intentionally non-tokenized values (e.g. rgba() borders)

# 4. No arbitrary radius or z-index values remain
grep -rn 'rounded-\[\|z-\[' apps/storefront/src --include='*.tsx'
# expected: empty

# 5. TypeCheck
cd apps/storefront && node_modules/.bin/tsc --noEmit
# expected: no output (clean)

# 6. Design tests
node --test apps/storefront/scripts/design/*.test.mjs
# expected: 4/4 pass
```

---

## Token CSS variable prefix convention

- Semantic layer: `--design-color-*`, `--design-font-*`, `--design-motion-*`, `--design-radius-*`
- Component layer: unprefixed, e.g. `--product-card-background`, `--button-primary-background`
- Reference layer: `--reference-color-*`, `--reference-font-*`, etc.

Do NOT expose `--reference-*` vars as Tailwind color names. They are building blocks for semantic
vars only, referenced only in `tokens.generated.css` `:root`.

---

## Remaining legacy debt (after Phase 1 + Phase 1 Extended + Phase 2)

1. **Arbitrary radius/z-index** — being migrated in Phase 2 (agent in-flight at time of writing)
2. **Header monolith** (`Header/index.tsx`, 593 lines) — SVG fills migrated; structural decomposition is separate (Phase 2+)
3. **Tailwind v4 upgrade** — currently on TW3; Epic #48 targets TW4 + design tokens together
4. **Named Tailwind defaults** (`rounded-md`, `rounded-lg`, `rounded-xl`) — left for TW4 migration
5. **Direction gate** — three art-direction sketches needed before broad component redesign (plan §7.1)

## pnpm path in container

In the Hermes agent container, `pnpm` is not on the default PATH. Use:
```bash
/usr/lib/node_modules/corepack/shims/pnpm <command>
```
Or run design tests directly with Node:
```bash
node --test apps/storefront/scripts/design/*.test.mjs
```

---

## Parallel delegation pattern for SVG fill migration

When migrating fills across 5+ files in parallel, dispatch two agents concurrently:
- Agent 1 → Header (largest file, most occurrences, highest uniqueness-failure risk)
- Agent 2 → All remaining smaller files in a single task

**Context to include in each task:**
- Exact line numbers for each hit (from a prior `grep -n` scan)
- Which tier (monochrome / decorative / keep-as-is)
- What token → Tailwind class to apply on the parent
- Which fills to leave unchanged (e.g. `fill="white"` checkmarks, `fill="none"`)
- The verification command to run and report back (`grep -rn 'fill="#' [files]`)

**After agents land:** always re-run the full-repo hex scan yourself before declaring done:
```bash
grep -rn 'fill="#[0-9A-Fa-f]' apps/storefront/src --include='*.tsx' | grep -v node_modules
```
Agents may miss occurrences or partially patch — the parent scan is the source of truth.

---

## Biome `useSortedClasses` after delegation

When a subagent adds `className="fill-current"` to SVG elements, Biome's
`lint/nursery/useSortedClasses` rule fires because the new class is inserted in an
unsorted position relative to existing classes on the same element.

**These errors are FIXABLE — auto-resolve in one command:**
```bash
npx biome check --write apps/storefront/src/components/Header/index.tsx
# Output: "Checked 1 file in Xms. Fixed 1 file."
```

**Detection:** run scoped biome check after delegation lands and before running typecheck:
```bash
npx biome check apps/storefront/src/components/Header/index.tsx 2>&1 | grep -E 'FIXABLE|error'
```

The root-level `pnpm check` fails with a nested-root-config error (`impeccable/biome.json`)
that predates this work — use scoped `npx biome check [files]` to gate individual file changes.
