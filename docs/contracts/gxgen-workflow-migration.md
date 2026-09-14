---
title: "Gxgen → OmniMux 工作流迁移蓝图（代理必读）"
id: "contract-gxgen-workflow-migration"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-22"
updated: "2026-08-30"
authors: ["x", "agent-architect"]
subsystem: "omnimux-workflow"
---

# Gxgen → OmniMux 工作流迁移蓝图（代理必读）

> **真源**：本文件。新会话动手前必读；改进度只改文末「进度矩阵」+ 当日 memory 一句。  
> **对照源**（只读）：`/Users/x/Desktop/Project/Gxgen/apps/web/src/pages/{Projects,CanvasEditor}/`  
> **落点插件**：`plugins/omnimux-workflow/`（画布）+ 侧栏入口协调（hub `window.__omnimuxSidebar`）  
> **规格姊妹篇**：`docs/superpowers/specs/2026-08-22-gxgen-workflow-migration-design.md`  
> **更新规则**：实现合入后同 PR 改本矩阵状态；禁止口头宣称「已对齐」而无矩阵行变更。

---

## 0. 目标与顺序（已拍板）

| 项 | 决定 |
|---|---|
| 总目标 | 把 Gxgen 工作流能力完整迁入 OmniMux 插件体系 |
| **推进顺序** | **① 项目壳 → ② 单项目主界面 UI/交互完全同步 → ③ 多项目/模板管理** |
| Phase 0 语义 | 「项目」= **一个本地作品文件夹**；该文件夹 **就是** dsh 工作区（会话 cwd）。不是画布 `WorkspaceStore`，也不是「父工作区里藏一堆 json」 |
| 项目文件落盘 | **默认库** `<videos>/OmniMux/Projects/<可读名>/`（对齐 MiniMax 视频已知文件夹策略，品牌名用 OmniMux）。项目列表扫这个库，不再跟「当前会话 cwd」走 |
| **侧栏结构** | 「工作流」入口**现文案「项目」**（曾用「项目库」）；「新建项目」与「新建会话」同级；新建项目会**弹名称窗 → 建文件夹 → 登记工作区 → 新建会话 → 默认打开画布** |
| **新建本地项目规格** | `docs/superpowers/specs/2026-08-23-omnimux-local-project.md`（2026-08-23 拍板） |
| **页面结构** | 「项目」一级页 = **入口页**（默认进项目列表）；点项目 → **详情页**（中间会话对话 + 右侧栏画布 tab） |
| 入口页范围 | **只保留核心**：标题+副标题、`+新建项目`、本地项目 tab、搜索、最近更新排序、项目卡片（封面/标题/日期） |
| 入口页裁剪 | 「查看教程」「共创项目」及云共享/引导壳 = **不做** |

### 0.1 结构性调整（本次新增，已拍板）

> 老板 2026-08-22 定调：现在的工作流插件页是「入口」，应改成「详情页」。

| 维度 | 调整前 | 调整后 |
|---|---|---|
| 侧栏入口文案 | 「工作流」 | 「项目」（2026-08-23 由「项目库」再缩短） |
| 默认落点 | 全屏 `shell.overlay` 画布 | 「项目」列表页（入口页） |
| 点项目后 | —（单项目直进） | 详情页：中间会话 + 右侧栏画布 tab |
| 新建项目 | 复用当前 cwd 写隐藏 json | **弹「新建本地项目」** → 默认库建文件夹 → `workspaces.create({ path })` → 新会话 + **默认打开画布 15:85** |
| 画布位置 | 全屏 overlay | **`dsh-better-sidebar` 画布 tab**（见 §2.1 落法 C；官方 details 不接管） |
| 会话交互 | 无 | 中间会话区可对话（画布与会话并存） |

### 0.2 宿主三栏事实（架构硬约束）

dsh 宿主是 `sidebar | conversation | details` 三栏（`deepseek-harness/packages/client/ui-layout/src/client/AppFrame.tsx`）：

