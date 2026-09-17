# 规格文档：产品库卡片移除「复制引用」操作行并收敛为纯标题与描述展示

**文件：** `specs/remove-product-copy-cite.spec.md` ｜ **优先级：** P1 ｜ **模块：** `plugins/omnimux-assets`
**变更面：** Client / ProductsView / 卡片布局
**设计依据：** 用户视觉反馈截图、极简卡片规范、[design.md](../design.md)

---

## 1. 业务目标与需求分析

### 1.1 核心痛点
- 当前产品库的商品微卡底部常驻了「复制引用」整行操作栏，占据了过多的纵向高度与视觉重心；
- 卡片在视觉上显得松散且冗余，用户明确要求移除「复制引用」整行的元素占用，仅保留「标题」和「描述（品牌/卖点/价格）」。

### 1.2 改造方案
1. **DOM 结构精简**：从 `ProductsView.jsx` 的商品卡片容器中彻底移除 `<div className="omnimux-products-card-actions">...</div>` 及其内部的复制按钮；
2. **状态与依赖清理**：移除不再需要的复制状态 `copiedId`、复制触发方法 `handleCopyCite` 以及无用图标引用 `CheckIcon`；
3. **视觉与样式收敛**：卡片下半部分由原来的标题 + 描述 + 操作行收敛为仅有标题与描述两行，保持上下内边距匀称舒适（padding: 10px 12px），卡片高度自适应收敛，更加紧凑精美。

---

## 2. 验收标准（Acceptance Criteria）

### 2.1 卡片元素与内容呈现 (P0)
- **AC-101**：产品卡片底部不再渲染任何「复制引用」按钮或操作区域（无 `.omnimux-products-card-actions` 节点）；
- **AC-102**：产品卡片完整保留卡片标题（`.omnimux-products-card-name`）与副描述/价格（`.omnimux-products-card-sub`）；
- **AC-103**：卡片整体点击依然保持唤起创建/详情抽屉的交互逻辑。

### 2.2 质量与代码规范 (P0)
- **AC-201**：清理无用导入与死代码，不引入任何 lint 警告与类型报错；
- **AC-202**：现有单元测试与端到端测试 100% 通过。
