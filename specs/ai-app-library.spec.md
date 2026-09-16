# 项目页「AI应用」分类与已发布应用管理（Issue #1964）

- 任务工作树：`.worktrees/omnimux-workflow-ai-app-library-issue-1964`（分支 `agent/omnimux-workflow-ai-app-library-issue-1964`）
- 基线：`origin/main@bdf51d431`
- 类型：Feature（`omnimux-workflow` 插件客户端 + 发布链路）
- 授权范围：Issue #1964 正文 In scope 四条；不改 `plugins/omnimux-apps` 运行时，不新建服务端注册表，不做版本管理/上下架审批。

## 1. 用户问题

创作画布中把工作流打组发布出的 AI 应用，发布成功后没有任何可管理入口：用户找不到它、删不掉、也回不到源工作流组继续修改。发布成功提示一闪之后，应用即「消失」。

## 2. 目标

「项目」页顶层筛选栏在「共创项目（即将上线）」右侧新增第三个分类「AI应用」，以卡片列出已发布应用；卡片可打开、可删除、可编辑（回到源工作流组）。

## 3. 关键用户旅程（精确交互步骤 + 期望结果）

### J1 发布后自动出现在「AI应用」分类

1. 在创作画布中选中一个工作流组，点组工具条的「发布应用」；
2. 发布向导完成三步后点确认；
3. 期望：
   - `localStorage['omnimux_apps_manifests'][appId]` 写入的 manifest 中，`workflowBinding.projectId` 为该画布所属项目 id，`workflowBinding.sourceGroupId` 为本次发布的工作流组 id；
   - 打开「项目」页 → 点「AI应用」分类 → 出现一张卡片，卡片标题 = 应用名，卡片副标题 = 应用分类（视频/图片/音频），卡片封面 = manifest 的 `metadata.coverUrl`（无封面时用组件库占位）；
   - 卡片按 `createdAt` 倒序排列（最新发布在最前）。

### J2 卡片点击 → 打开应用标签页

1. 在「AI应用」分类下点击一张卡片；
2. 期望：右侧栏新增/聚焦一个 `type = 'omnimux-workflow:app'`、`id = 'app_<appId>'` 的标签页，标签标题为应用名；该标签页渲染该应用的表单界面（`AppTab` 通过 `tab.id` 反解 appId，再从 `localStorage` 读取 manifest）；
3. 期望：点击卡片不会误触发「更多」菜单，反之点「更多」按钮不会打开应用标签页。

### J3 卡片「更多」→ 删除（二次确认）

1. 悬停卡片，点右上角「更多」按钮（三点图标，`aria-haspopup="menu"`）；
2. 期望：展开菜单，含且仅含两项：「编辑」「删除」（删除项为危险态）；打开后焦点落在第一项；`Esc` 关闭并把焦点还给触发按钮；`ArrowUp/Down/Home/End` 在两项间移动；点击外部关闭；
3. 点「删除」→ 出现二次确认弹窗，标题/文案包含应用名，确认按钮为危险态；
4. 确认后期望：该应用记录从 `localStorage['omnimux_apps_manifests']` 移除；列表刷新后卡片消失；对应的应用标签页（`id = 'app_<appId>'`）被关闭；
5. 取消期望：卡片保留，记录不变；
6. 失败期望（存储写入失败 / 记录不存在）：卡片保留，界面给出可理解的错误提示，**不伪造成功**（不显示成功提示、不提前移除卡片）。

### J4 卡片「更多」→ 编辑（回到源工作流组）

1. 点「更多」→「编辑」；
2. 期望：打开该应用所属项目的创作画布（右侧栏画布标签页），并把视口中心定位到发布时的工作流组，同时该组处于选中态（组工具条可见）；
3. 期望：画布标签页是 `single: true`，若它已经打开，本次必须把新的定位目标写入该标签页的 `meta`（走 `updateTab`），不能因为「标签页已存在」而丢失定位；
4. 期望：定位到组中心（用组节点的宽高取中心），不是组左上角偏移 100px；
5. 失败期望（应用记录缺少项目/组归属，或画布中已无该组）：仍打开所属项目画布，并给出可理解的提示；不伪造「已定位」。
6. 兼容期望：本次改动之前发布的旧应用记录没有 `projectId`/`sourceGroupId`；「编辑」按 `workflowBinding.workspaceId` 反查所属项目；无组归属时按第 5 条处理。

## 4. 数据与契约

