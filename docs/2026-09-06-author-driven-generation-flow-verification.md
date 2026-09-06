# 作者驱动生成流程验证记录

日期：2026-09-06

## 本轮变更

- 默认 `/projects/:projectId/generate` 改为作者驱动分支写作：生成开场、展示选择、作者选择后只生成被选中的下一幕，达到有限回合后由模型生成结局。
- 原批量 brief、bible、outline、graph、节点内容和连续性审阅管线迁移到 `/projects/:projectId/generate/structured`，保留原有暂停、恢复、取消和预算确认。
- OpenAI-compatible 客户端默认超时改为 180 秒，`Request timed out` 等消息正确归类为可重试 `TIMEOUT`。
- 互动开场和下一幕生成对超时、网络和限流执行最多 3 次尝试；鉴权和 schema 错误不重试。
- 互动会话按 `3 * OPENAI_TIMEOUT_MS + 60 秒` 计算回收窗口；默认约 600 秒，避免重试中的长模型请求被误判中断。
- README、作者指南、恢复手册和分支写作设计同步更新。
- 编辑器空图谱不再停留在“从左侧大纲选择节点”：现在会明确说明当前草稿为空，并提供“开始分支写作”和“重试一次性结构化生成”两个恢复入口。
- 下一幕模型请求失败时不再静默回退：会话保存安全的错误提示，原场景和选择保持可重试；重新打开后自动回收超时会话也会保留提示。
- 火山方舟 `doubao-*` 结构化请求显式关闭 extended thinking，避免下一幕请求因默认隐藏推理耗尽 180 秒客户端超时。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm test` / `npm run verify` | 通过：74 个测试文件，315 个测试；类型检查、lint、生产构建均通过 |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过 |
| `npm run build` | 通过；包含 `/projects/[projectId]/generate/structured` |
| `npm run test:e2e:authoring` | 复跑通过：14/14，新增正式作者闭环和空草稿恢复测试 |
| `npm run authoring:llm:smoke -- --dry-run` | 通过；模型 `doubao-seed-evolving`，未发网络请求 |
| `npm run authoring:llm:smoke` | 通过；模型 `doubao-seed-evolving`，输入 371 tokens，输出 309 tokens，延迟 10306 ms |
| 真实互动下一幕生成（不落库） | 通过；同一私人会话上下文返回下一幕和 3 个选择，耗时约 49.7 秒；未修改会话数据 |
| `npm run authoring:doctor` | 通过；SQLite 完整性、可写性、loopback 绑定和模型配置正常 |
| `npm run db:authoring:restore-check -- --latest` | 通过；迁移版本 10，2 个项目，图谱可读 |

## 运行状态

- 本地开发服务仍运行在 `http://127.0.0.1:3001`。
- `GET /api/health` 返回 HTTP 200，存储为持久化 SQLite，LLM 状态为 `configured`。
- 默认生成页返回 HTTP 200，包含“开始分支写作”，不再显示批量“结构化生成流程”主界面。
- 结构化生成页 `/projects/ca1ebec5-a79d-4346-8453-e8996b3b088e/generate/structured` 返回 HTTP 200；示例项目 ID 仅用于本机验证记录。

## 人工确认项

- 当前每幕默认 3 个选择；代码契约允许活动场景返回 2-3 个，未选择分支不会落稿。
- 真实 smoke 只验证一次 brief 结构化请求，不代表已经用真实模型完成完整多幕故事；完整作者闭环已用 fake provider 通过 E2E。
- 新增 `e2e/authoring-full-flow.spec.ts` 覆盖创建项目、作者选择、模型收尾、落稿、补足节点、增加第二结局、校验和快照。
- 新增 `e2e/authoring-empty-draft-recovery.spec.ts` 覆盖空草稿编辑器的恢复入口，避免生成失败后用户面对无操作路径的空画布。
- 本轮没有创建版本标签或推送新提交；需要发布时应先人工确认，再按发布流程提交、推送和打标签。
