"""Regression: every Vulpy plugin tool handler must accept the injected task_id kwarg.

The tool dispatcher calls handlers as ``handler(args, **kwargs)`` and injects a
``task_id`` keyword (tools/registry.py: ``entry.handler(args, **kwargs)``). Any
plugin handler declared with an ``(args)``-only signature raises
``TypeError: <fn>() got an unexpected keyword argument 'task_id'`` at dispatch
time, which surfaced as `coder_dispatch`, `mission_progress`, `store_profile`,
etc. all failing with `Tool execution failed`.

This test scans every Vulpy plugin module for the anti-pattern and fails so a
future `(args)`-only handler cannot silently return.
"""

import importlib.util
import pathlib
import re
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
EXT = REPO_ROOT / "extensions" / "hermes-plugins"
RUNTIME = pathlib.Path("/data/data/hermes/plugins")

# Patterns that define a handler that cannot receive **kwargs.
ARGS_ONLY = re.compile(r"^def ([a-zA-Z_]\w*)\(args\)\s*(?:->|:)", re.M)


def plugin_dirs(root: pathlib.Path) -> list[pathlib.Path]:
    return [p for p in root.glob("*/__init__.py") if p.is_file()]


class PluginHandlerSignatureTests(unittest.TestCase):
    def _scan(self, root: pathlib.Path) -> list[str]:
        bad: list[str] = []
        for init in plugin_dirs(root):
            src = init.read_text(encoding="utf-8")
            for m in ARGS_ONLY.finditer(src):
                bad.append(f"{init.relative_to(REPO_ROOT) if root == EXT else init}:{src[:m.start()].count(chr(10))+1} def {m.group(1)}(args)")
        return bad

    def test_extension_plugin_handlers_accept_kwargs(self):
        bad = self._scan(EXT)
        self.assertEqual([], bad, f"args-only plugin handlers must be (args, **kwargs): {bad}")

    def test_runtime_plugin_handlers_accept_kwargs(self):
        if not RUNTIME.exists():
            self.skipTest("runtime plugins dir not present")
        bad = self._scan(RUNTIME)
        self.assertEqual([], bad, f"runtime args-only plugin handlers: {bad}")

    def test_remote_ssh_handlers_accept_kwargs(self):
        for init in [
            EXT / "remote-ssh" / "__init__.py",
            RUNTIME / "remote-ssh" / "__init__.py",
        ]:
            if not init.exists():
                continue
            src = init.read_text(encoding="utf-8")
            bad = [m.group(1) for m in ARGS_ONLY.finditer(src)]
            self.assertEqual([], bad, f"{init} args-only handlers: {bad}")


if __name__ == "__main__":
    unittest.main()
