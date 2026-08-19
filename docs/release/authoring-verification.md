# StoryForge Phase 0 Verification Record

- Date: 2026-08-19
- Branch: `codex/storyforge-phase-0`
- Runtime: Node `v24.18.0`, npm `11.16.0`
- Remote GitHub Actions: not executed from this environment.

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

The required fresh command was attempted exactly as follows:

```powershell
npm ci
```

It did not complete on this Windows/Node 24/npm 11 host. Three attempts stalled after npm fetched or extracted the Next, sharp, and SWC tarballs, with no child process and no further npm log progress. An `npm cache verify` between attempts completed successfully but did not change the outcome. The hung npm processes were terminated.

The partial reinstall removed development command shims, so the final `npm run verify` could not run because `vitest` was not found. The prior full-suite count was `241`; this wave adds four tests, so the expected final count is `245`, but it was not observed in a final run. The production build was not run after the failed fresh install, so no final build-success claim is made.

## Residual Concerns

- No known production audit vulnerabilities remain in the fresh `npm audit --omit=dev --json` result.
- A successful clean `npm ci` and exact mock-environment `npm run verify` must be rerun on a host where npm installation completes before Phase 0 can be declared fully verified.
- Remote GitHub Actions remain unexecuted.
