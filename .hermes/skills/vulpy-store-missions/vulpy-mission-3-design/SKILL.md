---
name: vulpy-mission-3-design
description: Mission 3 — Design the storefront. Compare two directions on one anchor block, compose a complete homepage, and map approved sections to Payload blocks. Writes approved design + block map.
---

# Mission 3 — Design the storefront

## Integration lesson

The reusable template is an empty shell with working plumbing and wiring, not a
finished store. Fox and the operator shape the look, feel, content, and
functionality together. Name what is working, what needs this decision, and what
remains before the result is usable, can keep iterating. Do not say ready to
move until the operator has reviewed the rendered homepage, not just a mockup.

### Status language

Every handoff must say exactly one of: **ready to move** (the rendered result
passed its checks and the operator approved it), **needs this decision** (name
the one concrete choice or input blocking the next step), or **usable, can keep
iterating** (the current result works, with improvements still welcome).

**Goal:** See the whole store before it exists. Start with a small direction
comparison on one anchor block, then compose the complete homepage so the
operator can judge the page as a system — not as a pile of approved fragments.
Placeholder images are a fallback, not the default when real assets exist.

## Prereqs
Mission 2 complete (read `.hermes/visual-direction.md`,
`.hermes/brand-voice.md`, `store-profile.md`).


## Opening move — restate the plan

First thing in this chat, after the greeting: restate this mission's plan as
a few short steps and check the operator is ready before diving in. They
should always know where they are and what comes next. If M0 recorded
`process_notes` deviations, follow those instead. Close each step by saying
whether it is ready to advance, needs a decision, or is usable but worth
iterating. The operator can keep refining the current direction or page; Fox
must not force progression.

## The template we are shaping

Remind the operator that Vulpy starts from a reusable store template: an empty
shop with the plumbing and wiring already in place. It is already good enough
for most stores, but this mission changes its look and feel to fit the business.
If the approved direction needs different functionality, Fox can inspect and
change the wiring later; the design is not being squeezed into a fixed box.
M3 produces the approved design and handoff, not the finished live storefront.

## Roles in this mission

| Who | Does what |
|---|---|
| **Fox (PM)** | Orchestrates the process and keeps decisions visible |
| **Designer** | Produces two anchor-block directions, then one complete homepage composition |
| **Architect** | Maps the approved homepage sections → existing blocks: have / adapt / build |
| **You (operator)** | Chooses the direction and approves the whole page |
| Coder / Researcher | Not involved |

## Operator comms convention (client work)

The operator relays everything to the client; Fox drafts, operator sends.
Applies to every client-facing mission:

1. **Client-question checklist first** — before producing client-facing
   deliverables, list everything the operator needs to ask the client, split
   into priority messages (blocking asks vs nice-to-know).
2. **Copy-paste client message after every reply** — close each response with
   a ready-to-send client update (status + open questions) as a quoted
   blockquote so the operator can paste it directly.
3. **Client comms language: English** (confirmed 2026-08-25), regardless of
   the store's launch-locale decision — those are two separate things.

## Client content packs

Operators may deliver a client content pack (xlsx workbook + numbered images)
instead of answers to the question checklist: product database, copy library,
business rules, asset map. Ingest it BEFORE drafting the designer brief;
never re-ask what the pack already answers. Sheet-by-sheet handling plus the
Brume & Root worked example: `references/client-content-pack.md`.

- Reconcile pack facts against M0–M2 artifacts (`.hermes/store-profile.md`,
  `brand-voice.md`, `visual-direction.md`). The pack is the newest client
  signal and wins, but FLAG conflicts to the operator for client confirmation
  (e.g. profile said PL-first, pack said EN-first → proceed EN-first, ask
  client to confirm).
- The asset map is binding: link media by exact filename with its given alt
  text and crop guidance. Variants marked Draft never appear in homepage
  features or grids.
- Copy from the pack's copy library slots directly into section concepts;
  keep brand-voice ban words as a final check (packs may still contain a
  banned word like "maintenance-free" for living products).

## Placeholder images

Source order (per operator instruction):
1. **Current website** (migration path — pull existing product images)
2. **Uploaded by the operator**
3. **AI-generated** placeholders (designer/images)

