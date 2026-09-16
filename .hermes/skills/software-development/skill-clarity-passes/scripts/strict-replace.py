#!/usr/bin/env python3
"""Strict fail-loud bulk replacement for skill-library clarity passes.

Usage:
  python3 strict-replace.py [pairs.json] [--validate]

pairs.json shape:
  {
    "relative/path.md": [["old string", "new string"], ...]
  }
Paths resolve relative to SKILLS_ROOT (default /data/data/hermes/skills).

Behavior:
  Phase 1: verify every old string occurs EXACTLY once in its file.
           Abort with zero writes if any target is missing or ambiguous.
  Phase 2: apply replacements and write files.
  --validate: after applying, parse each file's YAML frontmatter and check
              description <= 1024 chars and body non-empty.

Why fail-loud: shared-tree skill files often carry adjacent uncommitted work;
blind sed-style replacement silently sweeps it in or mangles precision
content. Exact-count verification catches wrong prefixes (numbered "4. "
vs "- " bullets), stale strings, and mixed hunks BEFORE anything is written.
"""
import json
import sys
from pathlib import Path

SKILLS_ROOT = Path("/data/data/hermes/skills")


def load_pairs(path: Path):
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise SystemExit("pairs.json must be a dict of {path: [[old, new], ...]}")
    return {k: [tuple(p) for p in v] for k, v in data.items()}


def validate_frontmatter(rel: str, text: str) -> list[str]:
    """Minimal frontmatter check: parses, description <= 1024, body non-empty."""
    import re
    import yaml  # PyYAML

    issues = []
    if not text.startswith("---"):
        return [f"{rel}: no leading ---"]
    m = re.search(r"\n---\s*\n", text[3:])
    if not m:
        return [f"{rel}: no closing ---"]
    try:
        fm = yaml.safe_load(text[3 : m.start() + 3])
    except Exception as e:  # noqa: BLE001
        return [f"{rel}: YAML parse error: {e}"]
    desc = fm.get("description", "") if isinstance(fm, dict) else ""
    if not desc:
        issues.append(f"{rel}: missing description")
    elif len(desc) > 1024:
        issues.append(f"{rel}: description {len(desc)} > 1024")
    if not text[m.end() :].strip():
        issues.append(f"{rel}: empty body")
    return issues


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    validate = "--validate" in sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    pairs = load_pairs(Path(args[0]))

    # Phase 1: verify
    problems = []
    for rel, replacements in pairs.items():
        p = SKILLS_ROOT / rel
        if not p.exists():
            problems.append(f"{rel}: file not found")
            continue
        text = p.read_text()
        for old, _new in replacements:
            n = text.count(old)
            if n != 1:
                problems.append(f"{rel}: {n}x occurrences for {old[:80]!r}")
    if problems:
        print("ABORT — no changes written:")
        for pr in problems:
            print("  ", pr)
        return 1

    # Phase 2: apply
    total = 0
    for rel, replacements in pairs.items():
        p = SKILLS_ROOT / rel
        text = p.read_text()
        for old, new in replacements:
            text = text.replace(old, new)
            total += 1
        p.write_text(text)
        print(f"OK {rel}: {len(replacements)} replacements")

    if validate:
        bad = []
        for rel in pairs:
            bad += validate_frontmatter(rel, (SKILLS_ROOT / rel).read_text())
        if bad:
            print("FRONTMATTER ISSUES:")
            for b in bad:
                print("  ", b)
            return 1
        print("Frontmatter validation OK")
    print(f"TOTAL: {total} replacements applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
