---
name: charting-responses
description: >
  Use when answering a question where data has a visual shape worth seeing —
  trends, comparisons, distributions, or cumulative volumes over 3+ points.
  Governs when to call create_chart, which type to pick, and how to label it.
triggers:
  - answering a question with 3+ numeric data points
  - time-series, ranking, share breakdown, or cumulative data
  - user asks for a chart, graph, or visualization
  - store analytics, order stats, revenue, visitor, or product data
---

# Charting responses

## When to chart

Chart when the data has a **shape** worth seeing. Skip when a sentence or two-column table is more precise.

| Situation | Chart? |
|-----------|--------|
| Trend over time (≥3 points) | ✅ yes |
| Comparison across ≥3 categories | ✅ yes |
| Share / composition breakdown | ✅ yes |
| Cumulative or volume over time | ✅ yes |
| Single number or two numbers | ❌ state it in prose |
| Table with mixed types | ❌ table is better |
| Exact precision matters most | ❌ table or inline |

**Rule of thumb:** if the takeaway is "X grew" or "Y dominates" or "Z has the biggest share", a chart earns its place. If the takeaway is a specific number, write the number.

## Type selection

| Pattern | Type |
|---------|------|
| Metric over time | `line` |
| Comparison across discrete categories | `bar` |
| Share / composition (parts of a whole) | `pie` |
| Volume / area under a curve over time | `area` |

When unsure between `line` and `area`: use `area` for cumulative totals, `line` for rates.

## Calling create_chart

```
create_chart(
  chart_type = "line" | "bar" | "pie" | "area",
  title      = "<concise human title>",
  data       = [{"label": str, "value": number}, ...],
  options    = {"color": hex, "x_label": str, "y_label": str}   # all optional
)
```

- `value` must be a **plain number** — no strings, no currency symbols
- Prices / revenue: **major units** (same as Medusa — never divide Medusa amounts by 100, never multiply)
- Labels: short strings, ≤12 chars preferred (month abbrev, category name, short handle)
- Max ~12 data points for readability; aggregate the rest into "Other" if needed

## Palette (Vulpy brand)

Use these for `options.color` when the chart represents a specific semantic:

| Meaning | Hex |
|---------|-----|
| Primary / revenue / default | `#c8743a` terracotta |
| Success / growth / paid | `#1a8245` |
| Danger / cancellations / loss | `#b60802` |
| Warning / pending / approaching limit | `#d97706` |
| Info / visitors / neutral metric | `#3286c8` |
| Brand brown / secondary | `#917964` |

For pie charts omit `color` — the renderer cycles the full palette automatically.

## Fake / illustrative data

When rendering examples, demos, or test data:
- Prefix the title with **"Fake "** — e.g. `"Fake Revenue (line)"`
- Never present made-up numbers as real store data
- Real data only comes from a live Medusa or Payload API call

## Multiple charts in one answer

Render all charts in a single assistant turn (parallel `create_chart` calls). Don't interleave prose between tool calls — emit all charts first, then a brief text summary below.

## After rendering

One or two sentences interpreting the shape — what's the takeaway the numbers show. Don't restate the axis labels.
