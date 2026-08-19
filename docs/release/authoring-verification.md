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
