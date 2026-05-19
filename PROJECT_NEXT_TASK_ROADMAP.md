# StoryForge 后续任务总路线图

生成日期：2026-05-19  
项目路径：`D:\Files\基于LLM的全自动独立游戏互动游戏叙事生成器\narrative-game`  
GitHub 仓库：`https://github.com/Caser-86/storyforge-interactive-narrative`  
目标口径：把 StoryForge 从“能生成剧情的原型”推进到“可交付、可测试、可部署、可灰度的完整互动叙事产品”。

---

## 0. 总结判断

StoryForge 当前已经有可玩的核心闭环：输入一句灵感，生成首幕，玩家选择分支，系统继续生成后续剧情，并支持会话恢复、导出、分享、权限校验和可选场景图。

故事生命周期系统已经初步接入：项目现在支持短篇 / 中篇 / 长篇 / 自定义目标步数，新增了 story arc 阶段推进服务，前端也能展示故事进度和收束状态。原先 `turn >= 12` 的一刀切硬结束已被 `targetTurns`、`currentPhase`、`endingReadiness` 等动态条件替代。

后续最高优先级不是继续堆功能，而是把这套生命周期能力验证扎实：

- [x] 开局确定故事长度：短篇 / 中篇 / 长篇 / 自定义。
- [ ] 开局生成故事目标、章节目标、结局条件。
- [x] 每一步知道自己处于开端、展开、危机、收束、结局哪个阶段。
- [x] 中后段减少新伏笔，强制回收旧伏笔。
- [x] 达到目标或超过最大步数时触发结局状态。
- [x] 前端清楚展示当前进度和是否接近结局。
- [ ] 测试证明故事不会无限续写，也不会突然烂尾。

---

## 1. 交付分级

### 1.1 当前状态：可演示原型

- [x] 文字剧情主流程可用。
- [x] 场景图默认关闭，可选开启。
- [x] 基础 API 契约已整理。
- [x] README 已补充真实截图和项目说明。
- [x] 本地最近一次 `typecheck`、`lint`、`test`、`build` 曾通过。
- [x] 已有 Playwright `text-flow.spec.ts`，但仍需真实稳定跑通和纳入 CI。

### 1.2 内部 Alpha 标准

- [x] 默认无图文字主流程稳定。
- [x] 短篇故事能完整结束，至少 7-12 步形成完整闭环。
- [x] 刷新恢复后可继续推进。
- [x] 导出和分享不泄漏私有 token。
- [x] `npm run typecheck` 通过。
- [x] `npm run lint` 通过。
- [x] `npm test` 通过。
- [x] `npm run build` 通过。
- [x] `npm run test:e2e` 至少通过文字主流程。
- [x] 本地真实 PostgreSQL `db:smoke` 通过。

### 1.3 外部 Beta 标准

- [x] 支持短篇、中篇、长篇三种故事长度。
- [ ] 中篇 20-40 步可稳定推进并自然收束。
- [ ] 长篇 50-100 步有章节结构和上下文压缩。
- [ ] SSE、asset、share、export 权限闭环。
- [ ] Docker compose 能一键启动 app、db、redis、worker。
- [ ] Redis/BullMQ/worker 冒烟通过。
- [ ] R2/S3 对象存储上传通过。
- [ ] 真实 LLM provider 冒烟通过。
- [ ] 内容质量回归集有记录。

### 1.4 正式交付标准

- [ ] 生产部署文档完整。
- [ ] 备份、恢复、回滚方案明确。
- [ ] 成本预算持久化。
- [ ] 隐私说明、数据删除说明、第三方 API 使用说明完整。
- [ ] 关键指标有 P50/P95 监控目标。
- [ ] 有发布检查表和版本 tag。

---

## 2. P0：故事生命周期系统

这是当前最重要的一组任务。完成后，项目才能从“连续生成场景”变成“生成完整故事”。

### P0-1 新增故事长度设定

目标：让每局游戏从开始就知道自己预计多少步结束，而不是写到某个硬编码数字时突然结束。

建议长度：

| 模式 | 推荐步数 | 适用场景 |
|---|---:|---|
| `short` | 7-12 | 快速体验、演示、短篇互动小说 |
| `medium` | 20-40 | 标准可玩故事，一局 20-40 分钟 |
| `long` | 50-100 | 长篇章节剧情，需要强记忆和章节规划 |
| `custom` | 5-120 | 高级设置，允许用户自定义 |

执行步骤：

- [x] 在 `src/lib/schemas.ts` 增加类型：
  - [x] `StoryLengthPreset = "short" | "medium" | "long" | "custom"`。
  - [x] `StoryPhase = "setup" | "development" | "crisis" | "resolution" | "ending"`。
