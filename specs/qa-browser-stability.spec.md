# 《工作树真机验收 harness 稳定性修复规格（Spec）》

- **状态**：**已批准（用户直接指令「继续修复你发现的问题」）**
- **生效工作树**：`.worktrees/qa-browser-stability`
- **生效分支**：`agent/qa-browser-stability`
- **归档路径**：`specs/qa-browser-stability.spec.md`

---

## 一、需求背景与目标（Objective）

工作树真机验收（`pnpm verify:app` / `scripts/worktree-app-qa.mjs`）在 2026-10-24 的连续 6 次运行中出现两类间歇失败，导致「功能其实通过、整轮却判红」，并让排障者误以为是产品回归：

1. **清理误报**：`browser-child` 判 `failed / exit-or-close-unconfirmed`，连带 `browser-private-directory` 判失败，报告 `TEST_APP_QA_BROWSER_CLEANUP` + `TEST_APP_QA_CLEANUP_INCOMPLETE`。
2. **挂载失败不可诊断**：`auth-cookie-applied` 起全部断言判红，但报告只有 `pass:false`，没有任何可诊断字段（cookie 注入的返回、目标页 URL、Chrome stderr）。

根因（第 1 类，代码级可证）：三处「等待被托管子进程停止」的实现都以 **stdio `close` 事件**为前置条件（`exited && closed`）。`close` 表示「所有 stdio 流关闭」，而 Chrome 的 crashpad/helper 子进程会继承 stderr 管道，于是**主进程早已退出、`close` 却迟迟不来**，5 秒后判 `stopped=false`——把「stdio 未关」错当「进程未停」。

目标：清理判定以「进程确实退出」为唯一事实依据；挂载失败时报告自带可诊断证据；不降低任何断言的严格度。

## 二、行为契约（Acceptance Contract）

- **C1** 被托管子进程的「已停止」判定必须基于进程退出事件（`exit`，或 `exitCode`/`signalCode` 已置位），不得以 stdio `close` 为前置条件。`close` 仅作为观测记录。
- **C2** SIGTERM 未生效时才升级 SIGKILL；两次等待都必须有界（有默认超时），不得无限等待。
- **C3** 私有目录删除成功才表示所有权释放；进程未确认退出时不得删目录，也不得把目录删除失败伪装成成功。
- **C4** cookie 注入若返回 `success:false`，必须**有界重试一次**（重试前重新 `Network.enable`），断言仍以「注入后置条件成立」为准，不得因重试而放宽。
- **C5** 报告中不得出现 cookie 值、token、`Bearer`、API key 等敏感文本；新增诊断字段必须经既有 `sanitizeFailureText` 处理。
- **C6** 挂载失败时必须记录：cookie 注入结果（含是否重试）、目标页 `location.href` / `readyState`、Chrome stderr 末尾（脱敏截断）。

## 三、用户操作旅程与验收用例

维护者在任务工作树内运行标准入口：

```bash
node scripts/worktree-app-qa.mjs --request <request.json>
```

| 用例 | 期望 |
| --- | --- |
| AC-1 | 子进程已退出但 stdio `close` 未到达时，停止等待**立即返回成功**（回归本 bug） |
| AC-2 | 子进程在超时内不退出时返回失败，且不阻塞超过超时 |
| AC-3 | SIGTERM 无效时升级 SIGKILL，并在第二次等待成功后判成功 |
| AC-4 | cookie 首次 `success:false`、重试 `success:true` 时，断言判通过且记录 `retried:true`；两次都失败时判失败 |
| AC-5 | 清理与挂载诊断字段中不出现 cookie 值或任何凭证形状文本 |

## 四、不在范围

- 不修 `auth-cookie-applied` 间歇失败的**根因**（本次只做有界重试 + 诊断留证；根因未复现，不编造修复）。
- 不改断言集合、不放宽任何几何/可见性判据、不改 `asset-hub` 断言（该断言需要请求显式声明 `omnimux-assets`，属调用方契约）。
- 不改 Dev 应用（45120）与人工验收流程。

## 假设

- 假设 1：`browser-child` 的间歇清理失败由「以 stdio `close` 为停止前置条件」导致；Chrome 的 helper 子进程继承 stderr 管道使 `close` 迟于 `exit`。若该假设为真，则「已退出但未 `close`」的用例（AC-1）在修复前必挂、修复后必过。
- 假设 2：`test-env-bootstrap.mjs` 两处 `waitExit` 与 `worktree-app-qa.mjs` 的 `waitClosed` 是同一缺陷的三个副本，抽成共用实现后行为一致。
- 假设 3：cookie 注入的间歇 `success:false` 是瞬时状态，有界重试可自愈；若重试仍失败，说明不是瞬时问题（此时报告应能直接读出证据）。

## 证伪方式

- 证伪假设 1：给 `waitForChildExit` 传入「只发 `exit`、永不发 `close`」的假子进程。若修复前该用例返回 `false`（超时），假设成立；若修复前就返回 `true`，说明停止判定并非由 `close` 决定，假设被证伪。
- 证伪假设 2：`grep -n "exited && closed" scripts/test-env-bootstrap.mjs scripts/worktree-app-qa.mjs`——若修复后仍有匹配，说明还有未抽干净的副本。
- 证伪假设 3：连续运行 `node scripts/worktree-app-qa.mjs --request <request.json>`，若报告里出现 `authCookieRetried:true` 且断言通过，则瞬时假设成立；若出现 `success:false` 两次仍失败，则记录该证据并按「非瞬时」另开根因调查。
- 可执行验证命令：
  ```bash
  node --test scripts/lib/child-lifecycle.test.mjs
  node --test scripts/worktree-app-qa.test.mjs scripts/worktree-app-qa-journey.test.mjs scripts/worktree-app-qa-task.test.mjs
  pnpm test:gates
  ```

## 五、涉及文件

- 新增：`scripts/lib/child-lifecycle.mjs`（停止等待共用实现）、`scripts/lib/child-lifecycle.test.mjs`
- 修改：`scripts/test-env-bootstrap.mjs`（两处 `waitExit` 改为共用实现）、`scripts/worktree-app-qa.mjs`（`waitClosed` 改为共用实现；cookie 有界重试；挂载诊断字段）、`scripts/governance-manifest.json`（登记新模块与测试）

## 六、验证计划（最小充分命令集）

```bash
node --test scripts/lib/child-lifecycle.test.mjs
node --test scripts/worktree-app-qa.test.mjs scripts/worktree-app-qa-journey.test.mjs scripts/worktree-app-qa-task.test.mjs
node --test scripts/evidence-contract.test.mjs
pnpm test:gates
```
