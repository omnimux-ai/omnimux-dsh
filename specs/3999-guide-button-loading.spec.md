# 运行方式引导按钮点击反馈（Issue #3999）

## 背景

点击「继续（已登录）」「本地 Agent」「使用自己的 Key」「暂时跳过」后无即时反馈，需等设置快照回流才关闭/切换，用户不知道点击是否生效。

## 目标

- `finish()` 开始置 busy，目标按钮立即显示 loading 旋转，其他选择按钮 disabled。
- 登录继续（startOfficial）等待登录回调期间同样置 busy；取消/失败恢复。
- 失败时恢复按钮并显示错误；成功关闭/切换后自然消失。

## 非目标

- 不改引导判定、流程分支与 `/omnimux/runtime/mode` 协议。

## 假设

- dsh-ui-kit Button `loading` 会显示内置 spinner 并自动 disabled。
- busy 状态已覆盖子步骤，选择步骤复用同一状态。

## 证伪方式

- QA `?loggedin=1&delayskip=1`：点击「继续（已登录）」后 500ms 内目标按钮 `aria-busy=true`，其他按钮全部 disabled；若可重复点击或没有 spinner，则失败。
- 延迟写入结束后引导应关闭。

## 验收

- 点击任一选择按钮立即有 loading 状态，其他按钮不可点击；成功关闭，失败恢复。
