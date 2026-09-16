# Design Token Pipeline — Architecture Decision & StoreTheme History

## ⚠️ Canonical architecture decision (2026-08-04)

**Design tokens must have a single source of truth: `store.tokens.json` → compiler → `tokens.generated.css` → git.**

A Payload CMS `StoreTheme` global was built and then deliberately reverted in the same session. The reason:

> "Remove payload interface completely — this must be done by the agent and trackable."

The Payload admin would have created split state: values in Postgres (runtime) and values in the token files (build-time). Neither would be definitively authoritative. Changes via the admin wouldn't appear in git history; changes via the token pipeline wouldn't reflect in the admin. Token changes need to be trackable (git) and agent-applied (Fox edits the file, runs the compiler, commits).

**The rule:** Do NOT route design token edits through Payload CMS. If an operator wants to change their brand color, Fox edits `store.tokens.json`, runs `node apps/storefront/scripts/design/generate-design.mjs`, and commits. The full diff is in git, no Postgres state required.

---

## Design token pipeline (the correct architecture)

```
store.tokens.json            ← per-store overrides (agent edits this)
  + reference.tokens.json    ← primitive values
  + semantic.tokens.json     ← semantic aliases
  + component.tokens.json    ← component-specific aliases
       ↓
generate-design.mjs          ← DTCG 2025.10 compiler
       ↓
tokens.generated.css         ← committed to git, imported by style.css
       ↓
--reference-* CSS vars        ← primitive layer
  --design-* CSS vars         ← semantic layer (reference vars)
    component vars            ← component layer (design vars)
```

Fox's workflow for a theme change:
1. Edit `apps/storefront/design/themes/store.tokens.json`
2. Run `node apps/storefront/scripts/design/generate-design.mjs`
3. Verify: `grep 'brand-500' apps/storefront/src/app/css/tokens.generated.css`
4. Commit with a descriptive message

### Round-trip smoke test (verified 2026-08-04)

This exact sequence was confirmed working end-to-end:

```bash
# Baseline
grep 'brand-500' apps/storefront/src/app/css/tokens.generated.css
# → --reference-color-brand-500: #3c50e0;

# Edit store.tokens.json — change brand.500 to canary value
# (use patch tool, not terminal sed/awk)

# Compile
node apps/storefront/scripts/design/generate-design.mjs

# Verify change propagated
grep 'brand-500' apps/storefront/src/app/css/tokens.generated.css
# → --reference-color-brand-500: #ff6600;  ← canary confirmed

# Restore original value, recompile, verify back to #3c50e0
```

The compiler produces no stdout on success (silent = good). The only output you need is the grep on the generated file.

**Pitfall:** `store.tokens.json` has multiple entries that look identical in `old_string` context (e.g. `"$description": "Primary brand colour"`). Always read the full file first with `read_file` and use enough surrounding JSON structure to make the patch target unique — e.g. include the `"500": {` key line above the value.

---

## What was built and reverted (historical reference only)

The following was fully implemented and then removed. It is preserved here as a reference for the cast patterns and payload-types.ts manual stub technique — both are reusable in other Payload contexts.

### What was built

| File | Change |
|---|---|
| `apps/storefront/src/globals/StoreTheme.ts` | Payload GlobalConfig — schema |
| `apps/storefront/src/globals/index.ts` | Re-exported `StoreTheme` |
| `apps/storefront/payload.config.ts` | Registered `StoreTheme` in `globals` array |
| `apps/storefront/src/lib/cms/types.ts` | Added `CmsStoreTheme` TypeScript type |
| `apps/storefront/src/lib/cms/queries.ts` | Added `getStoreTheme()`, `defaultStoreTheme` |
| `apps/storefront/src/app/(site)/layout.tsx` | Called `getStoreTheme()`, injected `<head><style>` overriding `--reference-*` CSS vars |

### How the CSS cascade worked (still valid as a pattern for other uses)

The inline `<style>` block overrode only the `--reference-*` layer. All `--design-*` semantic vars and component vars reference them via `var()`, so changing the root cascades through the entire token tree:

```
Payload global
  ↓ (getStoreTheme + layout injection)
--reference-color-brand-500: #3c50e0    ← overrides baked static value
  ↓
--design-color-action-primary-background: var(--reference-color-brand-500)
  ↓
--button-primary-background: var(--design-color-action-primary-background)
```

### Reusable: `payload-types.ts` manual stub when no dev server

