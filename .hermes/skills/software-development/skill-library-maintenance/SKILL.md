---
name: skill-library-maintenance
description: "Use when evaluating, installing, or rewriting skills in the Hermes skill library — third-party skill evaluation, installing GitHub-hosted skills, clarity passes on skill descriptions and bodies, and bulk-editing skill text safely. Pairs with asd-ste100 for STE-style controlled-English rewrites."
version: 1.0.0
author: Fox
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [skills, library, maintenance, clarity, rewrite, install, ste100]
    related_skills: [hermes-agent-skill-authoring, asd-ste100]
---

# Skill Library Maintenance

## Overview

Maintain the Hermes skill library. Three recurring jobs: evaluate a third-party skill before installing, install it so linked files survive, and rewrite skill text (descriptions first, bodies only with approval) without breaking the loader contract. The `hermes-agent-skill-authoring` skill (bundled, read-only) covers authoring from scratch; this skill covers evaluating and editing the existing library.

## When to Use

- User asks whether a third-party skill is worth installing, or wants the corpus rewritten "in accordance with" a style skill.
- Installing a GitHub-hosted skill into the library (clone method below).
- Style pass on skill text: controlled-English (ASD-STE100), de-shouting ALL-CAPS, removing marketing adjectives.
- Bulk edits across multiple SKILL.md files.

## Evaluate Before Installing

Verdict logic for "is this skill worth it":

- **Quality signals:** MIT/clear license, active maintenance, honest scope ("will not" section), preserves hedges/modality, no unverifiable compliance claims.
- **Compatibility:** same SKILL.md frontmatter shape (name + description ≤1024 chars) — most Claude Code skills install as-is.
- **Rewriting the whole corpus to match a style skill is usually NO:** purpose mismatch (skills are read by a model with context, not a parser with no back-channel), token economics (controlled English lengthens text; target is 8–14k chars), the lexical half is often unenforceable without an external dictionary, and one-shot LLM rewrites drift exact commands/paths with zero behavioral tests.
- **Pilot pattern the user expects:** install → rewrite the highest-leverage subset (descriptions) → report before/after → extend to bodies only on explicit approval.

## Install a Third-Party GitHub Skill

```bash
git clone --depth 1 https://github.com/<owner>/<repo> /data/data/hermes/skills/<category>/<name>
rm -rf /data/data/hermes/skills/<category>/<name>/.git   # no nested repo in the checkout
```

- Do NOT use `hermes skills install <SKILL.md URL>` when the repo has `references/` or `examples/` — a URL install fetches only the single SKILL.md and drops linked files.
- The skills tree is bind-mounted with the workspace `.hermes/skills` (same inode) — one edit covers both runtime and repo.
- Verify loadability with `skill_view(name=...)` → `readiness_status: available`.

## Clarity Passes (Descriptions First)

Descriptions are dispatch surface scanned every turn — highest-value rewrite target. Rules:

- Preserve the loader contract: trigger leads ("Load automatically when…", "Use when…"), trigger synonyms (recall surface, not ambiguity), every fact and scope qualifier. Never upgrade a hedge to a fact.
- Drop ALL-CAPS emphasis (`ALWAYS`, `CRITICAL`, `ERROR`, `PAUSE`) but keep the directive force in normal case. Keep `MUST`/`Never`/`Always` as ordinary directive words (MUST is STE-approved vocabulary).
- Keep priority labels in tables/headers (`CRITICAL`/`HIGH`/`MEDIUM` impact columns) — that is data, not decoration. Keep code blocks, rule IDs, file paths, reference names byte-identical.
- Split run-ons and em-dash joins; no semicolons; expand contractions; restore dropped subjects.
- YAML gotcha: quote the description when it contains `": "` (colon + space) or frontmatter stops parsing as a plain scalar.
- Keep descriptions ≤1024 chars; validate frontmatter after every pass.

## Bulk-Editing Safety

Never blind sed. Use a strict two-phase replace script:

1. Verify: every (file, old, new) target must occur exactly once. Any 0-count or multi-count → print all problems, exit 1, write nothing.
2. Apply: only after every target verified.

This catches real mismatches (e.g. a `- ` vs `4. ` list-prefix typo surfaced as a 0-count and aborted before any partial write). Bundled skills refuse edits — check with one write attempt before planning around them.

## Renaming a Skill

Frontmatter `name`, directory, and every live reference must move together —
a half-renamed skill causes dispatch misses and stale cross-refs.

1. `mv <category>/<old> <category>/<new>` (keep the category dir).
2. Update frontmatter `name:` to the exact slug and bump `version:`. Extend
   `triggers:` if the old name never fired on the real behavior (classic:
   "about to write or edit product code" missing from a factory skill).
3. Sweep references in LIVE files only:
   `grep -rln "<old>" <skills-root> --include="*.md"` → replace in every hit
   (`sed -i 's/old/new/g'` over that enumerated set is safe; never a blind
   global replace). This covers other skills' references/ AND the renamed
   skill's own references/.
4. Check non-skill references: SOUL.md, `.hermes.md`/AGENTS.md, profile
   wrapper generators (`setup-agent-profiles.sh` preload lists), scripts.
5. Verify with `skill_view(name=<new>)` → `readiness_status: available`.
   Also spot-check frontmatter `name:` matches the directory name.
6. Leave HISTORICAL artifacts alone: old plan docs, old task briefs, session
   request dumps. They record past state; rewriting them is churn.
   `.usage.json` keeps the old key — harmless, curator re-registers on use.
7. Fix the internal body heading in the same pass — `# Old Name` often
   survives the rename and reads stale.

## Common Pitfalls

1. **URL-installing a repo with linked files** — `hermes skills install <URL>` drops `references/`/`examples/`. Clone instead.
2. **Leaving the nested `.git`** after cloning a skill into the library — pollutes the checkout. Remove it.
3. **Mass corpus rewrite by default** — descriptions are the only high-leverage target; full-body passes need explicit approval and a keep-list (below).
4. **Blind sed / global replace** — silent no-ops. Two-phase verify-then-apply only.
5. **Rewriting trigger synonyms away** — "storefronts, online stores, shopping sites" are dispatch recall surface, not ambiguity; the STE skill's one-word-one-meaning rule does not apply to them.

## Verification Checklist

- [ ] Frontmatter parses; description ≤1024 chars; body non-empty
- [ ] Loader contract intact: trigger lead, synonyms, facts, scope qualifiers
- [ ] No ALL-CAPS decoration remains (grep the decoration words); only table priority labels / acronyms
- [ ] Code blocks, rule IDs, paths byte-identical to before
- [ ] No commit/push made unless the operator asked

Full recipe, before/after examples, and the validation snippet: `references/skill-corpus-clarity-pass.md`.
