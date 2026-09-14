# 规格文档：产品表单「保存 / 取消」操作按钮迁移至右上角页头

**文件：** `specs/product-form-actions-top-right.spec.md` ｜ **优先级：** P1 ｜ **模块：** `plugins/omnimux-products`
**关联 Issue：** #1742
**变更面：** Client / Stage / 交互与布局

---

## 1. 业务目标与问题定义

### 1.1 核心痛点
当前产品库添加/编辑表单（实物产品与数字产品）的「取消」与「保存产品/保存」按钮放置在页面底部的吸底常驻栏（`omnimux-products-form-footer`）。对于长表单与现代化单页设计：
1. 底部吸底栏占据了额外的纵向视口高度（56px），在笔记本或小屏幕上压缩了表单输入区域；
2. 用户在填写完顶部或中部关键字段时，视线与鼠标需要长距离移动至最底端；
3. 用户明确要求：将「取消」和「保存产品」按钮迁移至页面右上角（与「添加实物产品/编辑产品」标题和面包屑平齐），彻底去除底部多余栏。

### 1.2 核心方案
1. 在 `ProductFormPage.jsx` 中，利用 `dsh-ui-kit` 的 `PageHeader` 内置 `actions` prop 承载操作按钮组：
   - 包含「取消」按钮（`variant="ghost"`）与「保存产品/保存」按钮（`variant="primary"`）。
   - 保留按钮类名 `.omnimux-products-form-actions`，保持原有状态（`disabled={!canSubmit}`、`loading={saving}`）。
2. 彻底移除底部的 `<div className="omnimux-products-form-footer">` 结构。
3. 表单内容区 `omnimux-products-form-scroll` 直接纵向延伸至容器底部，全屏布局通透自如。
4. 原有的表单校验、保存逻辑、未保存防误触离开弹窗（`requestLeave`）等关键交互链路 100% 保持不变。

---

## 2. 验收标准（Acceptance Criteria）

- **AC-101**：在 `ProductFormPage.jsx` 中，`PageHeader` 通过 `actions` 属性挂载包含取消和保存按钮的操作栏，且不包含底部的 `omnimux-products-form-footer`。
- **AC-102**：在真实浏览器渲染下，右上角操作按钮存在且具有正向几何尺寸（`width > 0, height > 0`），其右侧边缘与视口/容器右边界对齐（位于 PageHeader 内部右侧 controls 区域）。
- **AC-103**：底部原本占位的 footer 不复存在，表单滚动容器 `omnimux-products-form-scroll` 纵向延伸到底部。
- **AC-104**：点击「取消」或右上角关闭/返回时，脏状态拦截弹窗正常触发；点击「保存产品」时能正确提交。
- **AC-105**：全量单元测试与端到端测试均更新并通过，UI 规范静态扫描 0 违规。
