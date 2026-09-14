# 画布输入框显示条件收敛规格（Canvas Composer Display Scope）

- 任务：Issue #1821 · worktree `.worktrees/canvas-composer-scope` · 分支 `feat/canvas-composer-scope`
- 基线：`origin/main` = `89b54fc43`
- 变更面归属：**插件客户端（CSS 常量 + 媒体查看器状态投影）**，非壳层、非官方 DSH 源码。官方宿主 DOM 只作为只读接缝（`[data-composer-seat]` / `[data-composer-card]`）。
- 验证证据落盘路径（E2E 前置门禁要求）：`tmp/canvas-composer-scope/`（截图与结构化报告）

## 1. 业务诉求

用户实机指正：右侧侧边栏「全屏」后，**所有插件页面**底部都浮出原生 DSH 输入框卡片（占位文案随会话阶段变化，实测当前为「发消息或创建任务, / 调用指令, @ 文件或对话」，**不得以文案作为定位键**）。

产品预期（用户 2026-09-14 确认）：

1. 这个底部输入框**只在「图像画布」（图片浏览的看单张大图层）显示**，用途是直接发指令生图/生视频；
2. **工作流画布不显示**；**技能/专家、产品库、资产库、灵感社区等一律不显示**；图片浏览的**时间线（四宫格瀑布流）也不显示**；
3. 显示时机必须**同时满足两个条件**：**处于图像画布** + **右侧栏处于全屏铺满状态**。非全屏（推挤态）不显示；
4. 图像画布下**不允许再出现「时有时无」**——它成为图像画布专属能力，不再取决于进入顺序。

## 2. 现状缺陷根因（已用真机 DOM 实测定位）

| 环节 | 真源 | 行为 |
| --- | --- | --- |
| 1 | `plugins/omnimux/src/client/workbench/focus-state.js:57-61` `resolveDefaultFocus` | 除 `omnimux-workflow:canvas` 与 `omnimux:media-viewer` 外的任一 workbench 插件 Tab → `WORKBENCH_FOCUS.gui` |
| 2 | `plugins/omnimux/src/client/workbench/split-layout.js:352-358` `syncConversationCollapsedForFocus` | `gui → setConversationCollapsed(true)` |
| 3 | `plugins/omnimux/src/client/conversation-collapse.js:53-81` | `html[data-omnimux-conversation-collapsed] [data-composer-seat]` 命中 → `position:fixed; bottom:10px; left:280px; right:0; z-index:100` |
| 4 旁路 | `plugins/omnimux/src/client/chat-toggle.js:127` | 「全屏铺满右侧栏」按钮同样写折叠键 |

即：**显示条件是纯几何/持久化状态键，与「当前是哪个插件舞台」完全无关**。真机实测（`.agent-reports/canvas-composer-scope/03-live-dom-observations.md`，视口 1708×974）证明工作流画布、技能/专家、图像画布三者命中**同一几何**（座席 `fixed 280,858 1428×106 z=100`，卡片 `640×98 @674`），且 `elementFromPoint('994,925')` 顶层元素就是输入框卡片——它确实画在画布之上。

反向那一半：图像画布的默认焦点是 `split` 而非 `gui`，折叠键是否置位取决于**进入顺序**（实测：非收起态进入 → 键不置位 → 座舱退回会话列 `position:sticky`；键一旦置位则**粘住**，切到图像画布不清除）。故「图像画布有时没输入框」不是独立缺陷，而是同一根因的另一面：**图像画布从来没有专属显示条件**。

附带实测（范围大于「全屏」）：**非全屏**下激活工作流画布标签同样置位折叠键，输入框以 fixed 全宽浮在 `push` 形态面板之上。

## 3. 方案：把显示条件从「几何状态」改为「业务舞台身份」

**不隐藏、不打补丁，而是修正因果方向：由消费方（图像画布）声明"我正在看单张大图"，投射规则只服务这个声明。**

### 3.1 图像画布声明（生产者）

媒体查看器根节点（`.omx-media-viewer`）新增两个只读状态属性，由组件自身状态驱动，随时同步：

| 属性 | 取值条件 | 语义 |
| --- | --- | --- |
| `data-omnimux-image-canvas` | `subViewMode === 'single'`（看单张大图，含 2 栏与 3 栏两种列排布） | 图像画布身份 |
| `data-visible` | 该舞台实际在视口内可见（`offsetParent !== null`），每次渲染后同步 | 该舞台是当前前台 |

