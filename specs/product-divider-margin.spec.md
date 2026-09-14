# 规格文档：产品二级页面分割线左右缩进对齐两侧表单

**文件：** `specs/product-divider-margin.spec.md` ｜ **优先级：** P1 ｜ **模块：** `plugins/omnimux-products`
**关联 Issue：** #1731
**变更面：** Client / Stage / 样式与排版

---

## 1. 业务目标与问题定义

### 1.1 核心痛点
在上一轮添加表单页头与表单区域间分割线后，分割线由于使用了标准块级 full-width 布局，在视口宽度内从最左侧边缘（0px）横贯至最右侧边缘（100vw），顶格铺满了整个窗口，而下方的表单输入框、卡片以及上方的文字均有左右 20px 的内边距。视觉上分割线“顶到了屏幕最外墙”，两端缺乏与表单主体一致的留白与呼吸感。

### 1.2 核心方案
在 `ProductFormPage.jsx` 中为 `<Divider />` 赋予专属样式类（如 `className="omnimux-products-form-divider"`），在 `styles.js` 中设置：
- 左右 margin 为 `20px`（即 `margin: 0 20px`，或者 `margin: 0 20px 0 20px`）；
- 宽度为 `calc(100% - 40px)`；
使分割线起点与终点严格与下方表单内容区（左右 padding 20px）、上方页头标题严格对齐，视觉自然和谐。

---

## 2. 验收标准（Acceptance Criteria）

- **AC-101**：在 `ProductFormPage.jsx` 中，`<Divider />` 具有专属类名 `omnimux-products-form-divider`。
- **AC-102**：`styles.js` 中声明 `.omnimux-products-form-divider` 的左右 margin 为 20px，宽度自适应收缩至两端对齐。
- **AC-103**：实物表单与数字表单在真实浏览器渲染时，分割线左右两侧距离容器边缘均为 20px，与下方表单内容区的左右边距完全一致。
- **AC-104**：自动化测试（单元测试、端到端测试、真实浏览器预演）全部通过，UI 规范静态扫描 0 违规。