| 座位 | 类型 | 现状 | 画布可用性 |
|---|---|---|---|
| `sidebar` | 列表槽 | 新会话/工作区/应用 | 「项目」入口落这里 |
| `conversation` | 单占有 | 会话区，含 `conversation.view` tab 环（chat/trajectory/waterfall） | 中间对话区 |
| `details` | **单占有** | 被官方「工具详情」面板占用（宽 300–520px，`ctx.layout` 管开关） | **画布右侧 tab 的候选落点，但无原生 tab 环** |
| `shell.overlay` | 列表槽 | 当前工作流全屏页 | 项目库列表页可复用 |

**结论**：「画布当右侧 tab」没有现成 tab 环；要么接管 `details` 整列自建 tab 环（与「工具详情」共存），要么继续全屏。落法见 §2.1，属**待拍板**架构决策。

非目标（本蓝图不假装已有）：云端协作、积分门控、Gxgen admin 模板编辑后台、分享只读公链。

---

## 1. 术语表（禁止混用）

| 中文名 | 代码/路径语义 | 是什么 | 不是什么 |
|---|---|---|---|
| **dsh 工作区文件夹** | 官方会话所选 cwd / `workspaces.items[].path` | 对新建项目：**等于**该项目文件夹 | 不是「许多项目共用的父沙盒」 |
| **OmniMux 项目** | `<videos>/OmniMux/Projects/<可读名>/` | 作品包；侧栏「项目」条目；绑定 1 个工作区 + 1 个会话 | 不是画布 `WorkspaceStore`；不是旧的 `cwd/.omnimux/projects/<id>` |
| **画布工作区** | `WorkspaceStore` / `workspaces/<id>/canvas.json` | 一张创作画布文档（nodes/edges/…） | 历史命名易混；文档里写「画布工作区」，UI 文案统一说「创作画布」 |
| **Gxgen Project** | `projects/:projectId` | Gxgen 产品壳命名空间 | 对齐时只学交互/职责，不照搬云 API |

**代理硬规则**：写代码前先说清自己在改哪一层。禁止把「新建项目」做成 `createWorkspace('我的工作流')` 的换皮。禁止用 `connectWorkspace`（复用空白会话会把画布换成 Files）。禁止 `sessions.create({ cwd })`。新建顺序是文件夹 → 账本 → 会话。

---

## 2. 能力分层（Gxgen 结构拆解 → 迁移地图）

> 层是**能力边界**，不是目录清单。单项目主界面 = L2–L7；项目壳 = L0'（OmniMux 自研）+ 轻量 L1；模板/多库 = L8。

### L0' OmniMux 项目壳（Phase 0 · **当前主战场**）

| 维度 | 内容 |
|---|---|
| 核心 UI | 侧栏「新建项目」「项目」；项目列表页（卡片/空态）；打开项目后的会话落点 |
| 关键交互 | 新建 → **弹窗收名称** → 默认库建可读文件夹 → `workspaces.create({ path })` 进账本 → `sessions.create({ workspaceId })` → 默认开画布 15:85；点「项目」条目 → 打开绑定会话；删除/重命名（最小 CRUD） |
| 数据 | 默认库目录下一层项目文件夹；每项目 `.omnimux/project.json`；`projectId` ↔ `workspace.path` ↔ `sessionId` |
| Gxgen 参照 | `Projects/ProjectEntry.tsx`、`openProjectConversation.ts`、`ProjectWorkflow.tsx`（学「进项目必有会话/工作台」节奏，不抄云存储） |
| OmniMux 现状 | ❌ 无；仅有侧栏「工作流」一级页直进画布（`sidebar-entry` rank 5） |
| 优先级 | **P0** |

### §2.1 画布落位（右侧宽栏 · 已改拍板）

「新建项目默认打开画布，画布在右侧栏作为 tab」。官方 `details` 与 `dsh-better-sidebar` **不是同一根分割线**：

