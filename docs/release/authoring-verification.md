# StoryForge Authoring Release Verification

- Date: 2026-08-24
- Published release: `v0.1.4`
- GitHub Release: https://github.com/Caser-86/storyforge-interactive-narrative/releases/tag/v0.1.4
- Release notes: `CHANGELOG.md`
- Runtime: Node `v24.18.0`, npm `11.16.0`
- Scope: private local text authoring, bounded generation, graph editing, quality gate, snapshots, offline export, V2 backup/restore, bounded interactive sessions, project/session lifecycle controls, and legacy read-only export.
- Remote CI: PR #1 targeted `master`; `CI/verify` and `CI/e2e-authoring` passed before merge. Tag run `32687684469` passed on `v0.1.4` at merged commit `e175f84467af1ff9383c023121969be844fd13fa`.

## v0.1.7 Completion Hardening Candidate (Not Published)

- Date: 2026-09-04
- Source branch: `codex/branch-writing-v0.1.5`
- Candidate tag: `v0.1.7` is the earlier feature-branch candidate; the current working tree contains additional unreleased audit hardening and has no new tag or GitHub Release.
- Scope: author-created branch scene and ending editing, one atomic graph write with revision protection, interactive-path budget reservation, generation restart and polling UX, duplicate graph ID validation, validation boundaries, Windows E2E cleanup reliability, and in-flight editor input preservation.
- Local candidate gate: `npm run verify` passed with 72 Vitest files / 302 tests; `npm run test:e2e:authoring` passed 12/12 in 39.1s.
- Provider configuration dry-run: `npm run authoring:llm:smoke -- --dry-run` passed with model `doubao-seed-evolving` and `networkRequest: false`.
- Release status: branch candidate only. Merge review, protected-branch CI, canonical-branch tag, GitHub Release, clean Windows account install evidence, and code signing remain human gates.

## 2026-09-08 Current Worktree Audit Evidence (Not Published)

> This section is the 2026-09-08 snapshot. The 2026-09-09 addenda below supersede its live-model statements where they differ.

