# StoryForge 本地持久化设计与项目问题审查报告

生成日期：2026-05-20  
项目路径：`D:\Files\基于LLM的全自动独立游戏互动游戏叙事生成器\narrative-game`

## 0. 一句话结论

当前项目不是只有内存存储。项目已有 PostgreSQL 持久化方案，但本地测试常用 `USE_MEMORY_DB=true`，导致数据只存在 Node 进程内存里，重启就丢。建议新增“本地 SQLite 文件库”作为默认本地持久化方案：开发者和普通测试用户不需要启动 PostgreSQL，也能把故事、选择、分享、日志、图片任务保存到本机文件。

## 1. 当前存储现状

### 1.1 已有三类状态

| 类型 | 当前位置 | 是否持久 | 用途 |
|---|---|---:|---|
| 服务器数据 | PostgreSQL | 是 | 正式会话、场景、选择、图片任务、日志、用户 |
| 测试/回退数据 | `src/lib/memory-db.ts` | 否 | 无数据库时跑 smoke / E2E |
| 浏览器本地状态 | `localStorage` | 部分 | `game_sessionId`、`game_ownerToken`、`user_fingerprint` |

### 1.2 当前 PostgreSQL 表

已有迁移在 `src/lib/db.ts`：

- `game_sessions`：会话、状态快照、owner token、share token。
- `scenes`：每一幕场景、正文、NPC、选项 JSON、记忆摘要。
- `choices`：可选项、选择状态、状态影响。
- `asset_jobs`：图片任务。
- `asset_versions`：图片版本。
- `llm_logs`：LLM 调用日志。
- `asset_logs`：图片生成日志。
- `users`：匿名用户 fingerprint。
- `_migrations`：迁移版本。

### 1.3 当前 memory-db 风险

`memory-db.ts` 只是进程内 Map：

- 服务重启数据全丢。
- 开发热更新可能保留或重置状态，行为不稳定。
- SQL 解析靠正则，不是真数据库。
- 不支持完整 SQL 能力。
- 默认值、时间戳、JSONB、约束、外键与 PostgreSQL 行为不同。
- E2E 虽然通过，但日志已有 contract mismatch。

## 2. 本轮审查结果

### 2.1 已验证通过

执行结果：

```text
npm run typecheck
通过

npm run lint
通过，但有 1 个 warning

npm run test
19 files passed
209 tests passed

USE_MEMORY_DB=true MOCK_LLM=true npx playwright test e2e/text-flow.spec.ts --reporter=list
24 tests passed
```

### 2.2 发现的问题汇总

| 编号 | 级别 | 问题 | 影响 |
|---|---|---|---|
| A-01 | P0 | memory-db 不持久 | 用户误以为已保存，重启数据丢 |
| A-02 | P0 | `better-sqlite3` 已安装但无 SQLite 实现 | 依赖和功能不一致 |
| A-03 | P0 | memory-db 与 API contract 不一致，恢复接口缺 `createdAt` | E2E 过但控制台报 schema mismatch |
| A-04 | P0 | `playwright.config.ts` 未显式设置 `USE_MEMORY_DB=true` | 本机 `.env.local` 有 `DATABASE_URL` 时 E2E 可能误连 PostgreSQL |
| A-05 | P0 | 本地启动方式不清晰 | 用户不知道当前是内存、PostgreSQL、还是未来 SQLite |
| A-06 | P1 | lint 有 warning：`src/lib/store.ts` 未使用 `error` | 质量门禁虽过，但不干净 |
| A-07 | P1 | memory-db 正则 SQL 解析不可继续扩展 | 后续功能越多越脆 |
| A-08 | P1 | rate-limit 无 Redis 时也走内存 | 本地/单进程可用，多进程或重启失效 |
| A-09 | P1 | observability cost 统计主要是进程内状态 | 重启后预算统计归零风险 |
| A-10 | P1 | 本地图片资产没有文件存储规范 | 开启生图后，本地图片 URL、缓存、清理策略不清晰 |
| A-11 | P1 | 导出文件只浏览器下载，不进入本地归档目录 | 用户后续难统一管理故事 |
| A-12 | P1 | health 只显示 database ok/error，不显示当前 storage driver | 排查“到底存在哪”困难 |
| A-13 | P2 | README 对 memory/local/PostgreSQL 的边界说明不够醒目 | 新用户容易误用 |
| A-14 | P2 | Docker Compose 只覆盖 PostgreSQL 模式 | 没有轻量本地单文件模式 |
| A-15 | P2 | 没有数据备份/迁移/导入命令 | 交付后维护困难 |

