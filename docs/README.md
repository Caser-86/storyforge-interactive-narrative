# StoryForge Documentation

这里是当前项目文档入口。StoryForge 当前是私人、本地、单作者、文字优先的互动故事创作工作台，不是旧版即时试玩、图片任务或公开分享服务。

## 当前文档

- [项目 README](../README.md)：安装、启动、产品闭环、环境变量和常用命令。
- [作者创作指南](authoring-user-guide.md)：从项目简报、分支写作到编辑、校验、快照和导出的操作流程。
- [恢复手册](authoring-recovery.md)：生成失败、项目备份、数据库 checkpoint 和导出恢复。
- [备份保留策略](operations/backup-retention.md)：SQLite checkpoint、manifest 和恢复演练。
- [Windows 数据生命周期](operations/windows-data-lifecycle.md)：本地数据路径、升级、回滚和卸载边界。
- [发布检查清单](release/authoring-release-checklist.md)：当前候选版本的发布门禁与未完成人工门槛。
- [发布验证记录](release/authoring-verification.md)：命令结果、E2E 证据和历史发布记录。
- [依赖、SBOM 与签名策略](release/dependency-license-sbom-policy.md)：发布证据、依赖和签名要求。
- [GitHub Release 流程](release/github-release-procedure.md)：从 canonical `master` 到正式 GitHub Release 的操作步骤。
- [生产成熟度设计](superpowers/specs/2026-08-24-storyforge-production-maturity-design.md)：当前架构边界、风险和阶段目标。
- [本次全面审计报告](2026-09-04-project-audit.md)：本轮扫描、清理、修复和验证证据。

## 历史归档

根目录中的 `PROJECT_*.md`、`IMPROVEMENTS_CHECKLIST.md` 和 `LOCAL_PERSISTENCE_DESIGN_AND_AUDIT.md` 保留为 2026-05 期间的历史审查与路线图资料，其中包含已经退役的 PostgreSQL、Redis、图片和旧 `/api/games` 架构描述。它们不应作为当前实现或发布状态的依据。
