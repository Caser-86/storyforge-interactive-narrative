# StoryForge Phase 1 Minimum Closed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete non-AI authoring vertical slice: create a project, edit a finite graph, validate it, seal a snapshot, preview it, and export a self-contained offline HTML file.

**Architecture:** Introduce a new authoring domain and SQLite repository separate from legacy sessions. Route handlers expose project and graph operations; pure graph/runtime/export modules remain framework-independent and share fixtures across unit and E2E tests.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript, Zod, better-sqlite3, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-storyforge-local-authoring-platform-design.md`

## Global Constraints

- No LLM call in this phase.
- No auth, images, Redis, or legacy-table reuse.
- Graphs are DAGs with 8-80 nodes and 2-10 endings for release; small invalid fixtures are allowed in unit tests.
- Snapshot rows are immutable after sealing.
- Preview and HTML export use the same `StoryRuntime` transition function.

---

## Locked Interfaces

```ts
export type ProjectSizePreset = "micro" | "short" | "medium" | "custom";
export type StoryNodeKind = "start" | "scene" | "ending";
export type VersionKind = "draft" | "snapshot";

export interface AuthoringRepository {
  createProject(input: CreateProjectInput): Promise<Project>;
  listProjects(): Promise<ProjectSummary[]>;
  getProjectGraph(projectId: string, versionId?: string): Promise<StoryGraph>;
  replaceDraftGraph(projectId: string, graph: StoryGraph, expectedRevision: number): Promise<StoryGraph>;
  duplicateProject(projectId: string): Promise<Project>;
  setProjectStatus(projectId: string, status: ProjectStatus): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
}

export function validateStoryGraph(graph: StoryGraph, limits: GraphLimits): ValidationIssue[];
export function topologicalSort(graph: StoryGraph): string[];
export function enumeratePaths(graph: StoryGraph, cap: number): PathCoverage;
export function createRuntime(graph: ReaderStoryGraph): StoryRuntimeState;
export function chooseEdge(graph: ReaderStoryGraph, state: StoryRuntimeState, edgeId: string): StoryRuntimeState;
export function renderStandaloneHtml(input: ExportStory): string;
```

### Task 1: Define authoring schemas and domain errors

**Files:**
- Create: `src/lib/authoring/schemas.ts`
- Create: `src/lib/authoring/errors.ts`
- Create: `src/__tests__/authoring/schemas.test.ts`

**Interfaces:**
- Consumes: Zod.
- Produces: `ProjectSchema`, `StoryVersionSchema`, `ChapterSchema`, `StoryNodeSchema`, `StoryEdgeSchema`, `StoryGraphSchema`, `ProjectSizeSchema`, `ValidationIssueSchema`, `AuthoringError`.

- [ ] **Step 1: Write schema boundary tests**

```ts
import { expect, it } from "vitest";
import { ProjectSizeSchema, StoryGraphSchema } from "@/lib/authoring/schemas";

it("accepts first-release size presets", () => {
  expect(ProjectSizeSchema.parse({ preset: "short", targetNodes: 24, targetEndings: 4 })).toEqual({
    preset: "short", targetNodes: 24, targetEndings: 4,
  });
});

it("rejects stories larger than the first-release limit", () => {
  expect(() => ProjectSizeSchema.parse({ preset: "custom", targetNodes: 81, targetEndings: 5 })).toThrow();
});

it("parses a typed graph payload", () => {
  expect(StoryGraphSchema.parse({ versionId: "v1", chapters: [], nodes: [], edges: [] }).versionId).toBe("v1");
});
```

- [ ] **Step 2: Run the tests and verify missing modules**

Run: `npm test -- src/__tests__/authoring/schemas.test.ts`

Expected: FAIL because the authoring schemas do not exist.

- [ ] **Step 3: Implement exact schemas and inferred types**

Use string enums from the spec and export types through `z.infer`. Define `AuthoringErrorCode` as `NOT_FOUND | VALIDATION | CONFLICT | IMMUTABLE_VERSION | BLOCKING_ISSUES | STORAGE | EXPORT` and preserve a `details` record.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- src/__tests__/authoring/schemas.test.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/authoring/schemas.ts src/lib/authoring/errors.ts src/__tests__/authoring/schemas.test.ts
git commit -m "feat: define authoring domain contracts"
```

