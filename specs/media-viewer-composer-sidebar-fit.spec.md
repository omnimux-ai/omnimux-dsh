# 规格：图像生成面板输入框去分割线与侧边栏宽度自适应

- Issue: #2453
- 变更范围：`plugins/omnimux/src/client/media-viewer/styles.js`（仅样式，无逻辑改动）

## 1. 目标（Objective）

右侧「图像生成」面板底部的生成输入框（MediaViewerComposer）存在两个视觉问题：

1. 提示词输入区与底部工具栏（生成方式 / 模型 / 参数 / 发送）之间有一条横向分割线，用户要求移除，保持输入框一体、简洁；
2. 输入框整体宽度按 `calc(100% - 64px)` 计算，左右各 32px 固定留白；在侧边栏（约 480–600px 宽）场景下留白占比过大，输入框显得过小，需要按面板宽度比例自适应收缩留白。

成功标准（可测）：

- `.omx-mv-toolbar-bar` 不再有 `border-top`（ computed style `border-top-width: 0px` ），输入框内无横向分割线；
- 输入框左右留白从各 32px 收窄为各 12px（`width: calc(100% - 24px)`），底部间距从 20px 收窄为 12px；
- 宽画布场景下 `max-width: 860px` 居中行为保持不变；
- 输入框聚焦高亮、浮层弹出、提交发送等既有交互不受影响。

## 2. 用户操作旅程与期望界面反馈

1. 用户打开右侧「图像生成」面板（单图预览模式），底部出现生成输入框；
2. 期望：输入框内提示词区与工具栏之间无分割线，视觉为一体式卡片；
3. 期望：输入框宽度贴合侧边栏宽度，左右仅留适度边距（12px），不再显得局促；
4. 用户点击输入框，边框聚焦高亮（极光紫微光）正常；点击工具栏各按钮，浮层正常弹出；输入提示词回车，正常提交。

## 3. 命令（Commands）

- 界面契约与门禁：`pnpm verify:stages`、`node scripts/guard-ui-design.test.mjs`
- 媒体查看器相关测试：`pnpm --filter dsh-omnimux test`（含 media-viewer 契约/E2E 源码断言）
- 浏览器实机验证：工作树内 ego-browser 截图取证（分割线消失、宽度自适应）

## 4. 项目结构（Project Structure）

- 样式：`plugins/omnimux/src/client/media-viewer/styles.js`（第 8 节 MediaViewerComposer 样式块）
- 组件：`plugins/omnimux/src/client/media-viewer/MediaViewerComposer.jsx`（不改）
- 测试：`plugins/omnimux/src/client/media-viewer/*.test.js`

## 5. 代码风格（Code Style）

- 样式一律使用 DSH 设计令牌（`var(--dsw-alias-*)`），禁止裸色硬编码；
- 几何基准遵循 design.md：32px 控件高、8px 圆角基准、大留白克制风格。

## 6. 测试策略（Testing Strategy）

- 静态：界面设计门禁（guard-ui-design）与 stages 校验必须全绿；
- 契约：media-viewer 既有测试不得因样式调整失败；如有锁定旧几何值的断言，同步更新；
- 实机：工作树内浏览器截图验证分割线消失、窄宽度下留白收窄。

## 7. 边界（Boundaries）

- 总是：只改 `styles.js` 第 8 节中 composer 根容器与工具栏的几何/边框声明；保留聚焦高亮与阴影令牌；
- 先问：调整组件结构（JSX）或交互逻辑；
- 绝不做：改设计令牌定义、动其它面板样式、引入新颜色。

## 8. 新用户基线（Product Baseline）

纯客户端样式变更，不依赖任何开发机私有状态；新用户安装后即为最终效果，无默认路径/兜底逻辑变化。

## 假设（Assumptions）

1. 「分割线」指 `.omx-mv-toolbar-bar` 的 `border-top`（输入区与工具栏之间的横线），不含工具栏内部按钮之间的竖向小分隔符；
2. 「适配侧边栏页面比例」指收窄固定留白、宽度随面板自适应，而非改变输入框内部排版；
3. 宽画布（工作台整页）下 860px 最大宽度居中的既有体验需要保留。
