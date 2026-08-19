# StoryForge Phase 0 Engineering Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one reproducible Node/npm environment and restore trustworthy typecheck, lint, test, build, SQLite, and local health behavior before authoring work begins.

**Architecture:** Keep the legacy application behavior unchanged while removing environment ambiguity and fixing proven infrastructure defects at their source. CI, Docker, and local development use the same Node major and npm lock; Redis is not touched when image generation is disabled.

**Tech Stack:** Node.js 24, npm, Next.js 16.2.10, TypeScript 5.9, Vitest, SQLite, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-19-storyforge-local-authoring-platform-design.md`

## Global Constraints

- Do not change story behavior or UI in this phase.
- Use npm and `package-lock.json` only.
- Run all quality commands with `DISABLE_REDIS=true` and `ENABLE_IMAGE_GENERATION=false`.
- CI must not call the paid LLM provider.
- Preserve user `.env.local` and `data/` files.

---

## Locked Interfaces

```ts
export function isQueueConfigured(env: NodeJS.ProcessEnv = process.env): boolean;
export async function sqliteQuery(text: string, params?: unknown[]): Promise<QueryResult>;
```

`sqliteQuery` rejects with the original database error. `isQueueConfigured` returns true only for an enabled image path with an explicit Redis URL and no disable flag.

### Task 1: Pin the runtime and package manager

**Files:**
- Create: `.node-version`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`
- Modify: `Dockerfile`
- Delete: `pnpm-lock.yaml`
- Delete: `pnpm-workspace.yaml`
- Test: `src/__tests__/runtime-baseline.test.ts`

**Interfaces:**
- Consumes: current npm scripts and `package-lock.json`.
- Produces: `package.json.engines.node = ">=24 <25"`, `.node-version = "24"`, Node 24 CI/Docker jobs.

- [ ] **Step 1: Write the failing runtime policy test**

```ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("runtime baseline", () => {
  it("uses Node 24 and npm as the only package manager", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(pkg.engines.node).toBe(">=24 <25");
    expect(fs.readFileSync(".node-version", "utf8").trim()).toBe("24");
    expect(fs.existsSync("pnpm-lock.yaml")).toBe(false);
    expect(fs.existsSync("pnpm-workspace.yaml")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/__tests__/runtime-baseline.test.ts`

Expected: FAIL because `engines`, `.node-version`, and the single-package-manager policy are absent.

- [ ] **Step 3: Apply the runtime policy**

Add `"engines": { "node": ">=24 <25" }` to `package.json`, write `24` to `.node-version`, change every `actions/setup-node` value and Docker base image to 24, remove pnpm files, and ignore `/pnpm-lock.yaml` plus `/pnpm-workspace.yaml`.

- [ ] **Step 4: Recreate and verify the npm install**

Run: `npm install`

Expected: `package-lock.json` updates successfully under Node 24 and no pnpm file is recreated.

- [ ] **Step 5: Run the focused test**

Run: `npm test -- src/__tests__/runtime-baseline.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add .node-version .gitignore package.json package-lock.json Dockerfile .github/workflows/ci.yml src/__tests__/runtime-baseline.test.ts
git commit -m "build: standardize Node 24 and npm"
```

### Task 2: Resolve the dependency and typecheck failures

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/lib/asset-queue.ts`
- Modify: `src/scripts/asset-worker.ts`
- Test: `src/__tests__/asset-queue-types.test.ts`

**Interfaces:**
- Consumes: BullMQ `ConnectionOptions` and the OpenAI smoke script.
- Produces: one `ioredis@5.10.1` type identity and explicit `@next/env@16.2.10` availability.

- [ ] **Step 1: Add a dependency resolution test**

```ts
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("installs one ioredis version", () => {
  const tree = JSON.parse(execFileSync("npm", ["ls", "ioredis", "--json"], { encoding: "utf8", shell: true }));
  const root = tree.dependencies.ioredis.version;
  const bull = tree.dependencies.bullmq.dependencies?.ioredis?.version ?? root;
  expect(root).toBe("5.10.1");
  expect(bull).toBe(root);
});
```

- [ ] **Step 2: Verify current failure evidence**

Run: `npm run typecheck`

Expected: FAIL at `src/lib/asset-queue.ts`, `src/scripts/asset-worker.ts`, or missing `@next/env`.

- [ ] **Step 3: Pin compatible dependencies**

Set exact `ioredis` to `5.10.1`, exact `next` and `eslint-config-next` to `16.2.10`, add exact `@next/env` `16.2.10`, and run `npm install`. Use BullMQ's documented connection option type rather than a cast to `unknown` or `any`.

- [ ] **Step 4: Run dependency and type checks**

Run: `npm test -- src/__tests__/asset-queue-types.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS with no Redis type mismatch and no missing module.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json src/lib/asset-queue.ts src/scripts/asset-worker.ts src/__tests__/asset-queue-types.test.ts
git commit -m "fix: align queue dependencies and types"
```

### Task 3: Stop SQLite from swallowing query errors

**Files:**
- Modify: `src/lib/db/sqlite.ts`
- Test: `src/__tests__/sqlite-query-errors.test.ts`

**Interfaces:**
- Consumes: `sqliteQuery(text, params)`.
- Produces: rejected promises with the original SQLite error for unsupported or malformed SQL.

- [ ] **Step 1: Write the failing malformed-query test**

```ts
import { afterEach, expect, it } from "vitest";
import { closeSqlite, sqliteQuery } from "@/lib/db/sqlite";

