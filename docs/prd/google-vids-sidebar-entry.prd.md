---
title: "Google Vids (Veo) 视频生成侧边栏入口与内测标记产品需求文档 (PRD)"
id: "prd-google-vids-sidebar-entry"
type: "prd"
status: "approved"
authority: "L1"
date: "2026-09-25"
author: "许清楚 (Xu)"
subsystem: "omnimux-video"
issue: "#2657"
---

# Google Vids (Veo) 视频生成侧边栏入口与内测标记产品需求文档 (PRD)

> **设计基准**：严格遵循全球顶级现代科技 SaaS（Linear、Vercel、Apple macOS HIG）极简设计标准，彻底终结过度设计。  
> **适用范围**：`omnimux-video` 视频生成插件在左侧主侧边栏的入口注入、内测阶段标识及 Google Vids 中栏舞台与 Clip 右侧工作台的入口联动。
> **当前行为依据**：Issue #2721 回归规格 [`specs/google-vids-center-stage-entry-regression.spec.md`](../../specs/google-vids-center-stage-entry-regression.spec.md)；与本文交互/座位约定冲突时，以该回归规格为准（座位与 claim 表述以 Issue #3165 为准：Vids 为官方 `main` 插槽面板，不 claim 产品舞台）。本文 Issue #2657 的状态、归属及既有批准文案/元素/样式白名单保留为历史基线。
> **决策与终验签收人**：产品经理 · 许清楚（Xu）

---

## 1. 产品概况与目标（PRD Overview）

### 1.1 业务背景
Google Vids (Veo) 智能视频生成能力以 `GoogleVidsStage` 注册为官方 `main` 插槽面板（`key: 'omnimux-vids'`），显示在中间会话列。为了让创作者能够从主工作台以最低链路直达 AI 视频生成环境，左侧导航侧边栏（新会话按钮下方）提供常驻一级入口；入口同时联动打开右侧 Clip 工作台。
鉴于该能力目前处于早期试验与定向测试阶段，根据系统的发布与准入分级规范，必须在侧边栏条目右侧打上「内测版」（英文态为「Alpha」）状态徽标，向用户明确传达当前的试验性阶段属性。

### 1.2 核心用户价值
1. **单级直达**：用户从左侧入口打开中间 Google Vids 舞台，并在右侧打开 Clip 工作台，减少跨模块查找。
2. **状态透明可预期**：通过规范的「内测版」微徽标，向创作者清晰传达当前能力的迭代阶段，建立合理的质量预期与容错空间。
3. **沉浸式极简体验**：与 OmniMux 既有的一级导航规范无缝融合，零视觉断层、零突兀侵入。

### 1.3 明确不做的非目标（Non-Goals，显式红线）
1. **严禁同义词叠加与多重营销修饰**：
   - 严禁在标题旁或徽标中添加 `💎`、`🔥`、`✨` 等装饰性 Emoji 或图标。
   - 严禁出现「高画质」、「快速出片」、「全新上线」、「智能生成」等主观形容词 Badge 或营销副标题。
2. **严禁在标签中拖带括号解释**：
   - 标签必须为纯粹的实体名词 `Google Vids`。
   - 严禁写成 `Google Vids (Veo 智能视频)`、`Google Vids (内测)` 或 `Google Vids (实验性)`。
3. **严禁私造视觉刻度与异构容器**：
   - 必须严格遵循 `sidebar-extra-entries.md` 规范（32px 行高、14×14 图标、14px 文字、8px 圆角），严禁定制尺寸或不同行高。
4. **舞台与工作台分栏，不改变获批视觉方案**：
   - Google Vids 生成面板仅注册官方 `main` 插槽，显示于中间会话列；Clip `omnimux-clip:studio` 仍由 Clip 插件注册并显示于右侧 `betterSidebar`。
   - 点击入口先请求 Workbench 以 `focus: 'split'` 打开 Clip；仅在 `open` 严格返回 `true` 后调用 `layout.selectPanel('omnimux-vids')` 选中面板。不得提前切换，不得 claim 任何产品舞台，不得另行调用 `setFocus`。
   - 本交互是 #2721 回归规格定义、经 #3165 更正座位的窄范围例外；不得借此新增/删除/改写已批准的可见 UI、文案、图标或样式。

---

## 2. 信息架构与极简原型线框（Prototype Wireframe）

### 2.1 入口与内容座位（Seat Topology）
侧边栏入口与获批视觉原型保持不变。点击后 Vids 面板显示在中间会话列（官方 `main` 插槽面板，`key: 'omnimux-vids'`），Clip `omnimux-clip:studio` 显示在右侧 Workbench `betterSidebar`；Vids 不再作为右侧 Workbench Tab 注册，也不 claim 产品舞台。具体异步时序以 #2721 回归规格为当前依据，座位以 #3165 为准。

