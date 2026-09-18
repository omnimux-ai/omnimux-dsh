# 规格：修复未建项画布引导弹窗新建项目报 workspaces inject 错误

- **关联 Issue**：#2382
- **类型**：缺陷修复（BugFix）
- **影响范围**：`omnimux-workflow`（右侧画布标签页未建项项目化流程）

## 1. 背景与现状
用户在全新或未创建项目的工作区进入右侧创作画布时，界面正确展示「当前工作区尚未创建项目」专属引导卡片。
点击「创建项目」呼出「新建本地项目」弹窗后，输入项目名称并点击「创建项目」提交时，弹窗底部出现红色报错信息：
`cannot get property "workspaces" without inject`
导致用户无法直接在画布引导卡片完成本地项目的创建与绑定。

## 2. 根本原因
1. `plugins/omnimux-workflow/src/client/index.js` 在 `registerCanvas` 中向 `betterSidebar.registerTab` 注册画布组件（`CanvasTab`）时，仅原样透传了宿主 `props`，未将工作流插件自身已声明并注入的上下文服务（`sessions`, `workspaces`, `layout`, `betterSidebar`）显式传递给 `CanvasTab`；
2. 宿主第三方侧边栏在渲染 Tab 组件时，向组件传递了其自身的 `props.ctx`，该 Context 未声明 `workspaces` 依赖；
3. `CanvasTab.jsx` 在表单提交回调中调用 `runNewProject` 时直接解构了 `ctx?.workspaces`，触发 Cordis 框架对未注入依赖访问时的运行时拦截门禁，抛出 `TypeError: cannot get property "workspaces" without inject`。

## 3. 验收标准与设计规格
- **AC-1**：`index.js` 中 `registerCanvas` 必须显式将 `ctx.sessions`、`ctx.workspaces`、`ctx.layout` 与 `betterSidebar: sidebar` 注入到 `CanvasTab` 的 props 中，与 `registerWorkflowLibraryTab` 的依赖注入契约严格对称；
- **AC-2**：`CanvasTab.jsx` 必须解构声明 `sessions`, `workspaces`, `layout`, `betterSidebar` props，并优先使用这些注入服务；
- **AC-3**：`CanvasTab.jsx` 必须实现安全服务属性获取防护（`safeGetService`），对 `ctx.workspaces`、`ctx.sessions`、`ctx.layout`、`ctx.betterSidebar` 进行安全访问隔离与多级兜底（依次读取 props -> safeGet(ctx) -> 全局 `window.__omnimuxWorkflow` / `window.__omnimuxWorkspaces`），确保即使面对未声明依赖的宿主 Context 访问也不会触发异常或白屏；
- **AC-4**：编写自动化单元测试与契约回归测试，验证在模拟只提供未声明 `workspaces` 的宿主 Context 时，`CanvasTab` 与新建项目链路依然能成功获取有效 `workspaces` 服务并完成创建，绝不抛出 `cannot get property "workspaces" without inject`；
- **AC-5**：全量测试套件 100% 绿灯。