afterEach(() => closeSqlite());

it("propagates malformed SQL instead of returning empty rows", async () => {
  await expect(sqliteQuery("SELEC definitely_invalid"))
    .rejects.toThrow();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/__tests__/sqlite-query-errors.test.ts`

Expected: FAIL because `runQuery` catches the database error and returns an empty result.

- [ ] **Step 3: Remove the broad fallback catch**

Change the final branch of `runQuery` to prepare and execute the statement without catching errors. Keep only narrow catches that have an explicit compatibility fallback and preserve the original error as `cause` when rethrowing.

- [ ] **Step 4: Run SQLite regression tests**

Run: `npm test -- src/__tests__/sqlite-query-errors.test.ts src/__tests__/sqlite-backup.test.ts src/__tests__/db-schema-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/db/sqlite.ts src/__tests__/sqlite-query-errors.test.ts
git commit -m "fix: propagate sqlite query failures"
```

### Task 4: Make Redis opt-in for the legacy image path

**Files:**
- Modify: `src/lib/asset-queue.ts`
- Modify: `src/app/api/health/route.ts`
- Modify: `src/lib/health-status.ts`
- Test: `src/__tests__/api-health.test.ts`
- Test: `src/__tests__/permission-queue.test.ts`

**Interfaces:**
- Consumes: `ENABLE_IMAGE_GENERATION`, `DISABLE_REDIS`, `REDIS_URL`.
- Produces: `isQueueConfigured(): boolean`; health returns `redis.status = "disabled"` without opening a socket when images are disabled.

- [ ] **Step 1: Add a no-connection health test**

```ts
it("does not probe Redis when image generation is disabled", async () => {
  process.env.ENABLE_IMAGE_GENERATION = "false";
  delete process.env.REDIS_URL;
  const { GET } = await import("@/app/api/health/route");
  const response = await GET();
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.checks.redis.status).toBe("disabled");
});
```

- [ ] **Step 2: Run the test and verify it fails or opens Redis**

Run: `npm test -- src/__tests__/api-health.test.ts`

Expected: the new assertion fails under the current `_available === null` behavior.

- [ ] **Step 3: Implement explicit configuration detection**

Define `isQueueConfigured()` as true only when images are enabled, Redis is not disabled, and `REDIS_URL` is non-empty. Make `ensureQueueReady`, `getQueueHealth`, and the health route return disabled without constructing `Queue` or `Redis` otherwise.

- [ ] **Step 4: Run queue and health tests**

Run: `npm test -- src/__tests__/api-health.test.ts src/__tests__/permission-queue.test.ts src/__tests__/asset-job-service.test.ts`

Expected: PASS and the test process exits without Redis retry handles.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/asset-queue.ts src/app/api/health/route.ts src/lib/health-status.ts src/__tests__/api-health.test.ts src/__tests__/permission-queue.test.ts
git commit -m "fix: make redis queue explicitly opt in"
```

### Task 5: Stabilize the complete quality gate

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Modify: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/release/authoring-verification.md`
- Test: `src/__tests__/api-assets-ratelimit.test.ts`

**Interfaces:**
- Consumes: all existing tests and build scripts.
- Produces: `npm run verify` executing typecheck, lint, unit tests, and build in order.

- [ ] **Step 1: Reproduce the full suite three times**

Run: `npm test`

Expected: record pass/fail and duration three times; if the asset route timeout recurs, capture the slow import or open handle before editing.

- [ ] **Step 2: Fix only the demonstrated timeout source**

If the timeout is module initialization, move side-effectful queue construction behind the already-tested opt-in boundary. If it is test concurrency, isolate the affected module with `vi.resetModules()` and restore environment variables in `afterEach`; do not raise the global timeout as the first fix.

- [ ] **Step 3: Add the aggregate verification script**

Set:

```json
{
  "scripts": {
    "verify": "npm run typecheck && npm run lint && npm test && npm run build"
  }
}
```

- [ ] **Step 4: Run Gate 0**

Run: `npm ci`

Run: `npm run verify`

Expected: all commands exit 0 without Redis and without a real LLM call.

- [ ] **Step 5: Record evidence**

Create `docs/release/authoring-verification.md` with date, Node/npm versions, exact commands, exit codes, test counts, build result, and residual risks. Do not write “passed” without the captured output.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts playwright.config.ts .github/workflows/ci.yml src/__tests__/api-assets-ratelimit.test.ts docs/release/authoring-verification.md
git commit -m "test: establish reproducible quality gate"
```

## Phase 0 Completion Gate

- [ ] `npm ci` succeeds under Node 24.
- [ ] `npm run verify` exits 0.
- [ ] Health returns 200 with images and Redis disabled.
- [ ] SQLite malformed SQL rejects with a real error.
- [ ] No paid provider request is made.
- [ ] Verification evidence is committed.
