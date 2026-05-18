# StoryForge

StoryForge 是一个基于 LLM 的全自动独立互动叙事游戏生成器。用户输入一句灵感，系统生成可玩的故事场景、NPC、三项选择、状态变化和后续剧情分支；玩家每次选择都会推进故事走向。场景图是附属功能，默认关闭，可在开局时选择开启。

当前项目定位：可运行的产品原型，正在收敛到内部 Alpha。详细完工计划见 [PROJECT_DELIVERY_ROADMAP.md](./PROJECT_DELIVERY_ROADMAP.md)。
GitHub 仓库：`https://github.com/Caser-86/storyforge-interactive-narrative`

---

## 当前状态

已具备：

- 输入 prompt 创建游戏。
- LLM 生成首幕叙事、NPC、选择、图像提示、BGM 提示。
- 选择推进故事。
- PostgreSQL 保存 session、scene、choice、asset job。
- 对话剧情推进和后续选择分支生成。
- 可选 Redis/BullMQ 异步图片队列。
- 可选图片生成 mock/BFL provider 架构。
- 可选图片重绘和版本记录。
- owner token 权限校验。
- 用户 fingerprint 和历史游戏列表。
- 分享 replay。
- JSON/Markdown 导出。
- `/api/health` 和 `/api/stats`。
- Dockerfile 与 docker-compose 雏形。
- Vitest 单元/接口测试。

仍需交付前补齐：

- 图片功能默认附属，后续仍需完善开启后的 SSE asset 事件鉴权。
- 真实 PostgreSQL/Redis/Docker 冒烟。
- 真实 R2/S3 对象存储实现。
- Playwright E2E。
- 真实 provider 成本、质量、监控闭环。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16、React 19、Tailwind CSS 4、Zustand |
| API | Next.js Route Handlers |
| 数据库 | PostgreSQL |
| 队列 | Redis、BullMQ |
| LLM | OpenAI-compatible API，默认 DeepSeek |
| 图片 | mock provider、BFL provider |
| 测试 | Vitest |
| 部署 | Docker、Docker Compose |

---

## 快速启动

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

至少配置：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/narrative_game
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-chat
IMAGE_PROVIDER=mock
ENABLE_IMAGE_GENERATION=false
TOKEN_SALT=replace-with-a-long-random-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

默认主流程只跑文字剧情推进。开局勾选“场景图”或设置 `ENABLE_IMAGE_GENERATION=true` 后，系统才会创建图片任务；如果 Redis 未启动，文字玩法仍可跑，但图片队列会降级或失败。

### 3. 初始化数据库

```bash
npm run db:init
```

### 4. 启动开发服务

```bash
npm run dev
```

打开 `http://localhost:3000`。

### 5. 启动图片 worker

```bash
npm run worker
```

---

## Docker 启动

Docker 运行的是生产模式，必须配置随机 `TOKEN_SALT`，不能使用默认占位值。

```bash
docker compose build
docker compose up -d
docker compose logs -f app worker
```

健康检查：

```bash
curl http://localhost:3000/api/health
```

服务：

| 服务 | 说明 | 端口 |
|---|---|---|
| `app` | Next.js 应用 | `3000` |
| `worker` | BullMQ 图片 worker | 无公开端口 |
| `db` | PostgreSQL 16 | `5432` |
| `redis` | Redis 7 | `6379` |

---

## 常用命令

```bash
npm run dev          # 开发服务器
npm run build        # 生产构建
npm run start        # 生产启动
npm run lint         # ESLint
npm run typecheck    # TypeScript 类型检查
npm run test         # Vitest 全量测试
npm run db:init      # 初始化数据库并执行 migrations
npm run worker       # 启动图片 worker
```

交付前固定检查：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

## 环境变量