## 3. 本地持久化目标

### 3.1 用户视角目标

- 不启动 PostgreSQL，也能保存故事。
- 重启电脑、重启 dev server 后故事还在。
- 可以继续之前的冒险。
- 可以导出完整故事。
- 可以清理旧故事。
- 可以备份一个本地数据目录。

### 3.2 开发视角目标

- PostgreSQL 仍保留，作为生产/团队部署方案。
- SQLite 作为本地默认持久化方案。
- memory 只用于测试，不作为用户数据方案。
- API 层尽量不改。
- 现有 `query()` / `withTransaction()` 抽象继续可用。
- E2E 和 unit test 可明确选择 memory 或 sqlite。

## 4. 推荐方案：SQLite 本地文件库

### 4.1 推荐架构

新增 storage driver：

```text
src/lib/db.ts
  -> 根据 STORAGE_DRIVER 选择：
     memory      测试专用，进程内
     sqlite      本地持久化，默认推荐
     postgres    生产/团队部署

src/lib/sqlite-db.ts
  -> better-sqlite3 实现
  -> 数据文件：data/storyforge.sqlite
  -> 迁移表：_migrations
```

建议环境变量：

```env
STORAGE_DRIVER=sqlite
SQLITE_DB_PATH=./data/storyforge.sqlite
LOCAL_ASSET_DIR=./data/assets
```

兼容旧环境变量：

- `USE_MEMORY_DB=true` 时强制 memory。
- `DATABASE_URL` 存在且 `STORAGE_DRIVER` 未设置时，可默认 postgres。
- `DATABASE_URL` 不存在且 `STORAGE_DRIVER` 未设置时，默认 sqlite，不再默认 memory。

### 4.2 推荐选择原因

SQLite 优点：

- 单文件，适合本地应用。
- 不需要 Docker。
- 不需要 PostgreSQL 服务。
- `better-sqlite3` 已经在依赖里。
- 对用户来说，备份 `data/` 目录即可。

SQLite 缺点：

- SQL 语法与 PostgreSQL 有差异。
- JSONB、TIMESTAMPTZ、SERIAL、INTERVAL 需要适配。
- 高并发能力不如 PostgreSQL。
- 生图 worker 多进程写入时要注意锁和 WAL。

综合判断：

- 本地单机体验：SQLite 最合适。
- 生产部署：PostgreSQL 继续保留。
- 自动测试：memory 可保留，但只允许测试使用。

## 5. 不推荐方案

### 5.1 继续使用 memory-db

不推荐原因：

- 不持久。
- 不是数据库。
- 越修越像手写数据库。
- 已经出现 API contract mismatch。

只能保留用途：

- 单元测试。
- E2E mock。
- 无数据库环境临时 smoke。

### 5.2 用 JSON 文件保存所有内容

不推荐原因：

- 并发写入容易损坏。
- 查询历史、分享、用户、日志会很乱。
- 后续迁移成本大。
- 与现有 SQL 结构不匹配。

适合用途：

- 导出故事归档。
- 单局只读 replay 文件。

### 5.3 只用 Docker PostgreSQL

不推荐作为唯一本地方案：

- 对普通用户门槛高。
- Windows 本地 Docker 依赖复杂。
- 用户只是测试剧情，不应先配置数据库服务。