```text
[左侧 Google Vids 入口] --点击--> [右侧 Clip Workbench: split 打开成功]
                                      │
                                      └─随后 selectPanel─> [中间 Google Vids main 插槽面板]
```

上图仅表达座位与行为，不增加、删改任何可见元素、文案、图标或样式。

### 2.2 侧边栏层级与排位拓扑（Rank Topology）
左侧侧边栏条目由协调器（`window.__omnimuxSidebar`）统一执行 Rank 升序排列。Google Vids 定位为核心生成能力，排在灵感激发（Rank 7）之后、产品库管理（Rank 8）之前，分配 **Rank 7.5**。

```text
[左侧主导航侧边栏]
┌────────────────────────────────────────────────────────┐
│  [+] 新会话                                            │
├────────────────────────────────────────────────────────┤
│  [田] 应用 (Apps)                          (Rank 1)    │
│  [▤] 任务看板 (Taskboard)                               │
│  [⚑] 账号 (Accounts)            [Alpha]   (Rank 3)    │
│  [📱] 手机管理 (Devices)                    (Rank 3.5)  │
│  [◈] 项目 (Projects)                      (Rank 4)    │
│  [↗] 发布 (Publish)             [Alpha]   (Rank 4.2)  │
│  [📊] 数据分析 (Analytics)       [Alpha]   (Rank 4.5)  │
│  [☁] 资产库 (Assets)                       (Rank 6)    │
│  [💡] 灵感社区 (Inspiration)                (Rank 7)    │
│  [▶] Google Vids               [内测版]   (Rank 7.5)   ◄─── 本次交付入口
│  [🛍] 产品库 (Products)                     (Rank 8)    │
│  [⚙] 自动化 (Automation)        [Alpha]   (Rank 9)    │
└────────────────────────────────────────────────────────┘
```

### 2.3 展开态极简线框（Expanded Rail）
本线框仅描述沿用的已批准左栏入口外观。
```text
+-------------------------------------------------------------+
|  [▷]  Google Vids                                  [内测版] |  <-- 高度 32px, padding 0 8px
+-------------------------------------------------------------+
   ▲        ▲                                            ▲
   │        │                                            │
 14×14    14px 文字                               12px 轮廓微徽标
  SVG    line-height:20px                     1px solid --dsw-alias-border-l2
```

### 2.4 折叠态极简线框（Collapsed Rail）
本线框仅描述沿用的已批准左栏入口外观。
当主侧边栏折叠至 56px 紧凑态时，徽标与文字自动隐去，仅保留水平居中 14×14 图标，悬停时浮出系统原生 Tooltip：
```text
+----------+
|          |
|   [▷]    |  <-- 悬停浮层: "Google Vids · 内测版"
|          |
+----------+
```

---

## 3. UI 元素与 SaaS 文案锁定规格表（UI & Copy Spec — 唯一真源）

前端开发必须严格对照下表逐字、逐像素实现，**严禁自行扩写任何文本，严禁擅自新增任何视觉装饰元素**。本表保留 #2657 批准的 UI 文案与元素基线；#2721 只更新入口行为与内容座位，不授权改变表内可见 UI：

| 区域 / 组件 ID | 元素类型 | 精确显示文案（中/英逐字锁定） | 显隐与交互状态规则 | 严禁附加项（显式红线） |
|---|---|---|---|---|
| `sidebar.google-vids.entry` | 容器按钮 (Button) | *(无文本，DOM 容器)* | 悬停背景 `--dsw-alias-interactive-bg-hover`；`layout.panelInfo.activePanelId === 'omnimux-vids'`（入口 `data-active="true"`）时映射 `--dsw-alias-interactive-bg-active` | 严禁加任何内外投影、光晕、描边闪烁动效 |
| `sidebar.google-vids.icon` | 矢量图标 (SVG) | *(无文本)* | 14×14 细线矢量图标，填充色 `currentColor`，保持与文字相同光学体量 | 严禁使用彩色渐变图标、严禁 16px 填充满框、严禁带底色徽章 |
| `sidebar.google-vids.label` | 导航标签 (Span) | 中文：`Google Vids`<br>英文：`Google Vids` | 常驻单行显示，字号 14px，行高 20px；折叠态自动隐藏 | 严禁加 `(Veo)`、严禁加 `(智能生成)`、严禁加 `(AI)` 等任何括号解释 |
| `sidebar.google-vids.badge` | 状态徽标 (Badge) | 中文：`内测版`<br>英文：`Alpha` | 靠右自适应对齐；字号 12px，行高 16px；边框 `1px solid var(--dsw-alias-border-l2)`；折叠态完全隐藏 | 严禁加实心高亮背景、严禁使用警示黄/红/绿色彩、严禁加 Emoji `✨` / `🔥` |
| `sidebar.google-vids.tooltip` | 原生提示 (Title/Aria) | 中文：`Google Vids · 内测版`<br>英文：`Google Vids · Alpha` | 鼠标悬停在条目上时展示；`aria-label` 提供无障碍朗读支持 | 严禁输出超过 16 字的长篇解释说明短语 |
| `workbench.tab.title` | 历史批准文案基线（非 Vids Workbench Tab） | 中文：`Google Vids`<br>英文：`Google Vids` | 保留 #2657 批准文案与元素记录；当前 Vids 不注册 Workbench Tab。Clip Workbench 标题 `视频剪辑` 属于 #2721 已有交互参数，不改变本 UI 白名单 | 严禁据此新增 Vids 右侧 Tab，严禁修改任何获批可见文案 |

