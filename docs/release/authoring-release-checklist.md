# StoryForge Local Authoring Release Checklist

Use this checklist before treating a local build as a releasable private authoring version.

## Environment

- [x] Node matches the supported range in `package.json`.
- [x] npm cache and install directory are outside the repository's source tree.
- [x] `SQLITE_DB_PATH` points to the intended private local database.
- [x] The default server binds to `127.0.0.1`.
- [x] Docker LAN access requires the explicit `docker-compose.lan.yml` override.
- [x] `package.json`, `package-lock.json`, README, and changelog report candidate version `0.1.4`.
- [x] No real API key is copied into logs, backups, exports, or test fixtures.

## Verification

- [x] `npm ci` succeeds in a clean secondary directory.
- [x] `npm run verify` succeeds.
- [x] `npm run test:e2e:authoring` succeeds with `GENERATION_PROVIDER=fake`.
- [x] Project filters and interactive session actions pass at desktop and 390 px browser widths.
- [x] `npm run db:authoring:smoke` succeeds.
- [x] `npm run db:authoring:backup` succeeds and reports `Integrity: ok`.
- [x] `npm run legacy:export -- --dry-run` succeeds without deleting source data.
- [x] Offline HTML playback reaches an ending with network requests blocked.
- [x] `npm run authoring:evaluate -- --provider fake` passes the versioned Chinese corpus without network access.
- [x] `npm run authoring:evaluate -- --dry-run --provider live` proves the live path is non-networking by default.
- [x] `npm run test:e2e:authoring -- --grep accessibility` passes axe critical/serious checks, keyboard focus, and reduced-motion coverage.
- [x] `npm run package:smoke` dry-run passes without touching author data.
- [x] Local temporary-root package smoke passes clean install, standalone health, upgrade, deliberately failed upgrade, rollback, and uninstall-preserves-data; the temporary root is removed afterward.
- [x] `npm run release:evidence` generates CycloneDX SBOM, standalone SHA-256 checksums, and a manifest with `secretsIncluded: false`.
- [ ] Clean Windows account install evidence is recorded.
- [ ] Code signing and a user-facing installer are approved; standalone directory is not yet a signed installer.

## Release Review

- [x] Backup restore uses a new project ID unless replacement is explicitly intended.
- [x] Project backup is V2 with interactive history; V1 imports remain supported.
- [x] Interactive sessions can be resumed or deleted without stale refresh restoring deleted history.
- [x] Snapshot/export is blocked until the current draft passes validation.
- [x] Blocking validation issues cannot be dismissed.
- [x] Generated raw prompts, raw responses, leases, and secrets are absent from backups and HTML.
- [x] Any remaining legacy routes or packages are explicitly recorded as residual risk.
- [x] `docs/release/authoring-verification.md` contains the exact command results for this release.

## Remote Release Evidence

- [x] Owner explicitly confirmed that the GitHub repository remains public for this release; the runtime and author data remain private-local, and no open-source license is granted by this decision.
- [x] PR #1 targeted `master`; GitHub Actions `CI/verify` and `CI/e2e-authoring` passed before merge. `master` is not currently protected and remains a governance gap.
- [x] Annotated tag `v0.1.4` points to merged `master` commit `e175f84467af1ff9383c023121969be844fd13fa`, not to a feature branch.
- [x] GitHub Release `v0.1.4` links the tag, changelog, verification record, standalone ZIP, SBOM, checksums, and release evidence manifest.

- [x] Owner approved the public `v0.1.4` release candidate before commit, push, tag, and publication.

## Operator Step Before Tagging

- [x] Run `npm run authoring:llm:smoke` with the configured DeepSeek key; the redacted result is recorded without exposing the key or raw response.
