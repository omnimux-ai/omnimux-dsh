# 规格：灵感模板全量恢复、智能体上下文参考工具与附件挂载闭环

## 1. 业务目标与背景
- **核心诉求**：
  1. 首页「探索模板」重新放回全量 395 套短视频灵感模板（涵盖 7 大业务分类与 TikTok热门、Skills），同时置顶保留 7 款已有的王牌官方 AI 应用；
  2. 不需要为这几百套普通模板生成 AI 应用工程或表单配置；仅作为灵感模板与智能体（Agent）上下文参考；
  3. 针对未绑定应用的模板，卡片悬停默认展示「复刻」按钮；点击「复刻」后自动将模板以附件形式挂载到当前会话输入框上方，光标聚焦输入框，并在发送时供智能体获取完整上下文；
  4. 向智能体开放两大只读工具（`omnimux_creative_templates_search` 与 `omnimux_creative_template_get`），支持智能体按分类、关键词检索模板，并可调阅完整分镜提示词（Prompt）与工作流链路（Workflow）。

## 2. 接口契约与数据模型规范

### 2.1 数据层规范 (`templates-data.js`)
- **模板集合 (`ALL_CREATIVE_TEMPLATES`)**：
  - 数量：402 条（7 款置顶的官方王牌应用 `type: 'app'` + 395 套全量灵感模板 `type: 'template'`，其中已绑定应用的优先标记 `isApp: true`）；
  - 每条模板核心字段：`id`, `title`, `titleEn`, `categorySlug`, `thumbnailUrl`, `previewVideoUrl`, `prompt`, `workflow`, `isApp`；
  - 162 套 Creatify 模板注入轻量结构化工作流元数据（包含 `nodeChain`, `modelsUsed`, `nodeCount`, `edgeCount` 等）。
- **分类定义 (`TEMPLATE_CATEGORIES`)**：
  - 恢复 10 大分类：全部 (`all`), TikTok热门 (`tiktok`), Skills (`skills`), 软件应用 (`apps-software`), 黄金开场 (`hook-intro`), 真实种草 (`ugc-review`), 视效大片 (`cinematic-vfx`), 模特试穿 (`fashion-try-on`), 行业精选 (`industry-packs`), 硬核评测 (`durability-test`)。
- **货架行配置 (`SHELVES_CONFIG`)**：
  - 各分类具备标准货架行，默认「全部」视图呈现分行滑动卡片流。

### 2.2 智能体工具契约 (`plugins/omnimux/src/templates/tools.js`)
1. `omnimux_creative_templates_search`:
   - 入参：
     - `category?: string`（可选，支持 Slug 或中文名过滤）
     - `platform?: string`（可选，'creatify' | 'pippit' | 'higgsfield' | 'creatok'）
     - `query?: string`（可选，关键词模糊检索）
     - `limit?: number`（可选，默认 10，最大 50）
   - 返回：`{ ok: true, total: number, items: Array<{ id, title, titleEn, categorySlug, sourcePlatform, duration, promptSummary, hasWorkflow }> }`
2. `omnimux_creative_template_get`:
   - 入参：`{ id: string }`
   - 返回：`{ ok: true, template: { id, title, titleEn, categorySlug, sourcePlatform, duration, prompt, workflow, thumbnailUrl, previewVideoUrl } }`

### 2.3 前端与附件交互契约
- 卡片悬停动作分化：
  - 绑定应用（7 大王牌应用）：悬停展示「打开应用」，点击平滑切换至 AI 应用工作台面板；
  - 未绑定应用：悬停展示「复刻」，点击调用附件中心 `store.addAttachment(sessionId, payload)` 或广播 `omnimux:add-to-conversation` 事件，挂载为 `kind: 'inspiration'` 附件；
- 挂载反馈：
  - 触发 `omnimux:attachments:reveal` 高亮附件导轨；
  - 自动聚焦会话输入框并填入轻量引导提问；
  - 弹出成功轻提示。

## 3. 验收与质量门禁
1. **数据与分类完整性**：单测验证 10 大分类及全量模板正确加载与索引；
2. **工具可用性验证**：单测验证智能体搜索工具与详情工具的参数解析与返回；
3. **卡片行为验证**：单测验证未绑定应用卡片显示「复刻」，点击正确生成附件载荷；
4. **代码审查与全量测试**：测试 100% 绿灯，无任何回归问题。
