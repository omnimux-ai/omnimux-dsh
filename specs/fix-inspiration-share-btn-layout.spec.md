# 修复灵感分享按钮上下折行变形问题规格（Issue #1943）

## 一、问题根因排查
1. **子节点放置错误**：在 `InspirationPreviewModal.jsx` 中，原本将图标节点 `{ICON_SHARE}` 与文案 `<span>分享</span>` 共同作为 `children` 传入 `dsh-ui-kit` 的 `<Button>` 组件中，导致整组子节点被包裹在内部的 `.label` 容器内，无法触发设计系统的水平 slot 布局。
2. **缺乏防挤压与不折行约束**：外部操作容器 `.omnimux-inspiration-modal-header-actions` 与按钮 `.omnimux-inspiration-share-trigger-btn` 未显式声明 `flex-shrink: 0` 和 `white-space: nowrap`，在详情弹窗标题过长或父容器挤压时触发垂直换行折叠，使按钮变形为图标在上、文字在下的方框。

## 二、修复方案
1. **消费标准 prop**：改用 `Button` 组件自带的 `leadingIcon={ICON_SHARE}` 属性传递前置图标，`children` 仅保留纯文案，让按钮在 DOM 层形成标准的 `[slot (16px)] + [label]` 水平结构。
2. **样式加固**：
   - 为 `.omnimux-inspiration-modal-header-actions` 补充 `flex-shrink: 0`，防止标题区域弹性增长时压缩操作栏；
   - 为 `.omnimux-inspiration-share-trigger-btn` 明确声明 `flex-shrink: 0`、`white-space: nowrap`、`display: inline-flex`、`flex-direction: row`，锁定 32px 标准高度与单行横排。

## 三、验收标准
1. **AC-1**：分享按钮在任何窗口尺寸或长标题下，严格保持单行水平排列（左侧为向上箭头图标，右侧为“分享”文本，间距 6px）。
2. **AC-2**：分享按钮高度固定为 32px，圆角 8px，杜绝任何上下折行或正方形变异。
3. **AC-3**：点击展开与收起 Popover 逻辑正常，原有功能全部保持。
