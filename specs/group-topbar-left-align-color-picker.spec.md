# 工作流打组顶栏靠左对齐与调色板收敛规格 (Spec)

## 一、背景与目标
在当前打组（工作流）操作界面中，工作流顶栏（`GroupTopBar`）存在两个用户痛点：
1. **对齐问题**：此前顶栏在展开态默认使用了靠右对齐（`right: GROUP_CHROME_INSET`），导致工具栏与节点容器及其最左侧的「工作流节点名称药丸」未左对齐，视觉割裂；
2. **宽度溢出**：此前在顶栏中平铺了 8 个调色板颜色圆点，导致工具栏整体过宽，在较小尺寸的工作流容器上方容易溢出容器边界。

本次改造目标：
- **工具栏始终靠左对齐工作流节点名称组件**：无论是展开还是折叠态，工具栏左边缘均对齐工作流容器左边缘（`left: GROUP_CHROME_INSET`，`right: auto`，`transform: translate(0, -100%)`），使名称组件与工作流边框严丝合缝；
- **调色板收敛为单个图标下拉切换**：将平铺的 8 个色点收敛为一个调色板图标按钮（带有当前组颜色的色块/画笔图标），点击后弹出调色板悬浮气泡供用户选择切换，选择后自动收起下拉，大幅缩减工具栏宽度，极致紧凑。

---

## 二、验收标准 (Acceptance Criteria)

### 场景 1：顶栏左对齐
- `resolveGroupTopBarLayout` 无论是展开态还是折叠态，`left` 始终为 `GROUP_CHROME_INSET`，`right` 为 `'auto'`；
- `transform` 为 `translate(0, -100%) scale(${inverseScale})`，`transformOrigin` 为 `'bottom left'`；
- 使得顶栏最左侧的工作流药丸标题与工作流容器左上角垂直对齐。

### 场景 2：颜色收敛为图标按钮与下拉选择
- `GroupTopBar` 中不再平铺横排的 8 个色点；
- 展示一个颜色触发按钮（`Palette` 图标与当前色彩小圆点结合）；
- 点击该按钮后，在按钮下方弹出包含 8 种高对比度色点的浮动菜单（包含首位中性重置）；
- 点击任一颜色后即时修改工作流主题色，并自动收起下拉弹窗；点击外部空白处自动关闭弹窗。

---

## 三、测试与门禁
1. 单元测试：`nodeVisualMath.test.mjs` 验证 `resolveGroupTopBarLayout` 始终返回 `left: GROUP_CHROME_INSET`，`right: 'auto'` 与 `transformOrigin: 'bottom left'`；
2. 契约测试：`groupPublishConvergence.test.mjs` 验证顶栏包含调色板触发按钮与下拉气泡；
3. 端到端测试：`workflow-group-publish.spec.js` 验证左对齐与收敛后的布局。
