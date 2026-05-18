# 可交付完工路线图

生成日期：2026-05-18  
项目路径：`D:\Files\基于LLM的全自动独立游戏互动游戏叙事生成器\narrative-game`  
项目名称：`StoryForge`  
GitHub 仓库：`https://github.com/Caser-86/storyforge-interactive-narrative`  
当前产品方向：先做稳定的对话剧情推进和分支选择生成；场景图为附属功能，默认关闭，后续可按局开启。
目标口径：不是“本地能跑”，而是“可给真实用户灰度使用，可诊断、可恢复、可部署、可回滚”。

---

## 1. 当前结论

项目已经有清晰的可玩闭环：输入灵感、生成首幕、选择推进、异步生成图片、保存会话、分享、导出、用户列表、基础观测、Docker 雏形、测试集。

按可交付标准判断：

- [x] 产品原型：已具备。
- [x] 本地开发演示：基本可用。
- [ ] 内部 Alpha：接近，但还需要完整手测、真实 DB/Redis 冒烟、SSE 权限补齐。
- [ ] 外部 Beta：还差对象存储、真实 provider、E2E、部署脚本、监控告警。
- [ ] 正式交付：还差隐私合规、成本治理、备份回滚、质量评估闭环。

本次已修复的高优先级问题：

- [x] `src/lib/api-contracts.ts` 与真实 `schemas.ts` 对齐。
- [x] `ChoiceResponseSchema` 从错误复用创建接口改为真实的 `previousChoiceId + stateDiff`。
- [x] `CreateGameResponseSchema` 补上真实返回的 `ownerToken`。
- [x] `ShareReplayResponseSchema` 移除不再返回的 `session.id`。
- [x] `GET /api/games/[sessionId]` 返回完整 scene，不再只返回摘要。
- [x] `src/lib/store.ts` 恢复存档时使用完整正文、NPC、选项、artPrompt、bgmCue、chapterGoal。
- [x] `pollAsset()` 带 `x-owner-token`。
- [x] `GET /api/assets/[assetJobId]` 增加 owner token 校验。
- [x] 导出接口按 `choice.id` 或 `modelChoiceId` 找回 preview，避免导出丢选项预览。
- [x] 分享 URL 环境变量兼容 `NEXT_PUBLIC_BASE_URL` 和 `NEXT_PUBLIC_APP_URL`。
- [x] 生产环境默认 `TOKEN_SALT` 会报错，不再静默使用弱盐。
- [x] `/api/health` 将生产 `TOKEN_SALT` 配置错误纳入整体 error。

本次已执行验证：

- [x] `npm run typecheck` 通过。
- [x] `npm run lint` 通过。
- [x] `npm test` 通过：16 个测试文件，121 个测试。
- [x] `npm run build` 通过。

交付前仍必须执行：

- [ ] 真实 PostgreSQL 冒烟。
- [ ] 真实 Redis/BullMQ 冒烟。
- [ ] 浏览器 E2E。
- [ ] Docker compose 冒烟。
- [ ] 真实 LLM provider 冒烟。
- [ ] 真实图片 provider 冒烟。
- [ ] 对象存储冒烟。

---

## 2. 可交付等级定义

### 2.1 内部 Alpha

目标：开发者、项目成员、小范围内部体验。

必须满足：

- [ ] `npm run typecheck`、`npm run lint`、`npm test`、`npm run build` 全绿。
- [ ] 本地 `.env.local` 配好后能创建游戏。
- [ ] 能连续选择 5 轮，状态、历史、图片任务不串场。
- [ ] 图片任务失败时文字玩法仍可继续。
- [ ] 刷新页面后能恢复当前 scene 并继续选择。
- [ ] 导出 JSON/Markdown 可用。
- [ ] 分享只读页面可用，且不泄漏 owner token。
- [ ] 常见错误有 `code/message/traceId`。
- [ ] README 能让新开发者 30 分钟内启动项目。

### 2.2 外部 Beta

