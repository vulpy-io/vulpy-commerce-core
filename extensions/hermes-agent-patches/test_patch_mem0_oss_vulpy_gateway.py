"""Tests for the durable mem0_oss Vulpy patch.

The fixture is assembled from the patcher's anchors, so tests exercise the
source that the Docker build will actually generate without depending on an
image-baked Hermes checkout.
"""

import importlib.util
import json
import py_compile
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PATCHER = ROOT / "patch-mem0-oss-vulpy-gateway.py"


def _load_patcher_module():
    spec = importlib.util.spec_from_file_location("mem0_vulpy_patcher", PATCHER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeMemory:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def add(self, **kwargs):
        self.calls.append(kwargs)
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return response


def _load_fixture(path):
    tool_registry = types.ModuleType("tools.registry")
    tool_registry.tool_error = lambda message: json.dumps({"error": message})
    sys.modules["tools"] = types.ModuleType("tools")
    sys.modules["tools.registry"] = tool_registry

    spec = importlib.util.spec_from_file_location("patched_mem0_oss", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PatchMem0OssVulpyGatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patcher = _load_patcher_module()

    def _fixture(self, temporary):
        root = Path(temporary.name)
        src = root / "__init__.py"
        src.write_text(
            '"""Mem0 OSS provider: "auto", "openai", "custom"."""\n'
            "\n"
            "import json\n"
            "import logging\n"
            "import threading\n"
            "from typing import Any, Dict, List\n"
            "from tools.registry import tool_error\n"
            "\n"
            + self.patcher.HELPER_ANCHOR
            + "\n"
            "class Mem0OSSMemoryProvider:\n"
            "    def __init__(self):\n"
            "        self._user_id = \"hermes-user\"\n"
            "        self._lock = threading.Lock()\n"
            "        self._fail_count = 0\n"
            "\n"
            "    def _record_success(self):\n"
            "        self._fail_count = 0\n"
            "\n"
            "    def _record_failure(self):\n"
            "        self._fail_count += 1\n"
            "\n"
            "    def _get_memory(self):\n"
            "        raise NotImplementedError\n"
            "\n"
            "    def _do_sync(self, messages):\n"
            "        try:\n"
            "            mem = self._get_memory()\n"
            + self.patcher.SYNC_ANCHOR[len("            mem = self._get_memory()\n") :]
            + "        except Exception:\n"
            + "            self._record_failure()\n"
            + "\n"
            + "    def _handle_add(self, args):\n"
            "        content = args.get(\"content\", \"\").strip()\n"
            "        try:\n"
            "            mem = self._get_memory()\n"
            + self.patcher.ADD_ANCHOR[len("            mem = self._get_memory()\n") :]
            + "        except Exception as exc:\n"
            + "            self._record_failure()\n"
            + "            return tool_error(str(exc))\n"
            + "\n",
            encoding="utf-8",
        )
        return src

    def _run(self, src):
        return subprocess.run(
            [sys.executable, str(PATCHER), str(src)],
            capture_output=True,
            text=True,
        )

    def _patched_module(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        src = self._fixture(temporary)
        src.write_text(
            self.patcher.apply_behavioral_patches(src.read_text(encoding="utf-8")),
            encoding="utf-8",
        )
        py_compile.compile(str(src), doraise=True)
        return _load_fixture(src)

    def test_sync_turn_falls_back_to_direct_write_when_extraction_is_empty(self):
        module = self._patched_module()
        provider = module.Mem0OSSMemoryProvider()
        memory = FakeMemory([[], [{"memory": "likes foxes"}]])
        provider._get_memory = lambda: memory

        provider._do_sync([{"role": "user", "content": "I like foxes"}])

        self.assertEqual([call["infer"] for call in memory.calls], [True, False])
        self.assertEqual(provider._fail_count, 0)

    def test_explicit_add_only_reports_success_after_direct_write_persists(self):
        module = self._patched_module()
        provider = module.Mem0OSSMemoryProvider()
        memory = FakeMemory([[{"memory": "likes foxes"}]])
        provider._get_memory = lambda: memory

        result = json.loads(provider._handle_add({"content": "I like foxes"}))

        self.assertEqual(result, {"result": "Memory stored successfully."})
        self.assertEqual(memory.calls[0]["infer"], False)

    def test_empty_direct_write_is_reported_as_failure(self):
        module = self._patched_module()
        provider = module.Mem0OSSMemoryProvider()
        memory = FakeMemory([[]])
        provider._get_memory = lambda: memory

        result = json.loads(provider._handle_add({"content": "I like foxes"}))

        self.assertIn("did not persist", result["error"])
        self.assertEqual(provider._fail_count, 1)

    def test_sync_turn_records_real_exception_without_claiming_fallback_success(self):
        module = self._patched_module()
        provider = module.Mem0OSSMemoryProvider()
        memory = FakeMemory([RuntimeError("gateway unavailable")])
        provider._get_memory = lambda: memory

        provider._do_sync([{"role": "user", "content": "I like foxes"}])

        self.assertEqual(len(memory.calls), 1)
        self.assertEqual(provider._fail_count, 1)

    def test_rerun_is_idempotent(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        src = self._fixture(temporary)

        first = self.patcher.apply_behavioral_patches(src.read_text(encoding="utf-8"))
        second = self.patcher.apply_behavioral_patches(first)
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