- [x] 在 `StoryState` 增加字段：
  - [x] `storyLengthPreset`
  - [x] `targetTurns`
  - [x] `minTurns`
  - [x] `maxTurns`
  - [x] `currentPhase`
  - [x] `storyGoal`
  - [x] `endCondition`
  - [x] `resolvedThreads`
  - [x] `phaseStartedAtTurn`
  - [x] `endingReadiness`
  - [x] `allowNewThreads`
- [x] 在 `src/lib/api-contracts.ts` 增加创建游戏 options schema：
  - [x] `options.storyLengthPreset`
  - [x] `options.targetTurns`
  - [x] `options.enableImages`
  - [x] `options.visualStyle`
- [x] 在 `src/app/components/StartScreen.tsx` 增加故事长度控件：
  - [x] 默认选 `short`。
  - [x] 展示 `短篇`、`中篇`、`长篇`。
  - [x] 暂时不强制开放 custom，避免 UI 复杂。
- [x] 在 `src/app/api/games/route.ts` 解析故事长度 options。
- [x] 在 `src/lib/story-state-service.ts` 的 `createInitialState()` 根据 preset 初始化目标步数。

验收标准：

- [x] 创建短篇时 `storyState.targetTurns` 在 7-12 范围。
- [x] 创建中篇时 `storyState.targetTurns` 在 20-40 范围。
- [x] 创建长篇时 `storyState.targetTurns` 在 50-100 范围。
- [x] API 返回 meta 或 session state 中能看到长度设定。
- [x] 不传 options 时默认短篇。

### P0-2 新增 story arc 服务

目标：把“阶段推进、结局判断、是否允许新伏笔”从 route 里抽出来，成为可测试的纯逻辑。

建议新文件：`src/lib/story-arc-service.ts`

职责：

- [x] 根据 `turn / targetTurns` 计算当前阶段。
- [x] 根据阶段决定是否允许引入新伏笔。
- [x] 根据阶段决定 prompt 应该偏向铺垫、推进、危机、收束还是结局。
- [x] 根据 `endingPotential / unresolvedThreads / resolvedThreads / turn` 判断是否该结束。
- [x] 给 route 提供统一结果：
  - [x] `phase`
  - [x] `shouldEnd`
  - [x] `mustResolveThreads`
  - [x] `allowNewThreads`

建议函数：

```ts
export function getPhaseForTurn(turn: number, targetTurns: number): StoryPhase
export function getPhaseInstruction(state: StoryState): string
export function shouldForceResolution(state: StoryState): boolean
export function shouldEndStory(state: StoryState): boolean
export function advanceStoryArc(state: StoryState): StoryState
```

阶段比例建议：

| 阶段 | 比例 | 叙事责任 |
|---|---:|---|
| `setup` | 0-20% | 建立人物、地点、主冲突，不急着解释全部真相 |
| `development` | 20-55% | 扩展线索、角色关系、分支后果 |
| `crisis` | 55-75% | 引爆冲突，暴露代价，减少新伏笔 |
| `resolution` | 75-90% | 回收伏笔，明确最终目标，准备结局 |
| `ending` | 90-100% | 生成最终抉择和结局，不再开新线 |

验收标准：

- [x] `turn=1,target=10` 返回 `setup`。
- [x] `turn=6,target=10` 返回 `crisis` 或 `resolution`。
- [x] `turn=9,target=10` 返回 `ending`。
- [x] `turn>=targetTurns` 必须 `shouldEndStory=true`。
- [x] `unresolvedThreads` 太多时 `mustResolveThreads=true`。

### P0-3 改掉固定 12 步硬结束

当前状态：

- 旧版 `src/app/api/games/[sessionId]/choices/route.ts` 中存在固定逻辑：`newState.endingPotential >= 80 || newState.turn >= 12`。
- 当前代码已引入 `advanceStoryArc()`、`shouldEndStory()`，并用 `targetTurns` 替代固定 12 步截断。
- 后续仍需补强：最后一幕必须更明确地写成结局幕，并用 E2E 验证中篇第 13 步仍 active。

整改步骤：

- [x] 在 `choices/route.ts` 中引入 `advanceStoryArc()` 和 `shouldEndStory()`。
- [x] 删除或替换 `newState.turn >= 12`。
- [x] 使用 `newState.turn >= newState.targetTurns` 作为硬上限。
- [x] 使用 `currentPhase === "ending"` 且 `endingReadiness >= 80` 作为软结束。
- [ ] 使用 `storyGoal` 已完成、未解决伏笔数量低于阈值作为自然结束。
- [ ] 在 session ended 前确保最后一幕是结局幕，而不是普通场景。
- [x] 给 `ChoiceResponseSchema` 增加可选字段：
  - [x] `sessionStatus`
  - [x] `storyProgress`
  - [x] `isEnding`

