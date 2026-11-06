# 暂时跳过按钮点击无响应（Issue #3951）

## 背景

用户反馈首跑「运行方式」里「暂时跳过，稍后在设置里配置」点击后没有反应。

## 根因

1. 该控件是 ghost Button，点击热区只有文字本身，整行空白区域点不到。
2. `finish('official')` 成功后要等 settings 快照回流才隐藏引导；回流慢时用户看不到任何反馈。
3. 没有 hover/下划线提示，看起来不像可点击控件。

## 目标

- 跳过按钮整行宽、左对齐、可点击；hover 有下划线与颜色反馈。
- 写 official 成功后本地立即 `dismissed=true` 隐藏引导，不依赖快照回流。
- 请求失败保持引导并显示错误。

## 非目标

- 不改跳过写入 official 的语义。
- 不改其它按钮。

## 假设

- `finish()` 的 PUT 响应成功即代表设置已持久化；本地立即隐藏不会掩盖失败（失败会走 catch 并保留引导）。
- 整行宽度按钮不改变原有键盘可访问性（仍是 dsh-ui-kit Button）。

## 证伪方式

- 运行 `node scripts/runtime-guide-web-qa.mjs`：若 `skip-button-wide` 的宽度小于 300，或点击后引导未立即消失，或没有 PUT official，则修复不成立。
- 临时移除 `setDismissed(true)` 后 `guide-hidden-after-skip` 若仍靠快照通过，说明本地隐藏假设未被验证——需观察更慢的快照场景（当前 QA stub 立即刷新，故以源码单测锁定）。

## 验收

- 点击跳过文本任意位置 → 引导立即消失 → PUT `/omnimux/runtime/mode {mode:'official'}`。
- 失败保持引导并显示错误。
- QA 与单测通过。

## 证据

- QA `skip-button-wide`（宽度 411）/ `skip-put-official` / `guide-hidden-after-skip`。
- `runtime-guide-skip.test.js` 锁定 dismissed 与整行按钮契约。
