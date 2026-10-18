# 合集卡操作按钮全局 CSS 污染与 UI 统一修复（Issue #3418）

## 授权与范围

用户在实际 OmniMux Dev 中指出「加入会话」按钮样式不符合预期（截图确认为 Dev 实机），并要求合集卡悬停按钮与普通灵感卡的悬停 CTA 使用同一套 UI。修复范围仅限 `plugins/omnimux-inspiration` 客户端：避免本插件按钮被其它插件注入的全局选择器命中，并把合集卡操作按钮收敛到普通卡既有 CTA 组件/样式体系。不修改 `omnimux-market` 的全局规则、不改其它按钮、不改交互行为或文案。交付包含修复、最小检查、工作树真实浏览器证据、独立评审、PR/Merge Queue、主干同步、开发版物化与工作区清理。

基线 `origin/main`（含 #3413 交付的合集卡操作功能）。

## 与 #3411 契约的关系

本规格取代 #3411 中「合集卡按钮使用独立类名与独立 media 按钮外观」的实现条款；#3411 的功能行为（查看 / 加入会话、失败路径、不发送、不覆盖草稿）与「按钮文字对比度 ≥4.5:1」要求保持不变。历史证据与规格保留原文，不追溯改写。

## 根因

`plugins/omnimux-market/src/client/css.js` 注入

```
button[class*="add"], .Q7WfXG_add { ... !important }
```

会匹配 class 名包含 `add` 的任意按钮。旧合集按钮类 `.omnimux-inspiration-collection-action-add` 命中该规则，被强制 `background: transparent !important`、`width:28px !important`、`color: var(--dsw-alias-label-secondary) !important` 等覆盖，Dev 实机中「加入会话」无底色、宽度塌陷、字体/边框错乱；「查看」不含 `add`，不受影响。工作树 fixture 未加载 market 客户端，因此此前证据未暴露。用户同时指出合集卡按钮与普通卡 CTA 是两套外观。

## 确定行为

- 合集卡操作按钮复用普通灵感卡同一套悬停 CTA 组件与样式类：容器 `.omnimux-inspiration-overlay-cta`，按钮 `.omnimux-inspiration-overlay-cta-btn secondary|primary`，文字 `.omnimux-inspiration-overlay-cta-label`。高度、圆角、图标尺寸、字阶、按钮内边距与等宽行为由共享样式拥有，不再定义独立按钮外观。
- 操作层水平内边距与普通卡对齐，使两卡对应 CTA 按钮的计算宽度严格相等（同一宽度卡片下）。
- 颜色沿用媒体暗房 token（查看=半透明深底白字，加入会话=白底深字），保证浅色与深色主题、任意封面上文字对比度 ≥4.5:1；深色主题下与普通卡 CTA 观感一致。
- 按钮/容器类名不得包含会被其它插件全局选择器命中的子串（如 `add`）；新增回归断言：元素 `matches('button[class*="add"]') === false`，且注入 market 规则原文后计算样式不变。
- 操作层的出现/隐藏、`:hover` / `:focus-within` / `(hover: none)`、`prefers-reduced-motion`、`pointer-events` 行为与 #3411 一致；隐藏时按钮不可点击。
- 查看仍走独立 `onView`，加入会话行为、忙碌态、preview 变体、普通卡无操作层均不变。

## 验收与先后顺序

先落本规格，再改代码与测试；随后在工作树用真实浏览器（既有 fixture + CDP 驱动）注入宿主全局规则复现旧 bug 并验证：共享 CTA 几何/字阶/等宽一致、配色为媒体安全色、像素对比度 ≥4.5:1（浅色主题）、宿主规则生效但对合集 CTA 无影响；证据落盘后再固化 E2E（含 market 规则源码漂移守卫）；跑插件测试与最小静态门禁；独立评审；PR/Merge Queue；主干同步、开发版物化、工作区清理。Dev 实机最终观感由用户确认，Agent 不把 Dev 45120/CDP 诊断冒充交付验收证据。