仍保留用途：

- 生产等价开发。
- 多人协作。
- 部署前验证。

## 6. SQLite 数据库设计

### 6.1 数据目录

建议：

```text
narrative-game/
  data/
    storyforge.sqlite
    storyforge.sqlite-wal
    storyforge.sqlite-shm
    assets/
      image/
      export/
      backup/
```

`.gitignore` 必须增加：

```gitignore
/data/
*.sqlite
*.sqlite-wal
*.sqlite-shm
```

### 6.2 SQLite 表结构

SQLite 与 PostgreSQL 表保持语义一致：

```sql
CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  seed_prompt TEXT NOT NULL,
  genre TEXT,
  language TEXT DEFAULT 'zh-CN',
  rating TEXT DEFAULT 'PG-13',
  status TEXT DEFAULT 'active',
  current_scene_id TEXT,
  state_json TEXT DEFAULT '{}',
  owner_token TEXT,
  share_token TEXT,
  share_expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn INTEGER NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  body TEXT NOT NULL,
  npcs_json TEXT DEFAULT '[]',
  choices_json TEXT DEFAULT '[]',
  art_prompt_json TEXT DEFAULT '{}',
  bgm_cue_json TEXT DEFAULT '{}',
  memory_summary TEXT,
  mood TEXT DEFAULT '[]',
  time_of_day TEXT,
  chapter_goal TEXT,
  raw_model_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS choices (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  label TEXT NOT NULL,
  intent TEXT,
  risk TEXT,
  preview TEXT,
  state_effects_json TEXT DEFAULT '{}',
  selected_at TEXT,
  model_choice_id TEXT,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_jobs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  prompt_hash TEXT,
  prompt_json TEXT DEFAULT '{}',
  url TEXT,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
);
```

还需要：

- `asset_versions`
- `llm_logs`
- `asset_logs`
- `users`
- `_migrations`

### 6.3 SQLite pragmas

初始化时执行：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

原因：

- WAL 支持读写更稳。
- foreign_keys 确保级联删除生效。
- busy_timeout 避免短暂锁冲突直接失败。

## 7. Driver 选择规则

建议逻辑：

```ts
const storageDriver =
  process.env.USE_MEMORY_DB === "true"
    ? "memory"
    : process.env.STORAGE_DRIVER
      || (process.env.DATABASE_URL ? "postgres" : "sqlite");
```

规则：

1. `USE_MEMORY_DB=true` 永远最高优先级，只给测试用。
2. `STORAGE_DRIVER=sqlite` 明确使用 SQLite。
3. `STORAGE_DRIVER=postgres` 明确使用 PostgreSQL。
4. 没有配置时：
   - 有 `DATABASE_URL`：PostgreSQL。
   - 无 `DATABASE_URL`：SQLite。

## 8. 查询适配策略

### 8.1 最小改造方案

保留当前调用形式：

```ts
await query("SELECT ... WHERE id = $1", [id]);
await withTransaction(async (tx) => {
  await tx.query("INSERT ...", params);
});
```

SQLite adapter 内部做：

- `$1` 转 `?`
- `NOW()` 转 `CURRENT_TIMESTAMP`
- `JSONB` 用 `TEXT`
- `TIMESTAMPTZ` 用 `TEXT`
- `SERIAL PRIMARY KEY` 用 `INTEGER PRIMARY KEY AUTOINCREMENT`
- `RETURNING` 优先保留，SQLite 新版本支持；不支持时 adapter 手动补查询。

### 8.2 中期更稳方案

把 SQL 分层：

```text
src/lib/db/
  index.ts
  types.ts
  postgres.ts
  sqlite.ts
  memory.ts
  migrations/
    postgres.ts
    sqlite.ts
```

然后业务路由仍只 import：

```ts
import { query, initDb, withTransaction } from "@/lib/db";
```

### 8.3 长期最佳方案

