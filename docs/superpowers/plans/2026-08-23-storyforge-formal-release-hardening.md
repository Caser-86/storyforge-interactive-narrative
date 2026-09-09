# StoryForge Formal Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make StoryForge dependable as a private, single-author local product by closing LAN exposure, preserving interactive data, aligning bounded-story behavior, and creating trustworthy release evidence.

**Architecture:** Keep the existing Next.js + SQLite local-first architecture and its no-login boundary. The default deployment must be loopback-only; interactive sessions become first-class project data in versioned backups and receive explicit lifecycle controls. Release checks remain deterministic with the fake provider, supplemented by a documented, opt-in real-provider smoke test.

**Tech Stack:** Next.js 16.3.1, React, TypeScript, Vitest, Playwright, better-sqlite3, Docker Compose, Node.js 24.

**Spec:** `docs/superpowers/plans/2026-08-19-storyforge-formalization-master-plan.md` and the 2026-08-23 formal-project audit.

## Global Constraints

- Product scope remains private, local, single-author, text-first; do not add login, cloud sync, public sharing, or image generation.
- The default reachable host is `127.0.0.1`; LAN access is an explicit, separately documented override and is never the Compose default.
- Do not expose API keys, database paths, provider base URLs, raw prompts, or raw model responses through health, exports, backups, logs, or browser UI.
- Preserve existing project backup import compatibility for `storyforge-project@1` files.
- All behavioral changes are test-first; run `npm run verify` and `npm run test:e2e:authoring` before each release candidate.
- Real DeepSeek calls are opt-in manual smoke tests only; automated tests use `GENERATION_PROVIDER=fake`.

---

## Release Sequence

1. **R1: Local security boundary** - remove the P0 LAN default and redact diagnostics.
2. **R2: Interactive data durability** - add backup/restore and manageable session history.
3. **R3: Bounded-story contract** - make the turn policy explicit and consistent everywhere.
4. **R4: Trustworthy release evidence** - update documentation, CI, and manual provider proof.
5. **R5: Product-quality baseline** - add accessibility coverage and scale the project/session UI.

## File Map

- `docker-compose.yml`: secure host-port binding for the standard Docker command.
- `docker-compose.lan.yml`: explicit opt-in LAN override with prominent warning.
- `src/app/api/health/route.ts`: non-sensitive liveness/readiness response.
- `src/__tests__/api-health.test.ts`: health response contract.
- `src/__tests__/authoring/deployment-config.test.ts`: Compose and local-boundary regression test.
- `src/lib/authoring/backup.ts`: `storyforge-project@2` schema and atomic interactive restore.
- `src/app/api/projects/[projectId]/backup/route.ts`: newest backup format download.
- `src/lib/interactive/repository.ts`: session list/delete queries and project ownership checks.
- `src/app/api/projects/[projectId]/play/sessions/route.ts`: session-history list route.
- `src/app/api/projects/[projectId]/play/sessions/[sessionId]/route.ts`: session deletion route.
- `src/features/authoring/interactive-player.tsx`: history, resume, and delete controls.
- `src/lib/interactive/generator.ts`: named bounded-turn policy.
- `src/app/api/privacy/route.ts`: truthful local-data policy.
- `docs/authoring-user-guide.md`, `docs/authoring-recovery.md`, `README.md`: behavior, backup, deployment, and recovery documentation.
- `docs/release/authoring-verification.md`, `docs/release/authoring-release-checklist.md`: current release evidence.
- `.github/workflows/verify.yml`: CI verification for every push and pull request.
- `src/__tests__/interactive/*.test.ts`, `src/__tests__/authoring/backup.test.ts`, `e2e/authoring-interactive-flow.spec.ts`: regression coverage.

### Task 1: Lock Down Default Docker Exposure

**Files:**
- Create: `docker-compose.lan.yml`
- Modify: `docker-compose.yml:6-18`
- Modify: `README.md:72-84`
- Create: `src/__tests__/authoring/deployment-config.test.ts`

**Interfaces:**
- Consumes: `STORYFORGE_HOST`, `STORYFORGE_ALLOW_LAN`, existing `assertSafeBindHost()`.
- Produces: a default Compose command reachable only at `127.0.0.1:${APP_PORT:-3000}` and a separately invoked LAN override.

- [ ] **Step 1: Write a failing deployment contract test**

