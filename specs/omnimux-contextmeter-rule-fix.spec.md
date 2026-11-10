# 修复 ContextMeter 隐藏规则被整条丢弃

Issue: #4034（follow-up）

## 背景与根因

Dev 里「0%」上下文环（ContextMeter）一直显示。实机 CDP 核对 + 样式枚举定位：
`plugins/omnimux/src/client/styles.js` 的 ContextMeter 隐藏规则里含
`[class*="trailing"] > span:has(button[aria-haspopup="dialog"]:has(circle))`——这是 `:has` 嵌套 `:has`（非法选择器）。
CSS 规范：选择器列表中任一选择器非法，**整条规则被浏览器丢弃**，于是同规则里的 `.JdJrwG_root{display:none}` 也从未生效。
（StatsLine 的隐藏是独立规则，未受影响，已正常。）实测把 `.JdJrwG_root{display:none!important}` 单独注入到末尾即可隐藏。

## 目标

- 将「基础类名/属性隐藏」与「卡片内 :has 兜底」拆成两条独立规则，且不出现 `:has` 嵌套；
- 让 `html body [class*="JdJrwG_root"]`（以及 `.JdJrwG_root` / `[class*="ContextMeter_root"]`）这条规则合法、生效，上下文环隐藏。

## 假设

- ContextMeter 元素类名含 `JdJrwG_root`；移除非法嵌套 `:has` 并拆规后，浏览器不再丢弃该规则，`display:none!important` 生效。

## 证伪方式

- 若落地后 Dev 实机里 `[class*="JdJrwG_root"]` 元素 `getComputedStyle().display` 仍不为 `none`，即证伪。
- 若 `node --test plugins/omnimux/src/client/composer-visual.e2e.test.js` 失败即证伪。

## 验收用例

1. HUB_CSS 中存在独立规则同时含 `[class*="JdJrwG_root"]` 与 `display: none !important`；
2. HUB_CSS 不含 `:has(` 嵌套 `:has(`（即无 `:has(circle))` 紧跟 `:has(` 的嵌套写法）；
3. 落地后刷新 Dev，历史会话（有轮次）里「0%」上下文环消失、StatsLine 也不显示。

## 旧标准变更

- `plugins/omnimux/src/client/composer-visual.e2e.test.js` :: `hides ContextMeter token usage progress ring and renders transparent 3D model icon in composer DOM`
  - 原断言：仅 `assert.match(HUB_CSS, /\.JdJrwG_root/)` 与 `button[aria-label*="上下文已用"]`（只证明字符串存在，证明不了规则合法生效）。
  - 必须改的理由：旧规则含 `:has` 嵌套 `:has`（非法）导致整条被丢弃，字符串存在但实际不生效；需断言存在「独立合法规则」且不含已知非法嵌套选择器。
  - 新期望证据：断言 HUB_CSS 存在 `html body [class*="JdJrwG_root"] ... { display: none !important;` 独立规则，且不含 `:has(button[aria-haspopup="dialog"]:has(circle))`。

## 非目标

- 不改宿主官方源码；不改输入框留白与快捷方式排。