`pnpm generate` / `pnpm --filter @apps/storefront generate` calls `generate-payload.ts` which POSTs to `/api/dev/generate` — it **requires the dev server to be running**. In a container or CI without the server up, it exits with `fetch failed`.

**Workaround:** manually patch `payload-types.ts` to add the new global's interface.

**Step 1:** Add to the `globals` and `globalsSelect` maps (lines ~108–120):

```ts
globals: {
  'site-settings': SiteSetting;
  navigation: Navigation;
  footer: Footer;
  'your-new-global': YourNewGlobal;   // ← add
};
globalsSelect: {
  'site-settings': SiteSettingsSelect<false> | SiteSettingsSelect<true>;
  navigation: NavigationSelect<false> | NavigationSelect<true>;
  footer: FooterSelect<false> | FooterSelect<true>;
  'your-new-global': YourNewGlobalSelect<false> | YourNewGlobalSelect<true>;   // ← add
};
```

**Step 2:** Append before the final `declare module 'payload'` block:

```ts
export interface YourNewGlobal {
  id: number;
  /* your group fields as nested optional objects */
  updatedAt?: string | null;
  createdAt?: string | null;
}
export type YourNewGlobalSelect<T extends boolean = true> = T extends true
  ? { /* your group names as T */ }
  : never;
```

**Why this unblocks typecheck:** `payload.findGlobal({ slug: "your-new-global" })` compiles against the `globals` map. Without the stub, TypeScript reports `Type '"your-new-global"' is not assignable to type '"site-settings" | "navigation" | "footer"'`.

Run `pnpm generate` for real once the dev server is available.

### Reusable: cast pattern for untyped globals

When querying a global whose types haven't been generated yet:

```ts
const raw = await payload.findGlobal({ slug: "your-global", draft: isEnabled, depth: 0 });
const doc = raw as unknown as Record<string, unknown>;
const groupField = (doc?.groupName as Record<string, string>) || {};
const value = groupField.fieldName || defaultValue;
```

**Do NOT use `as never as Record<string, never>`** — it collapses value types to `never`, which produces phantom TS errors on every sub-property access. Use `as unknown as Record<string, unknown>` then destructure each group.

### Reusable: site layout `(site)/layout.tsx` notes

- File path contains parentheses — use `read_file` or shell quoting: `cat 'apps/storefront/src/app/(site)/layout.tsx'`
- `<head>...</head>` block goes between `<html>` and `<body>`, not inside `<body>`
- Biome `lint/security/noDangerouslySetInnerHtml` fires on any `dangerouslySetInnerHTML` — suppress with: `// biome-ignore lint/security/noDangerouslySetInnerHtml: <reason>`

### Reusable: Payload global pattern (for non-token globals)

```ts
import type { GlobalConfig } from "payload";
import { adminOnly, publicRead } from "@/access";
import { revalidateSiteGlobal } from "@/hooks/revalidateSite";
import { f, globals } from "@/i18n/admin-labels";

export const MyGlobal: GlobalConfig = {
  slug: "my-global",
  label: globals.myGlobal.singular,
  access: { read: publicRead, update: adminOnly },
  hooks: { afterChange: [revalidateSiteGlobal] },
  fields: [
    {
      name: "groupName",
      type: "group",
      label: f.groupName,
      fields: [
        { name: "fieldName", type: "text", defaultValue: "...", label: f.fieldName },
      ],
    },
  ],
};
```

Add labels in `src/i18n/admin-labels.ts` under `f` and `globals`. Register in `payload.config.ts` `globals` array. Re-export from `src/globals/index.ts`.

---

## Neutral nextmerce-clone token values (active in `store.tokens.json`)

These are committed to `store.tokens.json` as the startup defaults — close to original NextMerce, neutral for operator customization by Impeccable later:

| Token | CSS var | Value |
|-------|---------|-------|
| `reference.color.brand.500` | `--reference-color-brand-500` | `#3c50e0` (NextMerce blue) |
| `reference.color.brand.700` | `--reference-color-brand-700` | `#1c3fb7` (hover) |
| `reference.color.brand.300` | `--reference-color-brand-300` | `#5475e5` (accent) |
| `reference.color.highlight.500` | `--reference-color-highlight-500` | `#3c50e0` (input focus / selected) |

The maroon values (`#860044`, `#6b003e`) remain in `reference.tokens.json` as the base defaults. `store.tokens.json` overrides them via deep merge at compile time.
