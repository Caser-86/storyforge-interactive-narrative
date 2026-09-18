# StoryForge Authoring Release Verification

- Date: 2026-08-24
- Published release: `v0.1.4`
- GitHub Release: https://github.com/Caser-86/storyforge-interactive-narrative/releases/tag/v0.1.4
- Release notes: `CHANGELOG.md`
- Runtime: Node `v24.18.0`, npm `11.16.0`
- Scope: private local text authoring, bounded generation, graph editing, quality gate, snapshots, offline export, V2 backup/restore, bounded interactive sessions, project/session lifecycle controls, and legacy read-only export.
- Remote CI: PR #1 targeted `master`; `CI/verify` and `CI/e2e-authoring` passed before merge. Tag run `32687684469` passed on `v0.1.4` at merged commit `e175f84467af1ff9383c023121969be844fd13fa`.

## 0.1.8 Published Verification

- Date: 2026-09-18
- Canonical commit: `f2fec8bfdeb3185e1a9334cee5757601da077074`; candidate commit `ff243999b5288fd500978f4614094157983e9ad6` was merged by PR #3. Existing local and remote `v0.1.7` were not moved.
- Scope: version-level single-path release policy, independent author-ending usage ledger, migration 14, editor/release-gate consistency, documentation and version convergence.
- `npm run verify`: exit code `0`; 87 Vitest files / 437 tests passed, with typecheck, lint, and Next production build.
- `npm run test:e2e:authoring`: exit code `0`; 18/18 authoring Playwright tests passed, including selected-path materialization, optional second-ending branching, snapshot creation, and offline export.
- `npm run db:authoring:smoke`: exit code `0` in an isolated SQLite database.
- `npm run db:authoring:checkpoint`: exit code `0`; latest checkpoint was created with integrity `ok` and a recorded SHA-256 manifest.
- `npm run db:authoring:restore-check -- --latest`: exit code `0`; migration version `14`, 3 projects, and `graphReadable=true` in a temporary copy.
- `npm run authoring:doctor`: exit code `0`; status `ok`, migration `14`, integrity `ok`, writable SQLite, fresh backup, loopback-only binding, and configured provider.
- `npm run authoring:evaluate -- --provider fake`: exit code `0`; 3/3 fixtures passed with `networkRequest=false`.
- `npm run interactive:evaluate -- --provider fake`: exit code `0`; 3/3 fixtures passed with ending, choice, risk, and consequence contracts.
- `npm run authoring:llm:smoke -- --dry-run`: exit code `0`; model resolved as `doubao-seed-evolving`, `networkRequest=false`. No real model call was made in this verification batch.
- `npm audit --audit-level=high`: exit code `0`; 0 vulnerabilities.
- `npm run package:standalone`: exit code `0`; generated `output/package/StoryForge-0.1.8`.
- `npm run release:evidence`: exit code `0`; the final tag CI evidence manifest reports package file count `2023`, `secretsIncluded=false`, `signed=false`, with SBOM and SHA-256 files for `0.1.8`.
- `npm run package:smoke`: exit code `0`; dry-run was non-destructive. Isolated Local package smoke also passed clean install, health, upgrade, failed-upgrade, rollback, and uninstall-preserves-data, then removed its temporary root.
- Runtime smoke: `GET http://127.0.0.1:3202/api/health` returned HTTP 200 with version `0.1.8`, persistent SQLite storage, and configured LLM.
- Manual acceptance: the author reported the current project test completed without an issue. This is recorded as functional feedback only; the project ID, exact model, and semantic quality scores are not known from that feedback and are not inferred.
- Release status: published. Candidate commit `ff24399`, PR #3, canonical commit `f2fec8b`, annotated tag `v0.1.8`, and tag CI run `35365455851` are recorded. GitHub Release: https://github.com/Caser-86/storyforge-interactive-narrative/releases/tag/v0.1.8. Existing historical v0.1.4/v0.1.7 evidence is not reused as proof for this release.
- Release assets: standalone ZIP, ZIP SHA-256, SBOM, standalone file SHA-256 list, and release evidence manifest. The manifest reports `signed=false`; code signing and clean Windows-account installation remain future gates.

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

