# Brand Identity — Fox in the Box

## Essence

Warm, crafted, architectural, accessible. A fox that knows its territory — confident without being loud, sophisticated without being cold.

## Personality traits

- **Approachable intelligence** — smart without showing off
- **Warmth** — chromatic neutrals, never sterile cool grays
- **Craft** — every detail intentional, nothing default
- **Clarity** — hierarchy through scale, not decoration

## Typography philosophy: Inverse weight hierarchy

The Fox brand uses an unconventional typographic system where **larger text is lighter** and **smaller functional text is heavier**. This creates an elegant visual tension:

| Scale | Font | Weight | Size | Rationale |
|---|---|---|---|---|
| Display (h1) | **Sora** | 320 (light) | 48px | Large type relies on size alone for presence |
| Section (h2) | **Sora** | 400 (regular) | 32px | Stepped up from display, still restrained |
| Subhead (h3) | **Manrope** | 500 (medium) | 28px | Switches to body font — marks content boundary |
| Card (h4) | **Manrope** | 600 (semibold) | 24px | Heaviest heading — used for product cards |
| Subtitle (h5) | **Manrope** | 500 (medium) | 22px | Widget/accordion headings |
| Body | **Manrope** | 450 | 16px | Slightly heavier than standard for warmth |
| Button | **Manrope** | 800 (extra-bold) | 15px | Maximum weight for tap-target clarity |

**Dual-font split at h3**: Sora (geometric, architectural) handles display; Manrope (humanist, readable) handles everything the reader lingers on.

## Colour philosophy

- **Canvas**: `#fbf9f4` — warm cream, never pure white
- **Text**: `#171513` — warm charcoal, never pure black
- **Accent**: `#b8a089` — muted taupe (Fox brand warmth)
- **CTA/Action**: `#c8743a` — Fox logo orange (distinct energy from passive accent)
- **Chromatic neutrals**: `#edebe6`, `#f2f0eb`, `#d9d7d2` — warm grays throughout

Never use cool blues, sterile grays, or pure black/white as primary surfaces.

## Shape

- **Only two radii**: 5px (interactive elements) and 10px (containers/images)
- **Shadow**: `5px 5px 10px 0 rgb(184 160 137 / 60%)` — warm, directional, never diffuse box-shadow
- **No pill buttons** — 5px is the maximum for controls

## Spacing

- 4px base grid — all spacing multiples of 4px
- Section gaps: 48–60px (generous breathing room)
- Internal component gaps: 8–16px (tight, purposeful)
- Hero sections: 112–128px vertical padding

## Anti-patterns (never do)

- Pure `#000000` or `#ffffff` as primary surface/text
- Cool gray neutrals (`#f3f4f6` Tailwind gray-100 style)
- Heavy display type (600+ weight at 48px+)
- Rounded pill buttons (radius > 10px)
- Dark mode as default (warm identity loses meaning)
- Decorative gradients or blur effects
- Drop shadows that are centered/diffuse (always directional)
- Letter-spacing > 0.02em on any text (Fox is tight)

## Competitive positioning

Not a Stripe clone (too cold). Not a craft marketplace (too busy). The Fox identity is "the smart friend who made a beautiful thing without making it feel precious." Technology that feels handmade.