| 表面 | 实现 | 宽度 |
|---|---|---|
| 官方工具详情列 | AppFrame `details` 列，`layout.setDetails`，`DETAILS_MAX=520` | **锁死 300–520px** |
| 第三方 Files 工作台 | `[data-dsh-panel-host]` overlay；`setWidth` 上限是 `window.innerWidth`；推挤 `#root` 的 `margin-right: var(--dsh-sidebar-width)` | **可拖到接近整窗**（默认偏好 20–60%） |

截图里能拉宽的是后者，不是官方 details。方案 A 把画布塞进 details，所以会话/画布分割线拖不动。

| 方案 | 做法 | 代价 | 适合 |
|---|---|---|---|
| **A 接管 `details` 自建 tab 环** | 注册进 `details`，`priority=-10` shadow 官方 `DetailsPanel` | 宽度仍锁 520px；且 **全局** 抢走所有会话的工具详情 | 否决（2026-08-22 晚） |
| **B 画布继续全屏 overlay** | 项目库列表页作一级页；点项目才全屏画布 | 不满足「右侧 tab 并存会话」 | 否决 |
| **C 注册 `dsh-better-sidebar` tab + 按会话隔离** | `ctx.betterSidebar.registerTab({ id: 'omnimux-workflow:canvas' })`；新建会话不碰 Files；新建/打开项目：`closeDetails` + 关掉空 Files 种子 + `openTab(canvas)` | 依赖预置的 `dsh-better-sidebar`；画布与 Files 共用同一面板宿主（按会话分，不并存同一会话） | **采纳** |

**已拍板（2026-08-22 晚）**：**方案 C**。老板澄清：① 第三方文件浏览器能拉宽，说明宽栏基础设施已有；② 「新建会话 / 新建项目」右侧栏插件要隔离——普通会话保持 Files；项目会话点右上角面板按钮应是我们的画布。

> **实现要点（源码核对 `dsh-better-sidebar` v0.14.0）**：
> - 服务：`ctx.betterSidebar.registerTab / openTab / closeTab / getSnapshot`；布局按会话存在 `dsh-sidebar:v1:<sessionId>`。
> - 宽拖：`setWidth` 上限 `Math.max(280, window.innerWidth)`，默认新会话宽度 `defaultWidthPercent`（20–60，默认 35）。
> - 新会话种子：空 Files 窗口（`type:'editor'` 无 path）。项目会话创建后关掉这种种子，再打开画布 tab（`single: true` + sentinel `path` 触发 content-open 自动展开面板）。
> - 官方 `details`：**不再 shadow**。项目进画布时 `layout.closeDetails()`，把 520px 第三列收掉，避免 Files/画布/工具详情三列并排。
> - `betterSidebar` 用 `ctx.inject(['betterSidebar'], …)` 延迟注册，未装第三方栏时项目仍可建，只是没有宽栏画布。
>
> **原阻塞点处理**：
> - 工具详情：项目会话不占官方 details，普通会话工具详情恢复官方面板。项目会话内「点工具看详情」仍留 Phase 0.5。
> - 项目会话默认对话:画布 = 15:85（相对对话列 + 右栏，不是整窗；2026-08-23 观测拍板，旧 3:7 当磁铁仍会改写）。公开 API 没有 `setWidth`，走画布 tab 的 `store.reduce`。不再 patch 官方 `DETAILS_MAX`。

### L1 项目内作品/画布列表（Phase 0 末 / Phase 2 头）

| 维度 | 内容 |
|---|---|
| 核心 UI | Gxgen：`ProjectWorkflow` 卡片栅格 + 新建卡 |
| 关键交互 | 新建空画布并进入；卡片进编辑；删除/重命名画布 |
| 数据 | Gxgen `WorkspaceListItem`；我们侧 = 某项目下的画布工作区列表 |
| 现状 | 画布 API 已有 list/create；**无项目归属、无库页 UI** |
| 优先级 | P0 做「打开项目 → 进默认画布」最短路径；完整库页可 P2 |

### L2 画布 chrome（Phase 1）

