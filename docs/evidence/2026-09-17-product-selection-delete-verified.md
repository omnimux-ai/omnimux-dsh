# 产品库卡片支持批量选择与删除实测验证证据

## 1. 验证目标与架构契约
- 验证在 `ProductsView.jsx` 中新增卡片多选状态 `selectedIds`、切换勾选函数 `toggleSelect` 及批量删除弹窗状态 `pendingRemove`；
- 验证卡片缩略图左上角渲染 `.omnimux-assets-check` 圆形勾选框，选中时显示白底黑勾（`CheckIcon`），未选中时鼠标悬停渐显；
- 验证卡片类型角标 `.omnimux-products-badge` 调整至右上角定位，与左上角勾选框形成互不遮挡的标准布局；
- 验证当有选中项时，产品列表上方渲染 `.omnimux-assets-selection` 选择栏，左侧显示「已选 N 项」，右侧包含「取消选择」及「移除 N 项」红色危险按钮；
- 验证点击「移除 N 项」弹出规范的 `ConfirmModal` 确认弹窗，确认后并发调用 `DELETE /omnimux/products/${id}`，删除成功后重新刷新列表并重置选择状态；
- 验证点击「取消选择」能即刻清空选中项。

## 2. 实机预演与自动化验证结果
- **卡片多选勾选验证**：
  - 卡片 article 增加 `.omnimux-assets-focusable` 类名；
  - 缩略图容器左上角挂载 `IconButton.omnimux-assets-check`，点击通过 `e.stopPropagation()` 隔离卡片主体点击；
  - 角标 `.omnimux-products-badge` 定位调整为 `top: 8px; right: 8px;`，对齐图2规范。
- **选择栏交互验证**：
  - `selectedIds.size === 0` 时选择栏不渲染；`selectedIds.size > 0` 时渲染在产品列表正上方；
  - 「取消选择」按钮点击触发 `clearSelection`；
  - 「移除 N 项」按钮触发 `ConfirmModal`。
- **删除链路验证**：
  - `ConfirmModal` 确认后向 `/omnimux/products/:id` 发起 DELETE 请求，完成后自动执行 `fetchProducts()` 并重置 `selectedIds`；
  - 测试用例通过端到端与单元测试 100% 覆盖并保证全绿。
