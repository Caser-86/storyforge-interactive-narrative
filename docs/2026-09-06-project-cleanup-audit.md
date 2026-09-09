# StoryForge 全面审计、整理与清理报告

- 审计日期：2026-09-06
- 审计范围：源代码、配置、依赖、脚本、构建、测试、文档、资源、本地数据、缓存和历史产物。
- 工作原则：不删除未提交源代码、用户数据、数据库、备份、历史设计证据或无法确认用途的文件。

## 1. 项目总体情况

StoryForge 是私人、本地、单作者的互动叙事创作工作台。技术栈为 Next.js 16 App Router、React 19、TypeScript、SQLite、Zod 和 OpenAI-compatible provider；默认服务只绑定 loopback，不依赖登录、Redis、PostgreSQL 或图片 worker。

当前入口和闭环为：项目库 -> `/projects/:projectId/generate` 作者逐幕选择 -> 模型生成下一幕和分支 -> 有限回合收尾 -> 编辑器 -> 校验 -> 快照 -> 离线 HTML 导出。一次性结构化生成保留在 `/generate/structured`，旧游戏接口只由只读 legacy export 工具处理。

主要职责边界清晰：`src/app` 提供页面和 API，`src/features/authoring` 提供交互 UI，`src/lib/authoring` 提供项目、图谱、生成、校验、备份和快照领域服务，`src/lib/interactive` 提供分支会话和落稿，`src/scripts` 提供运维与迁移工具。

结论：当前代码主线可运行，测试覆盖和发布门禁完整；大文件拆分仍可作为后续架构优化，但本轮不做高风险重构。

## 2. 已修复问题

| 文件/范围 | 问题 | 处理 |
| --- | --- | --- |
| `src/lib/authoring/generation/openai-provider.ts` | 火山方舟 `doubao-*` 结构化请求默认 extended thinking，互动下一幕可能耗尽 180 秒超时。 | 对 `doubao-*` 和火山方舟地址显式关闭 thinking，并增加回归测试。 |
| `src/app/api/projects/[projectId]/play/route.ts`、`src/app/api/projects/[projectId]/play/[sessionId]/route.ts` | 开场与下一幕失败处理不一致，开场可能把 provider 原始错误直接展示。 | 提取分阶段安全错误映射，统一保存可操作的中文提示。 |
| `src/lib/interactive/repository.ts`、互动 UI | 下一幕失败后选择被释放但错误被清空，用户无法判断是否可重试。 | 持久化 `lastError`，恢复后保留提示并允许重新选择。 |
| 本地恢复数据 | 最近 checkpoint 过期。 | 创建新 checkpoint，并完成迁移、完整性和图谱读取恢复演练。 |
| 文档 | 测试数量、模型适配和恢复行为有历史旧数字。 | 更新作者指南、恢复手册和验证记录。 |

## 3. 已删除文件和产物

以下均为已确认的本地临时或可再生成产物，不属于 Git 跟踪源代码：

| 路径 | 类型 | 删除依据 | 风险 |
| --- | --- | --- | --- |
| `dev-server*.log` | 旧开发日志 | 被 `.gitignore` 忽略，时间早于当前运行实例，源码和脚本不读取。 | A 级，低 |
| `data/test-smoke.sqlite` | 旧 smoke 数据库 | 文件名和时间明确表明是历史测试库；当前 smoke 使用系统临时目录。 | A 级，低 |
| `.next-playwright/`、`test-results/`、`output/playwright/` | E2E 构建、报告和测试数据库 | 由 E2E 自动生成，可完全重建，未被运行时读取。 | A 级，低 |
| `tsconfig.tsbuildinfo` | TypeScript 增量缓存 | 编译器自动生成，删除后可重建。 | A 级，低 |
| `output/package/StoryForge-0.1.3/`、`StoryForge-0.1.4/` | 旧 standalone 发布包 | 已被当前 `v0.1.7` 包取代，脚本按 `package.json` 当前版本生成，不读取旧目录。 | A 级，低 |

未删除当前 `output/package/StoryForge-0.1.7/`，因为它是本轮验证通过的当前发布产物。

