# dev-smoke page-health 有界等待（Issue #3610）

## 目标与成功标准

`scripts/dev-smoke.mjs` 的 `page-health` 断言不再对"页面仍在加载"做单点判负：在默认 **30 s / 250 ms**（均可用环境变量覆盖）的有界预算内轮询，一旦 `document.readyState === 'complete' && bodyLen > 0` 即 PASS。失败分类处理：`kind === 'timeout'`（渲染进程忙/未响应）在预算内继续等；`transport` / `decode` / `protocol`（连接、协议、目标消失）立即 FAIL；预算耗尽仍不就绪才 FAIL。报告 detail 记录 `attempts`、`waitedMs` 与失败 `kind`。

同时把 `scripts/reload-dev-app.mjs` 的就绪文案与注释改为「页面目标已可达」，不再暗示页面可绘制。

可观察标准：

1. 首次采样 `loading`、后续采样 `complete` → `page-health` PASS，`detail.attempts === 2`，整体 `status === 'pass'`。
2. 始终 `loading` 且预算耗尽 → `page-health` FAIL，detail 带 `error`（含"未就绪"）与 `attempts > 1`，整体 `status === 'fail'`（不允许静默通过）。
3. 连接 / 协议错误（`kind` 为 `transport` / `decode` / `protocol`）→ 只调用一次即 FAIL（不把"连不上"当成"还在加载"）。
4. 预算与轮询间隔接受空串 / 非数字 / `NaN` / `Infinity` / 负数时回退默认值并告警，任何输入都不会让等待变成无界循环，也不会把等待悄悄关成 0。
5. 既有 6 条 `scripts/dev-smoke.test.mjs` 用例全部保持通过，断言文本不变。
6. `node --test scripts/dev-smoke.test.mjs scripts/verify-dev-smoke.test.mjs` 通过（本机 `pnpm test:gates` 的失败与本改动无关，见交付报告）。

## 新用户基线

纯本地开发工具（合并收尾冒烟），只依赖 Node 标准库与本机已运行的开发版；不依赖开发机私有路径、模型或凭据；探针仍为只读（不写 localStorage、不提交业务）。

## 计划与项目结构

- `scripts/dev-smoke.mjs`：新增 `waitForPageHealth(evalPage, wsUrl, { timeoutMs, pollMs, wait })` 纯异步函数并导出；`createDevSmoke` 注入 `wait` / `healthTimeoutMs` / `healthPollMs` 三个可选依赖（默认真实 sleep 与 env 覆盖）；把单次 `evaluateInPage` 换成调用它。
- `scripts/dev-smoke.test.mjs`：追加 7 条用例（不改既有断言）：有界等待、预算耗尽、传输错误不重试、预算解析、超时重试、多轮耗尽、非 JSON 载荷。
- `scripts/reload-dev-app.mjs`：2 行文案/注释。

## 命令

- `node --test scripts/dev-smoke.test.mjs scripts/verify-dev-smoke.test.mjs`
- `pnpm test:gates`
- `git diff --check`

## 代码风格

沿用现有注入式依赖（`deps.io` / `deps.probeCdp` …）与 JSDoc 注释风格；判定仍集中在 `createDevSmoke` 内，helper 保持纯异步、无模块级状态。

## 测试策略

先加用例并确认在旧实现上失败，再实现转绿。**实测红/绿**：`首次 loading→complete` 在旧实现上红（旧实现首次 `loading` 直接 FAIL）；`预算耗尽仍 loading` 在旧实现上红（旧实现 detail 没有 `.error` 字段）；`传输错误不重试` 在旧实现上**绿**——旧实现同样只调一次，它是防回归哨兵，不是本次修复的判别器。

评审后补强的用例：预算解析（NaN / Infinity / 负数回退、0 合法）、evaluate 超时在预算内重试、多轮耗尽后 `attempts>1` 且 `wait` 收到 `pollMs`、非 JSON 载荷立即 FAIL。全部走注入桩，不连真实调试端口；真实路径由人工复验。

注意：`scripts/dev-smoke.test.mjs` **未接入** `pnpm test:gates` 与 CI 的显式清单（改动前就是如此），本次不扩大收口范围。

## 假设

1. 白屏是「首次绘制时间跨过采样时刻」的竞态，而不是页面卡死：同一实例内白屏后 3.5–25 s 出现健康帧，且 166 份历史截图中白屏帧 7/166、全部落在启动后 9.6–10.6 s。
2. 30 s 预算足够覆盖 dev 模式首次绘制：历史健康帧最晚出现在启动后 25 s，而探针可能在 page 目标出现后更早开始计时，30 s 给长尾留 ≥5 s 余量（可用 `OMNIMUX_SMOKE_HEALTH_TIMEOUT_MS` 覆盖）。

## 证伪方式

1. 若是页面卡死而非竞态，那么同一实例内不会出现白屏后的健康帧；用历史截图统计可直接证伪（当前数据：5 例出现健康帧，2 例因该实例后续无 ship 而无样本）。
2. 若重试把"真的坏了"也放过，第 2 条用例（始终 loading + 预算耗尽）会失败；若把传输错误当加载中重试，第 3 条用例（调用次数必须为 1）会失败。

## 边界与文档影响

不改页面加载性能、不改壳层白屏（属于 `omnimux-desktop-fork`）、不改其它 5 条断言与退出码语义（`pass=0 / fail=1 / blocked=2 / needs-restart=0`）、不改 ship 的非阻断行为。文档影响：新增本规格；无契约条款变更。
