# 规格：ComfyUI 页面型节点 + 全屏打开（M1 / Issue #3681）

## 业务目标

用户选择按 MiniMax Design 的 1:1 路线复刻「画布上放一个 ComfyUI 节点，打开即全屏进入 ComfyUI 页面」。本规格只做 **M1**：把「页面型节点 + 全屏」这套通用机制和 ComfyUI 节点做出来，**指向一个已经在跑的页面**（用户自装的 ComfyUI 或任何可达地址），并给出连通探测与不可达引导。M1 **不含**任何下载/安装/启动后端的代码，也**不打包任何 ComfyUI 代码**（GPL 合规从 M2 起）。

## 用户关键操作旅程

1. 用户打开画布 → 「添加节点」面板 → 点「ComfyUI」→ 画布上出现一张 ComfyUI 节点卡（标题、目标地址、连通状态）。
2. 双击卡片（或点卡片上的「打开」）→ 画布上出现全屏层，里面是 iframe 指向目标地址（默认 `http://127.0.0.1:8188`）。
3. 目标可达 → 全屏层里就是那个页面（真 ComfyUI 时即完整编辑器）；ESC 或右上角关闭按钮退出，画布恢复原状。
4. 目标不可达 → 全屏层不空白：给「没有检测到该地址的页面」+ 一句怎么装/怎么启动 ComfyUI 的说明 + 地址输入框 + 「重试」+「关闭」。
5. 用户改地址并重试 → 成功则直接进入页面；地址写入节点数据，随工作区保存，重载画布后仍在。

## 期望 UI 反馈

- 节点卡：标题「ComfyUI」；地址行（截断显示）；状态行三态——「未检测」（还没探测过）/「正在检测」/「已连接」；不可达时不显示错误红字（节点卡只表达状态），细节留给全屏层的引导。
- 全屏层：占满画布视口；顶部一条窄栏（标题 + 地址 + 重试 + 关闭），下面是 iframe；加载中显示「正在打开…」。
- 同一时刻最多一个全屏层；关闭时销毁 iframe（不常驻后台占内存/连接）。
- 引导层（不可达时）：标题「没有检测到该地址的页面」+ 说明（安装并启动 ComfyUI，或填入你已经在跑的地址）+ 地址输入 + 「重试」+「关闭」。

## 变更点

1. 新增纯函数模块 `src/canvas/editor/utils/comfyPageUrl.ts`：`DEFAULT_COMFY_PAGE_URL`、`normalizeComfyPageUrl(input)`（补 `http://`、去尾斜杠、只接受 http/https、空/非法给 reason）。
2. 新增节点类型 `comfy-page`（`src/canvas/nodes/definitions/comfyPage.tsx`）：`NodeDefinition`（无物料端口）、默认数据 `{ title, url }`、palette 条目（i18n key）、卡片渲染 + 双击/按钮打开事件。
3. 新增全屏层 `src/canvas/editor/components/ComfyPageOverlay.tsx`：监听打开事件 → 从画布 store 解析节点地址 → 连通探测（`fetch(url, { mode: 'no-cors' })`，不要求目标站 CORS）→ 渲染 iframe / 引导层；ESC 关闭；地址改动写回节点数据。
4. `CanvasEditor.tsx` 注册新定义；`App.tsx` 挂载全屏层（与 `DirectorPanel` 同层，都在画布 island 根内）。
5. i18n：`palette.node.comfyPage`、`palette.group.creation` 复用、节点卡与全屏层/引导层文案 zh/en 齐备。
6. `components.css`：节点卡与全屏层样式（复用现有 token，不新增设计语言）。

## 非目标

- 不做托管后端下载/安装/启动（M2）、Python 运行时、失败态矩阵（M3）、平台/GPU 矩阵与版本绑定（M4）、模型权重下载。
- 不打包 ComfyUI 前端或后端代码；不复制其代码；不改既有 ComfyUI 导入/导出链路（#3669/#3625）。
- 不做跨窗口/多实例全屏、不做多标签页。
- 不改模板库、模板面板、执行中枢。

## 新用户基线

新用户机器上没有任何 ComfyUI：添加节点 → 打开 → 必须得到「没有检测到该地址的页面」的引导，而不是空白 iframe 或崩溃。默认地址用 `http://127.0.0.1:8188`（ComfyUI 官方默认端口），不用任何本机 dev 端口或绝对路径。

## 假设

1. 假设 ComfyUI 页面允许被 iframe 嵌入（上游默认不发 `X-Frame-Options`）。若被拒绝，M1 的兜底是引导层 + 「在新窗口打开」提示，这属于 M1 可接受结果（M2 起改用我们自己控制 origin 的托管后端时该限制消失）。
2. 假设 `fetch(url, { mode: 'no-cors' })` 对「本机有服务在监听」会 resolve、对「没人监听」会 reject，从而可在不依赖目标站 CORS 的前提下判活。
3. 假设画布 island 运行在 http(s) origin 下，`http://127.0.0.1:8188` 不会被混合内容策略拦截（Dev 与打包壳都是 http/loopback 场景）。
4. 假设节点数据里的 `url` 会随工作区快照原样保存与恢复（沿用现有 `sanitizeNodes` 行为）。

## 证伪方式

