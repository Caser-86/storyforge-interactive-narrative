# StoryForge Phase 0 Verification Record

- Date: 2026-08-19
- Branch: `codex/storyforge-phase-0`
- Runtime: Node `v24.18.0`, npm `11.16.0`
- Remote GitHub Actions: not executed from this environment.
- Local runtime smoke check: `GET /api/health` returned HTTP `200`.

## Final Dependency Set

- `next`, `@next/env`, and `eslint-config-next`: `16.3.1`
- `postcss`: `8.5.23` through the existing Next override
- `sharp`: `0.35.3`
- `nanoid`: `3.3.18`
- `ioredis`: `5.10.1`

The upgrade remains within Next 16 and is the smallest audited release line that removes the production `next`, `sharp`, and `postcss` findings reported against `16.2.10`.

## CI Configuration

All non-database CI jobs run under Node 24 with:

```text
DISABLE_REDIS=true
ENABLE_IMAGE_GENERATION=false
IMAGE_PROVIDER=mock
MOCK_LLM=true
OPENAI_API_KEY=sk-test-mock
```

The database smoke job remains PostgreSQL-backed and uses `DISABLE_REDIS=true`. This supersedes older statements that CI was unchanged.

## Commands And Evidence

Required verification environment:

```powershell
$env:DISABLE_REDIS='true'; $env:ENABLE_IMAGE_GENERATION='false'; $env:IMAGE_PROVIDER='mock'; $env:MOCK_LLM='true'; $env:OPENAI_API_KEY='sk-test-mock'; npm run verify
```

Required production dependency audit:

```powershell
npm audit --omit=dev --json
```

Observed after the lockfile update: exit code `0`; `0` vulnerabilities, including `0` high and `0` critical; `178` production dependencies.

Installed-tree Redis proof:

```powershell
npm ls ioredis --json
```

Observed: exit code `0`; root `ioredis` and `bullmq@5.76.9` both resolve `ioredis@5.10.1`.

Focused regressions before the install retry:

```powershell
$env:DISABLE_REDIS='true'; $env:ENABLE_IMAGE_GENERATION='false'; $env:IMAGE_PROVIDER='mock'; $env:MOCK_LLM='true'; $env:OPENAI_API_KEY='sk-test-mock'; npm test -- src/__tests__/asset-worker-startup.test.ts src/__tests__/asset-queue-types.test.ts src/__tests__/sqlite-query-errors.test.ts
```

Observed: exit code `0`; `3` files and `10` tests passed. The worker exits before database/Redis startup when disabled; worker retry options use `maxRetriesPerRequest: null`; SQLite query-error tests use `:memory:` and verify `data/storyforge.sqlite` is unchanged.

## Fresh Install And Full Gate Status

The clean install completed through the npm mirror because the default registry connection stalled while fetching the three large platform tarballs:

```powershell
$env:npm_config_registry='https://registry.npmmirror.com'; npm ci --no-audit --no-fund
```

Observed: exit code `0`; `534` packages added in `25s` on Node `v24.18.0` / npm `11.16.0`.

The final gate then ran with Redis, image generation, and LLM calls disabled or mocked:

- `npm run verify`: exit code `0`; typecheck passed, lint passed with one existing Next navigation warning, `31` test files and `245` tests passed, and the Next `16.3.1` production build completed successfully.
- `npm audit --omit=dev --json`: exit code `0`; `0` vulnerabilities, including `0` high and `0` critical.
- `npm ls ioredis --json`: exit code `0`; root and `bullmq@5.76.9` both resolve `ioredis@5.10.1`.
- `GET http://localhost:3000/api/health`: HTTP `200`; SQLite `ok`, Redis `disabled`, and mock LLM/image providers active.

## Residual Concerns

- The default npm registry remains slow for the large Next/SWC/sharp tarballs on this host; use the mirror command above when reproducing the clean install locally.
- The one remaining lint warning is the existing `window.location.href` warning in `src/components/error-boundary.tsx`; it is non-fatal and does not block the gate.
- Remote GitHub Actions remain unexecuted.

## Phase 1 Manual Authoring Closed Loop