时间线（`subViewMode === 'grid'`）不声明画布身份 → 不投射。

### 3.2 投射规则（hub 侧唯一定义）

`plugins/omnimux/src/client/conversation-collapse.js` 中，把原先**无条件**的折叠键投射规则替换为「图像画布 + 右侧栏全屏」的组合条件；选择器统一为：

```css
html:has(.omx-media-viewer[data-omnimux-image-canvas][data-visible='true'])
  .dshDesktopFrame[data-rightbar-fullscreen='true'][data-sidebar-collapsed]
  [data-composer-seat]
```

- `data-rightbar-fullscreen='true'` 是壳层写入的「右侧栏全屏铺满」真源（实测：全屏场景恒为 `true`，`push` / 会话基线场景该属性整体消失）。
- `[data-sidebar-collapsed]` 排除左栏收起态，避免与既有收起态规则叠加（收起态本就不投射）。
- 座席定位（`fixed / bottom:10px / left:var(--omnimux-sidebar-width,280px) / right:0 / z-index:100`）与卡片宽度（`640px`）**保持不变**，只更换命中条件。
- 左栏收起时的 `left:0` 变体同理，仅在其后叠加图像画布条件。

### 3.3 明确不做的事

- 不改 `data-omnimux-conversation-collapsed` 的置位逻辑（会话列收起仍是纯粹的布局意图，与输入框解耦）。
- 不改 `focus-state.js` / `split-layout.js` 的焦点与几何行为。
- 不引入新的全局状态键、不新增 `MutationObserver` 级别的跨模块耦合。
- 不删除媒体查看器内已死的 `FloatingBottomComposer.jsx`（#1691 已停止引用）；仅移除其在 `MediaViewerTab` 中遗留的旧投影副作用（`handleToggleSplit` 里改 `data-omnimux-conversation-collapsed` 的旁路写入）。

## 4. 验收标准（可测）

| 编号 | 场景（精确操作） | 期望结果 |
| --- | --- | --- |
| AC-1 | 打开右侧栏面板 → 切到「图片浏览」标签 → 顶部切到「大图浏览模式」→ 右侧栏全屏铺满 | `[data-composer-seat]` 计算样式 `position:fixed`、`bottom:10px`；卡片 `[data-composer-card]` 宽度 640；`elementFromPoint` 在卡片中心命中的顶层元素在卡片子树内 |
| AC-2 | AC-1 状态下切到「四宫格时间线模式」 | 座席不再命中投射规则：`position` 非 `fixed`（回到原生 `sticky`），卡片不再悬浮于画布底端 |
| AC-3 | 切到「工作流画布」插件页（原「项目」全屏） | 同上：无投射，底部不出现输入框 |
| AC-4 | 切到「技能/专家」插件页全屏 | 同上：无投射 |
| AC-5 | 会话基线（非全屏、`push` 态、`data-rightbar-fullscreen` 缺失） | 无投射；会话区内的原生输入框保持可见可用（不得被本改动隐藏） |
| AC-6 | 图像画布已显示输入框后，切到任一其他插件标签再切回 | 切走时不投射；切回且仍为单图 + 全屏时恢复投射（顺序无关，幂等） |
| AC-7 | AC-1 状态下输入框可用性 | 文本域可聚焦、可输入、可发送（几何全绿但点不动视为失败） |
| AC-8 | 左栏展开/收起两态 | 座席左基准分别为 `--omnimux-sidebar-width`(280px) 与 `0`，卡片在右侧工作区内水平居中 |
| AC-9 | 媒体查看器卸载 | `document` 中不存在 `[data-omnimux-image-canvas]`、不残留投射所需的舞台标记 |

## 4.1 实现期修订（2026-09-15，均为真实浏览器实测逼出）

