---
title: "OmniMux 全量插件 Agent 工具与双面交付清单契约"
id: "contract-plugin-agent-tools-inventory"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-30"
updated: "2026-09-04"
authors: ["qi-huolin", "xu-qingchu", "gao-jianyuan", "lin-shen", "yan-guoguan"]
subsystem: "global"
tags: ["agent-tools", "dual-surface", "inventory", "verification", "governance"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/docs-governance-standard.md"
  - "docs/contracts/hub.md"
  - "docs/contracts/project-assets-contract.md"
---

# OmniMux 全量插件 Agent 工具与双面交付清单契约

> **版本**：v1.0.0 | **权威级别**：L1（工程契约）  
> **适用范围**：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh` 下全部 12 个插件的 UI 交互与 Agent Tool 注册规范。  
> **持续治理**：由 `scripts/verify-plugin-agent-tools.mjs`（`pnpm verify:tools`）门禁执行 100% 静态扫描与一致性断言。

---

## 1. 治理原则与双面交付铁律

1. **双面交付铁律 (Dual-Delivery Invariant)**：
   在 OmniMux 插件生态中，任何业务功能必须同时具备：
   - **人类交互面 (UI Surface)**：Web Client UI (Stage / Overlay / Tab / Modal / Card)；
   - **智能体契约面 (Agent Tool Surface)**：Host 侧 `ctx.tools` 注册的标准工具 (JSON Schema 参数与 `{ ok, ... }` 封套)。
   两者必须共享相同的领域模型与服务层 (Unified Domain Service / Store)，严禁仅供人类操作而对 Agent 黑盒的单边功能。
2. **单一事实来源 (Single Source of Truth)**：
   HTTP 路由处理函数与 `ctx.tools.register` 的 `execute` 函数必须作为对等薄适配器，直接调用底层同一个 `Dispatcher` / `Store` 方法。
3. **破坏性操作二次确认守卫 (Destructive Action Guard)**：
   凡是涉及物理删除、级联清理、覆盖破坏的操作（如 `delete`, `remove`, `drop`, `disconnect`, `clear`），参数中必须强制包含 `confirm: { type: 'boolean', required: true }`，未显式传 `confirm: true` 必须直接拒绝并返回 `{ ok: false, error: 'confirmation-required', message: '...' }`。
4. **工具分级标准 (L1 / L2 / L3 / UI-Only)**：
   - **L1 (Mandatory Tool)**：核心业务数据流与 CRUD（创建、删除、修改、发布、执行）。必须 100% 暴露 Tool。
   - **L2 (Standard Tool)**：辅助查询、多维搜索、状态拉取、统计聚合、配置探查。必须暴露 Tool。
   - **L3 (Diagnostic Tool)**：高级探针、流媒体元数据查询、内部运行诊断。按需暴露 Tool。
   - **UI-Only (Exempted)**：纯前端视口平移缩放、弹窗开闭、光标聚焦、本地高亮。**严禁暴露 Tool**，防止上下文膨胀。

---

## 2. 全量 12 插件概览统计看板

| 统计指标 | 数值 | 说明 |
|---|---|---|
| **体检插件总数** | 12 个 | 覆盖 `plugins/` 下全部生产插件 |
| **已注册 Agent 工具总数** | 88 个 | 源码中实装并可在会话中调用的工具 (28+4+6+3+9+12+6+15+0+0+4+1)。Hub 规划 +2 `workbench_*`（`Planned`，见 [agent-workbench-sync.md](agent-workbench-sync.md)）落地后改此行。 |
| **双面齐备标杆插件 (A+)** | 3 个 | `omnimux-workflow` (12 tools), `omnimux-publish` (9 tools), `omnimux-market` (15 tools) |
| **需补齐写操作工具插件 (B)** | 4 个 | `omnimux-assets`, `omnimux-products`, `omnimux-inspiration`, `omnimux-accounts` |
| **纯后端/纯中枢/纯视图插件** | 5 个 | `omnimux` (中枢 28 tools), `omnimux-video` (4 tools), `omnimux-video-preview` (2 tools), `omnimux-analytics` (0 tools), `omnimux-clip` (6 tools) |

---

## 3. 全量插件功能与 Agent 工具全景矩阵

### 3.1 `omnimux`（执行中枢 Hub）
- **功能域**：中枢官方服务、品牌/设置、社媒路由、模型调用、官方 Seams。
- **状态**：双面就绪 (已实装 28 个核心官方工具 + 规划 2 个工作台视口工具)。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 查询社媒平台与平台对数据 | 中枢内部 API | `omnimux_social_data` | L1 | `Implemented` | 否 |
| 获取已授权账号列表 | 账号管理 / 中枢设置 | `omnimux_accounts_list` | L1 | `Implemented` | 否 |
| 获取账号授权连接 URL | 连接弹窗 | `omnimux_accounts_connect` | L2 | `Implemented` | 否 |
| 解除账号授权关联 | 解绑按钮 | `omnimux_accounts_disconnect` | L1 | `Implemented` | 是 (`confirm: true`) |
| 社媒发布媒体文件预签名 | 发布中心上传 | `omnimux_publish_presign` | L2 | `Implemented` | 否 |
| 向指定社媒平台创建发布任务 | 发布中心一键发布 | `omnimux_publish_create` | L1 | `Implemented` | 否 |
| 查询社媒发布任务状态与流水 | 发布中心状态卡片 | `omnimux_publish_get` | L1 | `Implemented` | 否 |
| 灵感社区列表多维查询 | 灵感社区一级页瀑布流 | `omnimux_inspiration_list` | L1 | `Implemented` | 否 |
| 获取单条灵感详情与 5D 拆解 | 灵感详情弹窗 | `omnimux_inspiration_get` | L1 | `Implemented` | 否 |
| 采集/新建灵感记录 | URL 抓取导入弹窗 | `omnimux_inspiration_create` | L1 | `Implemented` | 否 |
| 更新灵感元数据与标签 | 灵感详情编辑 | `omnimux_inspiration_update` | L1 | `Implemented` | 否 |
| 删除指定灵感记录 | 灵感卡片删除按钮 | `omnimux_inspiration_delete` | L1 | `Implemented` | 是 (`confirm: true`) |
| 上传灵感封面/媒体素材 | 灵感上传组件 | `omnimux_inspiration_upload_media` | L2 | `Implemented` | 否 |
| 查询灵感全量标签分类 | 灵感筛选栏 | `omnimux_inspiration_tags` | L2 | `Implemented` | 否 |
| 查询灵感社区服务与抓取状态 | 灵感社区状态指示 | `omnimux_inspiration_status` | L2 | `Implemented` | 否 |
| 提交视频生成任务 | 工作流视频生成节点 | `omnimux_video_submit` | L1 | `Implemented` | 否 |
| 提交图片生成任务 | 工作流生图节点 | `omnimux_image_submit` | L1 | `Implemented` | 否 |
| 提交音频生成任务 | 工作流生音频节点 | `omnimux_audio_submit` | L1 | `Implemented` | 否 |
| 查询社媒多维日频核心指标 | 分析看板概览 | `omnimux_analytics_daily_metrics` | L2 | `Implemented` | 否 |
| 分析账号最佳发帖时间热力图 | 最佳发帖时间卡片 | `omnimux_analytics_best_time` | L2 | `Implemented` | 否 |
| 分析发帖频次与效果关系 | 频次分析组件 | `omnimux_analytics_frequency` | L2 | `Implemented` | 否 |
| 分析内容生命周期与互动衰减 | 衰减曲线图表 | `omnimux_analytics_content_decay` | L2 | `Implemented` | 否 |
| 统计粉丝画像与增长漏斗 | 粉丝画像卡片 | `omnimux_analytics_follower_stats` | L2 | `Implemented` | 否 |
| 查询历史帖子表现明细表 | 帖子表现明细列表 | `omnimux_analytics_posts` | L2 | `Implemented` | 否 |
| 手动触发外部平台数据同步 | 手动同步按钮 | `omnimux_analytics_sync_external` | L2 | `Implemented` | 否 |
| 查询分析中心收件箱与系统通知 | 通知抽屉 | `omnimux_analytics_inbox` | L2 | `Implemented` | 否 |
| 抓取网页并解析 Markdown | 灵感/知识库采集 | `omnimux_page_fetch` | L2 | `Implemented` | 否 |
| 统一多模型文本与结构化生成 | 文本节点与大模型中继 | `omnimux_text_complete` | L2 | `Implemented` | 否 |
| 读取当前工作台视口（Tab / Chip / 选中） | 右侧 better-sidebar 快照 | `workbench_get_active_view` | L2 | `Planned` | 否 |
| 打开或切换 Occupant Tab（可撤销、防打扰） | 左栏 / Tab 条 / 对话内「打开」 | `workbench_open_tab` | L1 | `Planned` | 否（打扰性，走配额+撤销，非 confirm） |

---

### 3.2 `omnimux-assets`（创作资产库）
- **功能域**：角色、场景、风格包、道具、知识包、自定义 6 大类资产与产物管理。
- **存储**：`$DSH_HOME/omnimux/assets/data/files/<id>/`。
- **状态**：已实装查询与上传，已规划增改删 3 个写操作补齐。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 列出全部或按类目过滤资产 | 一级 Stage 资产网格 | `assets_list` | L1 | `Implemented` | 否 |
| 跨类目模糊搜索资产与标签 | 顶部搜索栏 | `assets_search` | L1 | `Implemented` | 否 |
| 获取单个资产详情与本地物理文件 | 资产详情抽屉 | `assets_get` | L1 | `Implemented` | 否 |
| 上传/导入物理文件到资产库 | 资产导入弹窗 | `assets_upload` | L2 | `Implemented` | 否 |
| 结构化创建新资产实体 | 新增资产模态框 | `assets_create` | L1 | `Implemented` | 否 |
| 更新资产元数据、标签与描述 | 资产编辑模态框 | `assets_update` | L1 | `Implemented` | 否 |
| 删除指定资产及其关联物料 | 资产卡片删除确认弹窗 | `assets_delete` | L1 | `Implemented` | 是 (`confirm: true`) |
| 资产网格视图切换 (Grid/List) | 顶部视图切换按钮 | — | UI-Only | `UI-Only` | 豁免 (前端纯排版状态) |

---

### 3.3 `omnimux-products`（产品库）
- **功能域**：要卖的货（商品名称、卖点、目标受众、品牌策略、主图引用）。
- **存储**：`$DSH_HOME/omnimux/products/library.json`。
- **状态**：已实装 6 个工具，需补齐 `products_delete`。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 列表查询全部产品 | 一级 Stage 商品列表 | `products_list` | L1 | `Implemented` | 否 |
| 条件搜索商品 | 顶部搜索过滤栏 | `products_search` | L1 | `Implemented` | 否 |
| 获取单项商品详情与策略参数 | 商品详情面板 | `products_get` | L1 | `Implemented` | 否 |
| 读取商品绑定的主图/媒体流 | 媒体预览抽屉 | `products_read_media` | L2 | `Implemented` | 否 |
| 创建新商品与带货策略 | 新增商品弹窗 | `products_create` | L1 | `Implemented` | 否 |
| 更新商品信息与营销卖点 | 编辑商品弹窗 | `products_update` | L1 | `Implemented` | 否 |
| 删除指定商品条目 | 商品卡片删除按钮 | `products_delete` | L1 | `Implemented` | 是 (`confirm: true`) |
| 商品多选状态维护 | 表格 Checkbox | — | UI-Only | `UI-Only` | 豁免 (前端纯交互状态) |

---

### 3.4 `omnimux-inspiration`（灵感社区）
- **功能域**：爆款短视频/图文采集、5D 结构化拆解、复刻至工作流。
- **存储**：`$DSH_HOME/omnimux/inspiration/local/`。
- **状态**：已实装 3 个工具，需补齐更新、删除与收藏操作。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 模糊搜索与标签过滤灵感 | 灵感社区一级页瀑布流 | `inspiration_search` | L1 | `Implemented` | 否 |
| 获取指定灵感 5D 结构化拆解详情 | 灵感详情模态框 | `inspiration_get` | L1 | `Implemented` | 否 |
| 从社媒 URL 抓取并入库新灵感 | 采集导入弹窗 | `inspiration_create` | L1 | `Implemented` | 否 |
| 更新灵感笔记、标签与结构化字段 | 灵感编辑面板 | `inspiration_update` | L1 | `Implemented` | 否 |
| 删除指定灵感条目及其本地缓存 | 灵感卡片删除操作 | `inspiration_delete` | L1 | `Implemented` | 是 (`confirm: true`) |
| 收藏/取消收藏灵感条目 | 卡片爱心图标点赞 | `inspiration_favorite` | L2 | `Implemented` | 否 |
| 瀑布流列宽与滚动锚定 | 界面自适应容器 | — | UI-Only | `UI-Only` | 豁免 (前端排版状态) |

---

### 3.5 `omnimux-publish`（矩阵发布中心）
- **功能域**：草稿管理、多账号矩阵分发、子任务追踪、失败重试、指标看板。
- **存储**：`$DSH_HOME/omnimux/publish/store.json`。
- **状态**：双面就绪 (已实装 9 大工具，100% 对齐 UI)。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 查询发布记录与草稿列表 | 发布中心表格与三大 Tab | `publish_list_records` | L1 | `Implemented` | 否 |
| 新建图文/视频发布草稿 | 新建草稿表单 | `publish_create_draft` | L1 | `Implemented` | 否 |
| 修改草稿标题、文案、媒体与话题 | 编辑草稿弹窗 | `publish_update_draft` | L1 | `Implemented` | 否 |
| 删除指定草稿 | 草稿行删除操作 | `publish_delete_draft` | L1 | `Implemented` | 是 (`confirm: true`) |
| 查询可用于发布的授权账号 | 账号选择器多选下拉 | `publish_list_accounts` | L1 | `Implemented` | 否 |
| 为草稿分配分发账号 | 矩阵账号分配勾选 | `publish_assign_accounts` | L2 | `Implemented` | 否 |
| 正式提交草稿执行多账号分发 | 立即发布 / 排期发布按钮 | `publish_submit` | L1 | `Implemented` | 否 |
| 获取单条发布记录与全账号子任务 | 发布任务详情抽屉 | `publish_get_record` | L1 | `Implemented` | 否 |
| 重试指定失败的账号分发子任务 | 单子任务重试按钮 | `publish_retry_task` | L2 | `Implemented` | 否 |
| 表格列宽拖拽与排序偏好 | 发布记录表头 | — | UI-Only | `UI-Only` | 豁免 (前端交互) |

---

### 3.6 `omnimux-workflow`（工作流无限画布）
- **功能域**：React Flow DAG 画布编排、物料节点 CRUD、连线规则校验、异步执行与 TableNode 数据表。
- **存储**：`$DSH_HOME/omnimux/workflow/` + Canvas JSON。
- **状态**：双面就绪 (已实装 12 大工具，标杆级画布 Agent 控制)。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 列出全部工作区与执行历史 | 一级 Stage 工作区选择器 | `workflow_list` | L1 | `Implemented` | 否 |
| 执行整个工作区或指定节点子图 | 顶部「运行」按钮 | `workflow_run` | L1 | `Implemented` | 否 |
| 获取工作区画布完整快照 (节点+边) | 画布加载与状态初始化 | `workflow_snapshot` | L1 | `Implemented` | 否 |
| 创建新工作区与画布 | 新建工作区按钮 | `workflow_create` | L1 | `Implemented` | 否 |
| 向画布添加物料/AI生成节点 | 左侧物料库拖拽入画布 | `workflow_node_add` | L1 | `Implemented` | 否 |
| 更新指定节点的参数与配置 | 节点右侧属性面板 | `workflow_node_update` | L1 | `Implemented` | 否 |
| 移除画布上的指定节点及其相连边 | 节点选中按 Delete 键 | `workflow_node_remove` | L1 | `Implemented` | 是 (`confirm: true`) |
| 在两节点端口之间建立连接边 | 鼠标拖拽连线 | `workflow_connect` | L1 | `Implemented` | 否 |
| 断开指定两节点之间的连线边 | 边右键删除 | `workflow_disconnect` | L1 | `Implemented` | 是 (`confirm: true`) |
| 暂停、恢复或取消正在运行的流程 | 控制台暂停/中止按钮 | `workflow_execution_control` | L2 | `Implemented` | 否 |
| 写入 TableNode 数据表格单元格 | 表格节点全屏编辑器 | `canvas_write_table_node` | L2 | `Implemented` | 否 |
| 读取 TableNode 数据表格内容 | 表格节点渲染面板 | `canvas_get_table_node` | L2 | `Implemented` | 否 |
| 画布鼠标平移 (Pan) 与缩放 (Zoom) | 视口控制器 | — | UI-Only | `UI-Only` | 豁免 (前端物理坐标) |
| 多选节点框选框 (Selection Box) | 鼠标拉框选择 | — | UI-Only | `UI-Only` | 豁免 (瞬态交互) |

---

### 3.7 `omnimux-clip`（OpenReel 视频剪辑工坊）
- **功能域**：官方全套 OpenReel 微应用，多轨时间轴、视口、资源库、转场特效、音频降噪、导出。
- **存储**：`$DSH_HOME/omnimux/clip/projects/`。
- **状态**：双面就绪 (已实装 6 个工具)。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 获取指定剪辑项目时间轴与轨道配置 | 侧栏 Tab 打开工程 | `clip_get` | L1 | `Implemented` | 否 |
| 执行轨道级编辑操作 (增删片段/微调) | 时间轴拖拽、剪切、特效挂载 | `clip_edit` | L1 | `Implemented` | 否 |
| 获取当前视口渲染数据与布局 | 视口渲染器 | `clip_view` | L1 | `Implemented` | 否 |
| 获取指定时间戳的帧快照图片 | 视口截图 | `clip_snapshot` | L2 | `Implemented` | 否 |
| 诊断剪辑工程轨道与物料完整性 | 导出前自动检查 | `clip_diagnostics` | L2 | `Implemented` | 否 |
| 触发后台视频合成与导出任务 | 顶部「导出」按钮 | `clip_export` | L1 | `Implemented` | 否 |
| 播放指针拖拽 (Scrubbing) 与实时预览 | 播放控制器 | — | UI-Only | `UI-Only` | 豁免 (60fps 实时渲染) |

---

### 3.8 `omnimux-market`（插件·技能·专家·连接器广场）
- **功能域**：技能市场、DSH 插件库、Plaza 专家召唤、MCP 连接器管理。
- **状态**：双面就绪 (已实装 15 个多域工具，内置专家优先守卫)。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 搜索 SkillHub 技能库 | 市场一级页技能 Tab | `skillhub_search` | L1 | `Implemented` | 否 |
| 安装指定 Skill 到本地环境 | 卡片一键安装按钮 | `skillhub_install` | L1 | `Implemented` | 否 |
| 列出已安装在本地的技能清单 | 已安装 Tab | `skillhub_list` | L1 | `Implemented` | 否 |
| 卸载已安装的本地技能 | 技能卡片卸载按钮 | `skillhub_uninstall` | L1 | `Implemented` | 是 (`confirm: true`) |
| 搜索 Plaza 本地专家与专家团队 | 专家馆搜索栏 | `plaza_search` | L1 | `Implemented` | 否 |
| 召唤并持久化专家到当前会话 | 专家卡片召唤按钮 | `plaza_summon` | L1 | `Implemented` | 否 |
| 静默安装 Plaza 专家/技能包 | 市场内部安装 | `plaza_install` | L2 | `Implemented` | 否 |
| 搜索 DSH 插件市场 | 插件市场 Tab | `plugin_search` | L1 | `Implemented` | 否 |
| 安装指定 DSH 官方/社区插件 | 插件卡片安装按钮 | `plugin_install` | L1 | `Implemented` | 否 |
| 卸载已安装的 DSH 插件 | 插件卡片卸载按钮 | `plugin_uninstall` | L1 | `Implemented` | 是 (`confirm: true`) |
| 列出当前 Profile 已装插件列表 | 插件管理面板 | `plugin_list` | L1 | `Implemented` | 否 |
| 搜索 MCP 连接器市场 | 连接器 Tab | `connector_search` | L1 | `Implemented` | 否 |
| 安装已打包 MCP 连接器 | 连接器卡片安装按钮 | `connector_install` | L1 | `Implemented` | 否 |
| 卸载已安装的 MCP 连接器 | 连接器卡片卸载按钮 | `connector_uninstall` | L1 | `Implemented` | 是 (`confirm: true`) |
| 列出当前已配置的 MCP 连接器 | 连接器管理面板 | `connector_list` | L1 | `Implemented` | 否 |
| 市场分类 Tab 切换 | 顶部 Tablist | — | UI-Only | `UI-Only` | 豁免 (前端导航状态) |

---

### 3.9 `omnimux-accounts`（社交账号管理）
- **功能域**：多平台社交账号网格/表格、授权绑定、解绑、Agent 调用权限开关。
- **状态**：UI 完备，底层通过中枢 `omnimux_accounts_*` 执行，建议将垂直账号工具标准化。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 查询账号列表与授权状态 | 账号一级页卡片与表格 | `accounts_list` | L1 | `Implemented` | 否 |
| 修改账号分组或 Agent 权限开关 | 账号卡片 Switch 与分组设置 | `accounts_update_group` | L2 | `Implemented` | 否 |
| 账号卡片排序与筛选偏好 | 筛选栏选择器 | — | UI-Only | `UI-Only` | 豁免 (前端本地排序) |

---

### 3.10 `omnimux-analytics`（数据分析中心）
- **功能域**：账号多维数据看板、粉丝增长趋势、内容衰减曲线、周报月报生成。
- **状态**：数据管道监听完备，底层通过中枢 `omnimux_analytics_*` 8 大工具提供支持。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 查询指定账号或全局核心指标 | 概览卡片与趋势图表 | `analytics_query_metrics` | L2 | `Implemented` | 否 |
| 生成结构化数据分析周报/月报 | 一键生成总结报告按钮 | `analytics_get_summary` | L2 | `Implemented` | 否 |
| 图表 Hover Tooltip 渲染 | ECharts 鼠标悬停交互 | — | UI-Only | `UI-Only` | 豁免 (DOM 临时渲染) |

---

### 3.11 `omnimux-video`（视频计算引擎）
- **功能域**：Headless 纯后端视频解析、深度图预估、AI 逆向提示词拆解。
- **状态**：双面就绪 (已实装 4 个计算工具)。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 执行 FFmpeg 基础转码与视频切片 | 内部处理引擎 | `video_process` | L1 | `Implemented` | 否 |
| 提取视频关键帧并生成深度图序列 | 深度预估管线 | `video_depth` | L2 | `Implemented` | 否 |
| 分析视频场景、镜头运镜与色彩 | AI 视频分析服务 | `video_analyze` | L2 | `Implemented` | 否 |
| 逆向拆解视频生成结构化提示词 | 提示词工程管线 | `video_reverse_prompt` | L2 | `Implemented` | 否 |

---

### 3.12 `omnimux-video-preview`（视频流媒体预览）
- **功能域**：基于 HTTP 206 Range 的轻量本地视频流播放器，支持全功能视频分镜与结构拆解及侧边栏高保真预览。
- **状态**：已实装 2 个工具。

| 业务功能描述 | 对应 UI 交互 / HTTP 路由 | Agent 工具名称 (`Tool Name`) | 分级 | 状态 | 破坏性 confirm |
|---|---|---|---|---|---|
| 查询本地视频流元数据与播放 URL | 播放器组件加载 | `video_preview_info` | L3 | `Implemented` | 否 |
| 分析视频分镜与结构拆解并自动打开侧边栏预览 | 视频分析侧边栏预览 | `video_breakdown_analyze` | L2 | `Implemented` | 否 |
| 播放器全屏与音量拖拽控制 | 播放器控件条 | — | UI-Only | `UI-Only` | 豁免 (前端媒体交互) |

---

## 4. 长效治理 SOP：新功能注册与全链路开发规范

当开发团队需要为任何插件开发新功能时，必须遵循以下 **SOP 5 步闭环**，实现「方案自制定、代码双面写、工具自动查」：

```text
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ 1. 需求与契约   │ ──> │ 2. 领域服务层实现 │ ──> │ 3. 双面接口挂载   │ ──> │ 4. 清单文件登记   │ ──> │ 5. CI 门禁验证   │
│ PRD 填双面契约  │     │ Domain Dispatcher│     │ UI HTTP + Tool   │     │ inventory.md 注册│     │ pnpm verify:tools│
└─────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘     └─────────────────┘
```

1. **Step 1：PRD 阶段必须定义 Tool 契约**：
   在需求评审阶段，开发者必须在 PRD 中明确该功能的 Tool 命名、参数 Schema、返回值及错误枚举。
2. **Step 2：优先实现纯粹的领域服务层 (Domain Service)**：
   在 `src/` 中创建或扩展单例 Store / Dispatcher，将业务规则、状态流转、数据落盘完全封装，不依赖 Web 框架。
3. **Step 3：双面接口同时挂载**：
   - HTTP 侧：在 `http-routes.js` 中添加路由，调用 Domain Service；
   - Tool 侧：在 `tools.js` 或 `index.js` 中使用 `ctx.tools.register` 挂载工具，直接调用同一 Domain Service 方法。
4. **Step 4：在契约清单中登记 (inventory.md)**：
   在本文档中录入新工具条目，标记为 `Implemented`。
5. **Step 5：运行自动化门禁测试**：
   本地运行 `pnpm verify:tools`，确保 4 维检查全部通过（0 错误 0 告警）方可提交 PR。

---
*本文档为 OmniMux 插件双面交付权威契约（L1），由 CI 门禁脚本持续强制校验。*
