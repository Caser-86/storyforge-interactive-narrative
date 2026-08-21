# StoryForge Local Authoring Release Checklist

Use this checklist before treating a local build as a releasable private authoring version.

## Environment

- [ ] Node matches the supported range in `package.json`.
- [ ] npm cache and install directory are outside the repository's source tree.
- [ ] `SQLITE_DB_PATH` points to the intended private local database.
- [ ] The default server binds to `127.0.0.1`.
- [ ] No real API key is copied into logs, backups, exports, or test fixtures.

## Verification

- [ ] `npm ci` succeeds in a clean secondary directory.
- [ ] `npm run verify` succeeds.
- [ ] `npm run test:e2e:authoring` succeeds with `GENERATION_PROVIDER=fake`.
- [ ] `npm run db:authoring:smoke` succeeds.
- [ ] `npm run db:authoring:backup` succeeds and reports `Integrity: ok`.
- [ ] `npm run legacy:export -- --dry-run` succeeds without deleting source data.
- [ ] Offline HTML playback reaches an ending with network requests blocked.

## Release Review

- [ ] Backup restore uses a new project ID unless replacement is explicitly intended.
- [ ] Snapshot/export is blocked until the current draft passes validation.
- [ ] Blocking validation issues cannot be dismissed.
- [ ] Generated raw prompts, raw responses, leases, and secrets are absent from backups and HTML.
- [ ] Any remaining legacy routes or packages are explicitly recorded as residual risk.
- [ ] `docs/release/authoring-verification.md` contains the exact command results for this release.