验收标准：

- [ ] 短篇不会超过 `targetTurns`。
- [x] 中篇不会被 12 步截断。
- [x] 长篇不会被 12 步截断。
- [ ] 到达结局后，继续选择返回 session inactive 或前端不再显示选择。
- [ ] 最后一幕正文明确是结局，不是普通过场。

### P0-4 Prompt 接入阶段指令

目标：LLM 每一步都知道当前故事阶段，避免一直引入新冲突导致有头无尾。

修改文件：`src/lib/prompts.ts`

执行步骤：

- [x] `buildUserPrompt()` 增加参数：
  - [x] `storyPhase`
  - [x] `targetTurns`
  - [x] `remainingTurns`
  - [x] `phaseInstruction`
  - [x] `allowNewThreads`
  - [x] `mustResolveThreads`
- [ ] `SYSTEM_PROMPT` 增加长篇规则：
  - [ ] `setup` 阶段允许建立冲突。
  - [ ] `development` 阶段允许扩展分支，但必须承接旧选择。
  - [ ] `crisis` 阶段必须暴露代价和核心矛盾。
  - [ ] `resolution` 阶段禁止引入重要新主线伏笔。
  - [ ] `ending` 阶段必须生成结局，不再输出普通分支。
- [x] 当 `remainingTurns <= 3` 时，prompt 明确要求：
  - [x] 回收至少 1 个旧伏笔。
  - [x] 不引入新关键 NPC。
  - [x] choices 必须导向结局差异。
- [x] 当 `remainingTurns <= 1` 时，prompt 明确要求：
  - [x] 当前幕就是结局幕。
  - [x] 正文交代玩家选择造成的结果。
  - [ ] 选择可以为空或变为“重新开始/导出/分享”的 UI 行为。

验收标准：

- [ ] `buildUserPrompt()` 单测覆盖不同 phase。
- [x] `turn` 接近结局时 prompt 包含“禁止引入重要新伏笔”。
- [ ] `ending` 阶段生成内容中包含结局语义。
- [ ] 长篇中段仍允许新分支，但必须保留主目标。

### P0-5 完整故事结局结构

目标：让故事结束时可导出一个完整故事，而不是最后停在普通场景。

建议增加状态字段：

- [ ] `endingType`
  - [ ] `success`
  - [ ] `bittersweet`
  - [ ] `failure`
  - [ ] `open`
- [ ] `endingSummary`
- [ ] `finalChoiceId`
- [ ] `resolvedThreads`
- [ ] `unresolvedThreads`

执行步骤：

- [ ] 在最后一幕根据状态变量判断结局类型。
- [ ] `danger_level` 高、`trust` 低时更容易失败或苦涩结局。
- [ ] `knownFacts` 多、关键 NPC 关系高时更容易成功结局。
- [ ] 结局正文必须引用至少 2 个早期选择或关键事实。
- [ ] 导出 Markdown 末尾增加“结局摘要”。
- [ ] 分享页显示“已完结”状态。
- [ ] 前端结局后隐藏选择按钮，显示：
  - [ ] 导出
  - [ ] 分享
  - [ ] 新故事

验收标准：

- [ ] 短篇 7-12 步内一定出现结局。
- [ ] 结局不是突然停写。
- [ ] 结局能引用历史选择。
- [ ] 分享页能看到已完结状态。

---

## 3. P0：质量门和基础稳定性

### P0-6 全量命令重新验证

执行命令：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

验收标准：

- [ ] 四条命令全部通过。
- [ ] 如果 `typecheck` 与 `build` 并行会因 `.next/types` 冲突失败，文档写明顺序执行。
- [ ] 把最新输出记录到路线图或发布记录。

### P0-7 Playwright 文字主流程稳定

现状：已有 `e2e/text-flow.spec.ts`。

继续任务：

- [x] 检查是否依赖真实 LLM，若依赖，改成稳定 mock 或测试 provider。
- [ ] 增加短篇完整结束 E2E：
  - [ ] 创建短篇。
  - [ ] 连续选择直到结束。
  - [ ] 验证 session status 为 ended。
  - [ ] 验证前端显示结局操作。
- [ ] 增加中篇不被 12 步截断 E2E：
  - [ ] 创建中篇。
  - [ ] 推进到第 13 步。
  - [ ] 验证仍 active。
- [ ] 增加刷新恢复 E2E：
  - [ ] 推进 3 步。
  - [ ] 刷新。
  - [ ] 再推进 1 步。
