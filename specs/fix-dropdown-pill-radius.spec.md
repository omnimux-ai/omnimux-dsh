# 全库下拉筛选选择器统一样式为图 2 全圆角胶囊规格

## 1. 背景与业务决策
业务负责人在界面走查中指出：
- 灵感中心、账号管理、数据分析等页面的下拉筛选器（如「全部国家 ˇ」、「商品分类 ˇ」等带箭头选择按钮）呈现为 8 像素微圆矩形，显得生硬沉重；
- 与分类药丸按钮（如「全部 3」）的 999 像素全圆角胶囊风格明显不统一；
- 业务明确要求：全库筛选器按钮全面统一为图 2 的全圆角胶囊风格（`border-radius: 999px`），使界面整体更轻盈、柔和、现代一体化。

## 2. 规范定义与改动范围
1. **全局共享层收敛 (`plugins/omnimux/src/client/styles.js`)**：
   - 在主中枢全局样式 `HUB_CSS` 中统一声明：
     ```css
     .dshUk-DropdownSelect-trigger {
       border-radius: 999px !important;
     }
     ```
   - 使全库所有基于公共套件构建的下拉选择器（覆盖灵感中心、账号管理、数据分析、内容发布、产品管理等模块）默认统一继承 999px 全圆角胶囊形态。
2. **局部页面独立覆盖清理 (`plugins/omnimux-inspiration/src/client/styles.js`)**：
   - 将 `.omnimux-inspiration-subfilter-select` 与 `.omnimux-inspiration-filter-select` 中的私有 `border-radius: 8px;` 彻底清理收敛为 `border-radius: 999px;`，消除局部硬编码死角。

## 3. 验收标准
- **AC-1**：全库所有带箭头的下拉选择框（`DropdownSelect` 触发器）圆角统一为 `999px` 全圆角胶囊，告别生硬矩形。
- **AC-2**：灵感中心、账号管理、数据分析等页面的筛选按钮与分类药丸在圆角曲率上达到 100% 视觉一致性。
- **AC-3**：全量单元测试、端到端测试与 UI01~UI10 静态门禁扫描 0 违规通过。