- Date: 2026-08-21
- Branch: `codex/storyforge-phase-0`
- Scope: provider-free private authoring flow; no auth, LLM, images, Redis, or legacy session-table reuse.
- Final Phase 1 code head: `3af5487`.

The Phase 1 loop now covers project creation, finite graph editing and validation, immutable snapshot sealing, reader-safe preview, standalone HTML export, and offline story playback. The authoring tables are isolated from the legacy game/session tables, and snapshot restore creates a new draft instead of mutating historical snapshot rows.

Required local verification environment:

```powershell
$env:DISABLE_REDIS='true'; $env:ENABLE_IMAGE_GENERATION='false'; $env:IMAGE_PROVIDER='mock'; $env:MOCK_LLM='true'; $env:OPENAI_API_KEY='sk-test-mock'
```

Commands and observed results:

- `npm run verify`: exit code `0`; typecheck passed, lint passed with the one pre-existing `src/components/error-boundary.tsx` navigation warning, `38` test files and `320` tests passed, and the Next production build completed successfully.
- `npm run db:authoring:smoke`: exit code `0`; authoring migrations were initialized twice, a project was created/read/deleted, and the temporary SQLite database was cleaned up.
- `npm audit --omit=dev --json`: exit code `0`; `0` vulnerabilities, including `0` high and `0` critical.
- `$env:PLAYWRIGHT_CHROME_CHANNEL='chrome'; npm run test:e2e -- e2e/authoring-manual-flow.spec.ts`: exit code `0`; `1` test passed. The test edits a release-sized graph, seals a snapshot, previews it, exports an HTML file, opens it through `file://` with network requests blocked, exercises back/restart, reaches an ending offline, and repeats navigation with all Storage methods throwing to verify the in-memory fallback.

The Playwright config defaults to its managed Chromium when available. This host did not have the bundled executable, so the browser verification used the installed Chrome channel through `PLAYWRIGHT_CHROME_CHANNEL=chrome`; the initial managed-browser download attempt was interrupted after stalling. Generated `test-results/` output is local-only and is not part of the implementation.

## Phase 1 Remaining Risks

- Remote GitHub Actions were not executed from this environment.
- The existing `window.location.href` lint warning in `src/components/error-boundary.tsx` remains outside the Phase 1 authoring change set.
- Phase 1 intentionally stops at manual text authoring. Provider-backed generation, editor UI, quality-loop workflows, release packaging, and legacy-flow retirement remain in later phases.

# StoryForge Phase 1 Task 6 Verification Record

- Date: 2026-08-21
- Scope: sealed reader-safe snapshot export to standalone HTML plus manual closed-loop E2E.
- Legacy flow status: untouched by Task 6; no legacy UI routes or game endpoints were modified.
- Offline file status: passed; the exported HTML was saved to a temporary file and opened through `file://` in a separate browser context with non-file requests blocked.
- Browser note: the bundled Playwright Chromium executable was missing on this host. The initial E2E attempt exited `1` before the test body; `playwright.config.ts` now uses the installed Chrome channel.

## Task 6 Commands And Evidence

Initial TDD red run:

```powershell
npm test -- src/__tests__/authoring/export-html.test.ts
```

Observed before implementation: exit code `1`; Vitest could not import `@/lib/authoring/export-html`, the expected missing-module failure.

Focused exporter and route tests:

```powershell
npm test -- src/__tests__/authoring/export-html.test.ts
```

Observed final result: exit code `0`; `1` test file and `10` tests passed.

Phase 1 authoring suite:

```powershell
npm test -- src/__tests__/authoring
```

Observed at the Task 6 checkpoint: exit code `0`; `7` test files and `73` tests passed. The final authoring suite passed `74` tests after the release-gap regressions were added, and the final full gate passed `320` tests.

Named manual closed-loop E2E:

```powershell
$env:PLAYWRIGHT_CHROME_CHANNEL='chrome'; npm run test:e2e -- e2e/authoring-manual-flow.spec.ts
```

Observed final result: exit code `0`; `1` test passed. The E2E created a project, replaced and edited an 8-node/2-ending draft graph, sealed a snapshot, previewed it, downloaded the HTML, loaded it offline from `file://`, exercised back/restart/choice transitions, verified Storage failure fallback, and reached an ending without network requests.

