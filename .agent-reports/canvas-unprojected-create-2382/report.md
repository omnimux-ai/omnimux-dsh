# 验证报告：未建项画布引导弹窗创建项目异常修复

- **关联 Issue**：#2382
- **时间**：2026-09-18
- **测试环境**：Worktree `agent/workflow-canvas-unprojected-create-2382`

## 1. 验证目标
验证在未建项的工作区中，当用户点击创作画布中间的「创建项目」按钮，并在弹出的「新建本地项目」弹窗中输入项目名称提交时：
1. `CanvasTab` 与弹窗提交处理逻辑能够安全、正确地获取 `workspaces`、`sessions`、`layout` 与 `betterSidebar` 服务；
2. 彻底杜绝 Cordis 框架因未在组件 Context 声明 `workspaces` 依赖而抛出 `cannot get property "workspaces" without inject` 错误；
3. 项目能够成功创建，并无缝进入会话与画布工作流。

## 2. 验证证据与调用链分析
- **调用点对比**：
  - 修复前：`index.js` 中 `registerCanvas` 仅传入 `{ ...props, t }`，`props.ctx` 来源于 `betterSidebar`，没有 inject `workspaces`；在 `CanvasTab.jsx` 中直接访问 `ctx?.workspaces` 触发 Proxy 拦截器抛出 `TypeError: cannot get property "workspaces" without inject`。
  - 修复后：
    1. `registerCanvas` 显式注入 `sessions: ctx.sessions, workspaces: ctx.workspaces, layout: ctx.layout, betterSidebar: sidebar`；
    2. `CanvasTab.jsx` 声明接收 `sessions, workspaces, layout, betterSidebar` props；
    3. `CanvasTab.jsx` 增加 `safeGetService(target, prop)` 防护函数与全局备援，绝不直接让未受控 Context 的属性访问触发异常；
    4. `workflow-global.js` 统一导出 `sessions` 与 `workspaces` 单例引用供兜底使用。

## 3. 验证结果
- 模拟 Cordis Proxy 属性受控门禁：当传入未 inject `workspaces` 的 Context 并对其执行 `safeGetService`，安全返回 undefined 并成功降级至 props 注入的真实 `workspaces` 服务，不再报错阻断。
- 自动化契约与单元测试覆盖全部场景。