目标：给真实用户小范围灰度。

必须满足：

- [ ] Docker compose 一键启动 app、worker、PostgreSQL、Redis。
- [ ] PostgreSQL migrations 可重复执行。
- [ ] Redis/BullMQ 能处理 queued、generating、completed、failed、stale job。
- [ ] 所有私有读写接口都有 owner token 校验或等价权限机制。
- [ ] SSE 不泄漏私有 session 的 asset 状态。
- [ ] 对象存储使用标准 S3/R2 客户端或可靠签名逻辑。
- [ ] 图片 URL 不依赖 provider 临时 URL。
- [ ] `/api/health` 能反映 DB、Redis、queue、worker、LLM、image provider、budget、secret 配置。
- [ ] `/api/stats` 生产环境需要 `Authorization: Bearer $ADMIN_TOKEN`。
- [ ] Playwright E2E 覆盖首幕、选择、刷新恢复、导出、分享、图片失败降级。
- [ ] 有可读日志和 traceId，能定位一次失败请求。

### 2.3 正式交付

目标：公开上线或交付客户部署。

必须满足：

- [ ] 隐私政策、数据删除说明、第三方 API 使用说明完整。
- [ ] owner token、share token、用户识别策略有明确安全说明。
- [ ] `TOKEN_SALT`、`ADMIN_TOKEN`、provider keys 全部生产必填。
- [ ] 成本预算持久化，不只存在进程内存。
- [ ] Prompt 回归集有人工评分和阈值。
- [ ] P50/P95 首幕生成时间、选择生成时间、图片生成时间有监控。
- [ ] Docker 镜像可版本化，部署可回滚。
- [ ] DB 备份、恢复、迁移回滚方案明确。
- [ ] secrets 不进镜像、不进日志、不进导出文件。

---

## 3. P0：进入内部 Alpha 前必须完成

P0 做完前，不建议继续加新功能。

### P0-1 全量质量门固定为必跑

现状：

- 本次已跑过 typecheck、lint、相关测试。
- 还需要在最终收尾时跑全量测试和生产构建。

措施：

- [ ] 每次提交前执行：
  - [ ] `npm run typecheck`
  - [ ] `npm run lint`
  - [ ] `npm test`
  - [ ] `npm run build`
- [ ] 在 `.github/workflows/ci.yml` 中固定这些命令。
- [ ] CI 对 PR 必须阻塞失败。
- [ ] CI 输出缓存，但不能跳过测试。

验收：

- [ ] 本地全绿。
- [ ] CI 全绿。
- [ ] README 记录同一组命令。

涉及文件：

- `.github/workflows/ci.yml`
- `package.json`
- `README.md`

### P0-2 SSE 权限闭环

现状：

- `src/app/page.tsx` 使用 `EventSource('/api/games/${sessionId}/events')`。
- EventSource 不能自定义 `x-owner-token` 请求头。
- `GET /api/games/[sessionId]/events` 当前可按 sessionId 推送 asset 状态。

风险：

- assetJobId/status/url 对私有 session 可能被探测。
- 其他接口已经逐步 owner-token 化，SSE 是剩余缺口。

建议方案：

- [ ] 增加短期 stream token：
  - [ ] `POST /api/games/[sessionId]/events-token`
  - [ ] 请求头使用 `x-owner-token`。
  - [ ] 返回 60-120 秒有效的签名 token。
  - [ ] `EventSource('/api/games/${sessionId}/events?streamToken=...')`。
- [ ] stream token 只用于 SSE，不等同 owner token。
- [ ] token 内容包含 `sessionId`、`exp`、随机 nonce。
- [ ] token 使用 `TOKEN_SALT` 或独立 `STREAM_TOKEN_SECRET` HMAC 签名。
- [ ] SSE route 验证 stream token。
- [ ] 分享页如果未来要看公开 asset，需要单独 public asset route，不复用私有 SSE。

测试：