Header / Toolbar / Zoom / 返回 / 自动保存态 /（可选）右侧辅助面板。  
证据：`CanvasEditor.tsx`、`Header.tsx`、`Toolbar.tsx`、`ZoomControl.tsx`。  
现状：有简化 Toolbar + ExecutionBar + xyflow Controls/MiniMap；缺 Gxgen Header/ZoomControl/对齐线/多选条。  
优先级：**P1**

### L3 节点卡片（Phase 1）

MaterialNode 壳、类型图标、反缩放标题、状态徽标、结果节点族（决策是否独立 ResultNode）。  
证据：`MaterialNode/`、`*ResultNode.tsx`、`MediaNode/`。  
现状：W1 节点壳对齐中；无独立 ResultNode 族。  
优先级：**P1**

### L4 连线与菜单（Phase 1）

Handle、AnimatedEdge、断开、空白/节点右键、松手菜单、多选操作。  
证据：`CanvasNodeHandle`、`AnimatedEdge`、`ContextMenu`、`CanvasNodeActionMenu`、`useConnectionMenu`。  
现状：W3 主干已有，菜单面更窄。  
优先级：**P1**

### L5 配置面板（Phase 1 · 视觉高优先级）

Prompt / ParamBar / 模型 / 参考槽 / 生成按钮 / Mode·Advanced·Preset 深度。  
证据：`MaterialNode/components/ConfigPanel/*`。  
现状：Shell + antd 简版内容；缺 Gxgen 控件族深度。  
优先级：**P1（高）**

### L6 媒体预览与结果（Phase 1）

节点内预览、hover 操作、全屏预览、结果回写。  
证据：`shared/MediaPreview.tsx`、`MediaPreviewModal`、`WorksManagement*`。  
现状：54 行真预览骨架，无 hover/扩展操作。  
优先级：**P1（高）**

### L7 执行反馈（Phase 1 巩固）

执行条、节点 executionStatus、GSC、SSE 回写。  
证据：`useExecutionSync`、`GenerationStateContainer`、Header Task。  
现状：M3–M5 已接通真实 seam；UI 精修跟 L2/L3。  
优先级：**P1**

### L8 模板与多项目扩展（Phase 2）

模板墙、变体、分享、跨工作区项目、完整「全部项目」。  
证据：`TemplatesPanel`、`ProjectWorkflow` 模板区、`/share/canvas`。  
优先级：**P2 · 后置**

### 明确裁剪（不当漏对齐）

Timeline / ExportModal / Text overlay·样式轨 / VideoComposition / 积分门控 / 参考槽云上传 —— 见 `plugins/omnimux-workflow/docs/ARCHITECTURE.md` §5。若未来要做，新开层，不塞进 P1。

---

## 3. Phase 计划

### Phase 0 — 项目壳（先做）

**完成定义（DoD）**

1. 侧栏在「新建会话」旁（同级视觉规范，见 `sidebar-extra-entries.md`）出现 **新建项目**；原「工作流」入口**现文案「项目」**（曾用「项目库」）。  
2. 点「新建项目」：弹「新建本地项目」收名称 → 在默认库建可读文件夹 → `workspaces.create({ path })` 进账本 → `sessions.create({ workspaceId })` → **默认打开画布 15:85** → 项目出现在「项目」列表。禁止复用当前 cwd、禁止 `connectWorkspace`。  
3. 点「项目」默认进入**项目列表页**（不是直接进画布）；点项目 → 进详情（会话 + 画布）。列表扫描默认库，不是「当前会话 cwd 下的隐藏 index」。  
4. **一个项目 = 一个 dsh 工作区文件夹**；会话 cwd 等于项目根。  
5. 从项目进画布最短路径可用（**Phase 0 即右侧宽栏画布**：`dsh-better-sidebar` 画布 tab + 中间会话并存；官方 details 不接管）。  
6. 契约文档 + 进度矩阵更新；浏览器/真实 App 冒烟通过。

**建议拆步（实现时再开任务清单）**

