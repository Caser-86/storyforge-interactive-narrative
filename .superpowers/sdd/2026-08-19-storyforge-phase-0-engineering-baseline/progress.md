# SDD ledger - plan: docs/superpowers/plans/2026-08-19-storyforge-phase-0-engineering-baseline.md

## Preflight scan

| Scope | Relationship checked | Result | Ruling |
|---|---|---|---|
| Task 1 / Task 2 | Task 1 establishes `package.json` and `package-lock.json`; Task 2 pins dependencies in both files. | Compatible when Task 1 completes first; Task 2 must re-run npm install after the runtime baseline. | Execute sequentially; Task 2 owns the final dependency versions. |
| Task 1 / Task 5 | Task 1 changes CI and package scripts context; Task 5 changes CI and adds `verify`. | Compatible; Task 5 must preserve Node 24/npm-only policy and append the aggregate gate. | Execute sequentially; later CI edits must retain Task 1 requirements. |
| Task 2 / Task 4 | Both modify `src/lib/asset-queue.ts`; Task 2 fixes type identity, Task 4 changes runtime opt-in behavior. | Compatible if Task 4 consumes Task 2's final queue types and does not reintroduce casts. | Execute sequentially; review Task 4 against Task 2's type contract. |
| Task 3 / other tasks | SQLite implementation and tests are isolated from Phase 0 package and queue work. | No interface conflict found. | Execute in listed order. |
| Task 4 / Task 5 | Task 4 changes health/queue initialization; Task 5 diagnoses asset-test timeout and must use the opt-in boundary. | Compatible; Task 5 must diagnose against Task 4 rather than masking retries with a global timeout. | Execute sequentially; preserve the no-Redis invariant. |
| Task 1 | Runtime test, package files, CI, Docker, pnpm cleanup align internally. | Consistent. | Proceed. |
| Task 2 | Dependency-resolution test, package pins, queue type fixes, and typecheck align internally. | Consistent. | Proceed. |
| Task 3 | Malformed-query test and removal of broad fallback catch align internally. | Consistent. | Proceed. |
| Task 4 | Queue configuration interface and health tests align internally. | Consistent. | Proceed. |
| Task 5 | Reproduction, targeted timeout fix, verify script, evidence document align internally. | Consistent, with evidence dependent on actual command output. | Proceed. |

## Rulings

- Ruling: Use the current checkout on a dedicated `codex/storyforge-phase-0` branch rather than creating a second physical worktree. The user approved implementation mode and the environment exposes one shared project workspace; a second checkout would duplicate the active local runtime and data context. Cost if wrong: branch isolation protects commits, but uncommitted workspace artifacts remain shared.

## Task tracking

- Task 1: minor (deferred): `npm install` reported 6 high-severity audit findings and native/postinstall `allow-scripts` warnings; dependency remediation is outside Task 1 and remains visible for later review.
- Task 1: complete (commits ce0310f..ee53287, review clean)
- Task 2: fix round 1/5 (1 addressed, 0 open - added required Redis/images-disabled command evidence; no source changes or new commit)
- Task 2: complete (commits ee53287..08a4fc5, review clean)
- Task 3: fix round 1/5 (2 addressed, 0 open - preserved non-row SQLite statements and asserted native syntax errors; commits f0cfd5d..6e05e0a)
- Task 3: complete (commits 08a4fc5..6e05e0a, review clean)
- Task 4: fix round 1/5 (1 addressed, 0 open - aligned whitespace-only REDIS_URL health validation; commit bf1865b..190d898)
- Task 4: fix round 2/5 (1 addressed, 0 open - made test env restoration delete absent variables; commit 190d898..88d38a8)
- Task 4: complete (commits 6e05e0a..88d38a8, review clean)
- Task 5: fix round 1/5 (4 addressed, 1 new portability finding - CI env, test hook scope, and installed-tree check restored; commit 5ecf1fb..b3fa8ac)
- Task 5: fix round 2/5 (1 addressed, 0 open - npm CLI invocation made cross-platform; commit b3fa8ac..18951c9; evidence note commit 47356dd)
- Task 5: complete (commits 88d38a8..47356dd, review clean)