- `npm run verify`: exit code `0`; TypeScript, ESLint, `86` Vitest files / `416` tests, and the Next.js production build passed.
- `npm run test:e2e:authoring`: exit code `0`; all `16/16` authoring Playwright tests passed, including the author-selected path, ending preview confirmation, recovery, release gate, offline playback, cross-origin write rejection, and mobile long-text coverage.
- `npm run interactive:evaluate -- --provider fake`: exit code `0`; all `3/3` bounded 6/8/16-turn fixtures passed with `networkRequest=false`.
- `npm run authoring:evaluate -- --provider fake`: exit code `0`; all `3/3` structured fixtures passed with `networkRequest=false`.
- `npm run interactive:evaluate -- --provider live --dry-run`: exit code `0`; three live plans were listed with `networkRequest=false`; no paid model call was made.
- Runtime smoke: the local server on `127.0.0.1:3202` returned `status=ok`, version `0.1.7`, SQLite persistence, and configured LLM status; the project list was readable. The server used an isolated temporary database and did not modify the default author database.
- `npm run db:authoring:checkpoint`: exit code `0`; a new checkpoint reported `Integrity: ok`. `npm run db:authoring:restore-check -- --latest` then passed against a temporary copy with migration version `13` and a readable graph. `npm run authoring:doctor` returned `status=ok`, fresh backup, loopback-only binding, and configured provider.
- Current database project recheck: after the first command-line POST was correctly rejected for missing same-origin `Origin`, a retry with `Origin: http://127.0.0.1:3202` refreshed `structural` and `rule` validation for `第九档案室`; the run completed with `allowed=true`, `generationComplete=true`, `0` blocking issues, and `3` warnings (`2` `REPEATED_PROSE`, `1` `DEPTH_IMBALANCE`). The earlier `34` warnings were persisted historical results and are not the current rule output.
- Current full validation recheck: the same-origin API then completed `structural + rule + ai_review` with `allowed=true`, `generationComplete=true`, and `0` blocking issues; the latest run returned `6` warnings, including `2` `ARC_UNRESOLVED`, `1` `PACING`, `2` `REPEATED_PROSE`, and `1` `DEPTH_IMBALANCE`. AI review is model-assisted and can vary between runs; these findings remain open quality signals and do not satisfy the human semantic score gate.
- `npm audit --omit=dev --audit-level=high` and `npm audit --audit-level=high`: both exit code `0` with `0 vulnerabilities`.
- `npm run package:standalone` and `npm run release:evidence`: both exit code `0`; current release evidence reports `packageFileCount=2268`, `secretsIncluded=false`, and `signed=false`.
- Sequential packaging recheck: after stopping the local dev server, `npm run package:standalone` completed before `npm run release:evidence`; both exited `0` and independently reported `packageFileCount=2268`, `secretsIncluded=false`, and `signed=false`. The earlier concurrent lock failure is not used as release evidence.
- Current three-fixture live recheck: the approved runner passed `zh-contemporary-6` (6/6), `zh-fantasy-8` (8/8), and `zh-suspense-16` (16/16) with the configured model; all three passed ending, choice-contract, risk-coverage, and direct-consequence checks with `issueCodes=[]`. This remains structural evidence and does not close the four-dimension human semantic review.
- `npm run package:smoke`: exit code `0`; the non-destructive distribution dry-run listed the Node 24, better-sqlite3, data-isolation, upgrade, rollback, and uninstall-preserves-data checks. `npm ci --dry-run --ignore-scripts` also exited `0`.
- `pwsh -File scripts/package-smoke.ps1 -Mode Local -Root <system temp directory> -Port 3111`: exit code `0`; clean install, health, upgrade, deliberately failed upgrade, rollback, and uninstall-preserves-data all passed, and the script removed the temporary root. This is isolated local lifecycle evidence, not clean Windows account evidence.
- Docker smoke: Docker Desktop was started through the CLI after the initial engine-unavailable check. An isolated Compose build exited `0`; the container became healthy and `/api/health` returned `200` with SQLite persistence. No API key was injected, so the container reported `llm.status=not_configured`; this is container/storage evidence only, not live-model evidence. The isolated container, volume, network, and image were removed.
- This recheck does not close the remaining human or remote gates: four-dimension semantic review, real screen-reader/mobile acceptance, clean Windows account evidence, post-push Windows/Linux CI, author release approval, and the later commit/tag/GitHub Release workflow.

## 2026-09-15 Operational Recheck

