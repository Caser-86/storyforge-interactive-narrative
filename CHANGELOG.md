# Changelog

All notable changes to StoryForge are documented here.

## [Unreleased]

### Reliability and Authoring Flow

- 新增低负担的作者结局收尾流程：作者只需输入可选的结局方向，模型生成结构化预览，作者确认后才原子写入结局节点；原七字段手填保留在“手动填写（高级）”中，并补充真实接口、冲突保护和端到端回归。
- 修复中文正文被按单字符切分后产生大量重复片段误报的问题；中文重复片段改用更长的字符窗口，并将同一节点对的重复正文告警限制为一条，避免质量报告被噪声淹没。
- 兼容真实模型将质量审阅结果返回为 `warnings` 数组的响应形状，并在边界处归一化为标准 `passed`/`issues` 契约；同时收紧审阅提示词，避免该类模型漂移把整次验证变成 500。
- 修复真实模型偶发结构化输出漂移导致下一幕直接失败的问题；互动场景对 `SCHEMA` 失败执行最多 3 次有界重试，仍失败时保留原场景并释放当前选择。
- 将互动模型字段 schema 与业务契约校验分层：风险选项不完整时发起一次有界 `choice-repair`，并将后处理 Zod 错误正确归类为 `SCHEMA`，避免把可修复的契约漂移误报为 `UNKNOWN`。
- 修复主动场景缺少选项、最终幕缺少结局摘要或残留选项时在修复前被严格 schema 拦截的问题；模型响应先做字段级解析，修复完成后再执行最终场景契约校验。
- 修复兼容模型返回正文但缺少完整 token usage 时被误记为零消耗的问题；互动账本现在将未确认用量保留为 `unknown` 预算。
- 过滤互动模型返回的空白 legacy 事实、伏笔和已解决条目，避免结构化记忆合并阶段抛出后置 schema 错误并触发无意义重试。
- 修复结构化记忆在 20 条不可变事实已占满容量时因 `slice(-0)` 误保留全部可变事实、导致长故事第 11 幕后置校验失败的问题。
- 收紧互动提示词契约，明确只有最终计划幕允许结局，避免模型提前结束后被服务端拒绝；长故事记忆溢出时优先保留未解决的高优先级伏笔。
- 修复 Docker Alpine 容器在 Windows Git checkout 后因 shell entrypoint 为 CRLF 而无法启动的问题，并用 `.gitattributes` 固定 shell 脚本使用 LF。
- 修复远程 CI 中互动生成测试受 `GENERATION_PROVIDER=fake` 环境影响而绕过 mock 的问题；Windows package smoke 现在在 GitHub Actions 中安全使用受 runner 管理的 `RUNNER_TEMP`，并保持本地临时目录边界与清理校验。
- 升级 Next.js 至 `16.3.4`、sharp 至 `0.35.4`，并将 Vitest 与 eslint-config-next 对齐到已验证版本；生产依赖和全量依赖审计均为 0 vulnerabilities。

- 将分支写作的开场和续写改为 SQLite 持久化任务，支持有界并发、lease 恢复、取消、迟到结果保护和可见进度。
- 增加互动调用账本与会话输出预算，记录模型调用状态、token、请求 ID 和耗时；无法确认的失败用量保留为 `unknown`。
- 修复重试任务在队列中等待至截止时间后仍保持 `queued`、导致互动会话永久显示生成中的状态机边界问题。
- 增加结构化故事记忆、稳定伏笔 ID 和最终收束约束，避免长故事主线事实被近期细节挤掉。
- 增加作者写作路径时间线、生成耗时/尝试状态、取消操作和生成轮询退避。
- 修复异步下一幕生成后键盘焦点落回页面主体，以及回合时间线不随新幕刷新的作者体验问题。
- 为场景就绪和结局状态增加 `aria-live` 播报，帮助读屏用户知道何时可以继续选择或保存草稿。
- 为互动正文、摘要、选项和历史文本增加无空格长串断行，并加入 390px 移动端回归，避免模型文本撑破页面。
- 增加独立的互动离线评测命令和 6/8/16 幕多题材样本，验证作者风险选择路径、状态推进和模型收尾契约；真实模型默认 dry-run，只有单样本、网络和付费确认参数齐全时才执行。
- 增加真实模型人工审阅表，明确付费调用审批、选择后果、事实一致、伏笔回收和结局完整性的评分门槛。
- 统一火山方舟 Agent Plan 的默认模型、兼容 API 地址和 Windows standalone 启动回退，避免未显式设置环境变量时回退到已退役的 DeepSeek 默认值。
- 增加 Windows standalone 原生 SQLite 生命周期和 Linux Docker 构建/health smoke 的 CI 门禁；两者均使用 fake provider，不执行模型请求。
- 增加隔离浏览器跨来源写请求回归，确认不可信来源不能创建本地项目。
- 扩展 provider 错误元数据脱敏，覆盖火山方舟 `ark-` 凭据，并避免互动 worker 日志记录原始凭据。
- 为分支写作页标注 `GENERATION_PROVIDER=fake` 测试占位模式，避免固定占位内容被误认为真实模型质量；手工创作默认使用 `openai` provider。
- standalone 打包和 release evidence 均新增独立产物凭据扫描，覆盖 `sk-`、`ark-`、Bearer 和 URL 凭据，并对空文件安全处理。
- 明确完整验证、standalone 分发和 Windows smoke 的 PowerShell 7.x（`pwsh`）前置条件，并在 CI 的 Ubuntu verify 与 Windows 分发 job 中增加版本检查。
- 修复项目 JSON 导入把进行中会话恢复成永久“生成中”的问题；该格式仍明确不承诺恢复模型任务租约。
- 完成迁移 v12/v13、worker 初始化保护、显式共享数据库作用域、multi-repository route 请求作用域、互动历史读取基准、租约竞争测试、真实跨进程退出/重启与短 SQLite busy 锁演练、预算账本测试、备份恢复测试和三会话并发回归；互动历史列表新增摘要分页索引，验证 repository 写入也统一到短事务边界。

## [0.1.7] - 2026-09-04

> 作者分支审查加固候选版本：对应 `v0.1.7` 标签，尚未合并到 `master`，不是正式 GitHub Release。

### Authoring Completion Hardening

- 新增作者结局编辑能力：作者可以从任意非结局节点创建新的 `ending` 节点并通过一条选择边闭合路径。
- 互动路径会为项目目标结局预留节点预算，避免落稿后无法补齐正式结局；新增互动落稿到正式快照的完整 E2E。
- 修复会话路由在项目归属校验前执行过期恢复的问题，并补充跨项目隔离回归测试。
- 生成完成或取消后可直接新建下一轮生成；互动首幕和下一幕采用后台生成并由页面自动轮询恢复，避免长请求卡住或手动刷新页面。
- 新建生成会先创建隔离的活动草稿版本，保留上一版作者内容；互动生成请求增加一次性尝试 token，过期响应不能覆盖新选择。
- 自动保存改为串行提交，编辑器表单使用稳定 key，响应不会覆盖请求期间的新输入；旧草稿候选、过期互动结果和不符合预算的落稿都会被拒绝。
- 收紧互动模型输出契约，活动场景必须提供 2-3 个选择；图谱整图写入上限调整为 8 MB 以覆盖合法中文正文。
- 图谱写入会在持久化前拒绝重复的章节、节点或边 ID，避免 malformed graph 进入 SQLite 写入路径。
- 本轮验证：`npm run verify` 通过 72 个 Vitest 文件 / 302 个测试，类型检查、Lint、生产构建和完整 authoring E2E 通过 12/12。

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