- [ ] 增加无图断言：
  - [ ] 默认不开图。
  - [ ] 不请求 `/api/assets/*`。
  - [ ] 不显示画面 Tab。

验收标准：

- [ ] `npm run test:e2e -- text-flow` 通过。
- [ ] E2E 不依赖真实图片 provider。
- [ ] E2E 可在 CI headless 跑。

### P0-8 真实 PostgreSQL 冒烟

执行步骤：

- [ ] 启动 PostgreSQL。
- [ ] 配置 `DATABASE_URL`。
- [ ] 执行 `npm run db:init`。
- [ ] 再执行一次 `npm run db:init` 验证幂等。
- [ ] 执行 `npm run db:smoke`。
- [ ] 检查 9 个表都存在：
  - [ ] `_migrations`
  - [ ] `users`
  - [ ] `game_sessions`
  - [ ] `scenes`
  - [ ] `choices`
  - [ ] `asset_jobs`
  - [ ] `asset_versions`
  - [ ] `llm_logs`
  - [ ] `asset_logs`
- [ ] 检查 migration version 9 已应用。
- [ ] 检查 `ON DELETE CASCADE` 生效。

验收标准：

- [ ] 空库可初始化。
- [ ] 重复初始化不报错。
- [ ] smoke 能创建、推进、清理测试数据。

---

## 4. P1：叙事质量和分支质量

### P1-1 选择差异度强化

现状：

- `narrative-quality.ts` 已有 `checkChoiceSimilarity()`、`checkRiskCoverage()`、`checkStateEffectsDifference()`。
- `generateNarrative()` 已能在 `shouldRetry` 时重试。

继续任务：

- [ ] 给每个 choice 增加路线类型：
  - [ ] `investigate`
  - [ ] `act`
  - [ ] `social`
  - [ ] `stealth`
  - [ ] `sacrifice`
- [ ] 如果不改 schema，则把路线类型写入 `intent`。
- [ ] 增加质量检查：
  - [ ] 三个 choice 的 `risk` 必须覆盖 low/medium/high。
  - [ ] 三个 choice 的 stateEffects key 不应完全相同。
  - [ ] 三个 choice 的 preview 不应只是同义句。
  - [ ] 至少一个 choice 应推进主线。
  - [ ] 至少一个 choice 应暴露代价。
- [ ] 质量失败时 retry prompt 写清失败项。

验收标准：

- [ ] 30 条 prompt 回归中，选择相似度失败率 <= 5%。
- [ ] 人工抽查 10 局，每局 5 步，能明显感到分支差异。

### P1-2 记忆连续性强化

继续任务：

- [ ] 把 `memorySummary` 从纯文本升级为结构化记忆，或在 `statePatch` 中严格维护：
  - [ ] `knownFacts`
  - [ ] `unresolvedThreads`
  - [ ] `resolvedThreads`
  - [ ] `lastChoiceImpact`
  - [ ] `npcRelations`
- [ ] `compressContext()` 增加：
  - [ ] 当前阶段。
  - [ ] 剩余步数。
  - [ ] 故事目标。
  - [ ] 结局条件。
- [ ] `applyChoiceEffects()` 去重并限制：
  - [ ] `knownFacts` 最多 30 条。
  - [ ] `unresolvedThreads` 最多 10 条。
  - [ ] `resolvedThreads` 最多 30 条。
  - [ ] `inventory` 最多 30 条。
- [ ] 中后期如果 `unresolvedThreads > 5`，强制回收，不许继续新增。

验收标准：

- [ ] 连续 20 步后主目标仍可在状态中读到。
- [ ] 重要 NPC 不会无故消失。
- [ ] 已解决线索从 `unresolvedThreads` 移到 `resolvedThreads`。
- [ ] 导出能看到关键选择影响。

### P1-3 Prompt 回归集

建立 `src/lib/test-prompts.ts` 或独立 fixture。

测试覆盖：

- [x] 赛博朋克侦探。
- [x] 暗黑奇幻。
- [x] 恐怖悬疑。
- [x] 科幻探索。
- [x] 蒸汽朋克。
- [x] 末日废土。
- [x] 宫廷权谋。
- [x] 民俗怪谈。
- [x] 校园悬疑。
- [x] 儿童友好。
- [x] 中文。
- [x] 英文。
- [x] 日文。
- [x] G/PG/PG-13/R 分级。
- [x] 短篇。
- [x] 中篇。
- [x] 长篇。

记录指标：

- [x] schema pass rate。
- [x] retry rate。
- [x] fallback rate。
- [x] 平均生成时间。
- [ ] 选择相似度失败率。
- [ ] 未引用伏笔次数。
- [ ] 结局自然度人工评分。

验收阈值：

