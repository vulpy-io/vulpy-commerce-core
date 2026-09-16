# Worked example — moodboard concepts (Brume & Root, Mission 2)

Moodboard path, no designs. Store: handmade moss terrariums, Poland,
Polish-first, design-aware audience 24–44, launch 3–5 days, **hands-off
operator** (`tech_comfort` in store-profile.md).

Brand voice (Mission 1): tone lane **60% quiet editorial / 30% warm organic /
10% modern functional**; references Aesop, FRAMA Copenhagen, ferm LIVING,
Muuto, The Poster Club; bans boho/zen/jungle/magical.

## Concept A — "Moss & Limestone" (quiet editorial)
- Colour: warm limestone/oat backgrounds, charcoal ink, deep moss accent, sage whisper.
- Typography: elegant serif display + clean humanist sans body.
- Imagery: soft daylight, macro moss textures, single objects, generous whitespace.
- Feels like: Aesop × ferm LIVING.
- Best for: customer who sees the object as sculpture.
- Fox lean: closest to the 60% quiet-editorial center; most differentiating
  vs cutesy-organic moss stores.

## Concept B — "Terrarium at Dusk" (warm & organic)
- Colour: deep forest greens, terracotta, amber light, soft charcoal.
- Typography: warm rounded grotesque heading + humanist sans body.
- Imagery: evening apartment light, glowing terrariums on windowsill, lives-in-the-home.
- Feels like: FRAMA × warm interiors.

## Concept C — "Glasshouse" (modern functional)
- Colour: airy whites, clear moss-green, light oak, one terracotta accent.
- Typography: geometric sans heading + clean functional sans body.
- Imagery: bright window light, crisp product shots, tools shown, airy negative space.
- Feels like: Muuto × The Poster Club.

## Presentation pattern that worked
- All three at once; each = name + one-line mood → colour → typography →
  imagery → "feels like" → "best for".
- Explicit Fox lean with one-line rationale (option A), plus a blend offer
  ("A's restraint with B's warm evenings") — hands-off operators pick faster
  when Fox leads; the blend offer covers tone-lane weights the top pick
  under-serves.
- Follow-up: chosen direction → `.hermes/visual-direction.md` → DTCG tokens
  via `vulpy-design-system-adoption` (store.tokens.json overrides,
  generate-design.mjs, editor.registry.mjs, DESIGN.md refresh).

## Lesson (proven 2026-08-25 — ask about client colors BEFORE presenting)
Fox drafted + locked the full invented palette (direction A), operator
interrupted: "wait wait wait, client gave me colors". The client's palette is
source of truth; a moodboard palette is a *frame*, not a deliverable, until
client colors are ruled out. Ask one polite question up front ("does the
client already have brand colours — palette, guidelines, or an existing
Instagram/site look?") and remap the chosen direction's tiers around their
colors if so. Contrast-check the remapped palette on every surface
(`vulpy-design-system-adoption` → `scripts/check-contrast.mjs`) — muted tones
from clients often fail the 4.5:1 floor on tinted surfaces.