抽象 Repository，不让 API route 直接写 SQL：

```text
src/lib/repositories/
  sessions.ts
  scenes.ts
  choices.ts
  assets.ts
  users.ts
  stats.ts
```

优点：

- PostgreSQL/SQLite 差异藏在 repository。
- 类型更稳。
- 测试更容易。

缺点：

- 改造量比 adapter 大。

建议执行顺序：

1. 先做 SQLite adapter，尽快解决本地持久化。
2. 再逐步拆 repository。

## 9. 本地资产存储设计

### 9.1 图片文件

生图开启后，本地 provider 或 mock provider 可以写：

```text
data/assets/image/{assetJobId}.png
```

数据库保存：

```text
/api/local-assets/image/{assetJobId}.png
```

新增 API：

```text
GET /api/local-assets/image/[assetJobId]
```

校验：

- 只允许读取 `data/assets/image` 下文件。
- 禁止 `../` 路径穿越。
- 分享页只允许读取公开分享会话对应图片。

### 9.2 导出文件

导出仍保留浏览器下载。可新增本地归档：

```text
data/assets/export/{sessionId}.md
data/assets/export/{sessionId}.json
```

用途：

- 用户本地备份。
- 后续做“故事书架”。

### 9.3 备份

新增脚本：

```text
npm run local:backup
npm run local:restore
```

备份内容：

```text
data/storyforge.sqlite
data/assets/
```

备份输出：

```text
data/backup/storyforge-backup-YYYYMMDD-HHmmss.zip
```

## 10. 详细执行路线图

### Phase 1：明确存储模式

- [ ] 在 `.env.example` 增加：

```env
STORAGE_DRIVER=sqlite
SQLITE_DB_PATH=./data/storyforge.sqlite
LOCAL_ASSET_DIR=./data/assets
```

- [ ] 在 README 增加“本地持久化模式”。
- [ ] 在 README 明确 `USE_MEMORY_DB=true` 只用于测试。
- [ ] 在 README 明确 `DATABASE_URL` 存在时默认 PostgreSQL。
- [ ] 在 README 增加数据目录备份说明。
- [ ] 在 `.gitignore` 增加 `/data/`、`*.sqlite*`。

验收：

- 用户能从 README 看懂三种存储区别。

### Phase 2：实现 storage driver 选择

- [ ] 新建 `src/lib/db/types.ts`。
- [ ] 定义统一返回类型：

```ts
export interface QueryResult {
  rows: Record<string, unknown>[];
  duration: number;
}

export type QueryFn = (text: string, params?: unknown[]) => Promise<QueryResult>;
```

- [ ] 新建 `src/lib/db/driver.ts`。
- [ ] 实现 `getStorageDriver()`。
- [ ] 修改 `src/lib/db.ts` 调用 driver。
- [ ] 保持现有 API route import 不变。

验收：

- `npm run typecheck` 通过。
- `USE_MEMORY_DB=true npm run test` 通过。

### Phase 3：实现 SQLite 初始化

- [ ] 新建 `src/lib/sqlite-db.ts` 或 `src/lib/db/sqlite.ts`。
- [ ] 创建 `data/` 目录。
- [ ] 打开 `SQLITE_DB_PATH`。
- [ ] 执行 WAL、foreign keys、busy timeout。
- [ ] 创建 `_migrations` 表。
- [ ] 实现 SQLite migrations 1-10。
- [ ] 实现 `sqliteQuery()`。
- [ ] 实现 `sqliteWithTransaction()`。
- [ ] 确认 `created_at`、`updated_at` 默认值生效。

验收：

```powershell
$env:STORAGE_DRIVER="sqlite"
$env:MOCK_LLM="true"
npm run db:init
npm run typecheck
npm run test
```

### Phase 4：适配 SQL 差异