- [ ] schema pass rate >= 98%。
- [ ] fallback rate <= 5%。
- [ ] 选择相似度失败率 <= 5%。
- [ ] 人工平均分 >= 4/5。

---

## 5. P1：权限、安全、分享、导出

### P1-4 SSE 权限闭环

继续任务：

- [ ] 确认 `events-token` 使用 `owner_token`，不用旧字段。
- [ ] `GET /api/games/[sessionId]/events` 必须校验 stream token。
- [ ] stream token 只允许对应 session。
- [ ] stream token 60-120 秒过期。
- [ ] EventSource URL 只带 stream token，不带 owner token。
- [ ] 过期后前端重新申请 stream token。

验收标准：

- [ ] 无 token 403。
- [ ] 错 token 403。
- [ ] 过期 token 403。
- [ ] 正 token 可收到状态。

### P1-5 share token 安全

继续任务：

- [ ] share token hash 存储，不存明文。
- [ ] 增加 `share_expires_at` 策略。
- [ ] 增加撤销分享接口或重新生成策略。
- [ ] 分享页只读，不返回 `session.id`。
- [ ] 分享页不返回 owner token、raw model JSON、内部 state。
- [ ] R 级内容禁止分享的 E2E 验证。

验收标准：

- [ ] 知道 share token 只能读 replay。
- [ ] 不能用 share token 推进故事。
- [ ] 不能通过分享页拿到私有 session 操作能力。

### P1-6 导出安全和完整性

继续任务：

- [ ] JSON 导出包含完整剧情、选择、已选路径、结局摘要。
- [ ] Markdown 导出包含：
  - [ ] 标题。
  - [ ] 开局灵感。
  - [ ] 每幕标题。
  - [ ] 正文。
  - [ ] NPC 对话。
  - [ ] 玩家选择。
  - [ ] 状态变化。
  - [ ] 结局摘要。
- [ ] 导出不包含：
  - [ ] owner token。
  - [ ] stream token。
  - [ ] provider key。
  - [ ] raw model JSON。
  - [ ] prompt hash。
- [ ] 大故事导出时避免响应过大：
  - [ ] 先支持 100 步以内。
  - [ ] 后续再做流式导出。

验收标准：

- [ ] 短篇导出可读。
- [ ] 中篇导出完整。
- [ ] 长篇导出不超时。

---

## 6. P1：前端产品体验

### P1-7 开局页

继续任务：

- [ ] 增加故事长度选择。
- [ ] 增加“预计步数”提示。
- [ ] 保持场景图开关默认关闭。
- [ ] 长篇模式提示“需要更长生成时间和更多 token”。
- [ ] 开始按钮 loading 时禁用重复点击。
- [x] 模板选择后自动填入灵感，但不覆盖用户已输入内容，除非用户确认。

验收标准：

- [ ] 用户能明确选择短篇/中篇/长篇。
- [ ] 默认配置适合最快体验。
- [ ] 移动端不溢出。

### P1-8 故事页

继续任务：

- [x] 显示当前故事阶段。
- [x] 显示进度：`第 X / 目标 Y 步`。
- [x] 接近结局时显示“故事正在收束”。
- [x] 已完结时隐藏 choices。
- [x] 已完结时显示导出、分享、新故事。
- [ ] 历史选择时间线可展开/收起。
- [ ] 状态变化只展示重要变化，避免噪音。
- [ ] NPC 对话视觉层级更强。

验收标准：

- [x] 用户知道故事不是无限生成。
- [x] 用户能感知自己接近结局。
- [x] 结局后 UI 不再允许继续普通选择。

### P1-9 错误恢复

继续任务：

- [ ] 创建游戏失败可重试。
- [ ] 选择推进失败可重试。
- [ ] 重试不重复写入历史。
- [ ] duplicate choice 返回后尝试恢复当前 session。
- [ ] 错误页显示 `message` 和 `traceId`。
- [ ] 错误页提供复制 traceId。

验收标准：

- [ ] LLM 偶发失败不会让用户丢局。
- [ ] 刷新后能恢复。
- [ ] 错误信息可定位。

---

## 7. P2：图片附属模块

图片是附属能力，不阻塞文字主线。

### P2-1 开启图片完整链路

- [ ] 开局勾选“场景图”。
- [ ] 创建游戏返回 `imageJobId`。
- [ ] DB 写入 `asset_jobs`。
- [ ] BullMQ 收到 job。
- [ ] worker 消费 job。
- [ ] provider 返回图片。
- [ ] 上传 R2/S3。
- [ ] 前端收到 completed。
- [ ] 图片失败时故事可继续。

### P2-2 R2/S3 对象存储

