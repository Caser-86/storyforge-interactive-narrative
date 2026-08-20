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
- Task 2: complete. Provider contracts, OpenAI-compatible DeepSeek adapter, error taxonomy, and deterministic fake provider are implemented and tested.
- Task 3: complete. Brief, bible, outline, and graph stages now use structured prompts, stable IDs, project budgets, and bounded next-step descriptors.
- Task 4: complete. Structural precheck, bounded node context/batching, node output validation, and warning-only continuity review are implemented.
- Task 5: complete. The bounded executor now leases at most two steps, persists completions/failures, applies capped transient backoff, pauses auth failures, and recovers expired leases.
- Task 6: in progress.
- Task 7: pending.

## Task 1 verification

- `npm test -- src/__tests__/authoring/generation/repository.test.ts`: 12 tests passed.
- `npm test -- src/__tests__/authoring`: 8 files, 87 tests passed.
- `npm run typecheck`: passed.
- `npm run db:authoring:smoke`: passed.

## Task 5 verification

- `npm test -- src/__tests__/authoring/generation/executor.test.ts`: 5 tests passed.
- `npm test -- src/__tests__/authoring`: 12 files, 111 tests passed.
- `npm run typecheck`: passed.
- `npm run db:authoring:smoke`: passed.
- No provider call, Redis dependency, raw API response, or legacy session/game table was added to Task 1.

## Task 2 verification

- `npm test -- src/__tests__/authoring/generation/provider.test.ts`: 11 tests passed.
- `npm test -- src/__tests__/authoring`: 9 files, 98 tests passed.
- `npm run typecheck`: passed.
- Provider tests inject a fake client; no external LLM request was made.

## Task 3 verification

- `npm test -- src/__tests__/authoring/generation/stages.test.ts`: 4 tests passed.
- `npm test -- src/__tests__/authoring`: 10 files, 102 tests passed.
- `npm run typecheck`: passed.
- Graph generation does not emit final node bodies; structural validation and node-context generation remain Task 4 work.

## Task 4 verification

- `npm test -- src/__tests__/authoring/generation/node-context.test.ts`: 4 tests passed.
- `npm test -- src/__tests__/authoring`: 11 files, 106 tests passed.
- `npm run typecheck`: passed.
- `npm run db:authoring:smoke`: passed.
