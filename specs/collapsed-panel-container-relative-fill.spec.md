# 规范：会话列收起时右栏面板必须按容器坐标铺满（消除左侧 280px 空白）

Issue: [#1718](https://github.com/omnimux-ai/omnimux-dsh/issues/1718)
回归来源: PR #1679（`2232e08ff`）；正确原形态: PR #1637（`ebf517d04`）

## 1. 目标 (Objective)

**用户报告（附截图）**：在开发版点左侧「项目」入口打开整页工作台后，左侧导航与页面之间出现一条空白栏。

**现场取证（ego 浏览器实测，视口 1920×929，main `6bde9bdde`）**：

| 量 | 值 |
| --- | --- |
| 帧网格 `.dshDesktopFrame` | `280px 0px 1640px`（会话列收起为 0） |
| 右栏容器 `.dshDesktopRightbarSurface` | `position:relative` @ x=280 宽 1640，right=1920（容器本身正确） |
| 容器内面板 `[class*="_panel"]` | `position:absolute; left:280px; width:1640px` → x=560，right=2200 |
| 用户可见结果 | 左侧 280px 空白；面板右侧 280px 被挤出屏幕 |

**根因**：面板的定位祖先就是已经位于 x=280 的右栏容器，而规则按**视口坐标**又加了一次左侧导航宽度
（`left:var(--omnimux-sidebar-width,280px)` + `width:calc(100vw - 280px)`）；`left` 与 `width` 同时生效时
`right:0` 被忽略，因此面板整体右移 280px 且右端溢出。

**修复方向（已现场注入验证）**：该分支改回容器相对坐标 `left:0 / right:0 / width:auto / max-width:none`
（即 `ebf517d04` 的形态），面板与容器完全重合（实测 x=280 宽 1640 right=1920）。
左栏收起分支（`left:0 / width:100vw`）保持不变。

成功标准（可测）：

- 会话列收起且左栏可见时，面板 rect 与右栏容器 rect 的 `left/width/right` 全等，无空白、无溢出。
- 左栏收起分支的规则文本与行为不变。
- 单测与 E2E 断言**限定到具体分支**：把 `:not([data-omnimux-left-collapsed])` 分支改回旧值即失败。

## 2. 命令 (Commands)

```
pnpm --filter omnimux test          # 单测（含 conversation-collapse.test.js、tests/e2e/*.spec.js）
pnpm verify:stages                  # 静态 Stage/adapter 合同
pnpm --filter omnimux build         # 产出本工作树的客户端产物，供浏览器验收
```

浏览器验收：本工作树内启动动态端口（`port: 0`）的本地 harness 服务 + ego-browser 真实内核量测，
随测随清，保留 PNG 与结构化报告。

## 3. 项目结构 (Project Structure)

- 改动：`plugins/omnimux/src/client/conversation-collapse.js`（`CONVERSATION_COLLAPSE_CSS` 的面板分支 + 注释）
- 改动：`plugins/omnimux/src/client/conversation-collapse.test.js`（收紧断言到具体分支）
- 改动：`plugins/omnimux/tests/e2e/canvas-layout-alignment.spec.js`（同步该规则的 E2E 断言）
- 规格：`specs/collapsed-panel-container-relative-fill.spec.md`
- 验收脚本（临时，不入库）：工作树 `tmp/` 下的 harness 服务与量测脚本

## 4. 代码风格 (Code Style)

沿用该文件既有 CSS 常量写法（`html[${CONVERSATION_COLLAPSED_ATTR}]` 前缀、`!important`、紧凑单行）与中文注释风格；
注释只记录「为什么用容器相对坐标」，不写过程叙述。

## 5. 测试策略 (Testing Strategy)

1. `conversation-collapse.test.js`：把面板规则断言从「任意分支含 `left:0`」收紧为
   `:not([data-omnimux-left-collapsed])` 分支含 `left:0` 且**不含**视口左偏移；补一条左栏收起分支断言。
2. `tests/e2e/canvas-layout-alignment.spec.js`：第 1 条断言同步为容器相对坐标形态，第 2 条不变。
3. 真实浏览器：harness 页面复刻实测到的外壳结构（帧网格 + `position:relative` 右栏容器 + 绝对定位面板），
   注入**本工作树源码**运行时产生的 `CONVERSATION_COLLAPSE_CSS`，断言面板 rect 与容器全等；
   同时给出反向对照（旧规则形态必须量到 280px 偏差），证明量测确实能捕获该缺陷。

## 6. 边界 (Boundaries)

- **总是**：只影响会话列收起且左栏可见的分支；沿用既有 CSS 变量与选择器前缀；保持改动最小。
- **先问**：改外壳（Electron）自身样式、改面板默认宽度、调整其它面板状态。
- **绝不**：用 `!important` 改写帧网格列定义（历史缺陷来源）；改动左栏收起分支的行为；
  触碰全屏画布其它交互与媒体查看器逻辑。
