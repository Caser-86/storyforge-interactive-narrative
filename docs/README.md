# StoryForge 文档中心

StoryForge 是私人、本地、单作者、文字优先的互动故事创作工作台。文档按“当前使用 -> 运行维护 -> 验证发布 -> 历史追溯”组织；冲突时以根目录 [`README.md`](../README.md)、当前源码和最新带日期的验证记录为准。

## 当前状态

- [项目上下文](../CONTEXT.md)：目标、技术栈、架构、已完成功能和当前限制。
- [未完成事项](../TODO.md)：当前唯一的 P0-P3 待办入口。
- [项目 README](../README.md)：安装、启动、产品闭环、环境变量和常用命令。

## 当前使用

- [作者创作指南](authoring-user-guide.md)：从项目简报、分支写作到编辑、校验、快照和导出的操作流程。
- [恢复手册](authoring-recovery.md)：生成失败、项目备份、数据库 checkpoint 和导出恢复。

## 产品与架构

- [事务边界](architecture/authoring-transaction-boundaries.md)：SQLite repository 的读写事务、lease 和连接 owner 约束。
- [Windows 分发方案](architecture/windows-packaging-decision.md)：standalone 分发、安装和回滚边界。
- [结构化生成质量评测](quality/generation-evaluation.md)：fake 结构评测、live dry-run 和真实模型质量审阅边界。

## 运行维护

- [备份保留策略](operations/backup-retention.md)：SQLite checkpoint、manifest 和恢复演练。
- [Windows 数据生命周期](operations/windows-data-lifecycle.md)：本地数据路径、升级、回滚和卸载边界。

## 验证与发布

- [发布检查清单](release/authoring-release-checklist.md)：`v0.1.8` 的历史发布记录及后续版本检查依据；当前待办见 [`TODO.md`](../TODO.md)。
- [发布验证记录](release/authoring-verification.md)：命令结果、E2E 证据和历史发布记录。
- [互动真实模型审阅表](release/interactive-evaluation-review.md)：付费调用审批、逐幕叙事评分和最终收尾质量门槛。
- [互动评测预审](release/interactive-evaluation-pre-review.md)：AI 辅助的结构与质量预审，不替代作者评分。
- [依赖、SBOM 与签名策略](release/dependency-license-sbom-policy.md)：发布证据、依赖和签名要求。
- [GitHub Release 流程](release/github-release-procedure.md)：从 canonical `master` 到正式 GitHub Release 的操作步骤。

## 历史追溯

- [`CHANGELOG.md`](../CHANGELOG.md)：版本变更摘要。
- [历史文档归档](archive/README.md)：日期审计、阶段计划、设计规格和早期路线图；不作为当前实现依据。

归档资料中可能包含已经退役的 PostgreSQL、Redis、图片和旧 `/api/games` 架构描述。当前实现和发布状态以根目录 [`README.md`](../README.md)、[`CONTEXT.md`](../CONTEXT.md)、[`TODO.md`](../TODO.md)、源代码和当前发布验证记录为准。
