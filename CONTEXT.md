# StoryForge 项目现状

> 本文件是项目当前状态的快速上下文。它只记录已核验的现状，不替代代码、README 或发布证据。历史计划、旧审计和旧架构方案统一位于 [`docs/archive/`](docs/archive/)。

## 项目目标

StoryForge 是一个私人、本地、单作者、文字优先的互动故事创作工作台。作者先提供项目简报，再亲自选择每个分支方向；模型只生成当前选择后的下一幕，并在有限回合内完成收尾。完成后，作者可以编辑图谱、运行质量检查、封存快照并导出可离线播放的 HTML。

## 当前状态

- 正式版本：`0.1.8`。
- 已发布标签：`v0.1.8`，指向发布提交 `f2fec8b`；GitHub Release 已发布。
- 作者已完成手工项目测试并报告无问题，随后批准发布 `v0.1.8`；这不替代正式语义评分。
- GitHub 仓库为公开仓库，默认分支为 `master`；截至 2026-10-02，该分支尚未启用保护规则。
- GitHub 当前未检测到仓库许可证；没有添加许可证，不代表作者已选择授予开源许可。
- 默认产品边界：私人、本地、单作者、文字生成；无登录、无公网分享、无默认 Redis/PostgreSQL/图片 worker。
- 默认服务绑定：`127.0.0.1`。
- 本文件不固化工作树是否干净；提交、推送和发布状态以 Git 与 GitHub 的实际结果为准。

## 已完成能力

- 项目库、项目简报和本地 SQLite 持久化。
- 作者驱动的分支写作：生成场景和多个选择，作者选择一个方向，再生成下一幕。
- 有限回合的模型收尾，不预生成未选择的分支。
- 图谱编辑、作者支线、作者结局、结构/规则/可选 AI 质量检查。
- `selected_path` 单路径发布策略和 `branching_graph` 多结局策略。
- SQLite 迁移、备份、checkpoint、恢复演练、任务重试与失败恢复。
- 不可变快照、只读预览、离线 HTML 导出和 legacy session 只读导出。
- fake provider 自动化评测、受批准的 live 结构契约评测、standalone 分发和回滚 smoke。

## 当前未完成

权威清单见 [`TODO.md`](TODO.md)，当前主要是下一次发布前的人工质量门槛和后续分发/仓库治理工作：

- 为最终配置模型完成三套互动样本的四维语义评分，并由作者决定悬疑样本的后续承诺是否是有意的续作钩子。
- 补齐干净 Windows 账户安装、代码签名、用户安装器和真实设备可访问性验收。
- 为公开 GitHub 仓库的 `master` 配置分支保护与必需 CI 检查。
- 如需恢复用户历史上的“十个演示项目”，必须从原始数据库或 Docker 数据卷取得证据；当前仓库和已检查备份不能证明这十个项目存在，不得人工编造。

## 技术栈

- Next.js、React、TypeScript、Node.js 24、npm 11。
- SQLite（`better-sqlite3`）作为本地持久化。
- OpenAI-compatible 文本模型客户端；真实提供商由 `OPENAI_BASE_URL`、`OPENAI_API_KEY` 和 `OPENAI_MODEL` 配置。
- Vitest、Testing Library、Playwright、axe、ESLint、TypeScript 用于验证。
- Docker Compose 用于本地文本 authoring 服务和 standalone 分发验证，不是默认开发依赖。

## 核心架构

1. 浏览器页面承载项目库、分支写作、编辑器、预览和导出入口。
2. Next route handlers 提供项目、图谱、生成任务、质量检查、快照、互动会话和导出 API。
3. `src/lib/authoring/` 负责 SQLite repository、图谱规则、模型调用、任务租约、质量门禁和快照。
4. 生成任务与使用量账本持久化到 SQLite；重启后由受限重试和恢复逻辑继续处理。
5. 发布只接受通过质量门禁的不可变快照；HTML 导出不包含 API key、原始 prompt、原始 response 或内部错误细节。

## 关键目录

```text
src/app/(authoring)/       页面、编辑器、分支写作、预览
src/app/api/projects/      项目、图谱、生成、校验、快照和导出 API
src/lib/authoring/         SQLite、图谱、生成、质量和发布边界
src/scripts/               authoring smoke、备份、配置和 legacy 导出工具
src/__tests__/              单元测试和 API 测试
e2e/                       authoring 浏览器闭环测试
docs/                      当前运行/发布文档
docs/archive/              历史审计、计划、规格和旧路线图
data/                      本地 SQLite 数据与备份，不属于发布源码
```

## 关键决策

- 不引入登录或多用户系统，优先保证私人本地使用的可恢复性。
- 作者选择是分支写作的真实控制点；预览页面只读，不会偷偷调用模型生成新剧情。
- 模型生成必须受回合数、输出预算、场景长度、选择契约和结局契约约束。
- `selected_path` 允许作者走完一条完整路径后发布一个可达结局；明确要求多分支图谱时才使用 `branching_graph` 的多结局门槛。
- 数据恢复优先使用 SQLite checkpoint；项目 JSON 备份适合项目迁移，不承诺恢复进行中的模型租约。

## 后续工作

按优先级执行 [`TODO.md`](TODO.md)。任何新的功能或发布决定，先更新 TODO 和本文件，再修改 README 或历史证据，避免重新把历史快照当成当前状态。