### Task 2: Create authoring migrations and repository

**Files:**
- Create: `src/lib/authoring/migrations.ts`
- Create: `src/lib/authoring/database.ts`
- Create: `src/lib/authoring/repository.ts`
- Create: `src/__tests__/authoring/repository.test.ts`
- Create: `src/scripts/authoring-db-smoke.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: schemas from Task 1 and `SQLITE_DB_PATH`.
- Produces: `AuthoringRepository` with `createProject`, `listProjects`, `getProjectGraph`, `replaceDraftGraph`, `createSnapshot`, `restoreSnapshot`, `duplicateProject`, `setProjectStatus`, `deleteProject`; `runAuthoringMigrations()`.

- [ ] **Step 1: Write repository transaction tests**

```ts
it("creates a project with one mutable draft version", async () => {
  const project = await repo.createProject(fixtureBrief());
  const graph = await repo.getProjectGraph(project.id);
  expect(project.activeDraftVersionId).toBe(graph.versionId);
  expect(graph.nodes).toEqual([]);
});

it("rolls back an invalid graph replacement", async () => {
  await expect(repo.replaceDraftGraph(projectId, { ...graph, edges: [missingTargetEdge] }, 0)).rejects.toThrow();
  expect((await repo.getProjectGraph(projectId)).edges).toEqual([]);
});

