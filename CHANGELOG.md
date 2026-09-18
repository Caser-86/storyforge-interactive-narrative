# Changelog

All notable changes to StoryForge are documented here.

## [Unreleased]

暂无未发布变更。

## [0.1.8] - 2026-09-18

> 已从 canonical `master` 提交 `f2fec8b` 发布为 [GitHub Release v0.1.8](https://github.com/Caser-86/storyforge-interactive-narrative/releases/tag/v0.1.8)。后续发布证据文档更新通过 PR [#5](https://github.com/Caser-86/storyforge-interactive-narrative/pull/5) 合并，未移动或重建 `v0.1.8` 标签。

### Reliability and Authoring Flow

- 将发布策略绑定到故事版本：作者实际走完的单路径草稿只要求至少 1 个结局，多分支结构继续执行至少 2 个结局的发布门槛；复制、快照和恢复会保留该策略。
- 新增作者结局生成用量账本与迁移 `14`，把确认用量、失败和无法确认的保守预算汇入项目指标，不再把编辑器结局调用混入互动会话账本。
- 编辑器阻断计数、图谱写入、发布校验和快照封存统一读取版本级发布策略，避免页面显示可发布但服务端仍按旧规则阻断。
- 明确只读预览与作者分支写作的区别：预览提示只运行快照中已有分支，并提供“进入分支写作/继续分支写作”入口，避免把快照跳转误认为实时模型续写。
- 在只读预览的选项区再次标明选择只会跳转到快照节点，避免作者滚动到故事末尾后误以为会触发模型续写。
- 澄清作者分支历史状态：可恢复的 `active` 会话显示为“可继续”，只有真正执行中的 `generating` 会话显示为“生成中”，并在记录列表说明恢复后由作者选择才会触发下一幕生成。
- 为多条作者历史记录补充最近更新时间和短记录编号，避免同一项目的相同幕数记录无法区分。
- 为当前互动场景显示上一幕作者选择及其承接说明，帮助作者确认本幕正文确实沿着所选方向生成。
- 为互动会话增加自动维护的剧情锚点（地点、时间、在场角色和当前目标），下一幕提示词会携带并约束该账本；作者页和脱敏人工审阅材料可查看，不增加手填字段。
- 在具体场景页再次说明“作者选择、模型续写、有限回合收尾”的分工，避免把动态生成误认为预先存在的固定节点路线。
- 修复旧互动会话处于非结局但没有任何选项时的卡死界面：明确提示该记录无法继续、保留原记录，并提供显式“新建分支写作”入口。
- 兼容读取早期保存的零选项活动场景：新生成仍执行至少两个选项的严格契约，历史记录则可以正常返回给恢复界面，不再在 API 解析阶段变成 500。
- 兼容 V2 备份往返早期零选项活动场景：导出、导入和再次导出均保留历史正文，不会因新生成契约而阻断私人数据迁移。
- 收紧互动续写提示词的时间线和具体后果要求，并在模型返回空泛选择影响时优先保留当前场景摘要，避免后续记忆退化为“局势发生变化”。
- 放宽互动模型响应的有限适配余量，使超过 3 个选项的漂移响应可以进入既有修复流程，同时继续拒绝将非 3 选项场景写入正式状态。
- 兼容长上下文模型将 `endingReadiness` 放在响应顶层的已知字段漂移；只将该已知字段归一化到 `statePatch`，保留严格场景契约，并对以未来承诺代替收束的终局发起一次有界修复。
- 强化互动时间线提示，要求同日午后使用无歧义的 24 小时制，并在终局明确解决当前冲突、给出具体结果与代价，减少跨幕时间回退和未闭合结局。
- 明确发布配置的模型选择：当前示例默认使用火山方舟 `doubao-seed-evolving`，若发布目标为已开通的 `deepseek-v4-flash`，必须在最终人工评测前确认 `OPENAI_MODEL`，避免把不同模型的结构证据混为一谈。
- 为受控 live 评测增加可选 `--save-review` 逐幕审阅产物，并要求 `--expected-model` 与当前 `OPENAI_MODEL` 一致，便于作者核对选择后果、事实一致、伏笔回收和结局完整；默认摘要评测和 dry-run 行为不变，且不保存 prompt、原始响应或密钥。
- 将真实模型人工审阅表改为按 `zh-contemporary-6`、`zh-fantasy-8`、`zh-suspense-16` 三个样本分别记录选择后果、事实一致、伏笔回收和剧情收尾四项评分。
- 新增低负担的作者结局收尾流程：作者只需输入可选的结局方向，模型生成结构化预览，作者确认后才原子写入结局节点；原七字段手填保留在“手动填写（高级）”中，并补充真实接口、冲突保护和端到端回归。
- 修复中文正文被按单字符切分后产生大量重复片段误报的问题；中文重复片段改用更长的字符窗口，并将同一节点对的重复正文告警限制为一条，避免质量报告被噪声淹没。
- 兼容真实模型将质量审阅结果返回为 `warnings` 数组的响应形状，并在边界处归一化为标准 `passed`/`issues` 契约；同时收紧审阅提示词，避免该类模型漂移把整次验证变成 500。
- 修复真实模型偶发结构化输出漂移导致下一幕直接失败的问题；互动场景对 `SCHEMA` 失败执行最多 3 次有界重试，仍失败时保留原场景并释放当前选择。
- 将互动模型字段 schema 与业务契约校验分层：风险选项不完整时发起一次有界 `choice-repair`，并将后处理 Zod 错误正确归类为 `SCHEMA`，避免把可修复的契约漂移误报为 `UNKNOWN`。
- 修复主动场景缺少选项、最终幕缺少结局摘要或残留选项时在修复前被严格 schema 拦截的问题；模型响应先做字段级解析，修复完成后再执行最终场景契约校验。
- 修复兼容模型返回正文但缺少完整 token usage 时被误记为零消耗的问题；互动账本现在将未确认用量保留为 `unknown` 预算。
- 过滤互动模型返回的空白 legacy 事实、伏笔和已解决条目，避免结构化记忆合并阶段抛出后置 schema 错误并触发无意义重试。
- 修复结构化记忆在 20 条不可变事实已占满容量时因 `slice(-0)` 误保留全部可变事实、导致长故事第 11 幕后置校验失败的问题。
- 收紧互动提示词契约，明确只有最终计划幕允许结局，避免模型提前结束后被服务端拒绝；长故事记忆溢出时优先保留未解决的高优先级伏笔。
- 修复 Docker Alpine 容器在 Windows Git checkout 后因 shell entrypoint 为 CRLF 而无法启动的问题，并用 `.gitattributes` 固定 shell 脚本使用 LF。
- 修复远程 CI 中互动生成测试受 `GENERATION_PROVIDER=fake` 环境影响而绕过 mock 的问题；Windows package smoke 现在在 GitHub Actions 中安全使用受 runner 管理的 `RUNNER_TEMP`，并保持本地临时目录边界与清理校验。
- 升级 Next.js 至 `16.3.4`、sharp 至 `0.35.4`，并将 Vitest 与 eslint-config-next 对齐到已验证版本；生产依赖和全量依赖审计均为 0 vulnerabilities。

- 将分支写作的开场和续写改为 SQLite 持久化任务，支持有界并发、lease 恢复、取消、迟到结果保护和可见进度。
- 增加互动调用账本与会话输出预算，记录模型调用状态、token、请求 ID 和耗时；无法确认的失败用量保留为 `unknown`。
- 修复重试任务在队列中等待至截止时间后仍保持 `queued`、导致互动会话永久显示生成中的状态机边界问题。
- 增加结构化故事记忆、稳定伏笔 ID 和最终收束约束，避免长故事主线事实被近期细节挤掉。
- 增加作者写作路径时间线、生成耗时/尝试状态、取消操作和生成轮询退避。
- 修复异步下一幕生成后键盘焦点落回页面主体，以及回合时间线不随新幕刷新的作者体验问题。
- 为场景就绪和结局状态增加 `aria-live` 播报，帮助读屏用户知道何时可以继续选择或保存草稿。
- 为互动正文、摘要、选项和历史文本增加无空格长串断行，并加入 390px 移动端回归，避免模型文本撑破页面。
- 增加独立的互动离线评测命令和 6/8/16 幕多题材样本，验证作者风险选择路径、状态推进和模型收尾契约；真实模型默认 dry-run，只有单样本、网络和付费确认参数齐全时才执行。
- 增加真实模型人工审阅表，明确付费调用审批、选择后果、事实一致、伏笔回收和结局完整性的评分门槛。
- 统一火山方舟 Agent Plan 的默认模型、兼容 API 地址和 Windows standalone 启动回退，避免未显式设置环境变量时回退到已退役的 DeepSeek 默认值。
- 增加 Windows standalone 原生 SQLite 生命周期和 Linux Docker 构建/health smoke 的 CI 门禁；两者均使用 fake provider，不执行模型请求。
- 增加隔离浏览器跨来源写请求回归，确认不可信来源不能创建本地项目。
- 扩展 provider 错误元数据脱敏，覆盖火山方舟 `ark-` 凭据，并避免互动 worker 日志记录原始凭据。
- 为分支写作页标注 `GENERATION_PROVIDER=fake` 测试占位模式，避免固定占位内容被误认为真实模型质量；手工创作默认使用 `openai` provider。
- standalone 打包和 release evidence 均新增独立产物凭据扫描，覆盖 `sk-`、`ark-`、Bearer 和 URL 凭据，并对空文件安全处理。
- 明确完整验证、standalone 分发和 Windows smoke 的 PowerShell 7.x（`pwsh`）前置条件，并在 CI 的 Ubuntu verify 与 Windows 分发 job 中增加版本检查。
- 修复项目 JSON 导入把进行中会话恢复成永久“生成中”的问题；该格式仍明确不承诺恢复模型任务租约。
- 完成迁移 v12/v13、worker 初始化保护、显式共享数据库作用域、multi-repository route 请求作用域、互动历史读取基准、租约竞争测试、真实跨进程退出/重启与短 SQLite busy 锁演练、预算账本测试、备份恢复测试和三会话并发回归；互动历史列表新增摘要分页索引，验证 repository 写入也统一到短事务边界。

## [0.1.7] - 2026-09-04

> 作者分支审查加固候选版本：对应 `v0.1.7` 标签，尚未合并到 `master`，不是正式 GitHub Release。

### Authoring Completion Hardening

- 新增作者结局编辑能力：作者可以从任意非结局节点创建新的 `ending` 节点并通过一条选择边闭合路径。
- 互动路径会为项目目标结局预留节点预算，避免落稿后无法补齐正式结局；新增互动落稿到正式快照的完整 E2E。
- 修复会话路由在项目归属校验前执行过期恢复的问题，并补充跨项目隔离回归测试。
- 生成完成或取消后可直接新建下一轮生成；互动首幕和下一幕采用后台生成并由页面自动轮询恢复，避免长请求卡住或手动刷新页面。
- 新建生成会先创建隔离的活动草稿版本，保留上一版作者内容；互动生成请求增加一次性尝试 token，过期响应不能覆盖新选择。
- 自动保存改为串行提交，编辑器表单使用稳定 key，响应不会覆盖请求期间的新输入；旧草稿候选、过期互动结果和不符合预算的落稿都会被拒绝。
- 收紧互动模型输出契约，活动场景必须提供 2-3 个选择；图谱整图写入上限调整为 8 MB 以覆盖合法中文正文。
- 图谱写入会在持久化前拒绝重复的章节、节点或边 ID，避免 malformed graph 进入 SQLite 写入路径。
- 本轮验证：`npm run verify` 通过 72 个 Vitest 文件 / 302 个测试，类型检查、Lint、生产构建和完整 authoring E2E 通过 12/12。

## [0.1.6] - 2026-08-28

> 作者分支编辑候选版本：已在功能分支和标签中验证，尚未合并到 `master`，不是正式 GitHub Release。

### Authoring Branch Editing

- 在正式编辑器中新增作者分支表单：作者可从已有主线节点添加一条支线场景，并明确选择文案、场景正文和收束结局。
- 新分支通过带修订号校验的一次整图写入保存，自动保持到结局的闭环；新增场景标记为 `review_required`，不会被视为已发布内容。
- 增加图谱变换、API、编辑器和 E2E 覆盖，并修复 Windows E2E SQLite 清理竞态。
- 本轮验证：`npm run verify` 通过 67 个 Vitest 文件 / 276 个测试，完整 authoring E2E 通过 11/11。

## [0.1.5] - 2026-08-24

> 分支候选版本：已在功能分支和标签中验证，尚未合并到 `master`，不是正式 GitHub Release。

### Author-Driven Branch Writing

- 将互动入口明确为“分支写作”，作者每次选择后才生成下一幕，不预生成未选择的分支。
- 结束时可把作者实际选择的线性路径保存为新的 `review_required` 故事草稿，原草稿保留且重复保存幂等。
- 增加互动路径到 StoryGraph 的落稿映射、SQLite migration、项目隔离校验、备份兼容和进入编辑器继续补全的入口。

### Verification

- 本地候选验证记录：`npm test` 通过 65 个 Vitest 文件 / 271 个测试；`npm run typecheck`、`npm run lint`、`npm run build` 通过。
- `npm run test:e2e:authoring` 通过 10/10，包含作者逐幕选择、正式落稿、刷新恢复、离线导出、发布恢复和响应式筛选。
- 尚未完成的发布门槛：合并到受保护的 `master`、对应远程 CI、干净 Windows 账户安装证据、代码签名和用户级安装器。

## [0.1.4] - 2026-08-24

### Reliability and Generation Controls

- Made pause and cancellation safe against late provider responses; discarded results are no longer persisted after the run stops.
- Added server-side authoring input limits, configured-model enforcement, per-run output budgets, large-run confirmation, and optional hard output caps.
- Added generation budget persistence with a backward-compatible SQLite migration and backup/import support.
- Added CI tag/manual triggers, failure artifact retention, and a documented GitHub release procedure.

### Verification

- Release A working-tree evidence: `npm run verify`, 57 Vitest files / 240 tests, 9 authoring E2E tests, and SQLite smoke all passed on 2026-08-24.
- Release B evidence: checkpoint/restore-check commands and replacement recovery tests passed locally; the Recovery Centre and privacy-safe doctor are included.
- Release C evidence: security baseline, request-size policy, axe accessibility flow, and fake generation evaluation passed locally.
- Release D evidence: Windows package lifecycle smoke, live provider smoke, CycloneDX SBOM, and standalone checksum generation passed; no signed installer is published.
- Published as GitHub Release `v0.1.4` from merged `master` commit `e175f84467af1ff9383c023121969be844fd13fa`; tag CI, SBOM, standalone checksums, and release evidence are recorded in `docs/release/authoring-verification.md`.

## [0.1.3] - 2026-08-24

### Product

- Added a bounded, choice-driven interactive player that generates one scene at a time and ends within the project's configured turn policy.
- Added local interactive session history with resume, export, and deletion controls.
- Added project title, genre, premise, and status filtering with responsive desktop/mobile coverage.

### Reliability and Security

- Added versioned project backup V2 with interactive sessions and turns, while keeping V1 import compatibility.
- Restricted default Docker exposure to loopback and added an explicit LAN override compose file.
- Removed filesystem and provider details from the health response and aligned the privacy documentation with local-only behavior.
- Added deterministic fake-provider CI coverage, dependency auditing, database smoke checks, and release E2E coverage.

### Verification

- `npm run verify`: 55 test files and 224 tests passed.
- `npm run test:e2e:authoring`: 8 tests passed.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
