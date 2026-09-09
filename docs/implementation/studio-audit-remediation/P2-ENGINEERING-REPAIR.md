# Studio QA2 K1/P2 工程定向修复

## 范围与结论

- 固定输入 HEAD：`f728537096af205aad793fe9ba9767b569afde77`；不 fetch、不 rebase。
- 本文是工程定向修复证据，不是第三轮独立 QA，也不改变两轮正式 QA 已结束的事实。
- K1 的公开 `onClose(tab, { sessionId })` 回归通过。完整运行验收仍 BLOCKED，不可据此合并放行。
- 只改 Studio 源码、补工程边界测试、提交任务报告及原样 QA2 测试/报告；无 Host、bootstrap、push、merge、部署或官方源码修改。

## 实现

`ScopeRegistry` 在单次依赖注入/Tab 注册内维护 session → 完整 scope key 集合，未知 scope 仍不创建 store。

- 提供 cwd：沿用 `[cwd, repoRoot ?? null, sessionId]` 精确匹配；错误或空 cwd 不退化成 session-only。
- 仅提供 sessionId：只有本 registry 中唯一身份才关闭；如附 repoRoot，必须与该身份一致。
- 同 session 不同 cwd/repoRoot：缺少完整身份时拒绝歧义关闭，不猜当前 workspace、不批量销毁。调用方应提供完整 scope；这是避免跨 workspace 误关闭的保守边界。
- 直接释放、公开关闭与注册卸载同步清理索引；释放前移除身份，避免同步回调命中过期对象。
- `index.js` 的 onClose 调用 registry.closeScope，无跨注册全局状态。

新增 `close-scope.test.mjs` 覆盖唯一 session 关闭及重开、同 session 不同 cwd、repoRoot 分离、无效身份拒绝、独立注册和直接释放索引清理。既有测试不改。

## 工程验证（2026-09-09）

| 实际命令 | 结果 |
| --- | --- |
| `node --test plugins/omnimux-studio/tests/close-scope.test.mjs plugins/omnimux-studio/tests/independent-qa-round2.test.mjs` | 6/6，0 fail/skip |
| Studio cwd：`node --test tests/*.test.mjs` | 40/40，0 fail/skip |
| Studio cwd：`node scripts/build-client.mjs` | exit0，81,221 bytes；生成物忽略且不提交 |
| `node --test scripts/live-qa.test.mjs scripts/ego-live-qa.test.mjs scripts/studio-live-qa.test.mjs` | 25/25，0 fail/skip；离线 probe 测试 |
| `node scripts/verify-stage-contracts.mjs` | exit0，11 Stage / 原8 targets |
| `node scripts/verify-plugin-boundaries.mjs` | exit0，2239 sources |
| `node scripts/scan-ui-gates.mjs` | exit0，296 views / 0违规 |
| `git diff --check` | exit0 |

`pnpm --filter omnimux-studio test` 和 `build` 均在工作区依赖自动安装检查失败，未进入包脚本：omnimux-clip 引用的 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/personal/dsh-ui-kit` 缺失（ENOENT，install exit254 / wrapper exit1）。不修改其他包或安装环境；改用包清单完全相同的原始 Node 入口取得上述测试/构建证据。不能报告 pnpm 命令通过。

原 QA1 测试 SHA256：`d86717f14a7b22cfac032b30638e5c38dcdc449a066a20922ce6be7b7015d3fa`。
原 QA2 测试 SHA256：`83535451a08c86745cf092e52a386d16a2d06c9b59f9e58bfd623194864d933c`。
QA2 测试与报告原样纳管，保留其固定 f728537 时的失败历史，不能把历史判定改成 PASS。

全局源码一致性检查：index → closeScope → disposeScope 契约一致，精确 scopeKey 及所有现有调用保持兼容。**工程代码 IS_PASS: YES**；仅限本次定向离线检查，不是独立最终 QA 或完整验收。

## 剩余授权与 L2 问题

- 本树尚无绑定最终 HEAD 的正式 L2 身份，本轮不启动 Host、不引导凭据、不借用当前其他 GUI。
- 环境 Owner/主理人需明确授权受管任务 L2 准备路径及必要 credential/settings/seed 操作，避免隐式 Dev/Prod/其他 profile 复制；随后绑定最终 SHA/profile/PID/启动时间/bundle。
- 正式运行验收需 ego task/Tab 所有权、共享 verify:live、runtimeProof 和真实 PNG；尚未执行，不声称 ego 工具不可用。
- 仍需真实 scope 切换、关闭清空和重开、十轮依赖卸载、亮暗宿主不变、320/768/1200 布局、CJK IME/粘贴/选区、dock/焦点、媒体错误和下载验证。
- QA2 完整 gates 的既有环境失败及任务树内 fixture 适用性差异本轮未重跑、未修复；详见原 `QA-REPORT-ROUND2.md`。本次修改不涉及 gates 脚本，不冒称全仓 gates PASS。
