# StoryForge Phase 3 Authoring Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prototype-first home experience with a project library, creation flow, generation progress, three-pane editor, safe graph editing, local preview, and protected AI candidates.

**Architecture:** Server Components load initial project data; small Client Components own forms, selection, autosave, and generation polling. Client state is scoped per feature and uses optimistic revision tokens from the repository rather than a new global game store.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Zod, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-storyforge-local-authoring-platform-design.md`

## Global Constraints

- Read the local Next.js Server/Client Components guide before implementing pages.
- Keep page/layout files as Server Components unless browser interaction is required.
- Do not add a visual graph canvas in the first release.
- Autosave must expose `saving`, `saved`, and `error` states and reject stale revisions.
- AI-generated candidates never apply automatically.

---

## Locked Interfaces

```ts
export interface AuthoringApi {
  listProjects(): Promise<ProjectSummary[]>;
  createProject(input: CreateProjectInput): Promise<Project>;
  duplicateProject(projectId: string): Promise<Project>;
  patchNode(projectId: string, nodeId: string, patch: NodePatch, expectedRevision: number): Promise<StoryNode>;
  replaceGraph(projectId: string, graph: StoryGraph, expectedRevision: number): Promise<StoryGraph>;
}

export interface AutosaveController {
  schedule(change: NodePatch, expectedRevision: number): void;
  flush(): Promise<void>;
  cancel(): void;
}

export function findAffectedNodes(graph: StoryGraph, changedNodeId: string): string[];
```

Editor client state contains only selection, draft form values, save state, and collapsed UI state. Projects and graphs remain server-persisted source of truth.

### Task 1: Create the authoring shell and project library

**Files:**
- Create: `src/app/(authoring)/layout.tsx`
- Replace: `src/app/page.tsx`
- Create: `src/features/authoring/project-library.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Create: `src/test/setup-dom.ts`
- Test: `src/__tests__/authoring/project-library.test.tsx`

**Interfaces:**
- Consumes: `GET /api/projects` or server repository list.
- Produces: project cards with status, node/ending counts, blocking count, and updated time.

- [x] **Step 1: Install and configure component-test dependencies**

Run: `npm install --save-dev @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`

Configure a jsdom Vitest project for `*.test.tsx` with `src/test/setup-dom.ts` importing `@testing-library/jest-dom/vitest`; keep server-domain tests in the Node environment.

- [x] **Step 2: Write rendering tests for empty, populated, and error states**

- [x] **Step 3: Verify tests fail before components exist**

Run: `npm test -- src/__tests__/authoring/project-library.test.tsx`

- [x] **Step 4: Implement the server shell and focused client actions**

Change metadata from “5 秒生成游戏” to local authoring language. Include create, open, duplicate, archive, and delete-confirmation entry points; add `POST /api/projects/:id/duplicate` through the authoring API adapter. Backup import is added only when the Phase 5 import endpoint exists. Do not show legacy play controls.

- [x] **Step 5: Run tests, accessibility lint, and commit**

Run: `npm test -- src/__tests__/authoring/project-library.test.tsx`

Run: `npm run lint`

```powershell
git add src/app/page.tsx src/app/(authoring)/layout.tsx src/features/authoring/project-library.tsx src/app/layout.tsx src/app/globals.css package.json package-lock.json vitest.config.ts src/test/setup-dom.ts src/__tests__/authoring/project-library.test.tsx
git commit -m "feat: add local authoring project library"
```

### Task 2: Build the project brief and size form

**Files:**
- Create: `src/app/(authoring)/projects/new/page.tsx`
- Create: `src/features/authoring/project-brief-form.tsx`
- Create: `src/features/authoring/authoring-api.ts`
- Test: `src/__tests__/authoring/project-brief-form.test.tsx`

**Interfaces:**
- Consumes: `CreateProjectInputSchema` and `POST /api/projects`.
- Produces: navigation to `/projects/:id/generate` after project creation.

- [x] **Step 1: Test all presets and custom bounds**