- [ ] 无 token 访问私有 SSE 返回 403。
- [ ] 错 token 返回 403。
- [ ] 过期 token 返回 403。
- [ ] 正确 token 能收到 completed/failed 事件。
- [ ] token 只允许对应 session。

涉及文件：

- `src/app/api/games/[sessionId]/events/route.ts`
- `src/app/page.tsx`
- `src/lib/crypto.ts`
- `src/__tests__/permission-queue.test.ts`

### P0-3 恢复存档浏览器级验收

现状：

- 代码层已修复 `GET /api/games/[sessionId]` 和 `loadSession()`。
- 仍缺浏览器级验证。

手测步骤：

- [ ] 启动开发环境。
- [ ] 创建一局新游戏。
- [ ] 选择 2-3 次。
- [ ] 刷新页面。
- [ ] 从“之前的冒险”加载同一局。
- [ ] 确认当前场景正文完整。
- [ ] 确认 NPC 不为空。
- [ ] 确认三个选项仍可点击。
- [ ] 点击选项后能继续生成下一幕。
- [ ] 确认图片任务没有被旧 scene 覆盖。

自动化：

- [ ] 增加 Playwright 用例。
- [ ] mock LLM 和 image provider，保证稳定。
- [ ] 验证刷新后的 `choices.length === 3`。
- [ ] 验证 `scene.id` 是数据库 scene id，不是 turn 字符串。

涉及文件：

- `src/app/api/games/[sessionId]/route.ts`
- `src/lib/store.ts`
- `src/app/components/StartScreen.tsx`
- `tests/e2e/session-restore.spec.ts`

### P0-4 对象存储可交付实现

现状：

- `src/lib/object-storage.ts` 使用手写 `Authorization: AWS key:secret`。
- 这不是标准 S3/R2 SigV4。

风险：

- R2/S3 真实环境大概率上传失败。
- 即使 provider 返回图片，最终 URL 可能是临时 URL，不适合交付。

措施：

- [ ] 引入正式客户端：
  - [ ] `@aws-sdk/client-s3`
  - [ ] 或使用 Cloudflare R2 官方 S3 兼容方式。
- [ ] `uploadToStorage()` 改为 `PutObjectCommand`。
- [ ] 支持 `R2_ENDPOINT`、`R2_BUCKET`、`R2_REGION`、`R2_PUBLIC_URL`。
- [ ] 保留 `S3_*` 兼容变量。
- [ ] 上传失败时：
  - [ ] 开发环境可回退 provider URL。
  - [ ] 生产环境 health 标记 degraded 或 error。
  - [ ] asset log 记录 storage failure。
- [ ] 图片 key 保持稳定格式：`assets/YYYY-MM-DD/sessionId/sceneId/vN.png`。
- [ ] asset version 保存 storage URL、provider、prompt hash。

测试：

- [ ] 单元测试 mock S3 client 成功。
- [ ] 单元测试 mock S3 client 失败。
- [ ] 集成 smoke 上传一张小 PNG。
- [ ] 验证 public URL 可访问。

涉及文件：

- `src/lib/object-storage.ts`
- `src/scripts/asset-worker.ts`
- `src/lib/asset-service.ts`
- `.env.example`
- `README.md`

### P0-5 Docker compose 冒烟

现状：

- 有 `Dockerfile` 和 `docker-compose.yml`。
- 还需要实际 smoke。
- 生产 `TOKEN_SALT` 现在必须是随机值，默认占位值会让 health error。

措施：

- [ ] 准备 `.env.docker.local` 或文档说明。
- [ ] 设置：
  - [ ] `OPENAI_API_KEY`
  - [ ] `TOKEN_SALT`
  - [ ] `ADMIN_TOKEN`
  - [ ] `IMAGE_PROVIDER=mock` 或真实 provider
- [ ] 执行：
  - [ ] `docker compose build`
  - [ ] `docker compose up -d`
  - [ ] `docker compose logs -f app worker`
  - [ ] `curl http://localhost:3000/api/health`
