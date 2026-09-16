#!/usr/bin/env python3
"""Build-time fixer for fox-overlay agent monkey-patches (base-image drift).

Applied by Dockerfile.hermes against the /app/fox-overlay baked into the base
image. Two problems fixed:

1. runtime_provider.py — upstream absorbed the ``target_model`` routing change,
   so the old anchor no longer matches and plugin bootstrap aborted. The
   module now detects absorption and skips cleanly.

2. cron_diagnostics.py substitution #2 — upstream inserted a run_claim block
   between the fire_claim clear and the completed-count increment, breaking
   the wide 6-line anchor. Narrowed to the minimal unique
   last_delivery_error line. Substitution #4's replacement also had wrong
   indentation (would never compile); rebuilt with source-substitution-safe
   indents that account for the anchor's preserved prefix.

3. _substitute.py — when an anchor is missing but the patched form is already
   present, skip gracefully instead of raising (absorbed-upstream tolerance).

Idempotent: each fix is applied only if its old text is present.
"""
from __future__ import annotations

import sys

RP_PATH = "/app/fox-overlay/fox_overlay/agent_plugins/fox_overlay_plugin/monkey_patches/runtime_provider.py"
CD_PATH = "/app/fox-overlay/fox_overlay/agent_plugins/fox_overlay_plugin/monkey_patches/cron_diagnostics.py"
SUB_PATH = "/app/fox-overlay/fox_overlay/_substitute.py"


def fix_substitute_absorbed() -> None:
    src = open(SUB_PATH).read()
    marker = "already in upstream"
    if marker in src:
        print("[overlay-fix] _substitute.py: absorbed-skip already present")
        return
    old = """    for idx, (old, new) in enumerate(substitutions):
        count = src.count(old)
        if count != 1:
            raise AssertionError("""
    new = """    for idx, (old, new) in enumerate(substitutions):
        count = src.count(old)
        if count == 0 and new and src.count(new) >= 1:
            # Upstream already adopted this exact change (anchor absent, the
            # patched form present). The patch's intent is satisfied — skip
            # instead of failing the whole plugin bootstrap.
            _log.info(
                "[fox-overlay] %s.%s substitution #%d already in upstream — skipping",
                upstream_module.__name__, function_name, idx + 1,
            )
            continue
        if count != 1:
            raise AssertionError("""
    if old not in src:
        print("[overlay-fix] WARN: _substitute.py anchor block not found (shape changed?) — skipping")
        return
    open(SUB_PATH, "w").write(src.replace(old, new, 1))
    print("[overlay-fix] _substitute.py: absorbed-upstream skip added")


def fix_runtime_provider_absorbed() -> None:
    src = open(RP_PATH).read()
    marker = "target_model or model_cfg"
    if marker in src:
        print("[overlay-fix] runtime_provider.py: absorbed-detection already present")
        return
    old = '''def apply() -> None:
    substitute_function(
        upstream_module=_u,'''
    new = '''def apply() -> None:
    import inspect

    fn = getattr(_u, "resolve_runtime_provider", None)
    try:
        cur = inspect.getsource(fn) if fn else ""
    except (OSError, TypeError):
        cur = ""
    # Upstream absorbed this patch (dual-path routing now honours
    # ``target_model`` directly). Mark the sentinel and no-op instead of
    # failing plugin bootstrap on the stale anchor.
    if "target_model or model_cfg" in cur:
        if fn is not None:
            setattr(fn, "_fox_patched_target_model", True)
        return
    substitute_function(
        upstream_module=_u,'''
    if old not in src:
        print("[overlay-fix] WARN: runtime_provider.py shape changed — skipping")
        return
    open(RP_PATH, "w").write(src.replace(old, new, 1))
    print("[overlay-fix] runtime_provider.py: absorbed-upstream detection added")


def _build_run_one_job_replacement(target_line: str, anchor: str, source: str) -> str:
    """Build a replacement whose first line accounts for prefix overlap."""
    upstream_indent = " " * (len(target_line) - len(target_line.lstrip(" ")))
    match_start = source.find(anchor)
    if match_start < 0:
        raise ValueError("run_one_job anchor is absent from the inspected source")
    line_start = source.rfind("\n", 0, match_start) + 1
    preserved_prefix = source[line_start:match_start]
    if preserved_prefix.strip() or not upstream_indent.startswith(preserved_prefix):
        raise ValueError("run_one_job anchor does not begin in the target line indentation")
    anchor_indent = upstream_indent[len(preserved_prefix) :]
    nested_indent = upstream_indent + "    "
    deep_indent = upstream_indent + " " * 8
    return (
        f"{anchor_indent}if success:\n"
        f"{nested_indent}deliver_content = final_response\n"
        f"{upstream_indent}else:\n"
        f"{nested_indent}_fail_lines = [_summarize_cron_failure_for_delivery(job, error)]\n"
        f'{nested_indent}_history = job.get("failure_history") or []\n'
        f"{nested_indent}if len(_history) > 1:\n"
        f'{deep_indent}_fail_lines.append(f"**Consecutive failures:** {{len(_history)}} (first: {{_history[0].get(\'at\', \'?\')[:16]}})")\n'
        f"{nested_indent}_session_files = sorted(\n"
        f'{deep_indent}(f for f in (_get_hermes_home() / "sessions").glob(f"session_cron_{{job[\'id\']}}_*.json") if f.is_file()),\n'
        f"{deep_indent}key=lambda p: p.stat().st_mtime,\n"
        f"{deep_indent}reverse=True,\n"
        f"{nested_indent})\n"
        f"{nested_indent}if _session_files:\n"
        f'{deep_indent}_fail_lines.append(f"**Session log:** `{{_session_files[0]}}`")\n'
        f'{nested_indent}deliver_content = "\\n".join(_fail_lines)\n'
    )


