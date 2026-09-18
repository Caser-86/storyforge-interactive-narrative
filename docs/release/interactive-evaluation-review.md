# 互动真实模型审阅表

本文档用于补充离线互动评测的人工质量门槛。它不替代 `npm run interactive:evaluate -- --provider fake`，也不把结构契约通过误认为真实模型叙事质量通过。

## 使用边界

- 仅在作者明确批准付费调用后执行真实模型评测；不要把 API key 写入此文档、日志、截图或提交。
- 记录实际使用的 `OPENAI_MODEL`、Provider、样本版本、日期和脱敏后的用量摘要。
- 当前仓库提供 fake runner、live dry-run 和受控的单样本 live runner；live dry-run 只检查计划，不发网络请求。真实模型评测必须在批准的受控环境中逐样本执行，不能用本地 fake 结果填表。
- 每个样本只沿一条预先记录的风险路径走完，保存最终导出的文本和脱敏评测记录，不保存原始 prompt、完整响应或密钥。

## 评测样本

| 样本 | 幕数 | 题材 | 预期路径 |
| --- | ---: | --- | --- |
| `zh-contemporary-6` | 6 | 现实悬疑 | low -> medium -> high -> low -> high |
| `zh-fantasy-8` | 8 | 奇幻冒险 | high -> low -> medium -> high -> low -> medium -> high |
| `zh-suspense-16` | 16 | 都市惊悚 | medium -> high -> low 循环至第 15 次选择 |

先运行无网络结构门禁，确认样本本身有效：

```text
npm run interactive:evaluate -- --provider fake
npm run interactive:evaluate -- --provider live --dry-run
```

获得明确付费调用批准后，只执行一个固定样本：

```text
npm run interactive:evaluate -- --provider live --allow-network --approve-paid-calls --fixture zh-contemporary-6
```

命令同时要求网络开关、付费确认和样本 ID；缺少任一项都会在发起模型请求前失败。默认输出只保存结构化评测结果，不保存原始 prompt、完整模型响应或 API key；只有显式追加 `--save-review --expected-model <当前 OPENAI_MODEL>` 才会另存经过契约校验的逐幕审阅文本，并在请求前确认评测模型就是当前配置模型。审阅文本同时包含每幕自动维护的剧情锚点，便于检查地点、时间、角色和目标是否连续。

如果需要给人工审阅保存可读的逐幕文本，在同一条受控命令末尾追加 `--save-review` 和当前配置的模型名：

```text
npm run interactive:evaluate -- --provider live --allow-network --approve-paid-calls --fixture zh-contemporary-6 --save-review --expected-model <当前 OPENAI_MODEL>
```

该开关只允许 live、非 dry-run、单样本且同时通过网络/付费确认的运行；`--expected-model` 必须与当前 `OPENAI_MODEL` 完全一致，否则在网络请求前失败。产物写入 `output/evaluations/interactive-review-<fixture>.md`，只包含已通过场景契约校验的标题、正文、摘要、选择和直接后果，不保存 prompt、原始 provider 响应或密钥。fake 或 dry-run 使用该开关会在网络请求前失败。

## 2026-09-09 受控运行记录

以下结果使用进程级 `OPENAI_MODEL=deepseek-v4-flash` 覆盖，未修改 `.env.local` 的默认 `doubao-seed-evolving`：

| 样本 | 结果 | 结构化证据 | 备注 |
| --- | --- | --- | --- |
| `zh-contemporary-6` | 通过 | 6/6 幕；选择后果、风险覆盖、结局契约通过 | `issueCodes=[]` |
| `zh-fantasy-8` | 通过 | 8/8 幕；选择后果、风险覆盖、结局契约通过 | `issueCodes=[]` |
| `zh-suspense-16` | 当前代码复评通过 | 16/16 幕；选择后果、风险覆盖、结局契约通过 | 曾出现 `GENERATION_UNKNOWN`/`GENERATION_SCHEMA`；字段级诊断确认主动场景缺少一个风险等级，后续又定位到 legacy 记忆空白值和不可变记忆容量边界，修复后最终复评 `issueCodes=[]` |

上述记录只证明结构、逐幕路径、选择后果字段和模型收尾契约；四个维度的 1–5 人工评分仍未填写，因此不能据此勾选发布语义质量门禁。

