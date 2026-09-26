# 创作画布会话隔离与工作区传播安全规格（Canvas Session Isolation & Safe Propagation Spec）

## 1. 目标与背景（Objective & Context）
在复审中发现前端创作画布会话存在 3 项 Medium 缺陷：
1. `CanvasTab.jsx` 中 `omnimux:active-canvas-changed` 事件监听器原守卫逻辑为 `if (eventSessionId && sessionId && eventSessionId !== sessionId) return`。当组件已知 `sessionId`，但外部派发了不带 `sessionId` 的事件时，守卫误放行，导致非目标会话或无会话事件污染当前画布。
2. `ProjectLibraryPage.jsx` 的应用打开/编辑流程中，在会话创建或解析前提前广播了无 `sessionId` 的 `window.dispatchEvent`，造成全局状态竞争和潜在污染。
3. `projectCanvas.js` 的 `activateProjectCanvas` 单例 Tab 激活过程中，`canvasWorkspaceId` 传播未与 `sessionId` 严格联动；若无有效 `sessionId`，不应向单例 Tab 透传该工作区 `meta`。

本次修复目标：
- 严格会话边界守卫：只要当前组件存在 `sessionId`，事件必须匹配该 `sessionId`，不匹配（含事件无 sessionId）直接拦截；
- 移除无 sessionId 提前广播，改由后续流程在拥有合法会话时安全派发；
- `scopedCanvasWorkspaceId = sessionId ? canvasWorkspaceId : ''` 严格联动，无合法 `sessionId` 时禁止向单例 Tab 透传工作区 `meta`；
- 严格遵循零越权文案与零多余元素铁律。

## 2. 用户操作旅程（User Journey & UX Contract）
1. **多会话并行场景**：用户在会话 A 中打开了项目画布，随后在另一个会话 B 中执行项目操作或外部模块触发全局事件。会话 A 的画布标签页因其 `sessionId` 不匹配被严格阻断，不会切换或刷新，保证画布状态的独立性。
2. **AI应用卡片编辑场景**：用户在「项目」页点击某 AI 应用卡片的「编辑」按钮：
   - 界面平滑解除折叠并激活画布；
   - 移除会话创建前的非安全全局事件广播；
   - 在安全解析出项目 `sessionId` 并激活画布后，才向 Tab meta 安全传递工作区与组定位信息；
   - 界面无任何闪烁、无报错弹窗、无非白名单文案侵入。

## 3. 技术规格与核心结构（Technical Specifications）

### 3.1 Commands
- 单测命令：`node plugins/omnimux-workflow/src/client/projects/projectCanvas.test.mjs`
- 库单测命令：`node plugins/omnimux-workflow/src/client/projects/projectLibraryPage.apps.test.mjs`
- 会话单测命令：`node plugins/omnimux-workflow/src/client/projects/canvasTab-session.test.mjs`

### 3.2 Project Structure
- `plugins/omnimux-workflow/src/client/projects/CanvasTab.jsx`: 主监听器与次级监听器增强 sessionId 精确校验
- `plugins/omnimux-workflow/src/client/projects/ProjectLibraryPage.jsx`: 拔除提前无会话广播，传参安全化
- `plugins/omnimux-workflow/src/client/projects/projectCanvas.js`: `scopedCanvasWorkspaceId` 与 `sessionId` 严格联动，单例 Tab `meta` 过滤透传
- 对应单元测试文件：增加防御性单测与隔离验证

### 3.3 Code Style
```javascript
// CanvasTab.jsx 监听器守卫
const eventSessionId = e?.detail?.sessionId
if (sessionId && eventSessionId !== sessionId) {
  return
}

// projectCanvas.js 工作区联动
const canvasWorkspaceId = typeof opts.canvasWorkspaceId === 'string' ? opts.canvasWorkspaceId.trim() : ''
const scopedCanvasWorkspaceId = sessionId ? canvasWorkspaceId : ''
```

### 3.4 Testing Strategy
1. **CanvasTab 监听器隔离测试**：
   - 当前组件有 `sessionId: 's1'`，事件不带 `sessionId` -> 拦截，不更新 `pickedBySession`；
   - 当前组件有 `sessionId: 's1'`，事件带 `sessionId: 's2'` -> 拦截；
   - 当前组件有 `sessionId: 's1'`，事件带 `sessionId: 's1'` -> 放行，更新 `pickedBySession`。
2. **ProjectLibraryPage 提前广播清理测试**：
   - 验证 `handleEditApp` 触发时不再向 window 提前派发未带有 sessionId 的脏事件。
3. **projectCanvas Tab meta 联动测试**：
   - 当无 `sessionId` 时调用 `activateProjectCanvas`，不向 `updateTab` 透传 `canvasWorkspaceId`；
   - 当有 `sessionId` 时调用，安全透传 `canvasWorkspaceId` 与 `focusGroupId`。

### 3.5 Boundaries & Anti-Overdesign（边界与反过度设计）
- **ALWAYS**: 必须 100% 保持既有 UI 视觉与文案不变，所有修改仅限于会话隔离与事件安全传播逻辑。
- **ASK FIRST**: 涉及修改服务端路由或修改非 workflow 插件。
- **NEVER**: 严禁添加任何额外的胶囊 Badge、装饰 Emoji、未在白名单中的说明副标题。

## 4. 成功标准（Success Criteria）
1. 3 处缺陷代码 100% 按审秋毫整改指引修复就绪；
2. 单元测试全部 PASS，覆盖上述三种边界用例；
3. `FRONTEND_SELF_CHECK` 输出 PASS。