现状：`@aws-sdk/client-s3` 已在依赖中。

继续任务：

- [ ] 确认 `src/lib/object-storage.ts` 使用标准 `PutObjectCommand`。
- [ ] 配置 `R2_ENDPOINT`。
- [ ] 配置 `R2_ACCESS_KEY_ID`。
- [ ] 配置 `R2_SECRET_ACCESS_KEY`。
- [ ] 配置 `R2_BUCKET`。
- [ ] 配置 `R2_PUBLIC_URL`。
- [ ] 上传失败时记录 `asset_logs`。
- [ ] health 显示 storage 状态。

验收标准：

- [ ] 上传小 PNG 成功。
- [ ] public URL 可访问。
- [ ] provider 临时 URL 不作为最终交付 URL。

### P2-3 图片成本治理

- [ ] `ENABLE_IMAGE_GENERATION=false` 保持生产默认。
- [ ] 每日图片数量限制持久化。
- [ ] 超出预算时拒绝新图片任务。
- [ ] 文字剧情继续可用。
- [ ] README 写清图片会产生额外成本。

---

## 8. P2：部署、CI、观测

### P2-4 CI

- [x] `.github/workflows/ci.yml` 跑：
  - [x] `npm run typecheck`
  - [x] `npm run lint`
  - [x] `npm test`
  - [x] `npm run build`
- [x] 增加 PostgreSQL service job。
- [x] 增加 `npm run db:smoke`。
- [x] 增加 Playwright job，先跑文字主流程。
- [x] CI 中默认 `ENABLE_IMAGE_GENERATION=false`。

### P2-5 Docker

- [x] `docker compose build`。
- [x] `docker compose up -d`。
- [x] app health ok。
- [x] db health ok。
- [x] redis health ok。
- [x] worker health ok。
- [x] 无图模式不需要 worker 也能创建文字故事。
- [x] 开图模式 worker 停止时图片失败但剧情可继续。

### P2-6 观测

- [x] `llm_logs` 落库完整。
- [x] `asset_logs` 落库完整。
- [x] `/api/stats` 从 DB 聚合，不只看内存。
- [x] `/api/stats/cost` 需要 admin token。
- [x] traceId 贯穿 API、日志、前端错误页。
- [ ] health 不泄漏 secrets。

---

## 9. P3：正式交付准备

### P3-1 隐私和合规

- [ ] 隐私说明页面。
- [ ] 数据删除说明。
- [ ] 第三方 API 使用说明。
- [ ] localStorage owner token 风险说明。
- [ ] 分享链接可见范围说明。
- [ ] 内容分级策略说明。

### P3-2 发布和回滚

- [ ] 版本 tag 规则。
- [ ] Release note 模板。
- [ ] DB migration 前备份。
- [ ] DB migration 回滚说明。
- [ ] Docker 镜像版本固定。
- [ ] app/worker 版本兼容说明。

### P3-3 文档

- [ ] README 补充故事长度系统。
- [ ] README 补充结局机制。
- [ ] README 补充 Docker smoke 真实结果。
- [ ] README 补充 R2/S3 配置。
- [ ] 新增 `docs/DEPLOYMENT.md`。
- [ ] 新增 `docs/OPERATIONS.md`。
- [ ] 新增 `docs/STORY_DESIGN.md`。

---

## 10. 文件级修改清单

### `src/lib/schemas.ts`

- [ ] 增加 `StoryLengthPreset`。
- [ ] 增加 `StoryPhase`。
- [ ] 扩展 `StoryState`。
- [ ] 如需要，增加 `StoryProgressSchema`。

### `src/lib/story-state-service.ts`

- [ ] `createInitialState()` 支持 story length options。
- [ ] `applyChoiceEffects()` 更新 resolved/unresolved threads。
- [ ] `compressContext()` 增加故事阶段、剩余步数、故事目标。
- [ ] 数组去重和长度限制覆盖新增字段。

### `src/lib/story-arc-service.ts`

- [ ] 新建文件。
- [ ] 实现 phase 计算。
- [ ] 实现结束判断。
- [ ] 实现收束判断。
- [ ] 实现阶段提示文本。
- [ ] 增加单元测试。

### `src/lib/prompts.ts`

- [ ] `buildUserPrompt()` 接收 story arc 参数。
- [ ] `SYSTEM_PROMPT` 增加阶段规则。
- [ ] `SYSTEM_PROMPT` 增加长篇收束规则。
- [ ] `RETRY_PROMPT` 增加质量问题修复能力。

### `src/lib/narrative-service.ts`

- [ ] 调用 `getPhaseInstruction()`。
- [ ] 把 phase 信息传入 prompt。
- [ ] 对结局阶段使用更严格质量检查。
- [ ] 记录 phase、targetTurns、retry reason。

