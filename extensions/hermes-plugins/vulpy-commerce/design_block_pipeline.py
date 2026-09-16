"""Pure HTML-design to storefront block pipeline.

The parser treats design HTML as inert text. It never executes markup or scripts.
"""

from __future__ import annotations

import json
from html.parser import HTMLParser
from typing import Any


HANDOFF_STATUSES = frozenset(
    {"ready_to_move_on", "needs_user_decision", "works_keep_iterating", "blocked", "failed"}
)

# The target names and fields mirror apps/storefront/src/lib/cms/types.ts.
BLOCK_CAPABILITIES: dict[str, dict[str, Any]] = {
    "hero": {"kind": "known", "required": ["slides", "promos", "badges"], "required_nonempty": ["slides"]},
    "categoryGrid": {"kind": "known", "required": ["eyebrow", "title", "limit"]},
    "productGrid": {"kind": "known", "required": ["title", "eyebrow", "subtitle", "ctaLabel", "ctaUrl", "variant", "limit"]},
    "richText": {"kind": "known", "required": ["content"]},
    "mediaWithText": {"kind": "known", "required": ["title", "content", "ctaLabel", "ctaUrl", "mediaType", "imageUrl", "videoUrl", "embedUrl", "autoplay", "mediaPosition", "swapOnMobile"]},
    "newsletter": {"kind": "known", "required": ["title", "subtitle", "placeholder", "bgImageUrl"]},
}

_SECTION_TARGETS = {
    "hero": "hero",
    "category-grid": "categoryGrid",
    "new-arrivals": "productGrid",
    "story": "richText",
    "care": "mediaWithText",
    "newsletter": "newsletter",
}
_SUPPORTED_INTERACTIONS = {"product-filter", "email-submit"}


