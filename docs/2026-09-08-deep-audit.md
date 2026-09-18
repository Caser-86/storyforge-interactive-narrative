# StoryForge 深度审核与优化依据

- 日期：2026-09-08；代码基线：`11e4580`，分支 `codex/branch-writing-v0.1.5`。
- 产品边界：私人本地使用、无需登录、文字优先；作者逐幕选择，模型续写并负责有限收尾。
- 本轮交付：代码审核、隔离复现、阶段 A 核心修复、回归验证、优化路线与计划图。
- [执行计划与依赖图](superpowers/plans/2026-09-08-storyforge-reliability-roadmap.md)。

## 结论与审核范围

> 2026-09-09 补充：真实模型复核发现互动场景存在偶发结构化输出漂移，现已对互动 worker 增加最多 3 次 `SCHEMA` 有界重试；对字段形状合法但风险集合不完整或非最终幕提前结局的响应，生成器增加一次有界业务契约修复；三份受控 DeepSeek 结构评测在当前代码上均通过，完整人工语义评分和作者路径仍待确认。

项目已有可运行的创作、持久化、落稿、校验和导出链路。本轮又完成了 SQLite 持久化互动任务、并发槽位、预算/调用账本、结构化故事记忆、进度时间线、可见性退避，以及 JSON 备份进行中状态归一化。测试通过仍不等于真实模型语义质量和目标平台发布证据已经充分保障；跨进程恢复与短 busy 锁已有隔离演练，下一步重点是真实模型评测、可访问性和发布环境验证。

本轮逐项检查了互动生成 schema、prompt、状态合并、重试、SQLite 会话事务、开场/续写 API、互动 UI、落稿、备份/迁移、诊断、请求校验、Provider 适配、指标、预算、CI 及文档。作者端 Playwright 流程、生产依赖审计和 Docker 构建/健康检查均已通过；真实模型结构路径评测已完成，但语义评审和目标环境发布证据仍未完成。安全部分为代码边界审查，不代表完整渗透测试。

## 当前修复状态

| 编号 | 当前状态 | 证据 |
| --- | --- | --- |
| A01 | 已修复 | `expectedTurn` 契约、事务冲突检查、route/repository 回归测试 |
| A02 | 已修复 | 待迁移数据库先备份、备份失败阻断、迁移安全测试 |
| A03 | 已修复 | doctor 使用只读连接并报告 pending migration |
| A04 | 已修复 | 模型收尾修复请求，拒绝静默强制结局 |
| A05 | 已修复核心 | 互动调用已纳入 v12 预算与用量账本；缺失 token usage 时保留 `unknown` 预算；真实服务端计费口径仍需人工核对 |
| A06 | 已修复核心 | 后台生成已持久化任务、lease、重试、取消和 2 槽位执行器；隔离 SQLite 的真实跨进程退出/重启与短 busy 锁演练已通过 |
| A07 | 已修复 | failed session 保留、中文错误和开场重试入口 |
| A08 | 已修复 | 请求序号与 session ID 防止迟到响应覆盖 |
| A09 | 已修复核心 | 结构化事实/伏笔记忆、溢出时的高优先级保留和最终收束约束已进入 prompt；真实模型叙事质量评测仍待完成 |
| A10 | 核心边界已修复 | proxy 校验回环 Host/Origin 和 JSON 写入；隔离浏览器跨来源 POST 验收通过 |
| A11 | 已修复 | 过期 queued 任务在恢复事务中标为 failed，并将生成中的会话恢复为可见失败；jobs 回归测试覆盖 |
| A12 | 已修复 | 统一错误文本脱敏覆盖 `sk-`、火山方舟 `ark-`、Bearer 和 URL 凭据；账本、worker 日志、生成/验证记录、备份导出和 CLI 输出复用该规则 |

## P1：优先处理

### A01 旧页面选择会推进错误的下一幕方向

状态：已修复。当前请求要求 `expectedTurn`，过期请求返回 409，不启动模型调用；专用双标签页 E2E 仍可作为后续补强。

修复前证据：每幕重置 ID 为 `choice_a/b/c`，旧输入只带 `choiceId`，因此服务端会在当前幕解释同名选择。

