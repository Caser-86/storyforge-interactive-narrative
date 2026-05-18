# StoryForge 项目深度审核与整改执行清单

生成日期：2026-05-18  
项目路径：`D:\Files\基于LLM的全自动独立游戏互动游戏叙事生成器\narrative-game`  
当前产品方向：先做稳定的对话剧情推进和分支选择生成；场景图为附属功能，默认关闭，后续可按局开启。

---

## 1. 当前整改结论

StoryForge 已经能形成基础互动叙事闭环：输入开局灵感，生成剧情场景，给出选择分支，玩家选择后继续生成后续剧情。项目现在最重要的方向不是继续扩大生图能力，而是把“文字剧情推进”做稳：选择要有明显差异，记忆要能延续，分支要能回收，刷新要能恢复，错误要能重试，测试要能证明主流程可靠。

本轮已完成的修复：

- [x] 生图功能改为附属功能，默认关闭。
- [x] 开局页增加“场景图”可选开关，默认不勾选。
- [x] `POST /api/games` 默认不再创建 `asset_jobs`。
- [x] `POST /api/games/[sessionId]/choices` 继承本局 `imageGenerationEnabled`，默认不创建图片任务。
- [x] API response 支持 `assets.imageJobId = null`、`assets.imageStatus = "none"`。
- [x] 前端没有图片任务时不显示画面面板和移动端画面 Tab。
- [x] `ENABLE_IMAGE_GENERATION=false` 写入 `.env.example` 和 Docker 环境。
- [x] 修复 `events-token` 使用旧字段 `owner_token_hash` 的问题，改为 `owner_token`。
- [x] 修复 `db-smoke-test.ts` 里的旧字段：`owner_token_hash` -> `owner_token`，`storage_url` -> `url`。
- [x] 修复 DB smoke 脚本插入 `users` 缺少 `id` 的问题。
- [x] README 已同步“文字主线，图片可选”。

本轮已验证：

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] 相关测试：`api-games`、`api-contracts`、`permission-queue`

仍需最终验证：

- [ ] `npm test`
- [ ] `npm run build`
- [ ] 浏览器手测主流程
- [ ] Docker/DB/Redis 冒烟

---

## 2. 产品路线重心

### 2.1 主线：对话剧情推进

目标：

- [ ] 用户输入一句开局灵感。
- [ ] 系统生成一个可读、可玩的剧情场景。
- [ ] 场景包含 NPC 对话、地点、时间、气氛、目标。
- [ ] 场景给出 3 个选择。
- [ ] 每个选择能改变后续剧情，而不是只换一句描述。
- [ ] 玩家选择后，系统根据上一幕摘要、已选项、状态变量继续生成下一幕。
- [ ] 至少能稳定推进 8-12 轮。
- [ ] 刷新页面后能恢复当前剧情并继续。

### 2.2 附属：场景图

当前策略：

- [x] 默认关闭。
- [x] 开局可勾选开启。
- [x] 服务器可用 `ENABLE_IMAGE_GENERATION=true` 全局开启。
- [x] 未开启时不创建 `asset_jobs`。
- [x] 未开启时不启动图片 SSE/poll。

后续策略：

- [ ] 生图作为独立模块维护。
- [ ] 不让图片失败影响剧情推进。
- [ ] 不让 Redis/BFL/R2 成为文字主流程必需依赖。
- [ ] 图片相关任务只在明确启用后进入队列。

---

## 3. P0 必须先做

P0 是“没有这些，项目不能算可交付”的整改项。

### P0-1 对话剧情推进主流程验收

问题：

- 当前已有剧情生成和选择推进，但还缺一套专门证明“文字主流程稳定”的 E2E。
- 之前很多验收围绕图片、资产、队列展开，现在产品重心需要切回剧情。

整改步骤：