class _InventoryParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.sections: list[dict[str, Any]] = []
        self._section: dict[str, Any] | None = None
        self._tag_stack: list[str] = []
        self._link: dict[str, str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        if tag == "section" and self._section is None:
            self._section = {
                "name": values.get("data-section", "section"), "text": [], "tokens": _split(values.get("data-token", "")),
                "media": _split(values.get("data-media", "")), "links": [],
                "data_dependencies": _split(values.get("data-dependency", "")),
                "interaction_requirements": _split(values.get("data-interaction", "")),
            }
        if self._section is not None:
            self._tag_stack.append(tag)
            if tag == "a":
                self._link = {"label": "", "url": values.get("href", "")}
            elif tag == "img" and values.get("src"):
                self._section["media"].append(values["src"])

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._link is not None and self._section is not None:
            self._link["label"] = " ".join(self._link["label"].split())
            self._section["links"].append(self._link)
            self._link = None
        if self._section is not None and tag in self._tag_stack:
            self._tag_stack.pop()
        if tag == "section" and self._section is not None:
            self._section["text"] = _unique(self._section["text"])
            self._section["tokens"] = _unique(self._section["tokens"])
            self._section["media"] = _unique(self._section["media"])
            self._section["data_dependencies"] = _unique(self._section["data_dependencies"])
            self._section["interaction_requirements"] = _unique(self._section["interaction_requirements"])
            self.sections.append(self._section)
            self._section = None
            self._tag_stack.clear()

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if not text or self._section is None:
            return
        self._section["text"].append(text)
        if self._link is not None:
            self._link["label"] += f" {text}"


def _split(value: str) -> list[str]:
    return [part for part in value.replace(",", " ").split() if part]


def _unique(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


def extract_design_inventory(html: str) -> dict[str, Any]:
    """Extract an ordered, JSON-serializable inventory from inert HTML text."""
    parser = _InventoryParser()
    parser.feed(str(html))
    sections = parser.sections
    return {
        "sections": sections,
        "tokens": _unique([token for section in sections for token in section["tokens"]]),
        "media": _unique([media for section in sections for media in section["media"]]),
        "links": [link for section in sections for link in section["links"]],
        "data_dependencies": _unique([item for section in sections for item in section["data_dependencies"]]),
        "interaction_requirements": sorted({item for section in sections for item in section["interaction_requirements"]}),
    }


def map_capabilities(inventory: dict[str, Any]) -> dict[str, Any]:
    mappings: list[dict[str, Any]] = []
    unsupported: list[dict[str, str]] = []
    for section in inventory.get("sections", []):
        name = section.get("name", "")
        target = _SECTION_TARGETS.get(name)
        if target is None:
            mappings.append({"section": name, "kind": "unsupported", "target": None})
            continue
        mappings.append({"section": name, "kind": "known", "target": target})
        for interaction in section.get("interaction_requirements", []):
            if interaction not in _SUPPORTED_INTERACTIONS:
                unsupported.append({"section": name, "interaction": interaction})
    return {"mappings": mappings, "unsupported": unsupported, "blocked": bool(unsupported)}


def _block(section: dict[str, Any], target: str) -> dict[str, Any]:
    text = section.get("text", [])
    links = section.get("links", [])
    media = section.get("media", [])
    title = text[0] if text else ""
    link = links[0] if links else {"label": "", "url": ""}
    if target == "hero":
        slides = [] if not (text or media) else [{"id": "design-1", "eyebrow": "", "title": title, "discountValue": "", "body": " ".join(text[1:]), "ctaLabel": link["label"], "ctaUrl": link["url"], "imageUrl": media[0] if media else ""}]
        return {"blockType": target, "slides": slides, "promos": [], "badges": []}
    if target == "categoryGrid":
        return {"blockType": target, "eyebrow": "", "title": title, "limit": 12}
    if target == "productGrid":
        return {"blockType": target, "title": title, "eyebrow": "", "subtitle": "", "ctaLabel": link["label"], "ctaUrl": link["url"], "variant": "new-arrivals", "limit": 12}
    if target == "richText":
        return {"blockType": target, "content": {"paragraphs": text}}
    if target == "mediaWithText":
        return {"blockType": target, "title": title, "content": {"paragraphs": text[1:]}, "ctaLabel": link["label"], "ctaUrl": link["url"], "mediaType": "image", "imageUrl": media[0] if media else "", "videoUrl": "", "embedUrl": "", "autoplay": False, "mediaPosition": "right", "swapOnMobile": True}
    return {"blockType": target, "title": title, "subtitle": " ".join(text[1:]), "placeholder": "Enter your email", "bgImageUrl": media[0] if media else ""}


def compose_blocks(inventory: dict[str, Any], capabilities: dict[str, Any]) -> dict[str, Any]:
    if capabilities.get("blocked"):
        return {"valid": False, "blocks": [], "missing": [], "blocked": capabilities.get("unsupported", [])}
    blocks = []
    missing = []
    for section, mapping in zip(inventory.get("sections", []), capabilities.get("mappings", [])):
        target = mapping.get("target")
        if not target or mapping.get("kind") != "known":
            missing.append({"section": section.get("name", ""), "fields": ["supported block target"]})
            continue
        block = _block(section, target)
        spec = BLOCK_CAPABILITIES[target]
        absent = [field for field in spec["required"] if field not in block]
        absent.extend(field for field in spec.get("required_nonempty", []) if not block.get(field))
        if absent:
            missing.append({"section": section.get("name", ""), "fields": absent})
        blocks.append(block)
    return {"valid": not missing, "blocks": blocks, "missing": missing}


def verify_render(rendered_html: str, expected_inventory: dict[str, Any], required_markers: list[str] | None = None) -> dict[str, Any]:
    actual = extract_design_inventory(rendered_html)
    failures: list[str] = []
    expected_names = [section["name"] for section in expected_inventory.get("sections", [])]
    actual_names = [section["name"] for section in actual["sections"]]
    if actual_names != expected_names:
        failures.append("section_order")
    for marker in required_markers or []:
        if marker not in rendered_html:
            failures.append(f"missing_marker:{marker}")
    if "Vulpy Design Mockup" in rendered_html or "seed-placeholder" in rendered_html:
        failures.append("stale_template")
    return {"valid": not failures, "failures": failures, "section_order": actual_names}


def classify_handoff(status: str) -> str:
    if status not in HANDOFF_STATUSES:
        raise ValueError(f"unknown handoff status: {status}")
    return status


def design_block_pipeline(args: dict, **kwargs) -> str:
    """Typed plugin entry point; each action remains pure and local."""
    action = args.get("action", "inventory")
    html = str(args.get("html", ""))
    if action == "inventory":
        result = extract_design_inventory(html)
    elif action == "map":
        result = map_capabilities(args.get("inventory") or extract_design_inventory(html))
    elif action == "compose":
        inventory = args.get("inventory") or extract_design_inventory(html)
        result = compose_blocks(inventory, args.get("capabilities") or map_capabilities(inventory))
    elif action == "verify":
        result = verify_render(html, args.get("expected_inventory") or {})
    elif action == "classify":
        result = {"status": classify_handoff(str(args.get("status", "")))}
    else:
        result = {"error": "action must be inventory|map|compose|verify|classify"}
    return json.dumps(result, ensure_ascii=False, sort_keys=True)
