# Resumable chat contract audit reference

Use this as a concrete pattern when auditing Hermes WebUI or a similar SSE agent surface before extracting a client state machine.

## Source anchors to inspect

- Normative session/stream RFCs and contract tests.
- Live SSE relay and journal replay handlers.
- Journal terminal-event and relay-close sets; these are often intentionally different.
- Stream status endpoint and canonical session endpoint.
- Browser handlers for content-finalized, relay-close, cancel, application error, transport error, approval, and clarification.
- Runtime adapter methods for start/observe/status/cancel/approval/clarification.

Pin the exact source SHA in the fixture and RFC audit note. This distinguishes source-backed behavior from proposed compatibility semantics.

## Minimal renderer-independent fixture

A JSON fixture can contain five independent sections:

1. `event_identity`: opaque ID, run-scoped sequence, exclusive replay interval, duplicate policy, overlap example.
2. `status_semantics`: active, inactive-replayable, inactive-not-replayable, and request-failed actions; mark each as nonterminal until canonical reconciliation.
3. `settlement_ordering`: normal completion, cancellation, application error, and transport error with ordered steps.
4. `event_acceptance`: valid known, duplicate, malformed JSON, invalid known payload, and valid unknown future event.
5. `ownership`: sole client owner, maximum stream count, operation facade, consumer prohibitions, and stale-generation rule.

Tests should execute fixture decisions rather than only checking prose. Add a final test that requires the existing RFC to link the fixture, test file, audited SHA, and key decisions.

## Vertical evidence sequence

For each section:

```text
add one focused test
→ run exact node and capture expected missing case/key/statement RED
→ add only corresponding fixture or RFC content
→ rerun exact node to GREEN
```

Do not count missing pytest/dependencies, bad imports, syntax errors, or wrong paths as RED. Resolve prerequisites and rerun.

After all slices:

- Run the complete new contract test file.
- Run adjacent pre-existing SSE, journal, adapter, and RFC tests.
- Validate fixture syntax and lint the new tests.
- Run `git diff --check` and inspect the changed-file list.
- Attempt the broad suite when practical. Classify unrelated environment-dependent failures separately and reproduce them narrowly; do not modify unrelated behavior.

## Handoff to client implementation

The follow-up client should consume the fixture as state-machine test input and prove:

- one stream/control owner;
- accepted opaque cursor persistence;
- duplicate-free overlap replay;
- malformed-known versus unknown-future behavior;
- generation/disposal isolation;
- content-finalized versus settlement-fence ordering;
- status/replay/canonical reconciliation;
- idempotent user control submission at the client boundary.

Wire the existing renderer first. A renderer migration or product extension is not part of the transport correctness gate.
