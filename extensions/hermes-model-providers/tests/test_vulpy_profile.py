"""Contract tests for Vulpy's public Hermes model aliases."""

from __future__ import annotations

import ast
import unittest
from pathlib import Path
from typing import cast


PLUGIN = Path(__file__).parents[1] / "vulpy" / "__init__.py"


def assigned_literal(name: str) -> dict[str, int | str]:
    tree = ast.parse(PLUGIN.read_text())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == name
            for target in node.targets
        ):
            return cast(dict[str, int | str], ast.literal_eval(node.value))
    raise AssertionError(f"{name} assignment not found")


def profile_fallback_models() -> tuple[str, ...]:
    tree = ast.parse(PLUGIN.read_text())
    for node in tree.body:
        if (
            isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "vulpy" for target in node.targets)
            and isinstance(node.value, ast.Call)
        ):
            for keyword in node.value.keywords:
                if keyword.arg == "fallback_models":
                    return cast(tuple[str, ...], ast.literal_eval(keyword.value))
    raise AssertionError("vulpy fallback_models assignment not found")


class VulpyPublicAliasContractTests(unittest.TestCase):
    def test_glm_public_aliases_have_full_output_caps_and_designer_is_listed(self) -> None:
        output_caps = assigned_literal("_VULPY_OUTPUT_CAPS")
        labels = assigned_literal("_VULPY_MODEL_LABELS")
        fallback_models = profile_fallback_models()

        self.assertEqual(output_caps["vulpy-designer"], 393216)
        self.assertEqual(output_caps["vulpy-writer"], 393216)
        self.assertEqual(output_caps["vulpy-vision"], 393216)
        self.assertEqual(labels["vulpy-designer"], "Vulpy Designer")
        self.assertIn("vulpy-designer", fallback_models)


if __name__ == "__main__":
    unittest.main()
