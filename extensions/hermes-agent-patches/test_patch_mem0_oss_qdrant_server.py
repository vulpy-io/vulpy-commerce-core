"""Unit tests for extensions/hermes-agent-patches/patch-mem0-oss-qdrant-server.py.

Drives the patcher as a subprocess against a pristine fixture assembled from the
patcher's own anchor strings (mirrors the extensions/hermes-webui patcher tests):

  - fresh file -> server-mode config keys + vs_cfg branch applied, exit 0
  - re-run -> exit 0 "already patched", no double-apply
  - mutated config-dict anchor -> exit 1, fail-loud names the anchor
  - mutated vs_cfg anchor -> exit 1, fail-loud names the anchor
  - patched file py_compile (syntax intact)

The fixture is built deterministically so the test does not depend on the
baked /app/hermes-agent plugin (which may already contain the patch).
"""

import py_compile
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[0]
PATCHER = ROOT / "patch-mem0-oss-qdrant-server.py"


def _load_patcher_module():
    import importlib.util

    spec = importlib.util.spec_from_file_location("_mem0_oss_qdrant_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchMem0OssQdrantServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _fixture(self, temporary):
        """A pristine mem0_oss __init__.py built from the patcher's anchors."""
        root = Path(temporary.name)
        src = root / "__init__.py"

        src.write_text(
            '"""Mem0 OSS (self-hosted) memory plugin — MemoryProvider interface.\n'
            "\n"
            "LLM-powered fact extraction using mem0ai.\n"
            "\n"
            "Secondary config — environment variables:\n"
            + self.patcher.DOC_ANCHOR
            + '"""\n'
            "\n"
            "import os\n"
            "import json\n"
            "\n"
            "def _load_config():\n"
            "    resolved_api_key = \"\"\n"
            "    resolved_base_url = \"\"\n"
            "    default_emb_provider = \"openai\"\n"
            "    embedder_dims = 1536\n"
            "    config = {\n"
            '        "vector_store_path": "/x",\n'
            '        "history_db_path": "/x/h.db",\n'
            '        "collection": "hermes",\n'
            '        "user_id": "hermes-user",\n'
            '        "llm_provider": "openai",\n'
            '        "llm_model": "gpt-4o-mini",\n'
            '        "embedder_provider": "openai",\n'
            '        "embedder_model": "text-embedding-3-small",\n'
            + self.patcher.CFG_ANCHOR
            + "    }\n"
            "    return config\n"
            "\n"
            "def _build_mem0_config(cfg):\n"
            "    embedder_dims = 1536\n"
            + self.patcher.VS_ANCHOR
            + "    return {\"vector_store\": {\"provider\": \"qdrant\", \"config\": vs_cfg}}\n",
            encoding="utf-8",
        )
        return src

    def _run(self, src):
        return subprocess.run(
            [sys.executable, str(PATCHER), str(src)],
            capture_output=True,
            text=True,
        )

    def test_fresh_file_patches_server_mode(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        src = self._fixture(temporary)

        result = self._run(src)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

        text = src.read_text(encoding="utf-8")
        self.assertIn("qdrant_url", text)
        self.assertIn("qdrant_host", text)
        self.assertIn("qdrant_port", text)
        self.assertIn("qdrant_api_key", text)
        self.assertIn("MEM0_OSS_QDRANT_URL", text)
        self.assertIn('vs_cfg["url"] = qdrant_url', text)
        self.assertIn("on_disk", text)  # embedded fallback kept
        self.assertIn(self.patcher.IDEMPOTENCY_MARK, text)
        py_compile.compile(str(src), doraise=True)

    def test_rerun_is_idempotent(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        src = self._fixture(temporary)

        first = self._run(src)
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        text_first = src.read_text(encoding="utf-8")

        second = self._run(src)
        self.assertEqual(second.returncode, 0, second.stderr + second.stdout)
        self.assertIn("Already patched", second.stdout)
        self.assertEqual(src.read_text(encoding="utf-8"), text_first)

    def test_mutated_config_anchor_fails_loudly(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        src = self._fixture(temporary)
        src.write_text(
            src.read_text(encoding="utf-8").replace(
                '        "top_k": int(os.environ.get("MEM0_OSS_TOP_K", "10")),',
                '        "top_k": int(os.environ.get("MEM0_OSS_TOP_K", "50")),',
            ),
            encoding="utf-8",
        )
        result = self._run(src)
        self.assertEqual(result.returncode, 1)
        self.assertIn("config-dict", result.stderr)

    def test_mutated_vs_cfg_anchor_fails_loudly(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        src = self._fixture(temporary)
        src.write_text(
            src.read_text(encoding="utf-8").replace(
                '"path": cfg["vector_store_path"],\n',
                '"path": cfg["vector_store_path_renamed"],\n',
            ),
            encoding="utf-8",
        )
        result = self._run(src)
        self.assertEqual(result.returncode, 1)
        self.assertIn("vs_cfg", result.stderr)


if __name__ == "__main__":
    unittest.main()
