# StoryForge Local Authoring Release Checklist

Use this checklist before treating a local build as a releasable private authoring version.

## Environment

- [x] Node matches the supported range in `package.json`.
- [x] npm cache and install directory are outside the repository's source tree.
- [x] `SQLITE_DB_PATH` points to the intended private local database.
- [x] The default server binds to `127.0.0.1`.
- [x] No real API key is copied into logs, backups, exports, or test fixtures.

## Verification

- [x] `npm ci` succeeds in a clean secondary directory.
- [x] `npm run verify` succeeds.
- [x] `npm run test:e2e:authoring` succeeds with `GENERATION_PROVIDER=fake`.
- [x] `npm run db:authoring:smoke` succeeds.
- [x] `npm run db:authoring:backup` succeeds and reports `Integrity: ok`.
- [x] `npm run legacy:export -- --dry-run` succeeds without deleting source data.
- [x] Offline HTML playback reaches an ending with network requests blocked.

## Release Review

- [x] Backup restore uses a new project ID unless replacement is explicitly intended.
- [x] Snapshot/export is blocked until the current draft passes validation.
- [x] Blocking validation issues cannot be dismissed.
- [x] Generated raw prompts, raw responses, leases, and secrets are absent from backups and HTML.
- [x] Any remaining legacy routes or packages are explicitly recorded as residual risk.
- [x] `docs/release/authoring-verification.md` contains the exact command results for this release.