- Source branch: `codex/branch-writing-v0.1.5`; changes are uncommitted in the current working tree. No tag was moved or created.
- `npm run verify`: exit code `0`; `84` Vitest files and `394` tests passed, with typecheck, lint, and Next production build. The current run also covers queued interactive jobs that expire before reclamation, provider default alignment, Docker data-directory permissions, provider credential redaction, standalone artifact credential scanning, gated live-evaluation CLI parameters, interactive schema-drift retry, current history status synchronization, materialized history status synchronization, provider error-category diagnostics, the fake-provider visibility warning, explicit interactive-session deep-link restoration, unknown token-usage budget protection, the non-final prompt contract, high-priority thread retention during memory overflow, non-final ending repair, risk-choice repair, and Zod schema error classification.
- `npm run test:e2e:authoring`: exit code `0`; `16/16` authoring Playwright tests passed using the fake provider, including the isolated cross-origin browser write rejection and 390 px long unbroken scene-body overflow check.
- `npm run interactive:evaluate -- --provider fake`: exit code `0`; `3/3` bounded interactive fixtures passed for 6/8/16 turns, multiple genres, and low/medium/high risk paths without network access. This is a fake-provider contract gate, not real-model narrative evidence.
- `npm run interactive:evaluate -- --provider live --dry-run`: exit code `0`; planned the same 3 fixtures with `networkRequest=false`, without making paid model calls.
- Real-model review template: [`interactive-evaluation-review.md`](interactive-evaluation-review.md); the automated structural portion is recorded in the 2026-09-09 addendum, while the four-dimension human semantic scoring remains open.
- Controlled live runner: one fixture is allowed only with `--allow-network --approve-paid-calls --fixture <id>`; the 2026-09-08 snapshot itself made no live call.
- CI workflow static check: `.github/workflows/ci.yml` runs the offline interactive evaluation in the `verify` job, checks PowerShell 7.x in the Ubuntu verify and Windows standalone jobs, and declares separate Windows standalone/native SQLite and Linux Docker build/health jobs; a remote run for the current uncommitted worktree SHA is not yet available.
- `npm run db:interactive:benchmark`: exit code `0`; the temporary database benchmark compares full interactive history reads with summary pagination for `100/16` and `1000/40` scenarios.
- `npm run package:standalone`: exit code `0`; standalone package version `0.1.7` generated.
- Local temporary-root package smoke: exit code `0`; clean install, health, upgrade, failed upgrade, rollback, and uninstall-preserves-data passed; the temporary root was removed afterward.
- `npm run db:authoring:restore-check -- --latest`: exit code `0`; the latest checkpoint restored in a temporary copy with migration version `13` and a readable graph; the default author database was not modified.
- `npm run authoring:doctor`: exit code `0`; database integrity, migration, writability, loopback binding, and provider configuration are healthy, and backup freshness is `fresh` after the new checkpoint.
- `npm run db:authoring:smoke`: exit code `0`; isolated SQLite initialization, migration idempotency, project persistence, and deletion passed.
- `npm run authoring:llm:smoke -- --dry-run`: exit code `0`; configured model `doubao-seed-evolving` resolved without a network request.
- `npm run release:evidence`: exit code `0`; independently rescanned the standalone package, which had `2260` text files and `secretFindings: 0`; package file count `2264`, `secretsIncluded: false`, `signed: false`.
- Dependency audit: `npm audit --omit=dev --audit-level=high` and full `npm audit --audit-level=high` both exit `0` with `0 vulnerabilities`; the current lockfile uses `next@16.3.4`, `sharp@0.35.4`, and `vitest@4.1.11`.
- Production runtime smoke: a standalone server ran against an isolated temporary SQLite directory with `GENERATION_PROVIDER=fake` on loopback `127.0.0.1:3201`; `GET /api/health` and `GET /api/projects` both returned `200`, then the process and temporary directory were cleaned up.
- Docker build: passed in an isolated Compose project after the Docker Desktop Linux engine became available. `docker compose -p storyforge-docker-smoke build --progress plain` exited `0`; the production image completed the Next build. The first container smoke exposed a CRLF shebang failure in `docker-entrypoint.sh` (`exec /app/docker-entrypoint.sh: no such file or directory`); the script was normalized to LF and `.gitattributes` now enforces `*.sh text eol=lf`.
- `npx vitest run src/__tests__/interactive/process-recovery.test.ts`: exit code `0`; an isolated SQLite child process claimed and exited, then a second child process reclaimed the expired lease and completed the job as attempt 2.
- 2026-09-09 Docker recheck: `docker desktop status` reported `running`; `docker version` and `docker info` succeeded on context `desktop-linux` (Docker Desktop `4.88.0`, Engine `29.7.2`). A fresh isolated container reached `Up (healthy)`, and `GET http://127.0.0.1:3210/api/health` returned `HTTP 200` with persistent SQLite storage. The smoke container, network, named volume, and test image were removed afterward; no user containers or data were touched.
- `npx vitest run src/__tests__/interactive/process-recovery.test.ts`: exit code `0`; an isolated SQLite child process claimed and exited, a second child process reclaimed the expired lease and completed the job as attempt 2, and a short cross-process writer-lock check passed within `busy_timeout`.
- `npx vitest run src/__tests__/interactive/interactive-player.test.tsx`: exit code `0`; 21 component tests passed, including keyboard focus recovery after the next scene, written-path refresh after a new turn, the ready-scene screen-reader announcement, explicit interactive-session deep links, and explicit fake-provider labeling.
- Remaining human/remote gates: real-model semantic narrative scoring, clean Windows account install, Docker target environment, protected-branch CI, merge, new canonical tag, and GitHub Release approval.

## 2026-09-09 Current Worktree Recheck