## 4. 保留的疑似无用或高风险文件

| 路径/范围 | 看起来的原因 | 保留原因 |
| --- | --- | --- |
| `data/storyforge.sqlite`、`data/backups/` | 本地数据和大量历史 checkpoint。 | 用户故事和恢复数据，属于 C 级，禁止自动删除。 |
| `output/StoryForge-v0.1.5-project-intro.pptx` | 不参与运行时。 | 用户交付物，不能按无引用判定无用。 |
| `output/audit-*`、`output/release/`、`output/github-release/`、`output/remote-release/` | 发布和审计产物。 | 可能是发布证据，且没有安全删除证据。 |
| 根目录 `PROJECT_*.md`、`IMPROVEMENTS_CHECKLIST.md`、`LOCAL_PERSISTENCE_DESIGN_AND_AUDIT.md` | 含历史架构描述。 | `docs/README.md` 已明确标记为历史归档，保留决策依据。 |
| `.superpowers/` | AI 工程执行证据。 | 已被 Docker 排除，但其中部分文件被 Git 跟踪，不能删除。 |
| `src/scripts/legacy-export.ts` | 只读迁移工具，当前主链路不调用。 | 有对应测试和迁移用途，属于保留的兼容边界。 |

## 5. 发现但暂未修改的问题

### P0

无。

### P1

- Docker 镜像、Windows 清洁账户安装、代码签名和正式 GitHub Release 仍需人工发布门禁；本轮 standalone 隔离安装 smoke 已通过，但不等同于 Docker 和签名发布通过。

### P2

- `src/lib/authoring/generation/repository.ts`、`src/lib/authoring/repository.ts`、`src/lib/authoring/graph.ts`、`src/lib/authoring/snapshots.ts` 和 `src/lib/authoring/backup.ts` 较大，后续可按存储、事务和领域操作拆分；本轮不重构以避免行为回归。
- Docker Compose 的默认 provider 仍是 DeepSeek，而 README 示例是火山方舟；当前通过 `.env` 可覆盖，但应在后续统一默认策略或在 Docker 文档中明确差异。
- `.env.local` 中的 `NEXT_PUBLIC_APP_URL` 未被源码读取；因为它是用户本地配置，本轮不直接修改，后续应删除或实现其用途。

### P3

- `git diff --check` 只报告 Windows 工作区的 LF/CRLF 转换提示，没有空白错误；可在团队层面统一 `.gitattributes`，避免跨平台 diff 噪音。
- 实际 standalone 安装 smoke 已通过，但未把旧历史发布目录归档到独立存储；如果仍需要历史发布包，应移出项目工作区管理。

## 6. 验证结果

- `npm run verify`：74 个测试文件、315 个测试通过；类型检查、lint、生产构建通过。
- `npm run test:e2e:authoring`：14/14 通过。
- `npm run package:standalone`：生成 `v0.1.7` standalone 包。
- standalone Local smoke：clean install、health、upgrade、failed-upgrade、rollback、uninstall-preserves-data 全部通过。
- `npm audit --omit=dev --audit-level=high`：0 个生产依赖高危漏洞。
- `npm run authoring:doctor`：SQLite 完整性、可写性、loopback、备份新鲜度和 provider 配置均正常。
- `npm run db:authoring:restore-check -- --latest`：迁移版本 10、2 个项目、图谱可读。
- 真实火山模型下一幕生成验证成功，返回正文和 3 个选择，未修改私人会话。

## 7. 后续优化建议

1. 先完成 Docker 完整 build/health 验证和 Windows 清洁账户安装验证，再决定是否发布 `v0.1.7`。
2. 把 provider 配置抽象成明确的 `provider profile`，统一 README、Compose、smoke 和 UI 中的模型默认值。
3. 在不改变行为的前提下拆分大型 repository，保持每次拆分都有针对性的事务和回归测试。
4. 建立定期 checkpoint 任务，并在发布脚本中自动执行 `doctor` 和 `restore-check`。
5. 清理历史发布产物时使用独立归档目录，不要与当前 `output/package` 混放。