Typecheck:

```powershell
npm run typecheck
```

Observed final result: exit code `0`; `tsc --noEmit` completed successfully.

## Task 6 Residual Concerns

- Playwright `test-results/` output is generated locally and is not part of the implementation.
- The local Playwright browser download from `npx playwright install chromium` was slow/stalled on this host, so E2E now depends on an installed Chrome channel.
- The final scoped code review approved the release-floor, frozen-snapshot-limit, and offline-storage fixes with no Critical, Important, or Major findings.

## Phase 2 Generation Pipeline Verification

- Date: 2026-08-21
- Scope: persisted staged generation from brief through continuity review; private local controls; no login layer; image generation unchanged.
- Provider evidence: all automated generation tests used a deterministic fake provider. No real DeepSeek request was made during this verification.

Commands and observed results:

- `npm test -- src/__tests__/authoring/generation`: exit code `0`; `7` files and `41` tests passed.
- `npm test -- src/__tests__/authoring`: exit code `0`; `13` files and `115` tests passed at the API checkpoint.
- `npm test`: exit code `0`; `45` files and `361` tests passed during the project gate.
- `npm run typecheck`: exit code `0`.
- `npm run lint`: exit code `0`; one existing warning remains in `src/components/error-boundary.tsx`; no new generation warning remains.
- `npm run build`: exit code `0`; Next `16.3.1` production build completed and lists the three generation routes.
- `npm run db:authoring:smoke`: exit code `0`.
- `npm run authoring:llm:smoke -- --preset micro --dry-run`: exit code `0`; target `8` nodes, `2` endings, maximum `13` provider calls, model/base URL printed, key redacted, and no provider client/network request created.
- `npm run test:e2e -- e2e/authoring-generation-flow.spec.ts`: exit code `0`; `1` test passed using `GENERATION_PROVIDER=fake`. The E2E created a project, started generation, paused/resumed, completed all `8` node steps, and verified progress equality and raw-response redaction.

The Phase 2 implementation now includes generation run/step/candidate persistence, lease reclaim, capped retry, structured provider errors, stable-ID planning stages, structural precheck, bounded node context, warning-only continuity review, private control APIs, and persisted run metrics. The real DeepSeek path is configured through `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`; the smoke command intentionally does not call it.

## Phase 2 Remaining Risks

- The fixed-provider E2E validates the resumable state machine without an external network dependency; a real-key smoke has not been executed in this environment.
- Generation is currently controlled through API endpoints; a dedicated authoring UI for generation progress and review remains a later phase.
- Remote GitHub Actions were not executed from this environment.

## Phase 3 Authoring Editor Verification

- Date: 2026-08-21
- Scope: project library, brief creation, resumable generation UI, three-pane editor, revision-safe node and choice editing, downstream review marking, protected AI candidates, and sealed-snapshot preview.
- Commits: `ade31fa`, `4aeea71`, `521e572`, `dfb0a9f`, `f1aabcc`, `2b05128`.

Commands and observed results:

- `npm test`: exit code `0`; `53` test files and `382` tests passed.
- `npm run typecheck`: exit code `0`; `tsc --noEmit` completed successfully after the production build regenerated `.next/types`.
- `npm run lint`: exit code `0`; one existing warning remains in `src/components/error-boundary.tsx`; no new Phase 3 warning remains.
- `npm run build`: exit code `0`; production build lists `/projects/[projectId]/edit`, `/projects/[projectId]/generate`, and `/projects/[projectId]/preview`, plus node regeneration and candidate routes.
- `npm run test:e2e -- e2e/authoring-editor-flow.spec.ts`: exit code `0`; `1` test passed in `20.6s`. The main worktree already had a user-owned `next dev` process, so the same commit was checked out into a temporary isolated worktree with a junction to the existing `node_modules`; the test created a project, edited a choice, verified stale candidate rejection, sealed a snapshot, and reached an ending in the browser. The user-owned process was not stopped.

Phase 3 implementation evidence includes component tests for project library, brief form, generation progress, outline tree, autosave, node editing, impact analysis, candidate persistence, and preview choice-to-ending behavior. The Phase 3 gate is green; the existing `error-boundary.tsx` navigation warning and unexecuted remote CI remain known non-blocking residual risks.