- [ ] 验证 app health 为 `ok` 或 mock 模式下合理 degraded。
- [ ] 验证 worker 能消费队列。
- [ ] 验证停止再启动数据仍在 PostgreSQL volume。

验收：

- [ ] README Docker 步骤可复现。
- [ ] 新机器按步骤可启动。
- [ ] 没有 secrets 写入镜像。

### P0-6 真实 PostgreSQL migration smoke

现状：

- `src/lib/db.ts` 有 8 版 migration。
- 单元测试检查 schema 片段，但不等于真实数据库可迁移。

措施：

- [ ] 新建空库执行 `npm run db:init`。
- [ ] 再执行一次 `npm run db:init`，确认幂等。
- [ ] 检查表：
  - [ ] `_migrations`
  - [ ] `users`
  - [ ] `game_sessions`
  - [ ] `scenes`
  - [ ] `choices`
  - [ ] `asset_jobs`
  - [ ] `asset_versions`
  - [ ] `llm_logs`
  - [ ] `asset_logs`
- [ ] 检查外键 `ON DELETE CASCADE`。
- [ ] 检查 `owner_token`、`share_token`、`model_choice_id`、`preview` 列存在。
- [ ] 删除用户时确认关联 session/scene/asset 清理。

自动化：

- [ ] 增加集成测试脚本 `npm run test:integration:db`。
- [ ] CI 可用 service container 跑 PostgreSQL。

### P0-7 API contract 持续防漂移

现状：

- 本次已修正契约与测试。
- 后续仍可能因接口演进再次漂移。

措施：

- [ ] 所有对外接口在 `src/lib/api-contracts.ts` 有 schema。
- [ ] route 返回前尽量用 schema parse 或测试覆盖。
- [ ] 前端 fetch 后可在开发环境 safeParse，发现漂移直接报错。
- [ ] 契约测试加入负例：
  - [x] `seedHint` 字符串要被拒绝。
  - [x] 旧 `tempo/prompt` bgm 结构要被拒绝。
  - [ ] choice 接口不应要求 `ownerToken`。
  - [ ] create 接口必须包含 `ownerToken`。
  - [ ] share replay 不应返回 `session.id`。

涉及文件：

- `src/lib/api-contracts.ts`
- `src/__tests__/api-contracts.test.ts`

### P0-8 私有资产访问策略定稿

现状：

- 本次已让 `GET /api/assets/[assetJobId]` 校验 owner token。
- 仍需明确 public share 是否显示图片。

决策项：

- [ ] 分享页是否展示资产图？
- [ ] 如果展示，是否需要 public asset proxy？
- [ ] public asset 是否只能读 completed URL，不能看 versions/error/prompt hash？
- [ ] asset URL 是否应该是不可猜 CDN URL？

建议：

- 私有接口：`/api/assets/[assetJobId]`，必须 owner token。
- 公开接口：`/api/share/[token]/assets/[sceneId]`，只返回分享可见的 completed URL。
- 导出文件：不包含 owner token、不包含 prompt hash、不包含 raw model JSON。

---

## 4. P1：进入外部 Beta 前完成

### P1-1 Playwright E2E 主流程

覆盖场景：

- [ ] 首页能加载。
- [ ] 模板选择能填充 prompt。
- [ ] 创建游戏成功。
- [ ] 首幕显示 title、body、NPC、三个 choices。
- [ ] 选择后进入 loading，再显示新 scene。
- [ ] 快速双击选择不会重复提交。
- [ ] 图片 queued/generating/completed/failed 状态能显示。
- [ ] 刷新恢复 session。
- [ ] 导出 JSON。
- [ ] 导出 Markdown。
- [ ] 分享链接打开只读 replay。
- [ ] 错误页显示 traceId。

要求：

- [ ] 不依赖真实 LLM。
- [ ] 不依赖真实图片 provider。
- [ ] 测试数据稳定。
- [ ] CI 可跑 headless。

### P1-2 Redis/BullMQ 生产化

措施：

