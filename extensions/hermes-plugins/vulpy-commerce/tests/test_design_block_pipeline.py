import importlib.util
import json
from pathlib import Path

import pytest

MODULE_PATH = Path(__file__).parents[1] / "design_block_pipeline.py"
SPEC = importlib.util.spec_from_file_location("design_block_pipeline", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

BLOCK_CAPABILITIES = MODULE.BLOCK_CAPABILITIES
compose_blocks = MODULE.compose_blocks
classify_handoff = MODULE.classify_handoff
extract_design_inventory = MODULE.extract_design_inventory
map_capabilities = MODULE.map_capabilities
verify_render = MODULE.verify_render

FIXTURE = Path(__file__).parent / "fixtures" / "design-home.html"
EXPECTED = json.loads((Path(__file__).parent / "fixtures" / "expected-design-inventory.json").read_text())


def test_extracts_sections_in_document_order_and_is_deterministic():
    html = FIXTURE.read_text()
    first = extract_design_inventory(html)
    assert first == extract_design_inventory(html)
    assert [section["name"] for section in first["sections"]] == [
        "hero", "category-grid", "new-arrivals", "story", "care", "newsletter"
    ]
    assert first["sections"][0]["tokens"] == ["color.canvas", "font.display"]
    assert first["sections"][0]["media"] == ["/media/hero.jpg"]
    assert first["sections"][0]["links"] == [{"label": "Shop now", "url": "/shop"}]
    assert first["data_dependencies"] == ["categories", "products"]
    assert first["interaction_requirements"] == ["email-submit", "product-filter"]
    assert [section["name"] for section in first["sections"]] == EXPECTED["section_order"]


def test_maps_to_exact_known_block_targets():
    mapped = map_capabilities(extract_design_inventory(FIXTURE.read_text()))
    assert [item["target"] for item in mapped["mappings"]] == [
        "hero", "categoryGrid", "productGrid", "richText", "mediaWithText", "newsletter"
    ]
    assert all(item["kind"] == "known" for item in mapped["mappings"])
    assert set(BLOCK_CAPABILITIES) >= {"hero", "categoryGrid", "productGrid", "richText", "mediaWithText", "newsletter"}


def test_unsupported_interaction_is_blocked_not_approximated():
    inventory = extract_design_inventory('<section data-section="hero" data-interaction="drag-to-rotate"><h1>X</h1></section>')
    mapped = map_capabilities(inventory)
    assert mapped["blocked"] is True
    assert mapped["unsupported"] == [{"section": "hero", "interaction": "drag-to-rotate"}]


def test_composes_order_required_fields_media_and_links():
    inventory = extract_design_inventory(FIXTURE.read_text())
    mapped = map_capabilities(inventory)
    result = compose_blocks(inventory, mapped)
    assert result["valid"] is True
    assert [block["blockType"] for block in result["blocks"]] == [
        "hero", "categoryGrid", "productGrid", "richText", "mediaWithText", "newsletter"
    ]
    assert result["blocks"][0]["slides"][0]["ctaUrl"] == "/shop"
    assert result["blocks"][0]["slides"][0]["imageUrl"] == "/media/hero.jpg"
    assert result["blocks"][4]["imageUrl"] == "/media/care.jpg"


def test_composition_is_idempotent_and_missing_required_fields_fail():
    inventory = extract_design_inventory(FIXTURE.read_text())
    mapped = map_capabilities(inventory)
    assert compose_blocks(inventory, mapped) == compose_blocks(inventory, mapped)
    broken = {"sections": [{"name": "hero", "text": [], "tokens": [], "media": [], "links": [], "data_dependencies": [], "interaction_requirements": []}], "data_dependencies": [], "interaction_requirements": []}
    broken_map = map_capabilities(broken)
    failed = compose_blocks(broken, broken_map)
    assert failed["valid"] is False
    assert failed["missing"][0]["fields"] == ["slides"]


def test_render_verification_detects_order_markers_and_stale_template():
    expected = extract_design_inventory(FIXTURE.read_text())
    assert verify_render(FIXTURE.read_text(), expected, required_markers=["Objects that refuse", "/shop"])["valid"] is True
    stale = verify_render('<main><section data-section="hero">Vulpy Design Mockup</section></main>', expected)
    assert stale["valid"] is False
    assert "stale_template" in stale["failures"]


@pytest.mark.parametrize("status", ["ready_to_move_on", "needs_user_decision", "works_keep_iterating", "blocked", "failed"])
def test_handoff_status_classifier_allows_only_specified_statuses(status):
    assert classify_handoff(status) == status


def test_handoff_status_classifier_rejects_unknown_status():
    with pytest.raises(ValueError):
        classify_handoff("done")
