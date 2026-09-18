# Authoring Transaction Boundaries

状态：`当前实现约束 / D1`

本文档记录 StoryForge 当前 SQLite repository 的事务职责。它是后续拆分和性能回归的边界清单，不改变 repository 的公共 API。

## 约束

1. 读查询默认不显式开启事务；读取多个集合时不承诺跨查询快照一致性，若业务需要快照，必须在同步事务中完成全部读取。
2. 单个业务状态转换使用短事务，事务内只做校验、SQLite 读写和纯内存转换。
3. 模型调用、网络请求、文件 IO 和可等待的异步操作不得发生在 SQLite 事务内。worker 先领取/预留，事务外调用 provider，随后用 lease/token 再提交结果。
4. 多个 repository 可以借用同一个请求或 worker 作用域连接，但只有 `createAuthoringDatabaseScope` 的 owner 负责释放连接；repository 的 `close()` 只释放自己的 lease。
5. 跨 repository 的 service/route 流程不是隐式大事务。需要跨域原子性时，应新增显式 service 事务边界和回归测试，不能依靠调用顺序猜测一致性。

## Repository 清单

| 模块 | 只读查询 | 短事务状态转换/写入 |
| --- | --- | --- |
| `authoring/repository.ts` | 项目、图谱、草稿修订和版本读取 | 创建/更新项目、创建新草稿、互动路径落稿、整图替换、节点/边修订、快照创建/恢复、复制和删除 |
| `authoring/generation/repository.ts` | run、step、candidate 列表和详情 | 创建 run/candidate、候选应用/拒绝、step lease/恢复/追加/完成/失败、run 暂停/恢复/取消 |
| `authoring/validation/repository.ts` | validation run、issue 列表和详情 | 创建/完成 run、替换 issue、resolve/dismiss issue |
| `interactive/repository.ts` | session、summary、turn 列表和详情 | 创建 session、保存场景、claim choice、保存下一幕、释放/恢复/失败/取消生成 |
| `interactive/jobs.ts` | job 列表和详情 | 领取 lease、回收过期任务、完成/失败/取消任务 |
| `interactive/usage.ts` | usage 和 session budget 查询 | 预留、结算和失败账本记录 |

## Scope Ownership

- 独立调用 `create*Repository()` 时，repository 拥有自己通过 `acquireAuthoringDatabase()` 打开的连接。
- route 或 worker 需要多个 repository 时，先创建 `createAuthoringDatabaseScope()`，再把 `scope.options` 传给所有 repository。
- scope 结束时先关闭借用 repository，再关闭 scope；`close()` 是幂等的，不能在模块级保存可变共享连接。
- 当前浏览器 route 仍然是请求级连接，不跨请求复用；多 repository 请求已经在单次请求内共享连接。互动 worker 使用独立 worker 级 scope，以保证 route 返回后后台任务仍可继续。

## Review Checklist

- 新增写方法是否把竞争检查和最终写入放在同一个短事务？
- 是否把 `await provider...`、文件操作或外部请求放进了事务回调？
- lease/token 的完成、失败和释放是否在同一个状态转换事务中校验 owner？
- 是否为 rollback、旧 lease、重复调用和部分失败增加回归测试？
- 多 repository route 是否明确声明 scope owner，而不是让多个 repository 互相关闭连接？