- [ ] 新建 `e2e/text-flow.spec.ts`。
- [ ] 使用 mock LLM 或稳定测试 provider。
- [ ] 测试首页输入 prompt。
- [ ] 测试不勾选“场景图”。
- [ ] 点击开始冒险。
- [ ] 断言首幕出现标题、正文、NPC、3 个选项。
- [ ] 断言没有出现画面 Tab。
- [ ] 断言没有触发 `/api/assets/*` 请求。
- [ ] 选择第一个选项。
- [ ] 断言第二幕生成。
- [ ] 断言历史选择显示上一幕选择。
- [ ] 连续选择 3 轮。
- [ ] 刷新页面。
- [ ] 加载历史 session。
- [ ] 断言当前 scene 仍有 3 个可点选项。
- [ ] 再选择一次，确认可继续。

验收标准：

- [ ] `npm run test:e2e -- text-flow` 通过。
- [ ] 图片功能关闭时全程没有图片请求。
- [ ] 文字剧情推进不依赖 Redis。
- [ ] 刷新恢复后仍可继续选择。

涉及文件：

- `e2e/text-flow.spec.ts`
- `src/app/components/StartScreen.tsx`
- `src/app/page.tsx`
- `src/lib/store.ts`

### P0-2 选择分支质量提升

问题：

- 选择可能表面不同但实际推进相似。
- 风险等级可能只是标签，不一定改变后续剧情。
- stateEffects 已存在，但后续 narrative 是否真实使用，需要进一步验证。

整改步骤：

- [ ] 审核 `src/lib/prompts.ts` 中对 choices 的约束。
- [ ] 明确 3 个选择必须分别代表：
  - [ ] 谨慎/调查路线。
  - [ ] 冒险/推进路线。
  - [ ] 社交/谈判或绕行路线。
- [ ] 要求每个 choice 的 `intent` 必须包含剧情方向，不只是动作。
- [ ] 要求每个 choice 的 `preview` 必须提示可能后果。
- [ ] 要求每个 choice 的 `stateEffects` 至少改变 1 个状态变量。
- [ ] 在 `narrative-quality.ts` 增加选择差异度检查。
- [ ] 检查 `choice.label` 相似度。
- [ ] 检查 `choice.intent` 相似度。
- [ ] 检查 `stateEffects` 是否完全相同。
- [ ] 如果 3 个选项太相似，触发 retry 或 fallback 修复。

验收标准：

- [ ] 30 条测试 prompt 里，选择相似度失败率低于 5%。
- [ ] 每幕 3 个选择的风险/收益明显不同。
- [ ] 人工抽查 10 局，每局至少 5 轮，剧情走向能感觉到分支差异。

涉及文件：

- `src/lib/prompts.ts`
- `src/lib/narrative-quality.ts`
- `src/__tests__/test-prompts-regression.test.ts`

### P0-3 剧情记忆和上下文连续性

问题：

- 当前选择推进主要依赖 `previousSceneSummary`、`selectedChoice` 和 `storyState`。
- 如果 `memorySummary` 太短或不包含关键决策，后续剧情会漂移。
- 长线剧情要避免忘记 NPC、目标、物品、未解决线索。

整改步骤：

- [ ] 审核 `memorySummary` 生成规则。
- [ ] 把 `memorySummary` 分成稳定字段：
  - [ ] `facts`：已确认事实。
  - [ ] `openThreads`：未解决线索。
  - [ ] `lastChoiceImpact`：上次选择造成的结果。
  - [ ] `npcState`：关键 NPC 态度变化。
- [ ] 如果暂不改 schema，至少在 prompt 中要求 `memorySummary` 必须包含上次选择影响。
- [ ] `applyChoiceEffects()` 后更新 `knownFacts`、`unresolvedThreads`、`npcRelations`。
- [ ] 每 3 轮压缩一次上下文，避免 prompt 过长。
- [ ] 增加测试：选择 A 后下一幕必须提及 A 的后果。
- [ ] 增加测试：NPC 态度变化能在后续幕保留。

验收标准：

