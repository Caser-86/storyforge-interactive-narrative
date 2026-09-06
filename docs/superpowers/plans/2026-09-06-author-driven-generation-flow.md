# Author-Driven Generation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bounded author-selected branch writing the default generation workflow, retain batch generation as an advanced option, and eliminate the observed provider timeout failure mode.

**Architecture:** Reuse the existing interactive session state machine and materialization path as the primary authoring workflow instead of creating a second branch engine. Keep `GenerationProgress` available under a clearly secondary structured-generation route. Harden the shared provider error classification and configure session recovery around the provider timeout so transient failures can be retried without losing the selected path.

**Tech Stack:** Next.js 16.3.1, React 19, TypeScript, Zod, SQLite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-06-author-driven-generation-flow.md`

## Global Constraints

- Default language remains Chinese for natural-language output.
- Default branch count is 3; active scenes require at least 2 and never expose more than 3.
- The author selects exactly one option per turn; unselected branches are never materialized.
- The flow is bounded by the existing project-size-derived `targetTurns` and ends with a model-generated ending.
- Secrets remain in local environment files and must not appear in logs, tests, docs, or responses.
- Existing batch generation, local SQLite persistence, and fake-provider E2E coverage must remain available.

---

### Task 1: Lock Down Timeout Classification and Recovery Contracts

**Files:**
- Modify: `src/lib/authoring/generation/provider-errors.ts`
- Modify: `src/lib/authoring/generation/openai-provider.ts`
- Modify: `src/lib/interactive/repository.ts`
- Test: `src/__tests__/authoring/generation/provider.test.ts`
- Test: `src/__tests__/interactive/repository.test.ts`

**Interfaces:**
- `classifyProviderError(error: unknown)` must return `ProviderError("TIMEOUT", ..., true)` for timeout-only messages.
- `OpenAICompatibleGenerationProvider` continues to accept `timeoutMs` and uses `OPENAI_TIMEOUT_MS`, defaulting to `180_000`.
- `recoverStaleGeneration(sessionId, staleAfterMs)` keeps its optional override and defaults to `3 * OPENAI_TIMEOUT_MS + 60_000` (600 seconds with the default timeout).

- [x] **Step 1: Write the failing timeout-message test**

```ts
it("maps timeout messages without a transport code to retryable TIMEOUT", () => {
  expect(classifyProviderError(new Error("Request timed out."))).toMatchObject({
    code: "TIMEOUT",
    retryable: true,
  });
});
```

- [x] **Step 2: Run the provider test and verify it fails**

Run: `npm test -- src/__tests__/authoring/generation/provider.test.ts`

Expected: FAIL because the message-only error is currently classified as `UNKNOWN`.

- [x] **Step 3: Write the stale-generation regression test**

Add repository tests that create a generating session, call `recoverStaleGeneration` after 120 seconds and after 300 seconds with `OPENAI_TIMEOUT_MS=180000`, and assert the session remains `generating`; keep the existing explicit `staleAfterMs` test for deterministic recovery.

- [x] **Step 4: Run the repository test and verify the new assertion fails**

Run: `npm test -- src/__tests__/interactive/repository.test.ts`

Expected: FAIL because the repository default is currently 120 seconds.

- [x] **Step 5: Implement the minimal timeout and stale-threshold fixes**

Use a case-insensitive timeout-message check for `timed out`, `timeout`, or `deadline exceeded`; preserve explicit provider errors and existing status/code mappings. Change only the provider default timeout and repository default stale threshold.

- [x] **Step 6: Run focused tests and verify they pass**

Run: `npm test -- src/__tests__/authoring/generation/provider.test.ts src/__tests__/interactive/repository.test.ts`

Expected: PASS with no changed behavior for auth, rate-limit, network, schema, or explicit stale recovery cases.

### Task 2: Add Bounded Interactive Retry and Clear Failure Recovery

**Files:**
- Create: `src/lib/interactive/retry.ts`
- Modify: `src/app/api/projects/[projectId]/play/route.ts`
- Modify: `src/app/api/projects/[projectId]/play/[sessionId]/route.ts`
- Test: `src/__tests__/interactive/retry.test.ts`
- Test: `src/__tests__/interactive/play-routes.test.ts`

**Interfaces:**
- Export `generateWithInteractiveRetry<T>(operation: () => Promise<T>, options?: { maxAttempts?: number; delayMs?: number }): Promise<T>`.
- Retry only `ProviderError` values with codes `TIMEOUT`, `NETWORK`, or `RATE_LIMIT`, at most 2 retries by default; do not retry schema or auth failures.
- Preserve the current session claim/save transaction so only the winning claim can persist a generated scene.

- [x] **Step 1: Write failing retry tests**

Cover a timeout followed by success, three transient failures exhausting the limit, and a schema failure that is attempted once.

- [x] **Step 2: Run the retry tests and verify they fail**

Run: `npm test -- src/__tests__/interactive/retry.test.ts`

Expected: FAIL because the retry helper does not exist.

- [x] **Step 3: Implement the bounded retry helper**

Use a small injectable delay so tests do not wait; production uses a short delay between attempts. Re-throw the original classified error after the final attempt.

- [x] **Step 4: Route opening and next-scene generation through the helper**

Wrap only `generateInteractiveScene` calls. Keep `failInitialGeneration` for exhausted opening failures and `releaseChoice` for exhausted next-scene failures. Do not retry database writes or materialization.

- [x] **Step 5: Run focused interactive tests**

Run: `npm test -- src/__tests__/interactive/retry.test.ts src/__tests__/interactive/play-routes.test.ts`

Expected: PASS, including existing stale-claim and retry-after-failure behavior.

### Task 3: Make Author-Driven Branch Writing the Default Route

**Files:**
- Modify: `src/app/(authoring)/projects/[projectId]/generate/page.tsx`
- Modify: `src/features/authoring/interactive-player.tsx`
- Modify: `src/features/authoring/project-brief-form.tsx`
- Modify: `src/features/authoring/editor/editor-shell.tsx`
- Create: `src/app/(authoring)/projects/[projectId]/generate/structured/page.tsx`
- Test: `src/__tests__/authoring/editor/generation-progress.test.tsx`
- Test: `e2e/authoring-interactive-flow.spec.ts`

**Interfaces:**
- `/projects/:projectId/generate` renders `InteractivePlayer` with authoring copy and starts the existing `/api/projects/:projectId/play` session.
- `/projects/:projectId/generate/structured` renders the current `GenerationProgress` batch pipeline.
- `/projects/:projectId/play` remains a compatibility route to the same author-driven component.

- [x] **Step 1: Write failing route/UI assertions**

Assert that the default generate page exposes `开始分支写作` and does not expose `结构化生成流程` or the batch execution list; assert the structured route still exposes `GenerationProgress`.

- [x] **Step 2: Run focused UI tests and verify the default-route assertion fails**

Run: `npm test -- src/__tests__/authoring/editor/generation-progress.test.tsx`

Expected: FAIL because the current generate page renders `GenerationProgress`.

- [x] **Step 3: Move the existing batch page to the structured route**

Extract or reuse the current page implementation without changing its API polling behavior. Keep “查看编辑器”, pause, cancel, budget confirmation, and retry controls intact.

- [x] **Step 4: Render the interactive authoring flow at the default generate route**

Change only the route/page composition and copy. Preserve local session recovery, choice selection, one-scene-at-a-time generation, ending materialization, exports, and history. Add a visible link to the structured route for users who intentionally want batch generation.

- [x] **Step 5: Update navigation labels and create-flow redirect**

Use “分支写作” for the default author path and “一次性结构化生成” for the advanced batch path. New projects should land on `/generate`; the editor should link to both paths without calling the default flow “试玩”.

- [x] **Step 6: Run route and interactive E2E tests**

Run: `npm test -- src/__tests__/authoring/editor/generation-progress.test.tsx` and `npx playwright test e2e/authoring-interactive-flow.spec.ts --project=chromium`

Expected: PASS with the default flow covering opening, choices, ending, materialization, and resume.

### Task 4: Improve Choice Contract, Progress Copy, and Documentation

**Files:**
- Modify: `src/lib/interactive/generator.ts`
- Modify: `src/features/authoring/interactive-player.tsx`
- Modify: `src/lib/interactive/schemas.ts`
- Modify: `docs/authoring-user-guide.md`
- Modify: `docs/authoring-recovery.md`
- Modify: `docs/superpowers/specs/2026-08-24-storyforge-branch-writing-design.md`
- Test: `src/__tests__/interactive/generator.test.ts`

**Interfaces:**
- Active scenes continue to return exactly 3 choices from the prompt when not ending; schema remains bounded at 3.
- The final planned turn returns an ending with zero choices and a non-empty ending summary.
- UI explicitly states that the author is selecting the story direction, not playing a pre-authored story.

- [x] **Step 1: Write failing generator tests**

Add tests asserting the prompt requests exactly three choices, the selected choice appears in the next request context, and the final turn produces an ending with no choices.

- [x] **Step 2: Run focused generator tests and verify any missing assertion fails**

Run: `npm test -- src/__tests__/interactive/generator.test.ts`

- [x] **Step 3: Implement only the contract and copy adjustments**

Keep the existing `targetTurns`, state patch, and ending enforcement. Do not introduce open-ended generation or precompute alternate branches.

- [x] **Step 4: Update user/recovery/product documentation**

Document the default author-driven flow, the structured advanced route, timeout configuration (`OPENAI_TIMEOUT_MS`, default 180 seconds), bounded retry behavior, and how a failed next scene can be retried without losing the previous scene.

- [x] **Step 5: Run focused tests**

Run: `npm test -- src/__tests__/interactive/generator.test.ts`

Expected: PASS.

### Task 5: Full Verification and Release Evidence

**Files:**
- Create: `docs/2026-09-06-author-driven-generation-flow-verification.md`

- [x] **Step 1: Run static and unit verification**

Run: `npm run typecheck`, `npm run lint`, and `npm test`.

- [x] **Step 2: Run production build**

Run: `npm run build`.

- [x] **Step 3: Run authoring E2E**

Run: `npm run test:e2e:authoring`.

- [x] **Step 4: Run a local provider configuration check without exposing the key**

Run: `npm run authoring:llm:smoke -- --dry-run` and record only model/base URL presence, not the token.

- [x] **Step 5: Verify the running application**

Keep the local server on `http://127.0.0.1:3001`, confirm `/api/health` returns `status: ok` and `llm.status: configured`, and open the default `/generate` and `/generate/structured` routes.

- [x] **Step 6: Record exact results**

Write command results and any remaining limitations to `docs/2026-09-06-author-driven-generation-flow-verification.md`; do not claim live model generation passed unless a real request was actually made and observed.