| 步 | 内容 |
|---|---|
| 0.1 | 契约：本地项目文件格式、默认库路径、与 sessionId 绑定（本蓝图 §5 + `2026-08-23-omnimux-local-project.md`） |
| 0.2 | Host：默认库扫描 + 项目根内 `.omnimux/project.json`；新建走 Host mkdir（`POST {title}`）+ `workspaces.create({ path })` |
| 0.3 | 侧栏：新建项目 + 项目（走 `__omnimuxSidebar`，禁止自挂 observer）；入口文案现为「项目」 |
| 0.4 | 「项目」页（一级页）最小列表 + 空态 + 打开（点项目 → 会话 + 画布） |
| 0.5 | 新建弹窗 → 建文件夹 → 登记工作区 → 建会话 → 默认开画布 15:85 联调 |
| 0.6 | **右侧画布**：`dsh-better-sidebar.registerTab` 画布 tab；项目会话关空 Files 种子；官方 details `closeDetails`；中间会话区与右画布并存 |
| 0.7 | **侧栏「新项目」并排「新会话」**：hub `sidebar-coordinator` 扩展「并排按钮」注册类型 |

**归属（已拍板 2026-08-22）**：**先写进 `omnimux-workflow`**，Phase 0 跑通后再拆独立插件。侧栏仍必须走 `__omnimuxSidebar`；模块边界在插件内先用目录切开（如 `src/projects/`），方便日后整体搬家。

**结构性调整（已拍板 2026-08-22；文案 2026-08-23 再缩短）**：`工作流` → `项目库` → `项目`（入口页 = 项目列表，只留核心）；详情页 = 中间会话 + 右侧画布 tab。画布落位 = §2.1 **方案 C**（2026-08-22 晚改拍板）：挂 `dsh-better-sidebar` 画布 tab，按会话与 Files 隔离；官方 details 不再 shadow。
### Phase 1 — 单项目主界面 UI/交互完全同步

在**已打开的一个项目上下文**内，L2–L7 与 Gxgen 主界面观感/交互对齐（完整迁移目标下的主界面同步）。  
优先序（来自既有差距盘点）：

1. ConfigPanel 控件深度  
2. MediaPreview hover/操作层  
3. EmptyState / 文本专用渲染  
4. ZoomControl / AlignmentGuides / MultiSelectionToolbar  
5. Header/Toolbar 广度（资产/历史等按产品需要逐项）  
6. ResultNode 族：先产品拍板「独立节点 vs 内嵌」再搬

### Phase 2 — 多项目 / 模板管理

L1 完整库页、L8 模板/变体/分享、跨更多管理能力。不阻塞 Phase 1。

---

## 4. 进度矩阵（代理更新此处）

状态枚举：`未开始` | `规格中` | `实现中` | `可验收` | `已对齐` | `裁剪/不做` | `待拍板`

