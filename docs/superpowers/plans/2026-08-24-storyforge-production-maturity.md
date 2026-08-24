# StoryForge Production Maturity Implementation Plan

> **For agentic workers:** Execute one release slice at a time. Every behavioral task is test-first, preserves the private local-only boundary, and ends with focused tests before the full verification gate.

**Goal:** Make StoryForge a trustworthy private Windows authoring product by ensuring released code is verifiably the code that was tested, AI runs are bounded and cancellable, author data is recoverable, failures are diagnosable, and distribution has a deliberate installation path.

**Architecture:** Retain the single-process Next.js + SQLite local-first model. Add durable operational metadata around it rather than cloud services or multi-user infrastructure. Treat a real provider request as an opt-in, bounded operator action; automated tests continue to use the fake provider.

**Tech Stack:** Next.js 16.3.1, React 19, TypeScript, Node 24, better-sqlite3, Zod, Vitest, Playwright, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-24-storyforge-production-maturity-design.md`

## Global Constraints

- Preserve private, single-author, text-only, local-first scope. Do not add login, cloud sync, public sharing, image generation, Redis, or a second database.
- Keep default network binding on loopback. The existing LAN override remains an unsafe, explicit operator choice and is never a public deployment option.
- Never log, export, back up, display, or commit API keys, authorization headers, raw prompts, raw provider responses, or diagnostic paths by default.
- Do not move or retag `v0.1.3`; treat it as a historical candidate. The next release must establish clean, reproducible lineage.
- No task is complete merely because a unit test passes. Run the stated focused test, then the release-level verification for the affected slice.

## Release A: Release Truth And Bounded Generation

### Task 1: Establish One Release Lineage And Accurate CI Evidence

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.gitignore`
- Modify: `docs/release/authoring-verification.md`
- Modify: `docs/release/authoring-release-checklist.md`
- Create: `docs/release/github-release-procedure.md`
- Create: `src/__tests__/authoring/release-governance.test.ts`

**Implementation:**

1. Write a failing static contract test that asserts CI validates pull requests to the selected canonical branch, tags matching `v*`, and manual dispatches; assert that `output/` is ignored.
2. Update the workflow to test a release tag and to retain fake-provider execution. Add Playwright trace/upload-on-failure behavior without exposing artifacts containing data or secrets.
3. Correct the verification document: remote CI is not considered passed until the linked GitHub Actions run is green. Record that `v0.1.3` is not a tag on the release branch; do not rewrite history.
4. Document the human-only GitHub settings: protected canonical branch, required `verify` and `e2e-authoring` checks, review before merge, and a GitHub Release created only from the green release tag.
5. Add `output/` to `.gitignore`. Preserve existing local files; never delete test evidence during this task.

**Focused verification:**

```powershell
npm test -- src/__tests__/authoring/release-governance.test.ts
git check-ignore -v output
```

**Acceptance:** A new tag pipeline can be traced to a commit on the canonical branch; documentation makes no claim about unobserved remote CI.

### Task 2: Make Pause And Cancellation Race-Safe

**Files:**
- Modify: `src/lib/authoring/generation/repository.ts`
- Modify: `src/lib/authoring/generation/executor.ts`
- Modify: `src/lib/authoring/generation/provider-errors.ts`
- Modify: `src/app/api/projects/[projectId]/generation/[runId]/next/route.ts`
- Modify: `src/features/authoring/generation-progress.tsx`
- Modify: `src/__tests__/authoring/generation/executor.test.ts`
- Modify: `src/__tests__/authoring/generation/repository.test.ts`
- Create: `e2e/authoring-generation-cancel.spec.ts`

**Implementation:**

1. Write a failing repository test that leases a step, cancels or pauses its run, then completes or fails the old lease. Assert the terminal/paused state is retained and no `500`-style error is produced.
2. Introduce an explicit stale-lease/cancelled outcome distinct from storage failure. `completeStep()` and `failStep()` must be idempotent for terminal steps and must not add tokens or materialize output after cancellation.
3. Check run status immediately before provider work and immediately before persistence. A request already sent to the provider may be billed, but its late response must be discarded after cancellation.
4. Use an `AbortController` for the browser polling request and stop scheduling when pause/cancel wins. Show the truthful message: "an already-started model request may still complete, but its result will not be applied."
5. Verify the normal resume path still reuses persisted successful steps and the original bounded generation loop does not regress.

**Focused verification:**

```powershell
npm test -- src/__tests__/authoring/generation/executor.test.ts src/__tests__/authoring/generation/repository.test.ts src/__tests__/authoring/editor/generation-progress.test.tsx
npm run test:e2e:authoring -- --grep "cancel"
```