- [ ] 支持 `$1` 参数转 `?`。
- [ ] 支持 `NOW()` 转 `CURRENT_TIMESTAMP`。
- [ ] 支持 `COUNT(*)::int` 查询改写或新增 SQLite stats SQL。
- [ ] 支持 `INTERVAL '24 hours'` 查询改写。
- [ ] 支持 JSON 字段 parse/stringify。
- [ ] 支持 transaction rollback。
- [ ] 支持 `RETURNING`，若当前 SQLite 不支持则手动补查询。

重点检查文件：

- `src/app/api/stats/route.ts`
- `src/app/api/games/[sessionId]/route.ts`
- `src/app/api/games/[sessionId]/choices/route.ts`
- `src/app/api/games/[sessionId]/export/route.ts`
- `src/lib/user-service.ts`
- `src/scripts/db-smoke-test.ts`

验收：

- SQLite 模式下 `/api/health` database ok。
- SQLite 模式下 `/api/games` 创建成功。
- SQLite 模式下 reload 可恢复。
- SQLite 模式下导出成功。

### Phase 5：新增 SQLite smoke test

- [ ] 新建 `src/scripts/sqlite-smoke-test.ts`。
- [ ] 测试创建数据库文件。
- [ ] 测试重复 init 幂等。
- [ ] 测试插入 user/session/scene/choice。
- [ ] 测试选择后 `selected_at` 更新。
- [ ] 测试删除 session 级联删除 scene/choice/asset。
- [ ] 测试重启进程后数据仍存在。

新增 package script：

```json
"db:sqlite:smoke": "tsx src/scripts/sqlite-smoke-test.ts"
```

验收：

```powershell
$env:STORAGE_DRIVER="sqlite"
npm run db:sqlite:smoke
```

### Phase 6：E2E 覆盖本地持久化

- [ ] 新建 `e2e/local-persistence.spec.ts`。
- [ ] 使用独立 SQLite 文件：

```text
data/test-e2e.sqlite
```

- [ ] 测试创建故事。
- [ ] 测试推进 3 步。
- [ ] 测试 reload 恢复。
- [ ] 测试关闭/重开 dev server 后仍可恢复。
- [ ] 测试导出。
- [ ] 测试删除或归档。

验收：

```powershell
$env:STORAGE_DRIVER="sqlite"
$env:SQLITE_DB_PATH="./data/test-e2e.sqlite"
$env:MOCK_LLM="true"
npx playwright test e2e/local-persistence.spec.ts
```

### Phase 7：修复现有审查问题

- [ ] 修复 `memory-db` 缺默认时间字段问题。
- [ ] 或降低 memory-db 契约要求，但必须在测试中显式覆盖。
- [ ] 修复 `src/lib/store.ts` lint warning。
- [ ] `playwright.config.ts` 显式设置 `USE_MEMORY_DB=true` 或 `STORAGE_DRIVER=sqlite`。
- [ ] health response 增加：

```json
{
  "storage": {
    "driver": "sqlite",
    "path": "./data/storyforge.sqlite",
    "persistent": true
  }
}
```

- [ ] README 加“如何确认当前数据存在哪里”。

### Phase 8：本地资产与备份

- [ ] 新建 `src/lib/local-asset-store.ts`。
- [ ] 新建 `src/app/api/local-assets/image/[assetJobId]/route.ts`。
- [ ] 生图 mock provider 输出真实本地占位图或静态文件。
- [ ] 导出故事时可选择写入 `data/assets/export`。
- [ ] 新建 `src/scripts/local-backup.ts`。
- [ ] 新建 `src/scripts/local-restore.ts`。
- [ ] README 增加备份/恢复流程。

验收：

- 删除项目外部临时文件不影响故事数据。
- 复制 `data/` 到另一台机器后可恢复。

## 11. 建议任务优先级

### P0：必须先做

- [ ] 实现 SQLite driver。
- [ ] 明确 `STORAGE_DRIVER` 选择规则。
- [ ] 修改 README 本地持久化说明。
- [ ] 修复 memory contract mismatch。
- [ ] 修复 Playwright storage env 不明确。
- [ ] 新增 SQLite smoke test。

