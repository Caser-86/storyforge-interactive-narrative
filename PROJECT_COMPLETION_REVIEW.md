# 项目全面审查与完成路线

> **⚠️ 历史审查文档，部分内容已过期。当前执行请以 `PROJECT_ROADMAP.md` 为准。**

日期：2026-05-17  
审查范围：
- `D:\Files\基于LLM的全自动独立游戏互动游戏叙事生成器`
- `完整项目方案.md`
- `narrative-game/IMPROVEMENTS_CHECKLIST.md`
- `narrative-game/src`
- `narrative-game/package.json`
- `narrative-game/README.md`
- Docker / CI / 测试配置

---

## 0. 总结

项目已从早期 MVP 扩展到“较完整的互动叙事产品骨架”：已有 Next.js 页面、组件拆分、API、PostgreSQL migrations、Redis/BullMQ、测试、分享、导出、BGM 匹配、观测日志、限流等。

但当前还不能视为完成。核心问题不是“功能数量不够”，而是“已有功能未闭环”：lint/test/build 失败，asset worker 被 API route 误导入导致构建期启动 DB/Redis，部分新 API 查询了不存在的数据库列，旧改进清单里大量项目已标记完成但验证结果不支持“全绿”。

优先级判断：
1. 先修到 `typecheck + lint + test + build` 全绿。
2. 再修 DB schema/API 合同不一致。
3. 再把队列、分享、导出、用户归属、安全、观测做成可上线闭环。
4. 最后做叙事质量、真实图片、BGM 资源、分享导出体验和商业化功能。

---

## 1. 当前验证结果

在 `narrative-game` 下执行：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

结果：

- [x] `npm run typecheck` 通过。
- [ ] `npm run lint` 失败：5 errors，2 warnings。
- [ ] `npm test` 失败：8 个 test files 中 1 个失败，49 tests 中 1 个失败。
- [ ] `npm run build` 失败：Next build 收集 page data 时误启动 worker，连接本地 PostgreSQL 失败。

### 1.1 Lint 失败项

- [ ] `src/__tests__/test-prompts-regression.test.ts:82`：`any` 类型。
- [ ] `src/__tests__/test-prompts-regression.test.ts:109`：`any` 类型。
- [ ] `src/app/components/BgmPlayer.tsx:28`：effect 内同步 `setAudioError(false)` / `setPlaying(false)`。
- [ ] `src/app/components/ReplayScreen.tsx:30`：`any` 类型。
- [ ] `src/app/share/[token]/page.tsx:45`：页面内 `<a href="/">` 应改 `next/link`。
- [ ] `src/app/components/StoryPanel.tsx:18`：`shareUrl` 已设置但未使用。
- [ ] `src/app/components/VisualPanel.tsx:68`：仍使用 `<img>`，Next 建议 `next/image` 或明确保留策略。

### 1.2 Test 失败项

- [ ] `src/__tests__/test-prompts-regression.test.ts:158`：期望 `NarrativeOutputSchema.safeParse(valid)` 成功，但实际失败。

可能原因：
- 测试样例缺少 `hiddenIntent`。
- `dialogue` 长度不足 `min(20)`。
- `mood` 少于 schema 要求的 2 个。
- `body` 少于 schema 要求的 180 字。
- `choices.id` 不符合 `^choice_[a-c]$`。
- `choices` 缺少 `stateEffects`。
- `artPrompt` 缺少 `negativePrompt` / `styleLock`，且 `prompt` 少于 60 字。
- `chapterGoal` / `memorySummary` 可能少于 schema 最小长度。

### 1.3 Build 失败项

`npm run build` 失败关键日志：

```text
Initializing database...
Worker startup failed: AggregateError
connect ECONNREFUSED ::1:5432
connect ECONNREFUSED 127.0.0.1:5432
Next.js build worker exited with code: 1
```

根因：
- API route 直接 import `@/scripts/asset-worker`。
- `src/scripts/asset-worker.ts` 顶层创建 `Worker`，并执行 `main()`。
- Next build 收集 route/page data 时导入 route，route 导入 worker，worker 立刻初始化 DB/Redis。

必须拆分：
- `src/lib/asset-queue.ts`：只导出 `Queue` / `enqueueAssetJob()`，无 worker side effect。
- `src/scripts/asset-worker.ts`：只在 worker 命令中创建 `Worker` 并执行 `main()`。
- API routes 只 import `src/lib/asset-queue.ts`。