it("duplicates a project without sharing mutable row ids", async () => {
  const copy = await repo.duplicateProject(projectId);
  expect(copy.id).not.toBe(projectId);
  expect((await repo.getProjectGraph(copy.id)).nodes.map((node) => node.id))
    .not.toEqual((await repo.getProjectGraph(projectId)).nodes.map((node) => node.id));
});
```

- [ ] **Step 2: Run the repository test and verify failure**

Run: `npm test -- src/__tests__/authoring/repository.test.ts`

Expected: FAIL because no authoring database exists.

- [ ] **Step 3: Implement append-only migrations**

Create all Phase 1 tables from spec sections 7.1-7.5 plus `authoring_migrations`. Enable `foreign_keys`, `journal_mode=WAL`, and `busy_timeout=5000`. Add unique constraints for `(project_id, version_number)`, `(version_id, node_key)`, and edge identity; add indexes on project/version and edge endpoints. Before the first non-empty authoring migration on an existing database, call the existing SQLite backup API and abort migration if backup fails; assert the backup exists in the repository test.

- [ ] **Step 4: Implement repository transactions**

Use direct `better-sqlite3` prepared statements in `database.ts`; do not route new writes through PostgreSQL-to-SQLite conversion. Require an `expectedRevision` in graph replacement and throw `CONFLICT` if the draft revision changed.

- [ ] **Step 5: Add and run the DB smoke script**

Add `"db:authoring:smoke": "tsx src/scripts/authoring-db-smoke.ts"`.

Run: `npm run db:authoring:smoke`

Expected: initialize an empty temporary database, rerun migrations idempotently, create/read/delete a project, and delete the temporary file.

- [ ] **Step 6: Run tests**

Run: `npm test -- src/__tests__/authoring/repository.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add package.json src/lib/authoring/migrations.ts src/lib/authoring/database.ts src/lib/authoring/repository.ts src/__tests__/authoring/repository.test.ts src/scripts/authoring-db-smoke.ts
git commit -m "feat: add authoring sqlite repository"
```

### Task 3: Implement deterministic graph validation

**Files:**
- Create: `src/lib/authoring/graph.ts`
- Create: `src/__tests__/authoring/graph.test.ts`
- Create: `src/__tests__/fixtures/authoring-graphs.ts`

**Interfaces:**
- Consumes: `StoryGraph`.
- Produces: `validateStoryGraph(graph, limits): ValidationIssue[]`, `topologicalSort(graph): string[]`, `enumeratePaths(graph, cap): PathCoverage`.

- [ ] **Step 1: Write one test for every invariant**

```ts
it.each([
  ["START_COUNT", graphWithoutStart()],
  ["ENDING_COUNT", graphWithoutEnding()],
  ["CYCLE", graphWithCycle()],
  ["UNREACHABLE_NODE", graphWithOrphan()],
  ["DEAD_END", graphWithDeadEnd()],
  ["NO_PATH_TO_ENDING", graphWithTrappedBranch()],
  ["BROKEN_EDGE", graphWithBrokenEdge()],
])("returns %s", (code, graph) => {
  expect(validateStoryGraph(graph, testLimits()).map((issue) => issue.code)).toContain(code);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/__tests__/authoring/graph.test.ts`

Expected: FAIL because graph functions do not exist.

- [ ] **Step 3: Implement adjacency maps, Kahn topology, and reverse reachability**

Return stable issue ordering by severity, code, and node key. Never mutate input arrays. Treat duplicate choice labels under one source as `DUPLICATE_CHOICE`.

- [ ] **Step 4: Run focused and property-style fixture tests**

Run: `npm test -- src/__tests__/authoring/graph.test.ts`

Expected: PASS for every invariant and the valid converging-branch fixture.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/authoring/graph.ts src/__tests__/authoring/graph.test.ts src/__tests__/fixtures/authoring-graphs.ts
git commit -m "feat: validate finite story graphs"
```

### Task 4: Expose project and graph APIs

**Files:**
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/api/projects/[projectId]/route.ts`
- Create: `src/app/api/projects/[projectId]/duplicate/route.ts`
- Create: `src/app/api/projects/[projectId]/graph/route.ts`
- Create: `src/lib/authoring/api-contracts.ts`
- Create: `src/__tests__/authoring/api-projects.test.ts`

**Interfaces:**
- Consumes: `AuthoringRepository`, authoring schemas, graph validator.
- Produces: `POST/GET /api/projects`, `GET/PATCH/DELETE /api/projects/:id`, `POST /api/projects/:id/duplicate`, `GET/PUT /api/projects/:id/graph`.

- [ ] **Step 1: Write route contract tests**

```ts
it("creates and reads a project", async () => {
  const create = await POST(new Request("http://local/api/projects", {
    method: "POST",
    body: JSON.stringify(fixtureProjectInput()),
  }));
  expect(create.status).toBe(201);
  expect(CreateProjectResponseSchema.parse(await create.json()).project.status).toBe("draft");
});

it("rejects stale graph revisions", async () => {
  const response = await putGraph(projectId, graph, 999);
  expect(response.status).toBe(409);
});
```

- [ ] **Step 2: Run tests and verify missing routes**

Run: `npm test -- src/__tests__/authoring/api-projects.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement uncached Route Handlers**

Read and follow the local Next.js 16 Route Handlers guide. Validate request and response bodies with Zod in all environments; map `AuthoringError` codes to 400/404/409/422/500 without returning stack traces.

- [ ] **Step 4: Run API and contract tests**

Run: `npm test -- src/__tests__/authoring/api-projects.test.ts`

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/app/api/projects src/lib/authoring/api-contracts.ts src/__tests__/authoring/api-projects.test.ts
git commit -m "feat: expose local authoring project api"
```

### Task 5: Add immutable snapshots and shared preview runtime

**Files:**
- Create: `src/lib/authoring/snapshots.ts`
- Create: `src/lib/authoring/runtime.ts`
- Create: `src/app/api/projects/[projectId]/snapshots/route.ts`
- Create: `src/app/api/projects/[projectId]/preview/route.ts`
- Create: `src/__tests__/authoring/snapshots.test.ts`
- Create: `src/__tests__/authoring/runtime.test.ts`

**Interfaces:**
- Consumes: repository, `validateStoryGraph`.
- Produces: `sealSnapshot(projectId): StoryVersion`, `restoreSnapshot(projectId, snapshotId): StoryVersion`, `createRuntime(graph): StoryRuntimeState`, `chooseEdge(graph, state, edgeId): StoryRuntimeState`.

- [ ] **Step 1: Write snapshot immutability tests**

```ts
it("refuses to seal a graph with blocking issues", async () => {
  await expect(sealSnapshot(projectId)).rejects.toMatchObject({ code: "BLOCKING_ISSUES" });
});

it("restores by copying into a new draft", async () => {
  const restored = await restoreSnapshot(projectId, snapshotId);
  expect(restored.kind).toBe("draft");
  expect(restored.id).not.toBe(snapshotId);
});
```

- [ ] **Step 2: Write runtime transition tests**

```ts
it("moves only along an outgoing edge and records the path", () => {
  const next = chooseEdge(graph, createRuntime(graph), "edge_start_left");
  expect(next.currentNodeId).toBe("left");
  expect(next.edgePath).toEqual(["edge_start_left"]);
});
```

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -- src/__tests__/authoring/snapshots.test.ts src/__tests__/authoring/runtime.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement snapshot copy and pure runtime**

Copy chapters, nodes, and edges in one transaction, seal only after revalidation, and reject all repository writes to snapshot version IDs. Keep runtime functions free of database, React, and browser APIs.

- [ ] **Step 5: Implement snapshot and preview routes**

Return only reader-safe graph fields from preview. Exclude objectives, canon, generation metadata, issue details, and author notes.

- [ ] **Step 6: Run tests**

Run: `npm test -- src/__tests__/authoring/snapshots.test.ts src/__tests__/authoring/runtime.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/authoring/snapshots.ts src/lib/authoring/runtime.ts src/app/api/projects/[projectId]/snapshots src/app/api/projects/[projectId]/preview src/__tests__/authoring/snapshots.test.ts src/__tests__/authoring/runtime.test.ts
git commit -m "feat: add authoring snapshots and preview runtime"
```

### Task 6: Export and verify self-contained HTML

**Files:**
- Create: `src/lib/authoring/export-html.ts`
- Create: `src/app/api/projects/[projectId]/export/html/route.ts`
- Create: `src/__tests__/authoring/export-html.test.ts`
- Create: `e2e/authoring-manual-flow.spec.ts`
- Create: `e2e/fixtures/manual-story.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: sealed snapshot reader payload and runtime semantics.
- Produces: `renderStandaloneHtml(input: ExportStory): string`; downloadable `text/html; charset=utf-8` response.

- [ ] **Step 1: Write exporter security tests**

```ts
it("escapes script text and excludes private fields", () => {
  const html = renderStandaloneHtml(exportFixture({ body: "</script><script>alert(1)</script>" }));
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).not.toContain("OPENAI_API_KEY");
  expect(html).not.toContain("raw_response");
});

it("contains no remote resource or fetch call", () => {
  const html = renderStandaloneHtml(exportFixture());
  expect(html).not.toMatch(/https?:\/\//);
  expect(html).not.toContain("fetch(");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/__tests__/authoring/export-html.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement safe serialization and embedded runtime**

Serialize reader-safe JSON with `<`, `>`, `&`, U+2028, and U+2029 escaped. Render prose with `textContent`, not `innerHTML`. Namespace progress as `storyforge:<projectId>:<versionNumber>` and implement restart/back using the same transition rules as `runtime.ts`.

- [ ] **Step 4: Add the manual closed-loop E2E**

The E2E must seed a valid fixture through the API, edit one node, seal it, preview to an ending, export to a temporary path, open the file through `page.goto(fileUrl)`, and reach an ending with the web server unavailable to that page.

- [ ] **Step 5: Run Phase 1 gate**

Run: `npm test -- src/__tests__/authoring`

Run: `npm run test:e2e -- e2e/authoring-manual-flow.spec.ts`

Expected: PASS.

- [ ] **Step 6: Record verification and commit**

Append Phase 1 command evidence to `docs/release/authoring-verification.md`.

```powershell
git add src/lib/authoring/export-html.ts src/app/api/projects/[projectId]/export/html src/__tests__/authoring/export-html.test.ts e2e/authoring-manual-flow.spec.ts e2e/fixtures/manual-story.ts playwright.config.ts docs/release/authoring-verification.md
git commit -m "feat: complete manual authoring export loop"
```

## Phase 1 Completion Gate

- [ ] New authoring tables do not reference legacy session tables.
- [ ] Every graph invariant has a focused test.
- [ ] Stale graph writes return 409.
- [ ] Invalid graphs cannot be sealed or exported.
- [ ] Snapshot rows reject edits.
- [ ] Preview and export share deterministic transition semantics.
- [ ] Exported HTML completes a story offline and contains no secrets or network dependency.