| 变量 | 必填 | 说明 | 默认/示例 |
|---|---|---|---|
| `DATABASE_URL` | 是 | PostgreSQL 连接字符串 | `postgresql://postgres:postgres@localhost:5432/narrative_game` |
| `REDIS_URL` | Beta 必填 | Redis/BullMQ 连接字符串 | `redis://localhost:6379` |
| `DISABLE_REDIS` | 否 | 设为 `true` 时禁用 Redis 队列，适合本地降级 | 空 |
| `OPENAI_API_KEY` | 是 | LLM API key | `sk-...` |
| `OPENAI_BASE_URL` | 是 | OpenAI-compatible base URL | `https://api.deepseek.com` |
| `OPENAI_MODEL` | 是 | LLM 模型 | `deepseek-chat` |
| `IMAGE_PROVIDER` | 是 | 图片 provider：`mock` 或 `bfl` | `mock` |
| `ENABLE_IMAGE_GENERATION` | 否 | 设为 `true` 时全局默认开启场景图；不设时由开局选项决定，默认关闭 | `false` |
| `BFL_API_KEY` | BFL 必填 | Black Forest Labs API key | 空 |
| `TOKEN_SALT` | 生产必填 | owner token hash 盐，生产不能用占位值 | 随机长字符串 |
| `ADMIN_TOKEN` | 生产必填 | `/api/stats` 管理鉴权 | 随机长字符串 |
| `DAILY_TOKEN_LIMIT` | 否 | 每日 LLM token 预算 | `1000000` |
| `DAILY_ASSET_LIMIT` | 否 | 每日图片预算 | `500` |
| `COPYRIGHT_PATTERNS` | 否 | 版权词替换规则，格式 `pattern=>replacement;...` | 空 |
| `NEXT_PUBLIC_APP_URL` | 建议 | 生成分享链接的公开地址 | `http://localhost:3000` |
| `NEXT_PUBLIC_BASE_URL` | 否 | 兼容旧变量名，也可用于分享链接 | 空 |
| `R2_ENDPOINT` | 存储必填 | R2/S3 endpoint | 空 |
| `R2_ACCESS_KEY_ID` | 存储必填 | R2/S3 access key | 空 |
| `R2_SECRET_ACCESS_KEY` | 存储必填 | R2/S3 secret key | 空 |
| `R2_BUCKET` | 存储必填 | bucket 名称 | `narrative-assets` |
| `R2_REGION` | 否 | region | `auto` |
| `R2_PUBLIC_URL` | 存储必填 | CDN/public base URL | 空 |

注意：当前对象存储实现仍需替换为标准 S3/R2 签名上传，详见路线图。

---

## API 概览

所有错误响应统一形状：

```json
{
  "code": "FORBIDDEN",
  "message": "Invalid owner token",
  "traceId": "abc123"
}
```

### `POST /api/games`

创建新游戏并生成首幕。

请求体：

```json
{
  "prompt": "一个赛博朋克侦探在雨夜追踪失踪的AI",
  "language": "zh-CN",
  "rating": "PG-13",
  "options": {
    "visualStyle": "neon noir, rain-soaked street"
  }
}
```

可选请求头：

- `x-user-fingerprint`：用户识别，用于历史游戏列表。

响应：

```json
{
  "sessionId": "sess_xxx",
  "ownerToken": "ot_xxx",
  "scene": {
    "id": "scene_xxx",
    "title": "雨夜的信号",
    "location": "第七码头",
    "timeOfDay": "深夜",
    "mood": ["紧张", "神秘"],
    "body": "...",
    "npcs": [],
    "choices": [],
    "artPrompt": {
      "prompt": "...",
      "negativePrompt": "...",
      "aspectRatio": "16:9",
      "styleLock": "...",
      "seedHint": 42
    },
    "bgmCue": {
      "mood": "mysterious",
      "bpm": 72,
      "instruments": ["piano", "strings"],
      "loopSeconds": 32,
      "sfx": [],
      "musicPrompt": "..."
    },
    "chapterGoal": "...",
    "memorySummary": "..."
  },
  "statePatch": {},
  "safety": {
    "rating": "PG-13",
    "contentWarnings": []
  },
  "assets": {
    "imageJobId": "asset_xxx",
      "imageStatus": "none"
  },
  "timing": {
    "llmMs": 1200,
    "totalMs": 1500
  },
  "meta": {
    "usedFallback": false,
    "llmError": null
  }
}
```

客户端必须保存 `ownerToken`。后续私有读写接口需要 `x-owner-token`。默认返回 `imageJobId: null`，表示本局未启用场景图。

### `GET /api/games/[sessionId]`

恢复会话。

请求头：

- `x-owner-token`：私有会话必填。

响应包含：

- `session`：会话元信息。
- `scenes`：完整 scene 列表，包括正文、NPC、choices、artPrompt、bgmCue。
- `assets`：当前 scene 的图片任务状态；未启用场景图时为 `imageJobId: null`、`imageStatus: "none"`。

