# 运行方式引导：已登录时主按钮显示「继续（已登录）」（Issue #3947）

## 背景

首跑「运行方式」引导的官方主按钮在用户已经登录时仍显示「登录 OmniMux」，语义不符。

## 目标

- 引导打开时读取登录状态：优先 `window.__omnimuxAuth.isLoggedIn()`（有缓存），否则回退 `/omnimux/auth/status` 的 `logged_in`。
- 已登录：主按钮文案改为「继续（已登录）」；点击直接 `finish('official')`，不打开登录门禁。
- 未登录：保持「登录 OmniMux」与既有 `ensureLogin` 流程。
- 窗口 focus 与 auth gate 订阅时刷新状态。

## 非目标

- 不改登录门禁、账号体系与其它按钮文案。
- 不新增登录方式。

## 假设

- `window.__omnimuxAuth` 是可选的全局 seam；没有它时 `/omnimux/auth/status` 的 `logged_in` 足以表示官方账号状态。
- 已登录用户点击「继续」应等同于完成官方渠道选择，不需要再次弹出登录窗。

## 证伪方式

- 运行 `node scripts/runtime-guide-web-qa.mjs`：`?loggedin=1` 场景若按钮文案不是「继续（已登录）」、或点击后没有 PUT `{mode:'official'}`、或引导未关闭，则实现不成立。
- 若未登录场景按钮文案不再是「登录 OmniMux」，则回归。

## 验收

- 已登录 QA：`loggedin-guide-visible`、`loggedin-button-label`、`loggedin-continue-put`、`loggedin-guide-hidden` 全绿并截图。
- 未登录场景保持原 `choice-official` 文案与 ensureLogin 行为。

## 证据

- `scripts/runtime-guide-web-qa.mjs` 的 loggedin 场景与截图 `loggedin-guide.png` / `loggedin-continue.png`。
- `runtime-guide-login-state.test.js` 锁定文案与分支。