---

## 2. 和 `IMPROVEMENTS_CHECKLIST.md` 的差异

旧清单中几乎全部标记 `[x]`，但当前验证不支持“已完成”判断。

应改成：
- `已实现`：代码存在。
- `已验证`：typecheck/lint/test/build/手测通过。
- `待修复`：代码存在但失败或未闭环。

建议新增状态字段：

```md
- [x] 已实现：...
- [ ] 已验证：...
- [ ] 待修复：...
```

当前应重新打开的旧清单项：
- [ ] “CI 全绿”：lint/test/build 仍失败。
- [ ] “API route 去直接生成图片”：已去掉直接生成，但 route 仍导入 worker 脚本，构建失败。
- [ ] “SSE 只负责推送状态”：仍会 enqueue queued jobs，职责不纯；可接受但需明确。
- [ ] “重生成图片支持版本”：有版本表，但高清参数未进入 worker，seed/hash/cache 逻辑仍冲突。
- [ ] “分享链接”：接口和回放链路存在，但 DB 字段查询错、权限和数据暴露风险未解。
- [ ] “导出”：接口存在，但查询了不存在列，基本不可用。
- [ ] “用户系统”：接口存在，但游戏创建未绑定 `user_id`，删除也会被外键挡住。

---

## 3. P0：必须先修的阻塞问题

### 3.1 拆分队列模块，修复 build

问题：
- `src/app/api/games/route.ts`
- `src/app/api/games/[sessionId]/choices/route.ts`
- `src/app/api/assets/[assetJobId]/route.ts`
- `src/app/api/games/[sessionId]/events/route.ts`

这些 route import `@/scripts/asset-worker`，触发 worker side effect。

措施：
- [ ] 新增 `src/lib/asset-queue.ts`。
- [ ] 把 `Queue`、Redis connection、`enqueueAssetJob()` 移入 `asset-queue.ts`。
- [ ] `asset-worker.ts` 改为 import `assetQueue` / `AssetJobData`。
- [ ] `asset-worker.ts` 的 `main()` 只在脚本入口运行。
- [ ] API routes 改为 import `@/lib/asset-queue`。
- [ ] 再跑 `npm run build`，确保没有构建期 DB 初始化。

验收：
- [ ] `npm run build` 在未启动本地 PostgreSQL 时也能完成静态构建，或至少不因 worker side effect 失败。

### 3.2 修 lint

措施：
- [ ] `BgmPlayer`：不要在 effect 内同步 set state。可用 key 重挂载音频区域、事件回调内更新，或把 `audioError/playing` 重置放到用户动作/derived state。
- [ ] `ReplayScreen`：定义 `SessionSceneResponse` 类型，替代 `any`。
- [ ] `test-prompts-regression.test.ts`：用 `Partial<NarrativeOutput>` / 专用测试类型，避免 `any`。
- [ ] `share/[token]/page.tsx`：用 `next/link`。
- [ ] `StoryPanel`：使用 `shareUrl` 展示/复制链接，或删除 state。
- [ ] `VisualPanel`：若继续 `<img>`，在 ESLint 中针对远程临时图片说明并局部 disable；更好是配置 `next/image` remote loader。

验收：
- [ ] `npm run lint` 0 errors。

### 3.3 修测试样例或 schema 预期

问题：
- 测试样例和真实 `NarrativeOutputSchema` 不一致。
- 这说明测试不是“回归保护”，而是和 schema 脱节。

措施：
- [ ] 将测试中的 valid object 补齐为真实合规对象。
- [ ] 或拆出“质量检测函数测试对象”和“schema 合规对象”，不要混用。
- [ ] 修正 choice id 策略：模型输出 id 与持久化 id 需分离。

验收：
- [ ] `npm test` 0 failed。

### 3.4 修 DB schema/API 查询不一致

严重问题：
- `src/app/api/share/[token]/route.ts` 查询 `scenes.npcs`，但 schema 是 `npcs_json`。
- `src/app/api/games/[sessionId]/export/route.ts` 查询 `bgm_cue`、`art_prompt`、`npcs`，但 schema 是 `bgm_cue_json`、`art_prompt_json`、`npcs_json`。
- `export` 查询 `choices.preview`、`choices.chosen`，但 `choices` 表没有这些列；只有 `state_effects_json`、`selected_at`。