Never block on real product photos — the design must proceed on placeholders.
If real photography arrives mid-mission (content pack or uploads), switch to
it immediately; placeholder-only is a floor, not a requirement.

## Script

1. **Gather:** read `.hermes/store-profile.md` `existing_assets` field BEFORE
   briefing the designer. If the operator has logo/colors/fonts/photos/design
   files, the concept must reflect them. If nothing exists, say so in the brief
   ("design from scratch"). Pull in voice + mood + what they sell → designer
   brief. *Never brief a blank-page design when assets were provided.*
2. **Anchor comparison:** choose one high-signal anchor block — normally the
   hero, or the first block the operator cares about — and produce **two
   directions on that same block**. Keep the content and rough structure
   comparable so the choice is about visual direction, not two unrelated ideas.
   Show the difference in type, spacing, palette treatment, imagery and CTA
   emphasis. Recommend one and explain why.
3. **Direction gate:** the operator chooses or asks for a blend. Restate the
   choice in concrete terms and get confirmation before composing the rest of
   the page. Do not turn a one-letter answer into an unconfirmed assumption.
4. **Whole homepage:** produce **one complete homepage demo in a single
   composition** using the chosen anchor direction. Include the agreed sections
   together in page order so hierarchy, rhythm, spacing, repetition and the
   transition between sections can be judged properly. Do not ask for approval
   after every block; that fragments the design and hides page-level problems.
5. **Holistic review:** walk the operator through the complete page. Ask for
   feedback on the page as a whole first (hierarchy, balance, tone, mobile
   priorities), then collect targeted changes. Allow one focused revision round
   on the complete composition; only after that record any small section-level
   follow-ups.
6. **Preview and handoff:** the demo is a deliverable, not just a description.
   Verify it opens in a browser, that every referenced image loads, and that
   the operator has a clear way to send it to the client (shareable URL, or a
   self-contained file/archive when appropriate). Never claim it is ready to
   share until the preview and images have been checked.
7. **Map:** Architect maps the approved homepage sections → existing Payload
   blocks:
   - **Have** — block exists, minor copy/image swap
   - **Adapt** — existing block needs small styling/config change
   - **Build** — no block exists → becomes a mini-project (Mission 5)
   - Ground every verdict in the real block schema: read
     `references/page-block-inventory.md` (curated block list + notes) and
     confirm against `apps/storefront/src/blocks/index.ts` (blocks defined)
     and `apps/storefront/src/fields/blocksField.ts` (which page gets which
     blocks). Do not hand-wave a "Have" — check the block actually supports the
     design.
8. **Expectation-setting:** we honor the design's *adaptation*, not
   pixel-perfect cloning; our block system intentionally constrains layout chaos.

### If the operator asks for the whole page early

Treat "make me the whole demo page" as a clear request to switch from fragment
review to the complete-composition step. Do not keep presenting isolated
sections or ask them to approve the old sequence again. Preserve decisions
already made, state what is locked and what remains open, then build the full
page and review it holistically.

### Design-session failure checks

Before closing the mission, check the interaction as well as the mockup:

- If a client-facing draft describes work as sent, approved, or already
  discussed, verify that it actually happened. Otherwise label it as a draft or
  proposed message.
- If the preview cannot be opened or its images cannot be seen, the design is
  not handoff-ready. Fix the asset paths or provide a self-contained artifact;
  do not merely describe where the file should be.
- If the operator changes from section review to a full-page demo, record that
  as a workflow decision and stop emitting section-by-section approval prompts.
- Keep design approval separate from implementation readiness: after the page
  is approved, state the next mission and any runtime/content prerequisite
  instead of implying the site has already been changed.

A compact worked example and verification checklist are in
`references/design-workflow-checks.md`.

## Exit artifact

`.hermes/homepage-design.md`: approved section plan + block verdict map.

## Completion

"**Mission 3 done.** Next: **Stock the shelves** (Mission 4) — real products
behind the pretty facade."

## Notes
- Greeting copy finalized 2026-08-31 (provision-missions.py + vulpy_missions.py).
- Ask about mobile frames upfront when using Figma.