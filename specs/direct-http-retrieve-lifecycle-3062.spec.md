# #3062 本地直连路由（direct-http.js）取回状态机修复

## 目标与成功标准 (Objective & Success Criteria)
修复本地直连路由（`direct-http.js`）取回逻辑中的过早截断缺陷：
1. **根因治理**：此前对处于 `submitting` 或 `submitted` 态且尚未写入 `upstreamTaskId` / `artifact.sourceUrl` 的任务，直接返回 500（`任务已中断，请重新提交` / `omnimux-task-interrupted`），导致前端发起取回轮询时立即被误杀失败，无法正常收取耗时超过 5 秒的同步或异步生成结果。
2. **状态机规范**：
   - 处于 `submitting` / `submitted` 的任务，属于合法在途任务；取回请求（`taskRef` 存在且匹配账本）应返回 `{ ok: true, mode: 'submitted', taskRef }`（HTTP 200），让前端 `generation-runner.js` 按既定退避间隔（`RETRIEVE_BACKOFF_MS`）平滑轮询；
   - 处于 `ready` 的任务，继续直接返回 `{ ok: true, mode: 'live', taskId, taskRef, url, dest, kind }`；
   - 处于非恢复型 `failed` 的任务，返回 500 与具体 `errorCode` / `error`；
   - 仅在任务明显超期死锁（如超过 `deadlineMs` 或合法超时预算）时，才判为真正中断。
3. **真实端到端验证**：
   - 单元测试与端到端状态机测试全绿；
   - Dev 桌面应用真机环境验证：用户在 UI 提交生成时，在途状态正常维持波浪加载，不被误杀报错，生成完成后原地淡入大图。

## 命令 (Commands)
- 本机单测验证：`node --test plugins/omnimux/src/media/direct-http-retrieve-lifecycle-3062.test.js`
- 插件内回归：`pnpm --filter omnimux test`
- 质量门禁全套：
  - `node scripts/verify-plugin-boundaries.mjs`
  - `node scripts/verify-product-baseline.mjs`
  - `node scripts/auto-qa-gate.mjs . --diff --base origin/main`

## 项目结构 (Project Structure)
- 源码修改：`plugins/omnimux/src/media/direct-http.js`
- 回归测试：`plugins/omnimux/src/media/direct-http-retrieve-lifecycle-3062.test.js`
- 规格定义：`specs/direct-http-retrieve-lifecycle-3062.spec.md`

## 代码风格 (Code Style)
- 遵循 ESM 规范与既有 `direct-http.js` 的错误响应模式；
- 避免冗余或深层嵌套的三元运算符；
- 明确区隔终态判定与进行中排队状态。

## 测试策略 (Testing Strategy)
- TDD 驱动：先写针对在途 `submitting` / `submitted` 取回请求的回归测试用例，重现过早返回 500 的失败；
- 修复 `direct-http.js` 状态判断，使其返回 200 `{ ok: true, mode: 'submitted', taskRef }`；
- 验证 `ready`、`failed`、`interrupted` 各种分支边界清晰。

## 边界与约束 (Boundaries)
- 绝不绕过安全认证；
- 不破坏 `ready` 状态下的缓存短路快返行为；
- 保持客户端 `generation-runner.js` 与服务端 `direct-http.js` 的 REST 契约双向一致。
