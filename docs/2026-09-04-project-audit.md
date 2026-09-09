# StoryForge 全面审计、整理与优化报告

- 审计日期：2026-09-04
- 项目版本：`0.1.7`
- 当前分支：`codex/branch-writing-v0.1.5`
- 审计范围：源代码、路由/API、配置、Prompt、数据与资源引用、测试、构建脚本、CI/CD、依赖、环境变量、缓存/临时产物、历史文档和目录结构。

> **历史记录：** 本报告保留 2026-09-04 的审计快照。当前项目状态、清理结果和最新验证以 [2026-09-06 项目清理审计报告](2026-09-06-project-cleanup-audit.md) 为准。

## 审计结论

当前产品主线是 Next.js 16 App Router + TypeScript + React 19 + SQLite 的私人本地 authoring 工作台。有效闭环为：项目库 -> 有限生成 -> 人工分支写作 -> 图谱编辑 -> 质量校验 -> 快照 -> 离线 HTML 导出。

本轮没有进行业务架构重写，没有触碰本地作者数据库、备份、PPT 输出或审查证据；只处理了有直接证据的问题。

## 阻塞

- 发布前阻塞：Docker 镜像构建尚未被确认成功。修复后的上下文已验证为 24.06 KB，但本地 Docker 在 Alpine 的 `RUN npm ci` 阶段长时间无新输出并被停止；需要在稳定的 Docker 网络/缓存环境完成一次完整 build、启动和 `/api/health` 检查。
- 发布流程阻塞：`v0.1.7` 仍是功能分支候选，尚未合并到 `master`，也没有创建 GitHub Release；这符合此前“人工确认后提交、打标签、发布”的门禁，不能当作已发布。

## 建议

- 将 `src/lib/authoring/generation/repository.ts`、`src/lib/authoring/repository.ts`、`src/lib/authoring/graph.ts`、`src/lib/authoring/snapshots.ts` 和 `src/lib/authoring/backup.ts` 按存储、事务和领域操作拆分，单独安排回归测试后再做，避免在本轮审计中引入大范围行为变化。
- 统一开发脚本、Compose 示例和当前 README 的 provider/model 默认说明。目前 README 的示例是 Volcengine `doubao-seed-evolving`，部分历史脚本/发布证据仍出现 `deepseek-v4-flash` 或 `api.deepseek.com`；本轮没有擅自改默认值，因为用户 provider 选择和 CI fake provider 需要单独决策。
- 在发布前补做 Windows 清洁账户安装、代码签名、用户级安装器和 Docker 完整镜像运行验证；`npm run package:smoke` 本轮只执行了明确标注为非破坏性的 dry-run。
- 若未来增加账号或 cookie 授权，重新审计服务端授权、CSRF、导出权限和数据隔离；当前无登录属于产品明确的私人单作者边界。

## 通过项

- 当前 authoring 闭环已通过单元/API/组件测试、12 个浏览器 E2E 场景、可访问性检查、离线导出、备份恢复和 release gate 验证。
- TypeScript、ESLint、Next 生产构建、Vitest 并发稳定性、依赖审计、Compose 默认/LAN 配置和分发契约均有本轮命令证据。
- 未发现已跟踪的环境文件、私钥或真实 API key；本地数据库、备份、PPT、日志和审查证据均按数据所有权与可恢复性原则保留，没有做无证据删除。

## 已修复

