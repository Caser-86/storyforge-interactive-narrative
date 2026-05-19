# StoryForge 项目深度审查与后续整改路线图

审查日期：2026-05-19  
项目路径：`D:\Files\基于LLM的全自动独立游戏互动游戏叙事生成器\narrative-game`

## 1. 当前结论

本轮重点检查了“风格模板打不开”、文字剧情主流程、故事长度控制、故事收束、恢复继续、API 契约、测试稳定性和本地可运行性。

当前项目已经具备可测试的文字互动叙事主流程：

- 首页可输入灵感并开始冒险。
- 默认关闭生图功能。
- 可选择风格模板。
- 可选择短篇、中篇、长篇故事长度。
- 可根据选择推进后续剧情分支。
- 可在目标步数附近收束并生成结局。
- 可恢复已有会话并继续推进。
- 本地 mock 模式下端到端测试已经跑通。

但距离“可交付上线”仍需要完成真实数据库、真实 LLM、真实部署、安全配置、监控、成本控制和文档校准。

## 2. 本轮已修复问题

### 2.1 风格模板在 `127.0.0.1:3000` 打不开

问题表现：

- `localhost:3000` 可以点击“选择风格模板”。
- `127.0.0.1:3000` 页面能显示，但 React 事件没有正常接管，点击模板按钮无反应。

根因：

- Next.js dev server 默认只允许初始化 hostname 的开发资源请求。
- 使用 `127.0.0.1` 访问时，开发资源和 HMR origin 受限，导致页面事件表现异常。

已修复：

- 在 `next.config.ts` 增加：

```ts
allowedDevOrigins: ["127.0.0.1"]
```

验证结果：

- `http://127.0.0.1:3000` 可展开 8 个模板。
- `http://localhost:3000` 可展开 8 个模板。
- 两个地址中输入灵感后，“开始冒险”按钮都能正常启用。

### 2.2 模板选择没有同步故事长度

问题表现：

- 模板数据中包含 `lengthPreset`。
- 用户选择某个模板后，只填入 prompt 和视觉风格，没有同步短篇/中篇/长篇。

已修复：

- 新增 `applyTemplate()`。
- 选择模板时同步：
  - `samplePrompt`
  - `visualStyle`
  - `lengthPreset`
- 增加 `data-testid="template-toggle"` 和模板卡片测试标识，便于 E2E 稳定定位。

验证结果：

- 选择 `cyberpunk-noir` 后，中篇按钮会自动选中。

### 2.3 创建游戏后第一幕没有完整故事进度

问题表现：

- `/api/games/[sessionId]/choices` 会返回 `storyProgress`。
- `/api/games` 创建第一幕时原先没有返回初始 `storyProgress`。
- 前端 store 创建会话后没有设置初始进度条。

已修复：

- `CreateGameResponseSchema` 支持 `storyProgress`。
- `POST /api/games` 返回：
  - `turn`
  - `targetTurns`
  - `currentPhase`
  - `endingReadiness`
- `src/lib/store.ts` 在 `createGame()` 成功后写入 `storyProgress`。

验证结果：

- 创建短篇、中篇、长篇后，第一幕即可显示目标步数。
- E2E 已覆盖 20-40 步、50-100 步范围验证。

### 2.4 健康检查接口类型检查失败

问题表现：

- `npm run typecheck` 报错：

```text
src/app/api/health/route.ts: Cannot find name 'isWithinBudget'
```

已修复：

- 补充 `isWithinBudget` import。
- 健康检查预算信息恢复正常。

### 2.5 本地数据库未启动导致 `/api/games` 返回 500

问题表现：

- 本地 `.env.local` 配置了 `DATABASE_URL`。
- PostgreSQL 未运行时，健康检查 database 为 error。
- 点击开始冒险会触发 `/api/games` 500。

已修复：

