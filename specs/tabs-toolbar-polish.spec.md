# 项目详情页选项卡说明与新建按键对标设计规范规格说明

- 工作区：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-tabs-toolbar-polish`
- 分支：`agent/workflow-tabs-toolbar-polish`
- 日期：2026-09-17
- 目标：淘汰项目详情页选项卡中的裸字符图标 `ⓘ`，统一使用标准矢量图标；将原生新建创作页按钮升级为规范组件库主按键，对标《OmniMux UI 设计规范》（`design.md` v2.0 §2.1 & §2.5）

## 1. 问题陈述

1. **裸字符充当图标（UI04 门禁）**：`ProjectLibraryPage.jsx` 中，选项卡「创作页」和「项目资产」使用了 Unicode 字符 `ⓘ` 充当说明图标，严重违背设计规范；
2. **原生按键脱节（§2.1 几何门禁）**：新建创作页按钮手写为 `<button className="omnimux-create-page-btn">`，缺少标准的主操作按键几何基准、8px 圆角与状态过渡。

## 2. 规范对标要求

1. **选项卡信息图标（§2.5 矢量图标体系）**：
   - 移除所有裸字符 `ⓘ`；
   - 统一引入 `@deepseek-ai/dsh-client-ui-primitives` 中的 `IconInfoOutline14`（或 `IconInfoOutline16`），垂直居中对齐，文本色彩继承 `var(--dsw-alias-label-tertiary)`，悬停提亮至 `var(--dsw-alias-label-secondary)`；
2. **新建创作页按键（§2.1 & §5.3 主按键契约）**：
   - 升级为组件库 `<Button variant="primary" leadingIcon={<IconPlusOutline16 />}>`；
   - 遵循 32px 控件高基准与 8px 圆角规范，保持深浅主题反色高对比度质感。

## 3. 验收标准

- **AC-1**：选项卡彻底移除字符 `ⓘ`，使用标准矢量 SVG 图标替代。
- **AC-2**：新建创作页操作统一采用组件库 `Button variant="primary"`，携带加号图标。
- **AC-3**：全量测试 100% 通过，UI01~UI10 静态门禁 0 违规。
