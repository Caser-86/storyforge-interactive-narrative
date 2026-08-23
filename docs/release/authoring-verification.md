# StoryForge Authoring Release Verification

- Date: 2026-08-24
- Release candidate: `v0.1.3`
- Candidate: formal release hardening candidate
- Runtime: Node `v24.18.0`, npm `11.16.0`
- Scope: private local text authoring, bounded generation, graph editing, quality gate, snapshots, offline export, V2 backup/restore, bounded interactive sessions, project/session lifecycle controls, and legacy read-only export.
- Remote CI: workflow committed but GitHub Actions were not executed from this environment.

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
| V2 backup with interactive sessions and V1 import compatibility | `src/__tests__/authoring/backup.test.ts`, `src/__tests__/authoring/backup-api.test.ts` | passed |
| Project search/status filters and responsive keyboard actions | `src/__tests__/authoring/project-library.test.tsx`, `e2e/authoring-release-flow.spec.ts` | passed at desktop and 390px |
| Legacy read-only export | `src/__tests__/legacy-export.test.ts`, `npm run legacy:export -- --dry-run` | passed |
| E2E build isolation from stale retired routes | `src/__tests__/authoring/e2e-build.test.ts`, `npm run test:e2e:authoring` | passed |
| Full browser authoring loop | `npm run test:e2e:authoring` | passed |

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

- Live DeepSeek smoke was not run in this candidate because it is an opt-in network and cost operation.
- The available command is `npm run authoring:llm:smoke`; run it without `--dry-run` only when a tagged release needs a live provider check.
- The dry-run check did not send a request and did not record the API key, raw prompt, or raw response.

## Post-release Generation Hardening

- Fixed the browser progress loop so a successful step that remains `queued` schedules the next step instead of stopping after the first response.
- Added strict JSON contracts for every provider stage, including bible, outline, graph, node content, and continuity review, plus bounded per-stage token budgets.
- Added explicit `branchType: main | side` to generated and authored edges, with a database migration that backfills existing graphs by local choice order. Branch validation requires exactly one main edge at every branching node.
- Node generation steps in the same batch now run concurrently; deterministic fake-provider verification covers the full resumable batch without requiring a live provider call.
- Completed generation outputs are now materialized into the active draft graph. The verified project contains `3` chapters, `8` generated nodes, `7` edges, and non-empty node bodies instead of an empty editor graph.

## Build Boundary

The clean production route table contains only `/api/health`, `/api/projects/**`, project authoring pages, and the local privacy endpoint. The default UI, health response, package manifest, lockfile, Docker Compose file, CI workflow, and documentation contain no dependency on the retired game, asset, queue, or multi-user runtime.

## Residual Risks

- Remote GitHub Actions were not executed locally.
- A live provider smoke remains an explicit operator step before a tagged release.
- This is a private local application without login or multi-user isolation; do not expose it publicly.