措施：
- [ ] 分享 API 改查 `npcs_json`。
- [ ] 导出 API 改查 `bgm_cue_json` / `art_prompt_json` / `npcs_json`。
- [ ] choices 导出用 `selected_at IS NOT NULL AS chosen`。
- [ ] 若需要 `preview`，则 migration 给 `choices` 增加 `preview TEXT`，并在插入 choice 时保存。
- [ ] 给分享/导出 API 加集成测试覆盖真实列名。

验收：
- [ ] `/api/share/[token]` 能返回真实 replay 数据。
- [ ] `/api/games/[sessionId]/export?format=json` 可用。
- [ ] `/api/games/[sessionId]/export?format=markdown` 可用。

---

## 4. P1：核心正确性与可靠性

### 4.1 数据库写入需要 transaction

问题：
- 创建游戏：插 session、scene、choices、asset_job 是多步操作，无事务。
- 选择分支：标记 choice、生成 scene、插 choices、更新 session、插 asset_job 是多步操作，无事务。
- 任一步失败都会留下半成品数据。

措施：
- [ ] `db.ts` 增加 `withTransaction(callback)`。
- [ ] `POST /api/games` 全流程包事务（LLM 调用可在事务外，DB 写入在事务内）。
- [ ] `POST /choices` 使用事务 + 行锁/原子 update。
- [ ] `choices` duplicate check 使用 `UPDATE ... WHERE selected_at IS NULL RETURNING id` 并检查返回行数。

验收：
- [ ] 任一步 DB 写失败时不会留下半个 session。
- [ ] 并发点击同一 choice 只有一个成功。

### 4.2 删除接口会被外键挡住

问题：
- `DELETE /api/games/[sessionId]` 直接删 `game_sessions`。
- `deleteUser()` 直接删用户的 `game_sessions`。
- 但 `scenes`、`choices`、`asset_jobs` 外键引用 `game_sessions`，没有 `ON DELETE CASCADE`。

措施：
- [ ] 增加 migration：外键改为 `ON DELETE CASCADE`。
- [ ] 或在删除时按顺序删除：`asset_versions` -> `asset_jobs` -> `choices` -> `scenes` -> `game_sessions`。
- [ ] 加测试：已有 scenes/choices/assets 的 session 能删除。

验收：
- [ ] 删除 session/user 不报 foreign key violation。

### 4.3 Choice id 模型输出与持久化 ID 混在一起

问题：
- `ChoiceSchema.id` 要求 `^choice_[a-c]$`。
- API 持久化后把 `choice.id` 改成 `choice_${sceneSuffix}_${choice.id}`。
- 前端收到的是持久化 id，不再符合 `ChoiceSchema`。

措施：
- [ ] 拆两个 schema：
  - `ModelChoiceSchema`：LLM 输出 `choice_a|choice_b|choice_c`。
  - `PersistedChoiceSchema`：前端/API 使用 DB id。
- [ ] `SceneData` 用 persisted choice type。
- [ ] DB 保存原始 choice id 字段，如 `model_choice_id`，便于调试。

验收：
- [ ] schema 测试清晰区分“LLM 输出”和“API 响应”。

### 4.4 Fallback narrative 不满足自身 schema

问题：
- `generateFallbackNarrative()` 返回的 `body` 可能不足 180 字。
- choice id 是 `choice_light` / `choice_dark` / `choice_wait`，不符合 `ChoiceSchema`。
- `chapterGoal` 可能不足 20 字。
- fallback 没走 `NarrativeOutputSchema.parse()`。

措施：
- [ ] fallback 也必须 `NarrativeOutputSchema.parse()`。
- [ ] fallback choice id 改为 `choice_a/b/c`。
- [ ] fallback body/chapterGoal/memorySummary 满足长度。

验收：
- [ ] fallback 单测通过 schema。

### 4.5 API 错误格式和前端解析不一致

问题：
- `apiError()` 返回 `{ code, message, traceId }`。
- `store.ts` 读取 `err.error`。
- 用户会看到 generic `"Failed to create game"` / `"Failed to make choice"`。