**Acceptance:** Pause/cancel during a delayed fake-provider response preserves valid state, produces an actionable user status, and never applies canceled output.

### Task 3: Bound Input, Model Selection, And Planned Spend

**Files:**
- Modify: `src/lib/authoring/api-contracts.ts`
- Modify: `src/lib/authoring/schemas.ts`
- Modify: `src/lib/authoring/generation/api-contracts.ts`
- Modify: `src/lib/authoring/generation/runtime.ts`
- Modify: `src/lib/authoring/generation/prompts.ts`
- Modify: `src/lib/authoring/metrics-contracts.ts`
- Modify: `src/lib/authoring/metrics.ts`
- Modify: `src/features/authoring/project-brief-form.tsx`
- Modify: `src/features/authoring/generation-progress.tsx`
- Create: `src/lib/authoring/generation/budget.ts`
- Create: `src/__tests__/authoring/generation/budget.test.ts`
- Modify: `src/__tests__/authoring/schemas.test.ts`
- Modify: `src/__tests__/authoring/generation/api.test.ts`

**Implementation:**

1. First add failing Zod tests for each author-entered field, editable graph field, `settingsJson`, import payload, and model field at their proposed maximum size. Define limits by narrative need, not arbitrary UI width, and return validation messages that say how to reduce the input.
2. Resolve the model on the server from an explicit local model policy. Default to `OPENAI_MODEL`; do not let an arbitrary request model silently create an unbounded provider/cost surface.
3. Calculate the finite request count and maximum configured output-token envelope for each size preset before creating a run. Persist the planned envelope and policy version with the run.
4. Add a preflight screen that shows the selected model, planned calls, max output envelope, configured price estimate when available, and whether a user-configured hard cap would block the run. Require explicit confirmation only for warning/cap conditions; do not add needless friction for ordinary micro runs.
5. Stop future calls once the configured hard cap is reached and report a resumable, user-visible budget state. Preserve existing completed steps and metrics.

**Focused verification:**

```powershell
npm test -- src/__tests__/authoring/schemas.test.ts src/__tests__/authoring/generation/budget.test.ts src/__tests__/authoring/generation/api.test.ts src/__tests__/authoring/metrics.test.ts
```

**Acceptance:** No unbounded author input or arbitrary model value reaches the provider. Before a model request, the author can see and control its bounded envelope.

### Release A Gate

```powershell
npm run verify
npm run test:e2e:authoring
npm run db:authoring:smoke
```

Record the exact commit, local command results, and linked remote CI run. Do not tag until the pull request to the canonical branch has been reviewed and merged.

## Release B: Recoverable Local Operations

### Task 4: Add Checkpointed Backup And Restore Rehearsal

**Files:**
- Modify: `src/lib/authoring/database-backup.ts`
- Modify: `src/lib/authoring/database.ts`
- Modify: `src/scripts/authoring-db-backup.ts`
- Create: `src/scripts/authoring-db-restore-check.ts`
- Modify: `package.json`
- Modify: `docs/authoring-recovery.md`
- Create: `docs/operations/backup-retention.md`
- Modify: `src/__tests__/authoring/database-backup.test.ts`
- Create: `src/__tests__/authoring/database-restore-check.test.ts`

**Implementation:**

1. Write failing tests for an atomic database checkpoint manifest containing file name, creation time, SHA-256, database schema version, size, and integrity result. Test retention deterministically with a controllable clock.
2. Keep migration backups, but add an operator-invoked scheduled checkpoint command suitable for Windows Task Scheduler and the future desktop package. Do not rely on a transient Next.js request to schedule daily backups.
3. Implement `db:authoring:restore-check`: copy a selected backup into a temporary directory, run migrations/read-only integrity checks, verify expected authoring tables, and remove only the temporary verification copy.
4. Update the recovery guide with a non-destructive sequence: stop the app, create a new current-database checkpoint, rehearse the candidate backup, restore by copying, then confirm the project count and graph readability.
5. Document recommended 14-daily / 8-weekly retention and how the author changes it. Retention deletion must never target a path outside the configured backup directory.

**Focused verification:**

```powershell
npm test -- src/__tests__/authoring/database-backup.test.ts src/__tests__/authoring/database-restore-check.test.ts
npm run db:authoring:backup
npm run db:authoring:restore-check -- --latest
```

**Acceptance:** A backup is not called healthy until a temporary restore rehearsal succeeds; all destructive paths are contained within the configured backup directory.

### Task 5: Protect Destructive Project Replacement

**Files:**
- Modify: `src/lib/authoring/backup.ts`
- Modify: `src/app/api/projects/import/route.ts`
- Modify: `src/features/authoring/project-library.tsx`
- Modify: `src/lib/authoring/api-contracts.ts`
- Modify: `src/__tests__/authoring/backup.test.ts`
- Modify: `src/__tests__/authoring/backup-api.test.ts`
- Modify: `e2e/authoring-release-flow.spec.ts`