- `npm run db:authoring:checkpoint`: exit code `0`; created a new checkpoint with `Integrity: ok` and SHA-256 recorded in its manifest.
- `npm run db:authoring:restore-check -- --latest`: exit code `0`; the checkpoint restored in a temporary copy with migration version `13` and a readable graph. The default author database was not modified by the rehearsal.
- `npm run authoring:doctor`: exit code `0`; database integrity is `ok`, migration `13` has no pending work, SQLite is writable, backup freshness is `fresh`, binding is loopback-only, and the provider is configured.
- `npm run interactive:evaluate -- --provider fake`: exit code `0`; all `3/3` bounded `6/8/16`-turn fixtures passed without network access.
- `npm run authoring:evaluate -- --provider fake`: exit code `0`; all `3/3` structured fixtures passed without network access.
- Preview clarification recheck: the preview footer now exposes `继续分支写作` and links to the canonical `/generate` route, so the read-only snapshot cannot be mistaken for the model-driven author flow; the component regression passed before the full suite.
- `npm run verify`: exit code `0`; TypeScript, ESLint, `86` Vitest files / `433` tests, and the Next.js production build passed after the preview clarification, author-session status clarification, review-artifact implementation, legacy-session choice-contract notice, previous-choice context, concrete-consequence normalization, bounded over-choice repair, model-match gate, ending-quality guard, provider envelope normalization, unknown-envelope-field rejection regression, zero-choice legacy-session recovery, continuity-anchor propagation, and in-scene author-path explanation.
- `npm run test:e2e:authoring`: exit code `0`; all `17/17` authoring Playwright tests passed after the preview clarification, review-artifact implementation, legacy-session choice-contract notice, browser-level zero-choice legacy-session recovery, and continuity-anchor visibility coverage.
- Latest legacy-session and model-match gate package recheck: `npm run package:standalone` exited `0`; `npm run release:evidence` exited `0` with `packageFileCount=2268`, `secretsIncluded=false`, and `signed=false`; `npm run package:smoke` dry-run exited `0` with `destructive=false`.
- Targeted preview browser regression: `npm run test:e2e:authoring -- --grep "edits choices, protects stale candidates, and previews an ending"` passed `1/1`; the isolated flow confirmed the read-only notice and both `/generate` links.
- `npm run package:standalone`: exit code `0`; standalone package `StoryForge-0.1.7` was rebuilt after the UI change.
- `npm run release:evidence`: exit code `0`; the rebuilt package scan reports `packageFileCount=2268`, `secretsIncluded=false`, and `signed=false`.
- Controlled live semantic-material runs with the configured `doubao-seed-evolving` model: `zh-contemporary-6` passed `6/6`, `zh-fantasy-8` passed `8/8`, and `zh-suspense-16` initially stopped after `9/16` with `GENERATION_SCHEMA`/`RISK_SEQUENCE`. The failure was traced to an over-choice response being rejected before `choice-repair`; after the provider-boundary headroom fix, the same `16`-turn sample passed `16/16` with ending, choice contract, risk coverage, consequence checks, and no issue codes. A later 16-turn attempt stopped at `10/16`; safe field-level diagnostics localized a compatible provider drift that placed `endingReadiness` at the envelope root. The boundary now moves only that known field into `statePatch` before strict validation, and the rerun passed `16/16`. Review artifacts were generated with `--save-review --expected-model`; targeted scans found no credentials.
- Ending and timeline quality hardening: the final-turn contract now rejects a non-empty ending that still promises a later continuation, invokes one bounded ending repair, and requires a concrete immediate resolution; the normal prompt also requires an unambiguous 24-hour clock for same-day afternoon times. Current default-model review artifacts for all three fixtures passed `6/6`, `8/8`, and `16/16` with `endingPass=true`, `choiceContractPass=true`, `riskCoveragePass=true`, `consequencePass=true`, and `issueCodes=[]`. These are structural review materials only; the author must still assign the four human semantic scores.
- Legacy zero-choice recovery: an active non-ending history record with zero choices now explains that it cannot continue, preserves the original record, hides the empty choice area, and offers an explicit `新建分支写作` action; the component regression and full authoring E2E both passed.
- Continuity anchor: each new interactive scene can persist a bounded location, time, active-character, and scene-goal ledger; the next prompt carries it forward, and the author UI plus sanitized review artifact expose it without adding manual input fields.
- Legacy zero-choice API compatibility: the persisted read schema now accepts an active non-ending scene with zero choices while the generation schema remains strict; the SQLite session route regression passed with HTTP 200 and the empty choices array preserved.
- Legacy zero-choice backup compatibility: the V2 backup path now uses the same read schema, and the export/import round-trip regression preserves the old scene and its empty choices array.
- Post-backup compatibility package recheck: `npm run package:standalone` exited `0`; `npm run release:evidence` exited `0` with `packageFileCount=2268`, `secretsIncluded=false`, and `signed=false`; `npm run package:smoke` dry-run exited `0` with `destructive=false`.
- Post-recovery package recheck: `npm run test:e2e:authoring` exited `0` with `16/16`; `npm run package:standalone` exited `0`; `npm run release:evidence` exited `0` with `packageFileCount=2268`, `secretsIncluded=false`, and `signed=false`.
- Post-review-artifact package recheck: `npm run package:standalone` and `npm run release:evidence` both exited `0`; `npm run package:smoke` dry-run exited `0` and reported `destructive=false`, so no installation or data deletion occurred.
- Isolated Local package smoke: exit code `0`; a unique temporary root passed clean install, health, upgrade, deliberately failed upgrade, rollback, and uninstall-preserves-data, and the root was removed afterward. The project data directory remained intact.
- 2026-09-15 automation supplement: `npm run package:smoke` dry-run, fake interactive evaluation (`3/3`), fake structured evaluation (`3/3`), `npm audit --audit-level=high` (`0 vulnerabilities`), `npm run authoring:doctor` (`status=ok`, migration `13`, integrity `ok`, fresh backup, loopback-only), and the LLM configuration dry-run (no network request) all exited `0`.
- 2026-09-15 in-scene author-path explanation package recheck: `npm run package:standalone` and `npm run release:evidence` exited `0`; the current package scan reports `packageFileCount=2268`, `secretsIncluded=false`, and `signed=false`; `npm run package:smoke` dry-run exited `0` with `destructive=false`.
- `git diff --check`: exit code `0`; no whitespace errors were introduced after the provider envelope normalization, ending-quality guard, timeline prompt, and preview clarification changes. No commit, tag, push, or release was performed.
- Runtime recheck: `GET /api/health` returned `status=ok`, version `0.1.7`, persistent SQLite storage, and configured LLM status. The current runtime exposes two local projects; `第九档案室` remains structurally releasable with zero blocking issues, while `森林` remains an incomplete draft with four structural blockers. Its six local author sessions are read-only inspected; no session was deleted or cancelled.
- Remote state recheck: `origin/codex/branch-writing-v0.1.5` and the current candidate `HEAD` both resolve to `23a2aa0`; `origin/master` remains at `e3c35cf`; remote `v0.1.7` is a historical annotated tag resolving to `56dae71`, not this uncommitted worktree. No tag was moved or created.
- The latest UI, API, and CLI fixes are covered by `npm run verify` (`86` Vitest files / `433` tests); history now labels resumable `active` sessions as “可继续”, explains that the next model call starts only after the author chooses, identifies restored legacy sessions with fewer than three choices, serves legacy active scenes with zero choices through a compatibility read schema, preserves those scenes through V2 backup export/import, provides a recovery route when a legacy active scene has zero choices, shows the previous author choice as the current scene's context, explains inside the active scene that only the author's selected path is generated, exposes a bounded continuity anchor for location, time, active characters, and scene goal, normalizes generic choice-impact metadata to a concrete scene summary, sends bounded over-choice drift through repair, normalizes the known root-level `endingReadiness` drift without loosening the persisted contract, applies the ending future-promise guard, rejects unknown envelope fields, and rejects a mismatched `--expected-model` before any network request. Remaining gates are unchanged: human semantic scoring, real screen-reader/mobile acceptance, author confirmation of release, and the canonical-branch commit/tag/CI/Release workflow.
- Model configuration gate: the current local default is `doubao-seed-evolving`; a process-level `OPENAI_MODEL=deepseek-v4-flash` dry-run passed without network access, but `.env.local` was intentionally not changed. The final human review must record and approve the exact model used for release.
- Review-artifact gate recheck: `--save-review` is accepted only for an approved live single-fixture run with `--expected-model`; the CLI rejects a model mismatch before any network request, the default fake report remains summary-only, and live dry-run plus `--save-review` is rejected before any network request.

