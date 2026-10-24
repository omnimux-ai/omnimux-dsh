# 「添加节点」面板入口改为 ComfyUI 工作流入口（Issue 3669）

- 任务：`.worktrees/workflow-comfy-entry-3669`（分支 `agent/workflow-comfy-entry-3669-issue-3669`）
- 插件：`omnimux-workflow`；风险 R3（入口语义替换 + 导入状态所有权调整 + 本地缓存）

## 目标

用户对照 MiniMax Design 参考图指出：那条「工作流」入口在他们的产品里是 **ComfyUI 工作流**入口，不是「把画布存成模板」。已确认采用：把该入口改成 ComfyUI 工作流入口（对齐 MiniMax），原有的存模板入口收回模板面板。

## 用户操作旅程

1. 用户点画布左下 `+`（或右键 →「添加节点」）打开「添加节点」面板 → 面板底部那行从「新建工作流 / 把当前画布保存为可复用模板」变成「ComfyUI 工作流 / 导入或复用 ComfyUI 工作流」。
2. 点它 → **面板内容切换到 ComfyUI 工作流视图**（标题变「ComfyUI 工作流」，左上出现返回箭头；搜索框在该视图不出现），内容自上而下：
   - 一行动作：「从文件导入…」（图标 + 说明「支持 ComfyUI 0.4 / 1 的 JSON」）。
   - 有缓存时：「最近导入」分组标题 + 最近导入的条目（名称 + `格式 · 节点数 · MM-DD HH:mm`）。
   - 无缓存时：空态「还没有导入过 ComfyUI 工作流」+ 同一句格式说明。
3. 点「从文件导入…」→ 关闭面板并打开系统文件选择器 → 选一个 ComfyUI JSON → 画布上出现既有的导入预览面板（「ComfyUI 工作流（0.4）」+「已支持 N 项，不支持 M 项」+ 支持/不支持清单）→ 用户点「应用」后画布被替换（历史重置），**成功应用后**该工作流进入「最近导入」。
4. 再打开面板 →「最近导入」里能看到它 → 点这条 → 重新走同一条预览确认链路（不直接覆盖画布）。
5. 坏文件 / 不支持的版本 / 既不是 ComfyUI 也不是 OmniMux 文件 → 预览面板给出既有错误文案（`transfer.error.*`），不写缓存。

## 期望界面反馈

- 入口替换后，面板底部那行仍是**平铺行**（#3651 的形态不变：无边框、无常态底色、hover 有底色），Dock 与右键钻取两处一致。
- ComfyUI 视图复用同一套 `wf-node-menu__*` 视觉语言，不引入第二套面板样式。
- 「最近导入」的条目点击后**必须**先出预览再应用（`hydrateGraph` 会替换画布并重置历史，不允许一键静默覆盖）。
- 缓存不可用（隐私模式 / SSR / 配额满）时：面板只显示「从文件导入…」与空态，导入链路照常工作，不报错。
- 存模板入口从「添加节点」面板移除；模板创建仍可从工具栏「模板」面板里那张同款卡片进入（`WorkflowTemplatePanel`），功能不丢。

## 变更点

1. `src/canvas/editor/utils/comfyRecents.ts`（新增，纯函数）：缓存键、上限、单条体积上限、`decodeComfyRecents` / `encodeComfyRecents` / `upsertComfyRecent` / `readComfyRecents` / `writeComfyRecents` / `formatComfyRecentTime`；任何畸形内容退回空列表，读写失败返回空/`false` 而不抛出。
2. `src/canvas/store/workflowTransferStore.ts`（新增，zustand）：把 `Toolbar` 里的 transfer 状态机（预览状态 + 导入/导出/应用动作 + 最近导入）提成单一 owner，供工具栏按钮与「添加节点」面板共用；`requestImport()` 通过递增 `importNonce` 让持有 `<input type="file">` 的组件弹选择器。
3. `Toolbar.tsx`：改用该 store（本地 `transfer` state 与其 handler 删除），保留预览面板与导入/导出按钮；`<input type="file">` 仍是唯一实例，改为订阅 `importNonce` 触发。
4. `AddNodeMenu.tsx`：底部入口改为 ComfyUI 工作流入口；新增 `view: 'palette' | 'comfy'` 视图切换与该视图渲染（`comfy` prop：`recents` + `onImport` + `onApplyRecent`）。
5. `CanvasEditor.tsx` / `Toolbar.tsx` 两处 `AddNodeMenu` 调用点：传入 `comfy` prop（读 store）；`onCreateWorkflow` 不再传给 `AddNodeMenu`（模板面板那份保留）。
6. `dict.zh.ts` / `dict.en.ts`：新增入口文案、视图标题、导入动作、最近导入分组、空态、条目 meta 模板；zh/en key 集合保持一致。
7. 新增 `comfyRecents.test.mjs`（纯函数用例）。