当前实现：`InteractiveChoiceInputSchema` 同时要求 `choiceId` 和 `expectedTurn`；`claimChoice` 在同一事务内比较当前回合；作者端提交时携带读取到的回合号，冲突后刷新并要求重新选择。

触发：两个页面都停在第一幕；页面 A 已推进到第二幕，页面 B 随后提交第一幕的 `choice_a`。服务端会将其解释为第二幕的 `choice_a`，违背作者本意。同幕重复请求的锁不能防止这个跨幕问题。

本轮隔离复现输出：`oldTabIntended=Open door`、`serverAccepted=Burn evidence`、`acceptedAtTurn=2`。

最小修复：请求带当前幕标识或单调递增的 `expectedTurn`，在 claim 事务中比较；过期请求返回 409，不启动模型调用。前端刷新当前幕并解释冲突，不能自动提交新选项。

### A02 已有版本升级跳过自动迁移备份

状态：已修复。现有版本升级只要存在 pending migration 且启用备份就先创建可验证备份。

修复前证据：已有 authoring 数据库执行新迁移时，旧逻辑只在首次迁移历史为空时备份。

当前实现：数据库初始化先检测 pending migration 和非空库，再按备份策略生成并校验升级前副本；备份失败会阻断迁移，无 pending migration 时不会重复创建备份。

隔离复现：在临时数据库初始化当前版本，进程内添加一条测试迁移后再初始化，输出 `migrationApplied=true`、`automaticBackupCount=0`。只变更了临时数据库和进程内迁移数组，未变更用户数据或源码。

最小修复：非空数据库存在待执行迁移且启用备份时，一律先完成可验证备份；备份失败阻断迁移；无待执行迁移时不创建额外备份。

### A03 Doctor 会执行迁移且主动关闭备份

状态：已修复。doctor 读取现有数据库并报告迁移状态，不创建迁移表或应用迁移。

修复前证据：doctor 曾经通过带迁移副作用的初始化路径检查数据库，并显式关闭备份。

当前实现：diagnostics 使用只读、必须存在的 SQLite 连接读取 schema 和迁移状态，不创建表、不应用迁移；升级仍由显式数据库初始化路径负责。

影响：对旧版数据库运行诊断可能改变 schema，用户无法从“检查”动作预期这一结果。A02 修复后，本路径仍会显式跳过备份。

最小修复：诊断使用 readonly/fileMustExist 连接，缺失数据库和待迁移状态明确报告；迁移放到显式初始化/升级路径。验证前后 schema、迁移记录和数据不变。

### A04 普通场景被静默转换成已完成结局

状态：已修复。最后一幕普通场景会触发一次专门收尾请求，仍失败则返回验证错误，不把正文强制标记为结局。

修复前证据：旧逻辑曾把普通场景正文保留并静默改成 `isEnding=true`，导致“停止生成”被误报为“剧情已收束”。

当前实现：最终计划幕先要求模型返回有效 ending；普通场景最多触发一次专门的 `ending-repair` 请求，修复仍失败则返回验证错误，不接受普通场景作为结局。对应生成器回归测试覆盖。

影响：模型输出仍在铺垫或悬而未决时，系统会允许以结局状态落稿；程序保证了停止，却不能证明模型真正完成剧情收束。

最小修复：最后一幕必须生成有效 ending；普通场景触发最多一次专门收尾修复请求，仍不合格时保存失败状态和原有有效幕。正文语义质量通过人工/版本化模型评测验证，不用单一布尔字段冒充质量证明。

### A05 默认分支写作未纳入预算和调用统计

状态：核心问题已修复，仍需真实 Provider 的服务端用量口径人工核对。

证据：迁移 v12 增加 `interactive_generation_usage` 和会话预算字段；`src/lib/interactive/usage.ts` 在每次互动 Provider 调用前原子预留、成功且 usage 已确认后按返回 token 结算、失败或成功响应缺少完整 usage 时保留 `unknown`；`src/lib/authoring/metrics.ts` 将互动调用单独汇总。账本不保存 prompt、raw response 或密钥，错误信息会脱敏并截断。

