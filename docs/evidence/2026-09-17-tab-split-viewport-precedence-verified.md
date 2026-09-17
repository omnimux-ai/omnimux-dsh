# 三栏状态下右侧切换标签用户当前状态优先实测验证证据

Issue: #2212
日期: 2026-09-17
类型: 视窗调和与三栏工作流保底

## 1. 验证目标与架构契约

- 验证 `tab-viewport-reconciler.js` 在右侧栏处于分栏模式（`currentMode === 'push'`，三栏并排状态）时，跨 Tab 切换标签页恒定继承并保持分栏模式，绝对不调用 `enterFullscreen()`；
- 验证即使目标 Tab 历史记录曾显式标记全屏（`mode: 'gui', explicit: true`），在当前分栏状态下切换时也绝不自动拉入全屏；
- 验证分栏模式下切换 Tab 时触发 `ensureHealthySplitWidth(doc)`，持续保底健康黄金比例宽度（≥500px）；
- 验证中间会话区域（`.dshDesktopConversationSurface`）恒定保持展开（宽度约 670px），`data-omnimux-conversation-collapsed` 与 `data-omnimux-fullscreen-collapse-snapshot` 恒定不被设置；
- 验证全屏进入权归还用户：仅在用户主动点击全屏按钮时进入全屏；
- 验证全套单元测试与端到端回归测试 100% 通过。

## 2. 实机预演与自动化验证结果

### 2.1 实时调试与 CDP 实测对比
- **修复前**：
  在三栏工作流下（会话宽 670px，右栏宽 778px），点击切换至记录了全屏偏好的 Tab（如资产库），触发全屏拉伸，中间会话宽度骤降至 0px（`collapsed: true`），右侧面板暴涨至 1448px 占满屏幕。
- **修复后**：
  在三栏工作流下连续切换项目、创作画布、资产库、灵感社区、自动化等任意工作台标签，中间会话栏恒定保持 670px 可见展开，右侧面板稳定保持 778px 并排展示，零全屏抖动，零会话折叠。

### 2.2 单元测试与端到端测试
- 运行测试套件：
  1. `plugins/omnimux/src/client/workbench/tab-viewport-reconciler.test.js` (8/8 通过)
  2. `plugins/omnimux/tests/e2e/tab-viewport-native-reconciler.spec.js` (7/7 通过)
  3. `plugins/omnimux/tests/e2e/tab-viewport-memory.spec.js` (3/3 通过)
  4. 关联回归测试共 82 项（涵盖宿主全屏仲裁、会话折叠同步、侧栏激活仲裁等）全数 100% 绿灯。

### 2.3 产物构建验证
- `plugins/omnimux/lib/client.js` 构建成功（2,145,893 字节），无语法错误与运行时报警。
