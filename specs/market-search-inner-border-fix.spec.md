# 规格文档：Skill 市场搜索框双层嵌套边框消除与样式隔离

## 一、背景与问题定义
1. **搜索框双重嵌套边框**：在 Skill 市场（Plaza）顶部导航栏中，搜索组件自身带有外层圆角矩形边框、背景及放大镜图标，但外层父级容器 `.search-box` 的样式规则 `.search-box input` 使用了全局后代选择器，直接穿透污染到了组件内部的原生 `<input>` 元素上。
2. **视觉杂乱与排版偏移**：内层 `<input>` 被额外施加了 `border: 1px solid`、`border-radius: 8px`、背景以及 `padding: 0 12px 0 32px`，导致内部文字周围出现一圈突兀的圆角边线，形成“输入框里套输入框”的双重边框瑕疵，且占位文字被向右不当挤压。

## 二、验收标准（Acceptance Criteria）
1. **消除内层边框**：
   - 内部文本输入区域的 `border` 彻底清除（`border: none !important`），`border-radius` 归零，`background` 保持完全透明（`background: transparent !important`）。
   - 聚焦时杜绝内层再次出现 outline、聚焦环或独立边框高亮，聚焦状态统一由外层标准搜索容器承载。
2. **样式隔离防穿透**：
   - 将 `.search-box` 针对原生回退输入框的规则限定为直接子元素选择器（如 `.search-box > input`），杜绝穿透到 UI Kit 标准搜索组件的深层节点。
   - 补充 `.search-box [class*="SearchField-root"] input` 以及 `.search-box .dshUk-SearchField-root input` 的纯净防御样式，彻底杜绝双层边框。
3. **尺寸与布局自适应**：
   - 标准搜索组件在 `.search-box` 容器中自适应伸展并保持 100% 宽度，与其他页面的搜索框表现完全一致。

## 三、用户交互关键旅程（Critical User Journey）
1. 用户进入技能市场导航栏，顶部右侧搜索框呈现统一、清爽的单一圆角输入框，内部仅包含放大镜图标与占位提示文案，无任何内部多余边线。
2. 用户点击搜索框进行输入或聚焦时，外框平滑呈现聚焦高亮，内部文字通透自然，无内外抢焦与双重边框现象。