- 增加 `USE_MEMORY_DB=true` 开关。
- 当本地只需要 smoke test / E2E 时，可以强制使用内存数据库。
- `.env.example` 增加 `USE_MEMORY_DB=true` 示例。

当前本地测试启动方式：

```powershell
cmd /c "set USE_MEMORY_DB=true&& set MOCK_LLM=true&& set DISABLE_REDIS=true&& set IMAGE_PROVIDER=mock&& npm run dev -- --port 3000"
```

当前健康检查结果：

- HTTP 200。
- database: ok。
- redis: disabled。
- overall status: degraded。

说明：

- degraded 是因为本地文字主流程禁用了 Redis。
- 真实部署不能依赖 `USE_MEMORY_DB=true`，必须使用 PostgreSQL。

### 2.6 内存数据库迁移版本落后

问题表现：

- 真实迁移已有 10 个版本。
- `memoryInitDb()` 只标记到 8。

已修复：

- 内存数据库迁移标记更新为 `[1,2,3,4,5,6,7,8,9,10]`。

### 2.7 恢复会话没有恢复故事进度

问题表现：

- 刷新页面能恢复当前场景。
- 但 `storyProgress` 和 `isEnding` 没有从 `session.state` 恢复。

已修复：

- `loadSession()` 从 `session.state` 读取：
  - `turn`
  - `targetTurns`
  - `currentPhase`
  - `endingReadiness`
- 会话状态为 `ended` 或阶段为 `ending` 时，前端恢复为结束态。

### 2.8 E2E 测试不稳定

问题表现：

- 桌面布局和移动布局同时存在 DOM，测试选择器命中隐藏 DOM。
- mock LLM 每幕标题可能相同，旧测试用标题变化判断新幕生成，导致超时。

已修复：

- E2E 选择器改为 `:visible` 或 `.first()`。
- 分支推进测试改为等待 `/choices` 接口响应。
- 选择按钮改为定位可见且未禁用按钮。

验证结果：

```text
npx playwright test e2e/text-flow.spec.ts --reporter=list
24 passed
```

## 3. 本轮验证记录

已执行并通过：

```text
npm run typecheck
通过

npm run lint
通过

npm run test
19 files passed
209 tests passed

npx playwright test e2e/text-flow.spec.ts --reporter=list
24 tests passed
```

已手工/脚本验证：

- `http://127.0.0.1:3000` 模板展开正常。
- `http://localhost:3000` 模板展开正常。
- 模板选择会同步故事长度。
- `/api/health` 在本地 memory/mock 模式下返回 HTTP 200。
- `/api/games` 在本地 memory/mock 模式下返回 HTTP 200。

当前可测试地址：

- `http://localhost:3000`
- `http://127.0.0.1:3000`

## 4. 仍需整改的 P0 任务：交付前必须完成

### P0-1. 真实 PostgreSQL 联调

目标：

- 确保脱离内存数据库后，真实 PostgreSQL 能完整支撑创建、选择、恢复、导出、分享。

执行步骤：

1. 启动 PostgreSQL。
2. 配置真实 `DATABASE_URL`。
3. 执行 `npm run db:init`。
4. 执行 `npm run db:smoke`。
5. 启动项目，不设置 `USE_MEMORY_DB=true`。
6. 访问 `/api/health`，要求 database 为 `ok`。
7. 创建一局短篇故事。
8. 连续选择至少 12 次。
9. 刷新页面，确认恢复当前进度。
10. 导出 JSON 和 Markdown。
11. 创建分享链接并打开分享页。
12. 删除或归档测试会话，确认级联数据不残留。

验收标准：

- `/api/health` 不因数据库连接失败返回 503。
- `/api/games` 不返回 500。
- 所有 migration 在空库和已有库上都能重复执行。
- `game_sessions.state_json` 中故事进度持续更新。

### P0-2. 真实 LLM 联调

目标：

- 验证真实模型输出能长期稳定满足 JSON Schema、故事弧线和安全要求。

执行步骤：

