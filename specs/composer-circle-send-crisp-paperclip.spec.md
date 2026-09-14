# 规格说明：修复输入框曲别针图标发糊与发送按钮圆角被覆盖成方形缺陷

## 1. 缺陷根因分析
1. **曲别针发糊根因**：`.composer-actions button svg` 存在全局强制样式 `width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8;`。原有三层复杂 path 曲别针被强制施加了 1.8px 粗描边与 14px 尺寸缩放，导致路径线条完全粘连、重叠、发虚发糊。
2. **发送按钮方形根因**：`.composer-actions button` 选择器特异性为 `(0, 1, 1)`，声明了 `border-radius: 8px;`。而发送按钮原规则仅为单个类选择器 `.clean-send-btn`（特异性 `0, 1, 0`），其 `border-radius: 50%` 被高权重选择器压制覆盖，导致在页面渲染中依然呈现为圆角方形。

## 2. 验收标准与关键指标

### 2.1 高清线框曲别针矢量
- `PaperclipIcon` 升级为标准高清晰度单线矢量曲别针：
  - `viewBox="0 0 24 24"`
  - `d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"`
  - `fill="none"`，`stroke="currentColor"`，`stroke-width="2"`，`stroke-linecap="round"`，`stroke-linejoin="round"`。
- 在样式表中为 `.composer-actions button.clean-add-btn svg` 显式设置：
  - `width: 19px !important;`
  - `height: 19px !important;`
  - `stroke-width: 2 !important;`
  - 彻底根除线条重叠粘连，呈现极致清晰锐利的曲别针造型。

### 2.2 正圆形纯白发送按钮
- 使用高特异性复合选择器 `.composer-actions button.clean-send-btn` 与 `!important` 强力锁定几何形态：
  - `width: 34px !important;`
  - `height: 34px !important;`
  - `border-radius: 50% !important;`（彻底摆脱 8px 压制，呈现完美正圆形）。
  - `border: none !important;`
  - 深色激活态背景：`background: #ffffff !important;`，图标颜色 `color: #09090b !important;`。
- 内部箭头图标保持居中，悬停时微缩放 1.05。

## 3. 影响范围
- `plugins/omnimux-browser/extension/src/panel/components/icons.tsx`
- `plugins/omnimux-browser/extension/src/panel/styles.css`
- 相关单元测试与真实浏览器实机验证。
