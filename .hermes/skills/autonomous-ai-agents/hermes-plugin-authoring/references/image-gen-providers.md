# Image-gen providers — authoring a pluggable backend for `image_generate`

Verified 2026-08-26 against `/app/hermes-agent` source while shipping the
`image-gen-vulpy` user plugin (`$HERMES_HOME/plugins/image-gen-vulpy/`).

## The lane

Image generation is NOT a JSON tool plugin — it's a **provider** registered via a
different ctx hook:

```python
def register(ctx):
    for provider in _build_providers():
        ctx.register_image_gen_provider(provider)   # NOT ctx.register_tool
```

`ctx.register_image_gen_provider` validates the object is an
`agent.image_gen_provider.ImageGenProvider` subclass; its `.name` is what
`image_gen.provider` in config.yaml must match. Selection: config
`image_gen: { provider: <name> }`; if set to a name no plugin registered, the
tool fails with `provider_not_registered` ("Run hermes plugins list") — and a
freshly written plugin stays invisible until the **gateway restarts** (plugin
set loads at process start; enabling alone doesn't hot-register mid-session).

## The ImageGenProvider contract (all members matter)

Mirror the bundled reference implementation:
`/app/hermes-agent/plugins/image_gen/openrouter/__init__.py`
(`OpenRouterCompatImageProvider`) — it's the template for any
OpenRouter-compatible endpoint (OpenRouter, Nous Portal, Vulpy gateway all
speak the same chat/completions image protocol).

Required surface:

| Member | Notes |
|---|---|
| `name` (property) | matches `image_gen.provider` in config |
| `display_name` (property) | UI/setup surfaces |
| `is_available()` | resolve creds; return bool. Resolution failure = False |
| `capabilities()` | `{"modalities": ["text","image"], "max_reference_images": N}` |
| `list_models()` | `[{"id","display","strengths"}]` |
| `default_model()` | Optional[str] |
| `get_setup_schema()` | `{"name","badge","tag","env_vars":[{"key","prompt","url"}]}` |
| `generate(prompt, aspect_ratio=DEFAULT_ASPECT_RATIO, *, image_url=None, reference_image_urls=None, **kwargs)` | THE contract |

## ⚠️ generate() is SYNC — do not write async

The abstract method is plain `def generate(...) -> Dict[str, Any]`. The
`image_generate` tool registers with **`is_async=False`** and calls
`provider.generate(**kwargs)` synchronously (comment: "sync fal_client API to
avoid 'Event loop is closed' in gateway"). Writing `async def generate_image()`
silently breaks dispatch — the tool gets a coroutine back instead of a dict.
Use blocking HTTP (`requests.post(..., timeout=300)`), same as every bundled
provider. "Async" in older notes refers to an upstream executor workaround,
not the Hermes provider interface.

## OpenRouter-compatible image protocol (chat/completions)

```python
payload = {
    "model": model_id,
    "modalities": ["image", "text"],
    "messages": [{"role": "user", "content": [{"type": "text", "text": prompt},
                                              # + optional {"type":"image_url","image_url":{"url": ref}} parts]}],
    "image_config": {"aspect_ratio": "1:1"},   # square/16:9 mapping
}
POST {base_url}/chat/completions   # Authorization: Bearer <key>
```

Images come back at `choices[0].message.images[].image_url.url` as
`data:image/...;base64` URIs → `save_b64_image(b64, prefix=...)` /
`save_url_image(url, ...)`. Return `success_response(image=path, model=...,
prompt=..., aspect_ratio=...)` or `error_response(error=..., error_type=...)`
— both helpers from `agent.image_gen_provider`.

Model-chain pattern (quality-first with fallback): explicit `model` kwarg →
env override (`<PROVIDER>_IMAGE_MODEL`) → scoped config `image_gen.<key>.model`
→ default chain. Any explicit selection = no fallback.

## Credential resolution

Reuse the shared resolver — never reinvent auth:

```python
from hermes_cli.runtime_provider import resolve_runtime_provider
runtime = resolve_runtime_provider(requested=self._runtime_name)
base_url = runtime["base_url"]; api_key = runtime["api_key"]
```

For a gateway that already has a `kind: model-provider` plugin (like Vulpy),
`resolve_runtime_provider(requested="<name>")` picks up its base_url + key +
env vars automatically — the image plugin then needs NO credential handling of
its own.

## Offline verification (before any restart)

```python
import importlib.util, sys
sys.path.insert(0, '/app/hermes-agent')
spec = importlib.util.spec_from_file_location('igp', '<plugin>/__init__.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
p = mod._build_providers()[0]
print(p.name, p.is_available(), p.default_model())   # vulpy True vulpy-image
```

Then enable (`hermes plugins enable <key>`; add
`--allow-tool-override` if flagged) and **restart the gateway** to test live.

## Vulpy specifics (2026-08-26)

- Gateway alias: `vulpy-image` (listed by `/v1/models`); speaks the protocol
  above against `https://gateway.vulpy.io/v1/chat/completions`.
- Direct-OpenRouter fallback when the Vulpy balance 402s: same payload shape
  against `openrouter.ai/api/v1/chat/completions` with
  `OPENROUTER_API_KEY` + an image model id
  (e.g. `google/gemini-2.5-flash-image`). Expect ~800KB–1MB JPEGs per square
  image; budget ~10 images ≈ $0.5–1 before hitting low balances.
- Shipped plugin: `$HERMES_HOME/plugins/image-gen-vulpy/` (+ `plugin.yaml`,
  enabled with `allow_tool_override: true`).