1. 配置真实 `OPENAI_API_KEY` 或兼容供应商 key。
2. 配置 `OPENAI_BASE_URL`。
3. 配置 `OPENAI_MODEL`。
4. 运行 `npm run llm:smoke`。
5. 用中文短篇跑 12 步。
6. 用中文中篇跑 20 步以上。
7. 用英文短篇跑 8 步。
8. 用日文短篇跑 8 步。
9. 检查是否出现 JSON 解析失败。
10. 检查是否出现 3 个选项重复、无意义、没有风险区分。
11. 检查结局是否能在目标步数附近收束。
12. 检查 LLM 超时、预算超限、供应商报错时是否回退可用。

验收标准：

- 真实模型至少连续 30 次生成无 schema crash。
- 每个场景都有 3 个可选行动。
- 选项能推动不同方向。
- 短篇不会无限拖长。
- 中篇不会过早结束。
- 长篇不会在早期强行收束。

### P0-3. 生产环境安全配置

目标：

- 防止 token、管理接口、分享链接和密钥泄露。

执行步骤：

1. 确认 `.env`、`.env.local` 未被 Git 跟踪。
2. 确认 `.gitignore` 保留 `.env*`。
3. 如果任何真实 key 曾经被截图、日志、提交、聊天记录暴露，立即轮换。
4. 生产环境必须设置 `TOKEN_SALT`。
5. 生产环境必须设置 `ADMIN_TOKEN`。
6. `/api/stats` 在生产环境必须校验管理 token。
7. owner token 只保存 hash，不保存明文。
8. 分享 token 需要过期策略。
9. 需要给导出接口、分享接口补充滥用限制。
10. 错误响应不能暴露供应商原始密钥、连接串或堆栈。

验收标准：

- `git ls-files -- .env .env.local` 输出为空。
- 生产 `/api/health` 不提示 `TOKEN_SALT` 或 `ADMIN_TOKEN` 缺失。
- 任意非 owner 请求无法读取私有会话。

### P0-4. CI 必须稳定覆盖本地 smoke 流程

目标：

- 每次提交都能自动验证文字主流程不坏。

执行步骤：

1. CI 中设置：
   - `USE_MEMORY_DB=true`
   - `MOCK_LLM=true`
   - `DISABLE_REDIS=true`
   - `IMAGE_PROVIDER=mock`
2. CI 运行：
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
   - `npx playwright test e2e/text-flow.spec.ts`
3. 保存 Playwright trace 作为失败 artifact。
4. 禁止 CI 使用真实 LLM key 跑常规 PR。
5. 单独建立手动触发的 real-LLM smoke workflow。

验收标准：

- 干净环境 clone 后 CI 一次通过。
- E2E 不依赖本机 PostgreSQL。
- E2E 不依赖真实 LLM。

## 5. P1 任务：交付质量增强

### P1-1. README 需要补充本地测试模式

需要补充：

- `USE_MEMORY_DB=true` 的用途。
- `MOCK_LLM=true` 的用途。
- 本地快速测试命令。
- 真实部署不能使用内存库。
- Redis disabled 时 health 为 degraded 属于本地文字模式正常现象。

建议加入命令：

```powershell
cmd /c "set USE_MEMORY_DB=true&& set MOCK_LLM=true&& set DISABLE_REDIS=true&& set IMAGE_PROVIDER=mock&& npm run dev -- --port 3000"
```

### P1-2. 健康检查错误信息需要更清晰

当前问题：

- PostgreSQL 连接失败时，health 中 database error 可能是空字符串。

整改步骤：

1. 捕获数据库错误时输出 `error.name`。
2. 如果 `error.message` 为空，输出固定文案。
3. 增加 `details`：
   - 是否配置 `DATABASE_URL`
   - 当前是否 `USE_MEMORY_DB`
   - 是否生产环境
4. 不输出完整连接串。

验收标准：

- 用户看到 health 失败时能知道是“数据库未启动/连接被拒绝/认证失败/迁移缺失”。

