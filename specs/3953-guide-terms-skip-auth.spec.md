# 运行方式引导：术语统一 + 跳过按钮 + 登录状态刷新（Issue #3949 / #3951 / #3953）

## 背景

1. 用户要求把「本机助手」改为「本地Agent」，「使用自己的密钥」改为「使用自己的 Key」。
2. 用户反馈「暂时跳过，稍后在设置里配置」点击无响应：ghost 按钮热区只有文字，且成功后要等 settings 快照回流才隐藏引导。
3. #3947 的登录状态刷新在负缓存下短路：focus/subscribe 不发起真实状态请求。

## 目标

- `runtime.agent` →「本地Agent / Local Agent」；`runtime.keyCta`、`runtime.key` →「使用自己的 Key / Use your own Key」；`runtime.cloudHint` 同步。
- 跳过按钮整行 100% 宽、左对齐、hover 下划线；写 official 成功后本地 `dismissed` 立即隐藏引导，失败保留并显示错误。
- focus / subscribe 调用 `__omnimuxAuth.getStatus(false)` 强制 HTTP 刷新；非 ok/401 视为未登录。
- QA 增加选择/步骤标题、skip-button-wide、负缓存与 focus 刷新断言与截图。

## 非目标

- 不改内部 id、接口字段、设置 schema 字段描述。
- 不改跳过写入 official 的语义。
- 不改登录门禁与已合入的按钮文案。

## 假设

- 术语只存在于 `locales.js` 与旧 e2e 自造字典；替换显示值不影响任何 id/接口。
- `finish()` PUT 成功即代表设置已持久化；本地立即隐藏不会掩盖失败（失败走 catch 保留引导）。

## 证伪方式

- `node scripts/runtime-guide-web-qa.mjs`：若选择按钮/步骤标题仍显示旧术语，或 skip-button-wide 宽度 <300，或点击跳过没有 PUT official，则实现不成立；`?negativecache=1&remoteauth=1` / `?focusauth=1` 若按钮不更新，则登录刷新不成立。
- 反例记录：临时把 `loggedIn` 强制 false / 删除 skip-button class，对应断言必须变红，回退后全绿。
- `grep -n "本机助手\|使用自己的密钥" plugins/omnimux/src/client/locales.js` 若无命中（注释除外）则术语完成。

## 验收

- 选择步骤显示「本地Agent」「使用自己的 Key」；agent/key 步骤标题一致；中英文值正确。
- 跳过按钮整行可点击（实测宽度 632px），点击后引导立即消失并 PUT official；失败保留并显示错误。
- 既有三选一、BYOK 保存、已配置不显示等流程不变。
- 负缓存 + focus 场景按钮更新正确。

## 旧标准变更

- `plugins/omnimux/tests/e2e/runtime-guide-choice.e2e.test.mjs` :: `未选过运行方式时出现三选一`
- `plugins/omnimux/tests/e2e/runtime-guide-choice.e2e.test.mjs` :: `选「自己的密钥」出表单，测试通过后写入运行方式并关闭`

说明：旧 e2e 使用自造字典断言旧术语；同步改为「本地Agent」「使用自己的 Key」，测试意图不变。

## 证据

- QA 全绿（choice/step-title/skip-button-wide/skip-put-official），截图 `empty-guide.png`、`after-skip.png`。
- `runtime-guide-skip.test.js` 与旧 e2e 更新；全量包测与 clean main 基线一致（仅既有 HOME 依赖 2 失败）。