### `src/app/api/games/route.ts`

- [ ] 解析 `options.storyLengthPreset`。
- [ ] 解析 `options.targetTurns`。
- [ ] 创建初始 story arc state。
- [ ] 返回 meta 中的 story progress。

### `src/app/api/games/[sessionId]/choices/route.ts`

- [ ] 替换固定 12 步结束。
- [ ] 使用 `shouldEndStory()`。
- [ ] 结局幕写入 session ended。
- [ ] 返回 story progress。
- [ ] ended 后不再创建普通 choices。

### `src/app/components/StartScreen.tsx`

- [ ] 增加故事长度选择。
- [ ] 默认短篇。
- [ ] 长篇提示 token 成本。
- [ ] 保持场景图默认关闭。

### `src/app/page.tsx`

- [ ] 传递 story length options。
- [ ] 已完结状态切换 UI。
- [ ] 显示故事进度。

### `src/app/components/StoryPanel.tsx`

- [ ] 显示当前 phase。
- [ ] 显示目标步数。
- [ ] 显示结局提示。
- [ ] ended 时隐藏选择或显示结局操作。

### `src/app/components/ChoiceList.tsx`

- [ ] ended 时不显示可点击选项。
- [ ] loading 时防重复提交。
- [ ] 选择卡片展示路线差异。

### `src/lib/api-contracts.ts`

- [ ] 增加 story progress schema。
- [ ] create response 增加 progress。
- [ ] choice response 增加 progress/sessionStatus。

### `src/__tests__/story-state-service.test.ts`

- [ ] 覆盖短篇初始化。
- [ ] 覆盖中篇初始化。
- [ ] 覆盖长篇初始化。
- [ ] 覆盖 resolvedThreads 去重。

### `src/__tests__/story-arc-service.test.ts`

- [ ] 新建测试。
- [ ] 覆盖 phase 计算。
- [ ] 覆盖 hard end。
- [ ] 覆盖 soft end。
- [ ] 覆盖 mustResolveThreads。

### `src/__tests__/api-games.test.ts`

- [ ] 创建游戏时传 `storyLengthPreset`。
- [ ] 验证 state 中 targetTurns。
- [ ] 验证默认短篇。

### `src/__tests__/api-choices-session.test.ts`

- [ ] 中篇第 13 步不 ended。
- [ ] 短篇超过 targetTurns ended。
- [ ] ended session 再选择返回错误。

### `e2e/text-flow.spec.ts`

- [ ] 加短篇完整结束。
- [ ] 加中篇不被 12 步截断。
- [ ] 加结局后 UI。

### `README.md`

- [x] 补充故事长度系统。
- [x] 补充完整结局机制。
- [x] 补充“不会无限执行”的说明。

---

## 11. 推荐执行顺序

### Sprint 1：故事生命周期，2-3 天

- [ ] 扩展 `StoryState`。
- [ ] 新建 `story-arc-service.ts`。
- [ ] 改 create API 支持故事长度。
- [ ] 改 choices API 替换 12 步硬结束。
- [ ] 改 prompt 接入阶段指令。
- [ ] 补单元测试。
- [ ] 跑 `npm run typecheck`、`npm run lint`、`npm test`。

### Sprint 2：前端故事进度，1-2 天

- [ ] 开局页增加短/中/长选择。
- [ ] 故事页显示进度和阶段。
- [ ] 结局页操作补齐。
- [ ] 移动端检查。
- [ ] 跑 Playwright 文字主流程。

### Sprint 3：结局和导出，1-2 天

- [ ] 结局幕生成规则。
- [ ] 导出增加结局摘要。
- [ ] 分享页显示已完结。
- [ ] ended session 权限和行为测试。

### Sprint 4：基础设施冒烟，2-3 天

- [ ] PostgreSQL smoke。
- [ ] Docker smoke。
- [ ] Redis/worker smoke。
- [ ] CI 增加质量门。

### Sprint 5：长篇质量，3-5 天

- [ ] 30 条 prompt 回归。
- [ ] 中篇 20-40 步测试。
- [ ] 长篇 50-100 步抽样测试。
- [ ] 伏笔回收评分。
- [ ] 人工质量表。

### Sprint 6：图片附属链路，2-4 天

- [ ] 图片开启 E2E。
- [ ] R2/S3 上传。
- [ ] BFL smoke。
- [ ] 图片成本治理。

### Sprint 7：Beta 准备，2-4 天

- [ ] 隐私文档。
- [ ] 部署文档。
- [ ] 备份回滚。
- [ ] Release checklist。
- [ ] GitHub release tag。

---

