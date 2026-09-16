# Impeccable source audit snapshot

This is a revision-pinned evidence bank, not a permanent API promise.

## Audit anchor

- Repository: `pbakaus/impeccable`
- Fetched default branch: `main`
- HEAD: `c5e1ddd054dc093ef2546c36b82eddf2c4e84bb9`
- Commit time: `2026-07-31T18:24:42-07:00`
- Subject: `Merge pull request #470 from pbakaus/fix/live-cors-nonlocal-dev-hosts`
- npm package/latest dist-tag at audit: `impeccable@3.5.0`
- skill/plugin version: `4.0.4`
- Node engine: `>=22.12.0`
- Build package manager: Bun (`bun.lock`, build scripts); no `packageManager` field
- License: Apache-2.0

Always re-fetch and re-check these axes independently. npm, skill, plugin, extension, and Git tags are not one version stream.

## Distribution and support boundary

`package.json` publishes `cli/` plus `LICENSE` and exposes only:

```json
{
  ".": "./cli/engine/detect-antipatterns.mjs",
  "./browser": "./cli/engine/detect-antipatterns-browser.js"
}
```

Do not treat live scripts, installer helpers, design-system loaders, event vocabulary, or artifact-schema modules as package APIs. The installer helper exports in `cli/bin/commands/skills.mjs` are explicitly labeled a test surface.

## Provider installer outputs

Recommended reproducible form:

```bash
npx --yes impeccable@3.5.0 install -y --providers=<provider> --scope=project
```

### Claude

- Skill payload: `.claude/skills/impeccable/{SKILL.md,reference/**,scripts/**}`
- Hook: merged into machine-local `.claude/settings.local.json` unless `--no-hooks`
- An existing Impeccable hook in `.claude/settings.json` is honored to avoid duplicates.
- Important: although the build transformer can emit Claude agent definitions, the npm installer's provider-agent sidecar copy map handles Cursor and GitHub, not Claude. Do not promise `.claude/agents/*` from the normal CLI install.

### Codex

- `--providers=codex` maps skills to `.agents/skills/impeccable/`, not `.codex/skills/`.
- The skill includes `agents/openai.yaml` and nested Codex `*.toml` agent definitions.
- Hook: `.codex/hooks.json`, rewritten to call `.agents/skills/impeccable/scripts/hook.mjs`.
- Codex requires operator approval through `/hooks`; updates can require reapproval.
- `.agents` is the Codex Repo Skills provider, not an official Hermes provider.

### Cursor

- Skill payload: `.cursor/skills/impeccable/**`
- Native agent files: `.cursor/agents/impeccable-*.md`
- Hook: `.cursor/hooks.json`, using `hook-before-edit.mjs`

The four source agent roles are asset producer, documenter, finish reviewer, and manual-edit applier. All providers receive degraded inline fallback references generated from these role definitions.

### Update semantics

- Provider-specific skill directories are copied, not shared by one cross-provider symlink.
- An Impeccable skill directory is replaced on refresh; unrelated sibling skills remain.
- Hook manifests preserve unrelated entries.
- Malformed hook JSON aborts unless `--force`, which backs up/replaces it.
- `--no-hooks` suppresses hook side effects.
- `link` expects compiled provider output (`dist/universal` or provider folders). A clean source checkout may not contain `dist`, so validate before recommending the submodule workflow.

## Design artifacts

- `DESIGN.md` is a durable human-readable input/context artifact.
- Internal `design.json` references and normalization logic exist.
- Artifact validation is executable JavaScript under the skill/plugin payload, not a standalone published JSON Schema.
- No stable public sidecar schema should be inferred from current implementation fields.
- For product use, own the structured token schema and synchronize `DESIGN.md` deliberately.

## Detector

Documented CLI examples:

```bash
npx impeccable detect src/
npx impeccable detect --json src/
npx impeccable detect --no-config src/
npx impeccable detect https://example.com   # optional Puppeteer
```

Exit interpretation:

- `0`: completed, no findings
- `2`: anti-pattern findings
- `1`: usage/runtime failure

CI must not treat exit `2` as an infrastructure crash. The README text around deprecated `--fast` behavior was internally inconsistent at this revision; do not depend on it.

## Live mode

Observed architecture:

1. A framework adapter injects a development browser script into the target document.
2. A local Node HTTP server serves the bundle and session state.
3. Browser traffic uses SSE plus HTTP POST.
4. The harness agent receives work through HTTP long-poll helpers.
5. The agent edits source and reports completion.
6. Browser-side accept/discard drives retention or restoration/cleanup.

This is a skill-script protocol, not an npm export. Internal modules include `live-server.mjs`, `live-poll.mjs`, `live-complete.mjs`, `session-store.mjs`, `event-validation.mjs`, `vocabulary.mjs`, and framework injectors.

The browser overlay is plain DOM code, not a custom-element API. `window.__IMPECCABLE_LIVE_UI_ROOT__` exists as an internal mount-root override, but is not a documented/exported compatibility contract. There is no parent/iframe bridge.

### Topology checklist

- Browser `localhost` and container `localhost` differ unless networking deliberately unifies/proxies them.
- A bind-mounted source tree solves filesystem access, not loopback routing.
- Verify HTTPS/mixed-content behavior, CORS, CSP `script-src` and `connect-src`, iframe origin, and the exact injected document.
- Do not expose the loopback-oriented server publicly; its session token is capability protection, not a multi-user auth system.
- Prefer running live mode through a supported harness over reimplementing private routes in a host product.

## Hermes/Fox recommendation

No upstream Hermes provider or hook adapter was present. The least-fragile bridge is:

1. pin npm and skill revisions;
2. vendor/copy a complete compiled skill payload, not only `SKILL.md`;
3. wrap it in a small Hermes-owned skill that defines Hermes tool permissions and invocation;
4. run detector checks explicitly rather than installing Claude/Codex/Cursor hooks;
5. keep approval and rollback at a Git branch/worktree boundary;
6. isolate official live mode behind a supported harness if it is required.

Label this as a custom adapter composed from supported pieces, not official Impeccable-to-Hermes support.

## Source paths to re-check on upgrade

- `package.json`
- `README.md`, `README.npm.md`, `LICENSE`
- `cli/bin/commands/skills.mjs`
- `scripts/lib/transformers/providers.js`
- `scripts/lib/transformers/factory.js`
- `cli/engine/detect-antipatterns.mjs`
- `cli/engine/design-system.mjs`
- `skill/scripts/lib/artifact-schema.mjs`
- `skill/scripts/live-server.mjs`
- `skill/scripts/live-poll.mjs`
- `skill/scripts/live-complete.mjs`
- `skill/scripts/live-browser*.js`
- `skill/scripts/live/frameworks/*`
