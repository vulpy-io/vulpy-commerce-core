# Specialist routing and proof

## Scout versus specialist is a hard boundary

- **Scouts** use `delegate_task`: cheap model, bounded reads/search, low reasoning, at most two concurrent. They gather facts only.
- **Designer, architect, reviewer, QA, and coder** run through their named profile/wrapper or factory dispatch path. Do not use generic delegation for role work: delegation config intentionally overrides children to the cheap scout model.

## Before claiming a specialist model was used

1. Verify the actual profile invocation includes the intended profile and model.
2. Correlate the run/session timestamp with gateway telemetry or provider usage.
3. If telemetry only proves an alias, say that; do not infer the underlying model from profile configuration.
4. Use a dedicated, single-route alias for premium specialist work when provider routing has duplicate/fallback entries. Avoid a randomized alias where model attribution matters.

## Operator-visible workflow

- Do not say a revision or dispatch is "in flight" without issuing the dispatch/process call in the same turn.
- Do not make the operator test a frontend/tool contract before the full agent registration → toolset exposure → run-prompt injection → renderer path has automated verification and an end-to-end probe.
- When visual QA finds a defect, dispatch the bounded correction immediately in that same turn, then re-run screenshot QA before presenting it.
