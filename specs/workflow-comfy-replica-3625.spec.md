# 规格 · 画布工作流复刻（ComfyUI 风格编辑体验 + 工作流格式互操作）

- Issue: #3625
- Worktree: `.worktrees/omnimux-workflow-comfy-replica-issue-3625`（分支 `agent/omnimux-workflow-comfy-replica-issue-3625`，base `origin/main` @ `988ccc3a4`）
- 授权：用户在 2026-10-23 明确选择范围 **A+B** + 模板面板卡片化（`docs/contracts/mvp-scope.md` §3 越界声明已给出并获同意）

## 背景与现状

MiniMax Design 的「ComfyUI 工作流」入口经只读拆解确认：其本体是上游 ComfyUI 前端（GPL-3.0）被 MiniMax 打补丁后再分发，bundle 内零许可证文件，并自带 714MB/1.47GB 托管后端。因此本次**只复刻行为与接口事实**，不搬运任何代码或资源。

我方画布（`plugins/omnimux-workflow`）引擎为 `@xyflow/react` 12.11.3 + Feed/Slot 卡槽契约 + 拓扑分层调度；缺的是编辑器外围能力：节点分类搜索、队列面板、中间帧预览、文件级导入导出、模板面板卡片形态。

## 用户操作旅程

1. 打开画布 → 点「添加节点」→ 按分类浏览或输入关键字搜索 → 选中并落节点。
2. 连接若干生成节点 → 点运行 → 在队列面板看到 Queue/Pending/Running/History 的实时变化。
3. 生成过程中节点卡槽出现中间帧预览；完成后被最终产物替换。
4. 导出当前工作流为本地 `.json`；重新导入还原。
5. 导入一份 ComfyUI 工作流（v0.4 或 v1）→ 结构被解析，不支持的节点/参数以清单形式显式列出。
6. 打开工作流模板面板 → 卡片形态浏览模板 + 「新建工作流」入口。

## 期望界面 / 交互

- 节点调色板：分组折叠 + 搜索框 + 空态文案；搜索命中高亮；最近使用分组可选。
- 队列面板：四区列表，条目含节点名/状态/耗时；与现有暂停/取消语义一致，不新增调度状态。
- 中间帧预览：仅在生成中显示，带「生成中」状态；完成后清理，不覆盖最终产物。
- 导入导出：Toolbar 提供导出/导入入口；导入非法文件给出可读错误；ComfyUI 导入结果面板列出不支持项。
- 模板面板：卡片网格（封面/标题/描述/操作），含「新建工作流」入口卡。
- 文案遵循 `ui-copywriting-and-naming-standards.md`，中英双语同步。

## 验收标准

见 Issue #3625「验收标准（可观察）」1–7。本规格不重复。

## 技术设计

| 面 | 主要落点 |
|---|---|
| 节点调色板 | `canvas/editor/components/**/addNodePalette.ts`、`AddNodeMenu.tsx`，复用 `canvas/nodes/registry.ts` 节点定义（`getPaletteEntries`） |
| 队列面板 | `canvas/editor/components/**/ExecutionBar.tsx`、`workflow/execution/**`（含 `executionStore.ts`），只读消费 `ExecutionScheduler` 状态 |
| 中间帧预览 | `MediaPreview.tsx`、`GenerationStateContainer*`、`useExecutionController.ts` 的进度事件消费 |
| 导入导出 | `Toolbar.tsx`、`templateApi.ts`（仅当需要），新增 `shared/comfyui/`（schema 编解码，纯函数） |
| 模板面板卡片 | `CreateWorkflowModal.tsx`（或同目录模板面板组件） |
| i18n | `canvas/i18n/dict.zh.ts` + `dict.en.ts`（共享文件，见硬性约束） |

ComfyUI 编解码只做**结构映射 + 显式不支持清单**：v0.4（`links` 为 6 元组）与 v1（`state` + 对象化 `links` + `reroutes` + `subgraphs`）分别解析，输出 `{ supported: [...], unsupported: [{ kind, id, reason }] }`，绝不静默丢弃。

## 硬性约束

- 禁止粘贴/内联上游 ComfyUI 代码、资源、字体、图标；只允许独立实现的 schema 编解码与 UI。
- 禁止新增后端、下载器、插件宿主、`window.hub` 类全局注入。
- 不改变现有调度语义（暂停/取消/并发上限）与节点输入契约（`node-input-submission.md` §3 Feed/Slot）。
- `canvas/i18n/dict.zh.ts` 与 `dict.en.ts` 为共享文件：编辑前重读，遇 `FS_STALE_VERSION` 基于新内容重做；只追加自己的 key，不改他人条目。
- 所有写入限于本 worktree 内。

## 证据要求

- 相关单测：`pnpm --filter <package> test`（omnimux-workflow 包名以 package.json 为准）。
- 静态检查按 `docs/contracts/plugin-qa.md` 最小命令选型取并集。
- UI 变更必须在**本 worktree 内**做真实浏览器验证并留存截图/结构化报告（`pnpm test:worktree-web` 或 ego-browser）。
- 交付报告列出：选定命令、跳过原因、以及未执行的检查。

## 假设

假设本仓画布已具备可复用的节点定义注册表与执行状态订阅（`registry.ts` 的 `getPaletteEntries()`、`ExecutionScheduler` + `executionStore`），因此新增能力以「读现有状态 + 增补 UI/编解码」为主，不需要改动调度内核与 Feed/Slot 契约；若该假设不成立，改动面会扩大到调度层，需要重新评估风险等级。

## 证伪方式

若节点定义注册表无法提供分组/关键字所需元数据（例如缺少分类字段或节点描述），则调色板搜索无法在不改 `registry.ts` 数据契约的前提下实现——此时以 `registry.ts` 与节点 spec 文件的实际字段为准，改为扩展节点元数据并记录契约影响；同理，若执行状态无法在 UI 侧订阅到队列/运行中条目的完整信息，则以 `executionStore.ts` 的实际暴露字段为准，不得伪造队列数据，改为先补状态导出并单独记录为契约变更。

## 新用户基线

全新用户机器上，本功能只依赖本仓自带的画布与节点定义：节点调色板、队列面板、中间帧预览、导入导出、模板卡片面板均不依赖开发机私有状态、外部后端、本地模型服务或环境变量。ComfyUI 工作流导入为**纯本地文件解析**，不连接任何 ComfyUI 服务；缺少 ComfyUI 后端时导入仍可用（只做结构映射并列出不支持项），不出现「请先安装后端」式开发机假设。
