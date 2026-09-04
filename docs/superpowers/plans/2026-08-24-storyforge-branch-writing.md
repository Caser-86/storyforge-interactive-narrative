# StoryForge 分支写作落稿实施计划

> 执行本计划时遵循测试先行：每个行为先写失败测试，确认失败后再写最小实现，最后运行针对性测试和完整验证。

## 1. 固化路径映射契约

- 新增 `src/lib/interactive/materialize.ts`，把连续互动回合转换为线性 `StoryGraph`。
- 在 `src/__tests__/interactive/materialize.test.ts` 先覆盖：首幕/中间幕/结局节点类型、选中边字段、缺失选择、非连续回合和未收束路径。
- 实现纯函数并用 `StoryGraphSchema` 约束输出字段长度与引用完整性。

## 2. 增加会话落稿关联与版本事务

- 在 `src/lib/authoring/migrations.ts` 增加 append-only migration，为互动会话增加可空 `materialized_version_id`。
- 扩展互动会话 schema、repository 和备份导入导出，兼容旧数据库与旧备份。
- 在 authoring repository 增加事务方法：校验项目/会话归属和 `ended` 状态，创建新的 `review_required` 草稿版本，写入图谱，切换 active draft，并在同一事务中记录会话关联。
- 在 `src/__tests__/interactive/repository.test.ts` 与 `src/__tests__/authoring/repository.test.ts` 先添加失败测试，覆盖旧稿保留、版本切换、重复落稿返回同一版本、未结束拒绝和项目隔离。

## 3. 增加落稿 API

- 新增 `POST /api/projects/[projectId]/play/[sessionId]/materialize`。
- 读取会话回合并调用路径映射与事务仓储方法，返回 project、version、graph 和是否新建。
- 新增 API 合约与测试，保证错误不会部分写入。

## 4. 调整作者界面

- 将编辑器入口和分支页面文案从“互动试玩”改为“分支写作”，明确每次选择后才生成下一幕。
- 结束场景展示“保存为正式故事草稿”，成功后展示“进入编辑器”；已落稿会话刷新后不再重复创建。
- 保留会话恢复、导出和删除能力，并更新组件测试。

## 5. 文档与全流程验证

- 更新 `docs/authoring-user-guide.md`、`docs/authoring-recovery.md` 和相关发布验证文本，区分分支写作与只读预览试玩。
- 更新 E2E：逐幕选择、结束、落稿、graph API 校验、进入编辑器和重复保存幂等。
- 运行针对性 Vitest、typecheck、lint、完整测试、build 和 authoring E2E；记录实际结果，不虚报未执行项。

## 执行记录

- [x] 路径映射、结局完整性和异常回合测试。
- [x] SQLite migration 9、会话落稿关联、版本事务和备份兼容；后续并追加 migration 10 保护互动生成尝试。
- [x] 幂等落稿 API 与项目隔离错误边界。
- [x] 分支写作界面、正式草稿确认和刷新恢复。
- [x] `npm test`：65 个测试文件、271 个测试通过。
- [x] `npm run typecheck`、`npm run lint`、`npm run build` 通过。
- [x] `npm run test:e2e:authoring`：10/10 通过，包含落稿后 graph API 验证。

## 后续审查加固记录（2026-09-04）

本节记录落稿闭环完成后的审查修复，不改写上面的历史执行数字；本节对应的代码仍需人工审核后再提交、打标签和发布。

- [x] 防止过期互动生成结果覆盖新选择；后台首幕和下一幕生成支持轮询恢复。
- [x] 自动保存串行化，编辑器表单使用稳定 key，且不会用早到的响应覆盖请求期间的新输入。
- [x] 新建生成使用隔离草稿版本；旧草稿候选、重复图谱 ID、超出当前预算的落稿会被拒绝。
- [x] 收紧互动模型契约、按 UTF-8 字节限制图谱写入，并补充作者结局编辑。
- [x] `npm run verify`：72 个 Vitest 文件、302 个测试通过，类型检查、Lint 和生产构建通过。
- [x] `npm run test:e2e:authoring`：12/12 通过。
- [x] `npm run authoring:llm:smoke -- --dry-run`：配置检查通过，未发网络请求。
