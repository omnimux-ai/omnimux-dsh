# 项目卡片「更多操作」菜单排版修复（Issue #1858）

- 任务：`.worktrees/workflow-project-menu-issue-1858`（分支 `agent/workflow-project-menu-issue-1858`）
- 日期：2026-09-15
- 类型：BugFix（界面排版回归）

## 1. 问题

工作流「项目」页，项目文件夹卡片右下角「更多操作」（三点）按钮展开的菜单 UI 异常：

- 每个菜单项的图标被单独挤到文字**上方另起一行**，自上而下呈现为：铅笔图标 → 「重命名」→ 垃圾桶图标 → 「解散项目」；
- 菜单面板高度因此异常膨胀，不再是紧凑的两行菜单，图标与文字之间也没有合理的水平排布与间距。

放大取证图：`tmp/menu-bug/crop-zoom2.png`。

## 2. 根因（必须在真实浏览器用计算样式钉死，禁止猜测）

`plugins/omnimux-workflow/src/client/projects/ProjectFolderCard.jsx` 把图标作为 **children** 传给组件库 `Button`：

```jsx
<Button variant="ghost" role="menuitem" onClick={...}><IconEditOutline16 size={16}/>{t('projects.rename')}</Button>
```

组件库 `Button` 的契约是：`leadingIcon`/`trailingIcon` 渲染进 `.slot`（`display:inline-flex; width:16px; height:16px; flex:none`），而 `children` 渲染进 `.label`（只有 `min-width:0`，无 `display` 与排布规则）。图标组件只输出裸 `<svg>`，自身不带 display 样式。

因此图标落到 `.label` 这个普通行内容器里，而宿主 Tailwind preflight 的基线规则

```
img,svg,video,canvas,audio,iframe,embed,object{vertical-align:middle;display:block}
```

把所有 `<svg>` 变成块级盒 → 在 `.label` 内强制断行，图标独占一行、文字另起一行，`.label` 高度翻倍，菜单面板随之膨胀。

**待实测确认项**（浏览器计算样式）：

- `.label` 的 `display`；
- `.label` 内 `svg` 的 `display` / `width` / `height`；
- `button[role=menuitem]` 的 `display` / `flex-direction`；
- 菜单面板 `width` / `padding` / 各项盒模型。

## 3. 目标

菜单恢复为紧凑的两行菜单：每项**左图标 + 右文字同一行**，几何符合 design.md 的 Popover 契约，键盘与触屏可达，浅色/深色主题均正常。

## 4. 验收标准（可测试，禁止以静态字符串断言充当验收）

### 4.1 菜单项排版（浏览器实测 + 自动化回归）

- **AC-1** 每个菜单项 DOM 中，图标位于组件库 `.slot` 容器内（即走 `leadingIcon` 契约），**不再**作为 `children` 落入 `.label`。
- **AC-2** 每个菜单项内「图标盒」与「文字盒」的垂直中心线一致，且两者**水平并排**：图标右边缘 ≤ 文字左边缘，且二者顶边之差 < 2px（同一行，不换行）。
- **AC-3** 菜单项高度与组件库按钮一致：`32px`（允许 ±1px 圆整误差）；菜单面板总高 ≈ 2×32 + 面板上下内边距 + 项间距，不再出现「图标行 + 文字行」的翻倍高度。
- **AC-4** 图标尺寸 16×16，`display` 计算值不导致 `.label` 内断行。

### 4.2 菜单面板几何（浏览器实测，对齐 design.md Popover 契约）

- **AC-5** 面板：`border-radius: 10px`；`padding: 4px~6px`；`border: 1px solid`（`--dsw-alias-border-l2`）；背景 `--dsw-alias-bg-overlay`（主题感知）；阴影存在且与 design.md 浮层规格同量级。
- **AC-6** 面板有确定宽度（显式 `width` 或 `min-width`），不再由内容 max-content 决定；两个菜单项等宽、`width:100%`。
- **AC-7** 菜单项左右留白一致（`padding: 0 12px` 量级），图标与文字水平间距为既有令牌值（`8px`）。
- **AC-8** 菜单面板不被卡片容器裁切（面板矩形完整落在视口内且 `overflow` 不裁切）；不溢出卡片所在滚动容器。

### 4.3 交互与可达性（浏览器实测）

- **AC-9** 打开菜单后焦点落在第一个 `menuitem`。
- **AC-10** `Esc` 关闭菜单并把焦点回移到「更多操作」按钮（`aria-expanded` 回到 `false`）。
- **AC-11** `Tab` 关闭菜单。
- **AC-12** `ArrowDown` / `ArrowUp` 在两个菜单项之间循环移动焦点；`Home` 到首项、`End` 到末项。
- **AC-13** 点击菜单外部关闭菜单。
- **AC-12b** `role="menu"` 与每个 `role="menuitem"` 语义保留。
- **AC-14** 触屏（`pointer: coarse`）下菜单项最小点按区域不小于 44×44。
- **AC-15** 浅色与深色主题下面板背景、描边、文字、图标均可辨识（对比正常、无透明穿透）。

### 4.5 源码约束（静态门禁）

- **AC-16** 修改仅落在 `plugins/omnimux-workflow/` 内；不触碰 `dsh-ui-kit` 与官方 DSH 源码。
- **AC-17** 通过 `pnpm --filter omnimux-workflow test`、UI 设计硬门禁（`scripts/guard-ui-design.mjs` 规则集）与 `pnpm verify:stages`。

## 5. 修复方案（最小变更）

1. `ProjectFolderCard.jsx`：两个菜单项的图标由 children 改为 `leadingIcon={<IconEditOutline16 />}` 契约（对标 `ProjectLibraryPage.jsx` 第 461 行既有正确范例），保留 `role="menuitem"` 与既有焦点管理。
2. `folderStyles.js`：把 `.omnimux-folder-menu` 与 `[role=menuitem]` 的几何做正确——显式 `min-width`、`padding: 4px`、`border-radius: 10px`、项间距与左右留白，全部复用既有 `--dsw-alias-*` 设计令牌，不引入裸色。

## 6. 验证策略

- **真实浏览器**：在本任务隔离工作树内用 ego-browser 打开工作流「项目」页，真实点开菜单，采集计算样式与截图；覆盖浅色 + 深色主题、鼠标路径与键盘路径（Esc / Tab / 方向键 / Home / End / 点击外部）。证据落 `.workbuddy/evidence/` 与 `qa-evidence/`。
- **自动化回归**：新增客户端测试，锁住「菜单项图标走 `leadingIcon` 契约、不落 children/.label」与菜单几何约束，防复发。
- **门禁**：`pnpm --filter omnimux-workflow test` + `pnpm verify:stages` + 相关静态门禁，如实报告未跑项原因。

## 7. 边界

- **总是**：改前先跑既有测试；改后跑本包测试与相关门禁；保留 `role=menu` / `role=menuitem` 语义与焦点管理。
- **先问**：需要改动组件库契约或新增跨插件依赖时。
- **绝不**：修改 `dsh-ui-kit` 或官方 DSH 源码；把测试简化成静态字符串断言充当验收；未经用户确认合并代码。

## 8. 假设与待确认

- 假设菜单项沿用组件库 `Button`（`variant="ghost"`），不另起菜单元件。
- 假设「解散项目」入口文案与行为不变，本次只修排版与几何。
- 待确认：菜单是否需要在卡片边缘自动翻转（翻转逻辑超出本次 BugFix 范围，若实测未溢出则不实现）。
