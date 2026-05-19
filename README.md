# StoryForge

基于 LLM 的互动叙事生成器，面向“输入一句灵感，生成可玩的剧情场景，并通过选择推进后续分支故事”的文字互动体验。支持首幕生成、分支选择、剧情状态延续、故事长度规划、阶段推进、结局收束、会话恢复、只读分享、JSON/Markdown 导出、权限校验，以及可选的场景图异步生成链路。

当前主产品路径是“对话剧情推进”。场景图功能作为附属模块默认关闭，只有在开局勾选或显式配置 `ENABLE_IMAGE_GENERATION=true` 时才会创建图片任务。

当前故事执行不是无限续写模式。每局会按短篇 / 中篇 / 长篇目标步数推进，并通过 `setup`、`development`、`crisis`、`resolution`、`ending` 阶段逐步收束；旧版固定 `turn >= 12` 的硬截断已被动态 `targetTurns` 和 `endingReadiness` 机制替代。

GitHub 仓库：`https://github.com/Caser-86/storyforge-interactive-narrative`

[![Repo](https://img.shields.io/badge/GitHub-StoryForge-1f2335?logo=github)](https://github.com/Caser-86/storyforge-interactive-narrative)
![Next.js](https://img.shields.io/badge/Next.js-16-111827?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19-0f172a?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-1d4ed8?logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-ready-334155?logo=postgresql)
![Mode](https://img.shields.io/badge/Mode-Story%20First-e11d48)

![StoryForge Start Screen](docs/images/readme/start-screen.png)
![StoryForge Story Scene](docs/images/readme/story-scene.png)

---

## 项目定位

| 项目方向 | 当前状态 |
|------|------|
| **文字剧情推进** | 当前唯一主路径，优先保证可玩性、连续性、恢复能力和分支差异 |
| **故事生命周期** | 已接入短篇 / 中篇 / 长篇目标步数、阶段推进、结局准备度和结局状态 |
| **场景图生成** | 附属增强模块，默认关闭，按局开启 |
| **分享与导出** | 已接通，只读 replay、JSON/Markdown 导出可用 |
| **交付收口** | 正在从原型收敛到内部 Alpha |

---

## 项目结构

```text
src/
├── app/
│   ├── api/
│   │   ├── games/                      # 创建游戏、推进选择、恢复会话、SSE、分享、导出
│   │   ├── assets/                     # 图片任务查询与重绘
│   │   ├── share/                      # 只读 replay 与公开资产读取
│   │   ├── health/                     # 健康检查
│   │   ├── stats/                      # 运行统计与成本统计
│   │   ├── templates/                  # 开局风格模板
│   │   └── user/                       # 指纹用户与历史游戏
│   ├── components/                     # 开局页、故事页、状态页、画面页、回放页
│   ├── share/[token]/page.tsx          # 分享回放页面
│   ├── layout.tsx                      # 页面元信息与全局布局
│   └── page.tsx                        # 主应用入口
├── lib/
│   ├── narrative-service.ts            # LLM 叙事生成与 fallback
│   ├── prompts.ts                      # 叙事与分支选择 prompt 约束
│   ├── story-state-service.ts          # 状态推进、上下文压缩、选择效果应用
│   ├── story-arc-service.ts            # 故事长度、阶段推进、结局判断
│   ├── schemas.ts                      # 叙事输出、场景、choice、BGM、状态 schema
│   ├── api-contracts.ts                # 前后端 API 契约
│   ├── store.ts                        # Zustand 客户端状态与恢复逻辑
│   ├── db.ts                           # PostgreSQL migrations 与查询封装
│   ├── memory-db.ts                    # 无数据库时测试/回退内存实现
│   ├── asset-service.ts                # 图片 provider 封装
│   ├── asset-queue.ts                  # BullMQ 队列与 Redis 连接
│   ├── object-storage.ts               # R2/S3 存储上传
│   ├── crypto.ts                       # owner token / stream token 签名与校验
│   ├── safety-service.ts               # 输入/输出安全与版权替换
│   ├── observability.ts                # LLM / asset 调用统计
│   └── user-service.ts                 # 指纹用户与数据清理
├── scripts/
│   ├── init-db.ts                      # 初始化数据库
│   ├── db-smoke-test.ts                # PostgreSQL schema 冒烟
│   ├── llm-smoke-test.ts               # LLM provider 冒烟
│   └── asset-worker.ts                 # 图片异步 worker
├── __tests__/                          # Vitest 单元与接口测试
└── e2e/                                # Playwright E2E
```

---

## 核心特性

| 特性 | 说明 |
|------|------|
| **剧情首幕生成** | 用户输入一句灵感后，生成标题、地点、时间、气氛、正文、NPC、三项选择、章节目标与记忆摘要 |
| **分支剧情推进** | 玩家选择会驱动后续剧情生成，并通过 `stateDiff`、`StoryState`、`memorySummary` 延续上下文 |
| **故事长度与结局** | 支持短篇 7-12 步、中篇 20-40 步、长篇 50-100 步；按阶段推进并在结局阶段收束 |
| **会话恢复** | 刷新页面或从历史列表进入时，可恢复最后一幕完整 scene 与可继续选择的分支 |
| **安全边界** | owner token 保护私有会话；分享 replay 为只读；输入/输出带安全与版权检查 |
| **可选图片模块** | 场景图为附属功能，默认关闭；开启后才会创建 `asset_jobs` 并走 Redis/BullMQ/worker |
| **导出与分享** | 支持 JSON / Markdown 导出，支持只读分享页与公开 replay 读取 |
| **可观测性** | 提供 `/api/health`、`/api/stats`、成本统计、LLM/asset 日志结构 |
| **工程化交付基础** | 含 Docker、CI、Vitest、Playwright、DB smoke、LLM smoke 与项目整改路线文档 |

---

## 界面预览

### 开局页

- 风格模板、语言分级、视觉风格输入和“场景图”可选开关集中在同一屏内。
- 故事长度可选择短篇、中篇、长篇；默认短篇，适合快速体验。
- 默认路径直接服务文字剧情主流程，不要求先接通图片基础设施。

### 剧情推进页

- 正文、NPC 对话、状态变化、内容提示、三项分支选择和历史选择时间线同时展示。
- 故事进度会展示当前阶段、当前步数、目标步数和收束提示。
- 设计目标是让用户把注意力放在“如何推进故事”上，而不是工具面板本身。

---

## 技术架构

```text
Client (StartScreen / StoryPanel / StatusPanel / optional VisualPanel)
  -> Next.js Route Handlers
  -> Narrative generation + StoryState update + StoryArc phase control
  -> PostgreSQL persistence
  -> Optional asset queue (Redis / BullMQ / worker / object storage)
  -> Replay / export / health / stats
```

---

## 整体执行流程

```mermaid
flowchart TB
    A[用户输入开局灵感] --> B[输入安全检查]
    B --> C[LLM 生成首幕 scene]
    C --> D[初始化 StoryState 与目标步数]
    D --> E[保存 session / scene / choices]
    E --> F[返回首幕剧情与三个分支选择]
    F --> G[玩家选择]
    G --> H[读取 StoryState + 上一幕摘要]
    H --> I[计算故事阶段和剩余步数]
    I --> J[LLM 生成下一幕]
    J --> K[更新状态、历史和结局准备度]
    K --> L{是否达到结局条件}
    L -->|否| F
    L -->|是| M[标记 ended 并显示结局操作]
```

---

## 数据流与状态链路

```mermaid
flowchart LR
    P[prompt] --> S[safety rewrite]
    S --> N[narrative-service]
    N --> O[scene output]
    O --> Q[choices persisted]
    Q --> T[StoryState applyChoiceEffects]
    T --> A[story-arc-service]
    A --> M[memorySummary / knownFacts / unresolvedThreads / resolvedThreads]
    M --> N
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16、React 19、Tailwind CSS 4、Zustand |
| API | Next.js Route Handlers |
| 模型约束 | Zod |
| LLM | OpenAI-compatible API，当前默认 DeepSeek |
| 数据库 | PostgreSQL |
| 队列 | Redis、BullMQ |
| 图片 | mock provider、BFL provider、可选 R2/S3 存储 |
| 测试 | Vitest、Playwright |
| 部署 | Docker、Docker Compose、GitHub Actions |

---

## 主流程说明

### 1. 开局生成

- 用户在 `StartScreen` 输入灵感、语言、年龄分级、可选视觉风格。
- 用户选择故事长度：短篇、中篇或长篇。
- 系统先做输入安全检查。
- `createInitialState()` 初始化 `targetTurns`、`currentPhase`、`endingReadiness` 等故事生命周期字段。
- `narrative-service` 生成首幕 scene。
- 服务端写入 `game_sessions`、`scenes`、`choices`。
- 默认不创建图片任务；如果启用场景图，才会写入 `asset_jobs`。

### 2. 分支推进

- 用户选择一个 choice。
- 服务端读取当前 `StoryState`、上一幕 `memorySummary` 和所选项。
- `applyChoiceEffects()` 更新变量、flags、inventory、relations、endingPotential。
- `story-arc-service` 根据 `turn / targetTurns` 计算当前阶段，并决定是否进入收束或结局。
- 再次调用 LLM 生成下一幕。
- 新幕会写入 DB，并作为新的当前 scene。

### 3. 故事结束

- 故事不会无限续写。
- 短篇目标 7-12 步，中篇目标 20-40 步，长篇目标 50-100 步。
- 阶段按 `setup`、`development`、`crisis`、`resolution`、`ending` 推进。
- 接近结局时 prompt 会要求回收旧伏笔、减少新 NPC 和新主线。
- 达到 `targetTurns`、`endingReadiness` 或结局条件后，session 会进入 `ended`。
- 前端在已完结状态下隐藏普通选择，并提供导出、分享、新故事入口。

### 4. 恢复与重试

- 客户端持久化 `sessionId` 和 `ownerToken`。
- 恢复会话时读取完整 scene，而不是只读摘要。
- 失败后可依据 `lastAction` 做重试。

### 5. 场景图附属链路

- 默认关闭。
- 只有开局勾选或环境变量开启时才创建图片任务。
- 开启后通过 `asset-queue`、`asset-worker`、`object-storage` 处理。
- 图片失败不阻塞剧情主流程。

---

## 快速开始

### 环境要求

- Node.js 20+
- PostgreSQL 16+
- Redis 7+：仅当你要启用场景图队列时需要
- OpenAI-compatible LLM key

### 安装

```bash
git clone https://github.com/Caser-86/storyforge-interactive-narrative.git
cd storyforge-interactive-narrative
npm install
```

### 配置环境变量

```bash
cp .env.example .env.local
```

最小文字主流程配置：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/narrative_game
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-chat
TOKEN_SALT=replace-with-a-long-random-secret
ENABLE_IMAGE_GENERATION=false
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 初始化数据库

```bash
npm run db:init
```

### 启动开发服务器

```bash
npm run dev
```

访问：

- App: `http://localhost:3000`

### 可选：启动图片 worker

只有在启用场景图时才需要：

```bash
npm run worker
```

---

## 适用场景

- 互动小说原型验证
- 独立游戏叙事演示
- 分支剧情设计实验
- AI 剧情工具链 PoC
- 带状态变量的对话冒险体验

---

## Docker 启动

默认建议先用“无图文字主流程”模式验证。

```bash
docker compose build
docker compose up -d
docker compose logs -f app worker
```

健康检查：

```bash
curl http://localhost:3000/api/health
```

服务说明：

| 服务 | 说明 | 端口 |
|------|------|------|
| `app` | Next.js 应用 | `3000` |
| `worker` | 图片异步 worker | 无公开端口 |
| `db` | PostgreSQL 16 | `5432` |
| `redis` | Redis 7 | `6379` |

---

## 配置说明

### 核心模式

- `文字主流程`：默认模式，`ENABLE_IMAGE_GENERATION=false`
- `可选图片增强`：开启 `ENABLE_IMAGE_GENERATION=true` 或开局勾选场景图

### 关键变量

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 |
| `REDIS_URL` | Redis/BullMQ 连接串 |
| `DISABLE_REDIS` | 本地禁用 Redis 队列 |
| `OPENAI_API_KEY` | LLM API key |
| `OPENAI_BASE_URL` | OpenAI-compatible endpoint |
| `OPENAI_MODEL` | LLM 模型 |
| `IMAGE_PROVIDER` | `mock` / `bfl` |
| `ENABLE_IMAGE_GENERATION` | 是否默认启用场景图 |
| `OPENAI_TIMEOUT_MS` | LLM 请求超时控制 |
| `BFL_API_KEY` | BFL key |
| `TOKEN_SALT` | owner token / stream token 签名盐 |
| `ADMIN_TOKEN` | 生产环境 `/api/stats` 鉴权 |
| `DAILY_TOKEN_LIMIT` | 每日 LLM token 上限 |
| `DAILY_ASSET_LIMIT` | 每日图片生成上限 |
| `NEXT_PUBLIC_APP_URL` | 分享链接公开域名 |
| `R2_*` / `S3_*` | 对象存储配置 |

### 当前默认策略

- 文字剧情推进优先。
- 故事长度默认短篇，避免首次体验过长。
- 阶段推进和结局收束由 `story-arc-service` 控制。
- 场景图默认关闭。
- 图片失败不阻塞叙事。
- 生产环境 `TOKEN_SALT` 不能使用占位值。

---

## 脚本

| 脚本 | 用途 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 生产启动 |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | Vitest 全量测试 |
| `npm run test:e2e` | Playwright E2E |
| `npm run db:init` | 初始化数据库并执行 migrations |
| `npm run db:smoke` | PostgreSQL schema 冒烟检查 |
| `npm run llm:smoke` | LLM provider 冒烟检查 |
| `npm run worker` | 启动图片 worker |

---

## API 概览

| 接口 | 用途 |
|------|------|
| `POST /api/games` | 创建新游戏并生成首幕 |
| `GET /api/games/[sessionId]` | 恢复私有会话 |
| `POST /api/games/[sessionId]/choices` | 选择分支并推进剧情 |
| `GET /api/games/[sessionId]/events` | 图片状态 SSE |
| `POST /api/games/[sessionId]/events-token` | SSE 短期 stream token |
| `GET /api/games/[sessionId]/export` | 导出 JSON / Markdown |
| `POST /api/games/[sessionId]/share` | 生成只读分享链接 |
| `GET /api/assets/[assetJobId]` | 读取图片任务状态 |
| `POST /api/assets/[assetJobId]` | 重绘图片 |
| `GET /api/share/[token]` | 读取只读 replay |
| `GET /api/share/[token]/assets/[sceneId]` | 读取公开分享资源 |
| `GET /api/health` | 健康检查 |
| `GET /api/stats` | 运行统计 |
| `GET /api/stats/cost` | 成本统计 |
| `GET /api/templates` | 开局模板 |
| `GET/PATCH/DELETE /api/user` | 指纹用户与数据管理 |

---

## 数据表

| 表 | 说明 |
|------|------|
| `_migrations` | migration 版本记录 |
| `users` | fingerprint 用户 |
| `game_sessions` | 会话、owner token、share token、状态快照 |
| `scenes` | 场景正文、NPC、choices、artPrompt、bgmCue、summary |
| `choices` | 每幕分支选项与已选时间 |
| `asset_jobs` | 图片任务 |
| `asset_versions` | 图片重绘历史 |
| `llm_logs` | LLM 调用日志 |
| `asset_logs` | 图片 provider 调用日志 |

---

## 项目文档

- [PROJECT_DELIVERY_ROADMAP.md](./PROJECT_DELIVERY_ROADMAP.md)：交付路线图
- [PROJECT_NEXT_TASK_ROADMAP.md](./PROJECT_NEXT_TASK_ROADMAP.md)：后续任务总路线图，包含故事生命周期、结局机制、Alpha/Beta/正式交付任务
- [PROJECT_REMEDIATION_ACTION_PLAN.md](./PROJECT_REMEDIATION_ACTION_PLAN.md)：当前整改执行清单
- [PROJECT_COMPLETION_REVIEW.md](./PROJECT_COMPLETION_REVIEW.md)：阶段性审查记录
- [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md)：较早阶段路线图
- [IMPROVEMENTS_CHECKLIST.md](./IMPROVEMENTS_CHECKLIST.md)：历史改进清单

当前执行优先级：先按 `PROJECT_NEXT_TASK_ROADMAP.md` 验证故事生命周期和结局收束，再继续完善图片附属模块、Docker/DB/Redis 冒烟和正式交付能力。

---

## 当前状态

- 文字剧情推进主流程可用。
- 故事长度选择、阶段推进、目标步数和结局状态已接入。
- 旧版固定 12 步硬结束已替换为动态 `targetTurns` / `endingReadiness` 机制。
- 会话恢复、分享、导出、权限校验已接通。
- 场景图默认关闭，已降级为可选增强模块。
- 全量本地质量门曾验证通过；当前故事生命周期改动仍需在提交前重新复跑：
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`

仍需继续完成：

- 故事生命周期全量单测和 E2E 继续补强
- 中篇 20-40 步、长篇 50-100 步真实回归验证
- 结局自然度、伏笔回收和导出结局摘要继续打磨
- 图片开启模式下的 Redis / worker / R2/S3 全链路验证

---

## License

当前仓库尚未单独放置 License 文件；发布前建议补充明确许可证。
