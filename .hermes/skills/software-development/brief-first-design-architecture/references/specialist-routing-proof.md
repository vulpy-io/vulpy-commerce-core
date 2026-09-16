# Specialist routing and proof

## Boundary

`delegate_task` is for bounded, cheap scouts. It does **not** select a named role profile; its children use the configured delegation provider/model. Never dispatch Designer or Architect through it.

Run specialists through their named wrappers/profile process:

- `hermes-designer` → configured design model/provider
- `hermes-architect` → configured architecture model/provider
- coder/review/QA/security likewise run through their named profiles

## Before a premium specialist run

1. Confirm profile config has an explicit provider and base URL where required; a model alias alone does not select an endpoint.
2. Confirm profile credential metadata is not stale after an endpoint switch. Cached profile auth entries can retain an old base URL.
3. Run a one-line role smoke after routing changes.
4. For gateway-routed premium work, prove the resolved upstream model with a live gateway response and correlate the run window with gateway telemetry before claiming a premium model was used.

## Handoff contract

Fox packages the evidence once. Designer receives the packet and produces one static concept. The operator approves it. Architect receives the same packet plus the approved concept and writes an implementation delta. Coder receives both.

Do not ask the operator to test intermediary routing, preview, or renderer changes. Verify the full path first; request operator feedback only on the intended product/design decision.