- [ ] Worker 启动时输出 queue name、concurrency、provider。
- [ ] Worker shutdown 捕获 SIGTERM，等待当前 job 完成或安全退出。
- [ ] Job 加 timeout、attempts、backoff。
- [ ] Stale generating job 定期改 failed。
- [ ] Queue health 显示 waiting、active、completed、failed。
- [ ] Redis 断开时 app 不崩溃，health 明确 degraded/error。
- [ ] `IMAGE_PROVIDER=mock` 时允许 Redis disabled 作为开发降级。
- [ ] `IMAGE_PROVIDER=bfl` 时 Redis 缺失必须 error。

测试：

- [ ] Redis 正常：queued -> completed。
- [ ] Redis 关闭：创建游戏不崩溃，asset failed 或 degraded。
- [ ] Worker 不启动：asset job 标记 failed 并有错误文案。
- [ ] 重启 worker：能继续消费 pending job。

### P1-3 真实 LLM provider 验证

措施：

- [ ] 明确当前默认是 `OPENAI_BASE_URL=https://api.deepseek.com` 和 `OPENAI_MODEL=deepseek-chat`。
- [ ] README 写清 OpenAI-compatible provider。
- [ ] 增加 provider smoke prompt。
- [ ] 记录 latency、input tokens、output tokens。
- [ ] LLM 返回 JSON 不合法时 fallback 可用。
- [ ] Fallback 结果必须通过 schema。

验收：

- [ ] 中文 prompt 生成稳定。
- [ ] 英文 prompt 生成稳定。
- [ ] 日文 prompt 生成稳定。
- [ ] R 级限制能生效。
- [ ] 版权替换能生效。

### P1-4 真实图片 provider 验证

措施：

- [ ] `IMAGE_PROVIDER=mock` 开发可用。
- [ ] `IMAGE_PROVIDER=bfl` 真实可用。
- [ ] BFL 失败有错误码和 trace。
- [ ] 图片生成超时可恢复。
- [ ] 相同 prompt hash 命中缓存。
- [ ] bypassCache 重绘生成新 seed。

验收：

- [ ] 首幕图片可生成。
- [ ] 选择后新 scene 图片不覆盖旧 scene。
- [ ] 重绘后版本历史存在。
- [ ] Provider URL 存入对象存储后改为 CDN URL。

### P1-5 内容质量回归集

建设：

- [ ] 建 30 条 prompt：
  - [ ] 赛博朋克侦探
  - [ ] 暗黑奇幻
  - [ ] 恐怖悬疑
  - [ ] 科幻探索
  - [ ] 蒸汽朋克
  - [ ] 末日废土
  - [ ] 宫廷权谋
  - [ ] 民俗怪谈
  - [ ] 轻喜剧
  - [ ] 儿童友好
- [ ] 每条跑 3 次。
- [ ] 记录 schema pass rate。
- [ ] 人工评分：
  - [ ] 可读性
  - [ ] 选择差异度
  - [ ] 风格一致性
  - [ ] 目标明确度
  - [ ] 安全合规
- [ ] 低分 prompt 回流 prompt 模板。

验收阈值建议：

- [ ] schema pass rate >= 98%。
- [ ] fallback rate <= 5%。
- [ ] 平均人工评分 >= 4/5。
- [ ] 三个选项相似度不过高。
- [ ] 高风险选项不等于强制坏结局。

### P1-6 前端体验打磨

必须项：

- [ ] Loading 状态显示当前动作：生成首幕、推进故事、生成图片。
- [ ] 图片失败时提供“重试生成”按钮。
- [ ] 选项提交后按钮禁用且有视觉反馈。
- [ ] 历史栏能显示已选 choice label。
- [ ] 移动端 story/visual/status 切换不丢状态。
- [ ] 长正文和长选项在移动端不溢出。
- [ ] 错误页支持重试、返回首页、复制 traceId。
- [ ] 恢复 session 时显示“正在恢复”而不是首屏空白。

建议项：

