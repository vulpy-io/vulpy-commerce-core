#!/usr/bin/env python3
"""
Patch hermes-webui static/panels.js: remove the Show/Hide API-key toggle
from the Vulpy Cloud provider card in Settings → Providers.

Why: the toggle is non-functional for Vulpy (revealing an already-rotated
VULPY_API_KEY adds no value and risks visual key exposure), and the operator
explicitly asked to remove it. Scope is deliberately VULPY-ONLY: the
configurable-provider branch in ``_buildProviderCard(p)`` is shared by every
API-key provider (OpenRouter, ...), so the removal is implemented as a
``p.id !== 'vulpy'`` guard around the toggle creation and its row-append.
Every other provider keeps its working Show/Hide toggle; Vulpy simply never
builds or appends it.

The API key input itself is untouched: it stays ``type='password'`` with
``autocomplete='off'`` and is masked at all times (with the toggle gone there
is no UI path that reveals the key value). Save still submits the entered key
through POST /api/providers via ``_saveProviderKey(p.id)``; Remove
(``_removeProviderKey``) and Refresh models (``_refreshProviderModels``) are
untouched. No key logging, no persistence changes.

Rules (patch-webui-vulpy-provider-settings.py / patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once.
  - Idempotent: re-run prints "already patched", exit 0.
  - Applies to FRESH static/panels.js.

Verified against the pinned base image tree (2026-08-30): the block at
panels.js ~L11245 sits in the ``if(p.configurable){ ... }`` branch of
``_buildProviderCard``, between the API-key input creation and the save /
remove buttons. Anchors below are byte-exact copies of that upstream region.

Usage: python3 patch-webui-vulpy-remove-show.py /path/to/static/panels.js
"""

import sys

IDEMPOTENCY_MARK = "vulpy-webui-remove-show"

# The Show/Hide toggle creation block, byte-exact from the upstream
# configurable-provider branch of _buildProviderCard.
TOGGLE_OLD = """    const toggleBtn=document.createElement('button');
    toggleBtn.type='button';
    toggleBtn.className='provider-card-btn provider-card-btn-ghost';
    toggleBtn.textContent='Show';
    toggleBtn.onclick=()=>{
      const revealed=input.type==='text';
      input.type=revealed?'password':'text';
      toggleBtn.textContent=revealed?'Show':'Hide';
    };"""

# Wrap the toggle creation in a Vulpy-only guard. The body is byte-identical
# to upstream, so the toggle's Show/Hide behavior is preserved for every
# provider EXCEPT vulpy — which never reaches this block. toggleBtn is
# hoisted (let) so the guarded row-append below stays in scope.
TOGGLE_NEW = """    // vulpy-webui-remove-show: the Show/Hide API-key reveal toggle is
    // removed for the Vulpy Cloud provider card only (non-functional there
    // and the key must stay masked). Other configurable providers keep their
    // working toggle via this guard. toggleBtn is hoisted (let) so the row
    // append below stays in scope for non-Vulpy providers.
    let toggleBtn=null;
    if(p.id!=='vulpy'){
      toggleBtn=document.createElement('button');
      toggleBtn.type='button';
      toggleBtn.className='provider-card-btn provider-card-btn-ghost';
      toggleBtn.textContent='Show';
      toggleBtn.onclick=()=>{
        const revealed=input.type==='text';
        input.type=revealed?'password':'text';
        toggleBtn.textContent=revealed?'Show':'Hide';
      };
    }"""

# The row-append of the toggle. Because the guarded toggleBtn is now
# block-scoped, the append must be guarded too — an unguarded
# ``row.appendChild(toggleBtn)`` would ReferenceError for vulpy.
APPEND_OLD = "    row.appendChild(input);\n    row.appendChild(toggleBtn);"

APPEND_NEW = """    row.appendChild(input);
    if(toggleBtn) row.appendChild(toggleBtn);"""


def _count(src: str, needle: str) -> int:
    return src.count(needle)


def _fail(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(1)


def _check_anchor(src: str, label: str, anchor: str, path: str) -> None:
    n = _count(src, anchor)
    if n == 0:
        _fail(
            "ERROR: anchor not found for %s:\n"
            "  anchor: %r\n"
            "  File: %s\n"
            "  Hermes changed shape -- update "
            "extensions/hermes-webui/scripts/patch-webui-vulpy-remove-show.py (anchor drift)"
            % (label, anchor[:120], path)
        )
    if n > 1:
        _fail(
            "ERROR: anchor appears %d times (expected 1) for %s:\n"
            "  File: %s\n"
            "  Cannot apply patch safely -- update the patch script."
            % (n, label, path)
        )


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} /path/to/static/panels.js", file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print(f"already patched -- Vulpy Show toggle removed ({path})")
        return

    # Fail-loud anchor validation BEFORE any mutation.
    _check_anchor(src, "toggle creation block", TOGGLE_OLD, path)
    _check_anchor(src, "toggle row-append", APPEND_OLD, path)

    src = src.replace(TOGGLE_OLD, TOGGLE_NEW, 1)
    src = src.replace(APPEND_OLD, APPEND_NEW, 1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)

    print(f"patched: Vulpy Show/Hide toggle removed from provider card ({path})")


if __name__ == "__main__":
    main()
