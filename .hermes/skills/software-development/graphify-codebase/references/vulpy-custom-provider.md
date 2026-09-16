# Vulpy Custom Provider for Graphify

Graphify supports custom LLM backends via `~/.graphify/providers.json`.
This registers a `vulpy` backend that reads Hermes' gateway config directly.

## Setup

### 1. Create the custom provider

```bash
mkdir -p ~/.graphify

cat > ~/.graphify/providers.json << 'PROVJSON'
{
  "vulpy": {
    "base_url": "https://gateway.vulpy.io/v1",
    "env_key": "VULPY_API_KEY",
    "env_key_source": "/data/data/hermes/.env",
    "default_model": "vulpy-default",
    "pricing": {"input": 0.0, "output": 0.0},
    "temperature": 0,
    "max_tokens": 16384,
    "vision": true
  }
}
PROVJSON
```

The `env_key_source` is consumed by the graphify update scripts so they load
the key from Hermes' env file before running.

### 2. Verify

```bash
graphify . --backend vulpy --dry-run
```

Should print something like:
```
[graphify] Using backend 'vulpy' (custom provider)
```

### 3. Use it

```bash
# Semantic extraction
graphify . --backend vulpy

# Community naming
graphify label /app/workspace --backend vulpy --model vulpy-smart

# Or via env var — auto-detect prefers vulpy
GRAPHIFY_DEFAULT_BACKEND=vulpy graphify .
```

## How it works

Graphify loads `~/.graphify/providers.json` at import time (see
`llm.py:_load_custom_providers`). Each provider is an OpenAI-compatible
endpoint config with a `base_url` and an `env_key` for the API key.

The Vulpy gateway (`gateway.vulpy.io/v1`) serves OpenAI-compatible
`/v1/chat/completions`, so any model served there works.

## Model selection

| Usage | Recommended | Notes |
|-------|-------------|-------|
| Semantic extraction | `vulpy-default` | Good balance for code inference |
| Deep mode / full rebuild | `vulpy-cutting-edge` | Higher quality edges |
| Community naming | `vulpy-smart` | Cheaper; labels are short text |

Set via `--model` flag on `graphify label` or `graphify .` commands.

## Why not OPENAI_BASE_URL?

The OPENAI_BASE_URL approach works but breaks when:
- The gateway URL changes (you forget to update the env var)
- A different LLM provider is the primary model
- You rotate API keys

The custom provider approach makes `--backend vulpy` a fixed target;
the key is always read from Hermes' canonical env file.