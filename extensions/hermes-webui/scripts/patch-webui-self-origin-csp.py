#!/usr/bin/env python3
"""patch-webui-self-origin-csp.py

CSP: auto-allow the WebUI's own serving origin AND its derived sibling
origins in connect-src / frame-src.

Problem
-------
The side-panel derives Storefront / Medusa / Payload iframe tabs from the
page origin (loopback, Tailscale, admin.<domain>, or an sslip.io public edge
hostname). But the CSP the WebUI sends is a static base
('self' + localhost/127.0.0.1 variants) plus opt-in env extras. The derived
iframe targets are often SIBLING hostnames, not the page's own origin:

  - sslip.io edge: page on admin-dev-<rand>.<ip>.sslip.io, tabs on
    dev-<rand>.<ip>.sslip.io (shop) and api-dev-<rand>.<ip>.sslip.io (api).
  - admin.<domain> edge: page on admin.<domain>, tabs on <domain> + api.<domain>.
  - Tailscale: same hostname, different ports (shop/api ports).

'frame-src self' only covers the exact page origin, so the browser blocks
framing the sibling tabs:
   "Framing 'https://api-dev-...sslip.io/' violates ... frame-src 'self'
    https://admin-dev-...sslip.io"

Fix
---
In _security_headers(handler), derive the request's own origin from the
Host header (scheme from X-Forwarded-Proto) and ALSO derive the sibling
origins the side panel would emit for that hostname family, appending them
to both connect-src and frame-src. Mirrors deriveEnvTabs() in
vulpy-commerce-side-panel/index.js so the CSP matches exactly what the
panel can build. The env opt-ins (HERMES_WEBUI_CSP_FRAME_EXTRA /
CONNECT_EXTRA) still work on top.

Injection target (upstream api/helpers.py, never rebuilt):
  Anchor: ``def _security_headers(handler):``
  Insert after the extra_connect_src/extra_frame_src extraction, before
  the header write. Uses _re (already imported in helpers.py).

Idempotent: re-applying replaces the inserted block (guarded by marker).
"""

import sys

TARGET = "/app/hermes-webui/api/helpers.py"

OLD = '''def _security_headers(handler):
    """Add security headers to every response."""
    extra_connect_src = _csp_extra_connect_src()
    extra_frame_src = _csp_extra_frame_src()
    handler._csp_extra_connect_src = extra_connect_src
    handler._csp_extra_frame_src = extra_frame_src
    handler.send_header('X-Content-Type-Options', 'nosniff')'''

NEW = '''def _security_headers(handler):
    """Add security headers to every response."""
    extra_connect_src = _csp_extra_connect_src()
    extra_frame_src = _csp_extra_frame_src()
    # VULPY PATCH MARK: vulpy-self-origin-csp — allow the WebUI's own serving
    # origin AND the sibling origins the side panel derives (mirrors
    # deriveEnvTabs in vulpy-commerce-side-panel/index.js) so public-edge and
    # tailscale iframe tabs are not blocked by connect-src/frame-src.
    _host = (handler.headers.get("Host") or "").strip().lower()
    _proto = (handler.headers.get("X-Forwarded-Proto") or "http").strip().lower()
    _host_no_port = _host
    if ":" in _host and not _host.endswith("]") and _host.count(":") == 1:
        _host_no_port = _host.split(":", 1)[0]
    _origins = []
    if _host_no_port:
        if _host_no_port.endswith(".sslip.io"):
            _core = _re.sub(r"^(admin-|api-|dev-)+", "", _host_no_port)
            if _core != _host_no_port:
                _origins = [f"{_proto}://dev-{_core}", f"{_proto}://api-dev-{_core}"]
            else:
                _origins = [f"{_proto}://{_host_no_port}"]
        elif _host_no_port.startswith("admin."):
            _base = _host_no_port[len("admin."):]
            _origins = [f"{_proto}://{_base}", f"{_proto}://api.{_base}"]
        elif _host_no_port.endswith(".ts.net"):
            _origins = [f"{_proto}://{_host_no_port}:*"]
        _origins.append(f"{_proto}://{_host_no_port}")
    if _origins:
        _extra = " " + " ".join(_origins)
        extra_connect_src = f"{extra_connect_src}{_extra}"
        extra_frame_src = f"{extra_frame_src}{_extra}"
    # END VULPY PATCH MARK: vulpy-self-origin-csp
    handler._csp_extra_connect_src = extra_connect_src
    handler._csp_extra_frame_src = extra_frame_src
    handler.send_header('X-Content-Type-Options', 'nosniff')'''


def apply_patch() -> int:
    src = open(TARGET, encoding="utf-8").read()

    if "vulpy-self-origin-csp" in src:
        # Re-install: strip the old marker block and re-apply (idempotent upgrade).
        import re
        src = re.sub(
            r"    # VULPY PATCH MARK: vulpy-self-origin-csp.*?# END VULPY PATCH MARK: vulpy-self-origin-csp\n",
            "",
            src,
            flags=re.S,
        )
        open(TARGET, "w", encoding="utf-8").write(src)
        src = open(TARGET, encoding="utf-8").read()

    if OLD not in src:
        print(f"{TARGET}: anchor not found", file=sys.stderr)
        return 2
    src = src.replace(OLD, NEW, 1)

    open(TARGET, "w", encoding="utf-8").write(src)

    if "vulpy-self-origin-csp" not in src or "dev-{_core}" not in src:
        print(f"{TARGET}: post-write verification failed", file=sys.stderr)
        return 2
    print(f"{TARGET}: patched self-origin + sibling CSP (connect-src + frame-src)")
    return 0


if __name__ == "__main__":
    sys.exit(apply_patch())