- 移除 `e2e/main-flow.spec.ts` 和 `e2e/text-flow.spec.ts`：两者只验证已退役的旧 `/api/games`、`/api/assets`、`/api/templates`、`/api/user` 和 `/api/share`，导致通用 Playwright 入口在当前产品上失败；当前 authoring E2E 已覆盖现行闭环。
- 收紧 `.dockerignore`：排除 `data/`、`output/`、`.superpowers/`、`.agents/`、日志、TypeScript 增量文件和 Playwright 报告，避免私人数据库、备份、演示文稿和审查缓存进入 Docker 构建上下文。
- 复验 Docker 上下文后继续排除 `.next-playwright/` 和 `test-results/`：这两个 E2E 产物曾使上下文膨胀到约 187 MB，修复后降到 24.06 KB。
- 增加 `public/.gitkeep`：保留 Dockerfile 现有静态资源复制契约，避免没有 `public/` 目录时构建失败，同时不伪造运行时资源。
- 移除确认未被任何源码、测试、脚本或配置引用的 `@types/pg` 和 `@types/uuid`，连同锁文件中的 PostgreSQL 类型传递依赖一并清理。
- 将开发工具链中的 `browserslist` 从 `4.28.4` 更新到 `4.28.8`，消除本次 npm audit 报告的高危版本问题。
- 固定 Vitest 使用 `forks` 池并限制最多 4 个 worker，避免默认并发在 Windows 上造成 jsdom、全局 mock 和 SQLite 测试竞争；修复后原生 `npm test` 稳定通过。
- 新增当前文档入口，给旧版根目录路线图加历史归档提示，避免把已退役的 PostgreSQL、Redis、图片和旧 API 设计误当作现状。

## 已删除

### `e2e/main-flow.spec.ts`

原因：全文件验证已删除的旧首页、旧用户接口、旧游戏接口、旧资源接口和旧分享接口；无当前应用路由、构建脚本或部署流程依赖，删除后通用 E2E 只发现当前 authoring 用例。

### `e2e/text-flow.spec.ts`

原因：全文件验证已删除的旧 `/api/games` 文字试玩和图片任务接口；无当前应用路由、构建脚本或部署流程依赖，当前互动分支写作闭环由 `e2e/authoring-interactive-flow.spec.ts` 覆盖。

## 已整理

- 当前源代码仍按 `src/app` 路由、`src/features/authoring` UI、`src/lib/authoring` 领域服务、`src/lib/interactive` 分支写作服务和 `src/scripts` 运维入口分层；没有进行高风险大文件重构。
- API 输入继续通过 Zod schema 和统一 JSON body 读取器校验；SQLite 查询使用参数绑定；HTML 导出继续使用脚本 JSON 转义和 `textContent` 渲染。
- `src/proxy.ts` 的 CSP、`nosniff`、防点击劫持、Referrer Policy 和 Permissions Policy 仍覆盖当前页面/API；默认服务保持 loopback。
- 具体证据：安全响应头和 nonce CSP 位于 `src/proxy.ts:20-29`，当前页面/API matcher 位于 `src/proxy.ts:34-35`；JSON body 大小门禁位于 `src/lib/authoring/api-contracts.ts:171-176`；SQLite 外键、WAL 和 busy timeout 位于 `src/lib/authoring/database.ts:63-66`；HTML 导出的脚本 JSON 转义位于 `src/lib/authoring/export-html.ts:37-43`，正文渲染使用 `textContent` 位于 `src/lib/authoring/export-html.ts:324-339`。
- Prompt、模型配置和 OpenAI-compatible provider 仍在服务端使用，不通过 `NEXT_PUBLIC_*` 暴露；真实 provider 请求继续只作为显式本地配置能力。
- `.gitignore` 已覆盖数据库、构建输出、测试报告、环境文件和日志；本轮 Docker 忽略规则与 Git 忽略规则保持一致方向。
- 当前有效文档集中到 `docs/README.md`；根目录旧路线图仅加归档提示，不删除历史证据。

## 未删除但疑似无用或不适合删除

- `data/`、`data/backups/`：可能包含作者故事和恢复点，属于用户数据，不能按清理任务删除。
- `output/`：包含 StoryForge PPT 和其他发布/测试产物，可能是用户交付物，保留。
- `dev-server*.log`：被 `.gitignore` 忽略的本地诊断日志，当前没有证据证明可以删除且不影响用户排障，保留。
- `.superpowers/`：本地审查和执行证据，已从 Docker 构建上下文排除，但不删除。
- 根目录历史审查和路线图：虽然内容不再描述当前实现，但包含迁移依据和决策记录，已标记归档而非删除。

