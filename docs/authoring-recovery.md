# StoryForge 恢复手册

## 生成失败

编辑器的生成进度会保存在 SQLite。遇到超时、网络或限流错误时，先检查本地配置，再从生成页面点击恢复或重试；认证和 schema 错误不会用固定正文冒充成功。

分支写作的下一幕生成失败时，后台任务会释放当前选择，留在原场景并允许重新选择；失败原因会保存在本地会话并显示在原场景上，不会静默回退。超时、网络、限流和模型结构化输出漂移会在互动场景内进行有限重试；鉴权错误不会重试，结构仍然无法校验时才会显示失败，避免用占位正文冒充成功。互动生成会先持久化为 `generating` 会话和 SQLite 任务，页面自动轮询结果；任务 lease 默认 5 分钟、单任务截止时间 30 分钟、最多 3 次任务尝试。若本地服务进程在生成过程中关闭，重新打开页面时会从数据库重新领取过期任务，不依赖原页面仍然打开；超过有界恢复次数后由作者明确重试。开场生成被中断的会话会标记为失败，重新点击“开始分支写作”即可创建新会话。

模型客户端默认超时为 180 秒，可在本地 `.env.local` 设置 `OPENAI_TIMEOUT_MS` 覆盖；调整后应确保互动任务截止时间仍长于该值。火山方舟的 `doubao-*` 结构化请求会显式关闭 extended thinking，避免互动分支把超时时间消耗在不需要的隐藏推理上。

互动调用会写入本地用量账本，只保存任务、尝试、模型、请求 ID、状态、token 数和耗时，不保存 API key、原始 prompt 或原始模型响应。设置 `STORYFORGE_MAX_OUTPUT_TOKENS` 后，预算按单个互动会话累计；请求超时且服务端无法确认 token 时，预留额会进入 `unknown`，需要作者检查配置或重新开始，不会被当作免费调用。

走到结局后保存正式草稿失败时，当前会话和已生成回合不会丢失；可以留在结局页再次点击保存。保存请求具备幂等性，刷新或重复点击不会为同一会话创建多个草稿版本。

## 项目恢复

1. 在项目库选择“导入备份”。
2. 选择由 StoryForge 导出的 `.json` 文件。
3. 默认以“新项目”方式导入，原项目和快照不会被覆盖。
4. 导入失败时原文件仍保留在文件选择控件中，可修正后重试。

项目备份会包含已生成互动会话及每一幕的选择记录，但不包含进行中的任务 lease 和用量账本。导入带有进行中状态的 JSON 时，开场会恢复为失败并提供重试，下一幕会恢复为 active 并释放未完成选择，避免出现没有后台任务却永久显示“生成中”。需要精确保留任务、预算和 lease 状态时，应使用 SQLite checkpoint。删除互动记录只删除选中的会话；删除项目会级联删除该项目的互动会话、回合、任务和调用账本。

## 数据库恢复

迁移前自动备份和日常 checkpoint 都位于 `SQLITE_BACKUP_DIR`，默认是 `./data/backups`。迁移前备份用于升级回滚，日常 checkpoint 带有 manifest 和保留策略。保留规则见 [backup-retention.md](operations/backup-retention.md)。

创建日常 checkpoint：

```powershell
npm run db:authoring:checkpoint
```

命令会输出 SQLite 文件、manifest、完整性结果和 SHA-256。旧的迁移前备份命令仍可用于手动验证迁移前副本：

```powershell
npm run db:authoring:backup
```

恢复前停止 StoryForge，先对候选 checkpoint 做非破坏性恢复演练：

```powershell
npm run db:authoring:restore-check -- --latest
```

演练会在临时副本中运行迁移、`PRAGMA integrity_check`、外键检查和图谱读取检查，成功后删除临时副本。确认项目数量和图谱可读后，再把候选 SQLite 复制到新的恢复位置并启动应用。不要覆盖正在运行中的 SQLite 文件，也不要删除旧数据库作为“修复”手段。

## 导出恢复

HTML 导出只依赖自身内嵌的故事数据和浏览器本地存储。即使 StoryForge 服务停止、网络被阻断或 `localStorage` 不可用，也应能完成当前路径；如果导出文件不能打开，请重新对当前修订通过校验并创建快照后再导出。

## 本地 Doctor

需要快速判断本地环境是否适合继续创作时运行：

```powershell
npm run authoring:doctor
```

报告只包含数据库完整性、迁移版本、可写性、checkpoint 新鲜度、loopback/LAN 模式和模型是否已配置，不包含文件路径、项目标题、API key、原始 prompt 或模型响应。项目库也会显示同一组恢复提示。

## 不包含的内容

项目备份和离线 HTML 都不应包含 API key、Authorization header、原始 prompt、原始 provider response、数据库租约或内部生成错误上下文。发现这些内容时不要公开文件，先保留本地文件并报告问题。
