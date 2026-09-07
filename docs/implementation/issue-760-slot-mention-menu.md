# Issue #760 实现与验证说明

## 状态与边界

- Issue: https://github.com/omnimux-ai/omnimux-dsh/issues/760
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/slot-mention-menu-760`
- 分支：`agent/workflow-slot-mention-menu-issue-760`
- 固定 base/HEAD：`3d0e6be429ae869980985999a733c4d79c5034f9`，仅本地未提交修改。
- 未运行 git-wt、fetch、commit、push、merge、部署、模型 API 或修改官方 DSH。
- 实现限于 `plugins/omnimux-workflow/src` 和本说明；未修改合同、脚本、根包或 manifest。
- **IS_PASS: NO（整体交付门禁）**。代码局部实现、定向回归及类型检查通过；全包测试、Stage 门禁受当前工作树依赖/产物缺失阻断，真实 L2 浏览器验收尚待独立 QA，不具备合入放行证据。

## 已验证根因

1. `.wf-panel-shell__card` 使用 `overflow: hidden`，此前 replace-pill 是槽内绝对定位、向上超出边界的按钮。槽本身 `overflow: visible` 或提升 z-index 不能突破祖先裁切。`ConfigPanelShell` 还使用逆缩放 transform，并处于 ReactFlow transformed canvas，内部 fixed/absolute 坐标不能直接当视口坐标。
2. SlotWells 只有 44px 缩略图，没有独立大图预览组件，并非单纯大图层级不够。
3. 已填槽 CSS `width:auto; min-width:36px; max-width:96px`，图片 onLoad 计算 aspectRatio，导致槽随素材改变宽度；`object-fit:cover` 还会裁图。
4. MentionPopover 仍读历史 `slotState.activeSlots/overflowPool`；现有 SlotWells 已读 `slotBindings + upstreams`，两条来源不一致导致有图却报告没有参考素材。
5. token parser 使用 `sourceNodeId === nodeId || slotIndex === index`，可将其他节点的同号槽绑定到该 token；执行侧 token 编译结果还会追加媒体 reference，可能绕过 First-N Slot 消费集。
6. 当前 base 未发现初始化 prompt 为 `@` 的赋值；保留 `value ?? ''`，不迁移、不清理用户已经保存的真实 `@` 文本。删除 React children 与手动 contentEditable DOM 双重所有权，避免 token DOM 被普通字符串重绘。

## 实现

### 固定槽与预览

- 填槽与空槽统一 44×44 border-box，图像/视频 100% 尺寸及 `object-fit:contain`；去掉读取原图比例改变槽尺寸的逻辑。
- 新增 `SlotHoverPreview`，通过 document.body Portal 逃逸祖先裁切及 canvas transform，复用现有 `calculatePopoverPosition` 的向上优先、上下翻转与左右避让算法，额外限制真实可用高度。
- 预览和替换按钮是独立布局行，不相互覆盖；180ms 离开延迟允许从缩略图穿过间隙进入预览/按钮。锚点移动通过 rAF 跟踪更新。Esc/外点关闭，事件阻断避免替换点击又触发槽 token 插入。
- 删除已填槽文件名原生 title 与清除按钮 title，保留 aria-label。保留全局面板和既有深色视觉，仅改局部槽/菜单样式。

### 引用菜单与原子图变更

- `currentReferenceCandidates(upstreams, bindings)` 按已装填顺序优先、其余 Feed 顺序追加，按 source node 去重，文本也来自真实上游。
- `canvasReferenceCandidates(targetId, nodes, edges)` 展示所有图片/文本来源，排除自身，保留未就绪节点并明示等待/不可用；使用共享结构校验显示成环/类型等禁用原因。类别分别显示总数，可查询名称。
- 两级菜单均 Portal 到 body。鼠标 hover/click 开子级，键盘上下/左右/Enter/Tab/Esc；根菜单优先光标上方，子菜单右侧优先、越界则左侧，列表滚动。
- `PromptTokenEditor` 保存实际 `@query` Range，在当前位置替换为 `contenteditable=false` 原子 token；保存 blur 光标供点击槽插入。IME 不抢 Enter，支持 Backspace/Delete 整体删除。
- 选择来源时先在 DOM 计算下一份 prompt，再调用 `onCommitReference`。`referenceMutation` 将新边和 prompt patch 一并交给 `applyCanvasInputMutation`。已有来源不再连边；提交时结构校验失败则 prompt/edge 全部不落盘，编辑器恢复原文。
- mutation gateway 一次更新 nodes/edges，沿用既有连接事件 `canvas:connection {source,target,sourceHandle,targetHandle}` 和持久化订阅；不引入新生成事件，不调用生成，也不修改 params/model/operation。
- `pushHistory(force = false)` 保持旧调用兼容，引用事务显式产生独立历史快照，即使紧随打字也可将 token/边一起撤销。编辑器 Cmd/Ctrl-Z、Shift-Z/Y 转交图历史，避免只撤销 DOM。

### 身份与执行约束

- 保留 `@ref[nodeId:slotIndex:fileName]` 序列化格式与已有非负槽 index；新增文本使用 `-1`、非槽媒体使用 `-2`，避免与任何媒体槽位置冲突。新 token 在图中始终按 nodeId 解析，文本不靠文件后缀推断。
- 旧 token 读取仅允许 sourceNodeId 与 slotIndex 同时匹配，不再匹配其他节点的同号槽。
- 执行器只提供共享有效输入解析后的已消费媒体给 token 编译器，禁止用旧 slotState 缓存恢复未入槽媒体；不再把 token 解析结果追加到 API references。文本仍由 `resolveGenerationPrompt` 按上游顺序与本地要求组合。
- Feed 仍不限容量，Slot 仍由共享模型合同 First-N 装填，超量保持 Feed，选中 token 不将其强制挤入 Slot。

## 文件清单

以下均相对于 `plugins/omnimux-workflow/src/`：

- `canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotWells.tsx`
- `canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotHoverPreview.tsx`（新增）
- `canvas/editor/components/MaterialNode/ConfigPanel/index.tsx`
- `canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs`（将已被 #760 否定的自适应尺寸/CSS 正则断言替换为实际组件渲染与状态测试）
- `canvas/editor/components/PromptTokenEditor/MentionPopover.tsx`
- `canvas/editor/components/PromptTokenEditor/PromptTokenEditor.tsx`
- `canvas/editor/components/PromptTokenEditor/promptTokenCompiler.ts`
- `canvas/editor/components/PromptTokenEditor/promptTokenEditor.css`
- `canvas/editor/components/PromptTokenEditor/referenceCandidates.ts`（新增）
- `canvas/editor/components/PromptTokenEditor/referenceCandidates.test.mjs`（新增）
- `canvas/editor/components/PromptTokenEditor/referenceInteraction.dom.test.mjs`（新增）
- `canvas/i18n/dict.zh.ts`、`canvas/i18n/dict.en.ts`
- `canvas/store/canvasStore.ts`
- `canvas/theme/components.css`
- `workflow/execution/materialGatewayExecutor.ts`
- `workflow/execution/multimodalCompiler.ts`

## 实际验证与计数

| 检查 | 实际结果 | 范围/限制 |
| --- | --- | --- |
| `pnpm --filter omnimux-workflow typecheck` | exit 1，未进入 tsc | 工作树无 node_modules，pnpm 自动安装因 `omnimux-dsh/personal/dsh-ui-kit` 不存在失败；未更改包配置 |
| TypeScript API 读取上述两个 tsconfig，noEmit，裸包解析到主 checkout 已有依赖（只读） | exit 0；canvas 0、host 0 diagnostics | 不创建依赖链接/不安装/不改主树；检查的是当前工作树源文件 |
| 定向 node --test | **81 pass，0 fail，0 skipped** | 包含 7 个引用/历史/请求测试，6 个 JSDOM 编辑器交互测试，4 个槽 SSR/状态/locale 测试，加既有 compiler/Feed-Slot/effective-input/i18n 回归 |
| 最终完整 `npm run test`（实际 package test script） | **1123 tests，1100 pass，21 fail，2 cancelled，0 skipped；exit 1** | 裸 ESM 依赖只读回退后，已有 esbuild 测试仍无法解析工作树 react/zod/zustand/dsh-ui-kit；部分测试要求缺失 dist/index.js，另有 yaml 缺失；不将此结果报绿 |
| `npm run lint:i18n` | exit 0；8 locale files、12 manifests | 中英新词条齐全 |
| `npm run verify:stages` | exit 1 | 扫描到 10 Stage；初次缺 jsdom，只读 NODE_PATH 后进入实际 assembler，再因 dsh-ui-kit 不可解析失败 |
| `npm run check:boundaries` | exit 0；2122 source files | 插件依赖/运行边界 |
| `git diff --check` | exit 0 | 仅本地 diff |
| ego-browser / L2 / verify:live | 未执行 | 按任务分工由独立 QA 提供，不以 JSDOM/SSR 代替真实渲染证据 |

### 定向测试命令

在已正确准备依赖的任务工作树插件目录运行：

```sh
node --test \
  src/canvas/editor/components/PromptTokenEditor/*.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs \
  src/workflow/execution/feedSlotSubmission.test.mjs \
  src/workflow/execution/multimodalCompiler.test.mjs \
  src/shared/graph/effectiveInput.test.mjs \
  src/shared/graph/feedSlot/feedSlotKernel.test.mjs \
  src/canvas/i18n/*.test.mjs
```

当前环境运行此命令使用 Node `registerHooks` 的只读裸包解析回退与 NODE_PATH（主 checkout workflow/hub node_modules）。新增 esbuild 测试显式消费 NODE_PATH，JSDOM 按仓库既有模式复用 hub 测试依赖，无新增包依赖。该辅助解析不改变应用实现或仓库脚本，不替代隔离 L2 构建。

## 全局一致性审查与未决风险

- 已对整份 diff 检查 import、接口、调用链、数据来源与持久化/历史语义；新增类型可通过 canvas/host 编译；没有重复连线入口、重复生成入口或第二套 Slot 装填算法。
- 已捕获合成请求核对：一槽两图三条 Feed，API 只携带第一张已装填图；token 引用第二张不扩容；上游完整文本与本地修改要求均存在；model/operation 保持原值。
- **剩余必需证据**：主理人准备正确的隔离依赖/构建环境后重跑全包、verify:stages；QA 在 L2 上验证真实 hover 桥接、长文件名、横/竖图、靠四边、缩放/平移、鼠标子级、IME、键盘与撤销重做刷新持久化。当前无截图，不宣称视觉通过。
- 现有序列化不支持文件名内未转义 `]`；本次保持格式兼容，没有扩展转义协议。
- 音频任务对上游正文与本地要求不可分离时仍按既有合同拒绝，不因引用菜单放宽音频语义；未新增该能力。
- 代码已具备独立 QA 接手条件；尚未具备合入/关闭 Issue 条件。下一负责人：主理人统筹独立 QA 和共享 Git 操作。
