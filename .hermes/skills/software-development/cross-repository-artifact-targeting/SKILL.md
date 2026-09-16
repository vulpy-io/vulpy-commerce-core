---
name: cross-repository-artifact-targeting
description: >-
  Safely implement changes when an operator provides an exact artifact path or
  names a different repository/superrepo. Prevents broad-search substitution,
  wrong-checkout edits, and premature coder dispatch.
version: 1.0.0
metadata:
  hermes:
    tags: [repository-targeting, mockups, factory, worktrees, implementation]
    related_skills: [factory-ops, vulpy-commerce-operator, frontend-design-review]
---

# Cross-Repository Artifact Targeting

Use this skill whenever the operator gives an exact file path, points to a mockup,
or asks for a change in a superrepo, sibling repository, or external checkout.
The named artifact and target repository outrank guesses from broad search.

## Required workflow

1. **Inspect the exact artifact first.** Read the path the operator supplied. Do not
   substitute a similarly named file discovered elsewhere. Record its absolute path,
   page/feature scope, visible states, interactions, and any implementation notes.
2. **Verify the target checkout exists.** Check the named repository path, its git
   identity/remotes, and whether the expected source files are present. A current
   workspace is not automatically the requested superrepo or sibling project.
3. **Separate artifact from implementation.** A mockup is a visual/interaction
   specification, not proof that its source code lives in the current checkout. Find
   the real implementation entrypoint, route, tests, build command, and runtime.
4. **Stop on a missing target.** If the requested checkout is not mounted or the
   implementation source cannot be located, report the exact missing path and ask for
   the checkout to be mounted or selected. Do not edit an adjacent repository, create
   a replacement implementation, or dispatch a coder against an invented path.
5. **Only then dispatch.** After target verification, follow factory-ops’s
   worktree/provider/brief rules. Include the exact mockup path, target repository,
   source entrypoints, behavior contract, and disjoint ownership boundaries in the
   brief.
6. **Verify against the artifact.** The completion gate must exercise the real target
   build/runtime and compare all named visual states and interactions, not merely report
   that a mockup was read.

## Common failure modes

- Broad-searching for “billing” before opening the exact operator-provided mockup.
- Treating a storefront checkout field named “billing” as a billing portal.
- Assuming `/app/workspace` is a platform superrepo because the commerce checkout is
  available there.
- Dispatching implementation when only a redesign report is present and the actual
  portal repository is absent.
- Saying the work is underway when the prerequisite checkout/path is missing.

## Evidence to report

State: exact artifact inspected; target checkout path and git identity verified;
implementation files found; coder dispatched or blocked; and the precise blocker if
blocked. Keep the result concise and do not claim implementation progress without a
real target path.
