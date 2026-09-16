# 实机预演证据 · 图像生成页底部输入框投射条件（Issue #1998）

## 方法

真实 Chromium（headless，CDP 驱动）+ **本工作树源码导出的生产样式表**（`CONVERSATION_COLLAPSE_CSS`）
+ 忠实于真实应用结构的宿主 DOM（外框 / 左栏 / 会话列 / 工作台 / 画布舞台 / 座席 / 卡片）。
夹具见 `harness.html`，明细见 `report.json`。

## 为什么不用 `pnpm verify:app`

`scripts/test-env-bootstrap.mjs:227-247` 在检测到 `$HOME/.omnimux-dev/profiles/omnimux` 时，
把该 profile 的 `node_modules` **直接 symlink** 进隔离 profile；隔离应用因此加载的是
**已物化到开发版的插件包**，而不是本工作树的源码，证明不了本次改动。
本目录采用「真实渲染引擎 + 本工作树生产样式表」的规则级预演，并如实标注边界（见文末）。

## 结果（7/7 通过）

| 场景 | 验收项 | 期望 | 实测 | 截图 |
| --- | --- | --- | --- | --- |
| 画布 + 会话栏收起（右栏未收起） | AC-1 | 投射 | `fixed` / `bottom:10px` / 卡片 640px 且落在画布横向范围内 | `S1-canvas-collapsed.png` |
| 画布 + 会话栏展开 | AC-2 | 不投射 | `sticky`（留在会话列内） | `S2-canvas-expanded.png` |
| 画布 + 右栏全屏 | AC-3 | 投射（不回归） | `fixed` / `bottom:10px` | `S3-canvas-fullscreen.png` |
| 会话栏折叠 **且** 右栏确证收起 | AC-4 | 不投射（防双输入框） | `sticky` | `S4-collapsed-and-rightbar-collapsed.png` |
| 其他插件页（无画布身份）+ 会话栏收起 | AC-5 | 不投射 | `sticky` | `S5-other-page-collapsed.png` |
| 画布身份在后台（`data-visible` 非 true） | AC-6 | 不投射 | `sticky` | `S6-canvas-collapsed-background.png` |
| 左栏收起 + 会话栏收起 | AC-7 | 投射且座席左基准归零 | `fixed` / `left:0` | `S7-canvas-collapsed-left-collapsed.png` |

## 本次预演抓到并已修复的真实缺陷

首轮 6/7，AC-3（右栏全屏）**未投射**。根因：投射选择器改成逗号并集后，
`${SELECTOR} [data-composer-seat]` 展开成 `A, B [data-composer-seat]`——第一条分支丢掉座席后代，
`position:fixed` 被打到画布外框上，全屏路径静默失效。已改为 `:is(A, B)` 包裹，
并在 `canvas-layout-alignment.spec.js` 加锁防止复发。

## 配套检查

- 插件单测：2160 项、通过 2149；失败集合与 `origin/main` 基线**逐条一致**（零新增失败）。
- 契约：`node --test plugins/omnimux/tests/e2e/canvas-layout-alignment.spec.js` 通过。

## 边界（未覆盖）

- 不覆盖「会话媒体卡 → 画布」的产品链路：测试环境是全新会话、没有会话媒体，
  画布身份由脚本注入（只替换「谁来写这些属性」，规则本身仍是构建产物里那一份）。
- 不覆盖真实应用外壳的其它规则（由插件单测与契约断言覆盖）。
- 未在 Electron 渲染进程内复现；桌面壳层行为未单独取证。
