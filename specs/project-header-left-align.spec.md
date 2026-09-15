# 创作画布页头标题与描述左对齐

## 背景与根因

「项目」页（`omnimux-workflow:library`，界面标题「创作画布」）在 macOS 桌面端下，页头标题与描述被推到页面中部、且互相错位，用户看到的是「居中」效果。

根因：`plugins/omnimux/src/client/conversation-box.js` 的 macOS 红绿灯安全区规则（#1558 引入）使用了一组过宽的选择器：

```css
body[data-dsh-desktop-platform="darwin"] .omnimux-workflow-library-page .dshUk-PageHeader-pageHeader,
body[data-dsh-desktop-platform="darwin"] .omnimux-workflow-library-page .dshUk-PageHeader-heading,
body[data-dsh-desktop-platform="darwin"] .omnimux-workflow-library-page [class*="PageHeader"],
```

`[class*="PageHeader"]` 是通配选择器，命中 PageHeader 组件内部**每一层**类名含 `PageHeader` 的元素（`pageHeader` → `heading` → `titleRow` → `title` / `subtitle` / `controls`）。`padding-left: 84px` 因此在嵌套层级上累加：

| 元素 | 命中层数 | 累计左内边距 |
| --- | --- | --- |
| 标题 `.title` | 4 层 | 336px |
| 描述 `.subtitle` | 3 层 | 252px |

标题比描述多缩进 84px，两者都不再贴左，视觉上落在页面中部。

真实 Chrome 复现（1800×1000 视口，真实 PageHeader 样式与 DOM）：

| 环境 | 标题距容器左 | 描述距容器左 | 按钮行距容器左 |
| --- | --- | --- | --- |
| Web 默认（无该规则） | 20px | 20px | 0px |
| 模拟 macOS（启用该规则） | 252px | 168px | 0px |

标题与描述相差 84px，与「每层累加 84px」一致。

## 目标

页头标题与描述在常规布局下靠左对齐，与下方「新建项目」按钮同一左基线；macOS 红绿灯安全区只在内容区真正贴到窗口左缘时生效。

## 验收标准

- **AC-1**：macOS 桌面端、左侧栏展开（默认布局）时，`.dshUk-PageHeader-title` 与 `.dshUk-PageHeader-subtitle` 的左内边距均为 0，左边界一致（差值 ≤ 2px），且与 `.omnimux-workflow-library-action-row` 的内容左基线一致（差值 ≤ 24px）。
- **AC-2**：macOS 桌面端、左侧栏折叠（`html[data-omnimux-left-collapsed]`）时，`.dshUk-PageHeader-pageHeader` 仍保留 `padding-left: 84px`，页头内容避开窗口交通灯。
- **AC-3**：会话列折叠（`html[data-omnimux-conversation-collapsed]`）时同样保留 84px 安全区。
- **AC-4**：PageHeader 组件内部的 `heading` / `titleRow` / `title` / `subtitle` / `controls` 在任何状态下都不被该安全区规则命中（左内边距保持组件自身值）。
- **AC-5**：非 macOS 平台（无 `data-dsh-desktop-platform="darwin"`）行为不变，标题与描述仍为左对齐。

## 边界与不变量

- 右侧面板全屏态在左侧栏展开时 `left: var(--omnimux-sidebar-width)`，内容区不贴窗口左缘，不需要安全区；左侧栏折叠时面板才铺满 100vw，由 AC-2 覆盖。
- 不改动 PageHeader 组件本身（`dsh-ui-kit`）与其他页面的安全区行为。
- 不引入新的宿主选择器约定。

## 验证方式

- 隔离工作树内、真实 Chrome 渲染真实 PageHeader 样式与 DOM，覆盖左侧栏展开 / 折叠两种状态，读取 `getBoundingClientRect` 与计算样式：`tmp/verify-header-align.mjs`。
- 现有 `plugins/omnimux` 单测与静态检查保持通过。

## 范围外

- 其他页面（账号、资产库、数据分析等）页头的对齐表现。
- PageHeader 组件自身的排版规则。