- [ ] 增加“结束故事”入口。
- [ ] 增加“复制分享链接”成功提示。
- [ ] 导出按钮显示格式选择。
- [ ] 状态面板解释关键变量变化。

### P1-7 观测和成本治理

措施：

- [ ] LLM 日志写入 `llm_logs`：
  - [ ] session_id
  - [ ] scene_id
  - [ ] model
  - [ ] latency_ms
  - [ ] input_tokens
  - [ ] output_tokens
  - [ ] success
  - [ ] error
- [ ] Asset 日志写入 `asset_logs`。
- [ ] Daily budget 持久化到 DB 或 Redis。
- [ ] 超预算后返回明确错误。
- [ ] `/api/stats` 只给 admin。
- [ ] `/api/health` 不泄漏 secrets。
- [ ] traceId 贯穿 route、log、前端错误页。

---

## 5. P2：正式交付前完成

### P2-1 安全与隐私

- [ ] 隐私政策页面。
- [ ] 数据删除说明。
- [ ] 第三方 API 使用说明。
- [ ] localStorage 保存 owner token 的风险说明。
- [ ] 分享链接的可见范围说明。
- [ ] R 级内容不可分享已实现，需 E2E 验证。
- [ ] share token 建议 hash 存储或至少增加过期策略。
- [ ] owner token 不出现在 URL。
- [ ] 日志不打印 owner token。
- [ ] 导出不包含 raw model JSON。

### P2-2 部署与回滚

- [ ] 镜像 tag 规则：`app:version-sha`。
- [ ] DB migration 前备份。
- [ ] migration 失败回滚方案。
- [ ] app/worker 分开扩缩容。
- [ ] worker 版本与 app 版本兼容策略。
- [ ] Redis 持久化策略。
- [ ] PostgreSQL 备份周期。
- [ ] CDN cache 策略。

### P2-3 性能目标

建议目标：

- [ ] 首幕文字 P50 <= 5 秒。
- [ ] 首幕文字 P95 <= 15 秒。
- [ ] 选择推进 P50 <= 5 秒。
- [ ] 选择推进 P95 <= 15 秒。
- [ ] mock 图片 P95 <= 1 秒。
- [ ] 真实图片生成根据 provider 单独设 SLA。
- [ ] 页面首屏 JS 不出现明显卡顿。

优化方向：

- [ ] Prompt 压缩。
- [ ] LLM timeout 和 retry 策略。
- [ ] 图片生成异步化已具备，继续优化 UI 降级。
- [ ] DB 查询索引确认。
- [ ] asset polling/SSE 合并策略。

---

## 6. 文件级任务清单

### `src/app/api/games/route.ts`

- [x] 创建 session 后返回 `ownerToken`。
- [x] asset enqueue 失败时标记 failed。
- [ ] 增加 create response schema 校验。
- [ ] LLM 日志完整落库。
- [ ] prompt 安全重写结果在 meta 中保持稳定。
- [ ] `options.visualStyle` 之外的选项明确 schema。

### `src/app/api/games/[sessionId]/choices/route.ts`

- [x] owner token 校验。
- [x] 防重复选择。
- [x] asset enqueue 失败时标记 failed。
- [ ] choice response schema 校验。
- [ ] LLM fallback latency 记录更准确。
- [ ] duplicate choice 并发测试加压。

### `src/app/api/games/[sessionId]/route.ts`

- [x] GET 返回完整 scene。
- [x] GET 返回当前 image asset。
- [x] owner token 校验。
- [ ] 增加 route 单测验证完整 scene shape。
- [ ] PATCH/DELETE 响应 schema 化。
- [ ] DELETE 后确认级联删除所有关联数据。

### `src/app/api/games/[sessionId]/events/route.ts`

- [ ] 增加 stream token 权限。
- [ ] 避免无权限用户按 sessionId 监听资产状态。
- [ ] 发送 generating 事件。
- [ ] 查询只返回当前 session 用户可见字段。
- [ ] 增加 SSE 单测。

