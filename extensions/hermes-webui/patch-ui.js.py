#!/usr/bin/env python3
"""
Patch hermes-webui/static/ui.js at image build time.

ui.js:
  Inserts installHermesTranscriptStore() immediately after the INFLIGHT
  declaration so the transcript store has access to both S and INFLIGHT at
  the earliest safe point.  The old _hermesRendererActive yield guard is
  removed if present.

  Idempotent: skips ui.js patch if installHermesTranscriptStore is already
  present.  Fails with exit 1 if the INFLIGHT anchor is not found (catches
  upstream renames).

Usage:
  python3 patch-ui.js.py <ui.js path>
"""
import sys
from pathlib import Path

if len(sys.argv) != 2:
    print(f"Usage: {sys.argv[0]} <ui.js>", file=sys.stderr)
    sys.exit(1)

ui_path = Path(sys.argv[1])

# ---------------------------------------------------------------------------
# 1. Patch ui.js
# ---------------------------------------------------------------------------
INFLIGHT_ANCHOR = "const INFLIGHT={};  // keyed by session_id while request in-flight"
OLD_GUARD = "_hermesRendererActive"
SEAM_MARKER = "installHermesTranscriptStore"

ui_text = ui_path.read_text(encoding="utf-8")

if SEAM_MARKER in ui_text:
    print(f"patch-ui.js.py: seam already present in {ui_path}, skipping ui.js patch")
else:
    if INFLIGHT_ANCHOR not in ui_text:
        print(
            f"patch-ui.js.py: ERROR — INFLIGHT anchor not found in {ui_path}",
            file=sys.stderr,
        )
        print(f"  Expected: {INFLIGHT_ANCHOR!r}", file=sys.stderr)
        sys.exit(1)

    store_code = (Path(__file__).parent / "host-transcript-store.js").read_text(
        encoding="utf-8"
    )

    # Remove old yield-guard if present (replaced by the store approach)
    if OLD_GUARD in ui_text:
        import re
        ui_text = re.sub(
            r"\s*// Vulpy: yield to external renderer when it owns the DOM\.\n"
            r"\s*var _riInner=document\.getElementById\('msgInner'\);\n"
            r"\s*if\(_riInner&&_riInner\._hermesRendererActive\) return;\n",
            "\n",
            ui_text,
        )

    ui_text = ui_text.replace(
        INFLIGHT_ANCHOR,
        INFLIGHT_ANCHOR + "\n" + store_code,
        1,
    )
    ui_path.write_text(ui_text, encoding="utf-8")
    print(f"patch-ui.js.py: injected {SEAM_MARKER} into {ui_path}")

# ---------------------------------------------------------------------------
# 1b. Patch ui.js — pane-only renderMessages guard.
# The assistant-ui pane owns the transcript DOM (window.__hermesAuiPaneOnly is
# set by the bundle at mount). Without this guard the host still runs the full
# O(N) renderMessages() rebuild on every session switch — the slow/crash path
# that pane-only mode exists to kill. This was previously a live-applied patch
# (never durable) so every rebuild silently lost it: switching stayed slow and
# the host transcript rendered under the pane. Idempotent via marker, fail-loud
# if the renderMessages anchor disappears upstream.
# ---------------------------------------------------------------------------
RENDERMESSAGES_ANCHOR = "function renderMessages(options){"
RENDER_GUARD_MARKER = "// vulpy: pane-only renderMessages guard"
RENDER_GUARD = (
    "function renderMessages(options){\n"
    "  // vulpy: pane-only renderMessages guard — the assistant-ui pane owns the\n"
    "  // transcript; skip the host's full DOM rebuild (O(N) scans, markdown,\n"
    "  // scroll snapshot/restore). Host state (S.messages) stays updated; only\n"
    "  // the DOM rebuild is skipped.\n"
    "  if(typeof window!=='undefined' && window.__hermesAuiPaneOnly === true){ return; }\n"
)

if RENDER_GUARD_MARKER in ui_text:
    print("patch-ui.js.py: renderMessages guard already present, skipping")
else:
    if ui_text.count(RENDERMESSAGES_ANCHOR) != 1:
        print(
            f"patch-ui.js.py: ERROR — renderMessages anchor appears "
            f"{ui_text.count(RENDERMESSAGES_ANCHOR)}x (expected 1) in {ui_path}",
            file=sys.stderr,
        )
        sys.exit(1)
    ui_text = ui_text.replace(RENDERMESSAGES_ANCHOR, RENDER_GUARD, 1)
    ui_path.write_text(ui_text, encoding="utf-8")
    print("patch-ui.js.py: injected pane-only renderMessages guard")
