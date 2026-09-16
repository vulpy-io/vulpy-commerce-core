"""Unit tests for scripts/patch-webui-sidecar-proxy-max-response.py.

Pattern mirrors tests/test_patch_sidecar_proxy_sse_stream.py: drive the
patcher as a subprocess against a throwaway routes.py fixture built from the
patcher's OWN OLD string, then assert markers/exit codes/behavior.

  - fresh file -> env-aware cap injected (8 MiB default), exit 0
  - re-run on patched file -> exit 0 "already patched", no double-apply
  - mutated anchor -> exit 1, fail-loud names the anchor
  - patched result py_compiles (syntax intact)
  - default cap is 8 MiB when HERMES_WEBUI_SIDECAR_MAX_RESPONSE_BYTES is unset
  - env override is honored
  - garbage env value falls back to the default
"""

import importlib.util
import os
import py_compile
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "patch-webui-sidecar-proxy-max-response.py"

PROBE = (
    "import runpy; m = runpy.run_path('routes.py'); "
    "print(m['_EXTENSION_SIDECAR_PROXY_MAX_RESPONSE_BYTES'])"
)


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("_max_resp_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchWebuiSidecarProxyMaxResponseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        routes = Path(temporary.name) / "routes.py"
        routes.write_text(
            "import os\n\n\n"
            + self.patcher.ANCHOR
            + "\n\n\n"
            + "def _read_extension_sidecar_proxy_body(stream) -> bytes:\n"
            + "    body = stream.read(_EXTENSION_SIDECAR_PROXY_MAX_RESPONSE_BYTES + 1)\n"
            + "    if len(body) > _EXTENSION_SIDECAR_PROXY_MAX_RESPONSE_BYTES:\n"
            + '        raise ValueError("Extension sidecar response too large")\n'
            + "    return body\n",
            encoding="utf-8",
        )
        return temporary, routes

    def _run(self, routes):
        return subprocess.run(
            ["python3", str(PATCHER), str(routes)],
            capture_output=True,
            text=True,
        )

    def _probe_value(self, routes, env_override=None):
        env = dict(os.environ)
        if env_override is not None:
            env["HERMES_WEBUI_SIDECAR_MAX_RESPONSE_BYTES"] = env_override
        return subprocess.run(
            [sys.executable, "-c", PROBE],
            capture_output=True,
            text=True,
            cwd=str(routes.parent),
            env=env,
        )

    def test_fresh_file_injects_env_aware_cap(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)

        result = self._run(routes)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = routes.read_text(encoding="utf-8")
        self.assertEqual(text.count(self.patcher.IDEMPOTENCY_MARK), 1)
        self.assertIn(
            "_EXTENSION_SIDECAR_PROXY_MAX_RESPONSE_BYTES = 8 * 1024 * 1024", text
        )
        self.assertIn("HERMES_WEBUI_SIDECAR_MAX_RESPONSE_BYTES", text)
        # The cap variable name must survive so the reader keeps using it.
        self.assertIn(
            "stream.read(_EXTENSION_SIDECAR_PROXY_MAX_RESPONSE_BYTES + 1)", text
        )

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

    def test_mutated_anchor_fails_loudly(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)
        routes.write_text(
            routes.read_text(encoding="utf-8").replace(
                "= 512 * 1024", "= 512 * 1025"
            ),
            encoding="utf-8",
        )
        result = self._run(routes)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("expected 1", result.stderr)

    def test_patched_result_compiles(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)

        result = self._run(routes)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        py_compile.compile(str(routes), doraise=True)

    def test_default_cap_is_8_mib(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)
        self.assertEqual(self._run(routes).returncode, 0)

        probe = self._probe_value(routes)
        self.assertEqual(probe.returncode, 0, probe.stderr)
        self.assertEqual(probe.stdout.strip(), str(8 * 1024 * 1024))

    def test_env_override_is_honored(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)
        self.assertEqual(self._run(routes).returncode, 0)

        probe = self._probe_value(routes, env_override="1048576")
        self.assertEqual(probe.returncode, 0, probe.stderr)
        self.assertEqual(probe.stdout.strip(), "1048576")

    def test_garbage_env_falls_back_to_default(self):
        temporary, routes = self.fixture()
        self.addCleanup(temporary.cleanup)
        self.assertEqual(self._run(routes).returncode, 0)

        probe = self._probe_value(routes, env_override="not-a-number")
        self.assertEqual(probe.returncode, 0, probe.stderr)
        self.assertEqual(probe.stdout.strip(), str(8 * 1024 * 1024))


if __name__ == "__main__":
    unittest.main()
