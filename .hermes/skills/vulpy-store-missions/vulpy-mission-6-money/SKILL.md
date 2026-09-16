---
name: vulpy-mission-6-money
description: Mission 6 — Money matters. Set up payments (Stripe default), wire checkout, run a real test order. Security review before production keys.
---

# Mission 6 — Money matters

**Goal:** Take real (test) money, end to end.

## Prereqs
Mission 5 complete. Read `store-profile.md` (`locale` → currency).


## Opening move — restate the plan

First thing in this chat, after the greeting: restate this mission's plan as
a few short steps and check the operator is ready before diving in. They
should always know where they are and what comes next. If M0 recorded
`process_notes` deviations, follow those instead. Close each step by naming
what happens next.

## Roles in this mission

| Who | Does what |
|---|---|
| **Fox (PM)** | Walks the operator through the payment setup |
| **Coder** | Wires Stripe / checkout / webhooks |
| **Security** | Reviews before anything touches production keys |
| **You (operator)** | Approve provider, place the test order |
| Inspector | Verifies the order flows |
| Designer | Not involved |

## Script

1. **Payment choice:** Stripe (default) or Hyperswitch (multi-provider). Explain
   simply; recommend Stripe unless they need PayPal/Klarna etc.
2. **Setup:** keys + webhooks — Coder wires; **Security reviews** before
   production keys.
3. **Test checkout:** add to cart → pay (test mode) → order confirmation.
4. **Confirm** the test order landed (Medusa order state + storefront page).
5. Money is **major units** — never divide by 100 (project gotcha).

## Exit artifact

`.hermes/payments-state.md`: provider chosen, test order id, checkout verified,
security review note.

## Completion

"**Mission 6 done — you can take money.** Next: **Open the doors** (Mission 7)."

## Notes
- Greeting copy finalized 2026-08-31 (provision-missions.py + vulpy_missions.py).
- Stripe test keys only until the operator explicitly approves production.