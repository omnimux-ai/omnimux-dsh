# 任务规格：修复输入框尺寸监听器重挂失活与会话栏模型名称重叠回归

- 关联 Issue: #2302
- 目标模块: `plugins/omnimux/src/client/composer-compact.js`, `plugins/omnimux/src/client/composer-compact.test.js`, `plugins/omnimux/tests/e2e/model-name-compact.spec.js`

## 1. 业务目标与问题分析
在会话界面中，当用户调整窗口宽度、打开侧边辅助面板或分屏时，输入框实际可用宽度收窄（如 358px）。
此前 PR #2194 与 PR #2187 规定：在紧凑宽度下（`< 560px` 或 `< 460px`），模型选择器与技能按钮应自动缩短文字并折叠为 28px 纯图标模式。

但实机排查发现：
1. `composer-compact.js` 的 `installComposerCompactObserver` 在初始化后，若 React 发生重新渲染或节点重挂（例如切换会话、迎宾态到输入态切换等），旧的卡片节点脱离文档，而 `MutationObserver` 却在首次观测后被 `disconnect()` 并置空，不再持续感知新挂载的卡片节点；
2. 导致 `ResizeObserver` 依然绑定在废弃节点上，无法触发宽度更新，页面 `data-omnimux-composer-density` 属性永久卡死在初始的 `"full"`（宽屏全量展示）状态；
3. 左侧由市场插件注入的多模态模型按钮（带文字“模型”）与右侧官方对话模型选择按钮（带文字“Gemini 3.8 Flash”）均未折叠，在 358px 的窄宽度下且强制单行不换行的情况下，左侧按钮向右溢出，在 `left: 414px` 位置与右侧按钮直接物理重叠，文字严重混叠。

## 2. 技术方案与变更规格

### 2.1 强化尺寸监听器的目标感知与自愈能力（Observer Resilience）
- 在 `composer-compact.js` 中：
  1. `composerMountObserver` 不应在首次命中后彻底解绑销毁；改为常驻监听子树挂载变化。
  2. 当子树发生变化时，检查当前的 `findComposerTarget(doc)` 是否已经变更或原来的 `observedTarget` 是否已不在当前 `doc` 中（`!observedTarget.isConnected` 或引用改变）。
  3. 若目标变更，自动切换 `ResizeObserver` 监听新目标，并立即执行一次 `applyComposerDensity(doc)`，确保新挂载的卡片立即可感知当前尺寸。
  4. 同时监听 `window.addEventListener('resize')`，无论是否支持 `ResizeObserver`，当窗口尺寸改变或窗口激活（`focus` / `visibilitychange`）时均作为兜底触发一次尺寸重算。

### 2.2 强化 CSS 底栏防溢出与自适应折叠兜底
- 除了依赖 `data-omnimux-composer-density` 外，在 CSS 规则中增加弹性兜底：
  1. 左侧 `[data-composer-card] [class*="tools"]` 声明 `min-width: 0; flex: 1 1 auto; overflow: hidden;`；
  2. 内部插槽 `div[data-slot="conversation.input.left"]` 声明 `min-width: 0; display: flex; flex-shrink: 1; overflow: hidden;`；
  3. 当容器被挤压时，保证左侧工具栏不会直接向右溢出覆盖右侧区域；
  4. 保持右侧模型按钮在 `short` 和 `icon` 状态下 28px 纯图标收敛与平滑过渡。

## 3. 验收标准
1. **重挂感知自愈**：模拟 DOM 节点卸载重建，`data-omnimux-composer-density` 在节点更新后能根据新节点的真实宽度（如 358px）正确更新为 `"icon"`；
2. **纯图标收敛**：在 `< 460px` 宽度下，模型按钮与技能按钮均收敛为 28px 纯图标，文本与下拉箭头隐藏，无文字重叠；
3. **单元测试与 E2E 测试**：全部自动化测试 100% 通过；
4. **实机验证**：通过实机页面或 CDP 验证窄屏下恢复正常单行纯图标展示。