```ts
expect(compose).toContain('"127.0.0.1:${APP_PORT:-3000}:3000"');
expect(compose).not.toContain('STORYFORGE_ALLOW_LAN=true');
expect(lanOverride).toContain('STORYFORGE_ALLOW_LAN=true');
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/__tests__/authoring/deployment-config.test.ts`

Expected: FAIL because the current default Compose file publishes port `3000` on all host interfaces.

- [ ] **Step 3: Make the minimal Compose split**

```yaml
# docker-compose.yml
ports:
  - "127.0.0.1:${APP_PORT:-3000}:3000"

# docker-compose.lan.yml
services:
  app:
    ports:
      - "${APP_PORT:-3000}:3000"
    environment:
      STORYFORGE_ALLOW_LAN: "true"
```

Keep the container process on `0.0.0.0`; Docker host-port binding, not container loopback, is the security boundary.

- [ ] **Step 4: Document the explicit override**

Document `docker compose up` as private loopback startup. Document `docker compose -f docker-compose.yml -f docker-compose.lan.yml up` as an unsafe LAN-only option that requires a trusted network and must never be port-forwarded or internet-exposed.

- [ ] **Step 5: Run focused verification and commit**

Run: `npm test -- src/__tests__/authoring/deployment-config.test.ts`

Expected: PASS.

Commit: `fix: bind default Docker service to loopback`

### Task 2: Make Health Safe and Version-Accurate

**Files:**
- Modify: `src/app/api/health/route.ts:1-54`
- Modify: `src/__tests__/api-health.test.ts`
- Modify: `src/__tests__/authoring/no-legacy-defaults.test.ts`

**Interfaces:**
- Consumes: SQLite integrity check and package version.
- Produces: `{ status, version, timestamp, checks: { authoring, llm } }`, where `llm` exposes only `mock`, `configured`, or `not_configured`.

- [ ] **Step 1: Write the failing redaction test**

```ts
expect(body).not.toHaveProperty("storage.path");
expect(JSON.stringify(body)).not.toContain(process.env.OPENAI_BASE_URL ?? "");
expect(body.version).toBe(packageJson.version);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/__tests__/api-health.test.ts src/__tests__/authoring/no-legacy-defaults.test.ts`

Expected: FAIL because current health JSON includes `baseUrl`, SQLite `path`, and version `0.1.0`.

- [ ] **Step 3: Replace diagnostic fields with status-only fields**

```ts
checks.llm = {
  status: mockLlm ? "mock" : llmConfigured ? "configured" : "not_configured",
};
```

Read the version from `package.json` through a single server-only constant. Do not return the database driver path, configured model, or provider endpoint.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/__tests__/api-health.test.ts src/__tests__/authoring/no-legacy-defaults.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `fix: redact health diagnostics and align version`

### Task 3: Version Project Backups to Include Interactive History

**Files:**
- Modify: `src/lib/authoring/backup.ts:1-520`
- Modify: `src/app/api/projects/[projectId]/backup/route.ts`
- Modify: `src/__tests__/authoring/backup.test.ts`
- Modify: `src/__tests__/authoring/backup-api.test.ts`

**Interfaces:**
- Consumes: `interactive_sessions` and `interactive_turns` rows tied to a project.
- Produces: `ProjectBackupV2Schema` with schema literal `storyforge-project@2`, plus import support for both V1 and V2.

- [ ] **Step 1: Add failing round-trip tests**

```ts
expect(backup.schema).toBe("storyforge-project@2");
expect(backup.interactive.sessions).toHaveLength(1);
expect(backup.interactive.turns).toHaveLength(2);
expect(await interactive.getSession(imported.id, restoredSessionId)).toMatchObject({ turn: 2 });
```

Add a second test importing a hand-built `storyforge-project@1` fixture and asserting its graph restores successfully with empty interactive history.

- [ ] **Step 2: Run the backup tests and verify failure**

Run: `npm test -- src/__tests__/authoring/backup.test.ts src/__tests__/authoring/backup-api.test.ts`

Expected: FAIL because the current backup has no `interactive` section.

- [ ] **Step 3: Define V2 and map IDs atomically**

```ts
interactive: {
  sessions: Array<{ id; projectId; status; turn; targetTurns; stateJson; currentTurnId; lastError; createdAt; updatedAt }>;
  turns: Array<{ id; sessionId; turn; sceneJson; selectedChoiceId; selectedAt; createdAt }>;
}
```