1. **左栏收起态不设排除**：原方案曾用 `:not([data-sidebar-collapsed])` 排除左栏收起态。开发版实测（1708×974）表明左栏收起时全屏面板铺满 `100vw`、`--omnimux-sidebar-width` 变为 90px，排除会让画布失去输入框。改为保留投射，左基准由既有左栏规则归零（AC-8 期望值随之修正为 0）。
2. **左栏收起变体必须写完整选择器**：把带 `html` 前缀的投射选择器追加在 `html[data-omnimux-left-collapsed]` 之后会拼出 `html[…] html:has(…)`——要求 html 是 html 的后代，整条规则永不命中（聚合校验与 CSS 文本断言都看不出来，只有真实浏览器会暴露）。
3. **投射不再依赖会话折叠键**：原 `html[data-omnimux-conversation-collapsed] [data-composer-seat]` 同时承载两类语义——中间列折叠与输入框投射——这正是缺陷根源（Issue #1821）。改造后投射只认「图像画布身份 + 右侧栏全屏」，对进入顺序不再敏感；会话折叠键继续只表达布局意图。

## 5. 取代与冲突处理

1. **`specs/split-dock-panel-void-and-composer-overlap.spec.md`（#1808，最新已合入）**：其 §1.1 验收场景就是「点左侧**项目**打开整页工作台」，AC-2 要求「收起后输入框悬浮于画布底部」、AC-8 要求「收起态下可聚焦、可输入、可发送」。本规格**显式取代该文件 AC-2 与 AC-8 在「非图像画布舞台」范围内的适用性**；其面板几何条款（AC-1/AC-4/AC-5 等）不受影响。本规格同时在该文件头部追加适用范围声明。
2. **`specs/canvas-native-dsh-composer.spec.md`（#1691）AC-1**：把「全屏画布」等同于 `data-omnimux-conversation-collapsed` 的表述，在本规格生效后应读作「图像画布 + 右侧栏全屏」。几何数值（bottom 10px 由 #1747 修订、card 640px）继续有效。
3. **`specs/canvas-native-composer-projection.spec.md`（#1738）**：其「不得对 `[data-conversation-scroll]` 用 `display:none`」的结论继续有效并被保留（座席仍在其中）；其 AC-3 的显示条件按上一条读法收窄。
4. **`specs/canvas-mode-and-card-hover.spec.md`、`specs/canvas-layout-alignment-and-bottom-composer.spec.md`**：其「`FloatingBottomComposer` 自造浮层」的要求已被 #1691 取代（组件零引用、死文件）。本规格沿用原生座席路线。

## 6. 受影响测试与新增覆盖

| 类别 | 文件 | 处置 |
| --- | --- | --- |
| 必然失效 | `plugins/omnimux/tests/e2e/canvas-layout-alignment.spec.js:89-93` | 正则要求折叠属性后**紧邻** `[data-composer-seat]`，条件收窄后不匹配 → 改为「投射规则必须同时含图像画布身份与全屏容器」，并新增反向断言「时间线/非画布态不得命中」 |
| 必须保持绿 | 同文件 `:78-88`（消息流隐藏、`[data-conversation-scroll]` 不得 `display:none`） | 不动 |
| 必须保持绿 | `tests/e2e/sidebar-native-toggle.ego.mjs:33,45`（右栏关闭时会话区输入框须可见） | 不动；纳入回归运行 |
| 附带风险 | `plugins/omnimux/src/client/sidebar-toggle-topbar.test.js:42-46`（面板规则行数 === 2） | 不增删该子串所在行 |
| 新增（单测） | `plugins/omnimux/src/client/media-viewer/image-canvas-state.test.js` | 画布身份判定（single/grid、有无活动媒体）与属性写入口径 |
| 新增（CSS 契约） | `plugins/omnimux/tests/e2e/canvas-layout-alignment.spec.js` | 正/反向选择器断言 |
| 新增（E2E） | `tests/e2e/canvas-composer-scope.ego.mjs` | AC-1/2/3/4/5/6/7/9 的真实浏览器断言 |

## 7. 执行门禁

- 本规格落在**本任务工作树**内（未提交改动即可满足 Spec 门禁）。
- 写 E2E 之前先做隔离环境实机预演，证据落盘 `tmp/canvas-composer-scope/`（须晚于本文件 mtime）。
- 合入前：`pnpm verify:stages`、`pnpm --filter omnimux test`、`pnpm test:ui`、`pnpm test:gates`、本任务工作树内的真实浏览器 Web 验收（动态端口、自清理、留截图+结构化报告）。
- 不直推 `main`；走 PR + Merge Queue；Dev 物化仅为供人工查看，不作为 Agent 交付卡点。
