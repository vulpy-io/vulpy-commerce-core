#!/usr/bin/env python3
"""Patch mem0ai OpenAI adapter: explicit config must beat ambient environment.

Why: mem0ai 2.0.10's ``mem0/llms/openai.py`` checks
``os.environ.get("OPENROUTER_API_KEY")`` BEFORE looking at the explicitly
configured ``api_key`` / ``openai_base_url``. Any process that merely HAS an
OpenRouter key in its environment (for unrelated tooling) gets its mem0 LLM
traffic silently rerouted to openrouter.ai with the configured model name —
which fails for gateway aliases (``vulpy-default is not a valid model ID``)
and violates the one-credential-boundary rule.

Fix: use the OpenRouter path only when the user did NOT explicitly configure
an api_key / openai_base_url for mem0. Explicit config always wins over
ambient environment variables.

Fail-loud: every anchor must match exactly once. Idempotent: re-run prints
"already patched" and exits 0.

Usage: python3 patch-mem0-openai-explicit-config-precedence.py <path/to/mem0/llms/openai.py>
"""
import sys

MARK = "# vulpy patch: explicit config precedence over ambient env"


def apply(path: str) -> int:
    src = open(path).read()
    if MARK in src:
        print("already patched")
        return 0

    n = 0

    def sub(old: str, new: str) -> None:
        nonlocal src, n
        count = src.count(old)
        if count != 1:
            raise SystemExit(f"anchor mismatch ({count} found): {old[:70]!r}")
        src = src.replace(old, new)
        n += 1

    # 1) Client construction: decide routing ONCE, honoring explicit config.
    sub(
        '''        if os.environ.get("OPENROUTER_API_KEY"):  # Use OpenRouter
            self.client = OpenAI(
                api_key=os.environ.get("OPENROUTER_API_KEY"),
                base_url=self.config.openrouter_base_url
                or os.getenv("OPENROUTER_API_BASE")
                or "https://openrouter.ai/api/v1",
            )
        else:''',
        '''        # vulpy patch: explicit config precedence over ambient env.
        # Only route through OpenRouter when the user did NOT explicitly
        # configure their own endpoint/credentials for mem0 — an ambient
        # OPENROUTER_API_KEY (used by other tooling in the same process)
        # must never hijack explicitly-configured mem0 traffic.
        self._use_openrouter = bool(os.environ.get("OPENROUTER_API_KEY")) and not (
            getattr(self.config, "api_key", None)
            or getattr(self.config, "openai_base_url", None)
        )  # vulpy patch: explicit config precedence over ambient env
        if self._use_openrouter:  # Use OpenRouter
            self.client = OpenAI(
                api_key=os.environ.get("OPENROUTER_API_KEY"),
                base_url=self.config.openrouter_base_url
                or os.getenv("OPENROUTER_API_BASE")
                or "https://openrouter.ai/api/v1",
            )
        else:''',
    )

    # 2) Request shaping: follow the SAME decision as client construction.
    sub(
        '''        if os.getenv("OPENROUTER_API_KEY"):
            openrouter_params = {}''',
        '''        if getattr(self, "_use_openrouter", bool(os.getenv("OPENROUTER_API_KEY"))):
            openrouter_params = {}''',
    )

    open(path, "w").write(src)
    compile(src, path, "exec")
    print(f"OK: {n} patches applied to {path}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    sys.exit(apply(sys.argv[1]))
