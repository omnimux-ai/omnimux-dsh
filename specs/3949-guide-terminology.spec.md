# 运行方式引导术语统一（Issue #3949）

## 背景

用户要求把「本机助手」统一改为「本地Agent」，把「使用自己的密钥」统一改为「使用自己的 Key」。

## 目标

- `runtime.agent`：中文「本地Agent」，英文「Local Agent」。
- `runtime.keyCta`：中文「使用自己的 Key」，英文「Use your own Key」。
- `runtime.cloudHint` 中同类术语同步。
- QA 选择器与断言同步更新。

## 非目标

- 不改内部 agent id、接口字段、代码注释。
- 不改服务端错误文案与设置 schema 字段描述。

## 假设

- 这两个名字只存在于 `locales.js` 的 UI 文案层；替换显示值不影响任何 id、接口或路由。
- 首跑引导的选择按钮与 agent/key 步骤标题共用同一批 key，改一处即可全链路生效。

## 证伪方式

- 运行 `node scripts/runtime-guide-web-qa.mjs`：若选择步骤或步骤标题仍显示旧文案，或点击新文案后流程失败，则替换不成立。
- `grep -n "本机助手\|使用自己的密钥" plugins/omnimux/src/client/locales.js` 若仍有命中（注释除外），则未完成。

## 验收

- 选择步骤按钮显示「本地Agent」「使用自己的 Key」；agent/key 步骤标题一致。
- 既有点击、保存、跳过流程不变。
- QA 全绿并截图。

## 证据

- `scripts/runtime-guide-web-qa.mjs` 选择器更新后的全绿输出与 `empty-guide.png`。
- `runtime-guide-view.test.js` / `settings-placement.test.js` 目标套件通过。