- `npm run verify`: exit code `0`; TypeScript, lint, 84 test files/403 tests, and the Next.js production build passed.
- `npm run test:e2e:authoring`: exit code `0`; 16/16 authoring flows passed, including the interactive author path, recovery, cross-origin write rejection, mobile long-text wrapping, and release flow.
- Docker Desktop path recheck: an isolated Compose project built from the current worktree with `APP_PORT=3215`, created a named `storyforge-data` volume, reached `healthy`, and returned HTTP 200 from `/api/health` with persistent SQLite. The smoke container, network, volume, and image were removed afterward. Docker reported `llm.status=not_configured` because no API key was injected into this isolated smoke; this was a container/storage check, not a live-model generation test.
- The Compose file continues to use a Docker named volume rather than a host absolute path. Docker Desktop's data-disk location is therefore controlled by Docker Desktop and does not require a project path change after moving storage to D:; `D:\.pnpm-store` remains absent.

## 2026-09-09 Manual Authoring Completion and Validation Recheck

- The manually driven authoring session for `雾港第七号档案` completed `8/8` turns with no session error and materialized the selected path into a reviewable draft version. This confirms the intended interaction shape: the author selects a direction, the model generates one following scene, and the author repeats the choice until the bounded ending.
- Full validation with `structural`, `rule`, and `ai_review` sources returned HTTP `200` and completed normally. AI review returned no findings. The release decision remains `allowed=false` for one explicit structural reason: the materialized path currently contains `1` ending while the project release gate requires at least `2`; 13 non-blocking repeated-prose warnings remain for author review.
- The latest local verification after the schema type-boundary fix passed 84 test files/403 tests, including the new provider-schema compatibility assertion.
- The first full validation attempt returned HTTP `500` because the provider used a compatible `warnings` response shape instead of canonical `passed`/`issues`. The schema boundary now normalizes that alias, and the same full validation path rechecked successfully with HTTP `200`; no key, raw prompt, or complete provider response was recorded.
- Next author action before release is to add a second distinct ending in the editor, then rerun validation and review the remaining prose warnings. The application does not auto-invent an ending to satisfy the gate.

## 2026-09-09 Runtime Quality Investigation

- A manual server was found running with the explicit test setting `GENERATION_PROVIDER=fake`. Its first three interactive calls succeeded but returned identical placeholder scenes with zero token usage; this was a test-provider result, not evidence of real-model quality or a provider timeout.
- The manual server was restarted with `GENERATION_PROVIDER=openai` while preserving the old session for diagnosis. No real model request was made during this investigation.
- The interactive page now displays a visible test-only warning whenever the fake provider is active; the behavior is covered by the 18-component-test run and the full authoring E2E suite.

## 2026-09-09 Live Runtime Addendum

- After explicit user authorization, the local `openai` provider produced a Chinese, premise-specific opening scene with three choices. The first next-scene request intermittently failed schema validation; the original scene remained available and the selected choice was released safely.
- The process-level override `OPENAI_MODEL=deepseek-v4-flash` was used for the controlled live runner; `.env.local` was not changed and its configured default remains `doubao-seed-evolving`.
- The latest single-call `npm run authoring:llm:smoke` passed with the same process-level model override; the redacted provider metrics were `inputTokens=216`, `outputTokens=116`, and `latencyMs=3013`.
- `zh-contemporary-6`: passed; 6/6 turns, 5 active scenes, selected risks `low -> medium -> high -> low -> high`, ending/choice/risk/consequence checks passed, `issueCodes=[]`.
- `zh-fantasy-8`: passed; 8/8 turns, 7 active scenes, selected risks `high -> low -> medium -> high -> low -> medium -> high`, ending/choice/risk/consequence checks passed, `issueCodes=[]`.
- `zh-suspense-16`: earlier controlled runs stopped at different turns with `GENERATION_UNKNOWN`/`GENERATION_SCHEMA` and `RISK_SEQUENCE`; field-level diagnosis identified an active scene missing one of the three risk levels. After separating provider field parsing from business contract validation and adding one bounded `choice-repair`, the current-code recheck passed 16/16 turns, 15 active scenes, the full expected risk sequence, ending/choice/risk/consequence checks, and `issueCodes=[]`. A later current-code trace also isolated post-provider failures from whitespace legacy memory and the immutable-memory `slice(-0)` capacity edge; after both fixes, the latest 16-turn rerun passed the same contract. This records model-output volatility, not a claim that every run is deterministic.
- These live reports contain only structured metrics and no raw prompt, complete response, API key, or secret: `output/evaluations/interactive-live-zh-contemporary-6.json`, `output/evaluations/interactive-live-zh-fantasy-8.json`, and `output/evaluations/interactive-live-zh-suspense-16.json`.
- The runner proves the bounded structure/path/consequence/ending contract. It does not award the required human 4/5 scores for fact consistency, foreshadowing recovery, or prose quality; the manual review gate remains open.

