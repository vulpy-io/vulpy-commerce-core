#!/usr/bin/env python3
"""Patch WebUI sidecar proxy: re-inject API-server Bearer auth into upstream calls.

Regression (2026-08-14): a parallel rewrite of the extension sidecar proxy
dropped the server-side Bearer injection that had been added earlier, so every
API-server call through the proxy (e.g. the assistant-ui pane's
/api/sessions/.../messages) arrived at the gateway unauthenticated → 401 and
the pane showed no messages. This patch restores it:

  1. extensions.py — resolve_extension_sidecar_proxy_target() returns an
     ``auth`` field when the sidecar origin is the Hermes API server, plus a
     new _api_server_bearer_for_origin() helper that resolves the gateway key
     the same way the gateway chat bridge does (so the key always matches the
     running gateway).

  2. routes.py — the sidecar proxy injects ``Authorization: Bearer <key>``
     into upstream headers when the resolved target carries ``auth``.

Rules (patch-approval.py pattern):
  - Fail LOUDLY (exit 1) when an anchor is absent or appears more than once
    (upgrade drift → caught at build time, never silently skipped).
  - Idempotent: safe to run repeatedly on an already-patched file.
  - Applies to FRESH hermes-webui files (same shape as the live ones used as
    reference on 2026-08-14).

Usage: python3 patch-webui-sidecar-proxy-auth.py /path/to/extensions.py /path/to/routes.py
"""

import sys

IDEMPOTENCY_MARK = "Sidecar proxy api-server auth injection"
# extensions.py injects a different comment than routes.py, so it needs its
# own idempotency mark matching the injected text exactly.
IDEMPOTENCY_MARK_EXTENSIONS = "Server-side auth injection for the Hermes OpenAI-compatible API server"


def _count(haystack: str, needle: str) -> int:
    return haystack.count(needle)


def _apply_extensions(path: str) -> None:
    with open(path) as f:
        src = f.read()

    if IDEMPOTENCY_MARK_EXTENSIONS in src:
        print("already patched — extensions.py auth injection present")
        return

    # --- Patch A: add the auth field to resolve_extension_sidecar_proxy_target ---
    anchor_a = '"upstream_url": upstream_url,\n    }'
    n = _count(src, anchor_a)
    if n != 1:
        print(
            f"ERROR: anchor for 'auth field' appears {n} times (expected 1):\\n"
            f"  anchor: {anchor_a!r}\\n"
            f"  File: {path}\\n"
            f"  hermes-webui extensions.py changed shape — update "
            f"extensions/hermes-webui/scripts/patch-webui-sidecar-proxy-auth.py",
            file=sys.stderr,
        )
        sys.exit(1)

    old_a = (
        "    return {\n"
        '        "extension_id": ext_id,\n'
        '        "origin": sidecar["origin"],\n'
        '        "proxy_path": proxy["path"],\n'
        '        "upstream_url": upstream_url,\n'
        "    }\n"
    )
    new_a = (
        "    result = {\n"
        '        "extension_id": ext_id,\n'
        '        "origin": sidecar["origin"],\n'
        '        "proxy_path": proxy["path"],\n'
        '        "upstream_url": upstream_url,\n'
        "    }\n"
        "    # Server-side auth injection for the Hermes OpenAI-compatible API server.\n"
        "    # The browser extension must never hold API_SERVER_KEY; when the sidecar\n"
        "    # origin is the API server, the WebUI forwards the Bearer token itself.\n"
        "    # (Regression: a parallel rewrite of this function dropped the auth field\n"
        "    # and every /api/sessions/\u2026 call through the proxy came back 401.)\n"
        '    _auth = _api_server_bearer_for_origin(sidecar["origin"])\n'
        "    if _auth:\n"
        '        result["auth"] = _auth\n'
        "    return result\n"
        "\n"
        "\n"
        "def _api_server_bearer_for_origin(origin: str) -> str:\n"
        '    """Return ``Bearer <key>`` when ``origin`` is the Hermes API server.\n'
        "\n"
        "    The browser extension must never hold API_SERVER_KEY; the WebUI forwards\n"
        "    the token server-side for the loopback API server origin. Reuses the same\n"
        "    env resolution as the gateway chat bridge so the key always matches the\n"
        "    running gateway.\n"
        '    """\n'
        "    try:\n"
        "        from api.gateway_chat import _gateway_api_key\n"
        "        key = _gateway_api_key()\n"
        "    except Exception:\n"
        '        key = str(os.environ.get("API_SERVER_KEY") or "").strip()\n'
        "    if not key:\n"
        '        return ""\n'
        '    origin_host = (str(origin or "").split("://")[-1].split("/")[0].split(":")[0]).lower()\n'
        '    if origin_host not in ("127.0.0.1", "localhost", "::1"):\n'
        '        return ""\n'
        '    return f"Bearer {key}"\n'
    )
    if old_a not in src:
        print(
            f"ERROR: old text for 'auth field' not found in {path}\n"
            f"  old starts with: {old_a[:80]!r}",
            file=sys.stderr,
        )
        sys.exit(1)
    src = src.replace(old_a, new_a, 1)
    print("  applied: extensions.py auth field + _api_server_bearer_for_origin helper")

    with open(path, "w") as f:
        f.write(src)
    print(f"patched: extensions.py -> {path}")