---

## 4. 交互与状态机流转契约（Interaction & State Contract）

1. **点击触发与异步状态契约**：
   - 点击入口后调用 `window.__omnimuxWorkbench.open({ tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' })`；等待 Promise settle。
   - 仅当 resolve 值严格为 `true` 且入口仍挂载时，随后调用 `layout.selectPanel('omnimux-vids')`；不得 claim 产品舞台，不得另行调用 `setFocus`。
   - 返回 `false` / 非严格 `true`、同步异常、Promise rejection、Workbench/`layout.selectPanel` API 缺失或等待期间入口卸载时，不切换面板、不单独改焦点，维持现状。
2. **内容座位与入口激活态**：
   - Google Vids 由 `omnimux-video` manifest 声明并注册至官方 `main` 插槽，`key: 'omnimux-vids'`（order 36）；不注册 Vids 的 `betterSidebar` Tab。
   - Clip `omnimux-clip:studio` 继续由 `omnimux-clip` 注册至右侧 `betterSidebar`。调用 `open` 成功后先打开 Clip，再 `layout.selectPanel('omnimux-vids')`，形成中栏面板与右侧工作台同屏。
   - 入口 `data-active="true"` 仅在 `layout.panelInfo.activePanelId === 'omnimux-vids'` 时设置，并通过 `panelInfo.subscribe` 同步；它不读 `data-dsh-product-stage`，也不是 Vids Workbench Tab 的激活状态。
3. **折叠/展开自适应响应**：
   - 监听宿主侧边栏折叠事件（`[data-sidebar-collapsed]`），CSS 零延迟收起 Label 与 Badge，图标居中过渡。

---

## 5. 前端开发实施与验收计划（Implementation & Acceptance Plan）

### 5.1 前置检查与工程规范
1. **复用标准侧栏契约**：在 `plugins/omnimux-video/src/client/sidebar-entry.js` 中按 `sidebar-extra-entries.md` 标准渲染入口，保留已批准的图标、文案与样式。
2. **面板座位校准**：Google Vids 仅在 manifest 与 `main` 插槽注册为 `key: 'omnimux-vids'`；不得注册 Vids 的 `betterSidebar` Workbench Tab，不得 claim 产品舞台。
3. **交互回归规格**：入口启动时序、失败与卸载边界均按 #2721 回归规格实现与验收；本文 Issue #2657 状态与审批元数据不因本次行为修正而改写。

### 5.2 实施步骤（Step-by-Step）
- [ ] **Step 1**：按批准的白名单保留侧边栏入口的 14×14 图标、中英文案与既有样式。
- [ ] **Step 2**：注册 Vids 官方 `main` 插槽面板，并保留 Clip 插件负责的右侧 `omnimux-clip:studio` Tab。
- [ ] **Step 3**：实现 #2721 定义、#3165 更正座位的顺序：请求 Clip `focus: 'split'` 打开，严格成功后再 `layout.selectPanel('omnimux-vids')`；失败与卸载不改变现状。
- [ ] **Step 4**：按当前回归规格验证异步成功、失败分支、API 缺失、卸载保护及 `main` 插槽/Workbench 拓扑；UI 可见文案与元素不变。

### 5.3 量化验收标准（PM Sign-off Metrics）
1. **UI 元素合规率 100%**：零未授权 Badge、零多余装饰图标、零未登记元素。
2. **文案一致性 100%**：中文精准显示 `Google Vids` + `内测版`；英文精准显示 `Google Vids` + `Alpha`。
3. **尺寸与视觉规范对齐 100%**：行高精确 32px，间距精确 6px，圆角 8px，图标 14×14，徽标边框与色彩使用 DSH 标准 Token。
4. **入口激活态准确**：只映射 `layout.panelInfo.activePanelId === 'omnimux-vids'`；无效的 Workbench 打开、失败或卸载时不误切换面板、不遗留错误激活态。

---
*文档编制完成，交付前端开发执行。*