## 12. 每轮开发固定检查

每次改代码后执行：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

涉及 UI 后额外执行：

```bash
npm run test:e2e -- text-flow
```

涉及 DB 后额外执行：

```bash
npm run db:init
npm run db:smoke
```

涉及图片后额外执行：

```bash
npm run worker
```

---

## 13. 建议模型和强度

用于后续修改本项目本身：

- [ ] 故事生命周期、状态机、结束机制：`GPT-5.5`，reasoning `high`。
- [ ] Prompt 质量、长篇收束、结局设计：`GPT-5.5`，reasoning `high`。
- [ ] 普通代码补丁、测试修复、README 更新：`GPT-5.4` 或 `GPT-5.5`，reasoning `medium`。
- [ ] 简单文档润色：`GPT-5.4-mini`，reasoning `low` 或 `medium`。

本项目下一步建议使用：`GPT-5.5 + high`。

原因：故事生命周期改造涉及状态机、prompt、API 契约、前端 UI、测试和产品边界，属于结构性改造，不是普通小修。

---

## 14. 立刻要做的第一批任务

按优先级执行：

1. [x] 新建 `src/lib/story-arc-service.ts`。
2. [x] 扩展 `StoryState` 支持 `storyLengthPreset`、`targetTurns`、`currentPhase`、`storyGoal`、`endCondition`。
3. [x] 改 `createInitialState()` 初始化短/中/长篇。
4. [x] 改 `choices/route.ts`，替换 `turn >= 12`。
5. [x] 改 `prompts.ts`，传入阶段和剩余步数。
6. [ ] 加 `story-arc-service.test.ts`。
7. [x] 加 API 测试：中篇第 13 步仍 active。
8. [x] 前端开局页加长度选择。
9. [x] 故事页显示进度。
10. [x] 短篇完整结束 E2E。
11. [x] 更新 README。
12. [ ] 跑全量质量门。

---

## 15. 最终完成定义

项目可视为“基本完工”时，必须同时满足：

- [x] 用户能选择短篇、中篇、长篇。
- [ ] 短篇能自然完整结束。
- [x] 中篇不会被 12 步截断。
- [x] 长篇有阶段推进和上下文压缩，不会无限开新伏笔。
- [ ] 结局能引用历史选择。
- [ ] 已完结故事可分享、可导出。
- [ ] 默认无图主流程不依赖 Redis/worker。
- [ ] 开图模式失败不影响文字剧情。
- [ ] 四个本地质量门全绿。
- [ ] 文字主流程 E2E 通过。
- [ ] PostgreSQL smoke 通过。
- [x] README 能解释项目怎么运行、怎么结束、怎么部署。

达到这些，StoryForge 才不只是"能生成剧情"，而是一个有头、有身、有尾、能交付的互动叙事产品。

---

## 16. 真实 LLM 端到端测试记录

测试日期：2026-05-19  
LLM Provider: DeepSeek V4 Flash (`deepseek-v4-flash`)  
Base URL: `https://api.deepseek.com`

### 9.1 Smoke Test

- Fallback narrative: ✅ 通过
- Real LLM call: ✅ 通过 (19199ms, 0 retries)

### 9.2 API 端到端测试

| 测试 | 结果 | LLM 延迟 | Fallback | 备注 |
|---|---|---|---|---|
| 创建游戏 (赛博朋克侦探) | ✅ | 18556ms | No | 3 choices, 1 NPC |
| 创建游戏 (中世纪魔法学院) | ✅ | 15343ms | No | 3 choices, 1 NPC |
| 创建游戏 (海底探险) | ✅ | 17515ms | No | 3 choices, 1 NPC |
| 选择推进 (海底探险 Turn1→Turn2) | ✅ | 19020ms | No | "数据回传：沉船的秘密" |
| 创建游戏 (深海冒险-en) | ⚠️ | 58030ms | Yes | 超时 fallback |

### 9.3 聚合指标 (24h)

| 指标 | 值 |
|---|---|
| 总 LLM 调用 | 20 |
| 成功率 | 75% (15/20) |
| Fallback 率 | 25% (5/20) |
| 平均延迟 | 15,325ms |
| P50 延迟 | 15,271ms |
| P95 延迟 | 19,979ms |
| 平均重试次数 | 0.95 |
| 总 tokens | 60,541 (输入 36,953 + 输出 23,588) |
| 新建会话 | 14 |

### 9.4 改进项

- DeepSeek V4 Flash 英文提示词偶尔超时 (>58s)，中文提示词稳定在 15-20s
- 建议增加 OpenAI client timeout 设置 (默认无超时)
- Fallback 率 25% 偏高，主要因超时导致，建议设置 30s timeout + retry
