# StoryForge 文档中心

StoryForge 是私人、本地、单作者、文字优先的互动故事创作工作台。本文档中心按“当前使用 -> 运行维护 -> 发布证据 -> 历史追溯”组织；如果文档之间发生冲突，以根目录 [`README.md`](../README.md)、当前代码和最近验证记录为准。

## 当前使用

- [项目 README](../README.md)：安装、启动、产品闭环、环境变量和常用命令。
- [作者创作指南](authoring-user-guide.md)：从项目简报、分支写作到编辑、校验、快照和导出的操作流程。
- [恢复手册](authoring-recovery.md)：生成失败、项目备份、数据库 checkpoint 和导出恢复。

## 产品与架构

- [2026-09-08 深度审核](2026-09-08-deep-audit.md)：当前代码问题、隔离复现和证据边界。
- [稳定性与创作质量优化计划](superpowers/plans/2026-09-08-storyforge-reliability-roadmap.md)：阶段 A–D、依赖图、任务清单、当前执行状态和验收门槛。
- [事务边界](architecture/authoring-transaction-boundaries.md)：SQLite repository 的读写事务、lease 和连接 owner 约束。

- [作者驱动生成规格](superpowers/specs/2026-09-06-author-driven-generation-flow.md)：当前“作者选择、模型续写、有限收尾”的行为契约。
- [生产成熟度设计](superpowers/specs/2026-08-24-storyforge-production-maturity-design.md)：当前架构边界、风险和阶段目标。
- [作者驱动生成计划](superpowers/plans/2026-09-06-author-driven-generation-flow.md)：本轮实现计划和验收项。

## 运行维护

- [备份保留策略](operations/backup-retention.md)：SQLite checkpoint、manifest 和恢复演练。
- [Windows 数据生命周期](operations/windows-data-lifecycle.md)：本地数据路径、升级、回滚和卸载边界。
- [项目清理审计报告](2026-09-06-project-cleanup-audit.md)：源代码、配置、资源、依赖、缓存和发布产物的复核结果。

## 验证与发布

- [作者驱动生成验证记录](2026-09-06-author-driven-generation-flow-verification.md)：默认分支写作入口、模型适配和本轮验证证据。
- [结构化生成质量评测](quality/generation-evaluation.md)：fake 结构评测、live dry-run 和真实模型质量审阅边界。
- [发布检查清单](release/authoring-release-checklist.md)：当前候选版本的发布门禁与未完成人工门槛。
- [发布验证记录](release/authoring-verification.md)：命令结果、E2E 证据和历史发布记录。
- [互动真实模型审阅表](release/interactive-evaluation-review.md)：付费调用审批、逐幕叙事评分和最终收尾质量门槛。
- [依赖、SBOM 与签名策略](release/dependency-license-sbom-policy.md)：发布证据、依赖和签名要求。
- [GitHub Release 流程](release/github-release-procedure.md)：从 canonical `master` 到正式 GitHub Release 的操作步骤。
- [Windows 分发方案](architecture/windows-packaging-decision.md)：standalone 分发、安装和回滚边界。

## 历史审计与工程记录

- [2026-09-04 项目审计](2026-09-04-project-audit.md)：早一轮审计记录，结论可能已被 2026-09-06 清理审计更新。
- [`CHANGELOG.md`](../CHANGELOG.md)：版本变更摘要。
- [`docs/superpowers/plans/`](superpowers/plans/)：阶段计划和执行证据，保留用于追溯，不替代当前使用指南。

根目录中的 `PROJECT_*.md`、`IMPROVEMENTS_CHECKLIST.md` 和 `LOCAL_PERSISTENCE_DESIGN_AND_AUDIT.md` 保留为 2026-05 期间的历史审查与路线图资料，其中包含已经退役的 PostgreSQL、Redis、图片和旧 `/api/games` 架构描述。它们不应作为当前实现或发布状态的依据。
