# Spec: 确定性传播 abort 策略下的节点失败（ExecutionScheduler 真实竞态）

- 类型: 缺陷修复（workflow 执行调度器错误传播）
- 范围: `plugins/omnimux-workflow/src/workflow/execution/ExecutionScheduler.ts`（仅此一文件）
- 风险: R2（单插件后端执行语义修复，向后兼容；不新增对外接口）

## 1. 现象
`execution-scheduler.test.mjs` 的 `mockFail node fails the execution with node_error` 用例偶发失败：`snapshot.error` 未匹配 `/mockFail/`，实际为 `执行不完整，1 个节点执行失败`。三次进 Merge Queue 出现一次。

## 2. 根因（真实缺陷，非测试 flaky）
`executeLoop()` 以 `Promise.race([...executeNode(nodeId) promises, waitForAnyCompletion()])` 推进；`waitForAnyCompletion()` 仅 `setTimeout(COMPLETION_POLL_MS=100ms)`。
- 'abort' 策略下节点失败时 `executeNode` 抛 `NodeExecutionError`（含节点错误原文）。正常该 rejection 先于 100ms 轮询赢得 race → `execute()` catch → 以节点错误 fail。
- 负载高时两个定时器同时到期，100ms 轮询可能先赢 → 节点 `NodeExecutionError` 被 `Promise.race` 作为迟到 rejection 吸收（并非无人处理的 unhandled，race 已订阅每个 promise），循环正常退出走“未完成节点”分支 → 顶层 error 退化为泛化文案 `执行不完整，1 个节点执行失败`，节点错误原文被吞。真实症状是「节点错误被吞→泛化文案」，不是 unhandled rejection。
→ 同一失败在负载不同时产生不同顶层错误，属错误传播不确定性缺陷。

## 3. 修复
- 新增字段 `abortError: NodeExecutionError | null`（`execute()` 起始清零）。
- `executeLoop` 对每个 `executeNode` promise 加 guarded catch：`NodeExecutionError` → 记录 `abortError` 并 return（错误不再被 race 吞掉）；其它错误照旧 rethrow。
- 循环顶 `if (this.abortError) break;`，循环结束 `if (this.abortError) throw abortError;` → `execute()` catch 稳定以节点错误原文 fail。
- cycle/deadlock 泛化文案、'skip' 策略、cancel、timeout 分支不变。

## 4. 验证
- 新增确定性回归用例：gateway 延迟 150ms（>COMPLETION_POLL_MS=100ms）稳定触发“轮询先赢”，断言 `context.error` 仍含 `mockFail` 节点原文且 unhandledRejection 为 0；**去掉本次修复时该用例失败**（复现泛化文案）。
- `execution-scheduler.test.mjs`（node24.18.1=CI 版本）全 pass。
- workflow 执行相关 27/27 pass；workflow 全量 3171/3171 pass，0 fail。
- `npm run build`（workflow host/client/canvas/director）通过；`auto-qa-gate --diff` L0 pass。
