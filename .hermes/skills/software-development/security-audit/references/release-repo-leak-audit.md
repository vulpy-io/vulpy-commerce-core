# Release-repo leak audit (public/private distribution trees)

Audit the SHIPPED release repositories — not a service diff — for leaked
internal tools, operator material, or credentials. Run after every publish and
whenever "scan the repo for leaks" is asked. Learned 2026-09-02 (public Core +
private Pro audit; a real AWS IAM key had previously shipped in a package's
skill reference and been sanitized).

## Shape: parallel subagents, one per repo

Dispatch `delegate_task` (batch of 2) — one leaf per repo. Public repo = highest
risk (any internal material is instant exposure); private commercial repo =
carries `.hermes/skills` + `distribution/packages/*` which is exactly where
operator material hides.

Brief essentials per subagent:

1. **Clone FRESH from GitHub; never use local copies.** Local worktrees are
   stale/dirty and may have been the source of the leak. Fetch + checkout ALL
   branches and the newest tag (e.g. `master`, `alpha/v0.1.0-alpha.6`, tag).
2. **Internal-identifier list** (Vulpy-specific, 2026-09-02):
   - Hosts/IPs: `3.230.202.199` (live US), `44.219.166.217` (NLB), `51.44.101.99`
     (EU box), `172.31.` (internal VPC)
   - Domains: `gateway.vulpy.io`, `billing.vulpy.io`, `api.billing.vulpy.io`,
     `demojar.com`, `tail873f17.ts.net`, `vulpy-commerce-private`
   - Services/projects: `billing-bridge`, `llm-gateway`, `litellm`, `langfuse`,
     `vulpy-platform-superprivate`
   - Operator/Hermes material: `.hermes/tasks`, `.hermes/plans`,
     `.hermes/store-state.json`, gateway/billing/operator-specific skills
3. **Secret patterns**, EXCLUDING masked placeholders:
   `AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH |ED25519 )?PRIVATE
   KEY|sk-[A-Za-z0-9]{20,}|sk_live_|sk_test_|ghp_[A-Za-z0-9]{36}|gho_...|
   whsec_...|re_...|LITELLM_MASTER_KEY=.+[^$]|STRIPE_SECRET_KEY=.+[^$]|
   SESSION_SECRET=.+[^$]|SMTP_PASS=.+[^$]|PAYLOAD_SYNC_API_KEY=.+[^$]|
   GITHUB_TOKEN=.+[^$]`
   Exclude values containing `...`, `xxx`, `***`, `your-`, `example`, `<`, `>`,
   or empty. Check EVERY `.env*` / `.env-current` / `deploy/*.env*` for real
   (non-example, non-empty) values — a real value is a leak even if the filename
   is `.env.example`.
4. **Pay special attention to**: `.hermes/skills/**/references/*.md`
   (credential-repair docs, gateway-ops runbooks), and
   `distribution/packages/*/.hermes/skills/**` — the packaged skill trees are
   where operator material (and a real AWS key) has shipped before.
5. **Known-prior-leak re-verification**: if a credential was sanitized before
   (e.g. `AKIATAAIDHQPJC4XVSNSF`), confirm it is truly gone from every branch,
   tag, and package artifact — not just the one file that was fixed.
6. **Verdict format**: `CLEAN` or `LEAKS`, then per finding:
   `SEVERITY | path | what leaked | why it matters` (HIGH = real credential /
   internal gateway tooling; MED = internal hostname / ops doc; LOW = trace).
   Redact any secret value to first 4 chars + `...`.
7. **Read-only**: no modify/commit/push. Fresh clones in `/tmp/scan-<repo>`.

## Why fresh clones + all branches matter

- A leak fixed on `master` can still exist on an alpha branch or an old tag —
  the audit must cover every reachable ref.
- Local export trees (e.g. `/data/state/publish-*-alphaN`) are the agent's own
  assembly; the GitHub repo is what customers actually clone. Audit the repo.
- The `.env-current` file in some exports is intentionally 3 empty bytes —
  `wc -c` it before calling it a leak.

## Sanitize path (if a real secret is found)

Already captured in `vulpy-commerce-operator/references/release-boundary-exports-images-signing.md`
(post-publish security follow-up): redact in source of truth AND package
artifact tree, re-sign (same key, stable keyId), update EVERY embedding tree
(canonical `release-artifacts/packages/<pkg>` + every `publish-*-alphaN`), then
`package-verify.mjs <dir> core|pro` on each. Rotation of a shared IAM key is
operator-timed — do not rotate mid-release.
