#!/usr/bin/env python3
"""
Patch hermes-agent mem0_oss memory plugin to support a shared Qdrant SERVER
(host/port/url) instead of only the embedded on-disk store.

Why: the mem0_oss plugin hardcodes embedded Qdrant (``path`` + ``on_disk:
True``), which takes an EXCLUSIVE file lock on ``$HERMES_HOME/mem0_oss/qdrant``.
When both the Hermes gateway AND the WebUI server run in the same container
(the standard Vulpy topology), each loads the mem0_oss provider and they fight
over that single lock -> "Qdrant lock still held after N attempts — giving up",
so memory writes/reads intermittently fail.

Fix: when a Qdrant server endpoint is configured
(``MEM0_OSS_QDRANT_URL`` / ``MEM0_OSS_QDRANT_HOST``+``MEM0_OSS_QDRANT_PORT``,
or ``qdrant_url`` / ``qdrant_host``+``qdrant_port`` in ``$HERMES_HOME/mem0_oss.json``),
the plugin points mem0ai at the SERVER (shared over HTTP, no file lock)
instead of spinning up its own embedded instance. Backward compatible: when no
server is configured the plugin keeps the existing embedded behaviour.

Fail-loud: every anchor must match exactly once, else exit 1. Idempotent:
re-run prints "already patched", exit 0.

Usage: python3 patch-mem0-oss-qdrant-server.py /path/to/hermes-agent/plugins/memory/mem0_oss/__init__.py
"""

import sys

IDEMPOTENCY_MARK = "mem0_oss: qdrant server support (vulpy patch)"

# ── 1. Module docstring: advertise the server option ──────────────────────────
DOC_ANCHOR = """  MEM0_OSS_TOP_K               — max results returned per search (default: 10)
"""
DOC_REPLACEMENT = """  MEM0_OSS_TOP_K               — max results returned per search (default: 10)
  MEM0_OSS_QDRANT_URL          — Qdrant server URL (e.g. http://127.0.0.1:6333).
                                  When set, the plugin uses a shared Qdrant SERVER
                                  (no file lock) instead of the embedded on-disk
                                  store — required when gateway + WebUI share the
                                  same container (they otherwise fight over the
                                  embedded store's exclusive lock).
  MEM0_OSS_QDRANT_HOST         — Qdrant server host (alternative to URL; pairs with PORT).
  MEM0_OSS_QDRANT_PORT         — Qdrant server port (default 6333 when HOST is set).
  MEM0_OSS_QDRANT_API_KEY      — optional Qdrant API key for server auth.
# %s
""" % IDEMPOTENCY_MARK

# ── 2. Config dict: add server-mode keys (env-sourced) ────────────────────────
CFG_ANCHOR = """        "top_k": int(os.environ.get("MEM0_OSS_TOP_K", "10")),
        # Resolved credentials / endpoint
        "api_key": resolved_api_key,
"""
CFG_REPLACEMENT = """        "top_k": int(os.environ.get("MEM0_OSS_TOP_K", "10")),
        # Qdrant server mode (shared over HTTP, no file lock). When either a
        # URL or a host is configured, mem0 uses the running Qdrant server
        # instead of the embedded on-disk store — required when gateway + WebUI
        # share one container (embedded store's exclusive lock can't be shared).
        "qdrant_url": os.environ.get("MEM0_OSS_QDRANT_URL", "").strip(),
        "qdrant_host": os.environ.get("MEM0_OSS_QDRANT_HOST", "").strip(),
        "qdrant_port": os.environ.get("MEM0_OSS_QDRANT_PORT", "6333").strip(),
        "qdrant_api_key": os.environ.get("MEM0_OSS_QDRANT_API_KEY", "").strip(),
        # Resolved credentials / endpoint
        "api_key": resolved_api_key,
"""

# ── 3. vs_cfg: build a server config when a server endpoint is configured ─────
VS_ANCHOR = """    vs_cfg = {
        "collection_name": cfg["collection"],
        "path": cfg["vector_store_path"],
        "embedding_model_dims": embedder_dims,
        "on_disk": True,
    }
"""
VS_REPLACEMENT = """    # Qdrant server mode: when a URL or host is configured, point mem0 at the
    # shared Qdrant SERVER (HTTP, no exclusive file lock) so gateway + WebUI can
    # both use memory without lock contention. Falls back to the embedded
    # on-disk store when no server endpoint is configured (backward compatible).
    qdrant_url = (cfg.get("qdrant_url") or "").strip()
    qdrant_host = (cfg.get("qdrant_host") or "").strip()
    if qdrant_url or qdrant_host:
        vs_cfg = {
            "collection_name": cfg["collection"],
            "embedding_model_dims": embedder_dims,
        }
        if qdrant_url:
            vs_cfg["url"] = qdrant_url
        else:
            vs_cfg["host"] = qdrant_host
            try:
                vs_cfg["port"] = int(cfg.get("qdrant_port") or 6333)
            except (TypeError, ValueError):
                vs_cfg["port"] = 6333
        if cfg.get("qdrant_api_key"):
            vs_cfg["api_key"] = cfg["qdrant_api_key"]
            vs_cfg["https"] = qdrant_url.startswith("https://") if qdrant_url else False
    else:
        vs_cfg = {
            "collection_name": cfg["collection"],
            "path": cfg["vector_store_path"],
            "embedding_model_dims": embedder_dims,
            "on_disk": True,
        }
"""


def patch(path: str) -> int:
    with open(path, encoding="utf-8") as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print(f"Already patched ({IDEMPOTENCY_MARK} found in {path})")
        return 0

    replacements = [
        ("docstring", DOC_ANCHOR, DOC_REPLACEMENT),
        ("config-dict", CFG_ANCHOR, CFG_REPLACEMENT),
        ("vs_cfg", VS_ANCHOR, VS_REPLACEMENT),
    ]

    for label, anchor, repl in replacements:
        n = src.count(anchor)
        if n != 1:
            print(
                f"ERROR: anchor '{label}' appears {n} times (expected 1):\\n"
                f"  File: {path}\\n"
                "  hermes-agent mem0_oss changed shape -- update\\n"
                "  extensions/hermes-agent-patches/patch-mem0-oss-qdrant-server.py",
                file=sys.stderr,
            )
            return 1
        src = src.replace(anchor, repl, 1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"Patched mem0_oss qdrant server support: {path}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} /path/to/mem0_oss/__init__.py", file=sys.stderr)
        sys.exit(1)
    sys.exit(patch(sys.argv[1]))