Export only session state and scene/choice history. On new-ID import, create `sessionIds` and `turnIds` maps, rewrite `projectId`, `sessionId`, and `currentTurnId`, then insert them inside the same import transaction as the project graph. Preserve V1 import by normalizing it to empty V2 interactive arrays before validation and insert.

- [ ] **Step 4: Add data-safety assertions**

Assert serialized V2 backups still omit `OPENAI_API_KEY`, generation `request_json`, and generation `raw_response`. Assert malformed interactive foreign keys reject before any project rows are written.

- [ ] **Step 5: Run focused verification and commit**

Run: `npm test -- src/__tests__/authoring/backup.test.ts src/__tests__/authoring/backup-api.test.ts`

Expected: PASS.

Commit: `feat: preserve interactive history in project backups`

### Task 4: Add Interactive Session Lifecycle Controls

**Files:**
- Modify: `src/lib/interactive/repository.ts`
- Create: `src/app/api/projects/[projectId]/play/sessions/route.ts`
- Create: `src/app/api/projects/[projectId]/play/sessions/[sessionId]/route.ts`
- Modify: `src/features/authoring/interactive-player.tsx`
- Modify: `src/__tests__/interactive/repository.test.ts`
- Modify: `src/__tests__/interactive/interactive-player.test.tsx`
- Modify: `e2e/authoring-interactive-flow.spec.ts`

**Interfaces:**
- Produces `listSessions(projectId): Promise<InteractiveSession[]>` and `deleteSession(projectId, sessionId): Promise<void>`.
- Exposes `GET /api/projects/:projectId/play/sessions` and `DELETE /api/projects/:projectId/play/sessions/:sessionId`.

- [ ] **Step 1: Write failing repository tests**

```ts
expect(await interactive.listSessions(project.id)).toEqual([
  expect.objectContaining({ id: newest.id }),
  expect.objectContaining({ id: older.id }),
]);
await interactive.deleteSession(project.id, older.id);
await expect(interactive.getSession(project.id, older.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
```

Assert results are sorted by `updatedAt` descending and a session cannot be read or deleted through another project ID.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/__tests__/interactive/repository.test.ts src/__tests__/interactive/interactive-player.test.tsx`

Expected: FAIL because no session-history interface exists.

- [ ] **Step 3: Implement repository and routes**

Use a project-qualified `DELETE FROM interactive_sessions WHERE id = ? AND project_id = ?`. Rely on the existing turn foreign-key cascade. Return `404` if the row does not belong to the project; never accept a bare session ID as authority.

- [ ] **Step 4: Implement the player controls**

Add a compact “互动记录” section below export actions. Each row shows creation/update time, turn count, status, a resume button, and a destructive delete button with a Chinese confirmation prompt. “重新开始” creates a new session only after clearing the active pointer; it must not silently delete prior histories.

- [ ] **Step 5: Run API, component, and browser tests; commit**

Run: `npm test -- src/__tests__/interactive/repository.test.ts src/__tests__/interactive/interactive-player.test.tsx`

Run: `npm run test:e2e:authoring`

Expected: PASS, including resume, delete, and finite-ending behavior.

Commit: `feat: manage persisted interactive sessions`

### Task 5: Establish One Bounded-Turn Policy

**Files:**
- Modify: `src/lib/interactive/generator.ts:167-185`
- Modify: `src/__tests__/interactive/generator.test.ts`
- Modify: `e2e/authoring-interactive-flow.spec.ts`
- Modify: `docs/authoring-user-guide.md:20-27`
- Modify: `docs/authoring-recovery.md`

**Interfaces:**
- Produces `interactiveTargetTurns(project: Project): number` as the single source of truth.
- Policy: `micro=6`, `short=8`, `medium=16`, `custom=clamp(targetNodeCount, 8, 40)`.

- [ ] **Step 1: Write failing policy tests**

```ts
expect(interactiveTargetTurns(projectWith("micro"))).toBe(6);
expect(interactiveTargetTurns(projectWith("short"))).toBe(8);
expect(interactiveTargetTurns(projectWith("medium"))).toBe(16);
expect(interactiveTargetTurns(projectWith("custom", 64))).toBe(40);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/__tests__/interactive/generator.test.ts`

Expected: FAIL because the current implementation assigns `micro=8`, `short=12`, and `medium=24`.

- [ ] **Step 3: Implement the named policy**

```ts
export function interactiveTargetTurns(project: Project): number {
  if (project.sizePreset === "micro") return 6;
  if (project.sizePreset === "short") return 8;
  if (project.sizePreset === "medium") return 16;
  return Math.max(8, Math.min(40, project.targetNodeCount));
}
```

Use it only from `createInteractiveState`; do not duplicate turn arithmetic in UI, prompts, or tests.

- [ ] **Step 4: Align end-to-end coverage and user copy**

Change the browser test to use a short project and assert “第 1 / 8 幕” through the ending. Document all four size policies and explain that every non-ending turn has three choices while the final turn has none.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- src/__tests__/interactive/generator.test.ts`

