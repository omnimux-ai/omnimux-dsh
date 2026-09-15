---
title: "输入框宽度回归原生上限 · 实机预演证据"
id: "composer-native-cap-verify"
date: "2026-09-16"
subsystem: "client"
---

# 输入框宽度回归原生上限 · 实机预演证据

## 环境与方法

- 目标：Dev App（OmniMux，advanced/darwin），视口 1728×994，CDP 9229。
- 方法：
  1. 用 CDP `CSS.getMatchedStylesForNode` 取出**实际命中**输入框卡片的全部 `max-width` 规则（浏览器权威判定，非文本比对）；
  2. 临时把会话列撑宽到 1446px（`grid-template-columns` 注入），模拟用户截图那种宽窗口；
  3. 用最高优先级的等价声明验证目标态并截图。
- 脚本：`tmp/evidence3.mjs`、`tmp/diag.mjs`；数据：`docs/evidence/composer-width-ab.json`；
  截图：`docs/evidence/composer-width-1-before.png`、`composer-width-2-after.png`。

## 权威命中规则（起始页，`CSS.getMatchedStylesForNode`）

| 优先级 | 声明 | 来源 |
| --- | --- | --- |
| 普通 | `var(--dsh-composer-card-max-width)` | 原生 `.Q7WfXG_card` |
| `!important` | `min(780px, calc(100% - 24px))` | 插件 `session-guide/styles.js` |
| `!important` | **`100%`** | 插件 `session-guide/styles.js`（分栏紧凑 / 密度 short·icon 态） |

原生那条是**非** `!important`，被插件的 `!important` 整条压掉。

## 各状态实测（会话列 1446px）

| 页面状态 | 生效规则 | 卡片宽度 | 左右留白 |
| --- | --- | --- | --- |
| 起始页 + 密度 short/icon（**用户截图那种**） | 插件 `100%` | **1406px（几乎占满整列）** | 20 / 20（贴左满铺） |
| 起始页 + 密度 full | 插件 `min(780px, 100% - 24px)` | 780px | 333 / 333（居中） |
| 非起始页 | 原生 `var(--dsh-composer-card-max-width)` | **952px** | 247 / 247（居中） |
| 起始页 + 密度 full，套用本次修复声明 | 原生 token | **952px** | 247 / 247（居中） |

952px = 原生公式在宽列下的封顶值：`920 + 32`。

## 结论

- 用户所见的「随窗口变宽、几乎占满整列」= 插件那条 `max-width: 100% !important` 生效态（1406px）。
- 把该声明的值换成原生 token、并把 `margin-inline` 由 `0` 改为 `auto` 后，同条件为原生上限 952px 且居中。
- 其它状态本来就受 780px 规则约束（居中、不随窗口增长），不属于本次症状，保持不动。

## 验证方法备注

向页面**追加同特异性的后置规则无法验证**：插件会重注入样式表，其原规则始终排在文档序最后，因此同特异性下仍由原规则胜出。
等价验证只能在源码里改该规则，或用 `element.style.setProperty(..., 'important')` 这类内联最高优先级声明模拟目标态。本次采用后者。

## 未覆盖

- 未在本工作树内启动完整应用；证据来自真实 Dev App 渲染进程。
- 触屏、键盘与原生宽度拖拽手柄路径未单独取证。