- [ ] 连续 8 轮后，主目标仍清晰。
- [ ] 上一轮选择能影响下一轮正文或 NPC 对话。
- [ ] 重要 NPC 不会无故消失。
- [ ] 未解决线索能被后续剧情回收。

涉及文件：

- `src/lib/prompts.ts`
- `src/lib/story-state-service.ts`
- `src/lib/narrative-service.ts`
- `src/lib/schemas.ts`

### P0-4 默认关闭生图后的接口契约收口

问题：

- 现在 `assets.imageJobId` 可以是 `null`。
- 所有前端和测试都必须接受 `null`。
- 旧文档或测试可能仍假设每局都有图片任务。

整改步骤：

- [x] `AssetsSchema.imageJobId` 改为 nullable。
- [x] create API 默认返回 `imageJobId: null`。
- [x] choice API 默认返回 `imageJobId: null`。
- [x] 前端 `pollAsset()` 遇到 null 直接返回。
- [x] 页面无 image job 时隐藏画面面板。
- [ ] 全库搜索 `imageJobId).toMatch`、`imageJobId: string`。
- [ ] 全库搜索 `imageStatus: "queued"` 的默认假设。
- [ ] 把所有相关测试补上关闭图片的默认场景。
- [ ] 把所有相关测试补上开启图片的 opt-in 场景。

验收标准：

- [ ] `npm test` 全绿。
- [ ] `npm run build` 全绿。
- [ ] 图片关闭时创建游戏不会写 `asset_jobs`。
- [ ] 图片开启时创建游戏会写 `asset_jobs` 并 enqueue。

涉及文件：

- `src/lib/api-contracts.ts`
- `src/app/api/games/route.ts`
- `src/app/api/games/[sessionId]/choices/route.ts`
- `src/lib/store.ts`
- `src/app/page.tsx`
- `src/__tests__/api-games.test.ts`

### P0-5 修复 DB 字段漂移

问题：

- 已发现 `events-token` 和 `db-smoke-test.ts` 使用旧字段。
- 这说明 schema 和脚本之间仍可能有漂移。

已修：

- [x] `events-token`：`owner_token_hash` -> `owner_token`。
- [x] `db-smoke-test.ts`：`owner_token_hash` -> `owner_token`。
- [x] `db-smoke-test.ts`：`storage_url` -> `url`。
- [x] `db-smoke-test.ts`：补 `users.id`。
- [x] `db-smoke-test.ts`：移除 `scenes.state_json`。

继续整改：

- [ ] 全库搜索旧字段名。
- [ ] 为 `db-smoke-test.ts` 增加 CI 可选 job。
- [ ] 用真实 PostgreSQL 跑一次 `npm run db:smoke`。
- [ ] 把 smoke 输出保存到交付记录。
- [ ] 增加 schema contract 测试，检查 `db-smoke-test.ts` 使用字段存在于 `db.ts`。

验收标准：

- [ ] 空库执行 `npm run db:init` 成功。
- [ ] 同一空库再执行一次 `npm run db:init` 成功。
- [ ] `npm run db:smoke` 成功。

---

## 4. P1 内部 Alpha 前整改

### P1-1 错误恢复和重试

问题：

- 生成失败后虽然有 ErrorScreen，但主流程的恢复体验还不够强。
- retryLast 已存在，需要 E2E 覆盖。

整改步骤：

- [ ] 检查 `ErrorScreen.tsx` 是否能显示 traceId。
- [ ] 检查 `retryLast()` 创建游戏失败后的行为。
- [ ] 检查 `retryLast()` 选择失败后的行为。
- [ ] 模拟 LLM 第一次失败第二次成功。
- [ ] 模拟网络 500。
- [ ] 模拟 duplicate choice。
- [ ] 明确 duplicate choice 应提示“已选择，正在恢复当前局”还是只报错。

验收标准：

- [ ] 用户可以从错误页恢复。
- [ ] 错误页不会丢失当前 session。
- [ ] 选择失败不会污染 history。