### P1：完成后更稳定

- [ ] health 显示 storage driver。
- [ ] stats 查询适配 SQLite。
- [ ] rate-limit 本地持久化。
- [ ] observability/cost 本地持久化。
- [ ] local asset store。
- [ ] backup/restore 脚本。

### P2：体验优化

- [ ] 首页显示“当前保存模式：本地文件/内存/数据库”。
- [ ] 设置页显示本地数据路径。
- [ ] 提供“打开数据目录”说明。
- [ ] 提供“清空本地数据”命令。
- [ ] 提供“导入故事归档”。

## 12. 文件级修改清单

### 新增文件

- `src/lib/db/types.ts`
- `src/lib/db/driver.ts`
- `src/lib/db/sqlite.ts`
- `src/lib/db/postgres.ts`
- `src/lib/db/memory.ts`
- `src/lib/db/migrations/sqlite.ts`
- `src/scripts/sqlite-smoke-test.ts`
- `src/scripts/local-backup.ts`
- `src/scripts/local-restore.ts`
- `e2e/local-persistence.spec.ts`
- `src/lib/local-asset-store.ts`
- `src/app/api/local-assets/image/[assetJobId]/route.ts`

### 修改文件

- `src/lib/db.ts`
- `src/lib/memory-db.ts`
- `src/app/api/health/route.ts`
- `src/app/api/stats/route.ts`
- `src/scripts/db-smoke-test.ts`
- `playwright.config.ts`
- `.env.example`
- `.gitignore`
- `package.json`
- `README.md`
- `.github/workflows/ci.yml`

## 13. 验收标准

### 本地 SQLite 模式

- [ ] 不设置 `DATABASE_URL` 也能启动。
- [ ] 创建故事后生成 `data/storyforge.sqlite`。
- [ ] 重启 dev server 后故事仍在。
- [ ] 刷新浏览器后能恢复。
- [ ] 推进选择后 `state_json` 更新。
- [ ] 导出 JSON/Markdown 成功。
- [ ] 分享链接在本地可打开。
- [ ] `/api/health` 显示 `driver=sqlite`。
- [ ] `npm run db:sqlite:smoke` 通过。
- [ ] `npx playwright test e2e/local-persistence.spec.ts` 通过。

### Memory 测试模式

- [ ] `USE_MEMORY_DB=true` 时不创建本地文件。
- [ ] E2E mock 仍快速通过。
- [ ] health 明确显示 `driver=memory` 和 `persistent=false`。
- [ ] README 明确警告“重启会丢数据”。

### PostgreSQL 生产模式

- [ ] `DATABASE_URL` 存在且 `STORAGE_DRIVER=postgres` 时使用 PostgreSQL。
- [ ] `npm run db:smoke` 通过。
- [ ] Docker Compose 正常启动。
- [ ] 生产 health 不因 Redis disabled 错判。
- [ ] 生产安全变量齐全。

## 14. 当前项目距离可交付的主要缺口

项目主流程已经能跑，但交付还差：

1. 本地持久化没有真正实现。
2. memory 与真实 DB 行为不一致。
3. 存储模式配置不够显式。
4. API contract mismatch 在 E2E 日志中出现。
5. 本地资产和备份策略缺失。
6. CI 没有覆盖 SQLite 模式。
7. README 对“数据保存在哪里”不够清楚。
8. lint 还有 warning。
9. 真实 PostgreSQL、真实 LLM、真实图片 provider 仍需分别验收。

## 15. 推荐下一步

先做最小闭环：

1. `STORAGE_DRIVER` 选择器。
2. SQLite driver。
3. SQLite migrations。
4. SQLite smoke test。
5. README 本地保存说明。
6. E2E local persistence。

做完这 6 项，项目就能从“内存 demo”进化到“本地可长期测试、可保存、可备份”的可交付雏形。