def _apply_routes(path: str) -> None:
    with open(path) as f:
        src = f.read()

    if IDEMPOTENCY_MARK in src:
        print("already patched — routes.py auth injection present")
        return

    # --- Patch B: inject Authorization from target['auth'] in the proxy path ---
    # Fresh upstream builds the Request with inline headers:
    #     headers=_extension_sidecar_proxy_request_headers(handler),
    # We split that into a variable so the auth injection can mutate it.
    anchor_b = "headers=_extension_sidecar_proxy_request_headers(handler),"
    n = _count(src, anchor_b)
    if n != 1:
        print(
            f"ERROR: anchor for 'routes.py auth injection' appears {n} times (expected 1):\n"
            f"  anchor: {anchor_b!r}\n"
            f"  File: {path}\n"
            f"  hermes-webui routes.py changed shape — update "
            f"extensions/hermes-webui/scripts/patch-webui-sidecar-proxy-auth.py",
            file=sys.stderr,
        )
        sys.exit(1)

    old_b = (
        "        request = Request(\n"
        "            target[\"upstream_url\"],\n"
        "            data=request_body,\n"
        "            headers=_extension_sidecar_proxy_request_headers(handler),\n"
        "            method=method,\n"
        "        )\n"
    )
    new_b = (
        "        upstream_headers = _extension_sidecar_proxy_request_headers(handler)\n"
        "        # Sidecar proxy api-server auth injection: the resolved target may\n"
        "        # carry an `auth` field (Bearer token for the Hermes API server)\n"
        "        # that the WebUI forwards server-side — the browser extension never\n"
        "        # holds API_SERVER_KEY. Without this every API-server call through\n"
        "        # the proxy arrives unauthenticated (401).\n"
        "        _auth_bearer = target.get(\"auth\")\n"
        "        if _auth_bearer:\n"
        '            upstream_headers["Authorization"] = _auth_bearer\n'
        "        request = Request(\n"
        "            target[\"upstream_url\"],\n"
        "            data=request_body,\n"
        "            headers=upstream_headers,\n"
        "            method=method,\n"
        "        )\n"
    )
    if old_b not in src:
        print(
            f"ERROR: old text for 'routes.py auth injection' not found in {path}\n"
            f"  old starts with: {old_b[:80]!r}",
            file=sys.stderr,
        )
        sys.exit(1)
    src = src.replace(old_b, new_b, 1)
    print("  applied: routes.py Bearer injection in sidecar proxy")

    with open(path, "w") as f:
        f.write(src)
    print(f"patched: routes.py -> {path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(
            f"Usage: python3 {sys.argv[0]} /path/to/extensions.py /path/to/routes.py",
            file=sys.stderr,
        )
        sys.exit(1)
    _apply_extensions(sys.argv[1])
    _apply_routes(sys.argv[2])
