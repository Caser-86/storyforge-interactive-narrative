# 改进清单（按优先级）

> **⚠️ 历史任务清单，多数已完成。当前执行请以 `PROJECT_ROADMAP.md` 为准。**

日期：2026-05-16  
项目：`narrative-game`（Next.js 16 + React 19 + PostgreSQL + Redis/BullMQ 思路）

说明：
- 这是"需要改进/要做"的任务清单，按优先级从高到低排列。
- 采用 checkbox，便于逐项推进。

---

## P0（阻塞：CI/Lint/构建/关键正确性）

- [x] 修复 `npm run lint` 当前 1 个 error：`src/app/page.tsx` effect 内同步 `setSelectedChoice(null)`（`react-hooks/set-state-in-effect`）。
- [x] 修复 `src/app/page.tsx` `useCallback` 缺依赖：`handleRegenerateImage` 需要包含 `imageJobId`（`react-hooks/exhaustive-deps`）。
- [x] 清理未使用变量/导入，消除 lint warnings。
- [x] 迁移 Next 16 约定：`src/middleware.ts`（deprecated）→ `src/proxy.ts`。
- [x] 修复 choices 主键冲突风险：改为 `choice_${sceneSuffix}_${suffix}`。
- [x] 修复 choices 归属校验：查询 choice 时校验 `session_id`/`scene_id`。
- [x] 修复 `POST /api/games/[sessionId]/choices` 中 `language` / `rating` 写死。
- [x] 修复 Docker 构建依赖策略。
- [x] 替换模板 README。
- [x] 校对 `.env.example`。
- [x] 修复分支/CI 配置一致性。

---

## P1（核心架构：资产队列、API 正确性、可靠性）

- [x] 接通 BullMQ：创建 `asset_jobs` 后调用 `enqueueAssetJob()`。
- [x] API route 去"直接生成图片"，改为只读 job 状态。
- [x] SSE 只负责推送状态，不在 SSE handler 内跑生成任务。
- [x] 处理 SSE 断开：监听 `request.signal`，断开后清理 interval。
- [x] 资产状态竞争治理：DB 乐观锁 `UPDATE ... WHERE status='queued' RETURNING ...`。
- [x] 实现 promptHash 缓存复用：同 hash 且已有 completed URL 时直接复用。
- [x] 重生成图片：支持"新版本记录"（保留旧 URL/旧 hash），便于回滚和审计。
- [x] provider 失败策略：失败重试（2次指数退避）+ 降级到 mock。
- [x] `POST /api/games` / `choices` 返回值增加可观测字段（`usedFallback`、错误原因摘要）。
- [x] DB 初始化迁到正式 migrations：`_migrations` 表 + 版本化迁移。
- [x] DB pool 配置补齐：max=20、idleTimeout=30s、connectTimeout=5s、error handler。
- [x] 统一 API 错误格式：`apiError()` + `ErrorCodes` + traceId。
- [x] 修复重复提交：同一 choiceId 已选则返回 409 DUPLICATE。
- [x] `game_sessions` 增加/实现：结束（PATCH status=ended）、归档（archived）、删除（DELETE）。

---

## P1（安全：输入/输出/资产合规）

- [x] 输入安全从 regex 升级：接入更强 moderation（或更完整规则），并记录 `warnings`。
- [x] 增加 LLM 输出二次安全检查：scene.body、npc.dialogue、artPrompt.prompt。
- [x] 将 `checkArtPromptSafety()` 接入实际流程（narrative-service 输出后处理）。
- [x] 版权/仿冒策略强化：多命中替换、可配置词库、记录替换结果。
- [x] `/api/stats` 增加鉴权：生产环境需 `Authorization: Bearer $ADMIN_TOKEN`。
- [x] rate limit 从内存改到 Redis（多实例一致、可持久化）。

---

## P1（测试：把"可跑"变成"可回归"）