## 2026-09-10 Interactive Schema-Drift Recheck

- A controlled live diagnostic for the configured `doubao-seed-evolving` model completed the `zh-contemporary-6` path at `6/6` scenes. The first five scenes were active with three choices each; the final scene was accepted with `isEnding=true`, zero choices, and a non-empty ending summary.
- The formal runner `npm run interactive:evaluate -- --provider live --allow-network --approve-paid-calls --fixture zh-contemporary-6` exited `0` with `status=passed`, `generatedTurns=6`, `endingPass=true`, `choiceContractPass=true`, `consequencePass=true`, and `issueCodes=[]`. This was one approved, fixed-sample live call.
- The recheck covered provider responses that omitted final-only fields or the `isEnding` marker, plus a compact memory response using `facts`, `threads`, and `resolvedIds`. The generator now enters one bounded ending repair for the former cases and normalizes the latter without persisting raw prompts or responses.
- A regression test now confirms that a final response missing `isEnding` is accepted at the provider boundary, routed to `ending-repair`, and still requires a model-written ending before it can complete.
- A regression test also confirms that oversized active and final scene text enters a bounded repair path and never bypasses the persisted `1800`/`300` character limits.
- A live recheck after the oversized-scene fix passed the approved `zh-contemporary-6` sample with `6/6` generated turns, `5` active scenes, valid risk coverage, valid choice consequences, and a valid ending; `issueCodes=[]`. The preceding live failure (`GENERATION_VALIDATION`) was retained as the trigger for this hard-length prompt and repair-boundary change.
- This is structural reliability evidence only. It does not close the four-dimension human semantic review, real screen-reader/mobile acceptance, clean Windows account evidence, author release approval, or the canonical `master` CI/tag/Release gates.

