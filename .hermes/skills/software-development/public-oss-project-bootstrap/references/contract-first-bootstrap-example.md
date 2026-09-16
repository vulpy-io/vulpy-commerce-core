# Contract-first bootstrap example notes

## Evidence shape

Record each cycle as:

```text
Cycle: rich-block limits
RED command: pnpm exec vitest run tests/contracts/rich-block.test.ts
RED exit: 1
RED reason: parser and rich-block validator absent
RED totals: 5 failed / 5
GREEN command: same targeted command
GREEN exit: 0
GREEN totals: 5 passed / 5
REFACTOR: accumulated contract suite, exit 0, totals N/N
```

A module-not-found RED is acceptable for a wished-for public API only when the test harness itself loaded and the missing module/API is the intended missing behavior. Prefer a failing assertion once the API shell exists.

## Dual-manifest alignment

For a gallery entry with author metadata and runtime metadata, compare at least:

- extension ID;
- scripts and stylesheets;
- sidecar type, loopback origin, health path, and auth mode;
- local/relative asset safety and existence;
- declared capability vocabulary;
- exact permissions and optional-sidecar lifecycle posture.

An inert bootstrap asset should not register hooks, fetch, mutate storage, own DOM, or create chat transport simply to make the gallery package look functional.

## Adversarial fixture exceptions

Boundary scanners should scan fixtures, but invalid tests may need synthetic blocked examples. Allow exact paths such as one `invalid/config-private-boundary.json`, not `tests/fixtures/**`. Reserved domains (`example.test`) and explicit placeholders are preferable to realistic secrets or identities.

## Archive normalization

A practical deterministic tar/gzip recipe normalizes:

```text
member allowlist
lexical member order
timestamp = Unix epoch
uid/gid = 0
numeric owner names
fixed tar format
fixed gzip level and zero timestamp
```

Build twice, compare archive bytes, compare SHA-256, then list members. If a test is intended to verify the member set, sort both actual and expected sets rather than encoding an irrelevant presentation order.

## Common bootstrap pitfall

Adding all docs, skeleton files, and CI in one broad GREEN after a single contract tracer weakens strict TDD evidence. Add a failing required-shape/ownership test before the skeleton and separate executable tests for scanners, gallery validation, and archive reproducibility.
