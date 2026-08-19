# StoryForge Formalization Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert StoryForge from an instant-play prototype into a reliable, local, single-author interactive story creation tool with finite AI-generated stories, editing, validation, preview, snapshots, backup, and offline HTML export.

**Architecture:** Keep the current Next.js repository but create a separate authoring domain and API under `src/lib/authoring` and `src/app/api/projects`. Deliver six gated phases; each phase produces independently testable software and may start only after the previous gate passes. The legacy game flow remains isolated until the replacement workflow passes its complete E2E gate.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Zod 3, SQLite through `better-sqlite3`, OpenAI-compatible DeepSeek API, Vitest, Playwright, npm.

**Spec:** `docs/superpowers/specs/2026-08-19-storyforge-local-authoring-platform-design.md`

## Global Constraints

- The app is local-only, single-author, and has no authentication or cloud synchronization.
- Bind authoring services to `127.0.0.1` by default; warn before any non-loopback binding.
- Text only: no image, audio, Redis, BullMQ, object storage, or asset worker in the new path.
- Stories are finite directed acyclic graphs with exactly one start node and at least one ending.
- Every reachable node must be able to reach an ending; blocking violations prevent snapshots and export.
- Story size is limited to 8-80 nodes and 2-10 endings in the first release.
- Exported HTML is self-contained, offline, network-free, plain-text-safe, and contains no API keys, prompts, generation logs, or internal notes.
- AI failures must remain visible and resumable; never substitute canned fallback prose.
- Author-modified prose is never overwritten without explicit confirmation.
- Use npm as the sole package manager and commit `package-lock.json`; do not commit pnpm workspace or lock files.
- Standardize development, CI, and Docker on Node.js 24 and declare the supported version in `package.json` and `.node-version`.
- Follow test-driven development: every behavior task begins with a failing focused test.
- Read the relevant Next.js 16 guide in `node_modules/next/dist/docs/` before modifying route, rendering, caching, environment, or testing behavior.
- Do not delete the legacy flow until Phase 5 migration and E2E gates pass.

---

## Plan Set

| Order | Plan | Deliverable | Start Gate |
| --- | --- | --- | --- |
| 0 | `2026-08-19-storyforge-phase-0-engineering-baseline.md` | Reproducible npm/Node environment and green quality gates | Approved design |
| 1 | `2026-08-19-storyforge-phase-1-minimum-closed-loop.md` | Manual project graph, validation, snapshot, preview, offline HTML | Phase 0 green |
| 2 | `2026-08-19-storyforge-phase-2-generation-pipeline.md` | Resumable staged DeepSeek full-draft generation | Phase 1 green |
| 3 | `2026-08-19-storyforge-phase-3-authoring-editor.md` | Project library and three-pane authoring editor | Phase 2 green |
| 4 | `2026-08-19-storyforge-phase-4-quality-loop.md` | Structural/content review and release gate | Phase 3 green |
| 5 | `2026-08-19-storyforge-phase-5-local-release.md` | Backup/restore, cost view, offline E2E, legacy retirement | Phase 4 green |

## Dependency Graph

```text
Phase 0 Engineering baseline
  -> Phase 1 Domain + manual closed loop
      -> Phase 2 Persistent generation pipeline
          -> Phase 3 Authoring editor
              -> Phase 4 Quality and snapshot gate
                  -> Phase 5 Local release and legacy retirement
```

No phase may be implemented in parallel with an unmet predecessor because schemas, repository interfaces, and route contracts are intentionally stabilized in sequence.

## Shared File Map

### Existing files retained and hardened

- `package.json`: npm scripts, Node engine, dependency cleanup, release commands.
- `package-lock.json`: sole dependency lock.
- `.github/workflows/ci.yml`: Node 24 and phase-appropriate quality gates.
- `Dockerfile`: Node 24 build consistency until Docker is retired or retained as a development option.
- `next.config.ts`: loopback-oriented local defaults and removal of image configuration after legacy retirement.
- `src/lib/db/sqlite.ts`: legacy SQLite error propagation during transition.
- `src/app/layout.tsx`: creator-product metadata and shell.
- `src/app/page.tsx`: replaced by the project library only in Phase 3.

### New authoring server domain