Run: `npm run test:e2e:authoring`

Expected: PASS.

Commit: `fix: align bounded interactive turn policy`

### Task 6: Replace the Legacy Privacy Contract and Add Data Retention Rules

**Files:**
- Modify: `src/app/api/privacy/route.ts`
- Create: `src/__tests__/api-privacy.test.ts`
- Modify: `docs/authoring-user-guide.md`
- Modify: `README.md`

**Interfaces:**
- Produces an accurate policy response for the current local-only product.
- Declares exact user-controlled deletion paths: delete a session, delete a project, delete the SQLite database, and remove the automatic backup directory.

- [ ] **Step 1: Write a failing policy contract test**

```ts
expect(policy.dataCollected).toContain("项目、图谱、互动会话和选择记录（保存在本机 SQLite）");
expect(JSON.stringify(policy)).not.toMatch(/BFL|Owner Token|匿名指纹|\/api\/user|图片生成/);
expect(policy.thirdPartySharing).toEqual(["仅在生成时向已配置的 LLM 服务发送必要的故事提示词"]);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/__tests__/api-privacy.test.ts`

Expected: FAIL because the current route describes retired game, image, token, and user APIs.

- [ ] **Step 3: Replace the policy content**

Set `updatedAt` to the implementation date. State that current session pointer lives in browser `localStorage`, all story/session data lives in local SQLite, provider prompts are sent only when the user starts generation or selects a choice, and no public sharing/login exists.

- [ ] **Step 4: Document retention operations**

Document that session deletion removes its turns; project deletion cascades interactive sessions; project backup V2 includes interaction history; database backups contain local story data and must be stored privately.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- src/__tests__/api-privacy.test.ts`

Expected: PASS.

Commit: `docs: publish accurate local data policy`

### Task 7: Refresh Release Evidence and Automate the Deterministic Gate

**Files:**
- Create: `.github/workflows/verify.yml`
- Modify: `README.md:55-100`
- Modify: `docs/release/authoring-verification.md`
- Modify: `docs/release/authoring-release-checklist.md`

**Interfaces:**
- Produces a reproducible CI gate: `npm ci`, `npm run verify`, `npm run test:e2e:authoring`.
- The original draft proposed a manual DeepSeek smoke command. That script is not part of the current repository; the maintained replacement is `npm run authoring:llm:smoke`, with `--dry-run` as the CI-safe path and live execution kept as an explicit operator action.

- [ ] **Step 1: Add a failing CI-content test or checklist assertion**

```ts
expect(workflow).toContain("npm ci");
expect(workflow).toContain("npm run verify");
expect(workflow).toContain("npm run test:e2e:authoring");
```

If repository policy does not permit a source-test for CI YAML, make this a checklist review gate with the same three literal commands.

- [ ] **Step 2: Add the GitHub Actions workflow**

Use `actions/checkout@v4`, `actions/setup-node@v4` with Node `24`, `npm ci`, `npm run verify`, and `npm run test:e2e:authoring`. Do not provide any provider secret to CI.

- [ ] **Step 3: Add a manual real-provider smoke script**

The script must require `OPENAI_API_KEY`, make one structured brief request, validate against the schema, print only model name, token counts, latency, and pass/fail, then exit non-zero on failure. It must never log prompts, raw responses, base URL, or secret values.

- [ ] **Step 4: Regenerate release evidence**

Replace the stale `44/189/6` counts only after executing all gates. Record command, date, Node/npm versions, test counts, E2E counts, and a clearly labeled manual DeepSeek smoke result if the operator chose to run it.

- [ ] **Step 5: Run release verification and commit**

Run: `npm run verify`

Run: `npm run test:e2e:authoring`

Run: `npm audit --omit=dev --audit-level=high`

Expected: all commands pass; the audit reports no high-severity production dependency vulnerability.

Commit: `ci: add repeatable local release verification`

### Task 8: Add the Product-Quality Baseline

**Files:**
- Modify: `src/features/authoring/project-library.tsx`
- Modify: `src/features/authoring/interactive-player.tsx`
- Modify: `src/app/globals.css`
- Create: `src/__tests__/authoring/project-library.test.tsx`
- Modify: `src/__tests__/interactive/interactive-player.test.tsx`
- Modify: `e2e/authoring-interactive-flow.spec.ts`

**Interfaces:**
- Produces client-side project filtering by title/genre/status and a visible current-result count.
- Produces keyboard-operable session-history actions with semantic labels and live error/status announcements.

- [ ] **Step 1: Write failing component tests**

```tsx
render(<ProjectLibrary projects={[draftProject, archivedProject]} />);
await user.type(screen.getByLabelText("筛选项目"), "潮汐");
expect(screen.getByRole("article", { name: /潮汐档案/ })).toBeVisible();
expect(screen.queryByText("归档项目")).not.toBeInTheDocument();
```

Add tests that deleting a session has an accessible name containing its title/status and that failed history loading is announced with `role="alert"`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/__tests__/authoring/project-library.test.tsx src/__tests__/interactive/interactive-player.test.tsx`

