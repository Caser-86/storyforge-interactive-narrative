# StoryForge Local Authoring Release Checklist

Use this checklist before treating a local build as a releasable private authoring version.

## Environment

- [x] Node matches the supported range in `package.json`.
- [x] npm cache and install directory are outside the repository's source tree.
- [x] `SQLITE_DB_PATH` points to the intended private local database.
- [x] The default server binds to `127.0.0.1`.
- [x] Docker LAN access requires the explicit `docker-compose.lan.yml` override.
- [x] `package.json`, `package-lock.json`, README, and changelog report candidate version `0.1.8`.
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

## v0.1.8 Closeout Candidate

- [x] Version candidate is `0.1.8`; the existing `v0.1.7` tag remains untouched.
- [x] Version-level release policy distinguishes `selected_path` from `branching_graph`; the editor, graph API, validation, snapshot sealing, and materialization use the same policy resolver.
- [x] Author-ending calls use the independent `author_ending_generation_usage` ledger; confirmed, failed, and unknown usage is included in project metrics without consuming the interactive-session budget.
- [x] `npm run verify` passed: 87 Vitest files / 437 tests, typecheck, lint, and production build.
- [x] `npm run test:e2e:authoring` passed: 18/18 browser flows.
- [x] SQLite smoke, checkpoint, restore rehearsal, and doctor passed; latest checkpoint restored at migration 14 with integrity `ok`, 3 projects, and a readable graph.
- [x] Fake structured and interactive evaluations passed 3/3 each; `npm audit --audit-level=high` reported 0 vulnerabilities.
- [x] Standalone package, SBOM, SHA-256 checksums, secret scan, package smoke dry-run, and isolated Windows lifecycle smoke passed for `0.1.8`; signing remains false.
- [x] Local health check returned HTTP 200, version `0.1.8`, persistent SQLite, and configured LLM.
- [x] The author has reported that the current manual project test completed without an issue; no project ID, exact model, or per-turn semantic scores are inferred from that feedback.
- [ ] Real-model semantic scoring for the final release model is complete and matches `OPENAI_MODEL`.
- [ ] Candidate is committed, pushed, reviewed, merged into canonical `master`, and covered by remote CI.
- [ ] New annotated `v0.1.8` tag and GitHub Release are created from the exact green canonical commit.

## v0.1.7 Branch Candidate