## 2026-09-09 Security and Environment Recheck

- Dependency remediation: `next` upgraded to `16.3.4`, the transitive `sharp` family to `0.35.4`, `vitest` to `4.1.11`, and `eslint-config-next` to `16.3.4`; both production-only and full `npm audit --audit-level=high` report `0 vulnerabilities`.
- `npm ci --dry-run --ignore-scripts`: exit code `0`; the updated package lock is installable without changing the working tree.
- Final post-upgrade verification: `npm run verify` exit code `0`, `84` Vitest files / `398` tests passed, and Next `16.3.4` production build completed; `npm run test:e2e:authoring` exit code `0`, `16/16` passed.
- Final post-upgrade packaging: `npm run package:standalone` exit code `0`; `npm run release:evidence` exit code `0`, with `packageFileCount=2264`, `secretsIncluded=false`, and `signed=false`.
- Final script-level gates: `npm run interactive:evaluate -- --provider fake` and `npm run authoring:evaluate -- --provider fake` both pass `3/3` without network access; `npm run db:authoring:smoke`, `npm run db:authoring:restore-check -- --latest`, and `npm run authoring:doctor` all exit `0`, with migration `13`, readable graph, fresh backup, writable SQLite, loopback binding, and configured provider.
- Final Docker recheck with the updated lockfile: isolated Compose build exit code `0`; container reached `Up (healthy)` and `GET http://127.0.0.1:3210/api/health` returned `HTTP 200` with persistent SQLite. The isolated container, volume, network, and image were removed afterward.
- The local service was restarted with the updated Next version at `http://127.0.0.1:3202`; `GET /api/health` returned `HTTP 200`, with `llm.status` reported as `configured`. The `.env.local` file was not changed.
- The budget-accounting recheck added a Provider `usageConfirmed` boundary: missing or invalid token usage is now recorded as `unknown` rather than `consumed=0`; the targeted provider/ledger tests and the full verification above passed.
- Final current-worktree recheck: `npm run interactive:evaluate -- --provider fake` and `npm run authoring:evaluate -- --provider fake` both passed `3/3`; an isolated Docker Compose build produced a healthy container and `GET /api/health` returned `200`. Temporary Docker resources were removed afterward.
- Final current-code live recheck: with process-level `OPENAI_MODEL=deepseek-v4-flash`, `zh-contemporary-6`, `zh-fantasy-8`, and `zh-suspense-16` each passed their full bounded path; the 16-turn sample passed `16/16` after the risk-choice repair change. The review remains structural evidence only; human semantic scores are still blank.
- 2026-09-09 boundary regression recheck: active scenes with zero choices and final scenes with a missing ending summary or leftover choices now enter the corresponding bounded repair path before strict normalization; a final repair that still returns an active scene is rejected. Targeted generator coverage passed 10/10 and the full verification passed 84 Vitest files / 398 tests.
- 2026-09-09 post-provider state recheck: whitespace-only legacy memory entries are ignored before structured-memory validation, preventing a valid provider response from failing during state merge. The generator regression coverage passed 11/11 in that run.
- 2026-09-09 memory-capacity recheck: when 20 immutable facts fill the memory bound, mutable facts are now dropped instead of overflowing the bounded array; the story-memory regression passed and the current full suite is 84 Vitest files / 398 tests.

