# StoryForge Production Maturity Design

**Date:** 2026-08-24
**Status:** Proposed
**Baseline:** `v0.1.3` on `codex/storyforge-phase-0`

## Product Objective

Turn StoryForge from a verified local authoring release candidate into a dependable private Windows product for one author. The product promise is not unlimited AI generation. It is a bounded creation loop that the author can control, recover, inspect, and install without operating a web service.

## Verified Baseline

- The authoring loop exists: project brief, finite graph generation, editor, validation gate, snapshot, offline HTML export, project backup/restore, and bounded interactive play.
- Release evidence records `55` Vitest files / `224` tests, `8` authoring E2E scenarios, a database smoke test, backup verification, and a fake-provider CI workflow.
- SQLite uses foreign keys, WAL, a five-second busy timeout, and migration-time integrity-checked backups.
- The default service binds to loopback. The LAN Compose override deliberately remains unauthenticated and is not a supported public deployment mode.

## Audit Findings

### P0: Release Truth And Automation

- The `v0.1.3` tag currently resolves to `codex/storyforge-phase-0`, not `master` or `origin/master`.
- CI only runs for pushes to `main`/`master` and pull requests targeting them. It does not run when this feature branch or its tag is pushed.
- `docs/release/authoring-verification.md` currently overstates that remote CI runs after branch and tag pushes. That claim must be corrected before the next release.
- `output/` is an untracked artifact directory rather than an ignored build/test output directory, so release evidence can be committed accidentally.

### P0: Generation Safety And Recovery

- A cancel or pause request can race with an in-flight provider call. `cancelRun()` changes leased steps to `canceled`, while `completeStep()` and `failStep()` still require the old lease and can turn the background `/next` request into an internal error. The final run state can be correct, but the user receives a misleading failure.
- Project, node, edge, and model input schemas have minimums but almost no maximum character, JSON-size, or model-policy limits. A very large brief can cause prompt bloat, slow requests, or unexpected API cost.
- Token usage is recorded after calls, but there is no per-run upper budget, confirmation of the expected request count, or provider-concurrency policy exposed to the author.

### P1: Data Durability And Supportability

- Database backups are created before migrations and manually on demand. There is no regular checkpoint policy, restore command, freshness status, or automated restore rehearsal.
- Project import defaults safely to a new ID in the UI, but the API supports destructive `replace` without first producing a recovery point or requiring a typed confirmation at the product boundary.
- Health is intentionally redacted, which is correct, but there is no privacy-safe local doctor report for migration state, backup freshness, writeability, configured-provider state, or actionable recovery guidance.

### P1: Security And Accessibility Baseline

- `X-Frame-Options` and related response headers are applied only to `/api/*`, leaving authoring pages outside the same clickjacking and browser-hardening policy.
- `next.config.ts` retains a stale LAN development origin and a wildcard remote-image configuration even though the product is text-only.
- `maximumScale: 1` prevents pinch zoom, which conflicts with the accessibility baseline expected of a formal authoring product.
- No automated accessibility tool is present. Existing E2E covers keyboard focus for project actions but does not test full keyboard authoring, async announcements, zoom, or contrast.

### P2: Quality, Distribution, And Governance

- Fake-provider contracts are strong, but there is no versioned Chinese evaluation corpus or release-quality scorecard for a real provider. The paid smoke check remains manual.
- The product is launched through Node or Docker. It has no supported Windows installer, data-location contract, upgrade/rollback behavior, or uninstall-with-data-preservation test.
- There is no release artifact workflow, GitHub Release procedure, dependency update policy, SBOM/license decision, or documented branch-protection requirement.

## Target Architecture

Keep the present local-first architecture. It is appropriate for the agreed product scope.

```text
Windows local app or loopback server
  -> Next.js authoring UI and typed local API
  -> one local Node process + SQLite WAL database
  -> bounded OpenAI-compatible text provider calls
  -> verified database/project backups and offline HTML exports
```

The product must remain single-author, text-first, private, and local. SQLite stays a single-process store; scaling the server horizontally, adding Redis, accounts, cloud synchronization, public sharing, or image generation is explicitly outside this roadmap.

## Product Invariants

1. A release tag is created only from the protected release branch after its exact commit has passed CI; every release record links to that run.
2. A cancellation may still incur an already-started provider call, but it never corrupts the run, silently applies discarded output, or reports a false internal failure.
3. Each generated run has a bounded request count, bounded input/output envelope, selected model policy, and an author-visible cost/risk preflight.
4. Every destructive operation has a non-destructive default and a recoverable path. Restore is practiced, not merely documented.
5. Diagnostics are local, redact secrets and story content by default, and give the author a precise next action.
6. The default install remains loopback-only. LAN is clearly unsafe, explicitly enabled, and never documented as public hosting.
7. A Windows distribution cannot overwrite or delete author data during install, upgrade, rollback, or uninstall without explicit author intent.

## Delivery Sequence

### Release A: Trustworthy Release And Generation Controls

Fix release lineage and CI triggers, correct release documentation, ignore generated artifacts, make cancellation races harmless, and add input/model/budget guardrails. This is the first implementation slice because it removes the current ambiguity between a tagged candidate and a verified release.

### Release B: Recoverable Local Operations

Add verified backup checkpoints, restore rehearsal, a safe replacement-import workflow, and a local doctor/recovery centre. The result is an author who can recover work without manually manipulating SQLite files.

### Release C: Quality And Accessibility Evidence

Introduce a versioned Chinese generation evaluation corpus, opt-in live-provider evidence with a strict spending cap, accessibility automation, and a browser-based manual accessibility review.

### Release D: Windows Product Distribution

Run a time-boxed packaging spike before committing to Electron, Tauri, or a supported Node installer. Choose only the option that satisfies data preservation, `better-sqlite3` compatibility, reproducible builds, and a low-friction private install. Do not build cloud features as a substitute for packaging.

### Release E: Ongoing Governance

Publish the first release from the stabilized process, then add dependency/update policy, release notes automation, dependency provenance evidence, and recurring recovery/evaluation checks.

## Decision Gates

1. **Release branch:** Standardize on remote `master` as the release source, or rename it to `main` once. Do not support two canonical branches.
2. **Backup retention:** Choose a personal-device policy before implementation. Recommended initial policy: last 14 daily database checkpoints, last 8 weekly checkpoints, and project JSON backups downloaded by the author.
3. **Cost cap:** Choose a default per-run token envelope and a monthly warning threshold. The app must block only when the author explicitly enables a hard cap; it must always warn before planned high-cost work.
4. **Distribution:** Select a packaging approach only after the Windows spike reports build size, native SQLite behavior, data-path behavior, upgrade/rollback outcome, and code-signing cost.
5. **Scope:** Login, cloud sync, collaboration, public sharing, images, and audio require a separate product/security design and are not prerequisites for formalizing this private app.

## Completion Criteria

The next formal product release may be called dependable only when all Release A and Release B acceptance checks pass, the exact release commit has passed remote CI, a live-provider smoke/evaluation has been manually approved and recorded without secrets, and an operator can complete the documented recovery drill on a clean machine.
