# Impeccable — Vendored Tool

This directory vendors the **Impeccable tool** (detector CLI + live mode with the
browser picker UI) at a pinned upstream commit. Upstream code is **unmodified** —
the files here are byte-identical copies of the pinned upstream tree (verified by
`diff -r` at vendor time).

## Pin

| Field | Value |
|-------|-------|
| Upstream repo | `pbakaus/impeccable` (GitHub) |
| Pinned commit | `c5e1ddd054dc093ef2546c36b82eddf2c4e84bb9` (2026-07-31) |
| npm dist-tag at pin | `impeccable@3.5.0` |
| skill/plugin version at pin | v4.0.4 |
| License | Apache-2.0 (`LICENSE`) |

## Why GitHub, not npm

npm `impeccable@3.5.0` ships **only** the detector CLI (`cli/` — see the
`files` allowlist in the upstream `package.json`). The live-mode machinery —
`skill/scripts/` (live-server, live-browser picker overlay, framework
injectors, session store) and `skill/reference/live*.md` — is **not** in the
npm tarball. Vendoring from the GitHub checkout at the pinned commit captures
the full tool. The scripts are zero-dependency ESM and require Node >= 22.12
(Node v24 is available in this repo's toolchain).

## Vendored contents

| Path | What it is |
|------|------------|
| `cli/` | Detector CLI (`cli/bin/cli.js` is the `impeccable` bin entry), engines, rules, findings, browser-injected detector |
| `skill/scripts/` | Live-mode machinery: `live.mjs` (boot), `live-server.mjs` (start/stop server), `live-inject.mjs` (tag injection), `live-browser*.js` (picker overlay), `live/frameworks/` (Next.js, Vite, SvelteKit, Astro, Nuxt, TanStack Start, static HTML injectors), session store, journal |
| `skill/reference/live.md`, `live-setup.md` | Upstream live-mode playbook docs |
| `package.json` | Upstream manifest (name `impeccable`, version `3.5.0`, bin mapping, Apache-2.0) |
| `LICENSE`, `NOTICE.md` | Apache-2.0 license + third-party notices |
| `PIN.md` | This file |

## NOT vendored (intentionally)

- `SKILL.src.md`, `agents/`, `demos/`, `docs/`, `tests/`, `extension/`,
  `plugin/`, `.claude/`, `.cursor/`, `.github/`, root `AGENTS.md`/`CLAUDE.md`/
  `README.md`/`DESIGN.md`/`PRODUCT.md`, build scripts, `bun.lock` — i.e. the
  skill/plugin packaging and the rest of the upstream repo. Skill playbooks
  are under a separate review and are out of scope for this vendoring task.
- `skill/scripts` files unrelated to the live/detect toolchain were kept only
  insofar as they are required by the live machinery; the vendored set is the
  full `skill/scripts` tree as shipped upstream (116 files, ~3.1 MB).

## Upgrade procedure

1. Fetch the new upstream tree at the target commit (e.g.
   `git -C /tmp clone https://github.com/pbakaus/impeccable.git` then
   `git checkout <new-sha>`).
2. Replace the vendored copies: `rsync -a --delete <new>/cli/ impeccable/cli/`,
   `<new>/skill/scripts/ impeccable/skill/scripts/`,
   `<new>/skill/reference/live*.md impeccable/skill/reference/`, and the
   top-level `package.json`/`LICENSE`/`NOTICE.md`.
3. `diff -r` against upstream to confirm byte-identical, then update the pin
   table above and this file's contents table if the tree shape changed.
4. Re-run the verification in the storefront worktree (detect, live boot/stop,
   typecheck, `pnpm check`) before committing the bump.

## Runbook

From the repo root (`/app/workspace` or a checkout):

```bash
# 1. Detector CLI — scan a source tree, emit JSON findings
node impeccable/cli/bin/cli.js detect --json apps/storefront/src/

# 2. Live mode — start the helper server + inject the overlay script
cd apps/storefront
node ../../impeccable/skill/scripts/live.mjs
# prints {"ok":true,...} with serverPort/token/pageFiles; injects
# impeccable-live-start/end markers + <script src="http://localhost:8400/live.js?token=...">

# 3. Open the dev shop URL in the browser (NOT serverPort) — the overlay
#    loads from http://localhost:8400/live.js

# 4. Stop — removes injected tags + stops the helper server
node ../../impeccable/skill/scripts/live-server.mjs stop
```

Storefront npm scripts (added by this task):

```bash
pnpm --filter @apps/storefront impeccable:detect   # node ../../impeccable/cli/bin/cli.js detect src --json
pnpm --filter @apps/storefront impeccable:live     # node ../../impeccable/skill/scripts/live.mjs
```

## Topology

- The live helper server binds `127.0.0.1:8400` — run it on the **same machine
  as the browser**. For the operator that is the host (via
  `pnpm --filter @apps/storefront impeccable:live`). Inside the Hermes
  container it is usable only for Fox-internal verification (headless
  container browser), not for the operator's real browser.
- Live config lives at `apps/storefront/.impeccable/live/config.json` and
  targets **both** route-group layouts (`(site)` shop + `(payload)` Payload
  admin) because there is no root `src/app/layout.tsx` in this app.
- On first boot the tool appends `# impeccable-live-ignore-start/end` patterns
  to the app `.gitignore` — that is native behavior; do not pre-add or strip
  it manually.

## Known limitations

- **Payload admin layout anchor:** `apps/storefront/src/app/(payload)/layout.tsx`
  has no literal `</body>` in source (it renders `@payloadcms/next`'s
  `RootLayout`, which emits `<body>` at runtime). With `insertBefore:
  "</body>"` the live boot injects the shop layout and reports `ok:true`, but
  the payload layout reports `insertion_point_not_found` per-file. The
  Payload admin does not get the overlay unless the anchor changes or the
  file is extended; acceptable for now (Payload admin is not a designed
  surface).
- **Medusa admin (dev):** `medusa develop` generates the admin SPA entry at
  `apps/medusa-backend/.medusa/admin/` (`.medusa/` is gitignored; the
  generated `index.html` does not exist in a fresh checkout and is rebuilt on
  every admin rebuild). No committed live config was added for it: injection
  would require re-running `live.mjs` from `apps/medusa-backend` after each
  admin rebuild (native documented behavior). Revisit when/if the admin HTML
  entry becomes a stable committed artifact.
- **CSP:** no CSP is auto-patched. The native flow (`detect-csp`) asks the
  operator; that consent flow stays.