| ID | 能力 | Phase | 状态 | 证据/备注 |
|---|---|---|---|---|
| P0-01 | 术语与蓝图真源 | 0 | **已对齐** | 本文件 2026-08-22；2026-08-23 改「项目=独立文件夹=工作区」 |
| P0-02 | 本地项目文件格式契约 | 0 | **可验收** | `src/projects/` 改冻：项目根=`<videos>/OmniMux/Projects/<名>/`；扫描为真相，index.json 停主路径。schemaVersion 仍 1。单测 133 绿；未 App 冒烟。**不得标已对齐** |
| P0-03 | 侧栏「新建项目」 | 0 | **可验收** | 三入口先弹窗再 `runNewProject`（侧栏 inline + 折叠加号 click 原按钮 + 项目库页） |
| P0-04 | 侧栏「项目」 | 0 | **可验收** | `sidebar-entry.js` rank 5 label 现为「项目」（locales `nav`，2026-08-23 由「项目库」缩短）；一级页 metrics 同 sidebar-extra-entries.md |
| P0-05 | 新建→写文件→建会话 | 0 | **可验收** | `runNewProject`：POST `{title}`（Host mkdir + 说明.md + project.json）→ `workspaces.create({ path })` → `sessions.create({ workspaceId })` → 关一级页 overlay → open → 画布 15:85。禁止客户端 createDirectory / connectWorkspace / create({ cwd })。**不得标已对齐**（App 冒烟前） |
| P0-06 | 项目库列表/打开/删改最小集 | 0 | **可验收** | `ProjectLibraryPage.jsx` 列表/空态/搜索/排序/打开/重命名/删除；`ProjectStore` rename/remove 单测绿 |
| P0-07 | 项目→画布最短路径 | 0 | **实现中** | `openProject` / `runNewProject` → `activateProjectCanvas`（关 details + 关空 Files 种子 + 开画布 tab） |
| P0-08 | 插件归属（hub vs 独立） | 0 | **已对齐** | 先写进 `omnimux-workflow`，Phase 0 稳定后再拆独立插件 |
| P0-09 | 「工作流」改「项目」+ 项目列表入口页 | 0 | **可验收** | locales `nav`/`projects.title` 现为「项目」（2026-08-23）；`shell.overlay` 换 `ProjectLibraryPage`（只留核心，砍教程/共创） |
| P0-10 | 画布右栏 tab 落法 | 0 | **实现中** | **改拍板方案 C**：`registerTab('omnimux-workflow:canvas')` 进 `dsh-better-sidebar`；撤销 details shadow（删 `ProjectDetailsPanel`）。App 冒烟待 sync+restart |
| P0-11 | 侧栏「新项目」并排「新会话」 | 0 | **可验收** | 展开：inline 并排。收起轨 56px：隐藏项目按钮，官方加号弹出「新建会话 / 新建项目」（点菜单再 click 原按钮）。折叠态 observer 绑 AppFrame `data-sidebar-collapsed`（不是 html）。单测 4/4；已 `omnimux:sync omnimux`，未重启 |
| P0-12 | 工具详情回退策略 | 0 | **可验收** | 方案 C：普通会话官方 details 原样；项目会话 `closeDetails`，工具详情完整回退仍留 Phase 0.5 |
| P0-13 | 画布列宽（对话:画布 15:85） | 0 | **可验收** | `PROJECT_CANVAS_RATIO=0.85`。必须 live `store.reduce` 刷 CSS；无 store 只写盘 = 继续等。磁铁：15:85 / 旧 3:7（70%）/ 工厂 35% / leftover ~50% / crush <0.22。折叠官方栏 36px 也写。人手拖过不改。普通 New Session 仍 35%。L2 1280/280 → 约 150:850。**窗口复测前不得标已对齐** |
| P0-14 | 新建本地项目（作品包=工作区） | 0 | **可验收** | 弹窗等到 create 结束才关；失败画在弹窗。Host `allocateUniqueProjectFolder`。现网桌面 native picker 不能 createDirectory。**不得标已对齐**（App 冒烟前） |
| P1-01 | ConfigPanel 深度 | 1 | 实现中 | W2 Shell 有；内容薄 |
| P1-02 | MediaPreview 交互层 | 1 | 实现中 | W1 骨架有 |
| P1-03 | EmptyState / 文本渲染 | 1 | 未开始 | |
| P1-04 | Zoom / 对齐线 / 多选条 | 1 | 未开始 | |
| P1-05 | Header / Toolbar 广度 | 1 | 实现中 | Toolbar 四素材+撤销 |
| P1-06 | Handle / Edge / 松手菜单 | 1 | 可验收 | W3 主干 |
| P1-07 | NodeHeader / GSC / 徽标 | 1 | 可验收 | W1 |
| P1-08 | 执行条 + SSE 反馈 | 1 | 可验收 | M3–M5 |
| P1-09 | ResultNode 族策略 | 1 | **待拍板** | 独立 vs 内嵌 |
| P1-10 | Timeline/导出/文字轨等 | — | 裁剪/不做 | ARCHITECTURE §5 |
| P2-01 | 项目内多画布库页 | 2 | 未开始 | |
| P2-02 | 模板墙 / 变体 | 2 | 未开始 | |
| P2-03 | 分享只读 | 2 | 未开始 | 或永久裁剪 |

---

## 5. Phase 0 数据契约（2026-08-23 改冻）

