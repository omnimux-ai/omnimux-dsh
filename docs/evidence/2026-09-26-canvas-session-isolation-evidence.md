# 创作画布会话隔离与工作区传播安全实机预演与验证证据（Evidence Report）

- **验证日期**：2026-09-26
- **测试环境**：OmniMux DSH 隔离开发工作树 (`omnimux-dsh-wt-canvas-session-isolation`)
- **执行角色**：前端开发工程师 裴像素（Pixel）
- **核验目标**：
  1. `CanvasTab.jsx` 针对未带 `sessionId` 事件的误放行漏洞修复
  2. `ProjectLibraryPage.jsx` `handleEditApp` 提前广播无 `sessionId` 事件清理
  3. `projectCanvas.js` `activateProjectCanvas` 中 `scopedCanvasWorkspaceId = sessionId ? canvasWorkspaceId : ''` 严格联动与单例 Tab meta 透传拦截

---

## 一、验证用例与实操矩阵

| 序号 | 验证场景 | 输入条件 | 预期表现 | 实测结果 | 结论 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TC-01 | CanvasTab 存在 sessionId 时收到无 sessionId 事件 | 当前组件 `sessionId: 'sess-active'`, 外部派发 `{ workspaceId: 'ws_foreign' }` | 触发严格守卫 `sessionId && eventSessionId !== sessionId`，直接 return 拦截，不更新 `pickedBySession` | 拦截生效，画布绑定未受污染 | PASS |
| TC-02 | CanvasTab 存在 sessionId 时收到其他 sessionId 事件 | 当前组件 `sessionId: 'sess-active'`, 外部派发 `{ workspaceId: 'ws_foreign', sessionId: 'sess-other' }` | 比对不匹配拦截，不刷新 binding | 拦截生效，会话状态完全隔离 | PASS |
| TC-03 | CanvasTab 存在 sessionId 时收到同 sessionId 事件 | 当前组件 `sessionId: 'sess-active'`, 外部派发 `{ workspaceId: 'ws_target', sessionId: 'sess-active' }` | 比对一致放行，正常更新 session 绑定 | 正常放行，实时同步 | PASS |
| TC-04 | AI应用卡片点击「编辑」 | 点击营销应用卡片菜单的「编辑」项 | 移除提前广播，`activateProjectCanvas` 携带 `canvasWorkspaceId` 统一由后续流程在拥有合法会话时安全派发 | 无提前未就绪事件发出，Tab meta 精准写入 | PASS |
| TC-05 | 无合法 sessionId 调用 activateProjectCanvas | `sessionId: ''` 且传入 `canvasWorkspaceId: 'ws_isolated'` | `scopedCanvasWorkspaceId` 为空串，`service.updateTab` meta 中不包含 `canvasWorkspaceId` | Tab meta 未透传工作区，安全阻断 | PASS |
| TC-06 | 有合法 sessionId 调用 activateProjectCanvas | `sessionId: 'sess-1'` 且传入 `canvasWorkspaceId: 'ws_valid'` | `scopedCanvasWorkspaceId` 为 `'ws_valid'`，安全写入 `nextMeta.canvasWorkspaceId`，并安全广播带 sessionId 的事件 | Tab meta 正确透传，事件携带 sessionId | PASS |

---

## 二、测试执行输出与日志取证

### 1. `canvasTab-session.test.mjs` 测试结果
```
✔ 源码契约：无 targetWorkspaceId 不渲染 CanvasBridge (0.470333ms)
✔ 源码契约：注册 Context Contributor 携带 canvas workspaceId (0.173083ms)
✔ 源码契约 & 行为：CanvasTab 安全注入 workspaces 服务，防御 Cordis 门禁异常 (#2382) (0.512667ms)
✔ 源码契约 & 行为：CanvasTab 事件监听器严格校验 sessionId，杜绝无 sessionId 误放行与跨会话污染 (0.17ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
```

### 2. `projectCanvas.test.mjs` 测试结果
```
✔ activateProjectCanvas closes official details, drops seed Files, opens canvas (0.341042ms)
✔ activateProjectCanvas omits canvasWorkspaceId in tab meta when sessionId is absent (0.113209ms)
✔ activateProjectCanvas propagates canvasWorkspaceId in tab meta and dispatches safe event when sessionId is present (0.138542ms)
✔ activateProjectCanvas uncollapses conversation and forces split after opening canvas (0.173208ms)
ℹ tests 41
ℹ suites 2
ℹ pass 41
ℹ fail 0
```

### 3. `projectLibraryPage.apps.test.mjs` 测试结果
```
✔ 分类栏为三项且顺序是 本地项目 → 共创项目（禁用）→ AI应用 (522.622541ms)
✔ 切到「AI应用」才读清单：卡片按新→旧渲染，标题与分类文案来自 manifest (171.241708ms)
✔ 卡片「编辑」打开所属项目画布并把工作流组写进 tab meta，且不提前广播无 sessionId 事件 (154.80575ms)
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
```

---

## 三、反过度设计与 UI 白名单审计
- **文案审计**：零新增、零修改 UI 文本，100% 保持原有产品经理锁定的文案字典。
- **DOM / 样式审计**：零新增 Badge、胶囊、Emoji、说明副标题。
- **设计规范**：完全遵循 `design.md`，无任何硬编码样式或主题污染。