1. 若 ComfyUI（或任何测试目标页）返回 `X-Frame-Options: DENY` 或 CSP `frame-ancestors`，则 iframe 打不开——用真实浏览器验证：一个不发这些头部的本机 HTTP 服务能打开，并记录「目标自带禁止嵌入头」时的实际表现。
2. 若 `no-cors` 探测对「没人监听」也 resolve，则判活失效——用真实浏览器对比「有服务」与「没服务」两种情况的探测结果，若无法区分则改为 iframe `onload` + 超时兜底并如实记录。
3. 若 ESC 关闭后 iframe 仍在后台存活（连接未断），则「关闭即销毁」不成立——用真实浏览器检查关闭后 DOM 中不再有该 iframe。
4. 若地址改动后重载画布丢失，则持久化不成立——用真实浏览器改地址 → 触发保存 → 重载 → 断言地址仍是新值。
5. 若新用户路径出现空白全屏层或控制台报错，则基线不成立——新用户场景（无 ComfyUI）必须给出引导层且无未捕获异常。

## 验收标准

1. 「添加节点」面板出现「ComfyUI」条目，点击后画布上新增 `comfy-page` 节点，卡片显示标题、地址与「未检测」状态。
2. 双击卡片或点「打开」→ 出现全屏层；同一时刻最多一个（重复打开不叠加）。
3. 目标可达（真实本机 HTTP 服务）→ 全屏层内 iframe 真的加载并渲染出该页面；状态显示「已连接」。
4. 目标不可达 → 全屏层显示引导层（说明 + 地址输入 + 重试 + 关闭），不是空白。
5. ESC 与关闭按钮都能退出全屏；退出后 iframe 已从 DOM 移除。
6. 在引导层改地址并「重试」：可达时进入页面；地址写回节点数据并随工作区保存，重载后仍在。
7. zh/en 文案齐备；`normalizeComfyPageUrl` 单测覆盖补协议/去尾斜杠/非法输入；`pnpm --filter omnimux-workflow test`、typecheck、`pnpm verify:stages`、anti-slop 全绿；真实浏览器证据（截图）留存。

## 文档影响

- 本规格；证据 MD/JSON 记录真实浏览器结果（含「目标禁止嵌入」时的实际表现）。
- 不需要改 `docs/contracts/*`：M1 不引入新的产品契约（页面型节点机制待 M2 稳定后再抽契约）。

## 旧标准变更

Issue #3681 在「添加节点」面板新增一个条目（`comfy-page`），因此 #3640 冻结的调色板
「固定 8 项 / dock 8 项 / context 7 项」这一事实**必然变化**为 9 / 9 / 8。以下既有用例的
断言只改计数与清单内容，用例名与断言结构保持不变（不删除、不改写语义）：

- `plugins/omnimux-workflow/src/canvas/editor/components/addNodePalette.test.mjs` :: `ADD_NODE_PALETTE 固定 8 项顺序与强符号图标键名`
  - 原断言：`assert.equal(ADD_NODE_PALETTE.length, 8)`；`REQUIRED_ORDER` / `REQUIRED_ICONS` 为 8 项。
  - 必须改的理由：新增 `comfy-page` 条目（图标 `MonitorPlay`），调色板成为 9 项；本用例的职责正是「冻结清单与图标键名」，事实变了就必须同步。
  - 新期望证据：`length === 9`，`REQUIRED_ORDER` 尾部追加 `'comfy-page'`，`REQUIRED_ICONS` 尾部追加 `'MonitorPlay'`；弱别名禁令与其余断言原样保留。
- `plugins/omnimux-workflow/src/canvas/editor/components/addNodePalette.test.mjs` :: `getAddNodePalette 按作用域过滤：dock 8 项、context 7 项且不含导入素材`
  - 原断言：`dock.length === 8`、`context.length === 7`。
  - 必须改的理由：新条目在两个入口都出现（`scopes: ['dock','context']`），故为 9 / 8。
  - 新期望证据：`dock.length === 9`、`context.length === 8`，`context` 仍不含 `import_asset` 的断言保留。
- `plugins/omnimux-workflow/src/canvas/editor/components/addNodeMenuFlat.test.mjs` :: `3640：固定顺序 文本→表格→图片→视频→音频→导演台→视频剪辑→导入素材`
  - 原断言：`ADD_NODE_PALETTE.map(type)` 与 `getAddNodePalette('context').map(type)` 两个数组字面量（8 / 7 项）。
  - 必须改的理由：同一条清单，尾部新增 `'comfy-page'`。
  - 新期望证据：两个数组尾部各追加 `'comfy-page'`（顺序不变，仍为声明顺序）。
- `plugins/omnimux-workflow/src/canvas/editor/components/addNodePalette.search.test.mjs` :: `未声明分组时归入 null 组，不伪造分类`
  - 原断言：`groups[0].items.length === 8`。
  - 必须改的理由：dock 清单 9 项，分组不得丢项的契约不变。
  - 新期望证据：`groups[0].items.length === 9`，其余（`groups.length === 1`、`groupKey === null`）保留。
- `plugins/omnimux-workflow/src/canvas/editor/components/addNodePalette.search.test.mjs` :: `检索：空查询返回全部，标签/类型 id 命中，无命中返回空数组`
  - 原断言：`matchAddNodePalette(items, '').length === 8` 与 `matchAddNodePalette(items, '  ').length === 8`。
  - 必须改的理由：空查询返回全部 → 9 项。
  - 新期望证据：两处 `=== 9`，命中/无命中行为不变。
