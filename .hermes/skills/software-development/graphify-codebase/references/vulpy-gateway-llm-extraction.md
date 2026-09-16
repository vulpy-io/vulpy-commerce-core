# Vulpy Gateway → Graphify LLM Extraction

Discovered 2026-08-22: graphify's LLM extraction pass can be routed through the
project's Vulpy gateway instead of requiring a direct Anthropic/OpenAI key.

## Setup

```bash
export OPENAI_API_KEY="$(grep VULPY_API_KEY /data/data/hermes/.env | cut -d= -f2-)"
export OPENAI_BASE_URL="https://gateway.vulpy.io/v1"
```

The gateway is fully OpenAI-compatible (`/v1/chat/completions`). Graphify's
auto-detect picks up `OPENAI_API_KEY` + `OPENAI_BASE_URL` and routes through
the openai backend.

## Model selection

| Pass | Recommended model | Notes |
|------|-------------------|-------|
| Semantic extraction (default) | `vulpy-default` | Good balance of cost vs quality for code inference |
| Semantic extraction (deep) | `vulpy-cutting-edge` | Set via `GRAPHIFY_FLAGS="--mode deep"` |
| Community naming | `vulpy-smart` | `graphify label /app/workspace --model vulpy-smart` |
| Community naming (full) | `vulpy-default` | `graphify label /app/workspace` |

Set via `OPENAI_MODEL` for the default pass, or `--model` flag for label/cluster.

## Verification

```bash
export OPENAI_API_KEY="$(grep VULPY_API_KEY /data/data/hermes/.env | cut -d= -f2-)"
export OPENAI_BASE_URL="https://gateway.vulpy.io/v1"
export OPENAI_MODEL="vulpy-default"

# Test that the gateway accepts the auth and model
curl -s "$OPENAI_BASE_URL/chat/completions" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"vulpy-default","messages":[{"role":"user","content":"test"}],"max_tokens":5}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('OK' if 'choices' in d else d.get('error',d))"
```

## Auto-detect order

Graphify's backend priority: `ANTHROPIC_API_KEY > OPENAI_API_KEY > GEMINI_API_KEY`.
When `OPENAI_BASE_URL` is set alongside `OPENAI_API_KEY`, the openai backend is
used regardless of key priority (the base URL acts as a routing hint).

## What the LLM pass adds

Without LLM (current state, `--code-only`):
- 98% extracted / 2% inferred (heuristic, 0.54 confidence)
- Only explicit import/export/contains/calls edges
- React component composition invisible
- `graphify affected "CartContext"` returns empty

With LLM pass (via gateway):
- Semantic edge types: "this component renders these children", "this function
  handles this event type", "this document describes these modules"
- Framework-level relationships visible
- Community naming becomes descriptive instead of file-based
- `graphify affected` and `graphify path` return meaningful results for
  compositional patterns

## Cost estimate

For a full rebuild on ~1,900 files (24k nodes):
- Semantic extraction: ~300-500k input tokens, ~50k output tokens
- Community naming: ~100-200k input tokens, ~20k output tokens
- Total: well under $1 on vulpy-default

Incremental updates (`graphify:update`) only process changed files — typically
5-20 files per commit, so ~1-5k tokens per update.