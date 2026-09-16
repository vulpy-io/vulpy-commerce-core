# Graphify Capabilities Audit (2026-08-22)

What graphify can and can't tell you about this codebase, verified by running
every subcommand against the live 24k-node graph.

## Commands tested and what they returned

| Command | Result | Verdict |
|---------|--------|---------|
| `graphify query "cart state flow"` | BFS depth=2, 78 nodes including CartProvider, CheckoutForm, getMedusaClient, server actions | ✅ Useful for finding relevant files by concept |
| `graphify explain "shop-catalog-service.ts"` | 69 connections: imports, callers, callees, grouped by file | ✅ Excellent for module onboarding |
| `graphify god-nodes --top 15` | Top 3: t() (212), push() (153), slice() (137) — mostly minified/utility noise | ⚠️ Top hits are mangled names; real architecture hubs (shop-catalog-service at 69, SiteLayoutClient) are further down |
| `graphify path "CartContext" "checkout"` | "No directed path found" | ❌ Cannot trace React component composition |
| `graphify affected "CartContext" --depth 2` | "No affected nodes found" | ❌ Reverse traversal misses framework-level dependencies |
| `graphify diagnose multigraph` | 0 duplicate edges, 0 collapsed pairs | ✅ Structurally clean |
| `graphify query "checkout stripe payment" --budget 3000` | 107 nodes found, truncated at 74 shown | ✅ Works but needs --budget for broad queries |

## Staleness detection

```bash
# Compare graph commit vs HEAD
head -1 graphify-out/GRAPH_REPORT.md    # "Built from commit: `abc123`"
git rev-parse HEAD                      # current HEAD
# If different → run pnpm graphify:update
```

## Semantic extraction gap

The graph is built with `--code-only` (no API key set). This means:
- Only AST relationships (imports, exports, calls, contains) are captured
- No inferred relationships like "this function handles payment failures"
- No document-level semantic edges connecting README concepts to code
- `GRAPH_REPORT.md` shows 98% EXTRACTED / 2% INFERRED at 0.54 confidence — the 2% is from
  the built-in heuristic inference, not an LLM pass

To enable LLM extraction: set `ANTHROPIC_API_KEY` in the environment and run
`pnpm graphify:build` (full rebuild). The post-commit hook and CI will then use
it automatically.

## Community naming quality

Clusters are named using the heuristic (file-based) approach, not LLM. Names
are mostly derived from the most-connected file in each community. This means:
- `getMedusaClient` community correctly groups client.ts, auth helpers, data loaders
- Minified/mangled names (`kX`, `n`, `t()`) appear as top-level community hubs
  because they have high edge counts from plugin code

Running `graphify label --missing-only` with an API key would rename all
"Community N" placeholders with semantic names, but the heuristic names are
already decent for the codebase.