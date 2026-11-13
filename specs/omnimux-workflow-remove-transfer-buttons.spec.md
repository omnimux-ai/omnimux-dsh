# #4112 移除画布底部工具栏「导出工作流 / 导入工作流」按钮

## 目标与交付边界

用户已确认：OmniMux 画布创作页底部悬浮工具栏不需要「导出工作流 / 导入工作流」两个图标入口，Dock 只保留 添加节点(+)、插入模板、指针模式、项目资产、快捷键帮助。高保真演示方案见 `.agent-reports/ui-demo-canvas-toolbar/index.html`（网关仓）。

本片只做 UI 入口移除：删除两个按钮、隐藏的 `<input type="file">`，以及 Toolbar 内仅为导入/导出服务的 `TransferPanel` 渲染、`translateToken`、transfer store hooks、`fileInputRef` / `handleFileInputChange` / `importNonce` effect / `transferRef` 与对应 `useClickOutside`。保留 `src/canvas/store/workflowTransferStore.ts` 与 `src/shared/comfyui/*` 的全部底层能力；不新增替代入口，不改其他 Dock 按钮、顺序、分隔线、样式；CSS 的 `wf-transfer-panel*` 规则按任务边界保留。

## 有界写集

- `plugins/omnimux-workflow/src/canvas/editor/components/Toolbar.tsx`：删除导出/导入按钮、隐藏 file input、TransferPanel、translateToken、transfer hooks 与相关 imports；删除仅用于导出的 `workflowName` prop。
- `plugins/omnimux-workflow/src/canvas/editor/CanvasEditor.tsx`：删除确认无其他使用的 `useWorkflowTransferStore` import。
- `plugins/omnimux-workflow/src/canvas/editor/components/Toolbar.test.mjs`：补充源码契约断言（不再包含 `toolbar.exportWorkflow` / `toolbar.importWorkflow` / `wf-transfer-panel`，Dock 其余入口仍在）。
- `plugins/omnimux-workflow/tests/e2e/canvas-toolbar-transfer-buttons-removed.e2e.test.mjs`：真实 Chrome 浏览器 e2e，断言 `.wf-canvas-toolbar` 内无「导出工作流」「导入工作流」按钮，且「添加节点/插入模板/选择模式/项目资产/快捷键帮助」仍在；截图与 report.json 保存到 `.workbuddy/evidence/`。
- 本 spec。不改字典、不改 CSS、不改 `workflowTransferStore` 与 `src/shared/comfyui/*`。

## 用户旅程与验收

AC1：打开画布创作页，底部 Dock 不再渲染标题为「导出工作流」「导入工作流」的按钮，也不存在 `wf-transfer-panel` 渲染。
AC2：Dock 其余入口仍存在且顺序不变：添加节点(+)、插入模板、指针模式（选择/平移）、项目资产、快捷键帮助，Dock 按钮总数为 5；画布本身正常挂载。
AC3：Toolbar 内不再有 transfer store hooks、`fileInputRef`、`handleFileInputChange`、`importNonce` effect、`transferRef` 及 TransferPanel；底层 `workflowTransferStore.ts` 与 `src/shared/comfyui/*` 保持原样可用。
AC4：`omnimux-workflow` 包测试、类型检查、`pnpm verify:stages`、`node --test scripts/verify-anti-slop.test.mjs` 与新增真实浏览器 e2e 全部通过。

## 假设

假设这两个按钮、隐藏 file input 与 TransferPanel 只服务 Toolbar 的导入/导出入口：仓库内没有第二处调用 `requestImport` / `importNonce` / `exportWorkflow` 的 UI；添加节点面板、模板面板、拖拽素材与快捷键都不依赖它们。删除后 Dock 的其余按钮与画布交互保持不变，底层 store 与 ComfyUI 解析/导出能力继续可被未来入口复用。

## 证伪方式

若删除后 `rg -n "toolbar.exportWorkflow|toolbar.importWorkflow|wf-transfer-panel"` 仍在 Toolbar.tsx 命中，或真实浏览器 e2e 仍能找到对应 title / `wf-transfer-panel`，或其余 Dock 按钮缺失、画布无法挂载；或 `pnpm --filter omnimux-workflow test` / typecheck / `pnpm verify:stages` / `verify-anti-slop` 报错，则假设被证伪，需回退并改为仅隐藏入口。可执行验证：上述命令 + 新增 e2e（Chrome CDP）+ worktree 内截图与 report.json。

## 文档与基线影响

文档影响：仅本 spec 与任务证据；历史 transfer 相关 spec 保留为历史记录，不追改。新用户基线：本任务无外部依赖，正常安装登录后打开画布创作页即可验证；移除入口不新增任何错误路径或首启差异，也不依赖开发机私有状态。

## 非目标

不删除或改写 `workflowTransferStore.ts` 与 `src/shared/comfyui/*`；不删除 `wf-transfer-panel*` CSS；不新增导出/导入替代入口；不改其他 Dock 按钮与样式；不发布生产版本。
