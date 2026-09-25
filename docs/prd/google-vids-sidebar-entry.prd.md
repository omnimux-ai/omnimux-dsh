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
> **适用范围**：`omnimux-video` 视频生成插件在左侧主侧边栏的入口注入、内测阶段标识及与 `GoogleVidsStudioPanel` 中枢面板的挂载联动。  
> **决策与终验签收人**：产品经理 · 许清楚（Xu）

---

## 1. 产品概况与目标（PRD Overview）

### 1.1 业务背景
Google Vids (Veo) 智能视频生成能力已作为独立中枢组件 `GoogleVidsStudioPanel` 引入 OmniMux-DSH 创作矩阵。为了让创作者能够从主工作台以最低链路直达 AI 视频生成环境，需要在左侧导航侧边栏（新会话按钮下方）提供常驻一级入口。
鉴于该能力目前处于早期试验与定向测试阶段，根据系统的发布与准入分级规范，必须在侧边栏条目右侧打上「内测版」（英文态为「Alpha」）状态徽标，向用户明确传达当前的试验性阶段属性。

### 1.2 核心用户价值
1. **单级极速直达**：用户在左侧侧边栏一键触达 Veo 视频生成工作台中枢，免去在不同模块间穿梭查找的认知负荷。
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
4. **严禁私自劫持中栏与右栏全屏**：
   - 点击侧边栏入口后打开 Workbench Tab，严禁随意 `claimProductStage` 遮挡会话或强行清屏。

---

## 2. 信息架构与极简原型线框（Prototype Wireframe）

### 2.1 侧边栏层级与排位拓扑（Rank Topology）
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

### 2.2 展开态极简线框（Expanded Rail）
```text
+-------------------------------------------------------------+
|  [▷]  Google Vids                                  [内测版] |  <-- 高度 32px, padding 0 8px
+-------------------------------------------------------------+
   ▲        ▲                                            ▲
   │        │                                            │
 14×14    14px 文字                               12px 轮廓微徽标
  SVG    line-height:20px                     1px solid --dsw-alias-border-l2
```

### 2.3 折叠态极简线框（Collapsed Rail）
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

前端开发必须严格对照下表逐字、逐像素实现，**严禁自行扩写任何文本，严禁擅自新增任何视觉装饰元素**：

| 区域 / 组件 ID | 元素类型 | 精确显示文案（中/英逐字锁定） | 显隐与交互状态规则 | 严禁附加项（显式红线） |
|---|---|---|---|---|
| `sidebar.google-vids.entry` | 容器按钮 (Button) | *(无文本，DOM 容器)* | 悬停背景 `--dsw-alias-interactive-bg-hover`；激活态 `--dsw-alias-interactive-bg-active`；单激活槽仲裁 | 严禁加任何内外投影、光晕、描边闪烁动效 |
| `sidebar.google-vids.icon` | 矢量图标 (SVG) | *(无文本)* | 14×14 细线矢量图标，填充色 `currentColor`，保持与文字相同光学体量 | 严禁使用彩色渐变图标、严禁 16px 填充满框、严禁带底色徽章 |
| `sidebar.google-vids.label` | 导航标签 (Span) | 中文：`Google Vids`<br>英文：`Google Vids` | 常驻单行显示，字号 14px，行高 20px；折叠态自动隐藏 | 严禁加 `(Veo)`、严禁加 `(智能生成)`、严禁加 `(AI)` 等任何括号解释 |
| `sidebar.google-vids.badge` | 状态徽标 (Badge) | 中文：`内测版`<br>英文：`Alpha` | 靠右自适应对齐；字号 12px，行高 16px；边框 `1px solid var(--dsw-alias-border-l2)`；折叠态完全隐藏 | 严禁加实心高亮背景、严禁使用警示黄/红/绿色彩、严禁加 Emoji `✨` / `🔥` |
| `sidebar.google-vids.tooltip` | 原生提示 (Title/Aria) | 中文：`Google Vids · 内测版`<br>英文：`Google Vids · Alpha` | 鼠标悬停在条目上时展示；`aria-label` 提供无障碍朗读支持 | 严禁输出超过 16 字的长篇解释说明短语 |
| `workbench.tab.title` | 工作台 Tab 标题 | 中文：`Google Vids`<br>英文：`Google Vids` | 关联唤起右侧 Workbench 面板时的 Tab 头文字 | 严禁出现与侧边栏不一致的叫法（如严禁写成 `Veo 创作工作台`） |

---

## 4. 交互与状态机流转契约（Interaction & State Contract）

1. **点击触发与 Tab 唤起**：
   - 用户点击侧边栏条目，触发 `window.__omnimuxWorkbench.open({ tabId: 'omnimux-video:google-vids' })`。
   - 打开或激活右侧工作台中枢，挂载 `GoogleVidsStudioPanel` 组件。
   - 点击操作不得阻塞会话交互，保持非模态平滑协同。
2. **单激活槽（Single Activation Slot）归一机制**：
   - 严格接入 `createSidebarStore({ tabId: 'omnimux-video:google-vids' })` 的状态广播订阅。
   - 当该 Tab 成为当前右侧激活面板时，条目设置 `data-active="true"`。
   - 当用户点击中间会话、切换到其他扩展条目或关闭 Tab 时，立即撤销 `data-active`，杜绝双高亮。
3. **折叠/展开自适应响应**：
   - 监听宿主侧边栏折叠事件（`[data-sidebar-collapsed]`），CSS 零延迟收起 Label 与 Badge，图标居中过渡。

---

## 5. 前端开发实施与验收计划（Implementation & Acceptance Plan）

### 5.1 前置检查与工程规范
1. **复用标准组件桥接**：在 `plugins/omnimux-video/src/client/sidebar-entry.js` 中使用 `dsh-ui-kit` 的 `createSidebarEntry` 或遵循其标准模式编写。
2. **契约文档登记**：同步在 `docs/contracts/sidebar-extra-entries.md` 的「Current occupants」表格中登记 `[data-omnimux-google-vids-entry]`，注明 Rank 7.5 与 Alpha 状态。
3. **生命周期声明校准**：在 `plugins/omnimux/src/plugin-lifecycle.json` 中配置或确保生命周期状态对应内测范畴。

### 5.2 实施步骤（Step-by-Step）
- [ ] **Step 1**：编写 `plugins/omnimux-video/src/client/sidebar-entry.js`，定义标准 14×14 矢量 Icon、中英字典绑定及 Workbench Stage Store。
- [ ] **Step 2**：在 `plugins/omnimux-video/src/client/index.js`（或客户端入口）中挂载并注册侧边栏条目与 Workbench Tab。
- [ ] **Step 3**：验证侧边栏协调器在 Rank 7.5 正确渲染条目，中英文态下精准呈现「内测版」与「Alpha」徽标。
- [ ] **Step 4**：添加单元测试与端到端渲染断言，确保属性、类名、文案完全通过自动化门禁。

### 5.3 量化验收标准（PM Sign-off Metrics）
1. **UI 元素合规率 100%**：零未授权 Badge、零多余装饰图标、零未登记元素。
2. **文案一致性 100%**：中文精准显示 `Google Vids` + `内测版`；英文精准显示 `Google Vids` + `Alpha`。
3. **尺寸与视觉规范对齐 100%**：行高精确 32px，间距精确 6px，圆角 8px，图标 14×14，徽标边框与色彩使用 DSH 标准 Token。
4. **交互无双高亮**：单激活槽仲裁 100% 准确，无任何残留激活或激活丢失。

---
*文档编制完成，交付前端开发执行。*