**Implementation:**

1. Keep `new-id` as the default and write failing tests that `replace` requires an explicit replacement contract including the target project identity and confirmation phrase.
2. Before replacing an existing project, generate a verified local project backup/checkpoint and return its recovery reference without embedding private provider data.
3. Make UI replacement a separate advanced action with project-title confirmation; imports from the normal library control always create a new project.
4. Test invalid backup, failed pre-replacement checkpoint, and failed insertion all leave the original project intact.

**Focused verification:**

```powershell
npm test -- src/__tests__/authoring/backup.test.ts src/__tests__/authoring/backup-api.test.ts
npm run test:e2e:authoring -- --grep "restores"
```

**Acceptance:** An author can neither overwrite a project accidentally nor lose it if a replacement import fails.

### Task 6: Provide A Privacy-Safe Local Doctor And Recovery Centre

**Files:**
- Create: `src/lib/authoring/diagnostics.ts`
- Create: `src/scripts/authoring-doctor.ts`
- Modify: `package.json`
- Create: `src/app/api/diagnostics/route.ts`
- Modify: `src/features/authoring/project-library.tsx`
- Modify: `src/app/api/health/route.ts`
- Create: `src/__tests__/authoring/diagnostics.test.ts`
- Modify: `src/__tests__/api-health.test.ts`
- Modify: `docs/authoring-recovery.md`

**Implementation:**

1. Define a small diagnostic schema with only status, timestamps, migration version, backup freshness class, writeability, database integrity, loopback/LAN mode, and provider configured/not-configured. Explicitly exclude paths, hostnames, API keys, project titles, prompt text, and raw provider errors.
2. Write redaction tests first, including a fixture with secrets and a filesystem path that must never appear in a browser or command report.
3. Add `npm run authoring:doctor` for the full local report and a concise Recovery Centre panel in the existing project library. Each non-healthy item links to a concrete local recovery action.
4. Keep `/api/health` limited to liveness/readiness; do not turn it into a data-bearing diagnostic endpoint.

**Focused verification:**

```powershell
npm test -- src/__tests__/authoring/diagnostics.test.ts src/__tests__/api-health.test.ts src/__tests__/authoring/project-library.test.tsx
npm run authoring:doctor
```

**Acceptance:** A non-technical author can determine whether a local setup is safe to create with and what recovery action to take, without exposing private data.

### Release B Gate

```powershell
npm run verify
npm run test:e2e:authoring
npm run db:authoring:smoke
npm run db:authoring:backup
npm run db:authoring:restore-check -- --latest
```

Perform one clean-machine, non-destructive recovery drill and record only paths/identifiers that are safe to publish.

## Release C: Security, Accessibility, And Generation Quality Evidence

### Task 7: Complete The Local Security And Accessibility Baseline

**Files:**
- Modify: `src/proxy.ts`
- Modify: `next.config.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/lib/authoring/api-contracts.ts`
- Modify: `src/__tests__/authoring/local-security.test.ts`
- Modify: `src/__tests__/api-health.test.ts`
- Modify: `playwright.config.ts`
- Create: `e2e/authoring-accessibility.spec.ts`
- Modify: `docs/authoring-user-guide.md`

**Implementation:**

1. Add tests before configuration changes: authoring pages and API responses receive modern anti-framing, MIME-sniffing, referrer, permissions, and CSP policy appropriate to the verified Next runtime. Do not adopt a CSP that breaks Next scripts; document any required nonce/inline-script handling.
2. Remove the stale fixed LAN development origin and the unused wildcard remote-image pattern. Keep an explicit test proving the text-only app does not configure remote images.
3. Apply an HTTP request-size policy to JSON API mutations and imports. Limits must correspond to the validated narrative/import limits from Task 3 and return a useful validation error.
4. Remove `maximumScale: 1`. Add keyboard, focus-visible, async `role=status`/`role=alert`, and reduced-motion checks for the project library, generation, editor, and interactive play.
5. Add automated axe coverage to critical browser flows. A manual browser-based visual audit remains a release gate and must be performed with the user's approved browser before claiming WCAG conformance.

**Focused verification:**

```powershell
npm test -- src/__tests__/authoring/local-security.test.ts src/__tests__/api-health.test.ts
npm run test:e2e:authoring -- --grep "accessibility"
```

**Acceptance:** The app no longer blocks browser zoom, no longer carries unused remote-image/LAN allowances, and critical authoring paths have automated plus manual accessibility evidence.

### Task 8: Create A Versioned Generation Evaluation Harness

