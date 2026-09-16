---
name: qa-gate
description: Run the full pre-merge quality gate on a feature-branch implementation (Node/TS services especially) — read the .hermes/tasks/qa-*.md brief first, npm check/build from clean, boot smoke test on the built artifact with stub env, repo hygiene + secret greps, Dockerfile sanity, then a Verdict + real-output report. Use when asked to "run the FULL QA gate", "you are the qa profile", or handed a QA brief.
---

# QA Gate (pre-merge quality gate)

## Trigger

User says "run the FULL QA gate on <branch/service>" or hands a `.hermes/tasks/qa-*.md` brief ("you are the qa profile"). These briefs are the user's standard workflow for feature-branch verification and usually state explicit constraints — e.g. npm allowed, but NO edits / commits / deploys / docker compose. The gate is read-only on the repo: honor the constraints, report findings, change nothing tracked.

## Workflow

1. **Read the brief FIRST** — it defines exactly what to run, the report format, and constraints. It overrides the generic steps below; follow it exactly.
2. **Check**: `npm run check` (typecheck + tests). Report exact counts ("50/50"), file breakdown, and exit code. If the brief states a target count, verify it matches.
3. **Build from clean**: `rm -rf dist && npm run build` — proves the build is not stale-cache-dependent. Report exit code + output list. Before trusting a build result in a sandbox, confirm the toolchain can actually run: plain `pnpm` may be missing from PATH for child processes (`corepack pnpm` doesn't export it — shim it, see Pitfalls), and worktree `node_modules` may symlink to another mount and panic Turbopack (see Pitfalls). Both are sandbox accommodations, never repo defects — fix the environment, then judge the branch.
4. **Boot smoke test on the artifact** (`node dist/index.js`), never dev mode:
   - **Stub env**: fake-but-format-valid secrets (`sk_test_...`, `whsec_...`, 32-hex session secret), a non-default `PORT` to avoid collisions, temp data path (`BILLING_DB_PATH=/tmp/...`), and a fake `DATABASE_URL` is fine when the client is lazy (pg.Pool only connects on first query).
   - **Probe every contract point the brief lists**: healthz, landing page, input validation (bad package/email → 4xx with structured error), fail-closed auth (missing AND bad signature → 401), no-enumeration responses (unknown email → same generic 200 as known), gated endpoints without cookie → 401.
   - Use `curl -s -w "\nHTTP %{http_code}\n"` so status codes land in the report verbatim.
   - **Clean shutdown**: SIGTERM the process → expect the app's shutdown log line and **exit code 0**; then confirm no stray processes remain.
5. **Repo hygiene**:
   - `git ls-files | grep -E 'node_modules|dist/'` must be empty.
   - Secret VALUE greps: `git grep -nE 'sk_live_|pk_live_|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}'` (env var NAMES in compose/.env.example are fine; VALUES are not; `${VAR}` interpolation is fine).
   - Confirm `.gitignore` covers node_modules/, dist/, .env and is itself tracked.
   - **pnpm lockfile sync** (pnpm repos): if package.json changed on the branch, confirm pnpm-lock.yaml changed with it (`git log --oneline -3 -- package.json pnpm-lock.yaml`). If CI uses `--frozen-lockfile`, PROVE the committed lockfile installs: snapshot it (`cp pnpm-lock.yaml /tmp/lock.orig`), swap in `git show HEAD:pnpm-lock.yaml > pnpm-lock.yaml`, run `pnpm install --frozen-lockfile --ignore-scripts` — a stale lock fails fast with `specifiers in the lockfile don't match specifiers in package.json: N dependencies were added: ...` — then restore the snapshot byte-identically and verify with `git status`/`diff`. Never leave the swap behind.
6. **Lint/tsconfig**: if there is no eslint config, note it per convention and check tsconfig strictness (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`).
7. **E2E/config sanity** (when the brief lists it): `pnpm exec playwright test e2e/<dir> --list` validates testDir, projects, and tag greps with no browsers or docker; run the e2e harness's `--preflight-only` (if it has one) to prove it's safe without live keys — the no-key path should exit 0, and the live-key path should refuse (e.g. exit 78) when keys are absent AND refuse live keys outright.
8. **Attribute errors to the branch before flagging**: for every type/build failure, `git diff --name-status origin/main..HEAD -- <file>` (A=added, M=modified) and `git grep -ln '<import path>' origin/main -- <dir>` to prove whether a NEW import chain caused it (e.g. a new `"use client"` component importing a module that pulls `next/headers`). Pre-existing failures are still gate failures, but attribution shapes severity and the fix recommendation.
9. **Dockerfile sanity**: multi-stage (build vs runtime), pinned node LTS (node:22), non-root `USER`, healthcheck, minimal layer bloat (npm ci + cache clean, dev deps only in build stage).
10. **Report** in the brief's format; default is `## Verdict: PASS | PASS-WITH-FIXES | FAIL` + `### Results (real output)` + `### Issues` with severity — file — finding. Real exit codes and responses only; never fabricate probe output.

## Pitfalls (each cost real time)

- **`pkill -f` / `pgrep -f` match their own wrapper shell** — the wrapper's command line contains the pattern, so you can "discover" a stray process that is your own command, or kill your own shell (exit -15). Before concluding anything, verify with `ps aux | grep -v grep` or `ps -fp <pid>`; prefer exact-match patterns (`pkill -x node`) or patterns the wrapper can't contain (`[n]ode dist`).
- **Terminal output redacts secret-looking values as `***`** — you cannot judge from displayed output whether a committed file holds a literal secret. Prove interpolation with grep patterns that exclude `$`: e.g. `postgres(ql)?://[^"$ ]*:[^"$@ ]*@` matching nothing = no literal password URLs, even though the file line displays as `postgresql://user:***@host/db`.
- **Native deps on alpine (musl)**: don't assume the runtime stage needs a compile toolchain — check `node_modules/<pkg>/prebuilds/` or the package.json `files` field first. better-sqlite3 v13+ ships N-API prebuilds in the npm tarball (incl. `linuxmusl-x64.node`), so `npm ci --omit=dev` on alpine works without python3/make/g++ (older versions needed the toolchain; verify per version).
- **Healthcheck may live in compose, not the Dockerfile** — check the compose service block before flagging a missing Dockerfile `HEALTHCHECK`; severity is LOW if compose covers it (node fetch /healthz with interval/start_period).
- **A prior `dist/` can mask a broken build** — remove it first so a successful build is real proof.
- **README/quick-command drift**: the deployed environment (compose, DNS, ports) can diverge from what the code says; the QA gate judges the branch's own artifacts and committed config, and flags divergence rather than "fixing" it.
- **Turbopack panic "Symlink ... points out of the filesystem root"**: `next build` hard-fails when node_modules (or the pnpm store it links into) resolves to a DIFFERENT mount than the project root — e.g. a worktree on /data whose `node_modules -> /app/workspace/node_modules` symlink, with the store under /app. vite/tsc/vitest tolerate this; Turbopack does not. Fix without touching tracked files: copy the store onto the worktree's fs (`cp -a <store> <worktree>/.pnpm-store` — `.pnpm-store/` is gitignored), `rm node_modules` (removes the symlink only, target untouched), then `pnpm install --store-dir <worktree>/.pnpm-store --prefer-offline --config.strict-store-pkg-content-check=false`. Removing the symlink first also avoids pnpm's blocking prompt "The modules directories will be removed and reinstalled from scratch. Proceed?" (a foreign node_modules triggers it; non-interactive runs hang on it).
- **`/bin/sh: 1: pnpm: not found` from `corepack pnpm check`**: wrappers like ultracite spawn `pnpm` via sh, and `corepack pnpm` does not put pnpm on the child PATH. Shim it: `mkdir -p /tmp/qabin && ln -sf ~/.cache/node/corepack/v1/pnpm/<ver>/bin/pnpm.cjs /tmp/qabin/pnpm && PATH=/tmp/qabin:$PATH ...`. Sandbox accommodation, not a repo defect — rerun the gate command with the shim before reporting a lint failure.
- **Next 16/Turbopack "next/headers only available in Server Components... Pages Router"**: signature of a client component importing a module that pulls `next/headers` (or other server-only APIs) into the client bundle — check the import traces for `[Client Component Browser]`. Grep `origin/main` to prove the importing component/chain is branch-new before pinning it on the branch.
- **Report path may collide with a sibling subagent**: when the report target is under `.hermes/reviews/`, a parallel QA agent may write to the same path. The write_file tool surfaces a warning ("modified by sibling subagent ... but this agent never read it") — don't treat that as a failure. After writing, verify the file actually contains YOUR content (read head/tail + byte size) and that `git status` shows no tracked files changed. Your write is authoritative if the content matches what you emitted.

## References

- Worked example: `llm-gateway-operations` → `references/billing-bridge-qa-gate.md` — full probe matrix, env stubs, and findings for the billing-bridge service gate.
- Worked example: `references/checkout-qa-gate.md` — pnpm/turbo storefront gate: frozen-lockfile proof, Turbopack cross-fs workaround, branch attribution of type/build errors, e2e-harness preflight checks, verbatim failure output.