| 项 | 决定 |
| --- | --- |
| 应用清单数据源 | `localStorage['omnimux_apps_manifests']`（`Record<appId, ApplicationManifest>`）——沿用唯一真实落点 |
| 应用标签页 id | `app_<appId>`（现有 `openAppTab` 约定，`extra` 被宿主丢弃，不作为通道） |
| 画布定位通道 | better-sidebar 标签页 `meta.focusGroupId`（`openTab({meta})` 首次创建 / `updateTab(id, {meta})` 已存在时覆盖） |
| manifest 新增字段 | `workflowBinding.projectId?: string`、`workflowBinding.sourceGroupId?: string`（可选，向后兼容旧记录） |
| 分类 tab id | `apps`，位置在 `featured` 之后 |

## 5. 验收标准

### 5.1 数据源与纯逻辑（单元测试）

- **AC-1** `listPublishedApps` 读 `omnimux_apps_manifests`，返回条目按 `createdAt` 倒序；非法 JSON / 非对象 / 空串返回空数组，不抛异常。
- **AC-2** 条目映射：`appId` / `name`（`metadata.name`）/ `category` / `description` / `coverUrl` / `createdAt` / `workspaceId` / `projectId` / `groupId` 字段齐全；缺字段时给出安全缺省而不是 `undefined` 崩溃。
- **AC-3** `removePublishedApp(appId)` 只移除目标键，其他条目原样保留；目标不存在时返回失败结果；存储写失败（`setItem` 抛错）时返回失败结果且**不报告成功**。
- **AC-4** `resolveOwningProject(projects, entry)`：优先按 `entry.projectId` 命中；否则按 `entry.workspaceId` 命中 `canvasWorkspaceIds` 或 `pages[].canvasWorkspaceId`；都不命中返回 `null`。
- **AC-5** `planFocusCanvasNode`：目标节点带有效 `width`/`height` 时定位到 `position + size/2`；无尺寸时保持原 `position + 100` 行为（既有测试不得回归）。

### 5.2 发布链路（源码契约 + 行为）

- **AC-6** `CanvasEditor` 渲染 `PublishWizardModal` 时传入 `groupId={targetGroupForPublish?.id}`；向导把 `groupId` 写入 `workflowBinding.sourceGroupId`。
- **AC-7** 向导发布时把所属项目 id 写入 `workflowBinding.projectId`；解析失败（接口不可用）时为 `undefined`，不阻断发布。
- **AC-8** 既有发布收敛契约（空组拦截、向导只吃 `targetGroupForPublish.nodes/edges`）保持不变。

### 5.3 项目页分类与卡片（源码契约 + 行为）

- **AC-9** 「项目」页 `Tabs` items 为三项，顺序 `local` → `featured`（保持 `disabled: true`）→ `apps`；`apps` 标签文案 zh = `AI应用`、en = `AI Apps`；新增 `projects.*` 键在 zh/en 字典中成对存在。
- **AC-10** 切换 `libraryTab` 到 `apps` 会驱动应用列表加载（`libraryTab` 不再是死状态）；监听 `omnimux-app-tabs-changed` 事件刷新列表。
- **AC-11** 「AI应用」分类下：无应用时渲染空态（标题 + 说明文案），有应用时渲染卡片网格；卡片使用组件库 `MediaCard`，网格复用既有 `.omnimux-workflow-grid` 容器类。
- **AC-12** 卡片「更多」菜单使用 primitives `Menu`（`portal`），两项为「编辑」「删除」，删除项 `danger: true`；「更多」按钮为 `IconButton` + `aria-haspopup="menu"` + `aria-expanded`。
- **AC-13** 搜索框在「AI应用」分类下按应用名过滤；在「本地项目」分类下行为不变（只过滤项目）。

### 5.4 画布定位（行为）

- **AC-14** `activateProjectCanvas(ctx, { focusGroupId })`：打开画布标签页后调用 `service.updateTab(CANVAS_TAB_ID, { meta: { focusGroupId } })`；未传 `focusGroupId` 时不得调用 `updateTab`（既有测试不得回归）。
- **AC-15** `CanvasTab` 从 `props.tab.meta.focusGroupId` 读出目标组并作为纯数据 prop 传给 `CanvasBridge`。
- **AC-16** 画布岛在 `nodes` 中出现目标组 id 时执行一次聚焦（`applyFocusCanvasNode`），同一 `focusGroupId` 不重复聚焦；目标不存在时不聚焦。

### 5.5 视觉与门禁

- **AC-17** 不新增自造风格：卡片、菜单、确认弹窗、空态全部使用既有组件库/既有类名；不新增裸色值、不使用内联样式表达颜色、不使用 Emoji 充当图标；控件几何沿用 `design.md`（32px 基准、8px 圆角）。
- **AC-18** `pnpm verify:stages`、`pnpm test:ui` 对本次改动文件保持通过。

