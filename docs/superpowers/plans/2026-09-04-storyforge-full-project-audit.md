# StoryForge Full Project Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 StoryForge 当前代码、配置、测试、文档和本地产物完成一次证据驱动的审计整理，修复确定的问题，并让默认验证入口只覆盖当前 authoring 产品。

**Architecture:** 保持 Next.js 16 App Router、TypeScript、React 19 和 SQLite 的现有边界，不进行业务架构重写。仅清理已经退役且导致全量 E2E 失败的测试，收紧 Docker 构建上下文，移除已证明未使用的类型依赖，并建立当前文档与历史文档的清晰索引。

**Tech Stack:** Next.js 16.3.1, React 19.2.4, TypeScript 5.9.3, Vitest 4.1.6, Playwright 1.60.0, better-sqlite3 12.10.0, npm lockfile v3, Docker Compose。

**Spec:** `docs/superpowers/specs/2026-08-24-storyforge-production-maturity-design.md`

## Global Constraints

- 产品保持私人、本地、单作者、文字优先，不添加登录、云同步、公开分享、图片生成、Redis 或第二数据库。
- 默认服务只绑定 `127.0.0.1`；局域网访问必须通过显式 `STORYFORGE_ALLOW_LAN=true` 覆盖。
- 不提交、输出或记录真实 API key、数据库内容、备份内容或本地绝对路径中的敏感信息。
- 不使用 `git clean -fd`、`git reset --hard`、`git checkout --` 或强制推送。
- 只有在全项目引用、构建、测试、部署和自动发现检查均证明安全后，才删除文件或依赖。
- 每个修改批次都运行针对性测试，并在最终阶段运行 typecheck、lint、test、build、authoring E2E、依赖审计和 Docker 验证。

---

### Task 1: Establish The Audit Baseline

**Files:**
- Read: `README.md`, `package.json`, `package-lock.json`, `src/`, `e2e/`, `scripts/`, `docs/`, Docker and CI configuration
- Create: `docs/2026-09-04-project-audit.md`

**Interfaces:**
- Consumes: current Git status, route inventory, package manifests, active documentation, and command output.
- Produces: evidence table distinguishing current product paths, historical documents, generated local artifacts, and confirmed problems.

- [x] **Step 1: Record the repository state**

Run:

```powershell
git status --short --branch --ignored
git log -8 --oneline --decorate
git ls-files | Measure-Object -Line
```

Expected: clean tracked worktree; ignored local `.env.local`, database, build, log, report, and presentation artifacts are listed without reading secret values.

- [x] **Step 2: Inventory source, routes, scripts, tests, and resources**

Run:

```powershell
rg --files --hidden -g '!.git/**' -g '!node_modules/**' -g '!.next/**' -g '!.next-playwright/**' -g '!test-results/**' -g '!playwright-report/**'
rg -n 'export const (GET|POST|PUT|PATCH|DELETE)|use client|process\.env|fetch\(|dangerouslySetInnerHTML|readFile|writeFile|prepare\(' src scripts
```

Expected: current product routes are under `src/app/api/projects`, `src/app/api/health`, `src/app/api/diagnostics`, and `src/app/api/privacy`; no current route implements the old `/api/games`, `/api/assets`, `/api/templates`, `/api/user`, or `/api/share` paths.

- [x] **Step 3: Record confirmed findings and retained uncertainty**

The audit report will record the stale legacy E2E files, Docker context/public-directory defects, unused type packages, historical documentation, and ignored local artifacts that are intentionally retained because they may contain author data or useful evidence.

### Task 2: Retire Proven-Obsolete Browser Tests

**Files:**
- Delete: `e2e/main-flow.spec.ts`
- Delete: `e2e/text-flow.spec.ts`
- Test: `e2e/authoring-*.spec.ts`

**Interfaces:**
- Consumes: current route inventory and the 12 passing authoring E2E scenarios.
- Produces: `npm run test:e2e` that discovers only current product behavior.

