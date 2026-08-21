# StoryForge 恢复手册

## 生成失败

编辑器的生成进度会保存在 SQLite。遇到超时、网络或限流错误时，先检查本地配置，再从生成页面点击恢复或重试；认证和 schema 错误不会用固定正文冒充成功。

## 项目恢复

1. 在项目库选择“导入备份”。
2. 选择由 StoryForge 导出的 `.json` 文件。
3. 默认以“新项目”方式导入，原项目和快照不会被覆盖。
4. 导入失败时原文件仍保留在文件选择控件中，可修正后重试。

## 数据库恢复

迁移前自动备份位于 `SQLITE_BACKUP_DIR`，默认是 `./data/backups`。手动备份命令会输出路径、完整性结果和 SHA-256：

```powershell
npm run db:authoring:backup
```

恢复前停止 StoryForge，复制经 `PRAGMA integrity_check` 验证通过的 SQLite 文件，再启动应用。不要覆盖正在被运行中的 SQLite 文件，也不要删除旧数据库作为“修复”手段。

## 导出恢复

HTML 导出只依赖自身内嵌的故事数据和浏览器本地存储。即使 StoryForge 服务停止、网络被阻断或 `localStorage` 不可用，也应能完成当前路径；如果导出文件不能打开，请重新对当前修订通过校验并创建快照后再导出。

## 不包含的内容

项目备份和离线 HTML 都不应包含 API key、Authorization header、原始 prompt、原始 provider response、数据库租约或内部生成错误上下文。发现这些内容时不要公开文件，先保留本地文件并报告问题。