> 产品规格：`docs/superpowers/specs/2026-08-23-omnimux-local-project.md`。  
> **不得**改回 `$DSH_HOME` 全局作品库，也**不得**改回「当前会话 cwd 下 `.omnimux/projects/<id>`」（除非重新拍板）。

**布局**

```text
<videos>/OmniMux/Projects/          # 默认库：Mac ~/Movies/…；Win %USERPROFILE%\Videos\…
  <可读项目名>/                     # = dsh workspace.path = 会话 cwd
    说明.md
    assets/imported/                # 外部导入物理副本（2026-08-30）
    assets/subjects/<id>/           # 全局主体快照
    artifacts/                      # 画布生成物
    .omnimux/
      project.json
      assets.json                   # 项目资产 SSOT
      canvases/<canvasId>.json      # 刀 2：从 $DSH_HOME workspaces 迁入
```

媒体与相对路径：[`project-assets-contract.md`](project-assets-contract.md)。旧 `images/ video/ audio/` 与单文件 `canvas.json` 不再作为新写入布局。

旧实现 `<cwd>/.omnimux/projects/<id>/project.json` **作废为主路径**。不自动迁移；项目库只扫默认库。

**`project.json` 最小字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 稳定 id |
| `title` | string | 展示名（用户输入） |
| `createdAt` / `updatedAt` | ISO string | |
| `sessionId` | string \| null | 绑定会话；新建写入 |
| `canvasWorkspaceIds` | string[] | 内部画布 id；可先 0～1 个 |
| `schemaVersion` | number | 从 1 起；字段增量向后兼容 |

**新建顺序（硬）**

弹窗收名称 → `POST /api/projects { title }`（Host mkdir + 说明.md + project.json）→ `workspaces.create({ path: projectRoot })` → `sessions.create({ workspaceId })` → 关一级页 overlay → open → `activateProjectCanvas` 15:85。  
禁止客户端 `createDirectory`、禁止 `connectWorkspace`、禁止 `sessions.create({ cwd })`。

**红线**

- 不把作品写进 profile `node_modules` 或 `$DSH_HOME/omnimux/workflow/`（画布搬家见刀 2）。  
- 不手改其它插件的 sidebar observer。  
- 生产 profile 仍禁止 link 工作区（`dev-pipeline.md`）。  
- 写入 containment：只写 `projectRoot` 内。  
- 删项目默认不 `rm` 用户文件夹。

---

## 6. 代理开发规范（跨会话）

1. **先读本文件 + 进度矩阵**，再读 `omnimux-workflow/README.md` / `ARCHITECTURE.md`。  
2. **一次只推一个 Phase 主线**；Phase 0 未 DoD 前，不把大块 P1 视觉当主交付（可打探针，不可宣称完成迁移）。  
3. UI 对齐以 Gxgen 源码与真实截图为准；改 token 走 `--wb-*` / OmniMux 品牌，不搬死紫色。  
4. 侧栏新增行：必须 `__omnimuxSidebar.register`，并更新 `docs/contracts/sidebar-extra-entries.md` occupants。  
5. 交付口令：真实浏览器或 App 冒烟 + 矩阵状态变更；拒收自证「感觉对齐了」。  
6. 中文沟通；路径/符号保留英文。文档中英文之间加空格。  
7. 发现术语混用（项目 / 工作区 / 画布工作区）→ 先改文档再改代码。

---

## 7. 新会话上手 30 秒

```text
1. 打开本文件，看 §0 顺序与 §4 矩阵「未完成的最高优先级行」
2. 若做 Phase 0 → 读 §5 + sidebar-extra-entries.md + client-external-store.md
3. 若做 Phase 1 → 读 plugins/omnimux-workflow 下对应组件 + Gxgen 同源文件
4. 改完：更新矩阵状态 + .workbuddy/memory/当日日志一句
```

---

## 8. 修订记录

