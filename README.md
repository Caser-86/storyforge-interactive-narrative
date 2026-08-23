# StoryForge

StoryForge 是一个私人本地互动叙事创作工作台。主流程是：项目库 -> 有限生成 -> 图谱编辑 -> 质量校验 -> 快照 -> 离线 HTML 导出。

当前发布版本：`v0.1.3`

当前产品只聚焦文字创作，不需要登录，不提供公开分享，不依赖 Redis、PostgreSQL 或图片 worker。默认服务只绑定 `127.0.0.1`。

## 快速开始

### 环境要求

- Node.js `24.x`
- npm `11.x`
- DeepSeek API key（仅在需要真实生成时配置）

### 安装

```powershell
git clone https://github.com/Caser-86/storyforge-interactive-narrative.git
cd storyforge-interactive-narrative
npm ci
```

创建 `.env.local`，不要把真实 key 提交到 Git：

```env
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
SQLITE_DB_PATH=./data/storyforge.sqlite
SQLITE_BACKUP_DIR=./data/backups
```

启动：

```powershell
npm run dev
```

打开 `http://127.0.0.1:3000`。

## 正式创作闭环

1. 在项目库创建项目并填写 brief。
2. 选择有限规模，启动分阶段生成。
3. 在编辑器修改节点和选择，人工内容不会被 AI 直接覆盖。
4. 运行结构、规则和可选 AI continuity review。
5. 解决阻断问题，确认当前修订通过发布检查。
6. 创建不可变快照，预览并导出独立 HTML。
7. 使用项目备份恢复到新项目 ID，或按需替换已有项目。

发布检查是快照和导出的唯一授权边界。导出的 HTML 不需要服务端，支持 `file://` 离线播放，并排除 API key、raw prompt、raw response、lease 和内部错误细节。

## 关键脚本

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 loopback 开发服务器 |
| `npm run build` | Next 生产构建 |
| `npm run start` | loopback 生产启动 |
| `npm run verify` | typecheck、lint、Vitest、生产构建 |
| `npm run test:e2e:authoring` | 生产构建下的 8 项完整 authoring E2E |
| `npm run db:authoring:smoke` | SQLite authoring 生命周期 smoke |
| `npm run db:authoring:backup` | 迁移前 SQLite 备份、完整性和 SHA-256 检查 |
| `npm run legacy:export -- --dry-run` | 只读检查旧 session，不删除源数据 |
| `npm run authoring:llm:smoke -- --dry-run` | 不发网络请求的 LLM 配置检查 |

## 数据与恢复

- 正式数据使用 authoring SQLite，不复用旧 `game_sessions` 图式。
- 自动迁移前备份写入 `SQLITE_BACKUP_DIR`，保留策略和恢复步骤见 [authoring-recovery.md](docs/authoring-recovery.md)。
- 项目 JSON 备份从项目库导出，恢复默认生成新项目 ID。
- 私人使用不提供登录或多用户隔离；不要把服务暴露到公网。

## Docker

Docker Compose 只启动一个本地文本 authoring 服务，并将 SQLite 数据挂载到 `storyforge-data`：

```powershell
docker compose up --build
```

默认 Compose 仅把端口发布到 `127.0.0.1`。如确需局域网访问，使用 `docker-compose.lan.yml` 显式覆盖；这不会增加登录或多用户隔离能力，禁止端口转发到公网。

## 目录结构

```text
src/app/(authoring)/                 # 项目库、brief、编辑器、生成、预览
src/app/api/projects/                # authoring API、备份、指标、验证、导出
src/lib/authoring/                   # SQLite repository、图谱、生成、质量和快照
src/scripts/authoring-*.ts           # authoring smoke、备份和配置检查
src/scripts/legacy-export.ts         # 旧数据只读导出迁移工具
src/__tests__/authoring/             # authoring 单元和 API 测试
e2e/authoring-*.spec.ts              # 完整浏览器闭环
```

## 发布验证

最终干净目录验证记录、覆盖矩阵和残余风险见 [authoring-verification.md](docs/release/authoring-verification.md)，执行前 checklist 见 [authoring-release-checklist.md](docs/release/authoring-release-checklist.md)。

旧游戏/图片/Redis 代码已经从默认运行链路退役；旧 session 只通过 `legacy:export` 在迁移窗口内读取，绝不自动迁移或删除。
