# Public Scope and Side-Effect Gate

Use before creating a public repository, filing its first issue, publishing a package, or dispatching a bootstrap agent.

## Preflight

- **Artifact:** one exact sentence naming what ships.
- **Boundary:** what belongs to host/core versus the public repository.
- **Non-goals:** adjacent features forbidden from names, schemas, fixtures, docs, and screenshots.
- **Identity:** approved repository/package/extension name.
- **Delivery:** general opt-in/default-on posture, disable precedence, and rollback.
- **Authority:** explicit user approval for the public side effect.
- **Cleanup capability:** verify the active credential can delete, transfer, archive, or otherwise reverse the action if needed.

Do not infer product identity from an epic title, an old planning decomposition, or a delegated summary. Read the current issue and the user's latest correction first.

## If scope changes after delegation

1. Stop new public side effects immediately.
2. Cancel the obsolete controller track; separately note that this does not stop an already-running asynchronous agent.
3. Mark its eventual output stale and quarantine the isolated checkout.
4. Do not cherry-pick generic-looking scaffolding until it independently satisfies the corrected contract.
5. Rewrite deeply contaminated plans and issue bodies from the corrected product boundary; update dependency issues before the parent epic and read them back live.
6. Ask the user to choose delete, rename, archive, or reuse for mistakenly created public assets; recommend the cleanest option.
7. If cleanup permission is missing, record the blocker in the private tracker and exclude the mistaken asset from all architecture and release dependencies.

## Acceptance rule

Repository creation, issue filing, package naming, and public descriptions are release-facing work. They are accepted only when scope, identity, authorization, and rollback are all explicit. “The repository is empty” does not lower this bar.
