# 工作流打组顶栏靠左对齐与调色板收敛实测验证证据

## 1. 验证目标与架构契约
- 验证 `resolveGroupTopBarLayout` 无论是展开态还是折叠态，顶栏 `left` 始终为 `GROUP_CHROME_INSET`，`right` 为 `'auto'`，`transformOrigin` 为 `'bottom left'`；
- 验证顶栏最左侧的「工作流节点名称组件（药丸徽标）」始终与工作流容器边框的左边沿垂直对齐，不再出现向左偏移或不对齐的问题；
- 验证调色板成功由 8 个平铺圆点收敛为单个图标按钮（带 `Palette` 画笔图标与当前颜色指示色块）；
- 验证点击调色板图标按钮后向下弹出 `.wf-group-topbar__palette` 气泡，可切换 8 种高对比度主题色，点击后自动收起下拉，点击外部自动关闭。

## 2. 自动化测试与代码静态验证
- `nodeVisualMath.test.mjs`：
  - `resolveGroupTopBarLayout：始终靠左对齐工作流节点左上角` 测试通过；
- `groupPublishConvergence.test.mjs`：
  - 验证包含 `wf-group-topbar__swatch`、`Palette`、`wf-group-topbar__palette`，测试通过。