## 2026-09-09 Author Ending Preview Recheck

- Added the bounded editor flow for author-directed endings: optional direction, model preview, explicit confirmation, and one atomic graph write. The existing seven-field manual form remains available under “手动填写（高级）”.
- Added the `POST /api/projects/:projectId/endings/generate` contract. Preview responses contain only validated ending fields and usage metadata; raw prompts and provider responses are not returned, and preview requests never mutate the graph.
- Targeted author-ending tests passed: `6/6` across the stage, route, and editor component. The route regression covers stale draft revisions and rejects ending nodes as generation sources.
- Current full verification passed: `npm run verify` exit code `0`, `86` Vitest files / `408` tests, and Next production build completed. `npm run test:e2e:authoring` passed `16/16`, including the new preview-confirm-save path and the retained advanced manual path.
- No commit, tag, or GitHub push was performed in this recheck; release actions remain subject to explicit human confirmation.

## 2026-09-10 Plan Gate Recheck

- `npm run verify`: exit code `0`; TypeScript, ESLint, `86` Vitest files / `408` tests, and the Next.js production build passed.
- `npm run test:e2e:authoring`: exit code `0`; all `16/16` authoring Playwright tests passed, including the author-selected path, ending preview confirmation, recovery, release gate, offline playback, cross-origin write rejection, and mobile long-text coverage.
- `npm run interactive:evaluate -- --provider fake`: exit code `0`; all `3/3` bounded 6/8/16-turn fixtures passed with `networkRequest=false`.
- `npm run authoring:evaluate -- --provider fake`: exit code `0`; all `3/3` structured fixtures passed with `networkRequest=false`.
- `npm run interactive:evaluate -- --provider live --dry-run`: exit code `0`; three live plans were listed with `networkRequest=false`; no paid model call was made.
- Runtime smoke: the local server on `127.0.0.1:3202` returned `status=ok`, version `0.1.7`, SQLite persistence, and configured LLM status; the project list was readable. The server used an isolated temporary database and did not modify the default author database.
- `npm run db:authoring:checkpoint`: exit code `0`; a new checkpoint reported `Integrity: ok`. `npm run db:authoring:restore-check -- --latest` then passed against a temporary copy with migration version `13` and a readable graph. `npm run authoring:doctor` returned `status=ok`, fresh backup, loopback-only binding, and configured provider.
- `npm audit --omit=dev --audit-level=high` and `npm audit --audit-level=high`: both exit code `0` with `0 vulnerabilities`.
- `npm run package:standalone` and `npm run release:evidence`: both exit code `0`; current release evidence reports `packageFileCount=2268`, `secretsIncluded=false`, and `signed=false`.
- `npm run package:smoke`: exit code `0`; the non-destructive distribution dry-run listed the Node 24, better-sqlite3, data-isolation, upgrade, rollback, and uninstall-preserves-data checks. `npm ci --dry-run --ignore-scripts` also exited `0`.
- `pwsh -File scripts/package-smoke.ps1 -Mode Local -Root <system temp directory> -Port 3111`: exit code `0`; clean install, health, upgrade, deliberately failed upgrade, rollback, and uninstall-preserves-data all passed, and the script removed the temporary root. This is isolated local lifecycle evidence, not clean Windows account evidence.
- Docker smoke: Docker Desktop was started through the CLI after the initial engine-unavailable check. An isolated Compose build exited `0`; the container became healthy and `/api/health` returned `200` with SQLite persistence. No API key was injected, so the container reported `llm.status=not_configured`; this is container/storage evidence only, not live-model evidence. The isolated container, volume, network, and image were removed.
- This recheck does not close the remaining human or remote gates: four-dimension semantic review, real screen-reader/mobile acceptance, clean Windows account evidence, post-push Windows/Linux CI, author release approval, and the later commit/tag/GitHub Release workflow.