措施：
- [ ] 前端统一读取 `err.message || err.error || fallback`。
- [ ] 后端所有错误都用 `apiError()`，安全错误也保持同格式，warnings 放 `details`。

验收：
- [ ] 前端能展示真实错误 message 和 traceId。

---

## 5. P1：资产生成与队列

### 5.1 高清重绘参数没有生效

问题：
- `VisualPanel` POST `/api/assets/[id]` 时发送 `{ quality: "high" }`。
- 后端 `POST /api/assets/[assetJobId]` 没读取 request body。
- `asset-worker.ts` 固定 `quality: "draft"`。

措施：
- [ ] `AssetJobData` 增加 `quality`。
- [ ] `asset_jobs.prompt_json` 或新增列保存 `quality`。
- [ ] regenerate API 读取 body，传给 queue。
- [ ] worker 使用 job.data.quality。

验收：
- [ ] 高清重绘实际使用 high 模型/分辨率。

### 5.2 promptHash 忽略 seed 导致重生成可能复用旧图

问题：
- `computePromptHash()` 当前忽略 `seedHint`。
- 重生成时只改 seed，但 newHash 和旧 hash 一样。
- worker cache 命中后可能直接返回旧 URL，重生成失败于“看起来重生成，实际还是旧图”。

措施：
- [ ] 普通缓存 hash：可忽略 seed。
- [ ] 重生成 hash：包含 seed，或设置 `bypassCache: true`。
- [ ] 版本记录写入“是否来自 cache / 是否 bypass”。

验收：
- [ ] 点击重新生成后 URL/版本确实变化，除非明确选择复用缓存。

### 5.3 队列失败后 queued job 可能永久卡住

问题：
- API enqueue 失败只 `console.warn`。
- 若 worker 不运行，job 保持 `queued`。
- SSE 最多轮询约 120 秒后关闭，不标记 failed。

措施：
- [ ] enqueue 失败时更新 asset_jobs.error 或 status=`failed`（本地开发可保留 queued 但前端需提示 worker 未运行）。
- [ ] 增加 stuck job watcher：queued/generating 超过阈值自动 failed/retry。
- [ ] `/api/health` 显示 worker/queue 状态。

验收：
- [ ] Redis/worker 不可用时，前端收到明确错误，不无限生成中。

### 5.4 熔断和预算函数未接入主流程

问题：
- `isCircuitOpen()` / `recordFailure()` / `recordSuccess()` / `isWithinBudget()` 存在但未在 `generateImage()` / LLM 调用前后使用。

措施：
- [ ] `generateImage()` 调用前检查 provider circuit。
- [ ] provider 成功/失败记录熔断状态。
- [ ] LLM 和图片任务前检查 budget。
- [ ] 超预算返回明确 `BUDGET_EXCEEDED`。

验收：
- [ ] 连续 provider 失败后自动短路，预算超限后拒绝新任务。

---

## 6. P1：分享、导出、用户归属

### 6.1 分享链路泄露 sessionId 且回放接口不一致

问题：
- `/api/share/[token]` 返回 `session.id`。
- `SharePage` 拿到 sessionId 后调用 `ReplayScreen`。
- `ReplayScreen` 再请求 `/api/games/${sessionId}`。
- `/api/games/${sessionId}` 没鉴权，分享 token 变相公开 session id。

措施：
- [ ] `/share/[token]` 页面直接使用 `/api/share/[token]` 返回的 readonly 数据。
- [ ] 不把内部 sessionId 暴露给前端，或只暴露只读 replay id。
- [ ] `/api/games/[sessionId]` 增加 user/session 权限校验。

验收：
- [ ] 分享页只读，不可通过 token 获得完整可写 session 操作能力。

### 6.2 用户系统未和游戏创建绑定

问题：
- `/api/user` 用 `x-user-fingerprint` 获取/创建用户。
- `POST /api/games` 没读取 fingerprint，也没写 `user_id`。
- `getUserGames()` 大概率一直返回空。

措施：
- [ ] `POST /api/games` 读取 `x-user-fingerprint`。
- [ ] 创建/获取 user，写入 `game_sessions.user_id`。
- [ ] 前端请求统一带 fingerprint。
- [ ] `/api/games/[sessionId]` / delete / export / share 校验 user ownership。

验收：
- [ ] `/api/user` 能看到当前用户创建过的故事。