def fix_cron_diagnostics() -> None:
    import inspect
    import ast

    sys.path.insert(0, "/app")
    from cron import jobs as jobs_mod
    from cron import scheduler as sched_mod

    src = open(CD_PATH).read()

    changed = False

    # --- Substitution #2: narrow mark_job_run anchor -------------------------
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "substitute_function":
            kw = {k.arg: k for k in node.keywords}
            fn = kw.get("function_name")
            if not (fn and getattr(fn.value, "value", "") == "mark_job_run"):
                continue
            subs = kw["substitutions"].value.elts[0]
            old_lit = subs.elts[0].value
            up_src = inspect.getsource(jobs_mod.mark_job_run)
            if up_src.count(old_lit) == 1:
                break  # current anchor still fine
            minimal = '                job["last_delivery_error"] = delivery_error\n'
            if up_src.count(minimal) != 1:
                print("[overlay-fix] WARN: mark_job_run minimal anchor not unique — manual refresh needed")
                break
            old_seg = ast.get_source_segment(src, subs.elts[0])
            new_seg = ast.get_source_segment(src, subs.elts[1])
            # Robust path: replace the wide anchor literal with the minimal
            # one, and strip the duplicated lead line from the replacement.
            src2 = src.replace(old_seg, repr(minimal), 1)
            dup_lead = repr(old_lit.split("\n")[0] + "\n")
            src2 = src2.replace(new_seg, new_seg.replace(dup_lead, "", 1), 1)
            open(CD_PATH, "w").write(src2)
            src = src2
            changed = True
            print("[overlay-fix] cron_diagnostics.py: mark_job_run anchor narrowed")
            break

    # --- Substitution #4: rebuild run_one_job replacement with true indent ---
    src = open(CD_PATH).read()
    up_src = inspect.getsource(sched_mod.run_one_job)
    target_line = None
    for ln in up_src.split("\n"):
        if "_summarize_cron_failure_for_delivery(job, error)" in ln and "deliver_content =" in ln:
            target_line = ln + "\n"
            break
    assert target_line, "upstream run_one_job delivery line not found"
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "substitute_function":
            kw = {k.arg: k for k in node.keywords}
            fn = kw.get("function_name")
            if not (fn and getattr(fn.value, "value", "") == "run_one_job"):
                continue
            subs = kw["substitutions"].value.elts[0]
            old_lit = subs.elts[0].value
            if up_src.count(old_lit) != 1:
                print("[overlay-fix] WARN: run_one_job anchor drifted — manual refresh needed")
                break
            # Verify current replacement compiles; if not, swap in the correct one.
            patched = up_src.replace(old_lit, subs.elts[1].value, 1)
            try:
                compile(patched, "<verify>", "exec")
            except SyntaxError:
                correct_new = _build_run_one_job_replacement(target_line, old_lit, up_src)
                old_seg = ast.get_source_segment(src, subs.elts[1])
                src = src.replace(old_seg, repr(correct_new), 1)
                open(CD_PATH, "w").write(src)
                changed = True
                print("[overlay-fix] cron_diagnostics.py: run_one_job replacement rebuilt with correct indents")
            break

    if not changed:
        print("[overlay-fix] cron_diagnostics.py: no changes needed")


def verify() -> bool:
    """Run every patch module; True iff all apply cleanly."""
    import importlib
    ok = True
    for m in ("auxiliary_client", "cron_diagnostics", "runtime_provider"):
        try:
            mod = importlib.import_module(
                f"fox_overlay.agent_plugins.fox_overlay_plugin.monkey_patches.{m}"
            )
            mod.apply()
            print(f"[overlay-fix] verify {m}: OK")
        except Exception as exc:  # noqa: BLE001
            ok = False
            print(f"[overlay-fix] verify {m}: FAIL {type(exc).__name__}: {exc}")
    return ok


if __name__ == "__main__":
    fix_substitute_absorbed()
    fix_runtime_provider_absorbed()
    fix_cron_diagnostics()
    if not verify():
        print("[overlay-fix] FATAL: verification failed — refusing to bake a broken overlay", file=sys.stderr)
        sys.exit(1)
    print("[overlay-fix] all fox-overlay patches verified")
