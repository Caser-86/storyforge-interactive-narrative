# StoryForge Phase 4 Quality Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn structural and literary review into a persisted release gate that locates problems, protects snapshots, and proves every published path closes.

**Architecture:** Deterministic structural and rule validators run first and are authoritative. An optional AI reviewer adds warning-only semantic issues; a release service reconciles persisted issues and is the sole entry point for sealing/export authorization.

**Tech Stack:** TypeScript, Zod, SQLite, DeepSeek provider abstraction, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-storyforge-local-authoring-platform-design.md`

## Global Constraints

- Structural blocking issues cannot be dismissed.
- AI review can create warnings only and never mutates prose.
- Validation results are tied to an exact draft revision.
- Snapshot and export routes call the same release gate immediately before acting.
- Path testing must cover every node and edge even when complete path enumeration is capped.

---

## Locked Interfaces

```ts
export type ValidationSource = "structural" | "rule" | "ai_review";
export type ValidationSeverity = "blocking" | "warning";

export async function validateDraft(
  projectId: string,
  sources: ValidationSource[],
): Promise<ValidationRunResult>;

export async function getReleaseDecision(projectId: string): Promise<ReleaseDecision>;
export async function assertReleaseReady(projectId: string, expectedRevision: number): Promise<ReleaseDecision>;
```

`ReleaseDecision.allowed` is true only when generation is complete, validation revision equals draft revision, and no open blocking issue exists.

### Task 1: Persist validation issues and runs

**Files:**
- Modify: `src/lib/authoring/migrations.ts`
- Create: `src/lib/authoring/validation/repository.ts`
- Create: `src/lib/authoring/validation/schemas.ts`
- Test: `src/__tests__/authoring/validation/repository.test.ts`

**Interfaces:**
- Produces: `replaceIssues(versionId, revision, source, issues)`, `resolveIssue`, `dismissWarning`, `listIssues`; unique issue fingerprint by source/code/node/edge/details.

- [ ] **Step 1: Test replacement, stable fingerprints, resolution, and blocking-dismiss rejection**

- [ ] **Step 2: Add `validation_runs` and `validation_issues` migrations and repository**

Persist `source`, `severity`, `code`, message, node/edge IDs, details, status, draft revision, timestamps. Re-running one source replaces only that source's open issues for the same revision.

- [ ] **Step 3: Run and commit**

Run: `npm test -- src/__tests__/authoring/validation/repository.test.ts`

```powershell
git add src/lib/authoring/migrations.ts src/lib/authoring/validation src/__tests__/authoring/validation/repository.test.ts
git commit -m "feat: persist authoring validation issues"
```

### Task 2: Implement deterministic prose and branch rules

**Files:**
- Create: `src/lib/authoring/validation/rules.ts`
- Create: `src/__tests__/authoring/validation/rules.test.ts`

**Interfaces:**
- Consumes: `StoryGraph`, bible, outline.
- Produces: warning codes `SIMILAR_CHOICES`, `REPEATED_PROSE`, `DEPTH_IMBALANCE`, `SIMILAR_ENDINGS`, `MERGE_FACT_CONFLICT`, `MISSING_THREAD_RESOLUTION`.

- [ ] **Step 1: Add positive and negative fixture tests for every rule**

- [ ] **Step 2: Implement deterministic thresholds as named constants**

Use normalized token/Jaccard similarity for choices and endings, repeated n-gram detection for prose, min/max path depth ratio for imbalance, and explicit canon/thread references for merge and resolution checks. Include measured values in issue details.

- [ ] **Step 3: Run and commit**

Run: `npm test -- src/__tests__/authoring/validation/rules.test.ts`

```powershell
git add src/lib/authoring/validation/rules.ts src/__tests__/authoring/validation/rules.test.ts
git commit -m "feat: add deterministic story quality rules"
```

### Task 3: Add warning-only AI continuity review

**Files:**
- Create: `src/lib/authoring/validation/ai-review.ts`
- Create: `src/lib/authoring/validation/ai-review-schema.ts`
- Test: `src/__tests__/authoring/validation/ai-review.test.ts`

**Interfaces:**
- Consumes: `GenerationProvider`, chapter summaries, canon, character cards, ending summaries.
- Produces: warning codes `CHARACTER_CONTRADICTION`, `TIMELINE_CONTRADICTION`, `SETTING_CONTRADICTION`, `ARC_UNRESOLVED`, `PACING`, `ENDING_QUALITY`.

- [ ] **Step 1: Test schema rejection, warning-only coercion, and no-prose mutation**

- [ ] **Step 2: Implement chapter batches followed by one global review**

Reject any provider output requesting automatic edits. Store evidence snippets and node IDs; never store a blocking AI issue.

- [ ] **Step 3: Run and commit**

Run: `npm test -- src/__tests__/authoring/validation/ai-review.test.ts`

```powershell
git add src/lib/authoring/validation/ai-review.ts src/lib/authoring/validation/ai-review-schema.ts src/__tests__/authoring/validation/ai-review.test.ts
git commit -m "feat: add non-destructive continuity review"
```

### Task 4: Build the validation service and API

**Files:**
- Create: `src/lib/authoring/validation/service.ts`
- Create: `src/app/api/projects/[projectId]/validate/route.ts`
- Create: `src/app/api/projects/[projectId]/validation/[issueId]/route.ts`
- Test: `src/__tests__/authoring/validation/api.test.ts`

**Interfaces:**
- Produces: `validateDraft(projectId, sources)`, `getReleaseDecision(projectId): { allowed; revision; blocking; warnings }`; POST validate, GET issues, PATCH resolve/dismiss.

- [ ] **Step 1: Test stale validation, source selection, warning dismissal, and blocking denial**

- [ ] **Step 2: Implement ordered execution**

Run structural validation, then deterministic rules, then optional AI review. Mark prior results stale when draft revision changes. Return 409 when a caller tries to seal using an older validation revision.

- [ ] **Step 3: Run and commit**

Run: `npm test -- src/__tests__/authoring/validation/api.test.ts`

```powershell
git add src/lib/authoring/validation/service.ts src/app/api/projects/[projectId]/validate src/app/api/projects/[projectId]/validation src/__tests__/authoring/validation/api.test.ts
git commit -m "feat: expose authoring validation workflow"
```

### Task 5: Enforce one snapshot/export release gate

**Files:**
- Create: `src/lib/authoring/release-gate.ts`
- Modify: `src/lib/authoring/snapshots.ts`
- Modify: `src/app/api/projects/[projectId]/export/html/route.ts`
- Test: `src/__tests__/authoring/validation/release-gate.test.ts`

**Interfaces:**
- Produces: `assertReleaseReady(projectId, expectedRevision): ReleaseDecision`.

- [ ] **Step 1: Test that every bypass attempt fails**

Cover direct snapshot, direct export, stale revision, incomplete generation, open blocking issue, and changed graph after validation.

- [ ] **Step 2: Route snapshot and export through `assertReleaseReady`**

Create the immutable snapshot and revalidate that snapshot inside one release transaction boundary before rendering export.

- [ ] **Step 3: Run and commit**

Run: `npm test -- src/__tests__/authoring/validation/release-gate.test.ts`

```powershell
git add src/lib/authoring/release-gate.ts src/lib/authoring/snapshots.ts src/app/api/projects/[projectId]/export/html/route.ts src/__tests__/authoring/validation/release-gate.test.ts
git commit -m "feat: enforce a single story release gate"
```

### Task 6: Add issue UI and path-coverage E2E

**Files:**
- Create: `src/features/authoring/editor/issue-panel.tsx`
- Create: `src/features/authoring/editor/release-checklist.tsx`
- Create: `e2e/authoring-quality-flow.spec.ts`
- Modify: `docs/release/authoring-verification.md`

**Interfaces:**
- Consumes: validation APIs and outline selection.
- Produces: issue filters, jump-to-node, resolve/dismiss actions, release checklist, path coverage report.

- [ ] **Step 1: Write E2E that creates a cycle, dead end, warning, and stale validation**

Verify cycle/dead end block release, warning can be dismissed with confirmation, editing invalidates release readiness, and fixing/revalidating enables snapshot/export.

- [ ] **Step 2: Add node/edge coverage to the preview test harness**

Enumerate all paths up to a fixed cap; above the cap, generate a deterministic set covering every node and edge and report uncovered IDs as blocking test failures.

- [ ] **Step 3: Run Phase 4 gate and commit**

Run: `npm test -- src/__tests__/authoring/validation`

Run: `npm run test:e2e -- e2e/authoring-quality-flow.spec.ts`

```powershell
git add src/features/authoring/editor/issue-panel.tsx src/features/authoring/editor/release-checklist.tsx e2e/authoring-quality-flow.spec.ts docs/release/authoring-verification.md
git commit -m "feat: complete story quality release loop"
```

## Phase 4 Completion Gate

- [ ] Every blocking invariant prevents snapshot and export through all routes.
- [ ] AI findings are warnings only and never alter prose.
- [ ] Validation is invalidated by any relevant draft revision change.
- [ ] Issues jump to exact nodes/edges and preserve evidence.
- [ ] Automated preview coverage reaches every node and edge.
