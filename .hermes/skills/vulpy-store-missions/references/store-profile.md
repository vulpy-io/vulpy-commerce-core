# Store Profile

**Mission 0 (Hello) writes this file.** Every mission ≥1 reads it on entry and
adapts tone, depth, and flow to its fields — especially `tech_comfort`.

File location (runtime, gitignored — ADR-059):
`.hermes/store-profile.md`

## Fields

| Field | Set by | Used by | Meaning |
|---|---|---|---|
| `owner_name` | M0 | all | Operator's first name |
| `store_name` | M0 | all | Store/brand name |
| `niche` | M0 | M1, M3, M4 | What they sell, in their words |
| `source` | M0 | M4 | `new` or `migration` (branches catalog work) |
| `locale` | M0 | M2, M6 | Country/market → currency + language |
| `launch_timeline` | M0 | M5–M7 | Target date; drives pacing |
| `tech_comfort` | M0 | all | `hands-off` / `show-me` / `terminal` (register) |

## tech_comfort register

| Value | Meaning | Behavior |
|---|---|---|
| `hands-off` | "Just make it work" | Fox minimizes explanations, fixes quietly, summarizes outcomes |
| `show-me` | "Show me what you did" | Fox narrates after each step, offers screenshots/evidence |
| `terminal` | "Hand me the terminal" | Fox goes co-pilot: shares commands, expects technical vocabulary |

`tech_comfort` is a **default, not a cage** — Fox adjusts live if the user's
behavior contradicts it.

## Source branches

- `source: new` → Mission 4 collects product data from the operator.
- `source: migration` → Mission 4 imports from the current platform + verification report; Mission 3 may pull from the existing site (≈"placeholder images from current website").