### 6.3 导出数据列错，且 Markdown 渲染字段名混乱

问题：
- export 查询字段和 DB schema 不一致。
- `renderMarkdown()` 使用 `scene.time_of_day`、`scene.chapter_goal`，但 scenes map 后字段是 `timeOfDay`、`chapterGoal`。

措施：
- [ ] 修 SQL 列名。
- [ ] 修 mapping 字段。
- [ ] 给 JSON/Markdown 各加测试。

验收：
- [ ] 导出的 Markdown 包含完整幕标题、正文、NPC、选项、已选择标记。

---

## 7. P2：叙事质量与 Prompt

### 7.1 质量检查只加 warning，不触发 retry

问题：
- `checkRiskCoverage()` / `checkChoiceSimilarity()` 发现问题只写入 `contentWarnings`。
- `shouldRetry` 未用于重试。
- `runAllQualityChecks()` 未在 `generateNarrative()` 中统一使用。

措施：
- [ ] LLM parse 成功后执行 `runAllQualityChecks()`。
- [ ] `shouldRetry=true` 时把 issues 加入 retry prompt，再试一次。
- [ ] retry 后仍失败才降级或返回 warnings。

验收：
- [ ] 选项重复/风险缺失能自动 retry，而不是把质量问题展示给玩家。

### 7.2 伏笔引用检查未接入

问题：
- `checkThreadReference()` 存在，但 `generateNarrative()` 未调用。
- 故事长回合一致性仍靠 prompt，不靠验证。

措施：
- [ ] 从 `storyState.knownFacts + unresolvedThreads` 传入 quality check。
- [ ] 未引用伏笔时，在 retry prompt 中明确要求引用。
- [ ] 每 3 幕检查主线推进。

验收：
- [ ] 第 3/6/9 幕能稳定引用已知线索或推进主线。

### 7.3 StoryState 增长与去重不足

问题：
- `inventory` / `knownFacts` / `unresolvedThreads` 追加不去重。
- `variables` 无上下限，可能无限膨胀。
- `chapter` 没有实际推进逻辑。

措施：
- [ ] 数组去重并限制长度。
- [ ] variables clamp 范围，例如 -100 到 100。
- [ ] turn 到结局后进入 ended 状态。
- [ ] 增加 `endingPotential` / `flags` / `npcRelations` 正式字段。

验收：
- [ ] 10 幕后 storyState 仍短、稳定、可解释。

---

## 8. P2：前端体验与可用性

### 8.1 `Home` render 阶段直接 set store

问题：
- `src/app/page.tsx` 中比较 scene id 后，在 render 阶段调用 `useGameStore.setState()`。
- 这绕过了 React effect 规则，可能导致难追踪渲染问题。

措施：
- [ ] 用 event/action 在 `set currentScene` 时同步清空 selectedChoice。
- [ ] 或用 `useEffect` + ref，但需避开 lint 的同步 setState 规则，可改为 store action 内处理。

验收：
- [ ] render 中无 store mutation。

### 8.2 图片轮询可能旧 job 覆盖新场景

问题：
- `pollAsset()` 内部 closure 捕获旧 `imageJobId`。
- 玩家快速进入下一幕时，旧 timer 可能回来写 `imageUrl`。

措施：
- [ ] poll 返回前检查 `get().imageJobId === imageJobId`。
- [ ] 每次新 job 创建时取消旧 poll timer。
- [ ] SSE event 也校验 `assetJobId` 是否等于当前 imageJobId。

验收：
- [ ] 快速连续选择时，不会显示上一幕图片。

### 8.3 React 文本不需要手动 XML escape

问题：
- `StoryPanel` 在 React text node 中调用 `escapeXml()`。
- React 本身会转义文本，手动 escape 会让 `&` 等显示成实体。

措施：
- [ ] 普通 JSX 文本删除 `escapeXml()`。
- [ ] 只在 SVG/XML 字符串拼接处使用 escape。

验收：
- [ ] 用户文本显示自然，不出现 `&amp;`。

### 8.4 placeholder SVG 仍未 escape

问题：
- `src/app/api/placeholder/route.ts` 直接把 query `text` 拼进 SVG。
- 这才是需要 XML escape 的位置。

