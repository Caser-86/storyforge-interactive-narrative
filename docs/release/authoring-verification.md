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
