# SDD ledger - plan: docs/superpowers/plans/2026-08-19-storyforge-phase-2-generation-pipeline.md

## Preflight gate

- Phase 0 and Phase 1 gates are complete and recorded in `docs/release/authoring-verification.md`.
- Phase 1 code head: `3af5487`; Phase 1 verification docs/ledger commit: `03d4afc`.
- Preserve the Phase 1 authoring domain and legacy flow boundaries. Generation must write through the authoring repository and never through legacy game/session tables.
- Keep provider calls behind `GenerationProvider`; tests use a deterministic fake provider and never require the user API key.
- Treat run and step persistence as the source of truth. Browser requests only lease bounded work; no process-memory queue is authoritative.

## Rulings

- Ruling: Store stage outputs and provider metadata in generation steps, while keeping raw provider response out of API responses. Cost if wrong: larger local SQLite records, but this preserves resumability and post-failure diagnosis.
- Ruling: Keep the generation provider OpenAI-compatible and configure DeepSeek through environment variables, with no secret value committed to the repository. Cost if wrong: one adapter may need follow-up compatibility work for the configured endpoint.

## Task tracking

- Task 1: complete. Generation run/step/candidate schemas, migration v4, bounded leases, retry scheduling, terminal-safe transitions, and repository tests are implemented.
- Task 2: in progress.
- Task 3: pending.
- Task 4: pending.
- Task 5: pending.
- Task 6: pending.
- Task 7: pending.

## Task 1 verification

- `npm test -- src/__tests__/authoring/generation/repository.test.ts`: 12 tests passed.
- `npm test -- src/__tests__/authoring`: 8 files, 87 tests passed.
- `npm run typecheck`: passed.
- `npm run db:authoring:smoke`: passed.
- No provider call, Redis dependency, raw API response, or legacy session/game table was added to Task 1.
