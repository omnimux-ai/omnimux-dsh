# 修复共享页头在会话列折叠下误触 macOS 红绿灯避让边距

## 背景与根因

在 macOS 桌面端中，多个插件页面（包括项目/创作画布、发布、数据分析、资产库等）的页头标题与副标题在常规布局下均未靠左对齐，而是相较于下方内容区域向右缩进约 64~84 像素。

根因：`plugins/omnimux/src/client/conversation-box.js` 中存在如下全局样式规则：
```css
html[data-omnimux-left-collapsed] body[data-dsh-desktop-platform="darwin"] .dshUk-PageHeader-pageHeader,
html[data-omnimux-conversation-collapsed] body[data-dsh-desktop-platform="darwin"] .dshUk-PageHeader-pageHeader {
  padding-left: 84px !important;
  box-sizing: border-box !important;
}
```

当用户打开任意工作台插件页面时，系统为保证工作台拥有足够宽度，会自动折叠中间会话列并向 `<html>` 注入 `data-omnimux-conversation-collapsed` 属性。
但是，此时左侧导航栏（宽度约 280 像素）依然处于展开状态，主工作台面板的物理起点在 `left: 280px` 之后，**完全不会接触到左上角 0~84px 的窗口红绿灯按钮**。
上述规则将“会话列折叠”错误作为避让红绿灯的触发条件，导致只要进入这些插件页面，所有共享 `.dshUk-PageHeader-pageHeader` 的页头全部被强制追加了 `padding-left: 84px`，使得标题和副标题右偏，无法与下方内容保持基线对齐。

## 修复目标

1. 彻底移除 `html[data-omnimux-conversation-collapsed]` 对 `.dshUk-PageHeader-pageHeader` 的 84px 内边距覆盖。
2. 仅保留真正顶到视口最左缘时（即左侧栏折叠 `html[data-omnimux-left-collapsed]`）的安全区避让规则。
3. 确保左侧栏展开时，无论会话列折叠与否，所有插件共享页头均保持标准默认内边距（20px），与下方操作行严格同基线靠左对齐。

## 验收标准

- **AC-1**：macOS 桌面端、左侧栏展开且会话列折叠时（全屏工作台常态），`.dshUk-PageHeader-pageHeader` 不应用 84px 安全边距，保持默认 `padding-left: 20px`，标题与描述的左内边距为 0。
- **AC-2**：macOS 桌面端、左侧栏折叠（`html[data-omnimux-left-collapsed]`）时，`.dshUk-PageHeader-pageHeader` 保留 `padding-left: 84px`，有效避让左上角红绿灯按钮。
- **AC-3**：非 macOS 平台下不受任何平台特有边距影响，页头保持默认表现。
- **AC-4**：相关自动化端到端测试更新为符合上述真实几何规范并全量通过。
