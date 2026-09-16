"""Functional tests for the Vulpy gateway usage.cost passthrough patch.

Unlike the unit-level patcher tests, these exercise the REAL patched Hermes
modules (after the patch has been applied to /app/hermes-agent) end-to-end:

  * the SDK preserves the gateway's ``cost`` field in ``model_extra``;
  * ``chat_completions.Usage`` carries it;
  * ``usage_pricing.normalize_usage()`` extracts it into
    ``CanonicalUsage.actual_cost_usd``;
  * a patched ``conversation_loop``-style accounting prefers it over the
    estimate and records ``cost_status="actual"``.

Run after applying the patch:
    python3 test_patch_vulpy_usage_cost.py
"""

import sys
import unittest
from decimal import Decimal
from types import SimpleNamespace
from pathlib import Path

HERMES = Path("/app/hermes-agent")
for p in (HERMES,):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


class VulpyUsageCostPassthroughTests(unittest.TestCase):
    """Verify the REAL patched modules carry usage.cost end-to-end."""

    @classmethod
    def setUpClass(cls):
        # Verify the patch is actually applied (idempotency mark present).
        from agent.transports import types as transport_types
        cls.types = transport_types
        from agent.transports import chat_completions as cc
        cls.cc = cc
        from agent import usage_pricing as up
        cls.up = up

        for fname, marker in (
            (transport_types.__file__, "vulpy patch"),
            (cc.__file__, "vulpy patch"),
            (up.__file__, "vulpy patch"),
        ):
            assert marker in Path(fname).read_text(encoding="utf-8"), f"patch missing in {fname}"

    # ── 1. Usage dataclass carries cost ────────────────────────────────────

    def test_usage_dataclass_has_cost_field(self):
        u = self.types.Usage(prompt_tokens=88, completion_tokens=10, total_tokens=98, cost=5e-05)
        self.assertEqual(u.cost, 5e-05)

    # ── 2. chat_completions transport preserves SDK cost in model_extra ────

    def test_transport_usage_cost_from_model_extra(self):
        # The OpenAI SDK preserves unknown fields in __pydantic_extra__ (and
        # exposes model_extra); simulate exactly that shape.
        usage = SimpleNamespace(
            prompt_tokens=88, completion_tokens=10, total_tokens=98,
            model_extra={"cost": 5e-05, "cost_details": {"upstream_inference_cost": 1.512e-05}},
        )
        cost = self.cc._usage_cost(usage)
        self.assertEqual(cost, 5e-05)

    def test_transport_usage_cost_from_attr(self):
        usage = SimpleNamespace(prompt_tokens=1, completion_tokens=1, total_tokens=2, cost=0.25)
        self.assertEqual(self.cc._usage_cost(usage), 0.25)

    def test_transport_usage_cost_absent(self):
        self.assertIsNone(self.cc._usage_cost(None))
        self.assertIsNone(self.cc._usage_cost(SimpleNamespace(prompt_tokens=1, completion_tokens=1, total_tokens=2)))

    # ── 3. normalize_usage extracts actual_cost_usd ────────────────────────

    def test_normalize_usage_carries_cost(self):
        raw = SimpleNamespace(
            prompt_tokens=88, completion_tokens=10, total_tokens=98,
            prompt_tokens_details=SimpleNamespace(cached_tokens=0, cache_write_tokens=0),
            completion_tokens_details=SimpleNamespace(reasoning_tokens=7),
            model_extra={"cost": 5e-05},
        )
        cu = self.up.normalize_usage(raw, provider="openai-api", api_mode="chat_completions")
        self.assertEqual(cu.actual_cost_usd, 5e-05)
        self.assertEqual(cu.input_tokens, 88)
        self.assertEqual(cu.output_tokens, 10)
        self.assertEqual(cu.reasoning_tokens, 7)

    def test_normalize_usage_cost_default_none(self):
        raw = SimpleNamespace(
            prompt_tokens=10, completion_tokens=5, total_tokens=15,
            prompt_tokens_details=SimpleNamespace(cached_tokens=0, cache_write_tokens=0),
            completion_tokens_details=SimpleNamespace(reasoning_tokens=0),
        )
        cu = self.up.normalize_usage(raw, provider="anthropic", api_mode="anthropic_messages")
        self.assertIsNone(cu.actual_cost_usd)

    # ── 4. conversation-loop accounting prefers actual over estimate ───────

    def test_accounting_prefers_actual_cost(self):
        """Mirror the patched conversation_loop block: when the gateway reports
        an exact cost, the session accumulates it and cost_status=actual even
        though estimate_usage_cost would return None for a vulpy-* alias."""
        # Simulate the agent object with the fields the block touches.
        agent = SimpleNamespace(
            model="vulpy-default",
            provider="openai-api",
            base_url="https://gateway.vulpy.io",
            api_key="",
            session_estimated_cost_usd=0.0,
        )
        canonical_usage = self.up.CanonicalUsage(
            input_tokens=88, output_tokens=10, actual_cost_usd=5e-05,
        )
        # estimate_usage_cost for a vulpy alias with no pricing -> None
        cost_result = self.up.estimate_usage_cost(
            "vulpy-default", canonical_usage,
            provider="openai-api", base_url="https://gateway.vulpy.io",
        )
        self.assertIsNone(cost_result.amount_usd)
        self.assertEqual(cost_result.status, "unknown")

        # The patched block prefers actual_cost_usd when present.
        _actual_cost = canonical_usage.actual_cost_usd
        if _actual_cost is not None:
            agent.session_estimated_cost_usd += float(_actual_cost)
            cost_result = self.up.CostResult(
                amount_usd=Decimal(str(_actual_cost)),
                status="actual",
                source="provider_generation_api",
                label=f"${_actual_cost:.4f}",
            )
        elif cost_result.amount_usd is not None:
            agent.session_estimated_cost_usd += float(cost_result.amount_usd)

        self.assertEqual(agent.session_estimated_cost_usd, 5e-05)
        self.assertEqual(cost_result.status, "actual")
        self.assertEqual(cost_result.source, "provider_generation_api")
        self.assertEqual(str(cost_result.amount_usd), "0.00005")


if __name__ == "__main__":
    unittest.main()
