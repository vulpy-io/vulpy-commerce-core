---
name: ai-design-tooling
description: Evaluate, integrate, and use AI coding agent design tools (Impeccable, design tokens, anti-pattern detectors) for storefront and web development. Load when assessing design quality tooling, setting up DESIGN.md-based design systems, or wiring design token pipelines in Next.js/ecommerce projects.
version: 1.1.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design, ai-agents, design-tokens, impeccable, design-system, storefront, nextjs, ecommerce, anti-patterns]
    related_skills: [storefront-best-practices, design-md, vulpy-storefront-development]
---

# AI Design Tooling for Storefronts

Skills and reference for evaluating, integrating, and correctly positioning AI-agent design tools in web and ecommerce projects — including Impeccable, DESIGN.md pipelines, and anti-pattern detection.

## When to Use This Skill

- User asks about design quality tooling for an AI-assisted storefront workflow
- Evaluating whether a tool (e.g. Impeccable) can serve as an end-user customizer
- Setting up DESIGN.md-based design token pipelines in a Next.js project
- Wiring anti-pattern detection into CI for a storefront
- Generating or consuming design tokens programmatically

## The Critical Positioning Distinction

AI coding-agent design tools are primarily **developer workflow systems**. Do not turn that positioning into an unqualified claim that integration is impossible: distinguish an upstream-supported harness integration from a custom broker/adapter.

### Correct uses (developer workflow)
- CI quality gate: `npx impeccable detect --json src/` in PR pipelines
- AI-assisted development through a supported harness
- Design-system documentation and durable project context
- Command-driven design refinement such as `/impeccable audit checkout`

### Unsupported or adapter-owned uses
- End-user theme customization: no supported end-user product surface exists
- Multi-tenant customization: requires a host-owned authorization, tenancy, session, and revision model
- Backend token service: do not infer a REST API or stable token schema from internal files
- Production browser customization: live mode is a localhost-oriented development workflow

A host can build an adapter, but it then owns the security, event durability, source-control boundaries, compatibility tests, and upgrades. State this as **custom/unsupported**, not simply “cannot be done.”

## Bridging live visual feedback to an agent UI

Impeccable live events identify a visual action, but they do not establish which agent chat, browser tab, user, tenant, or workspace is authorized to execute it. For embedded-preview integrations, introduce a trusted broker that:

1. resolves an opaque preview binding to the authenticated store, allowed workspace, and originating UI conversation;
2. validates and durably deduplicates `generate` / `accept` / `discard` events;
3. serializes writers per checkout and records revision-aware checkpoints;
4. submits work through the agent's supported run/session API or through the host UI's normal chat path;
5. propagates cancellation to both the agent run and child coding process.

Keep agent API keys and webhook secrets out of the overlay/browser. Do not assume that correlating a backend run with `session_id` makes an already-open frontend render it. Exact same-chat progress requires the host UI to own or relay the normal chat stream; otherwise use an adjacent progress panel and canonical-session reconciliation.

Load `building-resilient-agent-interfaces` for the full run-replay, one-stream-owner, and external-event correlation pattern. Its `references/hermes-external-event-bridge.md` captures the verified Hermes-specific boundaries.

## Source-audit discipline

For fast-moving agent tooling, always pin claims to a fetched revision and separate five version axes: Git HEAD, npm package version, skill/plugin version, extension version, and tags. They may intentionally differ.

1. Fetch the default remote and record clean/dirty status, full SHA, author/committer timestamp, subject, default branch, and nearest tag.
2. Read `package.json` for engine, exports, packed files, dependencies, and scripts. Distinguish consumer runtime requirements from contributor/build tooling.
3. Treat `package.json#exports` as the programmatic support boundary. An `export` in an internal file may exist only for tests.
4. Trace installers from provider aliases through destination paths, provider transformations, hook merging, overwrite/update behavior, and agent sidecars. Do not infer outputs solely from README examples.
5. Separate human-readable artifacts from machine sidecars. Require a published versioned schema before making internal JSON a product contract.
6. For live mode, trace browser → server → agent → completion/accept/discard, then test the deployment topology: loopback, container networking, HTTPS/mixed content, CORS, CSP, iframe origin, and cleanup.
7. Label every recommendation **documented**, **exported**, **observed internal**, or **proposed adapter**.

Avoid destructive fixture setup such as unconditional `rm -rf`. Use a newly created unique temporary directory and clean it only after explicit scope is established; static source tracing is preferable when installer execution is not needed.

## Impeccable

The dominant AI coding-agent design skill ecosystem. See `references/impeccable-deep-dive.md` for the revision-pinned audit: Git/package/skill versions, installer outputs, public-versus-internal boundaries, detector exit behavior, live-mode topology, and Hermes/Fox integration guidance.