## v0.1.6 Author-Branch Editing Candidate (Historical)

- Date: 2026-08-30
- Candidate tag: `v0.1.6` remains available as the prior author-branch editing candidate and does not include the `v0.1.7` completion hardening changes.
- Scope: author-created branch scene and ending editing, one atomic graph write with revision protection, interactive-path budget reservation, generation restart and polling UX, duplicate graph ID validation, validation boundaries, and Windows E2E cleanup reliability.
- Local candidate gate: `npm run verify` passed with 70 Vitest files / 291 tests; `npm run test:e2e:authoring` passed 12/12.
- Release status: historical feature-branch candidate only. It was not merged to `master` and has no GitHub Release.

## v0.1.5 Branch-Writing Candidate (Not Published)

- Date: 2026-08-24
- Source branch: `codex/branch-writing-v0.1.5`
- Candidate commit: `600a7f0` (`feat: add author-driven branch writing`)
- Candidate tag: `v0.1.5`, pushed with the feature branch; no GitHub Release has been created for it.
- Scope: author-selected branch writing, one-scene-at-a-time generation, formal `review_required` draft materialization, idempotent save, backup compatibility, and editor continuation.
- Local candidate gate: `npm test` passed with 65 Vitest files / 271 tests; `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Browser candidate gate: `npm run test:e2e:authoring` passed 10/10, including author-selected path, formal draft materialization, refresh recovery, accessibility, cancellation, offline export, release restore, and responsive filters.
- Focused materialization verification: the path mapper, repository transaction, API route, and interactive player tests cover ending validation, project isolation, idempotency, and the editor entry after saving.
- Release status: feature branch and tag only. Merge review, protected-branch CI, GitHub Release, clean Windows account install evidence, and code signing remain human gates.

## Published v0.1.4 Evidence

- Pull request: https://github.com/Caser-86/storyforge-interactive-narrative/pull/1
- Merge commit: `e175f84467af1ff9383c023121969be844fd13fa`
- Annotated tag: `v0.1.4`, resolving to the merge commit above.
- Tag Actions run: https://github.com/Caser-86/storyforge-interactive-narrative/actions/runs/32687684469
- GitHub Release: https://github.com/Caser-86/storyforge-interactive-narrative/releases/tag/v0.1.4
- Public assets: standalone Windows ZIP, ZIP SHA-256, CycloneDX SBOM, standalone SHA-256 list, and release evidence manifest.
- Remote release manifest: version `0.1.4`, `packageFileCount: 2021`, `secretsIncluded: false`, `signed: false`.

## Release A Working-Tree Verification (Not A Published Release)

- Date: 2026-08-24
- Source: current working tree on `codex/storyforge-phase-0`; no tag was moved or created.
- `npm run verify`: exit code `0`; typecheck, lint, production build, `57` Vitest files and `240` tests passed.
- `npm run test:e2e:authoring`: exit code `0`; `9` authoring E2E tests passed, including cancellation during a queued generation run.
- `npm run db:authoring:smoke`: exit code `0`; temporary SQLite project lifecycle passed.
- `npm test -- src/__tests__/authoring/release-governance.test.ts`: exit code `0`; `4` release governance tests passed.
- `npm run authoring:llm:smoke -- --dry-run`: exit code `0`; model `deepseek-v4-flash`, `networkRequest: false`.
- `npm run db:authoring:backup`: exit code `0`; `Integrity: ok`.
- These results are local evidence only. GitHub Actions, branch protection, and merge state remain operator steps.

## Install Evidence

- Path: `D:\Program Files\storyforge-clean-install-20260821-closeout` (previous clean-install evidence)
- Install command: `npm ci --cache "D:\Program Files\npm-cache" --no-audit --no-fund`
- Result: exit code `0`; `522` packages added in `17s`.
- No project install used `D:\.pnpm-store`.

## Coverage Matrix

| Area | Exact evidence | Result |
| --- | --- | --- |
| Project backup and new-ID restore | `src/__tests__/authoring/backup.test.ts`, `src/__tests__/authoring/backup-api.test.ts`, `e2e/authoring-release-flow.spec.ts` | passed |
| Migration backup integrity and retention | `src/__tests__/authoring/database-backup.test.ts`, `npm run db:authoring:backup` | passed |
| Persisted metrics and cost guard | `src/__tests__/authoring/metrics.test.ts` | passed |
| Private-field-free offline HTML | `src/__tests__/authoring/export-private-fields.test.ts`, `e2e/authoring-offline-export.spec.ts` | passed |
| Local health and bind policy | `src/__tests__/authoring/local-security.test.ts`, `src/__tests__/api-health.test.ts` | passed |
| Interactive session history, deletion, and stale-refresh protection | `src/__tests__/interactive/interactive-player.test.tsx`, `src/__tests__/interactive/session-routes.test.ts`, `e2e/authoring-interactive-flow.spec.ts` | passed |
| Author-selected branch writing materialization and idempotent draft creation | `src/__tests__/interactive/materialize.test.ts`, `src/__tests__/interactive/materialize-repository.test.ts`, `src/__tests__/interactive/materialize-route.test.ts`, `e2e/authoring-interactive-flow.spec.ts` | passed |
| V2 backup with interactive sessions and V1 import compatibility | `src/__tests__/authoring/backup.test.ts`, `src/__tests__/authoring/backup-api.test.ts` | passed |
| Project search/status filters and responsive keyboard actions | `src/__tests__/authoring/project-library.test.tsx`, `e2e/authoring-release-flow.spec.ts` | passed at desktop and 390px |
| Legacy read-only export | `src/__tests__/legacy-export.test.ts`, `npm run legacy:export -- --dry-run` | passed |
| E2E build isolation from stale retired routes | `src/__tests__/authoring/e2e-build.test.ts`, `npm run test:e2e:authoring` | passed |
| Full browser authoring loop | `npm run test:e2e:authoring` | passed |
| Input, model, and generation budget guardrails | `src/__tests__/authoring/schemas.test.ts`, `src/__tests__/authoring/generation/budget.test.ts`, `src/__tests__/authoring/generation/api.test.ts`, `src/__tests__/authoring/generation/executor.test.ts` | passed |
| Pause/cancel late-response safety | `src/__tests__/authoring/generation/repository.test.ts`, `src/__tests__/authoring/generation/executor.test.ts`, `e2e/authoring-generation-cancel.spec.ts` | passed |

## Command Results

- `npm run verify`: exit code `0`; `55` test files and `224` tests passed, typecheck, lint, and production build all passed.
- `npm run test:e2e:authoring`: exit code `0`; `8` tests passed in `13.4s` using the fake provider and a standalone production server. The E2E build also clears stale `.next-playwright` output before compiling.
- `npm audit --omit=dev --audit-level=high`: exit code `0`; `0` vulnerabilities found.
- `docker compose config --quiet`: exit code `0`; default loopback configuration valid.
- `docker compose -f docker-compose.yml -f docker-compose.lan.yml config --quiet`: exit code `0`; explicit LAN override valid.
- `npm run db:authoring:smoke`: exit code `0`; temporary SQLite project lifecycle passed.
- `npm run db:authoring:backup`: exit code `0`; `Integrity: ok`; SHA-256 `ae3d58887d09df9f8d8f06ba06021ea36ba197e0f27989f8b2f668b4304144d4`.
- `npm run legacy:export -- --dry-run`: exit code `0`; inspected `0` sessions and wrote `0` files without changing source data.
- `npm run authoring:llm:smoke -- --dry-run`: exit code `0`; reported model `deepseek-v4-flash` with `networkRequest: false`.

## Real Provider Check

- Live DeepSeek smoke passed for this candidate: `npm run authoring:llm:smoke` returned `status: passed`, model `deepseek-v4-flash`, `inputTokens: 236`, `outputTokens: 87`, and `latencyMs: 1412`.
- The command recorded only redacted metrics; it did not print the API key, raw prompt, or raw response.
- The dry-run check also passed with `networkRequest: false` and remains the CI-safe default.

## Post-release Generation Hardening

- Fixed the browser progress loop so a successful step that remains `queued` schedules the next step instead of stopping after the first response.
- Added strict JSON contracts for every provider stage, including bible, outline, graph, node content, and continuity review, plus bounded per-stage token budgets.
- Added explicit `branchType: main | side` to generated and authored edges, with a database migration that backfills existing graphs by local choice order. Branch validation requires exactly one main edge at every branching node.
- Node generation steps in the same batch now run concurrently; deterministic fake-provider verification covers the full resumable batch without requiring a live provider call.
- Completed generation outputs are now materialized into the active draft graph. The verified project contains `3` chapters, `8` generated nodes, `7` edges, and non-empty node bodies instead of an empty editor graph.

## Build Boundary

The clean production route table contains only `/api/health`, `/api/projects/**`, project authoring pages, and the local privacy endpoint. The default UI, health response, package manifest, lockfile, Docker Compose file, CI workflow, and documentation contain no dependency on the retired game, asset, queue, or multi-user runtime.

## Residual Risks

- Remote GitHub Actions passed for PR #1 and the `v0.1.4` tag; the Node.js 20 action-runtime deprecation annotation remains informational and should be addressed in a future CI maintenance change.
- The live provider smoke passed locally with redacted evidence; the tagged release uses fake-provider CI and does not make a live provider request.
- External GitHub audit: repository metadata reports `private: false`, matching the owner's public-repository decision. No open-source license is granted by that decision. `master` protection returned `404 Branch not protected` and remains a governance gap to resolve separately.
- This is a private local application without login or multi-user isolation; do not expose the runtime, author data, or credentials publicly.

## Current Working-Tree Updates

- Release B checkpoint, restore-check, replacement recovery, doctor, and Recovery Centre focused tests passed locally.
- Release C security baseline, request-size policy, production build, axe accessibility E2E, and fake generation evaluation passed locally.
- Release D has a documented Node 24 standalone decision, data lifecycle, package dry-run, and a passing temporary-root lifecycle smoke for `0.1.4`. It is not a signed installer.
- Final local gate for the branch-writing change: `npm test` passed with 65 Vitest files / 271 tests; `npm run typecheck`, `npm run lint`, and `npm run build` also passed.
- Final browser gate for the branch-writing change: `npm run test:e2e:authoring` passed 10/10 tests, including the author-selected path, formal draft materialization, refresh recovery, accessibility, cancellation, offline export, release restore, and responsive filters.
- Final operational gate: checkpoint, migration backup, restore-check, doctor, fake evaluation, live dry-run, package smoke, `npm ci --dry-run --ignore-scripts`, and standalone `/api/health` smoke passed.
- `authoring:doctor` reports database integrity ok, fresh backup, loopback-only binding, and provider configured after loading the local `.env.local` contract.
- `npm audit --audit-level=high` passed with 0 vulnerabilities; the live smoke recorded only redacted provider metrics.
- Local package lifecycle smoke passed `clean-install`, `health`, `upgrade`, `failed-upgrade`, `rollback`, and `uninstall-preserves-data`; the temporary root was removed and port `3110` had no listener afterward.
- `npm run release:evidence` passed; generated CycloneDX `1.5` SBOM with `639` components, SHA-256 checksums for `2241` standalone files, and a release manifest with `secretsIncluded: false` and `signed: false`; the artifact secret scan passed.
- These local results are supplemented by the published tag evidence recorded above.
- Remaining human gates are protected-branch configuration, clean Windows account install evidence, and signing decision. Public-release approval, PR review, merge, tag, and publication are recorded above.