| 日期 | 变更 |
|---|---|
| 2026-08-22 | 初版：分层拆解、Phase0 项目壳优先、项目文件跟会话工作区文件夹、进度矩阵 |
| 2026-08-22 | 结构级调整：工作流→项目库、详情页=会话+右侧画布 tab；§0.2 三栏硬约束；§2.1 画布落位 A/B 方案 |
| 2026-08-22 | Phase 0 编码落地（林深）：项目 host 数据层（schema/paths/ProjectStore/routes 并入 workflow dispatcher）+ hub coordinator `kind:'inline'` + client（项目库入口页/新建项目/details 接管画布 tab 环/工具详情空态）；P0-02~P0-13 矩阵推进到「可验收」，build + `node --test` 99 绿，浏览器/App 冒烟待 Phase 4 联调 |
| 2026-08-22 | Phase 4 质检闭环（严过关）：首轮 FAIL 抓出 P0（coordinator `placeInline` 破坏 `placeBelow` 锚点 → NotFoundError）+ P1（cwd 未校验 realpathSync）；林深修复后复检 PASS。details 子座位 dispose 语义经源码证实「shadow 不 dispose，官方声明存活」，林深 D1「不重声明子座位」决策成立 |
| 2026-08-22 | 画布落位改拍板 **方案 C**：第三方宽拖来自 `dsh-better-sidebar` 面板宿主，不是官方 details。撤销 `ProjectDetailsPanel` shadow；画布 `registerTab`；新建会话保留 Files，项目会话关空 Files 种子后开画布 tab |
| 2026-08-22 | P0-13 项目会话默认对话:画布 = 3:7（相对对话列+右栏，不是整窗）。公开 API 无 setWidth，走画布 tab `store.reduce`；工厂 35% 会改成 70%，人手拖过不覆盖 |
| 2026-08-22 | P0-13 leftover crush：现网 811 被误判人手拖过。分母改视口−官方会话栏；对话列/usable <0.22 仍写 3:7。L2（1280/280）复验 300:700；空白会话无画布，切回项目会话画布回来。已 sync 未重启 |
| 2026-08-22 | 侧栏收起合并两个新建：展开仍并排；收起官方加号菜单（新建会话 / 新建项目）。折叠态 observer 绑 AppFrame `data-sidebar-collapsed`（不是 html）；关菜单路径卸 document 监听。单测 4/4；已 sync 未重启 |
| 2026-08-23 | **新建本地项目改拍板**：项目文件夹=作品包=dsh 工作区。默认库 `<videos>/OmniMux/Projects`。弹窗只收名称。顺序 mkdir→登记账本→新会话→画布 3:7。§0/§1/§3/§5 改冻；P0-02/P0-05 回「规格中」；加 P0-14。规格 `2026-08-23-omnimux-local-project.md` |
| 2026-08-23 | P0-14 编码（林深）：`omnimux-workflow` host library + 扫描 ProjectStore + GET `/api/projects/library` + 客户端 overlay 弹窗 + `runNewProject` 新序。P0-02/P0-05/P0-14 → 可验收（单测，未 sync） |
| 2026-08-23 | **排障**：现网创建后不跳会话——根因是客户端 `createDirectory` 在 native picker 下失败、弹窗吞错。改 Host mkdir + POST `{title}`；关一级页清 `data-dsh-product-stage`。冒烟前矩阵仍「可验收」 |
| 2026-08-23 | P0-13 排障：现网新建项目画布 ~1:1。不是官方 520。无 store.reduce 写盘当成功 + leftover 50% 误判拖过 + 折叠栏 overlap 死等。必须 live reduce 刷 CSS。质检 PASS（138）。窗口复测前不得标已对齐 |
| 2026-08-23 | P0-13 观测拍板 15:85：会话列太宽减半。`PROJECT_CANVAS_RATIO=0.85`；旧 70% 当磁铁避免刚写的 3:7 被当拖过。139 绿。已 sync **未重启** |
| 2026-08-23 | 侧栏/一级页展示名「项目库」→「项目」（仅文案；包名仍 `omnimux-workflow`）。`locales` `nav`/`projects.title` + 契约 occupants/矩阵已跟。已 `yarn omnimux:sync omnimux-workflow`，**未重启** |
