# Changelog

All notable changes to StoryForge are documented here.

## [Unreleased]

暂无未发布变更。

## [0.1.4] - 2026-08-24

### Reliability and Generation Controls

- Made pause and cancellation safe against late provider responses; discarded results are no longer persisted after the run stops.
- Added server-side authoring input limits, configured-model enforcement, per-run output budgets, large-run confirmation, and optional hard output caps.
- Added generation budget persistence with a backward-compatible SQLite migration and backup/import support.
- Added CI tag/manual triggers, failure artifact retention, and a documented GitHub release procedure.

### Verification

- Release A working-tree evidence: `npm run verify`, 57 Vitest files / 240 tests, 9 authoring E2E tests, and SQLite smoke all passed on 2026-08-24.
- Release B evidence: checkpoint/restore-check commands and replacement recovery tests passed locally; the Recovery Centre and privacy-safe doctor are included.
- Release C evidence: security baseline, request-size policy, axe accessibility flow, and fake generation evaluation passed locally.
- Release D evidence: Windows package lifecycle smoke, live provider smoke, CycloneDX SBOM, and standalone checksum generation passed; no signed installer is published.
- This release candidate is not tagged or merged to `master`; it is not a published release yet.

## [0.1.3] - 2026-08-24

### Product

- Added a bounded, choice-driven interactive player that generates one scene at a time and ends within the project's configured turn policy.
- Added local interactive session history with resume, export, and deletion controls.
- Added project title, genre, premise, and status filtering with responsive desktop/mobile coverage.

### Reliability and Security

- Added versioned project backup V2 with interactive sessions and turns, while keeping V1 import compatibility.
- Restricted default Docker exposure to loopback and added an explicit LAN override compose file.
- Removed filesystem and provider details from the health response and aligned the privacy documentation with local-only behavior.
- Added deterministic fake-provider CI coverage, dependency auditing, database smoke checks, and release E2E coverage.

### Verification

- `npm run verify`: 55 test files and 224 tests passed.
- `npm run test:e2e:authoring`: 8 tests passed.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