影响：fake Provider 和单元测试已经证明本地记账边界，但真实火山 Provider 的 token 返回字段、重试计费和服务端扣费仍不能仅凭本地账本推断。

修复：明确 `STORYFORGE_MAX_OUTPUT_TOKENS` 按互动会话累计，按 task/callIndex 去重；到限不发新请求；未知用量不按 0 计算，并在 UI 指标中显示。

### A11 重试队列过期后会话可能永久停在生成中

状态：已修复。恢复事务现在会把 `deadlineAt` 已经过期的 queued 任务标为 `failed`，worker 随后把仍在 generating 的会话恢复为可见失败状态；未过期的 running 租约仍按原有 lease 规则重领或重试。

修复前复现：重试任务在队列中等待到截止时间后，领取更新会因 deadline 条件失败，但任务仍保留 `queued`；worker 会把它计入“有可运行任务”，因此不会执行会话恢复。

当前证据：`recoverExpiredJobs` 在同一事务中处理过期 queued 任务；`src/__tests__/interactive/jobs.test.ts` 的过期队列用例先验证修复前失败，再验证任务变为 `failed` 且 worker 将会话变为 `failed`。完整 `npm run verify` 已通过。

### A12 火山方舟凭据格式未被所有错误路径脱敏

状态：已修复。此前互动账本的脱敏只覆盖 `sk-`，对火山方舟常见的 `ark-` 令牌格式没有独立覆盖；worker 的异常日志和部分作者端失败记录也直接复用 provider 错误文本。

当前实现：新增通用 `redactSensitiveText`，覆盖 `sk-`、`ark-`、Bearer、键值形式和带认证信息的 URL；互动账本、worker 日志、生成 executor、验证记录、备份导出和 CLI 的错误消息统一使用脱敏后的文本，并限制持久化错误长度。standalone 打包和 release evidence 另使用独立产物扫描器，发现疑似凭据时直接阻断发布证据生成。

当前证据：provider 错误、互动用量账本、通用错误工具和生成 executor 的 targeted tests 通过；真实 standalone 产物扫描通过，扫描 2260 个文本文件且 `secretFindings=0`；最新完整 `npm run verify` 通过 84 个测试文件、398 个测试，lint 无 warning。测试只验证已知凭据格式，不能替代外部日志平台或操作系统日志的独立审计。

## P2：稳定性、体验和质量

### A06 后台生成缺少持久化任务执行生命周期

状态：核心问题已修复；隔离 SQLite 已通过真实进程退出/重启和短 busy 锁演练，目标平台仍需单独验证。

证据：迁移 v11 增加持久化任务表；`src/lib/interactive/worker.ts` 使用 lease、最多 3 次任务尝试、30 分钟 deadline 和 2 槽位并发；路由只入队并触发 worker，页面关闭不会删除任务。取消会更新数据库并中断 Provider；旧 lease 的完成/失败不能影响新 lease。worker 初始化和连接关闭都在受保护范围内。

剩余风险：尚未在目标平台验证强制退出、磁盘/安装环境和初始化失败场景；当前跨进程证据使用隔离 SQLite 与受控短写锁，不代表所有部署环境。

### A07 开场失败提示丢失，历史恢复可进入无操作状态

状态：已修复。失败会话和 `lastError` 保留，刷新后仍有“重新生成开场”和清理入口。

修复前证据：failed 状态曾被当作本地会话指针清理和通用错误处理，导致刷新后可能拿不到 `session.lastError` 或没有可操作入口。

当前实现：组件保留 failed session，使用统一状态机读取 `session.lastError`，并展示重新生成开场、重新选择或新建会话入口；请求序号保护避免旧失败响应覆盖当前会话。

修复：使用统一的恢复状态机；显示安全的 `lastError`，失败开场提供明确重试/新建入口。不得用 error 是否为空代替是否正在恢复的状态判断。

### A08 历史切换与进行中的请求存在覆盖竞争

状态：已修复。开场、续写、恢复、落稿和删除响应均受请求序号/当前会话 ID 保护；组件回归覆盖延迟响应。

