# StoryForge Phase 5 Local Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the authoring workflow as a dependable local product with backup/restore, migration safety, persisted cost visibility, offline export proof, loopback security, clean documentation, and retired prototype defaults.

**Architecture:** Add operational safeguards around the finished authoring core, then remove legacy UI and asset dependencies only after migration and clean-install gates pass. Preserve old data through a read-only legacy export window rather than destructive conversion.

**Tech Stack:** Next.js 16, SQLite, Node.js 24, npm, Vitest, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-19-storyforge-local-authoring-platform-design.md`

## Global Constraints

- Never delete user databases or legacy sessions automatically.
- Backup before migration and verify backup integrity before applying schema changes.
- Project backups exclude API keys and import atomically.
- Export offline verification must run with networking blocked and StoryForge stopped.
- Legacy code is removed only after the authoring E2E and data-preservation checks pass.

---

## Locked Interfaces

```ts
export const ProjectBackupV1Schema: z.ZodType<ProjectBackupV1>;
export async function exportProjectBackup(projectId: string): Promise<ProjectBackupV1>;
export async function importProjectBackup(input: unknown, mode: "new-id" | "replace"): Promise<Project>;
export async function backupBeforeMigration(dbPath: string, targetVersion: number): Promise<BackupResult>;
export async function getProjectGenerationMetrics(projectId: string): Promise<ProjectGenerationMetrics>;
export function assertSafeBindHost(host: string, allowUnsafe: boolean): void;
```

Backup schema marker is exactly `storyforge-project@1`. Missing token-price configuration produces `estimatedCost: null`.

### Task 1: Implement versioned project backup and atomic restore

**Files:**
- Create: `src/lib/authoring/backup.ts`
- Create: `src/app/api/projects/[projectId]/backup/route.ts`
- Create: `src/app/api/projects/import/route.ts`
- Modify: `src/features/authoring/project-library.tsx`
- Create: `src/__tests__/authoring/backup.test.ts`

**Interfaces:**
- Produces: `exportProjectBackup(projectId): ProjectBackupV1`; `importProjectBackup(input, mode: "new-id" | "replace"): Project`; schema marker `storyforge-project@1`.

- [x] **Step 1: Test full round-trip, invalid schema, duplicate ID modes, secret exclusion, and transaction rollback**

- [x] **Step 2: Implement canonical JSON backup and library controls**

Include project, versions, chapters, nodes, edges, generation metadata, and validation status; exclude environment values, raw authorization headers, API keys, and transient leases. Validate the complete document before beginning a transaction. Add project-library actions to download one backup and select a local JSON file for import; show schema and transaction errors without discarding the selected file.

- [x] **Step 3: Run and commit**

Run: `npm test -- src/__tests__/authoring/backup.test.ts`

```powershell
git add src/lib/authoring/backup.ts src/app/api/projects/[projectId]/backup src/app/api/projects/import src/features/authoring/project-library.tsx src/__tests__/authoring/backup.test.ts
git commit -m "feat: add atomic project backup and restore"
```

### Task 2: Add database pre-migration backup and recovery checks

**Files:**
- Create: `src/lib/authoring/database-backup.ts`
- Modify: `src/lib/authoring/database.ts`
- Create: `src/scripts/authoring-db-backup.ts`
- Create: `src/__tests__/authoring/database-backup.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `backupBeforeMigration(dbPath, targetVersion): BackupResult`; `npm run db:authoring:backup`.

- [ ] **Step 1: Test backup success, disk failure, checksum, retention, and failed-migration preservation**

- [ ] **Step 2: Implement backup-before-migrate**

Use SQLite's backup API, reopen the copy read-only, run `PRAGMA integrity_check`, store SHA-256 and source migration version, and only then apply migrations. Keep the newest 10 automatic backups; never prune manual backups.

- [ ] **Step 3: Run and commit**

Run: `npm test -- src/__tests__/authoring/database-backup.test.ts`

Run: `npm run db:authoring:backup`