### `POST /api/games/[sessionId]/choices`

选择一个选项并推进故事。

请求头：

- `x-owner-token`：必填。

请求体：

```json
{
  "sceneId": "scene_xxx",
  "choiceId": "choice_xxx_choice_a"
}
```

响应重点字段：

```json
{
  "sessionId": "sess_xxx",
  "previousChoiceId": "choice_xxx_choice_a",
  "scene": {},
  "stateDiff": {
    "tension": 5
  },
  "safety": {},
  "assets": {
    "imageJobId": null,
    "imageStatus": "none"
  },
  "timing": {
    "llmMs": 1300
  }
}
```

### `GET /api/assets/[assetJobId]`

查询图片任务状态。

请求头：

- `x-owner-token`：私有资产必填。

响应：

```json
{
  "id": "asset_xxx",
  "status": "completed",
  "type": "image",
  "url": "https://cdn.example.com/asset.png",
  "provider": "bfl",
  "error": null,
  "versions": []
}
```

### `POST /api/assets/[assetJobId]`

重新生成图片，并保留旧版本。

请求头：

- `x-owner-token`：必填。

请求体：

```json
{
  "quality": "standard"
}
```

### `GET /api/games/[sessionId]/events`

SSE 推送 asset 状态。

事件：

- `asset.completed`
- `asset.failed`
- `asset.updated`

当前交付状态：功能可用，但 SSE 权限仍需按路线图改为短期 stream token。

### `POST /api/games/[sessionId]/share`

生成只读分享链接。

请求头：

- `x-owner-token`：必填。

响应：

```json
{
  "shareUrl": "/share/xxx",
  "shareToken": "xxx"
}
```

R 级内容禁止公开分享。

### `GET /api/share/[token]`

读取只读 replay。

响应不会返回 `session.id`、`ownerToken`、`state_json`、`raw_model_json`。

### `GET /api/games/[sessionId]/export?format=json|markdown`

导出故事。

请求头：

- `x-owner-token`：必填。

### `GET /api/health`

健康检查，返回 database、redis、llm、imageProvider、budget、secret 配置等状态。

生产环境如果 `TOKEN_SALT` 是占位值，会返回 error。

### `GET /api/stats`

统计接口。

生产环境请求头：

- `Authorization: Bearer $ADMIN_TOKEN`

---

## 数据表

| 表 | 说明 |
|---|---|
| `_migrations` | migration 版本记录 |
| `users` | fingerprint 用户 |
| `game_sessions` | 游戏会话、owner token hash、share token |
| `scenes` | 场景正文、NPC、choices、artPrompt、bgmCue |
| `choices` | 可选择项和已选时间 |
| `asset_jobs` | 图片生成任务 |
| `asset_versions` | 图片重绘历史 |
| `llm_logs` | LLM 调用日志 |
| `asset_logs` | 图片 provider 调用日志 |

---

## 项目结构

```text
src/
  app/
    api/                  API routes
    components/           前端组件
    page.tsx              主游戏页
  lib/
    api-contracts.ts      API 响应契约
    schemas.ts            叙事核心 schema
    db.ts                 PostgreSQL migrations
    store.ts              Zustand 客户端状态
    narrative-service.ts  LLM 叙事生成
    asset-service.ts      图片 provider
    asset-queue.ts        BullMQ 队列
    object-storage.ts     对象存储
  scripts/
    asset-worker.ts       图片 worker
    init-db.ts            初始化数据库
  __tests__/              Vitest 测试
```

---

## 交付文档

- [PROJECT_DELIVERY_ROADMAP.md](./PROJECT_DELIVERY_ROADMAP.md)：可交付完工路线图。
- [PROJECT_REMEDIATION_ACTION_PLAN.md](./PROJECT_REMEDIATION_ACTION_PLAN.md)：当前整改执行清单，主线聚焦对话剧情推进，图片默认关闭。
- [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md)：较早阶段的项目路线图。
- [PROJECT_COMPLETION_REVIEW.md](./PROJECT_COMPLETION_REVIEW.md)：历史审查记录。
- [IMPROVEMENTS_CHECKLIST.md](./IMPROVEMENTS_CHECKLIST.md)：历史改进清单。

当前后续执行请以 `PROJECT_DELIVERY_ROADMAP.md` 为准。