## 2026-09-10 Remote CI Recheck

- The first post-push run for `be798b8` exposed five environment-coupled interactive generator tests because CI sets `GENERATION_PROVIDER=fake`; the tests were updated to inject the mocked OpenAI-compatible provider explicitly.
- The follow-up run for `de8191f` passed `verify` but exposed a Windows runner contract mismatch: `RUNNER_TEMP` is a trusted CI temporary root but is not required to equal PowerShell's default `GetTempPath()`.
- `fd76beb` fixes the package smoke scope to accept `RUNNER_TEMP` only when `GITHUB_ACTIONS=true`, while keeping the disposable root nested and rejecting the trusted temporary root itself. The cleanup path now uses the same verified roots instead of the removed `$tempRoot` variable.
- Local regression evidence: the CI-equivalent generator suite passed `11/11`; the distribution contract suite passed `8/8`; a runner-temp lifecycle smoke passed clean install, health, upgrade, deliberately failed upgrade, rollback, and uninstall-preserves-data, then removed its disposable root.
- GitHub Actions run `34418237947` for PR `#3` and commit `fd76beb` passed `verify`, `e2e-authoring`, `docker-build`, and `standalone-windows`; the final documentation commit `fad001a` was independently rechecked by run `34418692175` with the same four jobs green. GitHub's Node.js 20 action-runtime deprecation annotation remains informational.
- This is feature-branch CI evidence only. The candidate is not merged into `master`, and no new tag or GitHub Release was created. Human semantic scoring, real screen-reader/mobile acceptance, clean Windows account evidence, and author release approval remain open.

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

## 2026-09-16 自动门禁复核