## 非目标

- 不打包 / 启动 ComfyUI 后端；不探测 ComfyUI 服务或目录。
- 不改 ComfyUI 编解码、投影与映射（`src/shared/comfyui/*` 一行不动）。
- 不改模板库 schema、模板面板与 `planInstantiateTemplate`。
- 不做「模板 ↔ ComfyUI 身份」打通（用户选了入口方案，未选身份打通）。
- 不新增后端路由；缓存只在客户端。

## 新用户基线

全新用户安装后打开画布：面板底部就是 ComfyUI 工作流入口；未导入过时显示空态 + 导入动作，点导入选一个本机 ComfyUI JSON 即可应用；不依赖任何本机 ComfyUI 安装、服务、账号或密钥。

## 假设

1. 「最近导入」只需要在**本机本浏览器**可见（便利缓存），不需要跨设备/跨工作区同步，因此用 `localStorage` 即可，且与仓库既有先例一致（`src/shared/sessionWorkspaceId.ts` 也用 localStorage 存会话级画布覆盖值）。
2. 入口在 Dock 与右键钻取两处共用同一个 `AddNodeMenu` 组件，因此把 ComfyUI 视图做进该组件的内部视图切换，比新开一个浮层更省事、且天然复用既有锚点、点击外部关闭与样式。
3. `hydrateGraph` 会替换整张画布并重置历史（`Toolbar` 注释：「history reseeded」），所以最近导入必须走「预览 → 用户确认」链路，不能一键应用。
4. 现有测试没有断言该底部入口的文案或 `onCreateWorkflow` 用法（`AddNodeMenu.test.mjs` / `Toolbar.test.mjs` 无相关断言；`ContextMenu.test.mjs` 断言的是**主菜单** `create-workflow` 派发 `onCreateWorkflow(flowPosition)`，与本入口无关），因此替换入口不需要改写既有断言。

## 证伪方式

1. `rg -n "onCreateWorkflow" src/canvas/editor/components/AddNodeMenu.tsx` 若在替换后仍有命中，说明入口没换干净。
2. 真实浏览器里从两处入口（Dock / 右键钻取）打开面板，若其中一处没有切到 ComfyUI 视图、或底部入口文案仍是「新建工作流」，假设 2 被证伪。
3. 若点击「最近导入」的一条后画布被直接替换（没出现预览面板），假设 3 被证伪，属于数据风险，必须回退。
4. 若 `AddNodeMenu.test.mjs` / `Toolbar.test.mjs` / `ContextMenu.test.mjs` 出现失败，假设 4 被证伪。
5. 若在 `localStorage` 不可用（清空 `window.localStorage` 或 mock 抛错）时面板报错或导入不可用，实现未达成降级要求。
6. 若 `src/shared/comfyui/*` 出现 diff，越过了非目标。

## 验收标准

1. 两处入口文案与行为一致：打开 ComfyUI 工作流视图（标题、返回箭头、导入动作、空态/最近导入）。
2. 导入一个真实 ComfyUI 工作流 JSON → 出现预览 → 点「应用」→ 画布被替换且成功；再打开面板能看到该条目。
3. 点「最近导入」条目 → 只出现预览，画布**未**被替换；再点「应用」才替换。
4. 坏文件（非 JSON / 不支持的版本）→ 预览面板给出既有错误文案，缓存不新增。
5. 缓存不可用时面板仍可导入（空态 + 导入动作），无异常。
6. 模板创建仍可从模板面板那张卡片进入（入口移除不丢功能）。
7. `pnpm --filter omnimux-workflow test`、`typecheck`、`pnpm verify:stages`、anti-slop、`git diff --check` 全绿；真实浏览器证据留存。

## 文档影响

无用户文档需要同步：入口语义变更在画布内自解释；`docs/evidence/issue-3669-*.md` 作为任务证据留存。