**Revision-pinned facts (re-check before reuse):**
- Audit snapshot: Git `c5e1ddd054dc093ef2546c36b82eddf2c4e84bb9` (2026-07-31)
- npm package/latest then: `impeccable@3.5.0`; separate skill/plugin version: `4.0.4`
- License/runtime: Apache-2.0, Node `>=22.12.0`; repository builds use Bun
- Installer supports 15 harness targets, including Claude, Cursor, Codex, Gemini, GitHub, Grok, OpenCode, Kiro, Pi, Qoder, Trae, Rovo Dev, Vibe, and Antigravity
- 23 design commands and 59 deterministic detector rules were documented at that revision
- No upstream Hermes provider was present

### Wiring Impeccable as an in-repo submodule (Vulpy / pnpm monorepo)

Impeccable is not published correctly for `npx --yes impeccable@3.5.0` to work reliably inside a container. The correct install path in a pnpm monorepo:

```bash
# 1. Register as git submodule (it has its own .git)
git submodule add --force https://github.com/pbakaus/impeccable.git impeccable

# 2. Add to pnpm-workspace.yaml
echo '  - "impeccable"' >> pnpm-workspace.yaml

# 3. Reference workspace:* in root + app package.json
# "impeccable": "workspace:*"

# 4. Use node directly (bypasses .bin symlink ownership issues in containers)
# "impeccable:detect": "node ../../impeccable/cli/bin/cli.js detect src --json"

# 5. CI checkout must recurse submodules
# - uses: actions/checkout@v4
#   with:
#     submodules: recursive
```

**Why not `npx --yes`:** In a container with no npm cache and rate-limited npm registry, `npx --yes impeccable@3.5.0` is unreliable and wastes bandwidth. The submodule approach: zero network calls in CI (git submodule checkout), no `.bin` write needed, works offline.

**Detector exit codes (verified 3.5.0):**
- `0` — no findings
- `2` — primary findings present (CI-fail)
- `1` — error/misconfiguration

This means `|| true` is wrong for CI gates — let it exit 2 and fail the job. The gate is meaningful.

**Sole real finding on a fresh nextmerce-clone codebase:** `border-l-4` in `.cms-prose blockquote` (side-tab anti-pattern, rule `w >= 3`). Fix: `border-l-2`. After fix, detector exits 0.

### Install
```bash
npx impeccable install                      # interactive, detects harnesses
npx impeccable install -y --providers=claude,codex --scope=project  # non-interactive
npx impeccable update                       # update skill bundles
```

### CLI Anti-Pattern Detection
```bash
npx impeccable detect src/                  # scan files
npx impeccable detect --json src/           # JSON output (CI-friendly)
npx impeccable detect https://example.com   # URL scan (optional Puppeteer dep)
```

### Programmatic API boundaries

Before recommending imports, inspect the current `package.json` `exports` map and the actual exported facade at the audited revision. For Impeccable 3.5.0, only `impeccable` and `impeccable/browser` are package entrypoints; live-mode modules, installer helpers, design-system loaders, event vocabulary, and artifact-schema modules are not public package exports.

Do **not** recommend deep imports or copy named exports from internal modules merely because functions are exported there. Some internal installer exports are explicitly a test surface. Verify each public symbol with a smoke import from the packed package when implementation is requested.

## DESIGN.md and sidecars

Treat `DESIGN.md` as a human-readable, version-controlled project authority. Treat `.impeccable/design.json` and executable artifact-schema modules as Impeccable internals unless the audited release publishes a stable, versioned schema.

At the 2026-07-31 audit revision, no standalone JSON Schema was found and schema logic lived in JavaScript under the skill/plugin payload. Therefore:

- do not hard-code a Payload/database contract to the current sidecar shape;
- do not claim a stable `schemaVersion` without source evidence from the audited revision;
- keep a Vulpy-owned token schema if structured multi-tenant tokens are required;
- generate or synchronize `DESIGN.md` at a deliberate boundary rather than treating internal normalized objects as an API.

## Token-to-Tailwind/CSS Bridge

Impeccable does not establish a stable Tailwind/CSS export API. If a production token bridge is needed:

1. define the Vulpy-owned token contract first;
2. parse only a documented artifact or a deliberately pinned snapshot;
3. validate generated CSS/Tailwind output in CI;
4. keep CSS custom properties as the runtime boundary when stores need theme overrides.

Do not recommend `parseDesignFrontmatter` from the `impeccable` package unless a smoke import against the exact installed package proves that symbol is publicly exported. Do not infer third-party DESIGN.md CLI commands from repository prose without checking the current tool.

## Neutral starting palette (nextmerce-clone)

When the operator has not yet applied a brand and wants a neutral commercial-looking starting point, use the NextMerce upstream blue palette. These values belong in `store.tokens.json` (the per-store override layer), not in `reference.tokens.json`:

| Token path | Value | Role |
|---|---|---|
| `reference.color.brand.500` | `#3c50e0` | Primary (NextMerce blue) |
| `reference.color.brand.700` | `#1c3fb7` | Hover / darker |
| `reference.color.brand.300` | `#5475e5` | Accent / lighter |
| `reference.color.brand.50` | `#eef1fc` | Lightest tint |
| `reference.color.brand.100` | `#c3cdf5` | Light tint |
| `reference.color.brand.900` | `#0d1f6b` | Deepest shade |
| `reference.color.highlight.500` | `#3c50e0` | Input focus ring + selected (same as brand) |

Impeccable refines per-brand once the operator has a clear brand direction.

**Canonical pipeline — single source of truth:**
```
store.tokens.json  →  generate-design.mjs  →  tokens.generated.css  →  git commit
   (operator/Fox edit)   (compiler)             (static CSS vars)       (trackable)
                                  ↓
                    Impeccable live feedback → operator approval → Fox edits store.tokens.json → commit
```

**Critical: do NOT route token changes through Payload CMS.** A Payload global creates split state — the DB value is not in git, the compiler output and the runtime value diverge, and changes are not trackable as a single diff. This was explicitly built and reverted in this codebase (commit `3ff2f1a`). Fox edits the token file, runs the compiler, commits. That is the only permitted path.

See `vulpy-storefront-development` → `references/payload-store-theme-integration.md` for the full architectural decision.

## Next.js Live Mode Setup (Dev Only)

Impeccable live mode requires the browser, agent helper, source checkout, and local server to share a workable development topology. The framework injector can target Next.js layouts/documents, but its generated source edits and cleanup journal are internal implementation details.

Before enabling it:

- verify the exact injection diff and removal path on the current Next.js version;
- test CSP `script-src` and `connect-src` behavior in development;
- keep any CSP allowance strictly development-only;
- do not automatically accept a proposed CSP patch—review middleware, nonce, strict-dynamic, and deployment implications;
- for a containerized agent, verify loopback semantics end to end. Browser `localhost`, container `localhost`, and host `localhost` are different unless networking deliberately unifies or proxies them.

## 59 Anti-Pattern Rule Categories

Useful for knowing what the CI gate will flag:

| Category | Examples |
|---|---|
| **slop** | Side-tab accent borders, gradient text, purple/cyan palettes, overused fonts (Inter, Roboto, Fraunces, Geist, Plus Jakarta Sans, Space Grotesk), flat type hierarchy |
| **a11y** | Gray text on colored backgrounds, contrast failures |
| **typography** | Font-size drift from design system tokens |
| **color** | Off-system colors, pure black/gray (not tinted), cream palette tells |
| **layout** | Nested cards, card-in-card patterns |
| **motion** | Bounce/elastic easing (dated feel), gratuitous animation |

Rules also cross-check source files against the project's own DESIGN.md tokens.

## Pitfalls

- **If Impeccable has its own `.git`, always add it as a submodule, not a plain directory.** Staging it with `git add impeccable` without first registering it as a submodule queues the entire 28-MB tree (~7000 files) as a single staged blob that CI can't clone. Use `git submodule add --force <url> <path>` then `git add .gitmodules impeccable`.
- **Don't mistake live mode for a supported embeddable widget.** It is an agent-in-the-loop localhost development protocol. A host product can build a broker, but owns that unsupported adapter and its compatibility tests.
- **Live mode is not WebSocket.** It uses SSE, HTTP POST, and agent long-polling.
- **Live mode has no web-component public API.** The overlay is plain DOM code, not a stable `<impeccable-*>` component contract.
- **`window.__IMPECCABLE_LIVE_UI_ROOT__` is source-private.** It can redirect chrome mounting in the audited source, but is not a package export or documented compatibility guarantee.
- **Do not claim iframe support from URL reachability alone.** The script operates in the document where it is injected and has no parent/iframe bridge. Validate CORS, CSP, mixed-content policy, frame origin, and injection location separately.
- **Container loopback is a first-class architecture constraint.** An operator browser's `localhost` is not an agent container's loopback; simple bind mounts do not solve networking.
- **Do not promote internal sidecar fields to a product schema.** No standalone, stable JSON Schema was found in the audited checkout.
- **Do not deep-import internal modules.** Package exports are the support boundary even when source files export helpers for tests.
- **Provider-neutral-looking paths may still be provider-specific.** Impeccable's `.agents` target is the Codex Repo Skills build, not an official Hermes provider.
- **Apache-2.0 allows modification and redistribution**, subject to license/notice and changed-file obligations.

## References

- `references/impeccable-deep-dive.md` — Revision-pinned source audit covering metadata, provider install outputs, support boundaries, detector semantics, live topology, and Hermes/Fox adaptation