- [x] 引入测试框架 Vitest，`package.json` 的 `test` 已替换。
- [x] 单测：`src/lib/schemas.ts`（合法/非法 NarrativeOutput 校验）。
- [x] 单测：`src/lib/story-state-service.ts`（applyChoiceEffects、statePatch 合并、turn 增长）。
- [x] 单测：`src/lib/asset-service.ts`（promptHash 稳定、忽略 seedHint）。
- [x] 单测：`src/lib/safety-service.ts`（unsafe/copyright/artPrompt 风险）。
- [x] 集成测：`POST /api/games`（创建 session、写 DB、返回结构）。
- [x] 集成测：`POST /api/games/[sessionId]/choices`（推进 turn、写 scenes/choices、幂等/冲突）。
- [x] 集成测：asset job 状态转换（queued→generating→completed/failed）。
- [x] 集成测：SSE（completed/failed、client abort、超时关闭）。
- [x] CI 增加 `npm test` 并要求全绿（typecheck + lint + test + build）。

---

## P2（前端：结构、错误态、移动端、可用性）

- [x] 拆分 `src/app/page.tsx`：StartScreen/GameScreen/StoryPanel/VisualPanel/StatusPanel/NpcCard/ChoiceList/BgmPanel。
- [x] 补齐 error UI：`status === "error"` 提供重试、返回首页、错误详情展示。
- [x] 图片失败 fallback：展示更明确的"继续游玩不受影响"，并支持重新排队/换 provider。
- [x] 移动端补"线索/历史"tab（方案文档提到）。
- [x] placeholder SVG 文本做 XML escape，避免 SVG 注入。
- [x] 图片展示：评估 `next/image` 接入（或明确保留 `<img>` 的原因与安全策略）。
- [x] 交互一致性：选择按钮锁定、重复点击提示、加载中 skeleton、耗时指标显示规范化。

---

## P2（BGM：从提示到可用）

- [x] 接入 `src/lib/bgm-service.ts` 的 `matchBgmLoop()`：前端展示匹配结果。
- [x] 补齐 `/public/audio/*` 资源或移除库里不存在的 URL（已标记 `available: false`，播放器优雅降级）。
- [x] 增加播放器控件：播放/暂停/音量/循环时长提示。
- [x] 无匹配时：展示 `bgmCue.musicPrompt` 作为可复制提示。

---

## P2（叙事质量：一致性、可玩性、自动评估）

- [x] 将 `src/lib/test-prompts.ts` 变成自动回归：批量跑固定 prompts，保存结构化输出快照。
- [x] 增加"选项相似度"检测：label/preview 过近则触发 retry。
- [x] 增加"风险覆盖"检测：必须同时包含 low/medium/high。
- [x] 增加"引用已知事实/伏笔"检测（最少 1 个）。
- [x] 控制 NPC 增长：数量上限与复用策略。
- [x] 强化 styleBible/characterCard：让 artPrompt 和文本都引用稳定设定（自动从 genre preset 提取 styleBible，从 narrative body 提取主角名，从 artPrompt.styleLock 回填）。
- [x] 章节推进策略：每 3 幕推进主线；turn>=7 考虑 endingPotential。

---

## P2（可观测：从 console 到可运营）

- [x] `src/lib/observability.ts` 日志不要只存内存数组；改为持久化（DB/文件/第三方）。
- [x] 记录：latency、token、retry、fallback、provider、错误原因，支持按 session/scene/job 查询。
- [x] 增加 provider 熔断/限流，避免外部服务波动拖垮系统。
- [x] 成本控制：每日额度、按 IP/用户限制、缓存命中率统计。

---

## P3（文档与部署）

- [x] README：补 "本地启动 app + worker + db + redis" 一条龙命令。
- [x] `.env.example`：每个变量写清用途与默认值。
- [x] 写 API 文档（routes、请求/响应、错误码、SSE event types）。
- [x] 写数据表说明（主键策略、外键、索引、迁移方式）。
- [x] `.dockerignore` 调整：排除测试文件、IDE 配置、coverage，保留必要文档。
- [x] 生产部署 checklist（secrets、DB migrations、健康检查、日志、回滚）。

---

## P3（产品功能扩展）

- [x] 分享链接（session 只读回放）：`/api/games/[sessionId]/share` + `/share/[token]` + ReplayScreen 组件。
- [x] 导出：Markdown、JSON（后续 Twine/Ink/Ren'Py）。
- [x] 用户系统（可选）：登录保存、删除、私密故事（fingerprint 匿名用户 + `/api/user` CRUD）。
- [x] 风格模板：题材 preset、视觉风格 preset、难度/篇幅选项。
- [x] 图片高清/重绘：付费档位或高级设置（quality=high 切换 BFL 模型 + 分辨率缩放 + 前端"高清重绘"按钮）。