### `src/app/api/assets/[assetJobId]/route.ts`

- [x] GET owner token 校验。
- [x] POST owner token 校验。
- [x] 重绘使用明文 token 验证 hash，不再用 token 直接比 hash。
- [ ] GET 公开/私有策略写入 README。
- [ ] POST quality 参数 schema 校验。
- [ ] versions 返回字段最小化。

### `src/app/api/games/[sessionId]/export/route.ts`

- [x] 查询真实 `*_json` 字段。
- [x] preview 按 `choice.id` 或 `modelChoiceId` 匹配。
- [x] owner token 校验。
- [ ] Markdown 导出样式再打磨。
- [ ] 导出中隐藏内部字段。
- [ ] 大故事导出分页或流式输出。

### `src/app/api/games/[sessionId]/share/route.ts`

- [x] owner token 校验。
- [x] R 级内容禁止分享。
- [x] 兼容 `NEXT_PUBLIC_BASE_URL` 和 `NEXT_PUBLIC_APP_URL`。
- [ ] share token hash 存储。
- [ ] share token 过期策略。
- [ ] 重复创建分享链接时是否复用旧 token，需定策略。

### `src/app/api/share/[token]/route.ts`

- [x] 只读 replay。
- [x] 不返回 `session.id`。
- [ ] token 不存在时从 redirect 改成明确 404 页面或 JSON 策略。
- [ ] 可选支持公开资产图。
- [ ] 不返回内部 state/raw JSON。

### `src/lib/store.ts`

- [x] 恢复完整 scene。
- [x] 使用 `PersistedChoice` 类型。
- [x] asset polling 带 owner token。
- [ ] 统一 API fetch helper，减少重复错误处理。
- [ ] polling timer 可取消，避免页面切换后残留。
- [ ] loadSession 失败时保留可恢复提示。

### `src/lib/api-contracts.ts`

- [x] 复用 `ArtPromptSchema`。
- [x] 复用 `BgmCueSchema`。
- [x] 复用 `NpcSchema`。
- [x] 复用 `PersistedChoiceSchema`。
- [x] create/choice/share/export 分离真实 schema。
- [ ] 开发环境前端 fetch 结果 safeParse。
- [ ] route 层返回前可选 parse。

### `src/lib/object-storage.ts`

- [ ] 替换手写 Authorization。
- [ ] 引入标准 S3/R2 上传。
- [ ] 增加测试。
- [ ] health 纳入对象存储状态。

### `src/lib/crypto.ts`

- [x] 生产禁止默认 `TOKEN_SALT`。
- [ ] 使用 timing-safe compare。
- [ ] 增加 stream token HMAC 工具。
- [ ] 增加 token rotation 说明。

### `src/app/api/health/route.ts`

- [x] 生产 `TOKEN_SALT` 错误纳入 health error。
- [ ] 检查对象存储配置。
- [ ] 检查 worker heartbeat。
- [ ] 检查 provider key 是否配置。
- [ ] 不返回敏感值。

### `README.md`

- [x] 重新整理项目说明。
- [x] 同步真实 API 响应字段。
- [x] 增加可交付路线图入口。
- [ ] Docker smoke 后补充真实输出。
- [ ] 对象存储实现完成后补充 R2/S3 步骤。

---

## 7. 推荐执行顺序

### Sprint 0：本次已完成

- [x] 修 API contract。
- [x] 修恢复存档。
- [x] 修 asset GET 权限。
- [x] 修导出 preview 匹配。
- [x] 修分享 URL 环境变量。
- [x] 修生产 token salt gate。
- [x] 更新路线图。
- [x] 更新 README。

### Sprint 1：Alpha 收口，1-2 天

- [ ] 全量 `npm test` 和 `npm run build` 固定通过。
- [ ] 增加 session restore 单测或 E2E。
- [ ] 增加 asset GET 权限负例测试。
- [ ] 增加 SSE stream token。
- [ ] 手测 5 轮连续选择。
- [ ] 手测刷新恢复。
- [ ] 手测导出和分享。

