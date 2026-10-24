# Issue 3669 · 「添加节点」面板入口改为 ComfyUI 工作流入口

- 任务工作树：`.worktrees/workflow-comfy-entry-3669`（分支 `agent/workflow-comfy-entry-3669-issue-3669`，base `origin/main` = `127565187`）
- 驱动：插件 dev harness（`node scripts/canvas-harness.mjs --port 0`，真实 `CanvasEditor`）+ ego-browser 真实 Chromium；无后端，导入链路本身不需要后端
- 结构化证据与截图（本机生成物，不进版本库）：`docs/evidence/issue-3669-comfy-entry.json`、`docs/evidence/issue-3669-0*.png`

## 改了什么

用户对照 MiniMax Design 参考图指出：那条「工作流」入口在他们的产品里是 ComfyUI 工作流入口，不是「把画布存成模板」。本次把入口换成 ComfyUI 工作流入口，并把导入状态提成单一 owner：

1. `comfyRecents.ts`（新增）：最近导入的本地便利缓存（纯函数 + 有界 + 绝不抛出）。
2. `workflowTransferStore.ts`（新增，zustand）：把原先长在 `Toolbar` 里的导入/导出状态机提出来，工具栏按钮与面板入口共用同一份预览状态与动作；`requestImport()` 用 nonce 让持有 `<input type="file">` 的组件弹选择器（全应用只有一个 input 实例）。
3. `AddNodeMenu.tsx`：底部入口改成 ComfyUI 工作流入口，点它把面板内容切成 comfy 视图（导入动作 + 最近导入列表 + 空态），Dock 与右键钻取共用。
4. `Toolbar.tsx` / `ContextMenu.tsx` / `CanvasEditor.tsx`：接 store；`AddNodeMenu` 不再需要 `onCreateWorkflow`（模板创建仍可从工具栏「模板」面板那张卡片进入，功能不丢）。
5. i18n：新增 9 个 `comfy.*` key，zh/en 同步；`components.css` 增加一条「最近导入」分组标题样式。

## 实测（真实浏览器，1728×883 视口，Dock 与右键两处入口）

| 断言 | 实测 |
| --- | --- |
| 底部入口文案 | 「ComfyUI 工作流」/「导入或复用 ComfyUI 工作流」（Dock 与右键钻取一致） |
| 点入口 → 视图切换 | 标题「ComfyUI 工作流」+ 返回箭头 + 导入行动作行；无导入记录时空态「还没有导入过 ComfyUI 工作流」 |
| 「从文件导入…」 | 真的弹出系统文件选择器（ego 报 `opened a file chooser` 即证据），选择器实例与工具栏导入按钮共用 |
| 导入预览 | 「ComfyUI 工作流（v0.4）」+「已支持 3 项，不支持 12 项」；**画布未替换**（4 节点 → 4 节点）、未标记已应用、最近导入仍为空 |
| 点「应用」 | 已应用；画布被替换（4 → 2 节点，与投影一致）；最近导入写入 `[{name: flow-0.4, format: v0.4, nodeCount: 2}]` |
| 重开面板 | 出现「最近导入」分组 + 条目「flow-0.4」/「v0.4 · 2 个节点 · 10-24 10:29」 |
| 点最近导入条目 | **只出预览**：画布 2 → 2 未变、`applied=false`；再点「应用」才替换 |
| 坏文件（`{"hello":"world"}`） | 预览面板「导入失败」+「既不是 OmniMux 工作流文件，也不是受支持的 ComfyUI 工作流」+ 原始 detail；最近导入不变（仍 1 条） |
| 右键钻取入口 | 右键空白处 →「添加节点」→ 底部入口「ComfyUI 工作流」→ comfy 视图（含最近导入） |
| 缓存不可用（`Storage.prototype.setItem` 抛错） | 预览与「应用」照常工作（画布替换成功、无异常）；已落盘的最近导入不变，仅本次不新增 |

## 自动化检查

- `pnpm --filter omnimux-workflow test` → **2937 pass / 0 fail**（新增 `comfyRecents.test.mjs` 7 用例；既有 `AddNodeMenu` / `Toolbar` / `ContextMenu` 用例未回归）
- `pnpm --filter omnimux-workflow typecheck` → canvas + host + director 三段绿
- `pnpm verify:stages` → PASS（14 Stage / 8 sidebar）；anti-slop 3/3；`git diff --check` clean
- i18n：`comfy.*` 9 个 key zh/en 齐备，key 集合一致

## 非目标（未做）

不打包/启动 ComfyUI 后端、不探测 ComfyUI 服务或目录；`src/shared/comfyui/*` 一行未动；模板库 schema 与模板面板未动；不做「模板 ↔ ComfyUI 身份」打通；无新增后端路由（缓存只在客户端 localStorage）。

## 已知缺口

- 浅色主题、键盘可达性、Electron 壳层未覆盖；en locale 仅静态对齐（key 集合一致），未跑英文实机。
- 「最近导入」是**本机本浏览器**的便利缓存（上限 8 条、单条 256 KiB），不是产品真源；换浏览器/清存储后列表为空，属预期。
- 列表暂不支持单条删除（超出上限自动淘汰）。