### P1-3. 故事恢复应补充测试

当前已修复恢复进度，但需要补测试。

新增测试建议：

1. 创建短篇。
2. 推进 3 步。
3. 保存当前 `storyProgress.turn`。
4. reload。
5. 断言恢复后的 `storyProgress.turn` 不丢失。
6. 断言 `targetTurns` 不变化。
7. 断言结束态 reload 后仍显示结局。

### P1-4. 风格模板需要加载态和失败态

当前问题：

- `/api/templates` 加载失败时静默失败。
- 用户只看到空白模板区，不知道发生什么。

整改步骤：

1. 增加 `templatesLoading`。
2. 增加 `templatesError`。
3. 加载中显示轻量骨架或 loading 文案。
4. 失败时显示“模板加载失败，稍后重试”。
5. 增加重试按钮。
6. 增加模板为空时的 empty state。

### P1-5. 移动端与桌面端重复 DOM 的长期处理

当前处理：

- E2E 已使用 `:visible` 避免误命中隐藏 DOM。

后续可选优化：

1. 使用媒体查询 hook，仅挂载当前视口需要的布局。
2. 或保持当前 CSS 隐藏方式，但所有测试选择器必须加 `:visible`。
3. 检查隐藏 DOM 是否影响无障碍树。
4. 关键区域增加更精确的 `data-testid`：
   - `story-panel`
   - `current-scene-title`
   - `choice-list`
   - `history-section`

### P1-6. 真实故事质量回归集

需要建立一组固定 prompt：

- 赛博朋克侦探。
- 民俗恐怖。
- 太空生存。
- 学院悬疑。
- 废土公路。
- 宫廷权谋。
- 儿童友好冒险。
- 高风险动作场景。

每个 prompt 需要检查：

- 开端是否明确。
- 主要目标是否明确。
- NPC 是否可理解。
- 选择是否互斥。
- 风险是否区分。
- 是否留下伏笔。
- 是否按目标步数收束。
- 结局是否回应前文。

### P1-7. 成本与限流策略

需要补充：

1. 每日 LLM token 上限。
2. 每用户创建频率限制。
3. 每会话最大并发请求限制。
4. 重复点击选择的幂等策略。
5. 生成失败重试上限。
6. 真实 LLM 费用估算显示。
7. 超预算时给用户可理解的提示。

### P1-8. 生图附属功能独立验收

当前策略正确：

- 默认关闭生图。
- 生图作为附属能力。

后续需要：

1. 图片开启时必须有 Redis 或替代队列。
2. 图片 worker 单独启动。
3. 图片失败不影响文字主流程。
4. 图片结果需要持久化。
5. 图片 provider 超时需进入 failed。
6. 前端展示 queued / generating / failed / completed 四种状态。
7. 生图成本进入预算统计。

## 6. P2 任务：体验与文档完善

### P2-1. 交互体验

建议优化：

- “开始冒险”生成期间禁用所有会改变请求参数的控件。
- 选择按钮点击后显示局部 loading。
- 历史区默认折叠，避免长篇故事页面过长。
- 结局后提供“导出完整故事”和“新故事”两个主路径。
- 长篇模式展示预计耗时和保存提醒。

### P2-2. 文案一致性

需要统一：

- “故事长度”与“目标步数”的说明。
- “场景图”与“生图”的命名。
- “风格模板”与“灵感模板”的命名。
- README、页面 UI、路线图中的项目名统一为 StoryForge。

### P2-3. 文档结构

建议 README 最终结构：

1. 项目简介。
2. 功能截图。
3. 当前能力。
4. 本地快速启动。
5. 本地 mock 测试模式。
6. 真实数据库启动。
7. 真实 LLM 配置。
8. 生图功能说明。
9. 测试命令。
10. 部署说明。
11. 环境变量表。
12. 安全注意事项。
13. 路线图链接。

### P2-4. 发布前清单

