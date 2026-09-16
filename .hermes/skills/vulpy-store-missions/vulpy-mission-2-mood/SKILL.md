---
name: vulpy-mission-2-mood
description: "Mission 2 — Set the mood. Decide the visual direction: moodboards (no designs) OR Figma/design extraction + token compile. Writes chosen direction or token set."
---

# Mission 2 — Set the mood

**Goal:** Decide the look of the store.

## Prereqs
Mission 1 complete (read `.hermes/brand-voice.md` and `store-profile.md`).


## Opening move — restate the plan

First thing in this chat, after the greeting: restate this mission's plan as
a few short steps and check the operator is ready before diving in. They
should always know where they are and what comes next. If M0 recorded
`process_notes` deviations, follow those instead. Close each step by naming
what happens next.

## Roles in this mission

| Who | Does what |
|---|---|
| **Fox (PM)** | Leads, forks the path, writes decisions |
| **Designer** | Creates 2–3 moodboard concepts (no-designs path) |
| **Extractor + VLM (`vulpy-vision`)** | Token harvest + annotation (Figma path) |
| **You (operator)** | Picks direction, resolves token conflicts |
| Researcher / Coder | Not involved |

## Fork: does the operator have designs?

The operator should already have answered the asset question in Mission 0
(`existing_assets` in the store profile). **Before designing anything, re-read
that field — and if it's missing or says "nothing", ask once more here:**
"Quick check — any logo, colors, fonts, product photos, or design files we
should build from? If not, we invent from scratch." Never propose/generate
moodboards or tokens while this is unanswered.

### A. No designs → moodboards
Fox also plays Designer here. Ground every concept in Mission 1's
`.hermes/brand-voice.md` — never invent a look that contradicts the tone lane:

0. **Ask about existing brand colours FIRST.** Before inventing any palette:
   "Does the client already have brand colours — a palette, brand guidelines,
   or an existing look on their Instagram/site?" If yes, those are the
   **source of truth**: present moodboards as a *frame* (light vs dark, type
   pairing, imagery tone) and remap the palette tiers around the client's
   colours. Do NOT present a fully invented palette as the primary deliverable.
   Proven failure: drafted + locked a complete palette, operator interrupted
   "wait wait wait, client gave me colors". One polite check up front saves a
   full palette rewrite.
1. Read the **tone-lane percentages** (e.g. 60% quiet editorial / 30% warm
   organic / 10% modern functional) — each concept weights them differently.
2. Map each concept's "feels like" to the **reference brands** already in
   brand-voice.md (Aesop, FRAMA, Muuto, …) so the operator recognizes the
   register.
3. Respect **ban words**: a brand that bans "boho/zen/jungle" must not get a
   boho-cutesy moodboard. Check the ban list before styling.
4. Produce **2–3 concepts**, each carrying: direction name + one-line mood →
   colour (few swatches, described) → typography (display + body) → imagery
   style → "feels like" (reference brands) → "best for" (audience fit).
5. Present all at once with **your recommendation** (lean + one-line why).
   Hands-off operators (tech_comfort: hands-off) pick fastest when Fox leads.
   Offer a blend of two directions; **one refinement round max.** If the
   operator replies with a bare letter or number ("A", "2"), repeat the full
   direction name and its defining choice, then ask for confirmation before
   locking it or compiling tokens.
6. **Exit:** operator picks → write `.hermes/visual-direction.md`, then draft
   tokens through the **same DTCG pipeline as the Figma path**
   (`vulpy-design-system-adoption`: `store.tokens.json` overrides →
   `generate-design.mjs` → registry/tests → DESIGN.md refresh). Both paths
   converge; the token set is what Mission 3 inherits. Before finalizing,
   verify every drafted hex against `editor.registry.mjs` `isAllowedEdit` AND
   WCAG contrast on **all** text surfaces — see
   `vulpy-design-system-adoption` → `scripts/check-contrast.mjs`.

Worked example (Brume & Root): `references/moodboard-concept-example.md`.

### B. Has Figma (or current-site designs)
1. **Access:** guide MCP/token setup ("paste one token, I'll do the rest" for
   hands-off; co-pilot steps for terminal users).
2. **Extract:** run the Figma extractor — deterministic tree walk (geometry,
   styles, auto-layout) → token harvest → section PNG exports.
3. **Disambiguate:** Fox walks the operator through conflicts
   ("your file uses three greens — which one is brand?").
4. **Compile gate:** validate tokens through the DTCG pipeline
   (`vulpy-design-system-adoption`).

## Exit artifact

`.hermes/visual-direction.md`: chosen moodboard **or** extracted token set +
conflict resolutions.

## Completion

"**Mission 2 done.** Next: **Design the storefront** (Mission 3) — we'll see
your store before it exists."

## Notes
- Greeting copy finalized 2026-08-31 (provision-missions.py + vulpy_missions.py).
- Extractor VLM calls are per-section, never per-node.
- **Don't hunt for a mission-completion registry/webhook** — the
  registry pattern (`vulpy-missions.json`, statuses, completion tool) is
  superseded; completion is user-driven (unpin/archive) and the exit artifact
  IS the signal. End with the standard Completion line and suggest archiving.