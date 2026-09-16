# asd-ste100 Adoption Pilot (2026-08-15)

Worked example of the evaluate → install → pilot flow on the real corpus.
Source: https://github.com/danyuchn/asd-ste100-skill (MIT, ~1.1k stars, default branch `master`).

## Outcome
- Installed at `software-development/asd-ste100/` via `git clone --depth 1` + `rm -rf .git`.
  Direct-URL install would have dropped `references/writing-rules.md` and `examples/before-after.md`.
- Pilot scope (user-approved): **description fields only**, 6 skills. Bodies untouched.
- All 6 rewrites validated; loader exposed new text same-session.

## What each rewrite fixed

| Skill | Rules applied |
|---|---|
| `storefront-best-practices` | ALL-CAPS emphasis (ALWAYS/ANY/CRITICAL) → plain directives; removed duplicate clause "or ANY page/component in a storefront" (re-stated the component list); "functionality" → "function" |
| `building-with-medusa` | ALL-CAPS; mode list "(planning, implementation, exploration)" duplicated from clause 1 → merged to "in all modes"; dropped no-op "best practices" (duplicated "patterns"); gerund stack → active verbs ("when you plan, research, or implement") |
| `building-admin-dashboard-customizations` | Same family: ALL-CAPS, duplicated mode list, "best practices" |
| `hermes-container-rebuild-bridge` | Em-dash run-on split into 2 sentences; filler "truly active" → "active"; ellipsis "verify idle first" → explicit "Verify that the WebUI is idle before you rebuild." |
| `verification-before-completion` | Semicolon (STE bans outright) → separate sentences; dropped subject "Use when about to claim" → "Use when you are about to claim"; slogan aligned with body ("assertions" → "claims") |
| `hermes-runtime-troubleshooting` | Em-dash run-on joining two sentences → split; broken list parallelism (nouns + gerunds) unified under "Covers:"; filler "actually" dropped |

## Deliberately kept (Kept as-is)
- Trigger synonyms ("storefronts, online stores, shopping sites") — dispatch recall surface, not ambiguity.
- All facts: DeepSeek 400 example, `hermes.rebuild`, Dockerfile.hermes/entrypoint/patchers, bridge refusal behavior.
- "Load automatically when…" leads on auto-load skills — the load contract.

## Takeaways
- Descriptions are the highest-leverage edit target (paid every turn, drive dispatch) and the
  safest pilot surface. Bodies are a separate pass — the three auto-load skills still carry
  ALL-CAPS "When to Apply" headers if a body pass is ever approved.
- YAML: any rewritten description containing `: ` must be double-quoted.
- Remaining low-yield descriptions (short, already compliant) were correctly left alone —
  the STE skill's own rule: don't force changes onto compliant text.