修复前证据：开场、续写、恢复和落稿响应曾可能直接写入届时的组件状态，没有统一比较原始会话 ID 和请求序号。

当前实现：开场、续写、恢复、落稿和删除均捕获 session ID 与视图请求序号，响应应用前确认仍对应当前会话；服务端任务取消和客户端读取取消也明确分离。

触发：请求慢时恢复另一个历史会话，旧请求迟到后可能把界面切回，或者给新会话显示旧会话的落稿版本。此项为可从控制流确定的竞争窗口，本轮未运行浏览器延迟响应复现。

修复：请求捕获 session ID 和视图请求序号；响应应用前确认仍对应当前会话；取消客户端读取不等于取消服务器任务。恢复/删除/落稿分别定义互斥与过期响应规则。

### A09 长故事记忆和提前结局契约不足

状态：核心问题已修复，真实模型语义质量仍待版本化评测。

证据：`src/lib/interactive/story-memory.ts` 将不可变主线事实、稳定 ID 伏笔和近期摘要分开保存；伏笔超出容量时优先保留未解决的高优先级条目；prompt 在最终幕首轮与修复请求中携带高优先级未解伏笔约束；单元测试覆盖容量边界、优先级保留、幂等合并、稳定 ID 销账和 prompt 长度。

剩余风险：代码只能约束模型输入和结构，不能证明真实模型一定正确回收伏笔或表达选择后果。当前已固定 6/8/16 幕、多题材和风险路径的离线样本，但仍需要付费调用审批、真实模型评测和人工评分，不能用 fake Provider 代替叙事质量结论。

### A10 本地写接口缺少来源验证边界

状态：核心边界已修复。API 写请求要求回环 Host、匹配 Origin 或显式 CLI 标记；带体的 POST/PUT/PATCH 要求 JSON。隔离 Playwright 已实测跨来源浏览器 POST 被拒绝且没有创建项目。

修复前证据：proxy 只设置安全响应头，写请求来源和带体请求的 Content-Type 尚未形成统一边界。

当前实现：proxy 调用 `assertLocalWriteRequest` 校验回环 Host/Origin；`readJsonBody` 校验 JSON Content-Type；隔离浏览器 E2E 已验证跨来源写请求在项目处理器前被拒绝。

验证：写操作校验可信 Host/Origin 和 Content-Type，无 Origin 的 CLI 请求需有明确本地策略；`data:` 页面真实发起 POST 后浏览器无法读取拒绝响应，同 URL 直连 `Origin: null` 返回 403，隔离项目列表保持为空。不同浏览器的本地网络策略仍需在目标发行环境复核。

## P3：维护与发布

- `generation/repository.ts` 1287 行，`authoring/repository.ts` 1157 行，图谱/快照/备份各约 670 行。行数本身不是 bug；历史会话列表已改为摘要分页，生成 worker 和多 repository route 已采用显式数据库作用域并完成当前机器的 100/1000 会话基线，事务边界清单已落档，当前不为“清理”而大规模重构。
- CI 配置静态检查确认包含 master push、v* tag、面向 master 的 PR 和手动执行，并已声明 Windows standalone 生命周期与 Linux Docker build/health job；当前功能分支单独 push 不触发该工作流，本轮未查询远程 CI 运行状态。
- 完整 `verify`、standalone 打包、发布证据和 Windows smoke 实际依赖 PowerShell 7.x（`pwsh`）；README、Windows 分发说明和 CI 已明确该前置条件并在验证 job 中检查版本，避免干净环境只安装 Node/npm 后在发布门禁阶段才出现无命令错误。
- 当前工作树已将 `.env.example`、README 和 Docker Compose 的默认 Provider/model 统一为火山方舟 Agent Plan；本轮真实互动评测仅以进程级 `OPENAI_MODEL=deepseek-v4-flash` 覆盖运行，`.env.local` 默认仍是 `doubao-seed-evolving`，两者不能混写成同一结论。
- 发布仍需 Windows 安装/回滚和 Docker 的目标环境证据；Linux CI 产物不能直接代表 Windows 原生 SQLite 模块可用。
- 发布清单已将互动真实模型评测和作者人工走完整分支路径列为独立待签字门禁，不能用 fake、dry-run 或自动化视口测试代替。
- README、恢复手册、CHANGELOG 和计划已同步到 v13 与当前工作树证据；历史审计“无 P1”不能替代本轮新发现。

