# StoryForge Authoring Release Verification

- Date: 2026-08-21
- Final code commit: `f140d7c` (`fix: align brief prompt with strict schema`)
- Runtime: Node `v24.18.0`, npm `11.16.0`
- Scope: private local text authoring, bounded generation, graph editing, quality gate, snapshots, offline export, backup/restore, and legacy read-only export.
- Remote CI: workflow committed but GitHub Actions were not executed from this environment.

## Clean Directory

- Path: `D:\Program Files\storyforge-clean-install-20260821-closeout`
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
| Legacy read-only export | `src/__tests__/legacy-export.test.ts`, `npm run legacy:export -- --dry-run` | passed |
| E2E build isolation from stale retired routes | `src/__tests__/authoring/e2e-build.test.ts`, `npm run test:e2e:authoring` | passed |
| Full browser authoring loop | `npm run test:e2e:authoring` | passed |

## Command Results

- `npm run verify`: exit code `0`; `44` test files and `185` tests passed, typecheck, lint, and production build all passed.
- `npm run test:e2e:authoring`: exit code `0`; `6` tests passed in `10.0s` using the fake provider and a standalone production server. The E2E build also clears stale `.next-playwright` output before compiling.
- `npm run db:authoring:smoke`: exit code `0`; temporary SQLite project lifecycle passed.
- `npm run db:authoring:backup`: exit code `0`; `Integrity: ok`; SHA-256 `714d6196d4f897cb8398ee53350d50cc803a345ff1e150a927982382e6fe2236`.
- `npm run legacy:export -- --dry-run`: exit code `0`; inspected `0` sessions and wrote `0` files without changing source data.

## Real Provider Check

- Manual provider smoke: exit code `0`; `deepseek-v4-flash` returned a structured brief through `OpenAICompatibleGenerationProvider`, passed `BriefOutputSchema`, and used `287` input tokens plus `196` output tokens in `3037ms`.
- The manual check did not record the API key, raw prompt, or raw response.

## Build Boundary

The clean production route table contains only `/api/health`, `/api/projects/**`, project authoring pages, and the local privacy endpoint. The default UI, health response, package manifest, lockfile, Docker Compose file, CI workflow, and documentation contain no dependency on the retired game, asset, queue, or multi-user runtime.

## Residual Risks

- Remote GitHub Actions were not executed locally.
- This is a private local application without login or multi-user isolation; do not expose it publicly.
