---
title: "多模态创意内容生产 Agent 架构全链路工程实施计划"
id: "spec-multimodal-agent-implementation-plan"
type: "spec"
status: "living"
authority: "L1"
date: "2026-09-09"
updated: "2026-09-09"
authors: ["engineering-group"]
subsystem: "global"
tags: ["implementation-plan", "multimodal-agent", "roadmap", "milestones", "workflow"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/multimodal-creative-agent-architecture.md"
  - "docs/contracts/plugin-agent-tools-inventory.md"
---

# 多模态创意内容生产 Agent 架构全链路工程实施计划

> **前置依赖**：[`docs/contracts/multimodal-creative-agent-architecture.md`](../contracts/multimodal-creative-agent-architecture.md)（顶层架构契约与方法论研究报告）  
> **实施周期**：共 8 周（分为 P0 ~ P3 四大工程阶段）  
> **核心宗旨**：通过标准化脚手架、微内核解耦、模板化 DAG 画布与指令编译器，打造端到端、工业级、可跨平台平滑扩展的多模态创意生产中枢。

---

## 1. 实施全景甘特图与里程碑矩阵

```text
2026 演进甘特图
Weeks        W1      W2      W3      W4      W5      W6      W7      W8
P0 架构解耦  [======]
P1 画布引擎          [======]
P2 摄取直通                  [======]
P3 编译闭环                          [======]
```

### 1.1 里程碑定义（Milestones）

| 里程碑 | 阶段定位 | 达成标准与业务体验 | 退出门禁检查 |
| :--- | :--- | :--- | :--- |
| **M0**<br>(第 2 周末) | 知识与契约完全解耦 | 主 Agent Persona 压缩至 ≤80 行；核心行为契约与首批微型卡片独立落盘并实现动态挂载。 | `scripts/verify-agent-presets.test.mjs` 全通；静态扫描 0 错误。 |
| **M1**<br>(第 4 周末) | 画布模板化与自动成组 | `workflow_create` 支持一键实例化「短视频复刻」与「图文轮播」模板；批量生成物自动网格成组。 | 模板实例化耗时 ≤50ms；Group 容器布局单测通过。 |
| **M2**<br>(第 6 周末) | 多模态事实直通无盲区 | 拖入视频后 5 秒内自动生成包含关键帧与台词的拆解表；文案专家强制消费拆解表改写分镜。 | 杜绝任何跳过视频分析的直接生成调用；数据表落盘 100% 对齐。 |
| **M3**<br>(第 8 周末) | 全自动编译出片全闭环 | 分镜表自动编译为底层物理模型最佳 Prompt；门禁确认后一键并发生成、自动剪辑合成并沉淀发布草稿。 | 端到端单测全绿；成片 100% 具备有效物理路径与画布 `node_id`。 |

---

## 2. 阶段 P0：架构契约抽象与知识解耦（第 1 ~ 2 周）

### 2.1 任务工单细则（Work Breakdown Structure）

#### 【工单 P0-1】建立系统级常驻行为契约库
- **责任模块**：`contracts/`
- **新增文件**：
  - `contracts/content-discipline.md`：定义全域社媒的画幅标准（9:16 / 1:1 / 16:9）、安全区（Safe Zone）边距避让规则、推荐时长区间与合规底线（≤100 行）；
  - `contracts/canvas-discipline.md`：定义画布物理节点唯一性、文件原子挂载规则、禁止重复建点、文本/表格节点局部 Patch 编辑规则（≤100 行）；
  - `contracts/semantic-judgment.md`：定义参考素材的 5 维输入角色（`source/edit`、`layout`、`style`、`character`、`mood`）及五大决策矩阵（`take`、`adapt`、`ignore`、`block`、`ask`）（≤100 行）。
- **验收标准**：通过 `pnpm doc:lint` 检查，无死链，单文件严格 ≤100 行。

#### 【工单 P0-2】建立微型专业知识卡片库（Micro Cards）
- **责任模块**：`knowledge/`
- **新增文件**：
  - `knowledge/platforms/tiktok-playbook.md`：短视频 3s 黄金 Hook 4 种类型、完播率镜头切换节拍、图文轮播翻页心理学（≤50 行）；
  - `knowledge/platforms/instagram-playbook.md`：Reels 视听风格与 Carousel 收藏率深度设计（≤50 行）；
  - `knowledge/vendors/model-h3.md`：H3 模型的 2K 竖屏景别跨度法则、视角 30°~90° 防抽搐规则、Slot 绑定语法（≤50 行）；
  - `knowledge/vendors/model-kling.md`：多模态运镜参数与动作幅度规范（≤50 行）；
  - `knowledge/failures/`：高频避坑测试卡（手部畸变抑制、同主体同景别连跳规避等，每个 ≤25 行）。
- **验收标准**：格式规范，严格符合短卡微知识标准，内容提炼为“决策测试（Decision Test）”。

#### 【工单 P0-3】预设构建引擎改造与主理人微内核瘦身
- **责任模块**：`scripts/build-agent-presets.mjs`、`presets/`
- **改造内容**：
  - 将 `presets/tiktok-agent/agent.cordis.yml` 与 `presets/content-creation-team/agent.cordis.yml` 的 Persona 瘦身为 ≤80 行纯净微内核（仅声明角色身份定位、极简双轨分流判断与安全底线）；
  - 改造构建脚本，使其支持声明 Contract 依赖并按目标自动注入；
  - 环境变量注入 `KNOWLEDGE_BASE_DIR`，使 Agent 在运行时可定位卡片路径。
- **验收标准**：运行 `node --test scripts/verify-agent-presets.test.mjs` 100% 通过且保持幂等。

---

## 3. 阶段 P1：画布标准模板引擎与自动栅格分组（第 3 ~ 4 周）

### 3.1 任务工单细则

#### 【工单 P1-1】预置工业级 DAG 工作流模板
- **责任模块**：`plugins/omnimux-workflow/src/projects/templates/`
- **新增文件**：
  - `template-short-video-replication.json`：
    ```text
    [原片素材节点 (video:import)] ➔ [爆款5D拆解表 (table)] ➔ [分镜脚本表 (table)]
                                                                  │
                    ┌─────────────────────────────────────────────┴──────────────────┐
                    ▼                                                                ▼
      [分镜生图节点 (image:t2i)] ➔ [分镜生视节点 (video:v2v)]                 [配音节点 (audio:t2a)]
                    │                                                                │
                    └─────────────────────────────┬──────────────────────────────────┘
                                                  ▼
                                       [剪辑成片节点 (video:clip)]
    ```
  - `template-carousel-creation.json`：
    ```text
    [灵感/主题节点 (text:import)] ➔ [轮播大纲与排版表 (table)] ➔ [6~8张轮播卡片组 (group)] ➔ [发布草稿卡片 (text)]
    ```
- **验收标准**：模板 JSON 结构通过 Zod 校验，节点语义端口对齐无死锁。

#### 【工单 P1-2】扩展 `workflow_create` 模板实例化 API
- **责任模块**：`plugins/omnimux-workflow/src/workflow/agent/agentWriteTools.ts`
- **接口扩展**：
  - 修改 `createWorkflowCreateTool`：
    ```ts
    parameters: objectParams({
      name: { type: 'string', description: '工作区名称' },
      template_id: { type: 'string', enum: ['short-video-replication', 'carousel-creation'], description: '可选内置DAG模板ID' },
    })
    ```
  - 当传入 `template_id` 时，原子创建工作区并批量初始化节点与连线；
  - 返回值透传预置关键节点 ID 字典（如 `{ videoInputNodeId, deconstructTableId, scriptTableId }`）。
- **验收标准**：单测覆盖无模板创建与带模板创建两种场景。

#### 【工单 P1-3】实现批量产物自动网格成组 (Auto-Grouping)
- **责任模块**：`plugins/omnimux-workflow/src/workflow/agent/groupTools.ts`
- **功能实现**：
  - 实装 `hub_canvas_group_recent_outputs({ label, workspaceId })`；
  - 自动扫描当前轮次生成的媒体节点，计算二维栅格布局坐标（网格间距 24px），将其包裹在 Group 容器节点内，更新节点父子层级关系；
  - 前端画布同步渲染规整的分组边框与标签。
- **验收标准**：批量生成 4~8 个节点时，100% 自动成组排列，画布视口自动适应聚焦。

---

## 4. 阶段 P2：多模态事实输入与拆解表直通（第 5 ~ 6 周）

### 4.1 任务工单细则

#### 【工单 P2-1】多模态输入角色标准化拦截 (Ingestion Gate)
- **责任模块**：`presets/` 主代理提示词与执行策略
- **逻辑规则**：
  - 用户传入附件时，强制执行角色分类（`source/edit` 节奏源、`product` 商品实体、`character` 人物脸模）；
  - 若输入为视频且任务为复刻，**硬阻断直接文本生成与直接视频生成**，必须优先进入分析拆解流水线。

#### 【工单 P2-2】`video_analyze` 与 `HTableDocument` 自动映射直通
- **责任模块**：`plugins/omnimux-workflow/src/workflow/videoDeconstruct.ts`
- **技术打通**：
  - 视频素材入库后，调用 `video_analyze` 提取：
    - 逐镜头关键帧（抽出图片保存至工程 media 目录）；
    - 镜头起止时间戳（精确到 0.1 秒）；
    - 0~3s Hook 分类识别；
    - 原片口播语音 ASR 转写文本；
  - 自动将上述数据组装为标准 `HTableDocument`（列定义：序号、时间区间、关键帧预览、画面拆解、口播台词）；
  - 自动调用 `canvas_write_table_node` 落盘为 `.htable` 文件并在画布展现。
- **验收标准**：带货短视频样本输入后，能在 5 秒内稳定生成标准拆解表格。

#### 【工单 P2-3】文案专家强制基于数据表 `adapt` 改写
- **责任模块**：`presets/fragments/content-experts.cordis.yml`
- **专业规范**：
  - `expert_content_copywriter`（可可）接收解构表格内容，消费商品真实卖点（`products_get`）；
  - 严格保持原片镜头时间戳与叙事框架（`take`），仅替换具体卖点演示与台词（`adapt`）；
  - 产出下游「TikTok 逐镜头脚本表」，写回画布对应表格节点；
  - 在画布上呈现脚本节点并挂起，向用户发送阶段确认通知。
- **验收标准**：改写后的分镜表与原片结构对齐度 ≥ 90%，商品卖点替换准确率 100%。

---

## 5. 阶段 P3：模型指令编译器与阶段门禁全闭环（第 7 ~ 8 周）

### 5.1 任务工单细则

#### 【工单 P3-1】研发模型指令编译器 (Model Prompt Compiler)
- **责任模块**：`plugins/omnimux/src/media/compiler/`
- **中间件架构**：
  ```text
  业务分镜数据表 ➔ [模型编译器] ➔ 物理执行级 Prompt + Slots
                         │
        读取 knowledge/vendors/model-xxx.md
  ```
- **核心算子实现**：
  - **景别跨越算子**：检查相邻镜头景别，自动跨级插入（如全景 ➔ 近景），视角变化强制约束在 30°~90°；
  - **微叙事四段式算子**：将分镜动作描述规整为 `初始 ➔ 刺激 ➔ 反应 ➔ 收束`；
  - **多参考 Slot 映射器**：自动将上游图片/视频节点绑定为 `@图片1`、`@图片2` 并校验尺寸；
  - **安全区注入算子**：注入针对目标平台的居中偏上安全区指令。
- **验收标准**：编译输出的 Prompt 语法 100% 契合底层模型规则，零参数丢失与格式冲突。

#### 【工单 P3-2】画布阶段门禁与批量并发执行调度
- **责任模块**：`plugins/omnimux-workflow/src/workflow/execution/`
- **调度机制**：
  - 分镜脚本表生成后，状态机置为 `waiting_user(plan_review)`，暂停后续消耗性操作；
  - 用户在界面点击「确认出片」后，状态机迁移至 `doing`；
  - 自动读取分镜表的行数，并发创建对应数量的生成节点，连线后触发 `workflow_run`；
  - 接入滑动窗口并发控制（默认并发限制为 10，超出自动排队，单节点失败不中断全局）。
- **验收标准**：门禁拦截有效，确认后并发生成稳定，进度状态实时在画布节点徽标呈现。

#### 【工单 P3-3】自动多轨剪辑组装与发布草稿直通
- **责任模块**：`plugins/omnimux-clip`、`plugins/omnimux-publish`
- **闭环装配**：
  - 生成阶段结束后，自动调度 `clip_edit` 将各分镜视频片段、口播音频、背景音乐按时间轴精准对齐；
  - 自动渲染安全区字幕与转场效果；
  - 调度 `clip_export` 导出 9:16 竖屏高画质成片；
  - 导出成功后自动调用 `publish_create_draft`，将成片、标题、文案与标签存入发布草稿箱。
- **验收标准**：成片音画完全同步、字幕不超出安全区，发布草稿箱即刻可见成品。

---

## 6. 质量保障、测试与门禁矩阵

整个工程实施受四大长效门禁与回归套件保护：

| 门禁分类 | 执行命令 / 脚本 | 拦截条件 | 运行阶段 |
| :--- | :--- | :--- | :--- |
| **文档契约门禁** | `pnpm doc:lint` | 发现格式不合规、死链、未受管文档、违禁词。 | 每次代码提交前 (Pre-commit) |
| **预设架构门禁** | `node --test scripts/verify-agent-presets.test.mjs` | 预设结构非法、专家缺失、构建脚本非幂等。 | PR CI 必选门禁 (L0) |
| **全量工具契约** | `pnpm verify:tools` | 88 个 Agent 工具的 Schema、双面交付未对齐。 | PR CI 必选门禁 (L0) |
| **模型参数闭环** | `pnpm verify:model-contracts` | 模型参数未映射、参数被执行中枢 (Hub) 静默丢弃。 | PR CI 必选门禁 (L0) |

---

## 7. 风险控制与降级预案

1. **视频模型生成超时或失败风险**：
   - *预案*：单镜头生成设置 180s 独立超时；单节点失败时标记为 `failed`，提供单节点右键「重试」机制，不回滚重跑全图。
2. **多模态视频分析耗时较长风险**：
   - *预案*：`video_analyze` 在后台异步拉起并在节点显示 Shimmer 加载动效；支持离线缓存（相同视频 MD5 直接秒级命中已有拆解表）。
3. **平台安全区规则变动风险**：
   - *预案*：由于平台规则独立沉淀在 `knowledge/platforms/<platform>.md`，平台 UI 改版时只需更新卡片中的边距数值，零代码改动即可生效。

---

## 8. 第一步行动建议（Immediate Action）

为立即启动本计划，建议下一轮直接执行 **P0-1 与 P0-2 任务**：
1. 在仓库根目录建立 `contracts/` 与 `knowledge/` 规范目录；
2. 正式落盘 `content-discipline.md`、`canvas-discipline.md`、`semantic-judgment.md` 3 份基础契约；
3. 将主 Agent Persona 严格收敛至 80 行微内核，完成知识金字塔的第一层解耦。
