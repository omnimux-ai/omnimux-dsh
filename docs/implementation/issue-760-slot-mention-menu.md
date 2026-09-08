# Issue #760 实现与验证说明

## 状态与边界

- Issue: https://github.com/omnimux-ai/omnimux-dsh/issues/760
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/slot-mention-menu-760`
- 分支：`agent/workflow-slot-mention-menu-issue-760`
- 第二轮集成 base（本轮 fetch 的 `origin/main`）：`5485c25875cb9f71d7cb78a6aa69d07e07fffbab`；第一轮 base：`3d0e6be429ae869980985999a733c4d79c5034f9`。
- 本地恢复提交 `d3de295` 经 rebase 后为 `10568d418d31e20eaf49909a1c40d0e092179c1f`。第二轮补充测试/报告提交位于其后，可用 `git rev-parse HEAD` 获取最终目标；未 push。
- 按本轮明确授权执行了本任务 commit、fetch origin main 和 rebase；未运行 git-wt、push、PR、merge、部署、真实模型 API 或修改官方 DSH。
- 实现限于 `plugins/omnimux-workflow/src` 和本说明；未修改合同、脚本、根包、manifest 或 lock。依赖使用任务树内指向主 checkout 已有 node_modules 的软链接，仅只读使用。
- **当前 IS_PASS: YES（QA 反馈修复的工程全局一致性审查、定向 114/114、原构建与双 tsc）**；**本轮全包命令 exit 1：1289 项 / 1287 pass / 2 fail（Node 权限模式阻止既有 symlink 测试建夹具）**，不得宣称全包全绿。完整 Stage 采用独立 QA 第一轮已验证的 10 组件 / 8 注册入口（含 market）exit 0 证据，本轮未重跑。**独立 QA 第二轮待执行；L2 / browser 仍 BLOCKED；整体不放行**。下文第二轮集成数据为历史，最新修复及实际计数见文末。

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

## 第二轮集成与依赖准备

- 核对待提交 diff 仅含上述 17 个源码/测试文件与本说明后，执行本地保存提交，再 `git fetch origin main`、`git rebase origin/main`。
- 唯一文本冲突在 `PromptTokenEditor/promptTokenEditor.css`：保留主干 `.wf-prompt-token-meta-count--exceeded`，同时保留引用条目、分隔线及二级菜单样式。ConfigPanel、PromptTokenEditor 和 components.css 自动合并后逐项审查。
- 主干 #759 的 `seed-audio-1.0` 允许列表/默认值、音频模型零候选兜底、内置 `countOverride`、10000 字符上限和唯一计数器保持；没有恢复已删除的外部计数器。
- `referenceInteraction.dom.test.mjs` 新增整合回归：权威计数为 0、10000、10001 时只有一个计数器，超限 class/role 正确，引用菜单插入 token 后仍保持该口径。
- 以下任务树路径链接至主 checkout 下相同相对路径的已有依赖：`node_modules`、`plugins/omnimux-workflow/node_modules`、`plugins/omnimux/node_modules`，以及 `plugins/omnimux-{accounts,assets,products,inspiration,publish,analytics,market}/node_modules`。未通过链接 install、prepare 或改写目标。
- 已完整读取 workflow 三段 build 脚本，使用 `npm run build`；只写本任务 `plugins/omnimux-workflow/dist/index.js`、`lib/client.js`、`lib/canvas.js`。没有触发 pnpm workspace install 或跨包 build。

## 实际验证与计数

以下为第二轮最终结果，替代第一轮的环境失败计数。第一轮记录为：定向 81/81、完整 1123 tests / 1100 pass / 21 fail / 2 cancelled，原因是依赖和 dist 缺失。

| 检查 | 实际结果 | 范围/限制 |
| --- | --- | --- |
| workflow `npm run build` | exit 0；host/client/canvas 全通过 | 三个产物均在任务树内且非软链；字节数 1,474,842 / 129,883 / 2,091,494 |
| workflow `npm run typecheck` | exit 0；canvas、host 两份 tsconfig | 原脚本 tsc --noEmit；检查任务源码，未用旧 source 替代 |
| workflow 最终 `npm run test` | **1273 tests / 79 suites；1273 pass，0 fail，0 cancelled，0 skipped；exit 0** | 包含新整合回归；完整输出 `plugins/omnimux-workflow/dist/issue-760-tests.log`（忽略产物） |
| esbuild metafile 来源审计（write:false） | exit 0 | host 123、client 16、canvas 231 个本包输入，realpath 全位于任务 src；依赖仅只读 |
| 根 `npm run lint:i18n` | exit 0；8 locale files、12 manifests | 中英词条齐全 |
| 根 `npm run verify:stages`，附 Node 文件写入限制 | **exit 1 / BLOCKED** | 10 Stage 静态审计进入真实 assembler；market 构建尝试写入被阻止，详细原因见下节 |
| 同一 `captureStageContract` 对七个非 market Stage | **7/7；exit 0** | accounts、workflow、assets、products、inspiration、publish、analytics；不是完整门禁替代品 |
| 根 `npm run check:boundaries` | exit 0；2125 source files | 插件依赖/运行边界 |
| `git diff origin/main --check` | exit 0 | 本轮 fetched base 上的完整任务 diff |
| ego-browser / L2 / verify:live | 本轮明确不执行 | 已知受管 seed 阻断由主理人处理，不以 JSDOM/SSR 代替真实渲染证据 |

### Stage 授权边界的准确阻断

`verify-stage-contracts.mjs` 调用 `scripts/live-stage-contracts.mjs:117`，market 分支执行其 `scripts/concat-client.mjs`；后者第 93–94 行创建 `plugins/omnimux-market/lib` 并写 `client.js`。本轮构建授权只允许 workflow dist/lib，因此该原始命令在 Node `--permission` 下运行，允许全部读取、子进程/worker/addon，但文件写入仅允许本任务 workflow dist/lib。错误为 `ERR_ACCESS_DENIED / FileSystemWrite`，resource 是任务树 `plugins/omnimux-market/lib`。没有修改门禁、过滤掉 market 后声称全通过，也没有写入 market 或其他 workspace。

下一步需要主理人另行允许**任务树内 market 忽略构建产物**，或在已授权的完整 QA 环境运行原门禁；不得为了本轮数字全绿而绕过输出边界。该问题与 workflow 源码正确性、以及 L2 seed 问题分别记录。

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

第二轮已有依赖软链接，不再需要第一轮的 `registerHooks` / NODE_PATH 回退。上述定向范围全部包含在最终完整测试中；没有将第一轮 81 的计数误报为本轮新增回归后的独立运行结果。JSDOM 按仓库既有模式复用 hub 测试依赖，无新增包依赖。

第二轮主命令（前两条在 workflow 目录，后两条在任务根）：

```sh
npm run build && npm run typecheck
npm run test
npm run lint:i18n && npm run check:boundaries
NODE_OPTIONS="--permission --allow-fs-read=* --allow-fs-write=$PWD/plugins/omnimux-workflow/dist --allow-fs-write=$PWD/plugins/omnimux-workflow/lib --allow-child-process --allow-worker --allow-addons" npm run verify:stages
```

最后一条预期保留已披露的 market 写入拒绝，不得移除限制后未经授权重跑。

## 全局一致性审查与未决风险

- 已对整份 diff 检查 import、接口、调用链、数据来源与持久化/历史语义；新增类型可通过 canvas/host 编译；没有重复连线入口、重复生成入口或第二套 Slot 装填算法。
- 已捕获合成请求核对：一槽两图三条 Feed，API 只携带第一张已装填图；token 引用第二张不扩容；上游完整文本与本地修改要求均存在；model/operation 保持原值。
- **剩余必需证据**：workflow 完整测试/类型/构建已通过；主理人处理 Stage market 构建权限与既有 L2 seed 问题，再统筹独立 QA。QA 在 L2 上验证真实 hover 桥接、长文件名、横/竖图、靠四边、缩放/平移、鼠标子级、IME、键盘与撤销重做刷新持久化。当前无截图，不宣称视觉通过。
- L2 事实来自主理人正式启动结果：Dev profile `@crosery/dsh-viewer` 的绝对 `file:` 依赖指向其他工作区备份 tarball，违反受管 seed，已记录 Issue 评论。本轮没有重试启动、改 Dev/其他工作区或绕过 seed 校验。
- 第二轮全局审查确认：主干音频模型 policy/候选逻辑没有任务 diff；ConfigPanel 的音频 countOverride/maxLength 与 onCommitReference/onHistoryStep 并存，内置计数器没有复制；引用事务仍通过共享 gateway、Slot 容量与执行集未被 token 扩容。运行源码除冲突合并外无需新增修复。
- 现有序列化不支持文件名内未转义 `]`；本次保持格式兼容，没有扩展转义协议。
- 音频任务对上游正文与本地要求不可分离时仍按既有合同拒绝，不因引用菜单放宽音频语义；未新增该能力。
- 代码已具备独立 QA 接手条件；尚未具备合入/关闭 Issue 条件。下一负责人：主理人统筹独立 QA 和共享 Git 操作。

## QA 第一轮反馈修复（2026-09-08）

### 身份与输出边界

- 固定 base：`5485c25875cb9f71d7cb78a6aa69d07e07fffbab`；起始及结束 HEAD：`ca83e4579fbb8e47b9d4170b46faa05be8f57c83`。本轮结果为该 HEAD 上的未提交工作树 diff，不代表远端最新 tip。
- 先完整读取本说明、[独立 QA 第一轮报告](../qa/issue-760-slot-mention-menu.md) 及其 `issue760.qa.test.mjs`。原 QA 文件与报告不改动、不暂存、不提交。
- 本轮运行源码仅改四个文件：`PromptTokenEditor.tsx`、`MentionPopover.tsx`、`SlotWells/SlotHoverPreview.tsx`、`cfg/viewportPositioner.ts`；新增 `PromptTokenEditor/referenceBoundaries.dom.test.mjs`，并更新本说明。没有 fetch、rebase、commit、push、merge、deploy、install、共享 profile 或主 checkout 写操作。
- 三段构建产物仅写任务树 workflow dist/lib；只读使用已存在的 node_modules 链接。全包 `TMPDIR` 指向任务 workflow/dist，Node 写权限仅允许该目录，避免测试夹具写往其他工作区或系统临时目录。权限模式对子进程/native addon 并非 OS 沙箱，另以已读构建脚本及输出 realpath 核验落点。

### 修复与全局一致性审查

1. **QA-760-01**：插入选择顺序为合法菜单 query Range → 合法实时 Selection → 合法 blur 缓存 → 尾部兜底。合法性同时验证 Range 起点与终点均在本编辑器，不能仅以 anchor/start 判定；插入使用克隆 Range。公开 API、菜单 query 替换、composition guard、blur 保存时机和事务失败恢复保持原接口。
2. **QA-760-02**：共享定位器增加可选 `preferredWidth`，默认 360 保持既有参数浮层兼容；预览传入 240、引用根菜单传入 280，先按视口夹紧，再用同一宽度计算 left 和渲染。1000×800 视口右缘槽 [950,994] 的预览为 [748,988]，不再出现 82px 横向脱离；220px 窄屏宽度为 196。没有针对 QA 坐标硬编码分支。
3. QA 提示的 MentionPopover 同类缺陷同步修复。Portal、180ms 离开延迟、rAF 锚点跟踪、上下翻转、Esc/外点关闭均保持；未把延迟机制描述为新增几何 hover bridge，也未据 JSDOM 声称慢速鼠标路径已验收。
4. 新增 12 项组件边界回归：实时非折叠选区、外部选区与 blur 缓存、跨编辑器选区、query 优先、完整 composition 生命周期、连续两次插入、预览左/右/窄屏/顶部翻转及根菜单宽/窄视口。使用真实组件实现、受控 value 回传；未改 QA 失败断言。
5. 全局审查核对四份运行 diff 与新增测试的 import、可选参数兼容、Range 端点保护及统一宽度数据流。默认 360 定位回归保持通过，现有 Feed/Slot、图事务、执行内容、音频计数语义无修改。**IS_PASS: YES，仅工程源码一致性及已完成定向/类型/构建检查；不是独立 QA、全包全绿或 UI 放行。**

### 本轮实际验证

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| 修复前独立 QA 文件 | 4 tests / 2 pass / 2 fail，exit 1 | 原样重现光标错位与预览 [628,868] |
| 修复后独立 QA 文件 | 4/4 pass | 包含在以下 114 项实跑范围，不作为额外新增计数 |
| 扩展定向最终运行 | **114 tests / 6 suites；114 pass / 0 fail / 0 cancelled / 0 skipped，exit 0** | 引用组件全测、Slot、两份旧定位器、Feed/Slot 执行、有效输入及 i18n |
| workflow `npm --logs-max=0 run build` | **exit 0** | 原 host/client/canvas 三段，不用 harness 替代 |
| workflow `npm --logs-max=0 run typecheck` | **exit 0** | 原 canvas/host 两份 tsc --noEmit |
| workflow 全包 `npm --logs-max=0 run test` | **1289 tests / 80 suites；1287 pass / 2 fail / 0 cancelled / 0 skipped，exit 1** | 相比前序 1273 新增 QA 4 + 工程边界 12；失败见下节 |
| `git diff --check` | exit 0 | 当前未提交修复 diff |
| 完整 Stage | 复用 QA 第一轮 10 components / 8 targets，exit 0（含 market） | 本轮未运行，源码修改不涉及 Stage 注册/组装；不改写 QA 历史报告 |
| L2 / ego-browser / verify:live | **BLOCKED，按授权不重试** | 沿用 QA 已证实的不合规 seed，无 profile 修改或替代浏览器证据 |

新增工程测试的首次定向运行是 114 项 / 112 pass / 2 fail：测试宿主未回传受控 value，且 React DOM 在 JSDOM 之前初始化导致原生 composition 事件未接通。仅修正新测试宿主为受控组件并在 DOM globals 就绪后加载 React DOM，全部业务断言保持，最终 114/114；QA 文件始终未修改。

定向命令（任务树 `plugins/omnimux-workflow`）：

```sh
node --test src/canvas/editor/components/PromptTokenEditor/*.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/slotInteractionRefinement.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/cfg/viewportPositioner.test.mjs \
  src/canvas/editor/components/MaterialNode/ConfigPanel/videoParams/viewportPositioner.test.mjs \
  src/workflow/execution/feedSlotSubmission.test.mjs \
  src/workflow/execution/multimodalCompiler.test.mjs \
  src/shared/graph/effectiveInput.test.mjs \
  src/shared/graph/feedSlot/feedSlotKernel.test.mjs src/canvas/i18n/*.test.mjs
NODE_OPTIONS="--permission --allow-fs-read=* --allow-fs-write=$PWD/dist --allow-fs-write=$PWD/lib --allow-child-process --allow-worker --allow-addons" npm --logs-max=0 run build
NODE_OPTIONS="--permission --allow-fs-read=* --allow-child-process --allow-worker --allow-addons" npm --logs-max=0 run typecheck
TMPDIR="$PWD/dist" NODE_OPTIONS="--permission --allow-fs-read=* --allow-fs-write=$PWD/dist --allow-child-process --allow-worker --allow-addons" npm --logs-max=0 run test
```

### 全包未通过原因与交接

- `src/workflow/execution/executionMediaSource.test.mjs:54` 与 `src/workflow/m2-fixes.test.mjs:204` 在创建原有 symlink 逃逸测试夹具时被 Node 权限模式拒绝：`ERR_ACCESS_DENIED: fs.symlink API requires full fs.read and fs.write permissions.` 两项未进入业务断言，不是本次引用源码断言失败。
- 未禁用、skip 或改弱两项测试；未移除权限模式或扩大到全盘写权限重跑。因此真实全包结果仍为 exit 1，不能把历史 1273/1273 或当前 1287 pass 称为全包通过。
- 主理人转交 QA 第二轮，在原工作树检查未提交修复并重跑原 QA/引用影响面；如需完整全包全绿证据，由主理人提供符合写边界且允许任务夹具 symlink 的运行环境。L2 由 seed 所属负责方正式解决后再进行真实 hover、IME、四边/缩放、持久化及菜单验收。
- 修复已具备 QA 第二轮接手条件；**not ready to merge / close**。本轮无提交，QA 测试和报告均保留未提交；所有已启动构建/测试 job 已收集结束。
