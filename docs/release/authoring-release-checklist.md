# StoryForge Local Authoring Release Checklist

Use this checklist before treating a local build as a releasable private authoring version.

## Environment

- [x] Node matches the supported range in `package.json`.
- [x] npm cache and install directory are outside the repository's source tree.
- [x] `SQLITE_DB_PATH` points to the intended private local database.
- [x] The default server binds to `127.0.0.1`.
- [x] Docker LAN access requires the explicit `docker-compose.lan.yml` override.
- [x] `package.json`, `package-lock.json`, README, and changelog report candidate version `0.1.7`.
- [x] No real API key is copied into logs, backups, exports, or test fixtures.

## Verification

- [x] `npm ci` succeeds in a clean secondary directory.
- [x] `npm run verify` succeeds.
- [x] `npm run test:e2e:authoring` succeeds with `GENERATION_PROVIDER=fake`.
- [x] Project filters and interactive session actions pass at desktop and 390 px browser widths; a 1700-character unbroken interactive scene body also stays within the 390 px document width.
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
- [x] Production and full dependency audits pass with `0 vulnerabilities` after the Next.js, sharp, Vitest, and ESLint toolchain security updates.
- [x] CI declares separate Windows standalone/native SQLite and Linux Docker build/health jobs; remote execution remains a post-push gate.
- [ ] Clean Windows account install evidence is recorded.
- [ ] Code signing and a user-facing installer are approved; standalone directory is not yet a signed installer.

## v0.1.7 Branch Candidate

- [x] Authoring graph completion is implemented: an author-authored side scene can connect to an existing ending, and a new author-authored ending can be added from a non-ending node.
- [x] The candidate source branch is `codex/branch-writing-v0.1.5`; the current working tree contains the reviewed audit fixes.
- [ ] A new candidate tag is created only after the working tree is committed, reviewed, and the exact commit is confirmed.
- [x] Previous local candidate gate is recorded: 70 Vitest files / 291 tests, typecheck, lint, build, and 12/12 authoring E2E.
- [x] Current audit gate is recorded separately: `npm run verify` passed with 84 Vitest files / 398 tests, and `npm run test:e2e:authoring` passed 16/16; isolated process recovery, short SQLite busy-lock, expired queued-job recovery, async focus, timeline refresh, screen-reader status, history status synchronization, explicit interactive-session deep links, cross-origin browser, 390 px long-text, offline interactive-evaluation, gated live-runner parameter checks, Docker data-directory permission, provider credential redaction, provider error-category diagnostics, fake-provider visibility, unknown token-usage budget protection, non-final prompt contract, high-priority thread retention, non-final ending repair, risk-choice repair, malformed active/ending repair, whitespace legacy-memory filtering, full immutable-memory capacity, and Zod schema error classification checks also passed.
- [x] Docker production image and health smoke pass with an isolated Compose project; the shell entrypoint is enforced as LF to remain executable after Windows Git checkout.
- [x] Current package evidence is recorded: standalone build, independent artifact credential scan, isolated lifecycle smoke, and `npm run release:evidence` passed with `secretsIncluded: false`; signing remains false.
- [x] PR `#3` feature-branch candidate commit `fd76beb` has a green remote CI run `34418237947` covering `verify`, authoring E2E, Linux Docker health, and Windows standalone/native SQLite lifecycle. This does not substitute for the canonical `master` gate.
- [ ] Candidate is merged into the canonical `master` branch.
- [ ] The exact canonical-branch commit has a green remote CI run.
- [ ] A GitHub Release is created from the reviewed canonical-branch tag.

## v0.1.6 Branch Candidate (Historical)

- [x] The previous authoring branch editing candidate remains available as tag `v0.1.6`.
- [x] The `v0.1.7` completion hardening changes are intentionally not retroactively moved onto `v0.1.6`.

## v0.1.5 Branch Candidate (Historical)

- [x] Author-driven branch writing is implemented and recorded in the current candidate commit.
- [x] The candidate branch is `codex/branch-writing-v0.1.5`, commit `600a7f0`, with tag `v0.1.5`.
- [x] Local candidate gate is recorded: 65 Vitest files / 271 tests, typecheck, lint, build, and 10/10 authoring E2E.
- [ ] Candidate is merged into the canonical `master` branch.
- [ ] The exact canonical-branch commit has a green remote CI run.
- [ ] A GitHub Release is created from the reviewed canonical-branch tag.

## Release Review

- [x] The latest local verification after the interactive schema-drift retry, history status synchronization, provider error-category diagnostics, session deep-link, unknown token-usage budget, non-final prompt contract, high-priority thread retention, non-final ending repair, risk-choice repair, malformed active/ending repair, whitespace legacy-memory filtering, full immutable-memory capacity, and Zod schema classification fixes passed with 84 Vitest files / 398 tests; the controlled live structural runs passed for all three fixtures, while full manual multi-turn semantic review remains an explicit human gate.

- [x] Backup restore uses a new project ID unless replacement is explicitly intended.
- [x] Project backup is V2 with interactive history; V1 imports remain supported.
- [x] Interactive sessions can be resumed or deleted without stale refresh restoring deleted history.
- [x] Snapshot/export is blocked until the current draft passes validation.
- [x] Blocking validation issues cannot be dismissed.
- [x] Generated raw prompts, raw responses, leases, and secrets are absent from backups and HTML.
- [x] Any remaining legacy routes or packages are explicitly recorded as residual risk.
- [x] `docs/release/authoring-verification.md` contains the exact command results for this release.

## Remote Release Evidence

The following section is historical evidence for the published `v0.1.4` release. It does not assert that `v0.1.5`, `v0.1.6`, or `v0.1.7` has been published as a GitHub Release.

- [x] Owner explicitly confirmed that the GitHub repository remains public for this release; the runtime and author data remain private-local, and no open-source license is granted by this decision.
- [x] PR #1 targeted `master`; GitHub Actions `CI/verify` and `CI/e2e-authoring` passed before merge. `master` is not currently protected and remains a governance gap.
- [x] Annotated tag `v0.1.4` points to merged `master` commit `e175f84467af1ff9383c023121969be844fd13fa`, not to a feature branch.
- [x] GitHub Release `v0.1.4` links the tag, changelog, verification record, standalone ZIP, SBOM, checksums, and release evidence manifest.

- [x] Owner approved the public `v0.1.4` release candidate before commit, push, tag, and publication.

## Operator Step Before Tagging

- [x] Run `npm run authoring:llm:smoke` with the configured OpenAI-compatible provider credentials; the redacted result is recorded without exposing the key or raw response.
- [ ] Complete [`interactive-evaluation-review.md`](interactive-evaluation-review.md) with the human 1–5 scores for each approved fixture; the controlled DeepSeek structural runs are recorded, but fake and structural-only results cannot satisfy this semantic gate.
- [ ] The author manually completes one full branch-writing path, confirms the selected consequences and model ending, and records release approval.
