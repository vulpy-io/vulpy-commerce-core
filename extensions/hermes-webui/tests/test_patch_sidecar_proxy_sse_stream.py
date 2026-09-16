"""Unit tests for scripts/patch-webui-sidecar-proxy-sse-stream.py (issue #142).

Pattern mirrors tests/test_patch_webui_global_approval_banner.py: drive the
patcher as a subprocess against a throwaway routes.py fixture built from the
patcher's OWN OLD strings, then assert markers/exit codes/behavior.

  - fresh file -> SSE gate + streaming helper injected, exit 0
  - re-run on patched file -> exit 0 "already patched", no double-apply
  - mutated proxy anchor -> exit 1, fail-loud names the anchor
  - mutated helper anchor -> exit 1, fail-loud names the anchor
  - patched result py_compiles (syntax intact)
  - non-SSE responses still take the buffered path (gate correctness)
"""

import importlib.util
import py_compile
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-sidecar-proxy-sse-stream.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_sse_stream_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiSidecarProxySseStreamTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        routes = Path(temporary.name) / "routes.py"
        # Keep OLD_PROXY byte-identical (8-space `with` line, 12-space body):
        # wrap it in a def + `if True:` so the indentation is valid Python.
        routes.write_text(
            "def _proxy(handler):\n"
            "    if True:\n"
            + self.patcher.OLD_PROXY + "\n"
            "                handler,\n"
            '                getattr(response, "status", 200),\n'
            "                body,\n"
            "                response.headers,\n"
            "            )\n"
            "    return True\n"
            "\n\n"
            + self.patcher.OLD_HELPER + "\n"
            "    return b''\n",
            encoding="utf-8",
        )
        return temporary, routes

    def _run(self, routes):
        return subprocess.run(
            ["python3", str(PATCHER), str(routes)],
            capture_output=True,
            text=True,
        )

    def test_fresh_file_restores_streaming_path(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)

        result = self._run(routes)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = routes.read_text(encoding="utf-8")
        self.assertEqual(text.count(self.patcher.MARK), 1)
        # The gate routes text/event-stream to the streaming helper...
        self.assertIn('content_type.startswith("text/event-stream")', text)
        self.assertIn("return _stream_extension_sidecar_proxy_sse(", text)
        # ...and the helper itself carries the required mechanics.
        self.assertIn("def _stream_extension_sidecar_proxy_sse(", text)
        self.assertIn("handler.close_connection = True", text)
        self.assertIn("end_sse_headers(handler)", text)
        self.assertIn("except _socket.timeout:", text)

    def test_rerun_is_idempotent(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)

        first = self._run(routes)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        first_text = routes.read_text(encoding="utf-8")

        second = self._run(routes)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("already patched", second.stdout)
        self.assertEqual(routes.read_text(encoding="utf-8"), first_text)

    def test_mutated_proxy_anchor_fails_loudly(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)
        routes.write_text(
            routes.read_text(encoding="utf-8").replace(
                "with opener.open(request, timeout=10) as response:",
                "with opener.open(request, timeout=11) as response:",
            ),
            encoding="utf-8",
        )
        result = self._run(routes)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("sidecar proxy SSE gate", result.stderr)
        self.assertIn("appears 0 times", result.stderr)

    def test_mutated_helper_anchor_fails_loudly(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)
        routes.write_text(
            routes.read_text(encoding="utf-8").replace(
                "def _read_extension_sidecar_proxy_body(stream) -> bytes:",
                "def _read_extension_sidecar_proxy_body(stream, _legacy) -> bytes:",
            ),
            encoding="utf-8",
        )
        result = self._run(routes)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("streaming helper", result.stderr)
        self.assertIn("appears 0 times", result.stderr)

    def test_patched_result_compiles(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)

        result = self._run(routes)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        py_compile.compile(str(routes), doraise=True)

    def test_non_sse_still_takes_buffered_path(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)

        result = self._run(routes)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = routes.read_text(encoding="utf-8")
        # The buffered read must still be reachable AFTER the SSE gate, in the
        # same function — an unconditional buffered read would bypass the gate.
        i_gate = text.index('content_type.startswith("text/event-stream")')
        i_buffered = text.index("body = _read_extension_sidecar_proxy_body(response)")
        self.assertLess(i_gate, i_buffered)
        # And the gate's else path keeps the exact upstream response headers
        # plumbing that the buffered path already had.
        self.assertIn("_send_extension_sidecar_proxy_response(", text)


if __name__ == "__main__":
    unittest.main()
