# Changelog

All notable changes to StoryForge are documented here.

## [Unreleased]

暂无未发布变更。

## [0.1.6] - 2026-08-28

> 作者分支编辑候选版本：已在功能分支和标签中验证，尚未合并到 `master`，不是正式 GitHub Release。

### Authoring Branch Editing

- 在正式编辑器中新增作者分支表单：作者可从已有主线节点添加一条支线场景，并明确选择文案、场景正文和收束结局。
- 新分支通过带修订号校验的一次整图写入保存，自动保持到结局的闭环；新增场景标记为 `review_required`，不会被视为已发布内容。
- 增加图谱变换、API、编辑器和 E2E 覆盖，并修复 Windows E2E SQLite 清理竞态。
- 本轮验证：`npm run verify` 通过 67 个 Vitest 文件 / 276 个测试，完整 authoring E2E 通过 11/11。

## [0.1.5] - 2026-08-24

> 分支候选版本：已在功能分支和标签中验证，尚未合并到 `master`，不是正式 GitHub Release。

### Author-Driven Branch Writing

- 将互动入口明确为“分支写作”，作者每次选择后才生成下一幕，不预生成未选择的分支。
- 结束时可把作者实际选择的线性路径保存为新的 `review_required` 故事草稿，原草稿保留且重复保存幂等。
- 增加互动路径到 StoryGraph 的落稿映射、SQLite migration、项目隔离校验、备份兼容和进入编辑器继续补全的入口。

### Verification

- 本地候选验证记录：`npm test` 通过 65 个 Vitest 文件 / 271 个测试；`npm run typecheck`、`npm run lint`、`npm run build` 通过。
- `npm run test:e2e:authoring` 通过 10/10，包含作者逐幕选择、正式落稿、刷新恢复、离线导出、发布恢复和响应式筛选。
- 尚未完成的发布门槛：合并到受保护的 `master`、对应远程 CI、干净 Windows 账户安装证据、代码签名和用户级安装器。

## [0.1.4] - 2026-08-24

### Reliability and Generation Controls

- Made pause and cancellation safe against late provider responses; discarded results are no longer persisted after the run stops.
- Added server-side authoring input limits, configured-model enforcement, per-run output budgets, large-run confirmation, and optional hard output caps.
- Added generation budget persistence with a backward-compatible SQLite migration and backup/import support.
- Added CI tag/manual triggers, failure artifact retention, and a documented GitHub release procedure.

### Verification

- Release A working-tree evidence: `npm run verify`, 57 Vitest files / 240 tests, 9 authoring E2E tests, and SQLite smoke all passed on 2026-08-24.
- Release B evidence: checkpoint/restore-check commands and replacement recovery tests passed locally; the Recovery Centre and privacy-safe doctor are included.
- Release C evidence: security baseline, request-size policy, axe accessibility flow, and fake generation evaluation passed locally.
- Release D evidence: Windows package lifecycle smoke, live provider smoke, CycloneDX SBOM, and standalone checksum generation passed; no signed installer is published.
- Published as GitHub Release `v0.1.4` from merged `master` commit `e175f84467af1ff9383c023121969be844fd13fa`; tag CI, SBOM, standalone checksums, and release evidence are recorded in `docs/release/authoring-verification.md`.

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
