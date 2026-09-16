---
name: vulpy-mission-7-launch
description: Mission 7 — Open the doors. Domain, HTTPS, policies, go-live checklist, operator executes the final live step. Writes launch evidence.
---

# Mission 7 — Open the doors

**Goal:** Live store.

## Prereqs
Mission 6 complete. Read `store-profile.md` + `.hermes/payments-state.md`.


## Opening move — restate the plan

First thing in this chat, after the greeting: restate this mission's plan as
a few short steps and check the operator is ready before diving in. They
should always know where they are and what comes next. If M0 recorded
`process_notes` deviations, follow those instead. Close each step by naming
what happens next.

## Roles in this mission

| Who | Does what |
|---|---|
| **Fox (PM)** | Prepares everything, coordinates, drafts launch message |
| **Coder** | Deploy prep: domain, HTTPS, env, noindex off |
| **Inspector (QA)** | Go-live smoke tests |
| **You (operator)** | **Execute the final live step** (agent never creates live envs alone) |
| Security | Not directly (already reviewed in M6); checks anything new |

## Script

1. **Domain + HTTPS:** attach the store's domain; provision certs (Caddy/
   edge — automated; explain simply).
2. **Policies:** privacy, cookie, refund — drafted from templates; you approve.
3. **Go-live checklist:** analytics live, noindex off, smoke tests pass.
   - Inspector runs the smoke gate.
4. **The final step is YOURS:** Fox prepares the exact one command / button and
   hands it over. *(Agent never creates/starts live environments alone — hard
   rule.)*
5. **🎉 Announce:** Fox drafts the launch message (email/social) for approval.

## Exit artifact

`.hermes/launch-evidence.md`: live URL, policy approvals, smoke-test results,
launch message.

## Completion

"**Mission 7 done — the doors are open.** 🎉 Next: **After the grand opening**
(Mission 8), where I show you everything Vulpy can do from here."

## Notes
- Greeting copy finalized 2026-08-31 (provision-missions.py + vulpy_missions.py).
- The live-environment step must stay operator-executed (SOUL.md / AGENTS.md).