#!/usr/bin/env python3
"""Patch WebUI api/helpers.py: make CSP frame-ancestors configurable.

The WebUI's enforced CSP hardcodes `frame-ancestors 'none'`, which prevents
ANY site from embedding the WebUI in an iframe. The demo shell (vulpy.io /
vulpy-commerce-private.tail873f17.ts.net) embeds the Fox admin panel as one of
its surfaces, so the browser enforces 'none' and the iframe is refused.

This patch:
  1. Adds a validator + reader for HERMES_WEBUI_CSP_FRAME_ANCESTORS_EXTRA
     (same shape as the existing frame-src extra validator).
  2. Makes the shared CSP template use {frame_ancestors} instead of the
     hardcoded 'none'.
  3. Wires the env value into _build_csp_enforced_policy (and, transitively,
     the report-only policy) so operators can allow specific ancestors.

Safety: default remains 'none' when the env var is unset/empty/invalid.
Strict anchors; fails LOUDLY (exit 1) on drift or duplicate anchors; the
idempotency marker makes re-runs no-ops.

Usage:
  python3 patch-webui-csp-frame-ancestors.py /app/hermes-webui/api/helpers.py
"""

import re
import sys

IDEMPOTENCY_MARK = "vulpy-csp-frame-ancestors-extra; HERMES_WEBUI_CSP_FRAME_ANCESTORS_EXTRA"

# Same shape as _CSP_EXTRA_FRAME_RE
_ANCESTOR_RE = re.compile(
    r"^https?://(?:\*\.)?[A-Za-z0-9._~-]+(?::(?P<port>\d{1,5}|\*))?$"
)


def _valid_ancestor_source(source: str) -> bool:
    match = _ANCESTOR_RE.fullmatch(source)
    if not match:
        return False
    port = match.group("port")
    if not port or port == "*":
        return True
    try:
        return 1 <= int(port) <= 65535
    except ValueError:
        return False


def _count_region(src: str, needle: str) -> int:
    if IDEMPOTENCY_MARK in src:
        return 0
    return src.count(needle)


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: python3 {sys.argv[0]} /app/hermes-webui/api/helpers.py", file=sys.stderr)
        sys.exit(2)

    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print(f"already patched — CSP frame-ancestors configurable ({path})")
        return

    # ── Patch 1: template uses {frame_ancestors} ──
    anchor_template = '"frame-ancestors \'none\'; "'
    n = _count_region(src, anchor_template)
    if n != 1:
        print(
            f"ERROR: anchor {anchor_template!r} appears {n} times (expected 1)",
            file=sys.stderr,
        )
        sys.exit(1)
    src = src.replace(anchor_template, '"frame-ancestors {frame_ancestors}; "', 1)

    # ── Patch 2: add validator + reader after the frame-src validator ──
    anchor_reader = "def _valid_csp_extra_frame_source(source: str) -> bool:"
    n = _count_region(src, anchor_reader)
    if n != 1:
        print(
            f"ERROR: anchor {anchor_reader!r} appears {n} times (expected 1)",
            file=sys.stderr,
        )
        sys.exit(1)
    # Insert BEFORE the frame-src validator (gives the "extra" helpers a home
    # right next to the frame-src ones; anchors below it remain unchanged).
    insert_before = anchor_reader
    addition = (
        "# vulpy-csp-frame-ancestors-extra; who may embed the WebUI.\n"
        "# Same opt-in shape as HERMES_WEBUI_CSP_FRAME_EXTRA. Default 'none'.\n"
        f"IDEMPOTENCY_MARK = {IDEMPOTENCY_MARK!r}\n"
        "def _valid_csp_extra_ancestor_source(source: str) -> bool:\n"
        "    match = _CSP_EXTRA_FRAME_RE.fullmatch(source)\n"
        "    if not match:\n"
        "        return False\n"
        "    port = match.group(\"port\")\n"
        "    if not port or port == \"*\":\n"
        "        return True\n"
        "    try:\n"
        "        return 1 <= int(port) <= 65535\n"
        "    except ValueError:\n"
        "        return False\n"
        "\n"
        "\n"
        "def _csp_extra_ancestors() -> str:\n"
        "    raw = os.getenv(\"HERMES_WEBUI_CSP_FRAME_ANCESTORS_EXTRA\", \"\").strip()\n"
        "    if not raw:\n"
        "        return \"'none'\"\n"
        "    sources = raw.split()\n"
        "    if not sources or any(not _valid_csp_extra_ancestor_source(s) for s in sources):\n"
        "        logger.warning(\"Ignoring invalid HERMES_WEBUI_CSP_FRAME_ANCESTORS_EXTRA value\")\n"
        "        return \"'none'\"\n"
        "    return \" \".join(sources)\n"
        "\n"
        "\n"
    )
    src = src.replace(insert_before, addition + insert_before, 1)

    # ── Patch 3: _build_csp_enforced_policy formats frame_ancestors ──
    # NOTE: after Patch 2 the idempotency marker is present in src, so use a
    # plain count (not _count_region, which would short-circuit to 0).
    anchor_format = '        frame_src=_csp_frame_src(extra_frame_src),\n'
    n = src.count(anchor_format)
    if n != 1:
        print(
            f"ERROR: anchor {anchor_format!r} appears {n} times (expected 1)",
            file=sys.stderr,
        )
        sys.exit(1)
    src = src.replace(
        anchor_format,
        "        frame_src=_csp_frame_src(extra_frame_src),\n"
        "        frame_ancestors=_csp_extra_ancestors(),\n",
        1,
    )

    # Ensure the format call's target appears in the template format().
    # Template format is: ...format(connect_src=..., frame_src=...)
    # We appended frame_ancestors kwarg — the template already has the {frame_ancestors} placeholder.
    marker_expected = "'none'"
    if marker_expected not in src:
        print("ERROR: sanity check failed — expected a default 'none' still present", file=sys.stderr)
        sys.exit(1)

    # ── Patch 4: X-Frame-Options only when ancestors are 'none' ──
    anchor_xfo = "    handler.send_header('X-Frame-Options', 'DENY')\n"
    n = src.count(anchor_xfo)
    if n != 1:
        print(
            f"ERROR: anchor {anchor_xfo!r} appears {n} times (expected 1)",
            file=sys.stderr,
        )
        sys.exit(1)
    src = src.replace(
        anchor_xfo,
        "    # vulpy-csp-frame-ancestors-extra: XFO DENY would unilaterally\n"
        "    # block iframing even when CSP frame-ancestors allows it. Emit it\n"
        "    # only for the default lockdown (ancestors='none').\n"
        "    if _csp_extra_ancestors() == \"'none'\":\n"
        "        handler.send_header('X-Frame-Options', 'DENY')\n",
        1,
    )

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"patched: CSP frame-ancestors now configurable via env -> {path}")


if __name__ == "__main__":
    main()