发布前逐项勾选：

- [ ] README 与实际功能一致。
- [ ] `.env.example` 覆盖全部变量。
- [ ] 真实 PostgreSQL 验证完成。
- [ ] 真实 LLM smoke 完成。
- [ ] CI 全绿。
- [ ] E2E 全绿。
- [ ] 生产 `TOKEN_SALT` 已设置。
- [ ] 生产 `ADMIN_TOKEN` 已设置。
- [ ] 密钥无泄漏。
- [ ] 分享链接过期策略确认。
- [ ] 错误页不暴露内部细节。
- [ ] 预算限制生效。
- [ ] 无图模式可独立完成完整故事。
- [ ] 生图失败不影响文字主线。

## 7. 建议的下一步执行顺序

### 第 1 步：补 README 本地测试模式

优先级：高  
原因：当前用户测试最容易踩到数据库未启动导致 500。

执行：

1. README 增加 `USE_MEMORY_DB=true`。
2. README 增加 mock LLM 启动命令。
3. README 标注真实交付必须使用 PostgreSQL。

### 第 2 步：补恢复进度 E2E

优先级：高  
原因：本轮修了恢复进度，但还需要独立测试保护。

执行：

1. 在 `e2e/text-flow.spec.ts` 增加 reload 后进度断言。
2. 增加 ended reload 断言。

### 第 3 步：真实数据库联调

优先级：高  
原因：这是从 demo 到可交付的关键门槛。

执行：

1. 启动 PostgreSQL。
2. 跑 migration。
3. 跑 db smoke。
4. 跑 E2E。

### 第 4 步：真实 LLM 联调

优先级：高  
原因：mock 只能保证流程，不能保证真实模型质量。

执行：

1. 选择目标模型。
2. 跑短篇、中篇、长篇样例。
3. 记录失败输出。
4. 调整 prompt 和 JSON 修复策略。

### 第 5 步：生产安全检查

优先级：高  
原因：项目涉及 API key、owner token、分享链接。

执行：

1. 检查密钥是否泄漏。
2. 设置生产 token salt。
3. 设置 admin token。
4. 检查统计接口权限。

### 第 6 步：生图功能单独验收

优先级：中  
原因：当前需求是文字主流程优先，生图附属。

执行：

1. 单独开启 `ENABLE_IMAGE_GENERATION=true`。
2. 启动 Redis。
3. 启动 worker。
4. 跑图片生成 smoke。
5. 验证失败不影响文字主线。

## 8. 本轮修改过的关键文件

- `next.config.ts`
- `.env.example`
- `e2e/text-flow.spec.ts`
- `src/app/api/games/route.ts`
- `src/app/api/health/route.ts`
- `src/app/components/StartScreen.tsx`
- `src/lib/api-contracts.ts`
- `src/lib/memory-db.ts`
- `src/lib/store.ts`

## 9. 风险提示

### 9.1 本地 `.env` 文件风险

本地存在 `.env` / `.env.local`。它们已被 `.gitignore` 覆盖，当前没有被 Git 跟踪。

仍需注意：

- 不要截图公开。
- 不要复制到 README。
- 不要提交到 GitHub。
- 如果真实 key 曾经暴露过，立即轮换。

### 9.2 mock 测试不能代表真实交付

当前 E2E 使用 mock LLM 和内存数据库证明流程通畅。  
真实交付还必须验证：

- 真实 PostgreSQL。
- 真实 Redis。
- 真实 LLM。
- 真实图片 provider。
- 真实部署域名。
- 真实 HTTPS。

### 9.3 Redis disabled 的 degraded 状态

本地文字模式下 Redis disabled 是可接受的 degraded。  
但如果生产开启生图，Redis 或等价队列必须可用。

## 10. 当前状态一句话

项目的“文字互动剧情主流程”已经能本地完整跑通；接下来要把真实数据库、真实模型、安全配置、CI 和部署文档补齐，才能达到正式可交付程度。
