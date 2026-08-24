# StoryForge Authoring Release Verification

- Date: 2026-08-24
- Published release: `v0.1.4`
- GitHub Release: https://github.com/Caser-86/storyforge-interactive-narrative/releases/tag/v0.1.4
- Release notes: `CHANGELOG.md`
- Runtime: Node `v24.18.0`, npm `11.16.0`
- Scope: private local text authoring, bounded generation, graph editing, quality gate, snapshots, offline export, V2 backup/restore, bounded interactive sessions, project/session lifecycle controls, and legacy read-only export.
- Remote CI: PR #1 targeted `master`; `CI/verify` and `CI/e2e-authoring` passed before merge. Tag run `32687684469` passed on `v0.1.4` at merged commit `e175f84467af1ff9383c023121969be844fd13fa`.

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