## 已覆盖的关键基础

- 同幕选择通过事务、generationToken 和 currentTurnId 校验，迟到的旧任务无法随意写入新任务结果。
- 落稿要求连续回合和真实 selected choice；项目备份包含互动会话与回合。
- 请求体有流式大小限制、Zod schema 校验；SQLite 使用参数化操作、事务与外键。
- 离线导出、发布校验和历史恢复已有测试。上述基础应保留，作为优化的回归边界。

## 本轮验证

- `npm run verify`：类型检查、lint、完整单元测试和生产构建通过；84 个测试文件、387 个测试通过，退出码 0；数据库作用域、历史会话摘要分页、validation 原子性、真实跨进程任务恢复、过期 queued 任务恢复、异步下一幕焦点、写作路径刷新、读屏状态播报、互动离线评测、受控 live 参数边界、provider 默认对齐、Docker 数据目录权限、provider 凭据脱敏、互动结构漂移重试、历史状态同步、评测错误类别、测试 provider 可见性和互动会话深链接的 repository、route、UI 回归已覆盖。
- `npx vitest run src/__tests__/interactive/process-recovery.test.ts`：退出码 0；2 个测试通过，覆盖第一个子进程认领后退出、第二个子进程在 lease 过期后重领并完成，以及约 250ms 跨进程写锁释放后在 `busy_timeout` 内成功认领。
- `npx vitest run src/__tests__/interactive/interactive-player.test.tsx`：退出码 0；21 个测试通过，覆盖异步下一幕后的键盘焦点恢复、新回合写作路径刷新、场景就绪读屏播报、显式互动会话深链接和 fake provider 测试占位提示。
- 2026-09-09 运行时质量复核：旧手工服务曾显式使用 `GENERATION_PROVIDER=fake`，3 次调用均为 `succeeded` 但返回完全相同的占位正文、选择和摘要，输入/输出 token 为 0；这解释了“成功但质量很低”的现象。已保留旧会话作为证据，服务已切换为 `openai`，并让分支写作页面在 fake 模式显示明确警告；随后在明确授权下完成了受控真实模型评测，详见发布验证补充。
- `npm run test:e2e:authoring`：生产构建和 16 个作者端 Playwright 测试通过，退出码 0；新增隔离跨来源浏览器 POST 拒绝和 390px 无空格长正文断行验收。
- `npm run authoring:evaluate -- --provider fake`：3/3 结构化评测样本通过，`networkRequest=false`，退出码 0；这只证明结构契约，不证明真实模型叙事质量。
- `npm run interactive:evaluate -- --provider fake`：3/3 互动评测样本通过，`networkRequest=false`，覆盖 6/8/16 幕、多题材和不同风险路径；这只证明 fake 生成器遵守逐幕选择/收尾契约，不证明真实模型的叙事质量。
- `npm audit --omit=dev --audit-level=high` 和完整 `npm audit --audit-level=high`：均为 0 vulnerabilities，退出码 0；安全补丁将 Next.js 更新到 16.3.4、sharp 更新到 0.35.4、Vitest 更新到 4.1.11，并对齐 eslint-config-next。
- `npm run package:standalone`、standalone 产物凭据扫描、隔离临时根 package lifecycle smoke 和 `npm run release:evidence` 均通过；扫描 2260 个文本文件、`secretFindings=0`，生成 `0.1.7` standalone 证据，`packageFileCount=2264`、`secretsIncluded=false`、`signed=false`；release evidence 会再次扫描产物。
- 生产运行时 smoke：使用独立临时 SQLite、`GENERATION_PROVIDER=fake` 和 loopback `127.0.0.1:3201` 启动 standalone 服务；`GET /api/health` 与 `GET /api/projects` 均返回 `200`，服务随后停止，临时目录未残留。
- Docker build 首次复核失败：隔离容器以 255 退出，日志为 `exec /app/docker-entrypoint.sh: no such file or directory`；检查确认脚本为 CRLF，Alpine 无法解析 `#!/bin/sh\r`。已将脚本规范化为 LF，并增加 `.gitattributes` 的 `*.sh text eol=lf` 规则。
- 2026-09-09 复核：Docker Desktop CLI 状态为 `running`，`docker version`/`docker info` 成功；隔离 Compose 项目镜像构建退出码 0，修复后的容器为 `healthy`，`GET /api/health` 返回 200，使用持久化 SQLite。检查资源已清理，未删除 Docker 运行时文件、未 factory reset、未触碰用户容器或数据。
- 当前迁移目标为 v13；`npm run authoring:doctor` 退出码 0，数据库完整性、迁移、写入、loopback 绑定和 provider 配置正常，备份 freshness 为 `fresh`；本轮 checkpoint 只新增备份文件，未修改默认用户数据库，`restore-check --latest` 在临时副本中恢复验证通过。
- 隔离复现 A01：旧选择被接纳为下一幕不同含义的选择。
- 隔离复现 A02：已有版本执行新迁移，未产生自动备份。
- 隔离复现 A11：修复前过期 queued 任务仍为 `queued`；修复后领取事务将其标为 `failed`，worker 再将会话恢复为可见失败状态。
- 上述三条隔离复现是修复前或边界复现证据；修复后由对应回归测试覆盖。真实模型受控评测已完成结构层证据，但人工语义评分、提交和发布仍未完成。
- 2026-09-09 安全与容器复核：Next.js 更新到 16.3.4、sharp 更新到 0.35.4、Vitest 更新到 4.1.11、eslint-config-next 对齐到 16.3.4；生产和全量 `npm audit --audit-level=high` 均为 0 vulnerabilities，`npm ci --dry-run --ignore-scripts` 退出码 0。
- 互动预算边界复核：Provider 对缺失或非法 token usage 标记 `usageConfirmed=false`；互动账本回归确认该调用保留为 `unknown`，不会以 `consumed=0` 释放预算。
- 更新依赖后的 `npm run verify` 退出码 0（84 个测试文件、394 个测试）；`npm run test:e2e:authoring` 退出码 0（16/16）。新的 `vitest.config.mts` 使用 `import.meta.dirname`，Vitest 启动警告已消除；本轮新增的非最终幕提示词契约、高优先级伏笔溢出保护、非最终幕结局修复、风险选项修复和 Zod 错误分类回归也已纳入全量验证。
- 使用更新锁文件的 Docker 镜像重建和容器 health smoke 通过（构建退出码 0、容器 healthy、`/api/health` 返回 200）；隔离资源已清理。
- 当前代码真实模型补充复核：`deepseek-v4-flash` 的 6/8/16 幕受控样本均通过完整路径；16 幕期间发现的风险等级缺项由一次 `choice-repair` 修复，最终 `16/16`、`issueCodes=[]`。该结果仍不替代人工四维叙事评分。
- 2026-09-09 生成边界回归补充：主动场景 0/1 个选项、最终场景缺少结局摘要或残留选项均先走字段级宽解析和一次有界修复，修复后执行严格场景契约；最终幕修复仍返回主动场景时明确失败。针对性生成器测试 10/10，全量验证更新为 84 个测试文件/398 个测试。
- 2026-09-09 后置状态回归补充：空白 legacy 事实、伏笔和已解决条目不再让结构化记忆合并抛出 Zod 错误；新增生成器回归测试后，当前完整验证为 84 个测试文件/398 个测试。
- 2026-09-09 记忆容量回归补充：不可变事实占满 20 条上限时不会因 `slice(-0)` 把可变事实全部带入，长故事状态合并不再因数组溢出触发后置 schema 错误。
- 2026-09-09 真实长路径最终复核：`deepseek-v4-flash` 的 `zh-suspense-16` 在容量修复后通过 16/16；此前两次失败均在 provider 字段响应已通过后发生，分别由空白 legacy 记忆和 `slice(-0)` 容量边界定位并修复。该结构证据仍不替代人工叙事评分。
