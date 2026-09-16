import importlib.util
import json
import re
from pathlib import Path

import pytest

MODULE_PATH = Path(__file__).parents[1] / "__init__.py"
SPEC = importlib.util.spec_from_file_location("vulpy_commerce", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

design_task = MODULE.design_task
_tailwind_theme_config = MODULE._tailwind_theme_config


def _scaffold_html(result: str) -> str:
    d = json.loads(result)
    assert d.get("ok"), d
    path = d["scaffold"].replace("file://", "")
    return Path(path).read_text()


def test_design_task_clean_mode_is_contract_free_and_has_no_tokens():
    # Clean/onboarding mode must NOT require response_language/provenance
    # (read-only generator), must include Tailwind CDN + fonts, and must NOT
    # inject storefront tokens.
    out = design_task({"route": "/", "tokens": "clean", "body_snippet": "<h1>hi</h1>"}, task_id="x")
    html = _scaffold_html(out)
    assert "cdn.tailwindcss.com" in html
    assert "fonts.googleapis.com" in html
    assert "tailwind.config" in html
    assert "--color-white" not in html
    assert "--color-surface" not in html
    assert "var(--design-" not in html


def test_design_task_default_injects_resolved_storefront_tokens():
    out = design_task({"route": "/", "body_snippet": "<h1>home</h1>"}, task_id="x")
    d = json.loads(out)
    assert d.get("tokens") == "storefront"
    assert len(d.get("token_vars", [])) > 0
    html = _scaffold_html(out)
    assert "cdn.tailwindcss.com" in html
    # No unresolved var(--design-*) references may leak into the config
    assert re.findall(r"var\(--design-[a-z0-9-]+", html) == []


def test_tailwind_theme_config_resolves_var_references_to_hex():
    tokens = {
        "--color-action-primary-background": "var(--design-color-action-primary-background)",
        "--color-content-primary": "var(--design-color-content-primary, #171513)",
        "--color-plain": "#112233",
    }
    cfg_src = _tailwind_theme_config(tokens)
    cfg = json.loads(cfg_src.replace("tailwind.config = ", "").rstrip(";"))
    colors = cfg["theme"]["extend"]["colors"]
    assert re.match(r"^#[0-9a-fA-F]{3,8}$", colors["actionprimarybackground"])
    assert re.match(r"^#[0-9a-fA-F]{3,8}$", colors["contentprimary"])
    assert colors["plain"] == "#112233"
