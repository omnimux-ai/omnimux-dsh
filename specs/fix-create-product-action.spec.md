# 规格文档：修复产品库「添加产品」点击无响应与二级表单唤起链路

**文件：** `specs/fix-create-product-action.spec.md` ｜ **优先级：** P0 ｜ **模块：** `plugins/omnimux-assets` + `plugins/omnimux-products`
**变更面：** Client / Stage / 事件通信 / 动作分流响应
**设计依据：** [specs/remove-sidebar-and-empty-action.spec.md](./remove-sidebar-and-empty-action.spec.md)、[specs/integrate-products-into-assets.spec.md](./integrate-products-into-assets.spec.md)、[specs/product-secondary-page.spec.md](./product-secondary-page.spec.md)、[workbench-split.md](../docs/contracts/workbench-split.md)

---

## 1. 业务目标与缺陷根因

### 1.1 核心痛点
用户在资产库（`omnimux-assets`）的「产品库」Tab 下，点击顶部的 `[+ 添加产品 ⌄]` 展开下拉分流菜单（`实物产品` / `数字产品`）后，点击任意选项均完全无响应，无法弹出或进入录入表单。

### 1.2 根因分析
1. **API 别名调用错误**：在 `plugins/omnimux-assets/src/client/AssetsStage.jsx` 中，`handleOpenCreateProduct` 试图调用 `api.openTab('omnimux-products:library')`。然而根据工作台核心契约（`plugins/omnimux/src/client/workbench.js`），全局对象 `window.__omnimuxWorkbench` 暴露的打开方法为 `.open({ tabId, ... })` 与 `.openWorkbench({ tabId, ... })`，不存在 `openTab` 属性。`typeof api.openTab === 'function'` 恒为 `false`，导致点击事件被直接跳过、静默吞掉，无任何交互反馈。
2. **意图通信与二级页唤起链路缺失**：即便调用 `api.open({ tabId: 'omnimux-products:library' })`，`ProductsStage` 默认以初始 `view = LIST_VIEW` 呈现列表，丢失了用户选择的形态（实物产品 / 数字产品）意图，导致无法直接进入 `ProductFormPage` 二级表单页。

### 1.3 修复方案
1. **修复工作台调度调用**：在 `AssetsStage.jsx` 中，全面兼容 `api.open({ tabId: 'omnimux-products:library' })` 与 `api.openWorkbench` 调用，彻底纠正 `openTab` 错误。
2. **跨插件解耦意图传递**：
   - 在触发打开时，通过 `window.__omnimuxProductsIntent` 暂存意图，并同步派发 `omnimux-products:open` 自定义事件（传递 `{ mode: 'create', kind }` 或 `{ mode: 'edit', productId }`）。
   - 在 `ProductsStage.jsx` 中，新增对 `window.__omnimuxProductsIntent` 的挂载消费与 `omnimux-products:open` 事件监听。一旦捕获意图，立即触发 `handleCreate(kind)` 或 `handleOpenProduct({ id: productId })`，无缝切入对应形态的 `ProductFormPage` 二级表单页。
3. **卡片点击联动**：在 `ProductsView.jsx` 中，点击产品卡片时传递 `product.id`，支持从资产库产品列表点击卡片直接切入该产品的编辑二级页。

---

## 2. 验收标准（Acceptance Criteria）

### 2.1 添加产品交互响应 (P0)
- **AC-101**：在资产库「产品库」选项卡下，点击顶部 `[+ 添加产品 ⌄]` 菜单中的「实物产品」，工作台准确唤起产品库并直接切入「实物产品」新建二级表单。
- **AC-102**：点击「数字产品」，工作台准确唤起产品库并直接切入「数字产品」新建二级表单。
- **AC-103**：在表单页中未做修改点击「← 返回」或「取消」，平滑返回列表，不触发拦截。

### 2.2 产品卡片点击编辑联动 (P0)
- **AC-201**：在资产库「产品库」视图中点击任意产品卡片，工作台准确唤起产品库并直接切入该产品的编辑二级表单。

### 2.3 规范与质量门禁 (P0)
- **AC-301**：所有改动严格遵守跨插件边界规范（无跨插件私有导入），UI 静态门禁 0 违规。
- **AC-302**：单元测试与端到端回归测试 100% 通过。
