# Skill-Corpus Clarity Pass (STE-style rewrite) — recipe

Session-proven recipe for applying an ASD-STE100-style clarity pass to the skill library
(used 2026-08-15: `asd-ste100` install + 6 description rewrites + 3 body passes,
73 replacements, zero regressions).

## Decide: is a pass worth it?

| Text | Verdict |
|---|---|
| Tool/error/inter-agent strings, prompts, skill descriptions with real misparse risk | Rewrite (Strict mode) |
| README-style prose | STE-flavored only (structural rules; lexical advisory) |
| Mass corpus rewrite "in accordance with" a style skill | Usually NO — see below |

Why a full-corpus rewrite is usually not worth it:

- Purpose mismatch: skills are read by a model with session context; STE targets a parser with no back-channel.
- Token economics: STE lengthens text; the authoring target is 8–14k chars with compact leading words.
- Lexical half is unenforceable without ASD's ~900-word dictionary (the skill says so itself).
- Drift risk: one-shot LLM rewrites of exact commands/paths silently change meaning; zero behavioral tests catch it.

High-leverage targets, in order: skill `description` fields → prompts/cron briefs/tool descriptions →
obviously-violating prose sections → (last) full bodies.

## Install a third-party GitHub skill

```bash
# Clone into the skills tree under a category — preserves references/ + examples/
git clone --depth 1 https://github.com/<owner>/<repo> /data/data/hermes/skills/<category>/<name>
rm -rf /data/data/hermes/skills/<category>/<name>/.git   # avoid nested-repo noise in the checkout
# Verify the loader sees it: skill_view(name="<name>") → readiness_status: available
```

Do NOT use `hermes skills install <SKILL.md URL>` for a repo with linked files — only the single
SKILL.md is fetched; `references/` and `examples/` are lost.

## Description rewrite rules (dispatch surface — highest value)

- Preserve the trigger lead: "Load automatically when…", "Use when…".
- Preserve trigger synonyms (e.g. "storefronts, online stores, shopping sites") — recall surface, not ambiguity.
- Preserve every fact and scope qualifier; never upgrade a hedge to a fact.
- Kill ALL-CAPS, semicolons, run-ons, marketing adjectives, filler words ("truly", "actually").
- Keep ≤1024 chars (validator limit); quote the YAML value when it contains `": "` (colon + space).
- Validate after: frontmatter parses, description ≤1024, body non-empty.

Real before/after (2026-08-15):

| Before | After |
|---|---|
| `Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always` | `Use when you are about to claim that work is complete, fixed, or passing, before you commit or create PRs. Run verification commands and confirm their output before you make any success claim. Put evidence before claims, always.` |
| `ALWAYS use this skill when working on ecommerce storefronts, online stores, shopping sites. Use for ANY storefront component including ... or ANY page/component in a storefront. CRITICAL for adding checkout...` | `Always use this skill when working on ecommerce storefronts, online stores, or shopping sites. Use it for any storefront component: ... Load it when you add checkout...` |

## Body pass rules (normalize, don't gut)

- ALL-CAPS emphasis → normal case, keep directive force (`YOU MUST FOLLOW` → `Follow`; `Step 1: PAUSE` → `Step 1: Pause`).
- Keep `MUST`/`Never`/`Always` as directive words (MUST is STE-approved vocabulary).
- Keep priority labels in tables/headers (`CRITICAL`/`HIGH`/`MEDIUM` impact columns) — data, not decoration.
- Keep code blocks, rule IDs (`arch-`, `data-`…), file paths, reference names byte-identical.
- Keep dense precision blocks (e.g. SDK-path gotcha paragraphs) — flag instead of rewriting.
- Split run-ons; no semicolons; expand contractions; restore dropped subjects; drop marketing adjectives that claim without measuring.

## Bulk edit mechanics: strict two-phase replace

Never blind sed. Python script shape:

1. Phase 1 — verify: for every (file, old, new) triple, `text.count(old) == 1`. Any 0-count or
   multi-count → print all problems, exit 1, write nothing.
2. Phase 2 — apply: only after every target is verified.

This catches real mismatches: a `- ` vs `4. ` list-prefix typo surfaced as a 0-count and aborted
the run before any partial write.

## Validation snippet

```python
import yaml, re, pathlib
for rel in files:
    c = (pathlib.Path(BASE)/rel).read_text()
    assert c.startswith("---")
    m = re.search(r'\n---\s*\n', c[3:])
    fm = yaml.safe_load(c[3:m.start()+3])
    assert "name" in fm and fm.get("description") and len(fm["description"]) <= 1024
    assert c[m.end():].strip()  # non-empty body
```

## Style source

`asd-ste100` (software-development/asd-ste100, MIT, danyuchn/asd-ste100-skill) encodes
ASD-STE100 Issue 9 rule categories as a rewrite skill: Strict mode (procedures, errors, tool
descriptions) vs STE-flavored (prose). Use it at authoring time as a filter; do not mass-apply.