- [x] **Step 1: Confirm the files have no active references**

Run:

```powershell
rg -n 'main-flow\.spec|text-flow\.spec|/api/(games|assets|templates|user|share)' --hidden -g '!.git/**' -g '!node_modules/**' -g '!.next/**' -g '!.next-playwright/**' .
```

Expected: matches are limited to the two obsolete E2E files and explicitly historical audit/roadmap documents; no current route, component, build script, or deployment file depends on them.

- [x] **Step 2: Remove only the obsolete tests**

Use `apply_patch` to delete the two files. Do not delete historical audit documents or local output files.

- [x] **Step 3: Run the full browser command**

Run:

```powershell
npm run test:e2e
```

Expected: 12 current authoring E2E tests pass without the removed legacy route failures.

### Task 3: Make Docker Packaging Reproducible And Private

**Files:**
- Modify: `.dockerignore`
- Create: `public/.gitkeep`
- Modify: `src/__tests__/authoring/distribution-contract.test.ts`
- Test: `src/__tests__/authoring/distribution-contract.test.ts`

**Interfaces:**
- Consumes: the existing standalone Dockerfile and distribution contract tests.
- Produces: a bounded build context that excludes local data/evidence and a valid empty public directory for the existing Docker copy step.

- [x] **Step 1: Add failing distribution assertions**

Extend the distribution contract test to read `.dockerignore` and assert it excludes `/data/`, `/output/`, `*.log`, `.superpowers/`, and `.agents/`; assert the tracked `public/.gitkeep` exists so the Dockerfile public copy is valid.

- [x] **Step 2: Run the focused test before the configuration fix**

Run:

```powershell
npm test -- src/__tests__/authoring/distribution-contract.test.ts
```

Expected: FAIL because the current `.dockerignore` does not exclude all local evidence and the repository has no `public/` directory.

- [x] **Step 3: Apply the smallest packaging fix**

Add these patterns to `.dockerignore`:

```text
/data/
/output/
/.superpowers/
/.agents/
*.log
*.tsbuildinfo
/playwright-report/
```

Create `public/.gitkeep` to preserve the Dockerfile's existing static-asset copy contract without inventing a runtime asset.

- [x] **Step 4: Run the focused test after the fix**

Run:

```powershell
npm test -- src/__tests__/authoring/distribution-contract.test.ts
```

Expected: PASS.

- [x] **Step 5: Inspect the build context; image build remains environment-blocked**

Run:

```powershell
docker build --progress=plain -t storyforge-audit:local .
```

Observed: the final build context was 24.06 KB, with local data and review artifacts excluded. The Alpine `npm ci` layer produced no new output in the local Docker environment and was stopped; image success remains unconfirmed.

### Task 4: Remove Confirmed-Unused Type Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `package.json`, `package-lock.json`, TypeScript compilation

**Interfaces:**
- Consumes: project-wide import search and npm dependency tree.
- Produces: a smaller dependency graph with no PostgreSQL/UUID type-only leftovers.

- [x] **Step 1: Prove there are no runtime or type imports**

Run:

```powershell
rg -n --glob '!package-lock.json' --glob '!docs/**' --glob '!*.md' '(from|require\()\s*["'"'](pg|uuid)|@types/(pg|uuid)' src scripts e2e package.json
npm ls @types/pg @types/uuid --depth=0
```

Expected: no source import and both packages appear only as direct dev dependencies.

- [x] **Step 2: Remove only the two unused packages**

Run:

```powershell
npm uninstall --save-dev @types/pg @types/uuid
```

Expected: only the two dev dependency entries and their lockfile subtrees are removed.

- [x] **Step 3: Verify dependency consistency**

Run:

```powershell
npm ci --ignore-scripts
npm audit --omit=dev --audit-level=high
```

Expected: clean install succeeds and production dependency audit reports no high-severity vulnerability.