**Files:**
- Create: `src/fixtures/authoring/evaluations/*.json`
- Create: `src/lib/authoring/generation/evaluation.ts`
- Create: `src/scripts/authoring-evaluate.ts`
- Modify: `package.json`
- Create: `docs/quality/generation-evaluation.md`
- Create: `src/__tests__/authoring/generation/evaluation.test.ts`
- Modify: `.github/workflows/ci.yml`

**Implementation:**

1. Define a small, sanitized Chinese corpus spanning suspense, fantasy, and contemporary stories. Each fixture declares finite node/end limits, required decision points, language expectation, and acceptance assertions; never include personal work or API data.
2. Write failing fake-provider tests for invalid schema, missing branch, wrong language, missing ending, and cancellation/budget outcomes.
3. Add a deterministic CI evaluation using the fake provider. Store machine-readable results and prompt/policy version, not raw prompts/responses.
4. Add an opt-in live evaluation command that defaults to dry-run, shows planned calls and a hard operator-supplied cost cap, and writes only redacted summary metrics. Do not call it from CI.
5. Define a release quality scorecard: structural pass rate, choice/ending contract pass rate, language match, schema failure rate, retry rate, latency, and manually reviewed prose samples.

**Focused verification:**

```powershell
npm test -- src/__tests__/authoring/generation/evaluation.test.ts
npm run authoring:evaluate -- --provider fake
npm run authoring:evaluate -- --dry-run --provider live
```

**Acceptance:** Prompt or provider changes can be compared against a stable corpus before they reach the authoring workflow, without automated paid calls.

## Release D: Windows Distribution Decision And Delivery

### Task 9: Run A Time-Boxed Packaging Spike

**Files:**
- Create: `docs/architecture/windows-packaging-decision.md`
- Create: `docs/operations/windows-data-lifecycle.md`
- Create: `scripts/package-smoke.ps1`
- Create: `src/__tests__/authoring/distribution-contract.test.ts`

**Implementation:**

1. Compare three approaches against the exact current app: documented Node installer, Electron wrapping the Next standalone server, and Tauri/native alternative. Do not start a production migration yet.
2. For each option, measure clean install, first launch, `better-sqlite3` native compatibility, `%LOCALAPPDATA%` data and backup location, `.env`/secret handling, upgrade, failed-upgrade rollback, uninstall without data deletion, package size, build reproducibility, and code-signing requirements.
3. Use a disposable Windows test account or directory. The smoke script may only create and delete within its verified temporary root.
4. Record a recommendation and an explicit rejected-option rationale. Choose the smallest supported path that preserves author data; no automatic updater is required in the first packaged version.

**Focused verification:**

```powershell
pwsh -File scripts/package-smoke.ps1 -Mode DryRun
npm test -- src/__tests__/authoring/distribution-contract.test.ts
```

**Acceptance:** The project has an evidence-based packaging decision and a data lifecycle contract before an installer is promised to the author.

### Task 10: Package The Chosen Distribution And Release It From The Green Branch

**Files:**
- Determined by Task 9 decision record.
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/release/authoring-release-checklist.md`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/release/windows-install-and-rollback.md`

**Implementation:**

1. Implement only the selected distribution design, with data and backups outside the installation directory.
2. Add clean install, upgrade, rollback, and uninstall-preserves-data checks to the release checklist and CI where the runner can support them; retain a documented Windows manual gate where it cannot.
3. Create the release from the merged canonical branch: version bump, full local verification, reviewed pull request, green remote CI, annotated tag, GitHub Release notes/artifact checksums, and recorded live-provider smoke/evaluation approval.
4. Add a dependency update, license/SBOM, and release evidence policy appropriate to the chosen distribution. Keep private repositories private unless the user makes an explicit licensing/publication decision.

**Acceptance:** A new Windows user can install, author, back up, upgrade, and recover a private story without installing project dependencies or exposing the service to a network.

## Final Formal-Release Gate

```powershell
npm ci
npm run verify
npm run test:e2e:authoring
npm run db:authoring:smoke
npm run db:authoring:backup
npm run db:authoring:restore-check -- --latest
npm run authoring:doctor
npm run authoring:llm:smoke -- --dry-run
npm run release:evidence
```

After the user authorizes cost, run the bounded live smoke/evaluation once and record only the redacted result. Confirm the GitHub Actions run for the exact canonical-branch commit is green before creating the next version tag and GitHub Release.

## Plan Self-Review

- Release lineage, CI, test artifacts, recovery, generation races, bounds, security, accessibility, quality evidence, packaging, and documentation are each explicitly assigned to a release slice.
- The plan distinguishes code work from external human GitHub settings and paid provider checks.
- The plan keeps the agreed private local, single-author, text-only scope and treats packaging as a decision gate rather than an assumption.
