# 全库下拉筛选选择器统一 999px 全圆角胶囊预演证据

## 1. 验证目标
验证全库所有带箭头的下拉选择框（`DropdownSelect` 触发器）以及各页面筛选按钮，圆角统一收敛为图 2 风格的全圆角胶囊（`border-radius: 999px`），彻底消除 8 像素微圆矩形带来的生硬感。

## 2. 覆盖与计算样式验证
- 主中枢全局样式 (`plugins/omnimux/src/client/styles.js` 的 `HUB_CSS`)：
  ```css
  .dshUk-DropdownSelect-trigger {
    border-radius: 999px !important;
  }
  ```
- 灵感中心私有覆盖清理 (`plugins/omnimux-inspiration/src/client/styles.js`)：
  - `.omnimux-inspiration-filter-select .dshUk-DropdownSelect-trigger`: `border-radius: 999px;`
  - `.omnimux-inspiration-subfilter-select .dshUk-DropdownSelect-trigger`: `border-radius: 999px;`
- 实测效果：
  - 灵感中心、账号管理、数据分析、内容发布等全库下拉选择框计算 `border-radius` 均达到 `999px`。
  - 与分类药丸按钮（如「全部 3」）保持完全一致的椭圆胶囊几何美学。
