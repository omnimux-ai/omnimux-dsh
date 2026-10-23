# Issue #3639 浏览器证据摘要

取证方式：隔离 worktree + 插件自带 dev harness（`scripts/build-canvas.mjs --harness` → 真实 `CanvasEditor`）+ 自建 `listen(0)` runner + ego-browser 真实 Chromium（新建独立 TaskSpace 245，结束 `finish({ keep: [] })`）。每条断言取真实几何 + `getComputedStyle` + `elementFromPoint` 命中测试，不用隐藏 DOM 冒充可见性。

完整报告（含每步 selector、几何、实测文案）与 10 张截图保留在本机：

- `docs/evidence/issue-3639-ui-journey.json`（25,793 B）
- `docs/evidence/issue-3639-ui-journey/`（`01`–`10`，含 `07-context-drill-anchor-500-fixed.png`、`10-context-drill-narrow-900x560-residual.png`）

这两处被 `.git/info/exclude` 本地排除，且仓库 hook 禁止向 worktree 的 `docs/evidence` 复制文件，故未随 PR 提交；本文件是随 PR 提交的摘要。

## 判定

| 路径 | 判定 | 关键实测 |
| --- | --- | --- |
| Dock 面板底部入口卡 | pass | `Boxes` 图标 + 「新建工作流」+「把当前画布保存为可复用模板」+ 右箭头；footer 是容器末子元素，带分隔线 |
| 点入口卡 → 模态 | pass | `.wf-modal-overlay` 1 个、z-index 9999、标题「创建可复用工作流模板」；document 冒泡点击增量 **0**（`stopMenuEvent` 生效，未冒泡） |
| 右键钻取面板入口卡 | pass | 钻取面板同款卡片，点击也打开同一模态 |
| 面板布局不被挤压 | 修复前 partial → 修复后 pass | 见下 |

## 修复前（commit `1e45a8dd0`）

- Dock 静止态（1728×883）：menu `710,111` 253×696；search 156–190 / list 196–727 / footer 735–797；三区两两重叠面积 **0**；全部 `inViewport=true`、`hitTest=true`。
- 右键钻取面板：高度 586px、固定在右键点、无视口夹取 → y=150 完整；**y=300 裁 12px**；**y=500 裁 212px 且 `entryHit=false`（入口卡完全点不到）**，列表也被裁 143px。
- 反事实测量（注入 `.wf-node-menu__footer{display:none}`，测后移除）：面板 586→517px，入口卡区块占 **69px**；无该区块时 y=500 仍裁 143px ⇒ **低锚点溢出是既有问题**，入口卡把阈值从「锚点 > 357」提前到「锚点 > 288」。

## 修复后（commit `996394e59`）

- `ContextMenu`：新增 `ADD_MENU_HEIGHT_ESTIMATE = 600`，`top` 按当前视图真实高度估计夹取；钻取面板加内联 `maxHeight = max(200, innerHeight - top - 8)` 兜底。
- `components.css`：`.wf-node-menu-host` → `.wf-node-menu` → `__container` 打通 flex 链（`min-height: 0`），`.wf-node-menu__list` 内滚动，`__footer` 固定不压缩。
- 1728×883 三个锚点（算术核验 + 截图 `07`）：y=150 → top 150 / bottom 736；y=300 → top 275 / bottom 861；y=500 → top 275 / bottom 861 —— 均 ≤ 883，入口卡完整可见可点。
- 窄视口：900×560 修复前 flex 链未打通、footer 被挤出视口（截图 `10`）；补上内层 flex 后，面板应压缩到视口内、列表内滚动、footer 固定。

## 未覆盖（如实）

1. **「无回调 → 不渲染入口卡」没有自动化锁**：仓库硬门禁拒绝新增渲染式测试文件（esbuild 产物执行＝新增执行风险），追加既有测试亦被拒；浏览器侧也构造不出该状态（两处挂载都传了回调）。本项只有源码契约（可选 prop + 条件渲染）支撑。
2. **窄视口修复后未在浏览器复测**：900×560 / 1280×720 的复测在本次收尾时未完成（截图 `10` 是修复前状态），修复后结论为 CSS 推导，未取几何。
3. 键盘可达性（Tab 聚焦 + Enter 触发）未实测；DOM 为原生 `<button type="button">`。
4. en locale / 暗色主题未覆盖。
5. 模态打开时「添加节点」面板不关闭（透过遮罩可见，与 #3625 模板面板同一形态），属观察项，未在本 PR 处理。
