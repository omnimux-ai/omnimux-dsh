# 规格：AI 网红工作室「更多」菜单行显示 Alpha 角标

- 状态：实现中
- 归属包：`plugins/omnimux`（Alpha 判定单一真源 seam）+ `plugins/omnimux-avatar`（自注册菜单行）
- 关联 Issue：#3985

## 目标

`omnimux-avatar` 已列入 Alpha（#3979），但它的入口由自身注册进官方「更多」菜单（`avatar-more-menu.jsx`），不经过中枢 `explore-more-menu.jsx` 的角标渲染，因此开发版看不到 Alpha 标识。本任务让该行也显示与其它 Alpha 入口一致的 `Alpha` 角标，判定仍复用 `plugin-lifecycle.json` 单一真源。

## 用户操作旅程

1. 开发版点开左侧官方「更多」菜单，「AI 网红工作室」行文案右侧出现 `Alpha` 角标，鼠标悬停 title 显示统一内测说明（与其它 Alpha 行同一份文案）。
2. 若某插件未被标记 Alpha，该行保持纯文案、不出现角标。
3. 点击行仍先关菜单再打开工作台，行为与现状一致。

## 验收用例

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| A1 | `window.__omnimuxSidebar` 暴露判定 | `isAlphaEntry('omnimux-avatar-entry') === true`，`alphaDescription` 与中枢 `ALPHA_DESCRIPTION` 同值 |
| A2 | avatar 菜单内容在 isAlpha=true | 渲染 `.omnimux-avatar-more-alpha`，文本 `Alpha`，title 为统一说明；文案不变 |
| A3 | avatar 菜单内容在 isAlpha=false | children 仍是纯字符串，无角标元素 |
| A4 | 真实浏览器（隔离工作树） | 打开官方「更多」菜单，AI 网红工作室行同时存在文案与 Alpha 角标元素；截图留证 |

## 假设

1. 中枢 `window.__omnimuxSidebar` 是跨插件唯一公共接缝；domain 插件通过它读取 Alpha 判定，不 import 中枢内部模块，不复制第二份 Alpha 名单。
2. 官方「更多」菜单每次展开重新挂载，`isAlpha` 在渲染时求值即可反映最新名单，无需订阅。
3. 角标文案与说明来自中枢 `ALPHA_DESCRIPTION`，保持与其它 Alpha 行逐字一致。

## 证伪方式

1. 单测：`node --test src/client/avatar-more-menu.test.mjs`，若 isAlpha=true 时无 `.omnimux-avatar-more-alpha` 或文案不是 `Alpha`，即证伪 A2。
2. 单测：`node --test src/client/sidebar-coordinator.test.js`，若 `api.isAlphaEntry` 不存在或对 avatar 返回 false，即证伪 A1。
3. 真机：工作树 app-qa 旅程打开「更多」菜单后，若找不到「AI 网红工作室」行内的 Alpha 角标元素，即证伪 A4。

## 非目标

- 不改 avatar 的打开/登录/选中行为；不改正式版排除策略；不新增第二套 Alpha 名单或菜单容器。
