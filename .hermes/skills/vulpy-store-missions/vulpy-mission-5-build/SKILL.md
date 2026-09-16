---
name: vulpy-mission-5-build
description: "Mission 5 — Raise the walls. Implement the approved design section by section: tokens → header/footer → hero → rest, with inspect + design review per section. Coffee-checkpoint git framing."
---

# Mission 5 — Raise the walls

## Integration lesson

The reusable template is an empty shell with working plumbing and wiring, not a
finished store. Fox and the operator shape look, feel, content, and
functionality together. State what is working, what needs this decision, and
verify the rendered route before saying ready to move. The rendered result must
be usable, can keep iterating.

### Status language

Every phase gate reports **ready to move**, **needs this decision** (one named
operator choice), or **usable, can keep iterating**. Never infer success from a
build or mutation exit code; check the rendered homepage and catalog and detect
empty, known-placeholder, or stale content first.

**Goal:** Build the approved design, section by section, real data where it exists.

## Prereqs
Missions 3 + 4 complete (design + catalog + block map). Read
`store-profile.md` (tech_comfort sets narration depth) and
`.hermes/homepage-design.md`.

## Opening move — restate the plan

First thing in this chat, after the greeting: restate this mission's plan as
a few short steps and check the operator is ready before diving in. They
should always know where they are and what comes next. If M0 recorded
`process_notes` deviations, follow those instead. Close each step by saying
whether it is ready to advance, needs a decision, or is usable but worth
iterating. The operator can keep refining the current step; Fox must not force
progress.

This is the hardest mission for an LLM because visual intent, existing code,
content, responsive behavior, and real catalog data all have to agree. The
starting point is the reusable Vulpy template: the plumbing is already there,
but we can change the wiring when the approved store needs it. M5 is where the
verified M4 catalog is integrated into the approved M3 design. It is not a
single blind rewrite.

## Roles in this mission

| Who | Does what |
|---|---|
| **Fox (PM)** | Coordinates, narrates at the operator's comfort level |
| **Coder** | Implements each section, one per iteration |
| **Inspector (QA)** | Checks every section independently before it reaches the operator |
| **Designer** | Reviews each section's screenshot vs the design |
| **You (operator)** | Approve each section |

## Build ladder (fixed order — both design paths)

1. **Foundations:** tokens and content/data contracts land first.
2. **Shell:** header + footer establish the store frame.
3. **Hero:** the emotional centerpiece, alone.
4. **Sections:** remaining sections, one per iteration.
5. **Whole-page review:** render the complete homepage and catalog together;
   the operator approves the system, not isolated fragments.

## Per-section loop

State what will change and ask for the one decision or approval needed →
coder implements → inspector checks → designer reviews the rendered screenshot
against the approved M3 direction → operator sees the real route → Fox reports
what passed and whether to advance or iterate. Never silently change several
sections at once. Keep the current version usable so the operator can request
another iteration at any gate.

## Coffee checkpoints (git)

**Non-tech framing:** *"Every completed section is a coffee checkpoint — like
saving your game. We snapshot it, you can always go back to the last checkpoint
if we hit a snag."*

**Tech framing:** *"I commit each section to git — one commit per milestone,
clean revertible history. Branch per feature, merge to main when green."*

For `terminal` users: show the actual commit (`git log --oneline -n 1`).

## Missing blocks

Sections marked **Build** in the block map become **mini-projects** inside this
mission: architect → brief → coder → inspect → review.

## Exit artifact

`.hermes/build-log.md`: sections built, commits referenced, known deviations.

## Completion

"**Mission 5 done — the house is up.** Next: **Money matters** (Mission 6)."

## Notes
- tech_comfort adapts live; never let narration block progress.
- Keep the template metaphor and the advance-or-iterate checkpoint visible without repeating the generic Fox introduction.
