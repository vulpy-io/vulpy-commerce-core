"""Tests for the durable Vulpy context-metadata patcher.

The fixture is assembled from the patcher's anchors, so tests exercise the
source that the Docker build will actually generate without depending on an
image-baked Hermes checkout.  The fixture models the installed
``agent/model_metadata.py`` control flow (registered-provider gate at step 2,
step-5 provider branches, step-9 fallback) with an in-memory ``/models``
registry for ``gateway.vulpy.io``.
"""

import importlib.util
import py_compile
import subprocess
import sys
import tempfile
import textwrap
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PATCHER = ROOT / "patch-vulpy-context-metadata.py"

VULPY_BASE_URL = "https://gateway.vulpy.io"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("patch_vulpy_context_metadata", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _apply(patcher, source):
    """Run the patcher over source text and return the patched text.

    Raises SystemExit when an anchor is missing/unambiguous (fail-closed).
    """
    fn = getattr(patcher, "apply_text", None)
    if callable(fn):
        return fn(source)
    return patcher.apply(source)


def _run_patcher_cli(patcher_path, target_path):
    return subprocess.run(
        [sys.executable, str(patcher_path), str(target_path)],
        capture_output=True,
        text=True,
    )


def _load_fixture(source):
    module = types.ModuleType("fixture_model_metadata")
    # The patched branch calls utils.base_url_host_matches — resolve it from
    # the real installed hermes-agent (no network, pure string helper) exactly
    # as the real module would.
    utils = types.ModuleType("utils")
    utils.base_url_host_matches = _base_url_host_matches
    sys.modules["utils"] = utils
    try:
        exec(compile(source, "<fixture-model_metadata.py>", "exec"), module.__dict__)
    finally:
        sys.modules.pop("utils", None)
    return module


def _base_url_host_matches(base_url: str, domain: str) -> bool:
    """Mirror of hermes-agent/utils.py:base_url_host_matches (pure string)."""
    raw = (base_url or "").strip()
    if not raw:
        return False
    host = raw.split("://", 1)[-1].split("/", 1)[0].split(":")[0].lower().rstrip(".")
    domain = (domain or "").strip().lower().rstrip(".")
    if not domain:
        return False
    return host == domain or host.endswith("." + domain)


# ── Fixture: faithful model of the installed file's resolution chain ───────

FIXTURE = textwrap.dedent(
    '''\
    """Model metadata, context lengths, and token estimation utilities."""

    import time
    from typing import Any, Dict, Optional

    _endpoint_model_metadata_cache: Dict[str, Dict[str, Any]] = {}
    _endpoint_model_metadata_cache_time: Dict[str, float] = {}
    _ENDPOINT_MODEL_CACHE_TTL = 300

    # In-memory stand-in for the live gateway /v1/models registry (the real
    # runtime gets this from the Vulpy provider plugin).
    _VULPY_MODELS = [
        {"id": "vulpy-default", "object": "model", "max_input_tokens": 1048576, "name": "vulpy-default"},
        {"id": "vulpy-coder", "object": "model", "max_input_tokens": 1048576},
    ]

    def _normalize_base_url(base_url: str) -> str:
        return (base_url or "").strip().rstrip("/")


    def _is_openrouter_base_url(base_url: str) -> bool:
        return "openrouter.ai" in (base_url or "")


    def _is_custom_endpoint(base_url: str) -> bool:
        normalized = _normalize_base_url(base_url)
        return bool(normalized) and not _is_openrouter_base_url(normalized)


    def _infer_provider_from_url(base_url: str):
        host = (base_url or "").replace("https://", "").replace("http://", "").split("/")[0].lower()
        if "gateway.vulpy.io" in host:
            return "vulpy"
        return None


    def _is_known_provider_base_url(base_url: str) -> bool:
        return _infer_provider_from_url(base_url) is not None


    def _extract_context_length(payload: Dict[str, Any]) -> Optional[int]:
        value = payload.get("max_input_tokens")
        if isinstance(value, int) and value > 0:
            return value
        return None


    def fetch_endpoint_model_metadata(
        base_url: str,
        api_key: str = "",
        force_refresh: bool = False,
    ) -> Dict[str, Dict[str, Any]]:
        """Fetch model metadata from an OpenAI-compatible ``/models`` endpoint."""
        normalized = _normalize_base_url(base_url)
        if not normalized or _is_openrouter_base_url(normalized):
            return {}
        if not force_refresh:
            cached = _endpoint_model_metadata_cache.get(normalized)
            if cached is not None:
                return cached
        payload = {"object": "list", "data": _VULPY_MODELS}
        cache = {}
        for model in payload.get("data", []):
            if not isinstance(model, dict):
                continue
            model_id = model.get("id")
            if not model_id:
                continue
            entry = {"name": model.get("name", model_id)}
            context_length = _extract_context_length(model)
            if context_length is not None:
                entry["context_length"] = context_length
            cache[model_id] = entry
        _endpoint_model_metadata_cache[normalized] = cache
        _endpoint_model_metadata_cache_time[normalized] = time.time()
        return cache


    def _resolve_endpoint_context_length(
        model: str,
        base_url: str,
        api_key: str = "",
    ) -> Optional[int]:
        """Resolve context length from an endpoint's live ``/models`` metadata."""
        endpoint_metadata = fetch_endpoint_model_metadata(base_url, api_key=api_key)
        matched = endpoint_metadata.get(model)
        if not matched:
            if len(endpoint_metadata) == 1:
                matched = next(iter(endpoint_metadata.values()))
            else:
                for key, entry in endpoint_metadata.items():
                    if model in key or key in model:
                        matched = entry
                        break
        if matched:
            context_length = matched.get("context_length")
            if isinstance(context_length, int):
                return context_length
        return None


    DEFAULT_FALLBACK_CONTEXT = 256_000


    def get_model_context_length(
        model: str,
        base_url: str = "",
        api_key: str = "",
        config_context_length: int | None = None,
        provider: str = "",
        custom_providers: list | None = None,
    ) -> int:
        if config_context_length is not None and isinstance(config_context_length, int) and config_context_length > 0:
            return config_context_length

        # 2. Active endpoint metadata for truly custom/unknown endpoints.
        # Known providers (Copilot, OpenAI, Anthropic, etc.) skip this — their
        # /models endpoint may report a provider-imposed limit (e.g. Copilot
        # returns 128k) instead of the model's full context (400k).  models.dev
        # has the correct per-provider values and is checked at step 5+.
        if _is_custom_endpoint(base_url) and not _is_known_provider_base_url(base_url):
            context_length = _resolve_endpoint_context_length(model, base_url, api_key=api_key)
            if context_length is not None:
                return context_length
            if not _is_known_provider_base_url(base_url):
                return DEFAULT_FALLBACK_CONTEXT

        effective_provider = provider
        if not effective_provider or effective_provider in {"openrouter", "custom"}:
            if base_url:
                inferred = _infer_provider_from_url(base_url)
                if inferred:
                    effective_provider = inferred

        # Step 5 provider branches — prior upstream shape (GMI branch present,
        # no Vulpy branch yet).
        if effective_provider == "gmi" and base_url:
            # GMI exposes authoritative context_length via /models, but it is not
            # in models.dev yet. Preserve that higher-fidelity endpoint lookup.
            ctx = _resolve_endpoint_context_length(model, base_url, api_key=api_key)
            if ctx is not None:
                return ctx
        # 5e. Ollama native /api/show probe — runs for providers whose base_url
        # is NOT a known non-Ollama provider.
        if base_url and not _is_known_provider_base_url(base_url):
            pass

        # 9. Default fallback — 256K
        return DEFAULT_FALLBACK_CONTEXT
    '''
)


class PatchVulpyContextMetadataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    # -- 1. Response shape: OpenAI-compatible data[].id + max_input_tokens ----

    def test_endpoint_metadata_parses_vulpy_models_response_shape(self):
        metadata = _load_fixture(FIXTURE).fetch_endpoint_model_metadata(
            VULPY_BASE_URL, api_key="k"
        )
        self.assertEqual(metadata["vulpy-default"]["context_length"], 1048576)
        self.assertEqual(metadata["vulpy-coder"]["context_length"], 1048576)
        self.assertEqual(metadata["vulpy-default"]["name"], "vulpy-default")

    # -- 2. Resolver returns 1048576 instead of 256000 ------------------------

    def test_resolver_returns_advertised_length_when_vulpy(self):
        module = _load_fixture(FIXTURE)
        self.assertEqual(
            module._resolve_endpoint_context_length(
                "vulpy-default", VULPY_BASE_URL, "k"
            ),
            1048576,
        )

    def test_get_model_context_length_reports_256k_without_the_patch(self):
        """Reproduction from the installed source: unpatched resolution falls
        back to 256000 for the registered Vulpy provider (known-provider skip
        at step 2 means the live /models metadata is never consulted)."""
        module = _load_fixture(FIXTURE)
        self.assertEqual(
            module.get_model_context_length(
                "vulpy-default",
                VULPY_BASE_URL,
                api_key="k",
                provider="vulpy",
            ),
            256000,
        )

    def test_patched_resolver_returns_one_megabyte_before_known_provider_skip(self):
        """The patched module must reach the authenticated /models metadata for
        the registered Vulpy provider instead of skipping to the known-provider
        fallback (the 256000 reproduction)."""
        patched_src = _apply(self.patcher, FIXTURE)
        module = _load_fixture(patched_src)
        self.assertEqual(
            module.get_model_context_length(
                "vulpy-default",
                VULPY_BASE_URL,
                api_key="k",
                provider="vulpy",
            ),
            1048576,
        )

    # -- 3. Non-Vulpy behavior unchanged --------------------------------------

    def test_non_vulpy_behavior_unchanged(self):
        unpatched = _load_fixture(FIXTURE)
        patched = _load_fixture(_apply(self.patcher, FIXTURE))
        for model, base_url, provider in (
            ("gpt-5.4", "https://api.openai.com/v1", "openai"),
            ("unknown-model", "https://some-gateway.example/v1", ""),
        ):
            before = unpatched.get_model_context_length(
                model, base_url=base_url, api_key="k", provider=provider
            )
            after = patched.get_model_context_length(
                model, base_url=base_url, api_key="k", provider=provider
            )
            self.assertEqual(after, before, (model, base_url, provider))

    def test_config_override_still_wins(self):
        patched = _load_fixture(_apply(self.patcher, FIXTURE))
        self.assertEqual(
            patched.get_model_context_length(
                "vulpy-default", VULPY_BASE_URL, api_key="k",
                provider="vulpy", config_context_length=65536,
            ),
            65536,
        )

    # -- 4. Prior-version fixture applies cleanly -----------------------------

    def test_applies_to_prior_version_fixture(self):
        patched = _apply(self.patcher, FIXTURE)
        self.assertIn("vulpy", patched)
        self.assertIn("1048576", patched)
        compile(patched, "<prior-version-model_metadata.py>", "exec")

    # -- 5. Second run byte-for-byte idempotent -------------------------------

    def test_second_run_is_byte_for_byte_idempotent(self):
        first = _apply(self.patcher, FIXTURE)
        second = _apply(self.patcher, first)
        self.assertEqual(first, second)
        self.assertNotEqual(first, FIXTURE)

    # -- 6. Exact patched source compiles + CLI wiring idempotent -------------

    def test_exact_patched_source_compiles_and_cli_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "model_metadata.py"
            target.write_text(_apply(self.patcher, FIXTURE), encoding="utf-8")
            py_compile.compile(str(target), doraise=True)

            first = _run_patcher_cli(PATCHER, target)
            self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
            self.assertIn("Already patched", first.stdout)
            after_first = target.read_bytes()
            second = _run_patcher_cli(PATCHER, target)
            self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
            self.assertEqual(target.read_bytes(), after_first)

    # -- 7. Drift fails closed ------------------------------------------------

    def test_drifted_anchor_fails_closed(self):
        drifted = FIXTURE.replace(
            '    if effective_provider == "gmi" and base_url:\n',
            '    if effective_provider == "gmi-refactored" and base_url:\n',
        )
        with self.assertRaises(SystemExit):
            _apply(self.patcher, drifted)


if __name__ == "__main__":
    unittest.main()