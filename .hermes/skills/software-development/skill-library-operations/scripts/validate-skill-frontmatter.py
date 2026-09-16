#!/usr/bin/env python3
"""Validate SKILL.md frontmatter: name/description present, description <= 1024,
total <= 100_000 chars, non-empty body. Pass one or more paths (dirs are walked
for SKILL.md). Exit 0 only if all files pass.

Usage: python3 validate-skill-frontmatter.py /data/data/hermes/skills/<category>/<name>/SKILL.md [more...]
"""
import re
import sys
import pathlib

try:
    import yaml
except ImportError:
    print("PyYAML required: pip install pyyaml", file=sys.stderr)
    sys.exit(2)


def validate(path: pathlib.Path) -> list[str]:
    content = path.read_text()
    issues = []
    if not content.startswith("---"):
        issues.append("must start with --- at byte 0")
    m = re.search(r"\n---\s*\n", content[3:])
    if not m:
        issues.append("no closing ---")
        return issues
    try:
        fm = yaml.safe_load(content[3 : m.start() + 3])
    except yaml.YAMLError as e:
        return [f"YAML parse error: {e}"]
    if not isinstance(fm, dict) or "name" not in fm:
        issues.append("missing name")
    desc = fm.get("description", "") if isinstance(fm, dict) else ""
    if not desc:
        issues.append("missing description")
    elif len(desc) > 1024:
        issues.append(f"description {len(desc)} chars > 1024")
    if len(content) > 100_000:
        issues.append("SKILL.md > 100_000 chars")
    if not content[m.end() :].strip():
        issues.append("empty body after frontmatter")
    return issues


def main() -> int:
    paths: list[pathlib.Path] = []
    for arg in sys.argv[1:]:
        p = pathlib.Path(arg)
        if p.is_dir():
            paths.extend(p.rglob("SKILL.md"))
        else:
            paths.append(p)
    if not paths:
        print("no files given", file=sys.stderr)
        return 2
    ok = True
    for p in sorted(paths):
        issues = validate(p)
        print(f"{'OK  ' if not issues else 'FAIL'} {p}" + ("" if not issues else f"  {'; '.join(issues)}"))
        ok = ok and not issues
    print("ALL VALID" if ok else "VALIDATION FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