## Phase 4 Quality Loop Verification

- Date: 2026-08-21
- Scope: persisted validation runs/issues, deterministic quality rules, non-destructive AI continuity review, revision-bound release gate, issue UI, release checklist, and node/edge path coverage.
- Commits: `96162e2`, `dc65549`, `01a9cc0`, `162bc86`, `d0245d1`, `faa0939`.
- AI evidence: tests use the deterministic fake provider; no real DeepSeek request was made during automated verification. AI findings are constrained to warning severity and provider edit fields are rejected by schema.

Commands and observed results:

- `npm test`: exit code `0`; `60` test files and `401` tests passed.
- `npm run typecheck`: exit code `0`; `tsc --noEmit` completed successfully.
- `npm run lint`: exit code `0`; no errors, with the one pre-existing `src/components/error-boundary.tsx` navigation warning.
- `npm run build`: exit code `0`; Next `16.3.1` production build completed and includes `/api/projects/[projectId]/validate`, `/api/projects/[projectId]/validation/[issueId]`, snapshot/export routes, and authoring pages.
- `npm run test:e2e -- e2e/authoring-quality-flow.spec.ts`: exit code `0`; `1` test passed in `29.1s`. The browser flow creates cycle/dead-end blocking issues, dismisses a selected warning with confirmation, detects stale draft revision, revalidates, seals a snapshot, and reaches an ending.
- `npx playwright install chromium`: exit code `0`; managed Chromium and headless shell installed under the local Playwright cache. E2E uses `NEXT_DIST_DIR=.next-playwright` so the isolated server does not contend with the user-owned port 3000 dev server.

The release gate is now the sole authorization path for snapshot/export actions. If no validation exists, it bootstraps structural/rule validation; after a validation exists, any changed draft revision returns `CONFLICT` until revalidated. Blocking issues cannot be dismissed, warning evidence is preserved, and path coverage reports uncovered node/edge IDs after capped enumeration.

## Phase 4 Residual Risks

- Remote GitHub Actions were not executed from this environment.
- The real DeepSeek network path was not exercised in automated tests; provider wiring remains configured through the existing environment variables.
- The existing `window.location.href` lint warning in `src/components/error-boundary.tsx` remains outside this Phase 4 change set.

## Phase 5 Local Release Gate

- Date: 2026-08-21
- Scope: private local authoring product, persisted recovery, quality gate, offline export, legacy read-only export, and clean-install release verification.
- Secrets: no real API key is recorded in this document. Automated checks use `OPENAI_API_KEY=sk-test-mock` and `GENERATION_PROVIDER=fake`.
- Remote CI: workflow changes are committed but GitHub Actions were not executed from this environment.

### Coverage Matrix

| Coverage row | Evidence | Status |
| --- | --- | --- |
| Project backup and new-ID restore | `src/__tests__/authoring/backup.test.ts`, `src/__tests__/authoring/backup-api.test.ts`, `e2e/authoring-release-flow.spec.ts` | pending final clean gate |
| Migration backup integrity and retention | `src/__tests__/authoring/database-backup.test.ts`, `npm run db:authoring:backup` | pending final clean gate |
| Metrics survive restart and cost stays null without prices | `src/__tests__/authoring/metrics.test.ts` | pending final clean gate |
| Offline HTML with private fields excluded | `src/__tests__/authoring/export-private-fields.test.ts`, `e2e/authoring-offline-export.spec.ts` | pending final clean gate |
| Local-only health and loopback startup | `src/__tests__/authoring/local-security.test.ts`, `src/__tests__/api-health.test.ts` | pending final clean gate |
| Legacy sessions remain exportable | `src/__tests__/legacy-export.test.ts`, `npm run legacy:export -- --dry-run` | pending final clean gate |
| Full authoring browser loop | `e2e/authoring-release-flow.spec.ts` | passed locally |

The rows will be updated with exact clean-directory counts, durations, Node/npm versions, and the migration version after the clean release gate completes. A row is not marked complete merely because a focused test passed in the existing worktree.
