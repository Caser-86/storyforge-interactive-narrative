# StoryForge Phase 2 Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a complete finite draft through persisted, resumable brief, bible, outline, graph, node, and continuity-review stages without duplicate calls or fallback prose.

**Architecture:** A provider-independent orchestrator stores runs and idempotent steps in SQLite. The browser advances one bounded leased step through a Route Handler, so closing the browser pauses safely and reopening resumes; node generation processes at most two nodes per request.

**Tech Stack:** TypeScript, Zod, OpenAI-compatible client, DeepSeek, SQLite, Next.js Route Handlers, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-storyforge-local-authoring-platform-design.md`

## Global Constraints

- Generation order is `brief -> bible -> outline -> graph -> structural_check -> nodes -> continuity_review -> ready`.
- Every step uses a unique `(runId, stepKey)` and validated structured output.
- Real failures pause or fail visibly; no local fallback narrative is permitted.
- CI uses a deterministic fake provider and performs no network request.
- Node requests include only the context listed in spec section 9.6.
- At most one run is active per project and two node calls are active per bounded execution request.

---

## Locked Interfaces

```ts
export interface GenerationProvider {
  generate<T>(request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>>;
}

export interface GenerationExecutor {
  executeNext(runId: string): Promise<ExecutionResult>;
  recoverExpiredRuns(now: Date): Promise<number>;
}

export function executeBriefStage(context: StageContext): Promise<StageResult<BriefOutput>>;
export function executeBibleStage(context: StageContext): Promise<StageResult<BibleOutput>>;
export function executeOutlineStage(context: StageContext): Promise<StageResult<OutlineOutput>>;
export function executeGraphStage(context: StageContext): Promise<StageResult<GraphOutput>>;
export function executeNodeBatch(context: NodeBatchContext, maxBatch?: 2): Promise<NodeBatchResult>;
export function executeContinuityReview(context: ReviewContext): Promise<ContinuityReviewOutput>;
```

Every `StageResult` includes parsed output, raw response, model, input tokens, output tokens, and latency. It never includes fallback content.

### Task 1: Define generation contracts and persistence

**Files:**
- Create: `src/lib/authoring/generation/schemas.ts`
- Create: `src/lib/authoring/generation/repository.ts`
- Modify: `src/lib/authoring/migrations.ts`
- Test: `src/__tests__/authoring/generation/repository.test.ts`

**Interfaces:**
- Consumes: authoring database and project schemas.
- Produces: `GenerationStage`, `GenerationRun`, `GenerationStep`, `GenerationRepository.createRun`, `leaseNextSteps`, `completeStep`, `failStep`, `pauseRun`, `resumeRun`, `cancelRun`.

- [ ] **Step 1: Write run uniqueness and lease-expiry tests**

```ts
it("allows only one active run per project", async () => {
  await runs.createRun(projectId, versionId);
  await expect(runs.createRun(projectId, versionId)).rejects.toMatchObject({ code: "CONFLICT" });
});

it("reclaims an expired running step as paused work", async () => {
  const leased = await runs.leaseNextSteps(runId, now, 1);
  const reclaimed = await runs.leaseNextSteps(runId, addMinutes(now, 6), 1);
  expect(reclaimed[0].id).toBe(leased[0].id);
  expect(reclaimed[0].attempt).toBe(2);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/__tests__/authoring/generation/repository.test.ts`

Expected: FAIL because generation persistence does not exist.

- [ ] **Step 3: Add migrations and repository**

Create `generation_runs`, `generation_steps`, and `generation_candidates` exactly as specified. Add a partial unique index preventing multiple `queued/running/paused` runs for one project and a unique `(run_id, step_key)` constraint.

- [ ] **Step 4: Run repository tests**

Run: `npm test -- src/__tests__/authoring/generation/repository.test.ts`

Expected: PASS for lease, retry, pause, resume, cancel, and idempotency cases.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/authoring/generation/schemas.ts src/lib/authoring/generation/repository.ts src/lib/authoring/migrations.ts src/__tests__/authoring/generation/repository.test.ts
git commit -m "feat: persist authoring generation runs"
```

### Task 2: Isolate the LLM provider and error taxonomy

**Files:**
- Create: `src/lib/authoring/generation/provider.ts`
- Create: `src/lib/authoring/generation/openai-provider.ts`
- Create: `src/lib/authoring/generation/fake-provider.ts`
- Create: `src/lib/authoring/generation/provider-errors.ts`
- Test: `src/__tests__/authoring/generation/provider.test.ts`

**Interfaces:**
- Produces: `GenerationProvider.generate<T>(request: StructuredGenerationRequest<T>): Promise<ProviderResult<T>>`; `ProviderError` codes `AUTH`, `RATE_LIMIT`, `TIMEOUT`, `NETWORK`, `EMPTY`, `SCHEMA`, `UNKNOWN` with `retryable`.

- [ ] **Step 1: Write provider classification tests**

```ts
it.each([
  [401, "AUTH", false], [429, "RATE_LIMIT", true], [500, "NETWORK", true],
])("maps %s to %s", (status, code, retryable) => {
  expect(classifyProviderError(fakeHttpError(status))).toMatchObject({ code, retryable });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/__tests__/authoring/generation/provider.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement provider adapters**

The OpenAI adapter must accept a Zod output schema, preserve raw response and usage, and throw `SCHEMA` with validation details. The fake provider returns fixtures by `stage + stepKey` and records calls for duplicate-call assertions.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/__tests__/authoring/generation/provider.test.ts`

```powershell
git add src/lib/authoring/generation/provider.ts src/lib/authoring/generation/openai-provider.ts src/lib/authoring/generation/fake-provider.ts src/lib/authoring/generation/provider-errors.ts src/__tests__/authoring/generation/provider.test.ts
git commit -m "feat: isolate structured generation provider"
```

### Task 3: Implement stage prompts and structured stage handlers

**Files:**
- Create: `src/lib/authoring/generation/prompts.ts`
- Create: `src/lib/authoring/generation/stages/brief.ts`
- Create: `src/lib/authoring/generation/stages/bible.ts`
- Create: `src/lib/authoring/generation/stages/outline.ts`
- Create: `src/lib/authoring/generation/stages/graph.ts`
- Test: `src/__tests__/authoring/generation/stages.test.ts`
- Create: `src/__tests__/fixtures/authoring-generation.ts`

**Interfaces:**
- Consumes: `GenerationProvider`, project size, prior stage output.
- Produces: `executeBriefStage`, `executeBibleStage`, `executeOutlineStage`, `executeGraphStage`, each returning validated output plus next step descriptors.

- [ ] **Step 1: Write stage dependency and size-budget tests**

```ts
it("refuses graph output beyond the project node budget", async () => {
  provider.reply("graph", graphWithNodeCount(16));
  await expect(executeGraphStage(contextWithLimit(15))).rejects.toMatchObject({ code: "SCHEMA" });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- src/__tests__/authoring/generation/stages.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement minimal stage-specific prompts**

Keep prompts separate by stage and demand IDs stable across outline/graph. Do not request final prose before structural validation. Parse all outputs through exported Zod schemas.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/__tests__/authoring/generation/stages.test.ts`

```powershell
git add src/lib/authoring/generation/prompts.ts src/lib/authoring/generation/stages src/__tests__/authoring/generation/stages.test.ts src/__tests__/fixtures/authoring-generation.ts
git commit -m "feat: add staged story planning generation"
```

### Task 4: Add structural precheck and node-context generation

**Files:**
- Create: `src/lib/authoring/generation/context.ts`
- Create: `src/lib/authoring/generation/stages/structural-check.ts`
- Create: `src/lib/authoring/generation/stages/nodes.ts`
- Create: `src/lib/authoring/generation/stages/continuity-review.ts`
- Test: `src/__tests__/authoring/generation/node-context.test.ts`

**Interfaces:**
- Consumes: generated graph, `validateStoryGraph`, bible, outline.
- Produces: `buildNodeContext(graph, nodeId): NodeGenerationContext`; `executeNodeBatch(context, maxBatch = 2)`; `executeContinuityReview(context): ContinuityReviewOutput`.

- [ ] **Step 1: Write context minimization and precheck tests**

```ts
it("includes shared predecessor facts but excludes unrelated prose", () => {
  const context = buildNodeContext(convergingGraphFixture, "merge");
  expect(context.predecessorSummaries).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: "left" })]));
  expect(JSON.stringify(context)).not.toContain(convergingGraphFixture.nodes.find((n) => n.id === "unrelated")!.body);
});
```

- [ ] **Step 2: Implement deterministic precheck and topological batching**

Stop before node calls when any blocking structural issue exists. Generate by `topological_rank`; persist each node result independently and schedule at most two uncompleted nodes per call.

- [ ] **Step 3: Implement the initial continuity-review stage**

After all node steps complete, review chapter summaries, canon, character cards, thread resolutions, and ending summaries. Persist warning-only review output with node IDs and evidence; set the draft to `review_required`. Phase 4 will normalize these results into the full validation issue workflow.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/__tests__/authoring/generation/node-context.test.ts src/__tests__/authoring/graph.test.ts`

```powershell
git add src/lib/authoring/generation/context.ts src/lib/authoring/generation/stages/structural-check.ts src/lib/authoring/generation/stages/nodes.ts src/lib/authoring/generation/stages/continuity-review.ts src/__tests__/authoring/generation/node-context.test.ts
git commit -m "feat: generate nodes from bounded context"
```

### Task 5: Build the bounded resumable executor

**Files:**
- Create: `src/lib/authoring/generation/executor.ts`
- Create: `src/lib/authoring/generation/retry.ts`
- Test: `src/__tests__/authoring/generation/executor.test.ts`

**Interfaces:**
- Consumes: stage handlers and generation repository.
- Produces: `executeNext(runId): Promise<ExecutionResult>` and `recoverExpiredRuns(now): number`.

- [ ] **Step 1: Write crash, duplicate, and retry tests**

```ts
it("does not call the provider twice after a completed step", async () => {
  await executeNext(runId);
  await executeNext(runId);
  expect(provider.callsFor("brief:main")).toHaveLength(1);
});

it("pauses non-retryable authentication failures", async () => {
  provider.rejectNext(new ProviderError("AUTH", false));
  expect(await executeNext(runId)).toMatchObject({ runStatus: "paused" });
});
```

- [ ] **Step 2: Implement state transitions and capped backoff**

Retry `RATE_LIMIT`, `TIMEOUT`, and `NETWORK` at most three attempts with stored `next_attempt_at`; pause `AUTH`; fail exhausted or schema-invalid steps. Complete the run only after continuity review and zero incomplete node steps.

- [ ] **Step 3: Run tests and commit**

Run: `npm test -- src/__tests__/authoring/generation/executor.test.ts`

```powershell
git add src/lib/authoring/generation/executor.ts src/lib/authoring/generation/retry.ts src/__tests__/authoring/generation/executor.test.ts
git commit -m "feat: execute resumable generation steps"
```

### Task 6: Expose generation controls and persisted metrics

**Files:**
- Create: `src/app/api/projects/[projectId]/generation/route.ts`
- Create: `src/app/api/projects/[projectId]/generation/[runId]/route.ts`
- Create: `src/app/api/projects/[projectId]/generation/[runId]/next/route.ts`
- Create: `src/lib/authoring/metrics.ts`
- Create: `src/__tests__/authoring/generation/api.test.ts`

**Interfaces:**
- Produces: create/list/status/pause/resume/cancel/next endpoints; `getProjectGenerationMetrics(projectId)`.

- [ ] **Step 1: Write API transition tests**

Cover 201 create, 409 second active run, 200 bounded next, pause/resume, cancel, unknown run 404, and stale lease 409.

- [ ] **Step 2: Implement validated uncached routes**

Each `/next` response returns run status, stage, progress, last completed step, and error summary; never return raw provider response or API configuration.

- [ ] **Step 3: Verify API tests and commit**

Run: `npm test -- src/__tests__/authoring/generation/api.test.ts`

```powershell
git add src/app/api/projects/[projectId]/generation src/lib/authoring/metrics.ts src/__tests__/authoring/generation/api.test.ts
git commit -m "feat: expose local generation controls"
```

### Task 7: Verify complete generation and provide a safe smoke command

**Files:**
- Create: `e2e/authoring-generation-flow.spec.ts`
- Create: `src/scripts/authoring-llm-smoke.ts`
- Modify: `package.json`
- Modify: `docs/release/authoring-verification.md`

**Interfaces:**
- Produces: `npm run authoring:llm:smoke -- --preset micro --dry-run` and fixed-provider E2E.

- [ ] **Step 1: Write E2E for completion and resume**

Generate through fake provider, force one node timeout, reload, resume, assert no duplicate completed calls, and verify final draft node/ending counts match preset limits.

- [ ] **Step 2: Implement smoke dry-run first**

Dry-run prints stage names, maximum call count, target nodes, model, and configured base URL with credentials redacted, then exits without constructing the provider client.

- [ ] **Step 3: Run Phase 2 gate**

Run: `npm test -- src/__tests__/authoring/generation`

Run: `npm run test:e2e -- e2e/authoring-generation-flow.spec.ts`

Run: `npm run authoring:llm:smoke -- --preset micro --dry-run`

Expected: all exit 0 and dry-run makes zero network calls.

- [ ] **Step 4: Record and commit**

```powershell
git add e2e/authoring-generation-flow.spec.ts src/scripts/authoring-llm-smoke.ts package.json docs/release/authoring-verification.md
git commit -m "test: verify complete resumable generation"
```

## Phase 2 Completion Gate

- [ ] All stages persist validated request, response, tokens, timing, and error state.
- [ ] Completed steps are idempotent across reload and restart.
- [ ] Invalid graph plans stop before prose generation.
- [ ] Node generation is bounded to two calls per execution request.
- [ ] No provider error returns fallback prose.
- [ ] Fixed-provider E2E and dry-run smoke pass.