Assert micro 8-15/2-3, short 15-30/3-6, medium 40-80/5-10, and custom 8-80/2-10; default short; invalid target prevents submit.

- [x] **Step 2: Implement accessible controlled form with server error display**

- [x] **Step 3: Run tests and commit**

Run: `npm test -- src/__tests__/authoring/project-brief-form.test.tsx`

```powershell
git add src/app/(authoring)/projects/new/page.tsx src/features/authoring/project-brief-form.tsx src/features/authoring/authoring-api.ts src/__tests__/authoring/project-brief-form.test.tsx
git commit -m "feat: add structured project creation"
```

### Task 3: Build resumable generation progress

**Files:**
- Create: `src/app/(authoring)/projects/[projectId]/generate/page.tsx`
- Create: `src/features/authoring/generation-progress.tsx`
- Test: `src/__tests__/authoring/editor/generation-progress.test.tsx`

**Interfaces:**
- Consumes: generation create/status/next/pause/resume/cancel routes.
- Produces: bounded `POST next` loop, stage progress, retry controls, and redirect to editor on `completed`.

- [x] **Step 1: Test progress, pause, retryable failure, auth pause, and reload resume**

- [x] **Step 2: Implement one-request-at-a-time advancement**

Use an abort controller on unmount; never overlap `/next` calls. Stop polling on hidden/unmounted page and resume from persisted status after reload.

- [x] **Step 3: Run tests and commit**

Run: `npm test -- src/__tests__/authoring/editor/generation-progress.test.tsx`

```powershell
git add src/app/(authoring)/projects/[projectId]/generate/page.tsx src/features/authoring/generation-progress.tsx src/__tests__/authoring/editor/generation-progress.test.tsx
git commit -m "feat: show resumable generation progress"
```

### Task 4: Build the three-pane editor shell and outline tree

**Files:**
- Create: `src/app/(authoring)/projects/[projectId]/edit/page.tsx`
- Create: `src/features/authoring/editor/editor-shell.tsx`
- Create: `src/features/authoring/editor/outline-tree.tsx`
- Create: `src/features/authoring/editor/editor-store.ts`
- Test: `src/__tests__/authoring/editor/outline-tree.test.tsx`

**Interfaces:**
- Consumes: `StoryGraph`, validation summary.
- Produces: selected node ID, collapsed chapter state, node status badges, keyboard selection.

- [x] **Step 1: Test chapter ordering, branch nesting, convergence references, and status badges**

- [x] **Step 2: Implement a tree model derived from topological order**

Represent converged nodes once at their first position and show subsequent inbound references as links; do not duplicate editable node components.

- [x] **Step 3: Run tests and commit**

Run: `npm test -- src/__tests__/authoring/editor/outline-tree.test.tsx`

```powershell
git add src/app/(authoring)/projects/[projectId]/edit/page.tsx src/features/authoring/editor src/__tests__/authoring/editor/outline-tree.test.tsx
git commit -m "feat: add authoring editor outline"
```

### Task 5: Implement revision-safe autosave and node editing

**Files:**
- Create: `src/features/authoring/editor/node-editor.tsx`
- Create: `src/features/authoring/editor/autosave.ts`
- Modify: `src/app/api/projects/[projectId]/graph/route.ts`
- Create: `src/__tests__/authoring/editor/autosave.test.ts`
- Create: `src/__tests__/authoring/editor/node-editor.test.tsx`

**Interfaces:**
- Produces: `scheduleAutosave(change, expectedRevision)`, 500 ms debounce, explicit retry, conflict reload/merge prompt.

- [x] **Step 1: Test debounce, flush-on-blur, offline error, stale 409, and author-modified flag**

- [x] **Step 2: Implement field-level patch requests**

Do not send the whole graph for prose edits. Require node `contentRevision`; increment it atomically and return the saved revision. Keep unsaved text in memory after failure.

- [x] **Step 3: Run tests and commit**

