#!/usr/bin/env python3
"""Focused tests for patch-webui-csp-frame-ancestors.py.

Runs the patcher against a synthetic helpers.py snapshot and asserts:
  1. The patcher fails LOUDLY when an anchor is missing (upstream drift).
  2. After a clean apply, the template uses {frame_ancestors}, the env reader
     exists, the format call passes frame_ancestors, and X-Frame-Options is
     conditional.
  3. Re-running is a no-op (idempotency marker).
  4. Defaults stay 'none' when the env var is unset.
"""

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

PATCHER = Path(__file__).resolve().parent.parent / "scripts" / "patch-webui-csp-frame-ancestors.py"

# A minimal snapshot of the relevant regions of api/helpers.py.
SNAPSHOT = '''\
_CSP_HEADER_NAME = 'Content-Security-Policy'
_CSP_SHARED_POLICY_TEMPLATE = (
    "default-src 'self' https://*.cloudflareaccess.com; "
    "object-src 'none'; "
    "frame-ancestors 'none'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://static.cloudflareinsights.com blob:; "
    "worker-src blob: 'self' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
    "img-src 'self' data: https: blob:; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "media-src 'self' data: blob:; "
    "connect-src {connect_src}; "
    "frame-src {frame_src}; "
    "manifest-src 'self' https://*.cloudflareaccess.com; "
    "base-uri 'self'; form-action 'self'"
)
_CSP_FRAME_BASE = "'self'"
_CSP_EXTRA_FRAME_RE = __import__("re").compile(
    r"^https?://(?:\*\.)?[A-Za-z0-9._~-]+(?::(?P<port>\d{1,5}|\*))?$"
)


def _valid_csp_extra_frame_source(source: str) -> bool:
    return True


def _csp_extra_connect_src() -> str:
    return ""


def _csp_frame_src(extra_frame_src: str = "") -> str:
    return f"{_CSP_FRAME_BASE}{extra_frame_src}"


def _build_csp_enforced_policy(
    extra_connect_src: str | None = None,
    extra_frame_src: str | None = None,
) -> str:
    return _CSP_SHARED_POLICY_TEMPLATE.format(
        connect_src=_csp_extra_connect_src(),
        frame_src=_csp_frame_src(extra_frame_src),
    )


def _security_headers(handler):
    handler.send_header('X-Content-Type-Options', 'nosniff')
    handler.send_header('X-Frame-Options', 'DENY')
    handler.send_header('Referrer-Policy', 'same-origin')
    handler.send_header(_CSP_HEADER_NAME, _build_csp_enforced_policy(None, None))
'''

# Required names that must exist after patching (the snapshot uses them; the
# real module provides them).
PATCHED_SNAPSHOT_HEAD = '''\
import os
import logger
'''


class PatchCspFrameAncestorsTest(unittest.TestCase):
    def _write_snapshot(self, content: str) -> str:
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as f:
            f.write(content)
            return f.name

    def test_patcher_applies_cleanly(self):
        path = self._write_snapshot(SNAPSHOT)
        try:
            result = subprocess.run(
                [sys.executable, str(PATCHER), path],
                capture_output=True,
                text=True,
                env={**os.environ, "PATH": os.environ.get("PATH", "")},
            )
            self.assertEqual(
                result.returncode, 0, msg=f"patcher failed:\n{result.stdout}{result.stderr}"
            )
            patched = Path(path).read_text(encoding="utf-8")
            self.assertIn("frame-ancestors {frame_ancestors}", patched)
            self.assertIn("_csp_extra_ancestors", patched)
            self.assertIn("frame_ancestors=_csp_extra_ancestors()", patched)
            self.assertIn("if _csp_extra_ancestors() == \"'none'\":", patched)
            self.assertIn("HERMES_WEBUI_CSP_FRAME_ANCESTORS_EXTRA", patched)
        finally:
            os.unlink(path)

    def test_patcher_is_idempotent(self):
        path = self._write_snapshot(SNAPSHOT)
        try:
            r1 = subprocess.run(
                [sys.executable, str(PATCHER), path], capture_output=True, text=True
            )
            r2 = subprocess.run(
                [sys.executable, str(PATCHER), path], capture_output=True, text=True
            )
            self.assertEqual(r1.returncode, 0, msg=r1.stderr)
            self.assertEqual(r2.returncode, 0, msg=r2.stderr)
            self.assertIn("already patched", r2.stdout)
            # No double insertion of helper functions.
            self.assertEqual(Path(path).read_text(encoding="utf-8").count("def _csp_extra_ancestors"), 1)
        finally:
            os.unlink(path)

    def test_patcher_fails_loudly_on_drift(self):
        # Remove the template anchor -> patcher must exit non-zero.
        drifted = SNAPSHOT.replace("frame-ancestors 'none'; ", "frame-ancestors 'very-none'; ")
        path = self._write_snapshot(drifted)
        try:
            result = subprocess.run(
                [sys.executable, str(PATCHER), path], capture_output=True, text=True
            )
            self.assertNotEqual(result.returncode, 0, msg="patcher should have failed on drift")
            self.assertIn("ERROR", result.stderr)
        finally:
            os.unlink(path)

    def test_patched_module_keeps_none_default_and_can_widen(self):
        """Import the patched snapshot module; verify default and env behavior."""
        import importlib.util

        path = self._write_snapshot(SNAPSHOT)
        try:
            r = subprocess.run([sys.executable, str(PATCHER), path], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, msg=r.stderr)
            # Prepend imports so the module is importable in isolation.
            with open(path, encoding="utf-8") as f:
                body = f.read()
            with open(path, "w", encoding="utf-8") as f:
                f.write("import os\nimport logging\nlogger = logging.getLogger('test')\n" + body)

            spec = importlib.util.spec_from_file_location("patched_helpers", path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)

            # Default (env unset) -> 'none'
            for k in list(os.environ):
                if k.startswith("HERMES_WEBUI_CSP_FRAME"):
                    os.environ.pop(k)
            self.assertEqual(mod._csp_extra_ancestors(), "'none'")

            # With the env set -> widened value
            os.environ["HERMES_WEBUI_CSP_FRAME_ANCESTORS_EXTRA"] = "https://vulpy.io https://vulpy-commerce-private.tail873f17.ts.net:4327"
            self.assertEqual(
                mod._csp_extra_ancestors(),
                "https://vulpy.io https://vulpy-commerce-private.tail873f17.ts.net:4327",
            )
            policy = mod._build_csp_enforced_policy()
            self.assertIn("frame-ancestors https://vulpy.io", policy)
            self.assertNotIn("frame-ancestors 'none'", policy)

            # Invalid env -> falls back to 'none'
            os.environ["HERMES_WEBUI_CSP_FRAME_ANCESTORS_EXTRA"] = "not a url"
            self.assertEqual(mod._csp_extra_ancestors(), "'none'")
        finally:
            for k in list(os.environ):
                if k.startswith("HERMES_WEBUI_CSP_FRAME"):
                    os.environ.pop(k)
            os.unlink(path)


if __name__ == "__main__":
    unittest.main(verbosity=2)