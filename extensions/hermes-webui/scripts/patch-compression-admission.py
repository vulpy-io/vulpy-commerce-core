#!/usr/bin/env python3
import ast
import sys
from pathlib import Path

MARK = 'vulpy-compression-admission'
BLOCK = '''
# vulpy-compression-admission: conservative provider-agnostic bounded admission.
COMPRESSION_ADMISSION_MAX_TOKENS = 120_000
def _vulpy_compression_admitted(agent, approx_tokens):
    limit = int(getattr(agent, "compression_admission_max_tokens", COMPRESSION_ADMISSION_MAX_TOKENS))
    if approx_tokens is not None and approx_tokens > limit:
        message = ("Compression deferred: this session is too large for safe synchronous "
                   "compaction. Start a new session or use /compress manually after "
                   "reducing the transcript (manual recovery); no retry was queued.")
        emit = getattr(agent, "_emit_status", None)
        if emit:
            emit(message)
        return False
    return True

'''
GUARD = '''    if not _vulpy_compression_admitted(agent, approx_tokens):
        return messages, system_message

'''


def _codex_branch_end(src):
    try:
        tree = ast.parse(src)
    except SyntaxError as exc:
        raise SystemExit(f'[vulpy-compression-admission] ERROR: source is not valid Python: {exc}')
    functions = [
        node for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == 'compress_context'
    ]
    if len(functions) != 1:
        raise SystemExit('[vulpy-compression-admission] ERROR: compress_context anchor drifted')
    for node in functions[0].body:
        if not isinstance(node, ast.If):
            continue
        segment = ast.get_source_segment(src, node)
        if segment and 'api_mode' in segment and 'codex_app_server' in segment:
            return node.end_lineno
    raise SystemExit('[vulpy-compression-admission] ERROR: Codex branch anchor drifted')


def patch(src):
    if MARK in src:
        return src
    lines = src.splitlines(keepends=True)
    if sum('def compress_context(' in line for line in lines) != 1:
        raise SystemExit('[vulpy-compression-admission] ERROR: compress_context anchor drifted')
    insert = BLOCK + src if 'import logging' not in src else src.replace('import logging', 'import logging' + BLOCK, 1)
    lines = insert.splitlines(keepends=True)
    # Put admission after the Codex-native early-return block, so Codex remains
    # native and only Hermes-owned compression is bounded.
    end = _codex_branch_end(insert)
    lines[end:end] = [GUARD]
    return ''.join(lines)


def main():
    if len(sys.argv) != 2:
        return 1
    p = Path(sys.argv[1])
    p.write_text(patch(p.read_text()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