### Task 5: Reconcile Active Documentation And History

**Files:**
- Create: `docs/README.md`
- Create: `docs/2026-09-04-project-audit.md`
- Modify: `IMPROVEMENTS_CHECKLIST.md`
- Modify: `PROJECT_ROADMAP.md`
- Modify: `PROJECT_DELIVERY_ROADMAP.md`
- Modify: `PROJECT_NEXT_TASK_ROADMAP.md`
- Modify: `PROJECT_REMEDIATION_ACTION_PLAN.md`
- Modify: `PROJECT_DEEP_AUDIT_IMPROVEMENT_REPORT.md`
- Modify: `LOCAL_PERSISTENCE_DESIGN_AND_AUDIT.md`
- Modify: `docs/superpowers/plans/2026-08-24-storyforge-branch-writing.md`

**Interfaces:**
- Consumes: the current README/release verification documents and historical root roadmaps.
- Produces: one current documentation index, one dated audit report, and explicit historical banners without rewriting historical evidence.

- [x] **Step 1: Add the current documentation index**

Create `docs/README.md` with links to the current README, authoring user/recovery guides, operations, release evidence, current production-maturity design, and the dated audit report. Mark the May 2026 root roadmaps as historical archives.

- [x] **Step 2: Add the audit report**

Record confirmed fixes and their evidence, deleted obsolete E2E files and why their deletion is safe, Docker and dependency cleanup, retained ignored artifacts, security results, and remaining release risks.

- [x] **Step 3: Mark root roadmaps as historical**

Add a short banner to each May 2026 root roadmap stating that it describes the retired legacy architecture and that current truth is in `README.md`, `docs/README.md`, and `docs/release/authoring-verification.md`. Do not remove their historical findings.

- [x] **Step 4: Correct active plan status**

Update the 2026-08-24 branch-writing plan so its 2026-09-04 audit section records the already-created `v0.1.7` candidate commit/tag rather than saying the changes are still uncommitted.

### Task 6: Run The Final Audit Gate

**Files:**
- Read: all changed files and audit report
- Test: project verification commands and final Git state

**Interfaces:**
- Consumes: all changes from Tasks 2-5.
- Produces: reproducible evidence for the final report; intentional audit changes remain uncommitted for human review.

- [x] **Step 1: Run static quality gates**

Run:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: every command exits with code 0.

- [x] **Step 2: Run current browser and provider checks**

Run:

```powershell
npm run test:e2e:authoring
npm run authoring:llm:smoke -- --dry-run
```

Expected: 12 authoring E2E tests pass; provider dry-run reports the configured model without a network request.

- [x] **Step 3: Check formatting, dependency, Docker context, and tracked-file safety**

Run:

```powershell
git diff --check
npm audit --omit=dev --audit-level=high
git status --short --ignored
git diff --stat
```

Observed: no whitespace errors, no high-severity production vulnerability, no unexpected tracked generated files, and only explicitly retained ignored local artifacts. Docker context was 24.06 KB; full image build remains unconfirmed because the Alpine `npm ci` layer stalled in this environment.

- [x] **Step 4: Update the audit report with exact results**

Write the observed exit codes, test counts, Docker result, dependency result, and remaining risks into `docs/2026-09-04-project-audit.md`. Do not claim any command passed unless its current output confirms it.

---

## Self-Review Checklist

- [x] The plan covers source, configuration, text, prompts, API calls, data, static resources, tests, build scripts, CI, dependencies, environment variables, caches, temporary files, history, duplicate/obsolete files, and directory structure.
- [x] The two deleted files are proven obsolete by current route inventory and failing full E2E evidence; local data and generated evidence remain untouched.
- [x] Docker changes preserve future static resource support while preventing local author data from entering the build context.
- [x] Historical documents are retained and explicitly labeled instead of being deleted or rewritten as current truth.
- [x] Final verification includes both the current product-specific E2E suite and the generic E2E discovery command.
