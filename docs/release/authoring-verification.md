# Authoring Verification

- Date: 2026-08-19
- Repository: `storyforge-interactive-narrative`
- Node: `v24.18.0`
- npm: `11.16.0`
- Branch: `codex/storyforge-phase-0`

## Scope

Phase 0 Task 5 established a reproducible local quality gate without changing legacy story behavior, `.env.local`, or `data/`. The verification command added in this task is:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Baseline Vitest Reproduction

All three baseline suite runs were executed with:

```powershell
$env:DISABLE_REDIS='true'
$env:ENABLE_IMAGE_GENERATION='false'
npm test
```

| Run | Exit code | Tests | File count | Vitest duration | Wall clock |
| --- | --- | --- | --- | --- | --- |
| 1 | 0 | 239 passed | 30 passed | 2.16s | 3066ms |
| 2 | 0 | 239 passed | 30 passed | 3.19s | 4099ms |
| 3 | 0 | 239 passed | 30 passed | 3.20s | 4110ms |

No timeout reproduced in the initial three standalone suite runs.

## Gate 0 Commands

### `npm ci`

Initial attempt:

```powershell
npm ci
```

- Exit code: `-4048`
- Result: failed with `EPERM` while unlinking `lightningcss.win32-x64-msvc.node`
- Diagnosis: the repository still had a local `next dev --webpack` / `start-server.js` pair listening on port `3000`, holding the native module open
- Resolution: stopped the two verified repository-local Next.js processes and retried

Successful retry:

```powershell
npm ci
```

- Exit code: `0`
- Wall clock: `26596ms`
- Notes: npm reported `6 high severity vulnerabilities` and `allow-scripts` warnings for `better-sqlite3`, `esbuild`, `msgpackr-extract`, `sharp`, and `unrs-resolver`

Final cold-install confirmation after test fixes:

```powershell
npm ci
```

- Exit code: `0`
- Wall clock: `25302ms`
- Notes: same vulnerability and `allow-scripts` warnings as above

### `npm run verify`

All verify runs used:

```powershell
$env:DISABLE_REDIS='true'
$env:ENABLE_IMAGE_GENERATION='false'
$env:IMAGE_PROVIDER='mock'
$env:MOCK_LLM='true'
$env:OPENAI_API_KEY='sk-test-mock'
npm run verify
```

Attempt 1:

- Exit code: `2`
- Wall clock: `5447ms`
- Failure: `src/__tests__/api-health.test.ts(77,17): error TS2540: Cannot assign to 'NODE_ENV' because it is a read-only property.`

Attempt 2:

- Exit code: `1`
- Wall clock: `82853ms`
- Failure: Vitest timed out in `src/__tests__/api-assets-ratelimit.test.ts` and `src/__tests__/api-health.test.ts`
- Observed counts: `2 failed | 237 passed` tests, `2 failed | 28 passed` files

Attempt 3:

- Exit code: `1`
- Wall clock: `76265ms`
- Failure: Vitest timed out in `src/__tests__/asset-queue-types.test.ts`
- Observed counts: `1 failed | 238 passed` tests, `1 failed | 29 passed` files

Final successful run:

- Exit code: `0`
- Wall clock: `79125ms`
- Vitest: `239 passed` tests in `30 passed` files, Vitest duration `1.26s`
- Build: `next build --webpack` completed successfully
- Build details observed:
  - `Compiled successfully in 24.1s`
  - `Finished TypeScript in 5.1s`
  - `Generating static pages using 15 workers (12/12) in 483ms`

## Fixes Applied For Reproducibility

- Added `npm run verify` to `package.json`
- Fixed `api-health.test.ts` to avoid direct assignment to readonly `process.env.NODE_ENV`
- Restored `DISABLE_REDIS`, `ENABLE_IMAGE_GENERATION`, and `REDIS_URL` correctly in affected tests instead of deleting externally supplied values during `verify`
- Added `vi.resetModules()`-based isolation in the asset/rate-limit tests where module cache state was part of the reproduced timeout path
- Replaced the slow `npm ls ioredis --json` subprocess in `asset-queue-types.test.ts` with a direct `package-lock.json` assertion to remove the demonstrated cold-start timeout source

## Build Result

- `npm run build`: success
- Route output observed included dynamic handlers for `/api/assets/[assetJobId]`, `/api/games`, `/api/health`, `/api/stats`, and related share/event endpoints

## Residual Risks

- CI workflow was not changed because local evidence showed the reproducibility issues were in tests, not in Node 24 or npm-only CI setup
- `playwright.config.ts` and `vitest.config.ts` were not changed because no reproduced failure required global timeout changes or Playwright changes
- The local repository still contains untracked `dev-server.log` and `dev-server.err.log`; they were preserved
- `npm audit` warnings remain unresolved and were outside this task's scope