### Sprint 2：基础设施冒烟，2-3 天

- [ ] PostgreSQL migration smoke。
- [ ] Redis/BullMQ smoke。
- [ ] Docker compose smoke。
- [ ] Worker restart smoke。
- [ ] Health check 调整。
- [ ] README 补充实际 Docker 注意事项。

### Sprint 3：资产交付，2-4 天

- [ ] 标准 S3/R2 上传。
- [ ] BFL provider smoke。
- [ ] CDN URL 持久化。
- [ ] 图片重绘版本历史验收。
- [ ] 图片失败降级体验。

### Sprint 4：质量和安全，3-5 天

- [ ] Playwright E2E。
- [ ] Prompt 回归集。
- [ ] 内容安全用例。
- [ ] 成本预算持久化。
- [ ] 日志和 traceId 串联。
- [ ] share token 安全策略。

### Sprint 5：Beta 发布，2-4 天

- [ ] 部署脚本。
- [ ] 生产环境变量清单。
- [ ] 备份/恢复说明。
- [ ] 监控仪表盘。
- [ ] 灰度用户反馈表。
- [ ] 发布检查表。

---

## 8. 最终验收命令

本地代码质量：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

本地服务：

```bash
npm run db:init
npm run dev
npm run worker
```

Docker：

```bash
docker compose build
docker compose up -d
docker compose logs -f app worker
```

Health：

```bash
curl http://localhost:3000/api/health
```

生产必备环境变量：

- [ ] `DATABASE_URL`
- [ ] `REDIS_URL`
- [ ] `OPENAI_API_KEY`
- [ ] `OPENAI_BASE_URL`
- [ ] `OPENAI_MODEL`
- [ ] `IMAGE_PROVIDER`
- [ ] `BFL_API_KEY`，当 `IMAGE_PROVIDER=bfl`
- [ ] `TOKEN_SALT`，必须随机，不能用默认占位值
- [ ] `ADMIN_TOKEN`
- [ ] `NEXT_PUBLIC_APP_URL` 或 `NEXT_PUBLIC_BASE_URL`
- [ ] `R2_ENDPOINT`
- [ ] `R2_ACCESS_KEY_ID`
- [ ] `R2_SECRET_ACCESS_KEY`
- [ ] `R2_BUCKET`
- [ ] `R2_PUBLIC_URL`

---

## 9. 交付风险表

| 风险 | 等级 | 当前状态 | 处理方式 |
|---|---:|---|---|
| SSE 未鉴权 | P0 | 未完成 | 加 stream token |
| 对象存储非标准签名 | P0 | 未完成 | 改 AWS SDK/R2 S3 |
| Docker 未真实 smoke | P0 | 未完成 | Sprint 2 执行 |
| 真实 DB migration 未验证 | P0 | 未完成 | 空库 + 幂等 smoke |
| 真实 Redis/worker 未验证 | P1 | 未完成 | 队列集成测试 |
| 真实 provider 成本失控 | P1 | 部分完成 | 预算持久化和阈值 |
| Prompt 质量波动 | P1 | 部分完成 | 回归集和评分 |
| share token 长期有效 | P2 | 未完成 | hash + TTL |
| localStorage owner token 风险 | P2 | 已知 | 文档说明或 cookie 方案 |

---

## 10. 现在最应该做什么

建议按这个顺序继续：

1. 跑全量 `npm test` 和 `npm run build`，把质量门真正锁住。
2. 做 SSE stream token，这是当前最大权限缺口。
3. 做 session restore 的 Playwright E2E，证明恢复不只是代码层可行。
4. 做 Docker + PostgreSQL + Redis smoke，确认环境可复现。
5. 替换对象存储实现，打通 R2/S3。
6. 再进入内容质量、成本、监控、正式部署。

当前项目方向正确，功能覆盖已经足够。后续重点不是堆更多功能，而是把已有功能按交付标准闭环。
