---
name: skill-clarity-passes
description: Use when rewriting or cleaning existing skill text in this library — frontmatter descriptions or bodies — via simplified-technical-English (asd-ste100), plain-language, or style-normalization passes. Covers the operator's rewrite preferences (keep priority signal words, normalize typography only), the descriptions-then-bodies pilot workflow, fail-loud bulk replacement, and whole-file commit handling. Not for authoring new skills from scratch (use hermes-agent-skill-authoring).
version: 1.0.0
author: Fox
license: MIT
metadata:
  hermes:
    tags: [skills, rewriting, clarity, ste100, style, maintenance]
    related_skills: [hermes-agent-skill-authoring, asd-ste100]
---

# Skill Clarity Passes (rewriting existing skills)

## Overview

A clarity pass rewrites the text of EXISTING skills — usually their
frontmatter `description` (paid every turn, highest leverage) or their
bodies — to remove ambiguity, shouting, and structural noise. The installed
`asd-ste100` skill (software-development/asd-ste100) is the rewrite tool;
this skill is the WORKFLOW and the OPERATOR'S PREFERENCES for applying such
passes to this library. It complements `hermes-agent-skill-authoring`
(which governs authoring new in-repo skills) — that skill covers structure
and validator constraints; this one covers editing existing skill text.

## When to Use

- User asks to rewrite/clean up skills "in accordance with" a style system (STE, plain language, etc.) or a style pass.
- ALL-CAPS emphasis, run-on sentences, semicolons, or marketing adjectives have crept into skill descriptions or bodies.
- You are normalizing frontmatter descriptions across many skills.
- You are applying a bulk text transformation to skills in the shared tree.

Don't use for: creating new skills (hermes-agent-skill-authoring), or
rewriting creative/marketing copy (asd-ste100 explicitly excludes it;
humanizer is the opposite direction).

## Operator Preference (learned 2026-08-15 — do not regress)

**KEEP priority signal words. Normalize typography only.**

The operator pushed back on removing `CRITICAL:` / `IMPORTANT:` labels from
skill headings and bullets ("Are you actually sure we should remove
IMPORTANT and CRITICAL?"). These are NOT decoration — in agent-facing skill
text they are behavioral metadata the LLM reader weights, and they match the
skill's own priority taxonomy (rule tables use CRITICAL/HIGH/MEDIUM as data).

Keep:
- `CRITICAL:` / `IMPORTANT:` bold labels on headings and bullets
- `MUST` / `NEVER` / `ALWAYS` force words (STE-approved directive vocabulary)
- Warning/emphasis markers: ⚠️, ❌, ✅
- "always"/"never" in a rule even when the surrounding caps are dropped

Normalize (these are typography, safe to fix):
- Whole-sentence ALL-CAPS shouting: `YOU MUST FOLLOW THIS EXACT WORKFLOW`
  → `You must follow this exact workflow` (keep the "must")
- Decoration caps: `ANY`, `ALL`, `REQUIRED`, `ERROR` as standalone emphasis
  → lowercase
- Run-ons, banned semicolons, dropped subjects ("Use when about to claim"
  → "Use when you are about to claim"), hedge stacks, marketing adjectives
  ("high-converting", "modern, flexible"), contractions ("they're" → "they are")
- Inline step verbs in caps: `Step 1: PAUSE` → `Step 1: Pause`

Rule of thumb: if removing the word changes the directive's force, keep it.
If removing only changes the typography, normalize it.

## Workflow

1. **Evaluate before installing** a third-party rewrite skill: license,
   accuracy of its claims, format compatibility with Hermes SKILL.md
   (name + description ≤1024 chars), and whether `references/` /
   `examples/` linked files come along (clone into the skills tree, do not
   URL-install, or the linked files are lost). Remove the nested `.git`
   after cloning so the workspace repo stays clean.
2. **Pilot on descriptions first.** Descriptions are the dispatch surface —
   preserve every trigger word, fact, and scope qualifier; keep the
   "Use when ..." / "Load automatically when ..." lead. Show before/after.
3. **Body pass second** (only after description pilot lands). Use the
   fail-loud replacement script (scripts/strict-replace.py) — never
   hand-edit dozens of lines.
4. **Validate after every pass**: YAML frontmatter parses, description
   ≤1024 chars, body non-empty; scan for remaining decoration caps (expect
   only legit acronyms + priority labels).
5. **Commit whole files** when the operator says so. If the file carries
   pre-existing uncommitted hunks from other sessions, NAME them in the
   commit body rather than pretending they're yours. If a committed section
   references an untracked file (e.g. a `references/foo.md`), stage that
   file too — never commit a dangling pointer.

## Bulk Replacement Pattern

Use `scripts/strict-replace.py` for multi-file text normalization:

- Define replacement pairs per file (old → new).
- Phase 1: verify every old string occurs EXACTLY once in its file.
  Abort with zero writes if any target is missing or ambiguous.
- Phase 2: apply and write.
- Optionally validate frontmatter after applying.

Why fail-loud: shared-tree skill files often carry adjacent uncommitted
work; blind sed-style replacement silently sweeps it in or mangles
precision content. Exact-count verification catches wrong prefixes
(numbered "4. " vs "- " bullets), stale strings, and mixed hunks BEFORE
anything is written.

## Common Pitfalls

1. **Removing priority words along with caps** — the 2026-08-15 regression.
   The restore pass re-added exactly the CRITICAL/IMPORTANT labels and the
   "always" force words; the typography fixes stayed. Do not repeat.
2. **Not checking git diff before staging** — other sessions' uncommitted
   sections (CI gates, guards, proxy notes) hide inside "your" files.
   Whole-file commits are OK per operator, but the commit body must
   disclose the ride-along content.
3. **Committing a pointer without its target** — a section referencing
   `references/x.md` must be committed with that file.
4. **Upgrading hedges to facts** — "may have failed" stays "may have
   failed"; a shorter sentence that asserts failure is a different claim.
5. **Touching code blocks, rule IDs, paths, and MUST-directive bullets** —
   those are precision content; leave byte-identical.
6. **Over-rewriting compliant text** — the skill's own rule: if input
   already complies, say so; don't force changes.

## Verification Checklist

- [ ] Priority labels (CRITICAL/IMPORTANT), MUST/NEVER/ALWAYS force, ⚠️/❌ markers intact after pass
- [ ] YAML frontmatter parses; description ≤1024 chars; body non-empty
- [ ] No decoration ALL-CAPS remain (grep for ALWAYS|NEVER|CRITICAL|ERROR|PAUSE|QUERY|VERIFY|CHECK|STOP|DO NOT; expect only table priority labels)
- [ ] Code blocks, rule IDs, paths byte-identical (diff review)
- [ ] Hedges preserved; no facts added
- [ ] Commit body names any ride-along uncommitted content; referenced files staged together
- [ ] `asd-ste100` skill loads via skill_view (linked files present)

## Related

- `asd-ste100` — the rewrite tool (installed 2026-08-15, MIT, danyuchn/asd-ste100-skill)
- `hermes-agent-skill-authoring` — authoring new skills; validator + structure
- `scripts/strict-replace.py` — reusable fail-loud bulk replacement
