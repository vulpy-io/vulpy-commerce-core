# Reference-port and final-lock extension

When the operator says to take the actual implementation from a named remote checkout or box, stop design exploration once it is found. Verify the target port/tenant and live marker, capture the exact requested source/data files, and diff only the requested slices. Preserve newer local plumbing unless replacement is explicitly authorized; do not substitute a designer approximation for a verified reference implementation.

For final repository lock, inspect the entire `git status --short`, not only the feature subtree. Preserve meaningful product/Hermes source, skills, references, plans, docs, release artifacts, and assets; remove only generated runtime state and explicitly abandoned scratch. Stage explicit paths, commit the lock, then rerun typechecks, full relevant tests, build, served-output verification, and persisted-data verification. Report warnings separately from exit status.