```powershell
git add src/lib/authoring/database-backup.ts src/lib/authoring/database.ts src/scripts/authoring-db-backup.ts src/__tests__/authoring/database-backup.test.ts package.json
git commit -m "feat: protect authoring migrations with backups"
```

### Task 3: Add persisted local metrics and honest cost display

**Files:**
- Modify: `src/lib/authoring/metrics.ts`
- Create: `src/app/api/projects/[projectId]/metrics/route.ts`
- Create: `src/features/authoring/project-metrics.tsx`
- Modify: `src/app/(authoring)/projects/[projectId]/edit/page.tsx`
- Create: `src/__tests__/authoring/metrics.test.ts`

**Interfaces:**
- Produces: calls, retries, failures by code, input/output tokens, stage latency, P50/P95, and optional estimate from configured per-million-token prices.

- [ ] **Step 1: Test persisted aggregates, percentile ordering, missing price, and restart survival**

- [ ] **Step 2: Implement SQL-backed metrics**

When price configuration is absent, return `estimatedCost: null` and show tokens only. Never use the existing process-memory arrays as the authoring source of truth. Link the metrics panel from the project editor and label estimates separately from provider invoices.

- [ ] **Step 3: Run and commit**

Run: `npm test -- src/__tests__/authoring/metrics.test.ts`

```powershell
git add src/lib/authoring/metrics.ts src/app/api/projects/[projectId]/metrics src/features/authoring/project-metrics.tsx src/app/(authoring)/projects/[projectId]/edit/page.tsx src/__tests__/authoring/metrics.test.ts
git commit -m "feat: persist local generation metrics"
```

### Task 4: Harden and prove offline HTML export

**Files:**
- Modify: `src/lib/authoring/export-html.ts`
- Create: `e2e/authoring-offline-export.spec.ts`
- Create: `src/__tests__/authoring/export-private-fields.test.ts`

**Interfaces:**
- Consumes: sealed reader-safe snapshot.
- Produces: CSP-constrained standalone HTML with zero network requests and local progress.

- [ ] **Step 1: Add a denylist test for every private field family**

Cover API key patterns, base URL credentials, raw prompts, raw responses, objectives, canon, author notes, leases, errors, and internal IDs not needed by runtime.

- [ ] **Step 2: Add browser network interception that fails any request**

Download the HTML, stop/release the web server used for authoring, open the local file in a separate Playwright context, select through an ending, reload, verify progress, back, and restart.

- [ ] **Step 3: Run and commit**

Run: `npm test -- src/__tests__/authoring/export-private-fields.test.ts`

Run: `npm run test:e2e -- e2e/authoring-offline-export.spec.ts`

```powershell
git add src/lib/authoring/export-html.ts e2e/authoring-offline-export.spec.ts src/__tests__/authoring/export-private-fields.test.ts
git commit -m "test: prove offline private story export"
```

### Task 5: Enforce local-only startup and document recovery

**Files:**
- Create: `src/lib/authoring/local-security.ts`
- Modify: `package.json`
- Modify: `next.config.ts`
- Create: `src/__tests__/authoring/local-security.test.ts`
- Modify: `README.md`
- Create: `docs/authoring-user-guide.md`
- Create: `docs/authoring-recovery.md`

**Interfaces:**
- Produces: `assertSafeBindHost(host, allowUnsafe): void`; default scripts bind `127.0.0.1`; explicit `STORYFORGE_ALLOW_LAN=true` warning path.

- [ ] **Step 1: Test loopback allow, LAN deny, and explicit warning override**

- [ ] **Step 2: Change start scripts to explicit loopback binding**

Document installation, environment configuration, generation recovery, project backup, database backup, HTML export, and what data is never included. Do not advertise public sharing or multi-user safety.

- [ ] **Step 3: Run and commit**

Run: `npm test -- src/__tests__/authoring/local-security.test.ts`

