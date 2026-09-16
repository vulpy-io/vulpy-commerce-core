---
name: skill-library-operations
description: "Use when evaluating a third-party or GitHub skill for adoption, installing a skill into the local tree, or editing existing skills at scale (description rewrites, corpus-wide changes). Covers repo recon, clone-install preserving linked files, and safe pilot-first editing of skill files with frontmatter validation."
version: 1.0.0
author: Fox
license: MIT
metadata:
  hermes:
    tags: [skills, adoption, install, corpus, editing, frontmatter, validation, ste]
    related_skills: [hermes-agent-skill-authoring, vulpy-skill-promotion, asd-ste100]
---

# Skill Library Operations

Operating the local skill corpus: evaluating outside skills, installing them without breaking their support files, and editing existing skills at scale without silently changing behavior.

## When to Use

- The user shares a GitHub/third-party skill and asks "is this worth installing?" or "rewrite all skills in accordance with this?"
- Installing a skill from a repo (not the hub) so its `references/` and `examples/` survive.
- Batch edits to skill files — description rewrites, style passes, frontmatter fixes.
- Any task where the deliverable is a verdict on a skill, an installed skill, or an edited skill — not STE rewriting itself (that is the `asd-ste100` skill's job).

## Evaluate Before Adopting

1. **Repo recon via GitHub API** (do not rely on `web_extract`; a search-only backend cannot fetch URLs). Three calls:
   ```bash
   curl -s https://api.github.com/repos/<owner>/<repo> | python3 -m json.tool   # default_branch, license, stars, pushed_at, description
   curl -s "https://api.github.com/repos/<owner>/<repo>/git/trees/<default_branch>?recursive=1"   # file tree: SKILL.md? references/? examples/?
   curl -sL "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<file>" -o /tmp/...   # pull each file
   ```
   The tree call needs the **default branch** — guessing `main` fails on `master` repos.
2. **Read everything**: SKILL.md in full, plus references and examples. Judge:
   - Process quality: does it have completion criteria, hedging/modality discipline, honesty about its own limits?
   - License + redistribution constraints (some standards-based skills legally cannot include their source dictionary — that is a sign of care, not a defect).
   - Hermes frontmatter compatibility: `name` present, `description` ≤1024 chars, body non-empty.
3. **Separate two questions** the user usually conflates: "install this skill?" vs "rewrite my whole corpus to match it?". A genuinely good skill can still be the wrong corpus-wide standard — purpose mismatch (skills are read by a model with context, not a parser), token economics (STE-style expansion lengthens every loaded skill), and silent drift risk on a mass LLM rewrite. Verdict should name the difference and recommend a bounded pilot.
4. **Deliver verdict + recommendation, install only after approval.** The user approves via terse commands ("go") — then run the pilot autonomously.

## Install Preserving Linked Files

- **Clone, don't URL-install.** `hermes skills install https://…/SKILL.md` fetches only the SKILL.md — `references/` and `examples/` do not come along, leaving dangling links. Use:
  ```bash
  git clone --depth 1 https://github.com/<owner>/<repo> /data/data/hermes/skills/<category>/<name>
  rm -rf /data/data/hermes/skills/<category>/<name>/.git   # nested repo pollutes the workspace git tree
  ```
- Place under a category dir matching the corpus layout (e.g. `software-development/`).
- Verify with `skill_view(name=...)` — it must load and list `linked_files`. In this environment the loader picks up newly added skills in the same session (observed 2026-08-15); if it does not, the skill appears next session — that is expected, not a bug.
- Do not fork upstream skill content with local edits — keep it pristine so updates stay possible.

## Pilot Corpus Edits Safely

1. **High-leverage targets first: `description` fields.** They are paid every turn and drive skill dispatch — the cheapest place to improve quality and the riskiest to break.
2. **Preserve trigger semantics:** keep "Use when…" / "Load automatically when…" leads, keep trigger synonyms (they are dispatch recall surface, not ambiguity), keep every fact and scope qualifier.
3. **Tighten with STE-style rules** (the installed `asd-ste100` skill is the authority):
   - Kill ALL-CAPS emphasis but keep the force as a directive ("ALWAYS use for ANY…" → "Always use this skill for all…").
   - Merge duplicated enumerations (a mode list restated in clause 2).
   - Drop no-op phrases ("best practices" when "patterns" already says it).
   - Split em-dash run-ons into separate sentences; semicolons are banned outright.
   - Align slogan wording with the skill body (one concept, one name).
4. **YAML quoting:** if the rewritten description contains `: ` (colon+space), wrap it in double quotes — a plain scalar breaks frontmatter parsing. Single quotes inside double quotes are fine.
5. **Validate after every edit** (see `scripts/validate-skill-frontmatter.py` — run it, don't hand-check):
   - File starts with `---` at byte 0, closing `\n---\n`, parses as YAML.
   - `name` and `description` present; description ≤1024 chars; body non-empty; total ≤100,000 chars.
6. **Confirm the loader exposes new text** via `skill_view` — same-session pickup is normal here.
7. **Stop at the agreed scope.** If the pilot was descriptions only, do not drift into bodies. Bodies with ALL-CAPS headers are a separate, explicit follow-up.

## Common Pitfalls

1. **URL-install of a skill with support files** → broken references. Clone instead.
2. **Leftover `.git` in the skills tree** → embedded-repo weirdness in the workspace checkout.
3. **Mass rewrite without a pilot** → silent meaning drift, no tests catch it. Descriptions first, then a named subset of bodies, then the rest.
4. **Forcing the standard onto compliant text** — the STE skill itself says: if the input already complies, say so. A pilot report should include "kept as-is" items (trigger synonyms, exact facts) and "deliberately did not simplify" notes.
5. **Guessing the default branch** in GitHub API calls.
6. **Unquoted descriptions containing colons** → YAML parse failure that validation catches only if you run it.

## Verification Checklist

- [ ] Repo metadata checked (default branch, license, recency) before any verdict
- [ ] SKILL.md + references + examples read in full before recommendation
- [ ] Verdict separates "install" from "corpus rewrite"; pilot proposed, not mass rewrite
- [ ] Install via clone; `.git` removed; `skill_view` loads and shows `linked_files`
- [ ] Edited descriptions: ≤1024 chars, valid quoted YAML, triggers and facts preserved
- [ ] Validation script run on all touched files; all pass
- [ ] Scope respected: pilot stayed on descriptions; body pass called out separately

## Support Files

- `scripts/validate-skill-frontmatter.py` — frontmatter + size validation for one or more SKILL.md files.
- `references/asd-ste100-pilot-2026-08.md` — worked example: six description rewrites with the rule per file.