本次复评还验证了故障分类：模型返回字段形状合法但风险集合不完整时，首轮不会直接写入场景；生成器会在同一幕发起一次修复请求。若修复仍失败，结果保留为失败并要求作者重试，不会伪造选项或结局。

## 2026-09-10 默认模型结构复核

- 评测样本：`zh-contemporary-6`
- Provider：当前本地配置的 OpenAI-compatible provider
- 模型：`doubao-seed-evolving`
- 结果：正式 live runner 通过（6/6 幕，`networkRequest=true`）
- 脱敏证据：前 5 幕各返回 3 个选择，最后一幕返回 `isEnding=true`、0 个选择和非空 `endingSummary`；最后一幕兼容了模型返回的 `facts`、`threads`、`resolvedIds` 简写记忆字段。
- 代码复核：最终收尾字段缺失会进入最多一次收尾修复，辅助记忆中不完整的事实/伏笔条目会被丢弃而不阻断正文；仍以严格场景契约作为落稿前提。
- 说明：本条是受控结构诊断，不是四维人工文学质量评分；没有保存 API key、原始 prompt 或完整响应，也不能替代作者对选择后果、事实一致、伏笔回收和结局完整的人工打分。

## 2026-09-10 三样本当前版本复核

本次按批准的受控 live runner 逐样本执行，使用当前配置模型；只记录结构化结果，不记录原始 prompt、完整响应或密钥。

| 样本 | 结果 | 结构化证据 | 问题码 |
| --- | --- | --- | --- |
| `zh-contemporary-6` | 通过 | 6/6 幕；5 个主动场景；结局、选择、风险覆盖、直接后果均通过 | `[]` |
| `zh-fantasy-8` | 通过 | 8/8 幕；7 个主动场景；结局、选择、风险覆盖、直接后果均通过 | `[]` |
| `zh-suspense-16` | 通过 | 16/16 幕；15 个主动场景；结局、选择、风险覆盖、直接后果均通过 | `[]` |

以上是当前版本的结构与流程证据，不是文学质量结论；四维人工评分和作者亲自走完路径仍需填写并确认。

## 2026-09-15 终局与响应兼容复核

- 后续一次默认模型 `zh-suspense-16` 运行在 `10/16` 处出现 `GENERATION_SCHEMA`/`RISK_SEQUENCE`；安全的字段级诊断只记录错误类别和字段名，确认兼容 provider 将 `endingReadiness` 放在 envelope 顶层。
- 生成器现在只对这个已知字段做边界归一化，将其移入 `statePatch` 后继续执行严格的场景和状态契约校验；未知顶层字段仍不会被泛化放行。
- 最终计划幕新增“不得以未来继续/以后揭示代替收尾”的检查；命中时最多发起一次有界 ending repair，修复后仍不满足则失败，不会伪造结局或自动补写作者内容。
- 时间线提示要求同日午后使用无歧义的 24 小时制，并明确标注闪回或其他日期；这是减少时间表达回退的生成约束，不能替代作者逐幕事实审阅。
- 使用进程级 `OPENAI_MODEL=deepseek-v4-flash` 覆盖重跑三份人工材料后，`zh-contemporary-6`、`zh-fantasy-8`、`zh-suspense-16` 分别为 `6/6`、`8/8`、`16/16`，ending、choice contract、risk coverage、consequence 检查均通过且 `issueCodes=[]`；`.env.local` 默认模型仍为 `doubao-seed-evolving`。
- 本节仍只证明结构和可读审阅材料已生成；四个维度的 1–5 分、真实读屏/移动端验收和作者发布确认仍未完成。

## 2026-09-16 同模型审阅材料索引

本轮三份材料均使用 `Provider=live` 与进程级 `OPENAI_MODEL=deepseek-v4-flash` 生成，并已通过 prompt、原始响应和密钥扫描。以下材料只作为人工评分的阅读依据，不代表四维语义门禁已经通过：

| 样本 | 结构结果 | 审阅材料 |
| --- | --- | --- |
| `zh-contemporary-6` | `6/6`；`issueCodes=[]` | `output/evaluations/interactive-review-zh-contemporary-6.md` |
| `zh-fantasy-8` | `8/8`；`issueCodes=[]` | `output/evaluations/interactive-review-zh-fantasy-8.md` |
| `zh-suspense-16` | `16/16`；`issueCodes=[]` | `output/evaluations/interactive-review-zh-suspense-16.md` |

