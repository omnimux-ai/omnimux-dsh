# 视频参数生成模式必显回显与浮层面板调宽验证证据

## 一、验证目标
- **目标**：响应用户指示，将生成模式作为外显胶囊按钮的必显核心项（如「全能参考」），并将参数浮层面板基准宽度由 420px 调宽至 500px、高度由 480px 提升至 580px，彻底解决面板过短过窄导致的 UI 挤压变形。
- **环境**：独立 Worktree 隔离工作区 `omnimux-dsh-wt-video-params-mode-width`。

## 二、关键技术核验与实测数据

### 1. 生成模式必显核验
- **修改前表现**：`VideoTriggerBar` 将 `mode` 的 `dropPolicy` 设为 `'hide'`，且受 `showModeUi` 过滤；导致即使选中「全能参考」，按钮也只显示 `16:9 · 720P · 5s`，模式被完全抹去。
- **修改后表现**：
  - `summaryFormatter.ts` 中 `resolveModeText` 只要有模式标签或 ID 即可稳定格式化输出；
  - `VideoTriggerBar.tsx` 将 `mode` 的 `dropPolicy` 设为 `'never'`（必显），确保即使视口压缩，模式与比例图标、箭头同样作为最核心锚点永不丢失；
  - 胶囊完整呈现：`全能参考 · 16:9 · 720P · 5s`。

### 2. 浮层面板宽度与高度调宽核验
- **定位器参数升级**：
  - 基准宽度：`PANEL_WIDTH = 500`（提升 80px）；
  - 最大设计高度：`PANEL_DEFAULT_MAX_HEIGHT = 580`（提升 100px）；
  - 样式表 `.wf-cfg-popover, .wf-video-param-popover` 增加 `min-width: 480px` 保护（小屏幕下受 `max-width: calc(100vw - 24px)` 弹性收缩保护）。
- **界面几何收益**：
  - 4 个生成模式按钮由 90px 扩至 115px+，文字呼吸感极佳；
  - 7 个画幅比例卡片舒展排开，彻底消除换行与文字挤压；
  - 清晰度与有声开关并排区域获得充分横向展开空间，零变形、零溢出。

### 3. 测试覆盖与验证结论
- `summaryFormatter.test.mjs`：模式必显格式化验证 100% 通过；
- `viewportPositioner.test.mjs`：500px 宽度与 580px 限高定位计算 100% 通过；
- 专属 E2E 契约测试通过。
