# SDD ledger - plan: docs/superpowers/plans/2026-08-19-storyforge-phase-1-minimum-closed-loop.md

## Preflight scan

| Scope | Relationship checked | Result | Ruling |
|---|---|---|---|
| Task 1 / Task 2 | Task 2 consumes schemas and domain errors from Task 1. | Compatible; execute sequentially. | Task 1 owns public schema names; Task 2 must not duplicate them. |
| Task 1 / Task 3 | Task 3 consumes `StoryGraph` and `ValidationIssue` types from Task 1. | Compatible; graph logic remains pure. | Task 3 must depend on schemas rather than introduce a second graph type. |
| Task 1 / Task 4 | Task 4 validates API payloads with Task 1 schemas. | Compatible. | API request and response contracts must reuse authoring schemas. |
| Task 1 / Task 5 | Task 5 consumes graph/version schemas. | Compatible. | Snapshot and reader payloads must preserve the schema distinction. |
| Task 1 / Task 6 | Task 6 consumes reader-safe export types. | Compatible. | Exporter must not serialize private schema fields. |
| Task 2 / Task 3 | Repository stores graphs validated by Task 3. | Compatible when repository owns transaction boundaries and graph validation remains pure. | Repository may reject malformed references transactionally; validator owns invariant reporting. |
| Task 2 / Task 4 | API routes consume repository methods and migration initialization. | Compatible. | Route handlers must use the repository facade and never issue authoring SQL directly. |
| Task 2 / Task 5 | Snapshots copy repository rows and rely on immutable version state. | Compatible. | Snapshot operations must be repository transactions and reject writes to sealed versions. |
| Task 2 / Task 6 | Export reads sealed reader data from repository/API. | Compatible. | Export route must require a sealed valid snapshot and return no internal metadata. |
| Task 3 / Task 4 | API graph writes need deterministic validation and stable issue codes. | Compatible. | API maps validator issues to response contracts without changing ordering or codes. |
| Task 3 / Task 5 | Snapshot sealing depends on graph validation; runtime consumes valid graph shape. | Compatible. | Snapshot must revalidate at seal time; runtime must not mutate graph input. |
| Task 3 / Task 6 | Export must only accept graphs that pass structural validation. | Compatible. | Export route rechecks the sealed snapshot before rendering. |
| Task 4 / Task 5 | Preview and snapshot routes share project/version route conventions. | Compatible. | Preserve uncached local route handlers and consistent 404/409/422 mappings. |
| Task 4 / Task 6 | Export route follows project API response/error conventions. | Compatible. | Export uses the same project lookup and error taxonomy. |
| Task 5 / Task 6 | Export and preview must share runtime semantics. | Compatible; this is an explicit phase constraint. | Task 6 must consume the pure runtime transition rules instead of duplicating behavior. |
| Task 1 | Tests, files, and schema outputs agree internally. | Consistent. | Proceed. |
| Task 2 | Migrations, repository tests, smoke script, and npm script agree internally. | Consistent, with the existing SQLite backup API as the migration backup boundary. | Proceed. |
| Task 3 | Invariant fixtures and graph outputs agree internally. | Consistent. | Proceed. |
| Task 4 | Route files, contract tests, and error mapping agree internally. | Consistent. | Proceed. |
| Task 5 | Snapshot/runtime tests, route files, and locked interfaces agree internally. | Consistent. | Proceed. |
| Task 6 | Export tests, E2E, route, and Playwright changes agree internally. | Consistent; offline file opening may require a Chromium launch flag. | Use the smallest Playwright configuration change that permits `file://` navigation. |

## Rulings

- Ruling: Implement Phase 1 as a new authoring domain beside the legacy game flow because the user approved the parallel-path approach and the spec forbids reusing legacy session semantics. Cost if wrong: two flows temporarily increase maintenance, but protects the existing playable path from schema migration risk.
- Ruling: Treat the current SQLite adapter as the backup integration boundary and keep authoring SQL in a separate `better-sqlite3` database module, because the plan explicitly requires direct SQLite transactions and migration backup before non-empty changes. Cost if wrong: two SQLite connection abstractions need later consolidation.
- Ruling: Keep Phase 1 text-only and provider-free, with no LLM, authentication, images, Redis, BullMQ, or object storage, because these are explicit global constraints. Cost if wrong: generation cannot be demonstrated until Phase 2, but the manual authoring loop remains deterministic and debuggable.
- Ruling: Use the existing repository's Node/npm and Next 16 conventions, reading local Next route-handler guidance before route changes. Cost if wrong: a framework convention may require a follow-up adjustment, but avoids relying on stale Next assumptions.

## Task tracking

- Task 1: fix round 1/5 (3 medium contract findings addressed; scoped re-review approved in `daebee2`)
- Task 1: complete (commits `4ff1081..daebee2`, task review and scoped re-review approved)
- Task 2: fix round 1/5 (P1/P2 integrity findings addressed in `6a021fd`; code re-review approved; report hash corrected for `66e98b4`)
- Task 2: complete (commits `4176a8f..66e98b4`, repository review and scoped re-review approved; report evidence committed in `13e79a8`)
- Task 3: fix round 1/5 (HIGH cycle-membership over-reporting fixed in `44cae99`; scoped re-review approved)
- Task 3: complete (commits `4930c61..44cae99`, task review and scoped re-review approved)
- Task 4: fix round 1/5 (P3 report hash corrected to `a6d235f`; code review approved)
- Task 4: complete (commit `a6d235f`, task review approved; report evidence committed in `113e3b6`)
- Task 5: fix round 1/5 (two P1 repository snapshot facade findings addressed in `4ad3cf0`; scoped re-review approved; report committed in `ccbdbdd`)
- Task 5: complete (commits `38695e8..ccbdbdd`, task review and scoped re-review approved)
- Task 6: fix round 1/5 (three medium findings addressed in `2988c19`/`a823904`; final P1 valid-progress restore fixed in `34084a0`/`5eddf39`; final scoped re-review approved)
- Task 6: complete (commits `c993c0e..5eddf39`, task review and final scoped re-review approved)
- Final Phase 1 fix round: release floors, frozen snapshot validation limits, and offline Storage fallback addressed in `3af5487`; focused scoped re-review approved with no Critical, Important, or Major findings.
- Final Phase 1 gate: local `npm run verify` passed at `3af5487` (`38` files / `320` tests; build passed); `npm run db:authoring:smoke` passed after migration v3; `npm audit --omit=dev --json` reported zero vulnerabilities; `npm ls ioredis --json` confirmed root and BullMQ use `ioredis@5.10.1`; named authoring E2E passed with installed Chrome channel (`1` test), including Storage failure fallback. Phase 1 is complete; remaining work is Phase 2 onward in the master plan.