三份材料的模型、Provider 和幕数已由脚本复核；剩余动作是作者逐幕阅读并填写下方四个维度的 1–5 分，以及记录证据幕号和备注。

## 逐样本评分

每个样本单独填写一行四维评分，并填写证据幕号。4 分表示达到发布目标，3 分表示可读但需要修改，1–2 分表示存在明显质量问题。不要用另一个样本的分数代替空白项。

| 样本 | 维度 | 1–2 分 | 3 分 | 4–5 分 | 得分 | 证据幕号 / 备注 |
| --- | --- | --- | --- | --- | ---: | --- |
| `zh-contemporary-6` | 选择后果 | 选择没有改变后续，或与预览相反 | 有变化但较弱 | 下一幕明确呈现所选方向的直接后果，且与预览一致 |  |  |
| `zh-contemporary-6` | 事实一致 | 出现主线硬冲突 | 有可修正的小矛盾 | 主线事实、角色目标和不可变规则全程一致 |  |  |
| `zh-contemporary-6` | 伏笔回收 | 高优先级伏笔遗失或无解释 | 有解释但仓促 | 高优先级伏笔在结尾得到清晰交代，低优先级伏笔不喧宾夺主 |  |  |
| `zh-contemporary-6` | 剧情收尾 | 提前结束、未解决冲突或没有有效结局 | 基本结束但力度不足 | 最后一幕由模型完成收束，有正文、非空结局摘要且不再提供选择 |  |  |
| `zh-fantasy-8` | 选择后果 | 选择没有改变后续，或与预览相反 | 有变化但较弱 | 下一幕明确呈现所选方向的直接后果，且与预览一致 |  |  |
| `zh-fantasy-8` | 事实一致 | 出现主线硬冲突 | 有可修正的小矛盾 | 主线事实、角色目标和不可变规则全程一致 |  |  |
| `zh-fantasy-8` | 伏笔回收 | 高优先级伏笔遗失或无解释 | 有解释但仓促 | 高优先级伏笔在结尾得到清晰交代，低优先级伏笔不喧宾夺主 |  |  |
| `zh-fantasy-8` | 剧情收尾 | 提前结束、未解决冲突或没有有效结局 | 基本结束但力度不足 | 最后一幕由模型完成收束，有正文、非空结局摘要且不再提供选择 |  |  |
| `zh-suspense-16` | 选择后果 | 选择没有改变后续，或与预览相反 | 有变化但较弱 | 下一幕明确呈现所选方向的直接后果，且与预览一致 |  |  |
| `zh-suspense-16` | 事实一致 | 出现主线硬冲突 | 有可修正的小矛盾 | 主线事实、角色目标和不可变规则全程一致 |  |  |
| `zh-suspense-16` | 伏笔回收 | 高优先级伏笔遗失或无解释 | 有解释但仓促 | 高优先级伏笔在结尾得到清晰交代，低优先级伏笔不喧宾夺主 |  |  |
| `zh-suspense-16` | 剧情收尾 | 提前结束、未解决冲突或没有有效结局 | 基本结束但力度不足 | 最后一幕由模型完成收束，有正文、非空结局摘要且不再提供选择 |  |  |

## 通过规则

单个样本必须同时满足：

- 没有主线事实硬冲突。
- 每次选择的直接后果在下一幕可辨认，且没有把未选择分支写成既成事实。
- 所有高优先级伏笔在结尾有交代；若确实保留悬念，必须在备注中说明这是题材意图而不是遗失。
- 最后一幕完成模型收尾，`isEnding=true`、选择为空、`endingSummary` 非空。
- 四个维度均至少 4/5。
- 发现任何 P0/P1 叙事问题时，样本失败；不得用平均分抵销硬冲突。

## 评测记录

以下记录块按样本各填写一份；三份记录都完成后，才算完成本项人工门禁。

```text
评测日期：
Provider：
模型：
样本：zh-contemporary-6 / zh-fantasy-8 / zh-suspense-16（每个样本单独填写）
样本版本：interactive-evaluation@1
模型调用是否获作者批准：是 / 否
脱敏用量摘要：
结果：通过 / 不通过 / 未执行
失败样本及问题码：
修复或复评计划：
```

在所有样本通过前，发布清单中的“真实模型叙事质量”和“作者人工确认”必须保持未勾选。
