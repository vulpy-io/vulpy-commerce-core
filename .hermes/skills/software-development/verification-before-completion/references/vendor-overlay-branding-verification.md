# Vendor-overlay branding and icon verification

Use this checklist when a repository owns branding but installs it over a pinned upstream WebUI rather than modifying the vendor fork.

## Implementation pattern

- Keep the canonical SVG and derived Web/PWA assets in the owning overlay package.
- Install or overwrite upstream static assets from the shared installer used by every deployment path.
- Put the branding step behind the same disable flag as the rest of the WebUI overlay.
- Use strict, idempotent text anchors for title rewrites: accept either exactly one upstream anchor or exactly one already-branded anchor; fail on zero, duplicates, or mixed states.
- Patch every browser-title writer, not only the HTML shell. Search the pinned upstream for `document.title`, `<title>`, Apple app-title metadata, and manifest identity fields. Keep session/panel prefixes and do not conflate browser branding with in-app assistant identity.
- Preserve relative URLs, `<base>` behavior, existing icon filenames, manifest scope, and PWA start URLs.
- Generate desktop PNG/ICO/ICNS from the same canonical SVG. Keep the generation script as a reproducibility aid, not a runtime dependency.

## Focused verification

1. Verify the canonical SVG hash against the supplied source-of-truth digest.
2. Verify PNG dimensions, RGBA mode, and a transparent corner pixel. Validate platform-specific dimensions separately: a generic 512 px PWA icon is not automatically a standards-correct Apple touch icon.
3. Verify ICO includes all required embedded sizes; verify ICNS includes 1x/2x representations and reaches 1024 px.
4. Test title patching on fixtures, including idempotent second execution and explicit zero-anchor, duplicate-anchor, and mixed upstream/branded-anchor failures.
5. Search the pinned upstream globally for browser-title writers. Include dynamically generated plugin/dashboard pages and exported HTML, not only the main shell, login/restart pages, and `document.title` assignments. Preserve page/session/panel identity as a prefix while adding the brand where the specification requires every browser title to carry it.
6. Exercise disabled-overlay behavior by invoking the real shell function with the branding command replaced by a failing probe; disabled mode must return before the probe runs.
7. Confirm every pinned submodule is actually initialized before cleanliness checks: `git -C <path> rev-parse --show-toplevel` must resolve to that submodule, not the parent repository. An empty submodule directory lets Git walk upward and falsely report the parent diff as a dirty submodule.
8. Clone or copy the exact pinned upstream version, apply the existing patch series in install order, then run the branding installer twice.
9. Invoke the **real shared installer entrypoint twice** (or a faithful harness that includes repository sync and patch application), because a branding helper can be idempotent while an earlier unconditional patch step makes upgrades fail before branding is reached.
10. Syntax-check every modified JS/Python/JSON file in that pinned tree.
11. Run the focused tests again after deleting temporary upstream working copies, then confirm `git diff --check` and the exact final file inventory.
12. Run the icon generator in a clean or declared development environment and compare every generated artifact byte-for-byte. Declare and preferably pin generator-only dependencies separately from runtime dependencies; if binary-asset tests import Pillow or similar libraries, install those test dependencies explicitly in CI rather than relying on the agent image.
13. Run broad validation under the repository's CI-pinned runtime. If a local validator selects a different installed interpreter, separate that baseline/runtime mismatch from branding regressions and reproduce the actual CI runtime before changing unrelated code.

## Adversarial review checklist

Before calling a branding diff compliant, translate each requirement into an observable invariant and trace every write path that can violate it.

- Review tracked **and untracked** files; generated icons, manifests, migration helpers, and tests often appear only in the latter.
- Distinguish exact-value requirements from containment requirements. If the spec says a title must always equal a brand, `Session — Brand`, `Brand — Login`, and `Brand is restarting` are noncompliant even though they contain the brand. If the spec instead permits context prefixes, test that exact grammar.
- For CMS-configurable identity, inspect parent layouts and metadata inheritance as well as leaf pages. A hardcoded parent fallback can silently defeat customization.
- Compute representative metadata values end to end. In particular, test a default title that already contains the site name against suffix-formatting helpers; checking source strings independently misses doubled-brand output.
- Audit migrations separately from new-install defaults. Prove existing global records **and** existing collection documents are updated, and inspect create-if-missing helpers for skip-on-exists behavior.
- Preserve custom CMS content by matching known legacy seed values or fields narrowly. A recursive substring replacement can corrupt legitimate custom text that happens to mention the old brand.
- Test strict patch helpers with four fixture states: one old anchor, one new anchor, duplicate old anchors, and mixed old/new anchors. Only the first two may succeed.
- Treat tests that assert behavior contrary to the written requirement as evidence of a spec gap, not proof of correctness.
- In review-only mode, never enter an auto-fix loop or modify files. Return concise blocker-first findings with current-file `path:line` references; say `PASS` only when no blocking finding remains.

## Reporting broader-suite failures

A broad suite can fail because the local checkout lacks submodules or points at a different installed upstream. Do not present that suite as green. Report the focused result separately, then report the broad-suite pass/fail/error counts and the observed environmental mismatch without turning it into a durable claim about the toolchain.
