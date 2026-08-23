# Changelog

All notable changes to StoryForge are documented here.

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