Expected: FAIL because project filtering and session-history a11y contracts do not yet exist.

- [ ] **Step 3: Implement minimal discoverability improvements**

Add a labelled text filter and status filter only; do not add pagination, accounts, or cloud search. Preserve the existing visual system, responsive single-column layout, and keyboard-native buttons/links.

- [ ] **Step 4: Add browser coverage at desktop and 390 px**

Use Playwright to assert that the project filter works, interactive choices remain visible, and all action buttons are keyboard-focusable at both viewport widths. Keep this test on the fake provider.

- [ ] **Step 5: Run the complete quality gate and commit**

Run: `npm run verify`

Run: `npm run test:e2e:authoring`

Expected: PASS.

Commit: `feat: improve local project and session usability`

## Release Acceptance Checklist

- [x] Default Docker startup is host-loopback-only; LAN requires the explicit override file.
- [x] Health endpoint has no filesystem path, model endpoint, API key, raw prompt, or raw response.
- [x] A V2 backup restores graph, generation metadata, validation state, interactive sessions, and turns atomically.
- [x] A V1 backup still imports successfully with zero interactive sessions.
- [x] A short interactive story starts at `1 / 8`, has meaningful choices through turn 7, and ends at turn 8.
- [x] Users can resume or delete stored interactive sessions; project deletion removes their sessions and turns.
- [x] Privacy policy and user guide describe only current behavior and deletion paths.
- [x] CI and local release gates pass without a real provider key.
- [ ] A real DeepSeek smoke result is recorded manually before a tagged release.
- [x] `npm run verify`, `npm run test:e2e:authoring`, and `npm audit --omit=dev --audit-level=high` pass on the release candidate.

## Plan Self-Review

- Spec coverage: Tasks 1-2 address the local-only security boundary; Tasks 3-4 address interactive persistence and deletion; Task 5 resolves the bounded-loop contract; Tasks 6-7 cover legal/operational evidence; Task 8 covers scalability and accessibility.
- Placeholder scan: no open implementation placeholders remain; the only intentional operator action is the explicitly opt-in real-provider smoke test.
- Type consistency: backup V2 names `interactive.sessions` and `interactive.turns` throughout; session ownership is always qualified by both `projectId` and `sessionId`; the turn-policy API is `interactiveTargetTurns(project)`.

## Execution Status (2026-08-24)

- [x] Default Docker startup is loopback-only with an explicit LAN override.
- [x] Health and privacy contracts no longer expose filesystem paths, provider endpoints, or secrets.
- [x] Project backup V2 restores interactive sessions and turns atomically while accepting V1 imports.
- [x] Interactive target-turn policy, session history, deletion, stale-refresh protection, and responsive project filters are covered by tests.
- [x] CI includes dependency audit, fake-provider verification, database smoke, legacy export, and authoring E2E.
- [x] Local verification passed: `55` test files, `224` tests, `8` authoring E2E tests, build, audit, Docker config, database smoke, and legacy dry-run.
- [ ] Live DeepSeek smoke remains an explicit operator step before a tagged release; it was intentionally not triggered by this execution.