### P1-2 对话 UI 优化

问题：

- 当前页面偏“文本冒险面板”，但对话剧情推进可以更像可玩对话。
- NPC dialogue 已有，但还没有形成对话回合感。

整改步骤：

- [ ] 把正文和 NPC 对话视觉层级区分更明显。
- [ ] NPC 对话区支持多个 NPC。
- [ ] 选项按钮突出“我选择/我说/我行动”的角色感。
- [ ] 历史选择展示为时间线。
- [ ] 当前目标展示为常驻小栏。
- [ ] 状态变化只在选择后短暂突出。
- [ ] 移动端默认只显示故事和状态，不显示画面。

验收标准：

- [ ] 用户能一眼看到当前 NPC 在说什么。
- [ ] 用户能一眼看到 3 个选择差异。
- [ ] 移动端无文字溢出。

### P1-3 Prompt 回归集

问题：

- 叙事质量不能只靠单次手感。

整改步骤：

- [ ] 维护 30 条 prompt。
- [ ] 每条跑 3 次。
- [ ] 保存输出 JSON。
- [ ] 自动检查 schema。
- [ ] 自动检查选择数量。
- [ ] 自动检查正文长度。
- [ ] 自动检查 choice intent 差异。
- [ ] 人工评分：可读性、连续性、分支感、NPC 鲜明度、安全性。
- [ ] 记录失败 prompt。
- [ ] 修 prompt 后复测。

验收标准：

- [ ] schema 通过率 >= 98%。
- [ ] fallback 率 <= 5%。
- [ ] 人工平均分 >= 4/5。

### P1-4 Session 恢复稳定性

问题：

- 恢复功能已修过，但还缺完整验收。

整改步骤：

- [ ] 创建游戏。
- [ ] 连续选择 3 轮。
- [ ] 刷新页面。
- [ ] 点击历史游戏。
- [ ] 验证 currentScene 是最后一幕。
- [ ] 验证 choices 来自 DB，而不是空数组。
- [ ] 验证 artPrompt/bgmCue 即便图片关闭仍存在。
- [ ] 验证再选择可以继续。
- [ ] 验证 owner token 缺失时提示权限错误。

验收标准：

- [ ] 刷新恢复后 `choices.length === 3`。
- [ ] 再选择一次成功生成下一幕。
- [ ] 无 owner token 不能读私有 session。

### P1-5 分享和导出

问题：

- 分享是只读 replay，导出有 JSON/Markdown。
- 需要保证默认无图模式下仍然可用。

整改步骤：

- [ ] 创建无图游戏。
- [ ] 推进 3 轮。
- [ ] 导出 JSON。
- [ ] 导出 Markdown。
- [ ] 检查导出中没有 owner token。
- [ ] 检查导出中没有 raw model JSON。
- [ ] 分享 replay。
- [ ] 打开分享链接。
- [ ] 检查分享页不需要 owner token。
- [ ] 检查分享页只读，不能继续选择。
- [ ] R 级内容分享拒绝测试。

验收标准：

- [ ] 无图模式导出可用。
- [ ] 分享不泄漏私有字段。
- [ ] R 级分享被拒。

---

## 5. P2 图片模块后续整改

图片现在是附属模块，不阻塞文字主线。等文字主线稳定后再做。

### P2-1 开启图片后的完整链路

步骤：

- [ ] 开局勾选“场景图”。
- [ ] 创建游戏后确认返回 `imageJobId`。
- [ ] 确认 DB 写入 `asset_jobs`。
- [ ] 确认 queue 收到 job。
- [ ] 确认 SSE token 正常获取。
- [ ] 确认 SSE 能收到 `asset.completed`。
- [ ] 确认 worker 失败时前端显示失败但剧情可继续。
- [ ] 确认重新生成可用。
- [ ] 确认高清重绘可用。

### P2-2 图片权限

步骤：