```powershell
git add src/lib/authoring/local-security.ts package.json next.config.ts src/__tests__/authoring/local-security.test.ts README.md docs/authoring-user-guide.md docs/authoring-recovery.md
git commit -m "docs: formalize local-only operation"
```

### Task 6: Retire legacy defaults without deleting user data

**Files:**
- Remove after verified legacy export: legacy game components and routes, `src/lib/asset-queue.ts`, `src/lib/asset-service.ts`, `src/lib/asset-job-service.ts`, `src/lib/object-storage.ts`, `src/scripts/asset-worker.ts`, and image routes/components
- Modify: `package.json`
- Modify: `src/app/api/health/route.ts`
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Test: `src/__tests__/authoring/no-legacy-defaults.test.ts`

**Interfaces:**
- Produces: authoring-only default UI/build/health; read-only `npm run legacy:export` during the migration window.

- [ ] **Step 1: Add a regression test for forbidden default dependencies**

Assert default authoring modules do not import BullMQ, ioredis, AWS SDK, asset modules, game store, or legacy routes; health JSON has no Redis/image requirement.

- [ ] **Step 2: Add and verify legacy data export before route retirement**

Provide a script that lists existing legacy sessions and exports each as the existing JSON/Markdown format. Never migrate them silently into authoring projects because the graph semantics differ.

- [ ] **Step 3: Remove packages only after import graph and legacy export tests pass**

Remove `@aws-sdk/client-s3`, `bullmq`, `ioredis`, and unused image dependencies from `package.json`; regenerate npm lock; simplify Docker/compose to the local text app.

- [ ] **Step 4: Run full regression and commit**

Run: `npm run verify`

Run: `npm run legacy:export -- --dry-run`

```powershell
git add -A src package.json package-lock.json Dockerfile docker-compose.yml
git commit -m "refactor: retire legacy game and asset defaults"
```

### Task 7: Execute the clean-install release gate

**Files:**
- Create: `e2e/authoring-release-flow.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/release/authoring-verification.md`
- Create: `docs/release/authoring-release-checklist.md`

**Interfaces:**
- Produces: `npm run test:e2e:authoring`; final evidence for every master coverage row.

- [ ] **Step 1: Add one release E2E covering the whole product**

Create a project, generate with fixtures, resume one failure, edit, validate, resolve issues, preview, snapshot, export offline, backup, delete, import, and compare restored graph/version counts.

- [ ] **Step 2: Run from a clean secondary directory**

Clone or copy tracked files to a new directory, run `npm ci`, configure a temporary SQLite path and fake provider, then execute all final commands. Do not reuse the existing `node_modules`, `.next`, or database.

- [ ] **Step 3: Run final commands**

Run: `npm run verify`

Run: `npm run test:e2e:authoring`

Run: `npm run db:authoring:smoke`

Run: `npm run db:authoring:backup`

Expected: all exit 0; exported HTML passes offline; no Redis/image/public-auth service starts.

- [ ] **Step 4: Complete the coverage audit**

For every row in the master coverage matrix, link the exact passing test or manual command in `docs/release/authoring-verification.md`. Record test counts, durations, Node/npm versions, database migration version, and residual risks.

- [ ] **Step 5: Commit release evidence**

```powershell
git add e2e/authoring-release-flow.spec.ts .github/workflows/ci.yml docs/release/authoring-verification.md docs/release/authoring-release-checklist.md package.json package-lock.json
git commit -m "release: verify local authoring product"
```

## Phase 5 Completion Gate

- [ ] Project backup restores atomically into an empty database.
- [ ] Migration backup passes integrity check and retention tests.
- [ ] Metrics survive process restart and never invent cost without price data.
- [ ] Offline HTML completes a path with networking denied and server stopped.
- [ ] Default startup binds loopback and warns on explicit LAN override.
- [ ] Legacy sessions remain exportable before retirement and are never auto-deleted.
- [ ] Default UI, health, build, dependencies, and documentation contain no image/Redis/public-sharing path.
- [ ] Clean secondary-directory install passes the complete release gate.
