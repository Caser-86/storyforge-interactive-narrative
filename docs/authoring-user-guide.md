# StoryForge 私人创作工作台

当前正式主路径是本地“项目库 -> 生成 -> 编辑 -> 校验 -> 快照 -> 预览/导出”。它面向单一作者，不需要登录，也不提供公共分享安全承诺。

## 安装与配置

1. 使用 Node.js 24 和 npm，执行 `npm ci`。
2. 在 `.env.local` 配置 `SQLITE_DB_PATH`，默认是 `./data/storyforge.sqlite`。
3. 配置 OpenAI-compatible 文本模型：`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`。密钥只保留在本地环境文件，不会进入项目备份或 HTML 导出。
4. 执行 `npm run dev`，默认只监听 `127.0.0.1:3000`。

## 创作闭环

1. 新建项目并填写简报。
2. 进入生成流程，生成任务可暂停、恢复和重试。
3. 在编辑器中修改节点正文和选择，人工改写不会被模型静默覆盖。
4. 在发布检查中重新验证当前修订，处理阻断问题，必要时关闭 warning。
5. 创建不可变快照，再使用预览或下载离线 HTML。

## 备份

- 项目库中的“备份”下载 `storyforge-project@1` JSON，可在项目库“导入备份”中恢复为新项目。
- 项目备份包含故事结构、版本、验证状态和非敏感生成统计；不包含 API key、原始 prompt、原始模型响应或租约。
- 数据库迁移前会自动生成并校验 SQLite 备份；也可以执行 `npm run db:authoring:backup` 手动生成一份。

## 安全边界

默认启动只允许本机访问。只有明确设置 `STORYFORGE_ALLOW_LAN=true` 并配置非 loopback host 时才会警告后启动；这不代表应用具备多用户隔离或公开部署安全性。