- [ ] `GET /api/assets/[assetJobId]` 无 owner token 返回 403。
- [ ] 错 owner token 返回 403。
- [ ] 正 owner token 返回 status。
- [ ] 分享页公开图片只走 `/api/share/[token]/assets/[sceneId]`。
- [ ] 公开图片接口只返回 completed URL，不返回 prompt hash、error、versions。

### P2-3 图片成本

步骤：

- [ ] `ENABLE_IMAGE_GENERATION=false` 为默认生产配置。
- [ ] BFL provider 只有明确开启才调用。
- [ ] 每日 asset limit 持久化。
- [ ] 超预算时返回明确错误。
- [ ] README 写清图片会产生额外成本。

---

## 6. P3 工程和交付整改

### P3-1 CI

步骤：

- [ ] CI 继续跑 typecheck、lint、test、build。
- [ ] 增加可选 PostgreSQL service job。
- [ ] 增加 `db:smoke` job。
- [ ] 增加 Playwright job，先只跑文字主流程。
- [ ] build job 设置 `ENABLE_IMAGE_GENERATION=false`。

### P3-2 Docker

步骤：

- [ ] `docker compose build`。
- [ ] `docker compose up -d`。
- [ ] `curl /api/health`。
- [ ] 无图模式验证不需要 worker 才能创建游戏。
- [ ] 开图模式验证 worker 必须正常。
- [ ] README 补 Docker smoke 真实结果。

### P3-3 生产配置

步骤：

- [ ] `TOKEN_SALT` 生产必填。
- [ ] `ADMIN_TOKEN` 生产必填。
- [ ] `OPENAI_API_KEY` 生产必填。
- [ ] `ENABLE_IMAGE_GENERATION` 生产默认 false。
- [ ] `IMAGE_PROVIDER` 生产默认 mock 或明确 bfl。
- [ ] 图片开启时 `REDIS_URL` 必填。
- [ ] 图片开启时对象存储配置必填。

### P3-4 安全

步骤：

- [ ] owner token 使用 timing-safe compare。
- [ ] share token hash 存储。
- [ ] share token 增加 TTL 或撤销机制。
- [ ] localStorage owner token 风险写入隐私说明。
- [ ] stats/cost 所有生产接口都要求 admin token。
- [ ] 日志禁止输出 owner token、API key、stream token。

---

## 7. 推荐执行顺序

第一阶段：文字主线稳定，1-2 天。

- [ ] 跑全量 `npm test`。
- [ ] 跑 `npm run build`。
- [ ] 新增 `text-flow` E2E。
- [ ] 验证默认无图模式不触发 asset。
- [ ] 修选择分支相似度。
- [ ] 修记忆连续性 prompt。

第二阶段：交付可靠性，2-3 天。

- [ ] 跑真实 PostgreSQL `db:smoke`。
- [ ] 修所有 smoke 暴露的问题。
- [ ] Docker 无图模式 smoke。
- [ ] README 补充 smoke 结果。
- [ ] CI 增加 DB smoke。

第三阶段：图片附属模块，2-4 天。

- [ ] 图片开启模式 E2E。
- [ ] Worker/Redis smoke。
- [ ] BFL smoke。
- [ ] R2/S3 smoke。
- [ ] 成本限制持久化。

第四阶段：Beta 准备，3-5 天。

- [ ] 30 条 prompt 回归。
- [ ] 人工质量评分。
- [ ] 隐私说明。
- [ ] 备份和回滚说明。
- [ ] 发布 checklist。

---

## 8. 当前下一步

最建议马上做：

1. 跑全量 `npm test` 和 `npm run build`。
2. 写 `e2e/text-flow.spec.ts`，锁住无图文字主线。
3. 用真实 DB 跑 `npm run db:smoke`。
4. 修 `prompts.ts`，让分支差异和记忆延续更稳定。
5. 再考虑图片开启链路。

当前判断：项目方向要收窄。先把“会讲故事、会根据对话推进、会生成有意义分支”做成稳定产品，再把图片作为可选增强加回去。
