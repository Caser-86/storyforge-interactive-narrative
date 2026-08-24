# StoryForge 数据库 Checkpoint 保留策略

## 默认策略

`npm run db:authoring:checkpoint` 会在 `SQLITE_BACKUP_DIR` 中创建一个 SQLite checkpoint 和同名 manifest。manifest 会记录创建时间、文件大小、SHA-256、迁移版本和完整性结果。

默认保留：

- 最近 14 个日历日内每日至少一个最新 checkpoint。
- 最近 8 个 ISO 周内每周至少一个最新 checkpoint。

两个集合会合并保留，因此实际文件数可能少于 22 个，也可能因为日周集合重叠而更多。迁移前自动备份仍使用 `authoring-before-migration-` 前缀和独立的 10 个文件保留策略。

## Windows Task Scheduler

建议在 StoryForge 关闭或数据库没有写入时运行 checkpoint。任务操作可使用：

```powershell
npm run db:authoring:checkpoint
```

任务的“起始位置”必须是项目目录，环境变量 `SQLITE_DB_PATH` 和 `SQLITE_BACKUP_DIR` 必须指向作者明确选择的本地位置。checkpoint 不会上传文件，也不会包含 API key。

## 恢复演练

不要直接覆盖当前数据库。先停止 StoryForge，再运行：

```powershell
npm run db:authoring:restore-check -- --latest
```

该命令只复制 checkpoint 到临时目录，在副本上运行迁移、完整性检查、外键检查和图谱可读性检查，完成后删除临时目录。通过演练后，才可以在停止应用的前提下把候选文件复制到新的恢复位置。