## 6. 非目标

- 不接入 `plugins/omnimux-apps` 运行时（无 `cordis.patch.yml`、无 `dsh` 字段、全仓零 import 的死代码）。
- 不新建服务端应用注册表，不改 `/omnimux/apps/*` 路由。
- 不改造应用工作台的表单/历史/示例视图。
- 不做应用版本管理、重命名、上下架审批。
- 不新增浏览器端到端测试（真实浏览器验收由后续 QA 阶段承担）。

## 7. 修订（第二轮：应用标签页打开/切换/关闭的真实宿主机制）

第一轮验证发现 §3 J2 的「`id = app_<appId>` 是唯一通道」与 J3 的「确认后关掉 `app_<appId>` 标签页」与真实宿主不符。在隔离实例上实测 + 读宿主源码（`dsh-better-sidebar@0.19.1` 的 `src/client/native/{surface,tab-adapter}.tsx`）得到确定机制：

| 事实 | 证据 |
| --- | --- |
| 宿主启用「原生 surface」时，`openTab` **不再使用** `seed.id`、也不转发 `seed.extra`；只有 `seed.title` / `seed.meta` 会进原生标签页记录 | `service.ts` openTab：`surface.openTab({kind: seed.type, params: {title, meta}})`；`tab-adapter.tsx` `ensure()` 只读 `params` |
| 原生标签页 id 由宿主生成（实测 `tab6`），不是 `app_<appId>` | 页面内探针组件读 `props.tab.id` |
| 同一个 `kind` 在原生 surface 上**只保留一个标签页**，重复 open 是「聚焦已存在」；`createTab` 只影响 `revealIfOpened`，不会产出第二个同 kind 标签页 | 页面内注册两个探针 kind 各 open 两次，侧栏始终各一个 chip |
| 聚焦已存在的同 kind 标签页时，`params`（title/meta）会随本次 open 更新（记录在标签页卸载时被丢弃，重新挂载时按新 params 重建） | 探针实测 `title: EchoA → EchoB`、`meta.appId: A → B`，id 恒为 `tab6` |
| 关闭必须给**宿主生成的标签页 id**：`surface.close(tabId)` 先查插件侧记录表 `records.get(tabId)`，查不到就整体放弃（不再回落到插件自有布局） | `native/surface.ts` close → `records.get(tabId)`；`service.ts` closeTab 先行 native 分支 |

### 7.1 修订后的验收标准（覆盖 §5 中冲突项）

- **AC-19**（改 J2）点任意卡片后，应用标签页**聚焦并展示被点应用**：内容标题 = 被点应用名，且不同应用交替点击时每次都切换到最近点击的那个应用；`meta.appId` 是穿过宿主的应用身份通道，`extra`/`id` 不再作为通道依赖。
- **AC-20** 标签页 chip 标题稳定显示应用名，不停留在通用兜底名「AI 应用」：标签页组件挂载后按宿主文档化的 `updateTab` 自改名（该路径会通知 chip 重渲）。
- **AC-21**（改 J3-4）删除确认后，**该应用对应的标签页被关闭**：按标签页组件登记回来的宿主标签页 id 调 `service.closeTab(tabId)`；宿主未提供该通道（旧布局）时回落到 `app_<appId>` 约定，不伪造成功。
- **AC-22** 同一应用重复点击不堆叠标签页：宿主同 kind 单标签页 + 我们不做重复登记，重复点击只聚焦/刷新同一标签页。
- **AC-13/AC-12/AC-17 等既有条目不变**；卡片「更多」菜单、删除二次确认、空态/错误态、编辑定位均不得回归。

### 7.2 单一应用标签页行为与边界说明

- **多应用单标签页切换展示**：当前应用标签页 descriptor 未配置独立的 `createTab` 实例生成器，宿主原生 surface 默认按单一应用标签页管理；点击不同应用卡片会切入并刷新该标签页的内容与标题，删除后正常关闭。本轮达到的状态是：单个应用标签页始终展示「最近点击的那个应用」，标题与内容均正确响应，删除后能关掉。未来如需每应用独立并行标签页，可在 descriptor 层按需配置 `createTab`。

## 8. 失败与回滚

- 应用清单读取失败 → 显示真实空态/错误，不伪造成功。
- 删除失败 → 保留卡片并报错。
- 定位失败 → 回退为仅打开所属项目画布并给出可理解提示。
- 回滚：本次改动为增量（新增可选字段 + 新增分类分支），旧记录不携带新字段时按 5.3/5.4 的兼容路径工作；回退本次提交即可恢复原状，不涉及数据迁移。