措施：
- [ ] 在 placeholder route 中加 `escapeXml(text)`。
- [ ] 限制 text 长度。
- [ ] 加测试覆盖 `<`, `&`, `"`。

验收：
- [ ] SVG 不可注入，特殊字符显示正确。

---

## 9. P2：安全和权限

### 9.1 真实权限模型还缺

当前状态：
- 有匿名 fingerprint。
- 没有认证。
- 没有 ownership 校验。
- sessionId 可直接访问。

措施：
- [ ] MVP 至少实现“匿名 owner token”：创建游戏时生成 `owner_token`，后续修改/删除/导出/分享需带 token。
- [ ] 分享 token 只读。
- [ ] 用户 fingerprint 只能作为体验标识，不作为安全认证。

验收：
- [ ] 知道 sessionId 不能删除/归档/分享他人故事。

### 9.2 输入安全仍偏浅

措施：
- [ ] 输入安全：接入模型 moderation 或更完整分类器。
- [ ] 输出安全：正文、NPC、artPrompt、musicPrompt 全部二次检查。
- [ ] rating 策略：G/PG/PG-13/R 真正影响 prompt 和输出过滤。
- [ ] 版权：配置词库持久化，记录替换审计。

验收：
- [ ] 不安全 prompt 有稳定拒绝/改写路径。
- [ ] R 级内容不会越过用户选择和年龄确认。

---

## 10. P2：测试体系补强

当前测试有了，但还不够保护真实功能。

需要新增：
- [ ] Build regression：确保 API routes import 不触发 worker/DB side effect。
- [ ] DB schema contract tests：share/export 查询列必须存在。
- [ ] Fallback narrative schema test。
- [ ] API error format test：前端能读取 `message`。
- [ ] Delete cascade test。
- [ ] Asset regenerate high-quality test。
- [ ] Prompt hash/cache behavior test：普通缓存 vs 强制重生成。
- [ ] Store stale polling test：旧 asset job 不覆盖新 scene。
- [ ] Permission test：非 owner 不能修改/删除/export private session。
- [ ] E2E smoke：创建游戏 -> 选择 -> 图片状态 -> 导出 -> 分享。

工具建议：
- 单元/集成：Vitest。
- API + DB：Testcontainers 或独立 test database。
- 前端 E2E：Playwright。

---

## 11. P3：上线前工程化

### 11.1 环境和部署

- [ ] Docker build 必须不依赖本地 DB/Redis。
- [ ] `docker-compose` app healthcheck 使用 `curl`，但 `node:20-alpine` 默认可能没有 curl；改用 Node healthcheck 或安装 curl。
- [ ] worker 镜像 command 依赖 `tsx`，runner 只装 production deps 时可能无 `tsx`；应为 worker 单独镜像/stage，或编译脚本后用 node 运行。
- [ ] `.env.example` 和 README 中 `OPENAI_MODEL` 默认不一致：README 写 `gpt-4o-mini`，docker-compose 写 `gpt-5.4-mini`，需要统一。
- [ ] 生产 `ADMIN_TOKEN` 必填应在启动时校验。

### 11.2 观测

- [ ] `/api/stats` 当前只返回内存 stats，不查持久化 logs；重启后归零。
- [ ] 增加 DB 聚合 stats：按最近 24h/7d 统计。
- [ ] 增加 traceId 贯穿 LLM/asset/API。
- [ ] 增加 alert：LLM fallback 高、asset failed 高、DB latency 高、budget 超限。

### 11.3 资产存储

- [ ] BFL 返回远程 URL 目前直接存，未上传 R2/S3。
- [ ] `.env.example` 有 R2 配置，但代码未使用。
- [ ] 上线前应实现对象存储持久化，否则外部临时 URL 可能过期。

---

## 12. 产品完成路线

### 阶段 A：修到可构建可回归（最优先）

目标：让项目从“功能看起来很多”变成“CI 可证明可运行”。

- [ ] 拆 `asset-queue.ts`，修 build side effect。
- [ ] 修 lint 5 errors。
- [ ] 修 test-prompts valid object。
- [ ] 修 share/export SQL 列名。
- [ ] 修 README API 字段：`prompt` vs `seedPrompt`、`assets.imageJobId` vs `imageJobId`。
- [ ] 跑通：`npm run typecheck && npm run lint && npm test && npm run build`。

