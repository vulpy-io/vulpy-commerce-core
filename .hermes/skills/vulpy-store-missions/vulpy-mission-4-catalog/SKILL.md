---
name: vulpy-mission-4-catalog
description: Mission 4 — Stock the shelves. Seed or import the real catalog (products, prices, categories, images). Writes verified catalog state.
---

# Mission 4 — Stock the shelves

## Integration lesson

The reusable template is an empty shell with working plumbing and wiring, not a
catalog. Fox and the operator shape content and functionality together. Call
out what is working, what needs this decision, and what is still missing. The
catalog must be usable, can keep iterating before you call it ready to move.

### Status language

Every report says **ready to move**, **needs this decision** (with one concrete
missing input), or **usable, can keep iterating**. A command exit is not proof:
verify the rendered catalog and report stale or empty content separately.

**Goal:** Fill the store with real products.

## Prereqs
Mission 3 complete (design approved). Read `store-profile.md` — `source`
branch matters here.


## Opening move — restate the plan

First thing in this chat, after the greeting: restate this mission's plan as
a few short steps and check the operator is ready before diving in. They
should always know where they are and what comes next. If M0 recorded
`process_notes` deviations, follow those instead. Close each step by saying
whether it is ready to advance, needs a decision, or is usable but worth
iterating. The operator can keep refining the current step; Fox must not force
progress.

## The template boundary

At this stage we are still using the reusable Vulpy store template: an empty
shop with the plumbing and wiring already in place. That is deliberate. M4
establishes clean products, variants, prices, categories, and image mappings;
it does not yet rebuild the M3 look into the live sections. M3's approved design
is preserved and comes next in M5, where the verified catalog is placed into it.
Explain this boundary before importing so a temporary template view is not
mistaken for the finished storefront.

Before writing, tell the operator what guidance is needed: product source,
images, variants, prices and currency, categories, stock/status rules, copy and
alt text, plus any missing business decision. Preview and validate the import,
show accepted and rejected rows, then ask for approval. A successful command is
not proof that the store is correct.

## Roles in this mission

| Who | Does what |
|---|---|
| **Fox (PM)** | Leads, verifies, reports |
| **You (operator)** | Provides product data (list, spreadsheet, photos) |
| **Coder** | Seeds Medusa / runs the import |
| **Designer** | Only if image treatments need decisions (rare) |
| Inspector (QA) | For migration: verifies what came across |
| Researcher | Not involved |

## Fork: new vs migration

### A. New store
1. Collect product data: list, spreadsheet, photos — or a **client content
   pack** (xlsx workbook + numbered images). If the M3 operator delivered a
   pack, it usually contains everything: product/variant/SKU/price rows,
   collections with sort order, image filenames + alt text + crop guidance,
   business rules (shipping thresholds, VAT, draft-status constraints), and
   merchandising rules. Read it sheet by sheet before asking anyone for
   anything; see `vulpy-mission-3-design` →
   `references/client-content-pack.md` for the sheet-by-sheet handling guide
   and the Brume & Root worked example.
2. Before import, the operator must provide or explicitly approve: product
   titles/handles, descriptions, variant options and SKU/status, prices and
   currency, category tree and navigation labels, exact image filenames with
   alt text/crop guidance, and any shipping/VAT/draft-status rules. If one is
   missing, say **needs this decision** and name it; do not invent it.
3. Use the current template temporarily while Fox + Coder validate Medusa
   products, variants, prices, categories, and image mapping. Do not present
   temporary content as the finished homepage.
4. Placeholder images from Mission 3 are swapped or kept until real ones arrive.

### B. Migration
1. Import from current platform: inventory, variants, prices.
2. (Optional) Inspector verifies: what came across clean vs needs attention.
3. Verification report shown to the operator.

## Content-pack gotchas

- **Status column is law:** variants marked Draft are seeded but must not be
  promoted on the homepage or in grids (Brume & Root: Halo "Charcoal"
  variant was Draft while "Sand" was Active).
- **Prices are gross consumer prices** (VAT-inclusive for PL market) — do not
  re-tax them; record the assumption in `.hermes/catalog-state.md`.
- **Image files map 1:1 by exact filename** from the asset map; multiple
  variants can share one main image (e.g. amber/smoke glass variants).
- Compare-at prices exist only on some products — import as null when absent,
  not 0.

## Category tree + nav

Define/confirm the category tree and navigation labels in plain terms.

## Exit artifact

`.hermes/catalog-state.md`: seeded/imported product counts, categories,
verification notes, image status.

## Completion

Do not use a fixed success line. Report whether the rendered catalog is **ready
to move**, **needs this decision**, or **usable, can keep iterating**. When the
operator approves the validated catalog, say that M5 will integrate it with the
approved M3 design — not replace the design with temporary template content.

## Notes
- Greeting copy finalized 2026-08-31 (provision-missions.py + vulpy_missions.py).
- Idempotent seeds (see project AGENTS.md) — safe to run twice.