- `npm run verify`：退出码 `0`；TypeScript、ESLint、`86` 个 Vitest 文件/`433` 个测试和 Next.js 生产构建全部通过。
- `npm run test:e2e:authoring`：退出码 `0`；作者端 Playwright `17/17` 通过，覆盖逐幕选择、旧零选项会话恢复、键盘焦点、跨来源写入拒绝、390px 长文本和发布流程。
- `npm run interactive:evaluate -- --provider fake` 与 `npm run authoring:evaluate -- --provider fake`：均退出码 `0`，分别 `3/3` 通过且 `networkRequest=false`；`npm audit --audit-level=high` 退出码 `0`，报告 `0 vulnerabilities`。
- `npm run interactive:evaluate -- --provider live --dry-run`、`npm run authoring:evaluate -- --provider live --dry-run` 和 `npm run authoring:llm:smoke -- --dry-run`：均退出码 `0`，均 `networkRequest=false`，未产生真实模型调用。
- 有界真实 provider smoke 复核：以进程级 `OPENAI_MODEL=deepseek-v4-flash` 执行 `npm run authoring:llm:smoke`，退出码 `0`，返回 `status=passed`；脱敏指标为输入 `332`、输出 `107`、延迟 `1323ms`，没有输出 API key、prompt 或原始响应。该结果仅证明 provider 连通，不替代四维人工语义评分或最终发布模型确认。
- 逐幕审阅材料复核：以同一进程级模型执行受控单样本 `interactive:evaluate`（`zh-contemporary-6`、`--save-review`），退出码 `0`，`6/6` 幕通过，结局、选项契约、风险覆盖和具体后果检查均通过且 `issueCodes=[]`；生成 `output/evaluations/interactive-review-zh-contemporary-6.md`。材料已检查未含 prompt、原始响应或密钥，仅作为作者四维语义评分输入。
- 同模型审阅材料补齐：以相同进程级 `OPENAI_MODEL=deepseek-v4-flash` 执行 `zh-fantasy-8` 与 `zh-suspense-16` 的 `--save-review`，分别 `8/8` 与 `16/16` 幕通过，结局、选项契约、风险覆盖和具体后果检查均通过且 `issueCodes=[]`。三份材料均经检查未含 prompt、原始响应或密钥；它们仍不替代作者四维语义评分。
- 备份 freshness 修复：`npm run db:authoring:checkpoint` 创建新 checkpoint，`npm run db:authoring:restore-check -- --latest` 在临时副本恢复到迁移版本 `13` 且图谱可读；随后 `npm run authoring:doctor` 返回 `status=ok`，数据库完整性 `ok`、SQLite 可写、备份 `fresh`、loopback-only、provider configured。
- `npm run package:standalone`：退出码 `0`；重新生成 `output/package/StoryForge-0.1.7`。
- `npm run release:evidence`：退出码 `0`；独立产物扫描为 `packageFileCount=2268`、`secretsIncluded=false`、`signed=false`。
- `npm run package:smoke`：退出码 `0`；dry-run 验证 Node 24、better-sqlite3、数据目录隔离和升级/回滚/保留数据卸载检查项，`destructive=false`。
- 本地运行时复核：重启 `npm run dev -- --port 3202` 后，`GET http://127.0.0.1:3202/api/health` 返回 `status=ok`、版本 `0.1.7`、SQLite 持久化和 LLM `configured`；此前拒绝连接仅由作者端 E2E 构建结束后的服务生命周期造成。
- 本轮仅完成可自动执行的备份、验证和分发证据刷新；真实模型四维人工评分、真实读屏/手机验收、干净 Windows 账户安装、签名/用户安装包、作者发布确认以及 canonical `master` 合并/CI/标签/Release 仍未完成。

## 2026-09-19 最终模型结构复评

- 以作者已批准的真实调用方式执行进程级 `OPENAI_MODEL=deepseek-v4-flash`，启用 `--allow-network --approve-paid-calls`，并使用 `--save-review --expected-model deepseek-v4-flash` 生成三套脱敏审阅材料；`.env.local` 默认模型未修改，仍为 `doubao-seed-evolving`。
- `zh-contemporary-6` 最终 `6/6`，`activeSceneCount=5`；`zh-fantasy-8` 最终 `8/8`，`activeSceneCount=7`；`zh-suspense-16` 最终 `16/16`，`activeSceneCount=15`。三者的 ending、choice contract、risk coverage、consequence 均通过，`issueCodes=[]`。
- `zh-suspense-16` 在首次真实运行中于 `14/16` 暴露 `GENERATION_SCHEMA` 与 `RISK_SEQUENCE`，随后通过现有有界重试/重新运行完成 `16/16`。这证明当前边界对一次瞬态模型漂移有恢复能力，但不证明 live provider 永不失败；失败尝试没有作为最终审阅材料保存。
- 复评产物仅包含结构化结果和契约校验后的逐幕文本，未保存 API key、原始 prompt 或完整 provider 响应。该复评仍是结构和可读材料证据，不关闭四维人工语义评分、作者逐幕确认、真实读屏/移动端验收、干净 Windows 账户安装、代码签名或最终发布模型确认。