验收输出：
- [ ] CI 四项全绿。
- [ ] 本地 build 不依赖 DB/Redis。

### 阶段 B：修数据一致性和 API 合同

- [ ] DB transaction。
- [ ] delete cascade 或手动级联删除。
- [ ] choice model id / persisted id 分离。
- [ ] fallback narrative schema 合规。
- [ ] API error format 和前端 store 对齐。
- [ ] game session ownership 绑定 user/fingerprint。

验收输出：
- [ ] 创建/选择/删除/导出/分享全链路不出现半数据。
- [ ] API 文档与实际响应一致。

### 阶段 C：完成资产队列闭环

- [ ] worker-only side effect。
- [ ] stuck job timeout。
- [ ] high quality regenerate 生效。
- [ ] cache / bypassCache 策略清晰。
- [ ] R2/S3 上传。
- [ ] health 显示 worker/queue 状态。

验收输出：
- [ ] 图片生成失败、队列断开、worker 停止都有明确 UI 和恢复路径。

### 阶段 D：叙事质量闭环

- [ ] 质量检查触发 retry。
- [ ] 伏笔引用检查接入。
- [ ] StoryState 去重/限长/变量 clamp。
- [ ] 章节 ending 触发。
- [ ] 30 个 TEST_PROMPTS 做快照/评分。

验收输出：
- [ ] 10 幕故事不跑题，选项不重复，关键线索持续出现。

### 阶段 E：权限、安全、上线准备

- [ ] owner token / share readonly token。
- [ ] moderation / rating 策略。
- [ ] stats 鉴权和持久化聚合。
- [ ] Docker worker/app 分离。
- [ ] Playwright smoke test。
- [ ] 生产部署 checklist 实测。

验收输出：
- [ ] 可灰度给真实用户使用。

---

## 13. 建议的最终验收标准

### 工程验收

- [ ] `npm run typecheck` 通过。
- [ ] `npm run lint` 通过。
- [ ] `npm test` 通过。
- [ ] `npm run build` 通过。
- [ ] Docker app + worker + db + redis 能启动。
- [ ] `/api/health` 显示 DB/Redis/worker/LLM/image provider 状态。

### 产品验收

- [ ] 输入一句话，5 秒左右看到第一幕文本和三个选项。
- [ ] 选择分支后能生成下一幕，且状态变化合理。
- [ ] 图片异步生成，失败不阻塞游玩。
- [ ] BGM cue 可用，缺音频时降级为 prompt。
- [ ] 分享链接可只读回放。
- [ ] JSON/Markdown 导出可用。

### 安全验收

- [ ] 不安全输入可拒绝/改写。
- [ ] 输出再检查。
- [ ] 非 owner 不能删除/归档/导出私有 session。
- [ ] 分享 token 只读。
- [ ] 成本限制生效。

### 内容质量验收

- [ ] 30 个测试 prompt 全部 schema pass。
- [ ] 三个选项风险覆盖 low/medium/high。
- [ ] 选项语义不重复。
- [ ] NPC 有动机和台词。
- [ ] 每 3 幕推进主线。
- [ ] 长回合保持风格和人物一致。

---

## 14. 推荐立即处理清单

按收益/风险排序：

1. [ ] 拆 `src/lib/asset-queue.ts`，修 build side effect。
2. [ ] 修 share/export SQL 列名。
3. [ ] 修 lint 5 errors。
4. [ ] 修 test valid object。
5. [ ] 修 API error 和 store 错误解析。
6. [ ] 修 delete cascade。
7. [ ] 修 promptHash / regenerate cache 冲突。
8. [ ] 修 high quality regenerate 参数链路。
9. [ ] 给创建/选择流程加 transaction。
10. [ ] 重写 `IMPROVEMENTS_CHECKLIST.md` 状态，区分“实现”和“验证”。

---

## 15. 当前项目状态判断

当前状态：功能扩展很快，架构方向对，但质量门没过。  
离 MVP beta：还差“构建可过 + 核心 API 可用 + DB 合同一致 + 分享/导出闭环”。  
离公开上线：还差权限、安全、对象存储、真实队列运维、质量评估和成本控制实测。

建议不要继续堆新功能。先做阶段 A 和阶段 B，让地基变稳，再继续真实多媒体和商业化。