Run: `npm test -- src/__tests__/authoring/editor/autosave.test.ts src/__tests__/authoring/editor/node-editor.test.tsx`

```powershell
git add src/features/authoring/editor/node-editor.tsx src/features/authoring/editor/autosave.ts src/app/api/projects/[projectId]/graph/route.ts src/__tests__/authoring/editor
git commit -m "feat: protect author edits with revision autosave"
```

### Task 6: Add graph edits, impact marking, and AI candidates

**Files:**
- Create: `src/lib/authoring/impact.ts`
- Create: `src/app/api/projects/[projectId]/nodes/[nodeId]/regenerate/route.ts`
- Create: `src/app/api/projects/[projectId]/candidates/[candidateId]/route.ts`
- Create: `src/features/authoring/editor/node-inspector.tsx`
- Create: `src/features/authoring/editor/candidate-diff.tsx`
- Test: `src/__tests__/authoring/editor/impact.test.ts`
- Test: `src/__tests__/authoring/editor/candidates.test.ts`

**Interfaces:**
- Produces: `findAffectedNodes(graph, changedNodeId): string[]`; candidate `GET`, `POST apply`, `DELETE discard`.

- [x] **Step 1: Test downstream marking and candidate revision conflict**

Assert objective/summary/edge edits mark reachable downstream nodes; body-only edit does not. Candidate apply must return 409 when `baseContentRevision` differs.

- [x] **Step 2: Implement graph edit forms and candidate diff**

Require edge cleanup before node deletion and run structural validation after target edits. Show old/new prose side by side before apply.

- [x] **Step 3: Run tests and commit**

Run: `npm test -- src/__tests__/authoring/editor/impact.test.ts src/__tests__/authoring/editor/candidates.test.ts`

```powershell
git add src/lib/authoring/impact.ts src/app/api/projects/[projectId]/nodes src/app/api/projects/[projectId]/candidates src/features/authoring/editor src/__tests__/authoring/editor
git commit -m "feat: add safe graph and regeneration editing"
```

### Task 7: Add preview UI and editor E2E

**Files:**
- Create: `src/app/(authoring)/projects/[projectId]/preview/page.tsx`
- Create: `src/features/authoring/preview/preview-player.tsx`
- Create: `e2e/authoring-editor-flow.spec.ts`
- Modify: `docs/release/authoring-verification.md`

**Interfaces:**
- Consumes: reader-safe preview payload and shared runtime behavior.
- Produces: restart, back, path display, editor debug jump, ending state.

- [x] **Step 1: Write E2E covering create, generate, edit, candidate conflict, graph fix, and preview**

- [x] **Step 2: Implement preview with no model or editor mutation calls**

- [ ] **Step 3: Run Phase 3 gate**

Run: `npm test -- src/__tests__/authoring/editor`

Run: `npm run test:e2e -- e2e/authoring-editor-flow.spec.ts`

Expected: PASS.

- [x] **Step 4: Record and commit**

```powershell
git add src/app/(authoring)/projects/[projectId]/preview src/features/authoring/preview e2e/authoring-editor-flow.spec.ts docs/release/authoring-verification.md
git commit -m "feat: complete authoring edit and preview flow"
```

## Phase 3 Completion Gate

- [x] The default home page is the project library.
- [x] Project creation exposes all approved size choices.
- [x] Generation resumes after page reload without duplicate calls.
- [x] Autosave never reports success after a failed write.
- [x] Stale edits and stale candidates return 409.
- [x] Graph edits mark the correct downstream review scope.
- [x] Preview performs no LLM request.

## Execution Status (2026-08-21)

- Tasks 1-6 are implemented and committed. Task 6 includes choice label/consequence editing with draft-revision protection.
- Task 7 preview UI and the browser-flow spec are implemented and committed.
- The Phase 3 Playwright gate remains open: the run was blocked because an existing `next dev` process owns the repository lock on port 3000, so the configured 3105 web server exited before the first request. Re-run `npm run test:e2e -- e2e/authoring-editor-flow.spec.ts` after releasing that process.
