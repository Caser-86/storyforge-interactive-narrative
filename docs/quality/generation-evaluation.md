# 生成质量评测

StoryForge 的生成质量不是以单次“看起来通顺”为发布标准，而是先通过固定、脱敏、有限的结构化评测，再由作者人工审阅 prose。评测语料位于 `src/fixtures/authoring/evaluations/`，当前覆盖悬疑、奇幻、当代三类中文短篇。

## 运行

```powershell
npm run authoring:evaluate -- --provider fake
npm run authoring:evaluate -- --dry-run --provider live
```

`fake` 模式不访问网络，验证评测器、结构契约和输出报告；报告只写入 `output/evaluations/latest.json`，该目录被 `.gitignore` 忽略。`live` 当前故意只支持 dry-run，先展示语料数量与最大输出 token 预算，避免误触发付费模型调用。未来启用真实评测时，必须增加明确的人工批准、硬预算和脱敏输出审核。

## 评分契约

每个结果固定包含：结构通过、选择分支契约、结局契约、中文/关键词匹配、schema 失败、预期运行状态、重试次数、延迟和 issue code。不会记录 API key、prompt、原始模型响应、项目标题或个人作品内容。

发布前还需人工抽查不同题材的正文质量，重点看人物连续性、选择是否有真实后果、支线是否回收、结局是否完成承诺。自动评测通过不等于文学质量自动通过。
