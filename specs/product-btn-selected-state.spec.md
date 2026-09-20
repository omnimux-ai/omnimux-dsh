# 对话输入框「产品」按钮选中态（Issue #2468）

## 背景
对话输入框底栏「产品」按钮当前选中商品后仅向输入框插入 Chip，按钮本身不变化，用户无法直观看到当前关联了哪个商品，也无法快捷移除或换选。

## 目标
选中商品后按钮本身切换为选中态：商品小图 + 商品名；悬停显示移除按钮；点击按钮可重新激活弹窗换选。用户已在演示页（tmp/product-btn-selected-state-demo.html）验收通过该交互。

## 验收标准
1. 未选中：按钮为购物袋图标 +「产品」，几何与样式与现状一致（28px 高、24px 圆角、13px 字）。
2. 选中：按钮显示 18px 圆形小图（商品封面，取 `product.cover` 预览地址，兜底 `cover_url`/`image`；无图回退购物袋图标）+ 商品名。
3. 按钮 `max-width: 200px`，商品名 `overflow: hidden; text-overflow: ellipsis`，超长省略。
4. 悬停选中态：名称右侧出现 16px 圆形 × 移除按钮；点击 ×（阻止冒泡，不触发弹窗）后按钮恢复默认态，且输入框内对应 `.omnimux-product-chip`（按 `data-product-id` 匹配）一并移除。
5. 点击选中态按钮主体：重新打开产品选择弹窗，换选后按钮与输入框 Chip 同步更新（先移除旧 Chip 再插入新 Chip）。
6. 选中后向输入框插入 Chip 的现有行为保留。
7. 现有 E2E 契约 `plugins/omnimux/tests/e2e/composer-product-btn-hover.spec.js` 不回归。

## 影响范围
- `plugins/omnimux/src/client/components/product-picker/ProductPickerButton.jsx`（主改动）
- 视需要新增/扩展同目录单元测试。

## 新用户基线
纯前端交互增强，不依赖任何开发机私有状态；无商品库数据时按钮行为与现状一致。

## 文档影响
无文档契约变更（纯客户端交互增强）。