- [x] Authoring graph completion is implemented: an author-authored side scene can connect to an existing ending, and a new author-authored ending can be added from a non-ending node.
- [x] The candidate source branch is `codex/branch-writing-v0.1.5`; the current working tree contains the reviewed audit fixes.
- [ ] A new candidate tag is created only after the working tree is committed, reviewed, and the exact commit is confirmed.
- [x] Previous local candidate gate is recorded: 70 Vitest files / 291 tests, typecheck, lint, build, and 12/12 authoring E2E.
- [x] Current audit gate is recorded separately: `npm run verify` passed with 86 Vitest files / 433 tests, and `npm run test:e2e:authoring` passed 17/17; isolated process recovery, short SQLite busy-lock, expired queued-job recovery, async focus, timeline refresh, screen-reader status, history status synchronization, explicit interactive-session deep links, cross-origin browser, 390 px long-text, offline interactive-evaluation, gated live-runner parameter checks, Docker data-directory permission, provider credential redaction, provider error-category diagnostics, fake-provider visibility, unknown token-usage budget protection, non-final prompt contract, high-priority thread retention, non-final ending repair, risk-choice repair, malformed active/ending repair, whitespace legacy-memory filtering, full immutable-memory capacity, Zod schema error classification, legacy zero-choice read compatibility, V2 backup round-trip, continuity-anchor propagation, in-scene author-path explanation, and browser-level legacy recovery checks also passed.
- [x] Latest 2026-09-10 code-and-runner recheck: `npm test` passed with 86 Vitest files / 416 tests, typecheck, lint, production build, and authoring E2E passed 16/16; after the oversized-scene repair boundary and hard-length prompt fix, the approved live `zh-contemporary-6`, `zh-fantasy-8`, and `zh-suspense-16` runners each returned `status=passed` for the configured `doubao-seed-evolving` model. This remains structural evidence, not the required human semantic score.
- [x] Current project validation refresh: with the required same-origin `Origin` header, `第九档案室` completed `structural` and `rule` validation with `allowed=true`, `generationComplete=true`, `0` blocking issues, and `3` open warnings (`2` `REPEATED_PROSE`, `1` `DEPTH_IMBALANCE`).
- [x] Current full validation refresh: the same-origin API completed `structural + rule + ai_review` with `allowed=true`, `generationComplete=true`, and `0` blocking issues; the latest run returned `6` warnings, including `ARC_UNRESOLVED` and `PACING` findings from AI review. These remain human quality-review items, not dismissed release blockers.
- [x] Docker production image and health smoke pass with an isolated Compose project; the shell entrypoint is enforced as LF to remain executable after Windows Git checkout.
- [x] Current package evidence is recorded: standalone build, sequential standalone build/evidence scan, independent artifact credential scan, isolated lifecycle smoke, and `npm run release:evidence` passed with `packageFileCount=2268` and `secretsIncluded: false`; signing remains false. A prior concurrent lock failure was excluded from the release evidence.
- [x] 2026-09-15 operational recheck refreshed the database checkpoint and passed restore rehearsal on a temporary copy; `authoring:doctor` reports migration `13`, integrity `ok`, writable SQLite, `fresh` backup, loopback-only binding, and configured provider. The offline structured and interactive evaluations both passed `3/3` without network access.
- [x] 2026-09-15 automation supplement: package smoke dry-run, fake interactive/structured evaluations (`3/3` each), dependency audit (`0 vulnerabilities`), and LLM configuration dry-run passed without network access.
- [x] 2026-09-16 automatic-gate recheck: `npm run verify` passed with `86` Vitest files / `433` tests and the production build; authoring E2E passed `17/17`; fake interactive and structured evaluations passed `3/3` each without network access; `npm audit --audit-level=high` reported `0 vulnerabilities`.
- [x] 2026-09-16 live-path dry-run recheck: interactive evaluation, structured evaluation, and LLM configuration smoke all passed in live `--dry-run` mode with `networkRequest=false`; no real model call was made.
- [x] 2026-09-16 bounded live provider smoke recheck: with a process-level `OPENAI_MODEL=deepseek-v4-flash` override, `npm run authoring:llm:smoke` passed with redacted metrics only (`332` input tokens, `107` output tokens, `1323ms` latency); no key, prompt, or raw response was written. This is provider connectivity evidence only and does not satisfy the human semantic score or final release-model confirmation.
- [x] 2026-09-16 controlled live review artifact: the same process-level model ran the single approved `zh-contemporary-6` fixture with `--save-review`; all `6/6` turns passed ending, choice-contract, risk-coverage, and consequence checks with `issueCodes=[]`, and the sanitized artifact `output/evaluations/interactive-review-zh-contemporary-6.md` was created. Human four-dimension scoring remains unchecked.
- [x] 2026-09-16 same-model review artifacts completed: `zh-fantasy-8` and `zh-suspense-16` were rerun with `OPENAI_MODEL=deepseek-v4-flash` and `--save-review`; they passed `8/8` and `16/16` respectively with `issueCodes=[]`. All three review artifacts use the same live model and passed the prompt/raw-response/secret scan; human four-dimension scoring remains unchecked.
- [x] 2026-09-16 backup freshness recheck: a new checkpoint was created, `db:authoring:restore-check -- --latest` restored a temporary copy at migration `13` with a readable graph, and `authoring:doctor` returned `status=ok` with `fresh` backup, writable SQLite, `integrity=ok`, loopback-only binding, and configured provider.
- [x] 2026-09-16 distribution recheck: standalone packaging and release evidence passed with `packageFileCount=2268`, `secretsIncluded=false`, `signed=false`; package smoke dry-run passed with `destructive=false`.
- [x] 2026-09-16 runtime recheck: the local service was restarted on `127.0.0.1:3202`; `GET /api/health` returned `status=ok`, version `0.1.7`, persistent SQLite storage, and configured LLM.
- [x] 2026-09-15 live hardening recheck: the configured `doubao-seed-evolving` model passed the bounded `zh-contemporary-6` (`6/6`), `zh-fantasy-8` (`8/8`), and `zh-suspense-16` (`16/16`) runs after the known root-level `endingReadiness` drift was normalized, the ending future-promise guard was added, and the 24-hour timeline prompt was strengthened. This is structural evidence only; four-dimension human scoring remains open.
- [x] Post-review-artifact package recheck: standalone packaging, release evidence, and non-destructive package smoke dry-run passed; the artifact scan reports `2268` files, `secretsIncluded=false`, and `signed=false`.
- [x] Isolated Local package smoke recheck passed all lifecycle phases and removed its unique temporary root while preserving the project data directory.
- [x] The controlled live evaluation command now has an explicit `--save-review` option for a local per-turn manual-review artifact; its network, paid-call, live, and single-fixture gates are covered by regression tests.
- [x] Preview clarification recheck: the footer now offers `继续分支写作` to return to the canonical model-driven `/generate` flow; the targeted browser regression passed `1/1`, `npm run verify` passed with `86` Vitest files / `416` tests, authoring E2E passed `16/16`, and the rebuilt standalone evidence remains `2268` files with `secretsIncluded: false` and `signed: false`.
- [x] PR `#3` feature-branch candidate commit `fd76beb` has a green remote CI run `34418237947`, and final documentation HEAD `fad001a` has a green recheck `34418692175`, covering `verify`, authoring E2E, Linux Docker health, and Windows standalone/native SQLite lifecycle. This does not substitute for the canonical `master` gate.
- [x] 2026-09-15 remote state recheck: the candidate branch and current `HEAD` resolve to `23a2aa0`; `origin/master` remains `e3c35cf`; remote `v0.1.7` resolves to historical commit `56dae71`, so no current-worktree tag was moved or created.
- [ ] Candidate is merged into the canonical `master` branch.
- [ ] The exact canonical-branch commit has a green remote CI run.
- [ ] A GitHub Release is created from the reviewed canonical-branch tag.
- [ ] The reviewed semantic-evaluation model matches the final `OPENAI_MODEL` used for release; the current local default is `doubao-seed-evolving`, unless the author explicitly switches and re-evaluates with `deepseek-v4-flash`.

- [x] Continuity anchor recheck: the interactive state can retain the current location, time, active characters, and scene goal; the next prompt, author UI, and sanitized manual-review artifact expose the ledger without adding author input. Generator, component, evaluation, and authoring E2E regressions passed.

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

- [x] The latest local verification after the interactive schema-drift retry, history status synchronization, provider error-category diagnostics, session deep-link, unknown token-usage budget, non-final prompt contract, high-priority thread retention, non-final ending repair, risk-choice repair, malformed active/ending repair, omitted-ending-marker repair, oversized-scene repair, whitespace legacy-memory filtering, full immutable-memory capacity, Zod schema classification, legacy-session choice-contract notice, previous-choice context, concrete-consequence normalization, bounded over-choice repair, known root-level `endingReadiness` normalization, ending future-promise guard, 24-hour timeline prompt, model-match gate, unknown-envelope-field rejection regression, zero-choice legacy-session UI/API recovery plus V2 backup round-trip, continuity-anchor propagation, and in-scene author-path explanation fixes passed with 86 Vitest files / 433 tests; the controlled live structural runs for the configured default model passed for `zh-contemporary-6`, `zh-fantasy-8`, and `zh-suspense-16`, while full manual multi-turn semantic review remains an explicit human gate.

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