- `src/lib/authoring/schemas.ts`: all authoring Zod schemas and inferred types.
- `src/lib/authoring/errors.ts`: stable domain error codes.
- `src/lib/authoring/database.ts`: authoring SQLite connection, WAL, migrations, and transactions.
- `src/lib/authoring/migrations.ts`: append-only authoring migration definitions.
- `src/lib/authoring/repository.ts`: project/version/chapter/node/edge persistence API.
- `src/lib/authoring/graph.ts`: graph construction, traversal, topology, and invariants.
- `src/lib/authoring/impact.ts`: downstream review impact calculation.
- `src/lib/authoring/runtime.ts`: deterministic preview state transitions.
- `src/lib/authoring/snapshots.ts`: immutable version creation and restoration.
- `src/lib/authoring/export-html.ts`: self-contained HTML renderer.
- `src/lib/authoring/backup.ts`: versioned project backup and restore.
- `src/lib/authoring/generation/*`: stage contracts, prompts, provider, executor, leases, candidates.
- `src/lib/authoring/validation/*`: structural, rule, AI review, issue persistence, release gate.
- `src/lib/authoring/metrics.ts`: persisted token, latency, retry, and estimated-cost aggregates.

### New API surface

- `src/app/api/projects/route.ts`: list and create projects.
- `src/app/api/projects/[projectId]/route.ts`: read, edit, archive, and delete one project.
- `src/app/api/projects/[projectId]/duplicate/route.ts`: duplicate a complete project into a new draft identity.
- `src/app/api/projects/[projectId]/graph/route.ts`: atomic graph read and edit.
- `src/app/api/projects/[projectId]/generation/route.ts`: create and list generation runs.
- `src/app/api/projects/[projectId]/generation/[runId]/route.ts`: read, pause, resume, cancel.
- `src/app/api/projects/[projectId]/generation/[runId]/next/route.ts`: lease and execute the next bounded step.
- `src/app/api/projects/[projectId]/validate/route.ts`: run and read validation.
- `src/app/api/projects/[projectId]/snapshots/route.ts`: create and list snapshots.
- `src/app/api/projects/[projectId]/preview/route.ts`: return a sealed runtime payload.
- `src/app/api/projects/[projectId]/export/html/route.ts`: download offline HTML.
- `src/app/api/projects/[projectId]/backup/route.ts`: download project backup.
- `src/app/api/projects/import/route.ts`: validate and import a project backup.
- `src/app/api/projects/[projectId]/metrics/route.ts`: local generation metrics.

### New UI surface

- `src/app/(authoring)/page.tsx`: server-rendered project library shell.
- `src/app/(authoring)/projects/new/page.tsx`: project brief form.
- `src/app/(authoring)/projects/[projectId]/generate/page.tsx`: resumable generation progress.
- `src/app/(authoring)/projects/[projectId]/edit/page.tsx`: three-pane editor shell.
- `src/app/(authoring)/projects/[projectId]/preview/page.tsx`: deterministic preview.
- `src/features/authoring/*`: focused client components and API adapters.

## Phase Gates

### Gate 0: Engineering trust

Run:

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: all commands exit 0 on Node 24 with no Redis service and no paid LLM call.

### Gate 1: Manual closed loop

Run:

```powershell
npm run test -- src/__tests__/authoring
npm run test:e2e -- e2e/authoring-manual-flow.spec.ts
```

Expected: a fixture project can be created, edited, validated, snapshotted, previewed to an ending, exported, and opened offline.

### Gate 2: Generation reliability

Run:

```powershell
npm run test -- src/__tests__/authoring/generation
npm run test:e2e -- e2e/authoring-generation-flow.spec.ts
npm run authoring:llm:smoke -- --preset micro --dry-run
```

Expected: fixed-provider generation completes; failure/restart resumes without duplicate steps; dry-run reports exact planned calls and performs no network request.

### Gate 3: Editing safety

Run:

```powershell
npm run test -- src/__tests__/authoring/editor
npm run test:e2e -- e2e/authoring-editor-flow.spec.ts
```

Expected: auto-save, stale revision rejection, downstream review marking, and candidate apply/discard all behave deterministically.

### Gate 4: Quality release gate

Run:

```powershell
npm run test -- src/__tests__/authoring/validation
npm run test:e2e -- e2e/authoring-quality-flow.spec.ts
```

Expected: blocking issues prevent snapshots/export; warnings can be resolved or dismissed; sealed snapshots revalidate before export.

### Gate 5: Local release

Run:

```powershell
npm run verify
npm run test:e2e:authoring
npm run db:authoring:smoke
npm run db:authoring:backup
```

Expected: all gates pass from a clean install; backup round-trip succeeds; exported HTML completes a path with the StoryForge server stopped and networking blocked.

## Specification Coverage Matrix

| Spec section | Required implementation | Plan / tasks |
| --- | --- | --- |
| 1-3 Position, goals, non-goals | Creator metadata, local-only docs, removal of public/asset path | Phase 3 Tasks 1-2; Phase 5 Tasks 5-6 |
| 4 Product principles | DAG validator, resumable runs, no fallback, candidate apply, shared runtime | Phase 1 Tasks 3-6; Phase 2 Tasks 3-7; Phase 3 Task 6 |
| 5 Story sizes | Preset schemas and form limits | Phase 1 Task 1; Phase 3 Task 2 |
| 6 Architecture | Separate domain, repository, validator, runtime, exporter, bounded executor | Phase 1 Tasks 1-6; Phase 2 Tasks 1-7 |
| 7 Domain model | Authoring migrations and repository | Phase 1 Tasks 1-2; Phase 2 Tasks 1-2; Phase 4 Task 1 |
| 8 Graph invariants | Pure graph validation and fixtures | Phase 1 Task 3 |
| 9 Generation pipeline | Stage schemas, prompts, provider, executor, continuity review, review transition | Phase 2 Tasks 1-7 |
| 10 Editing semantics | Three-pane editor, revision checks, impact marking, candidates | Phase 3 Tasks 1-6 |
| 11 Quality gate | Blocking/warning issue system and release gate | Phase 4 Tasks 1-5 |
| 12 Preview runtime | Shared deterministic runtime and path coverage | Phase 1 Task 5; Phase 4 Task 6 |
| 13 HTML export | Safe standalone renderer and offline E2E | Phase 1 Task 6; Phase 5 Task 4 |
| 14 Local security | Loopback startup, secret exclusion, no asset dependency | Phase 0 Task 4; Phase 5 Tasks 4-6 |
| 15 Error/recovery | Error taxonomy, leases, retries, migrations, backups | Phase 0 Tasks 2-4; Phase 2 Tasks 3-7; Phase 5 Tasks 1-2 |
| 16 Observability/cost | Persisted generation metrics and cost config | Phase 2 Task 6; Phase 5 Task 3 |
| 17 Testing | Unit, integration, contract, E2E, manual smoke | All phase gates; Phase 5 Task 7 |
| 18 Delivery phases | Sequential plans and gates | This master plan |
| 19 Acceptance | Final clean-install release checklist | Phase 5 Task 7 |
| 20 Future extensions | Architecture boundary and non-goal regression checks | Phase 5 Task 6 |

## Execution Protocol

- Execute child plans in numeric order.
- Complete one task and its focused tests before starting the next task.
- Commit only files listed in that task; never include existing unrelated worktree files.
- At every phase gate, record command, exit code, test count, and known residual risk in `docs/release/authoring-verification.md`.
- If a planned interface must change, update this master plan and every downstream child plan before implementing the change.
- If three fixes fail against one task, stop and re-evaluate the design boundary instead of stacking another patch.
- Preserve the legacy flow and database tables until Phase 5 explicitly removes them after migration/export verification.

## Master Completion Checklist

- [ ] Phase 0 gate passes and is recorded.
- [ ] Phase 1 gate passes and is recorded.
- [ ] Phase 2 gate passes and is recorded.
- [ ] Phase 3 gate passes and is recorded.
- [ ] Phase 4 gate passes and is recorded.
- [ ] Phase 5 gate passes and is recorded.
- [ ] Every row in the specification coverage matrix has a passing automated or documented manual acceptance check.
- [ ] Clean-install instructions reproduce the final app on a second local directory.
- [ ] The final exported HTML is verified offline with the application stopped.
- [ ] The legacy instant-play and image paths are absent from the default UI, build, health check, and documentation.