## 安全审计结果

- 本次静态扫描未发现已跟踪的 `.env`、私钥或真实密钥文件；发现的 `sk-` 字符串均位于测试 mock/脱敏断言或 README 占位符中，未输出本地 `.env.local` 的值。
- `npm audit --json`：0 个漏洞；`npm audit --omit=dev --audit-level=high`：0 个生产依赖高危漏洞。
- 默认网络边界是 `127.0.0.1`；局域网覆盖会显式警告。项目无登录是产品明确的私人单作者边界，不应把服务暴露到公网。
- 当前没有 cookie 登录态，因此本轮未新增 CSRF token；若未来加入账户或 cookie 授权，所有变更 API 必须重新做服务端授权和 CSRF 审计。

## 已知未完成项

- `v0.1.7` 仍是功能分支候选标签，尚未合并到 `master`，未创建 GitHub Release。
- 当前 CI 只对 `master`、tag 和面向 `master` 的 PR 触发；功能分支本轮没有新增远端 CI 证据。
- Windows 清洁账户安装、代码签名和用户级安装器仍是发布人工门槛。
- Docker 镜像构建的修复后上下文在最终复验为 24.06 KB；本地 Docker 在 Alpine 容器 `npm ci` 阶段长时间无新输出，本轮停止等待，因此镜像最终成功状态仍需在稳定 Docker/网络环境复验，不能记为已通过。
- 宿主机的默认 `npm test` 曾在默认并发下出现 5 个超时/断言失败；固定 4 个 fork worker 后已复验稳定通过。这是本轮确认并修复的测试工程问题，不是业务接口失败证据。
- 当前仍有若干大文件需要后续按领域拆分：`src/lib/authoring/generation/repository.ts`、`src/lib/authoring/repository.ts`、`src/lib/authoring/graph.ts`、`src/lib/authoring/snapshots.ts` 和 `src/lib/authoring/backup.ts`。本轮没有做高风险重构，避免引入行为回归。

## 基线与验证记录

- 修复前 `npm run test:e2e` 发现 50 个测试；当前 authoring 前 12 个通过，旧测试从 `main-flow.spec.ts` 开始因退役页面/API 失败，随后停止等待。
- 清理后 `npm run test:e2e` 发现 12 个当前 authoring 测试并全部通过。
- `npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmmirror.com`：exit code `0`，安装 513 个包；随后 `npm rebuild better-sqlite3 --registry=https://registry.npmmirror.com --no-audit --no-fund`：exit code `0`，SQLite 内存探针返回 `1`。
- `npm run verify`：exit code `0`；TypeScript、ESLint、72 个 Vitest 文件和 303 个测试、Next 生产构建全部通过。
- `npm test`：72/72 文件、303/303 测试通过，exit code `0`；`npm run test:e2e`：12/12 通过，约 33.8 秒；`npm run test:e2e:authoring`：12/12 通过，约 33.4 秒。
- `npm run authoring:llm:smoke -- --dry-run`：exit code `0`，模型为 `doubao-seed-evolving`，`networkRequest:false`；本次没有发起真实模型请求。
- `npm run package:smoke`：exit code `0`，dry-run 明确列出 Node 24/standalone、better-sqlite3、数据隔离、升级回滚和卸载保留数据检查项，且标记 `destructive:false`。
- `npm audit --json` 和 `npm audit --omit=dev --audit-level=high`：均 exit code `0`，漏洞数为 `0`；清理后的 `browserslist` 为 `4.28.8`，`@types/pg`/`@types/uuid` 已不在直接依赖树中。
- `docker compose config --quiet` 与 LAN 覆盖配置校验：均 exit code `0`；`git diff --check`：exit code `0`。
- Docker build 已确认上下文 `24.06 KB`，但镜像构建在 `RUN npm ci` 阶段被停止，不能标记为通过；工作树保留本轮审计改动，尚未提交或推送。
