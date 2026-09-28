---
title: "媒体查看器原位任务占位卡片规格"
id: "spec-media-viewer-inplace-task-card"
type: "spec"
status: "approved"
authority: "L2"
date: "2026-09-28"
updated: "2026-09-28"
authors: ["许清楚", "齐活林"]
subsystem: "omnimux/media-viewer"
issue: 2782
---

# 媒体查看器原位任务占位卡片（In-place Task Card）产品与 UI 规格

- **文档状态**：已确立（Approved）
- **负责人**：产品经理 · 许清楚（Xu）
- **适用模块**：`plugins/omnimux/src/client/media-viewer/`
- **关联 Issue/PR**：Issue #2339 / PR #2346（移除旧版破坏性条幅），本规格定义其终态替代方案
- **新用户基线**：新用户开箱即用，零配置依赖，空会话仅在发起任务时按目标比例呈现静默原位卡片，异常时就地退出，不依赖任何开发环境特定路径或凭据。
- **文档影响**：收敛并替代历史隐藏卡片逻辑，确立原位静默任务槽（In-place Task Slot）为媒体查看器全屏与时间线统一规范。

---

## 一、产品概况与目标（PRD Overview）

### 1.1 业务背景
此前，在 Issue #2339 / PR #2346 中，团队彻底移除了媒体查看器视口顶部破坏整体布局的旧版黑色横条占位卡片（`GeneratingStateCard`）。该横条存在严重的“AI 过度设计顽疾”：
- 堆砌“提交状态待确认”、“正在处理生成请求”、“复制原请求”等大量低密度状态文字和操作按钮。
- 作为顶部条幅硬塞入视口，破坏了单图大图的居中视口几何与多媒体瀑布流排版。

移除该横条后，媒体查看器恢复了大图与画廊流的纯粹沉浸式体验。但用户从主对话流或右侧媒体面板发起新的生成任务后，媒体查看器在任务执行期间若完全缺失对当前生成动作的上下文感知，容易引发用户对“任务是否已在查看器排队就绪”的不确定感。

经过用户最新方案核准确认，确立终态交互形态为**「原位任务占位卡片（In-place Task Card）」**：
在任务提交后，媒体查看器在展示流/视口舞台中原地固定一个**与目标生成媒体完全相同比例（9:16、16:9、1:1）的圆角卡片**。卡片内部**纯视觉复用创作画布节点同款 OrganicShimmer 多色有机流体折射动效**；当任务完成后，在同一容器内**就地平滑 Morph / 淡入切换呈现最终生成的视频或图片**。

### 1.2 核心用户价值
1. **空间几何预锁（Geometric Stability & Zero-CLS）**：
   在任务生成开始的第一毫秒，即按照目标比例（如竖屏短视频 9:16、宽屏电影 16:9、方图 1:1）在排版流中占据物理空间，杜绝生成完成后媒体载入导致的界面布局跳动（CLS）。
2. **极简科技纯粹视觉（Zero Cognitive Load）**：
   摒弃所有“说明文式”的文字和状态图标，以流动的多色光谱折射光影作为唯一、无声的“系统正在全速计算”隐喻，符合 Linear、Vercel、Apple HIG 顶级现代 SaaS 科技审美。
3. **原位就地切换（In-place Morph & Stage Continuity）**：
   产物直接在原占位卡片就地淡入呈现，不发生节点重排与焦点跳跃，为创作者提供极致丝滑的心理连续性。

### 1.3 明确的不做事项与反过度设计铁律（Non-Goals & Anti-Overdesign Rules）
- ❌ **严禁文字废话（Zero Text）**：
  卡片内部**严禁包含任何文字节点**。严禁出现诸如“生成中”、“正在渲染”、“AI 绘制中”、“稍候”、“计算中”、“排队中”等任何提示语，严禁百分比进度数字，严禁副标题，严禁括号解释。
- ❌ **严禁状态徽章与多余图标（Zero Badges & Decorative Icons）**：
  严禁在卡片四角或居中悬浮任何 `Pending`、`Running`、`Loading` 等胶囊 Badge；严禁添加旋转加载菊花、沙漏、小火花 `✨`、魔棒、机器人或星星等装饰性图符。
- ❌ **严禁操作按钮（Zero Action Buttons）**：
  任务执行中卡片仅作原位视觉占位，严禁放置“取消”、“重试”、“复制 Prompt”、“关闭”等按钮（若需中止生成，由对话主控栏或画布全局执行器负责，查看器保持纯粹）。
- ❌ **严禁顶部横条条幅（Zero Viewport-breaking Banners）**：
  严禁重引入任何横贯视口顶部或悬浮在已有大图上方的提示横条。

---

## 二、信息架构与极简原型线框（Prototype Wireframe）

### 2.1 视口渲染场景与位置契约

```
[场景 A：视口单舞台模式（当前会话无历史媒体，仅有单任务生成）]
+-------------------------------------------------------------+
| 媒体查看器视口舞台 (Media Viewer Main Stage)                |
|                                                             |
|                    +-------------------+                    |
|                    |                   |                    |
|                    |   [原位占位卡片]  |                    |
|                    |     9:16 / 16:9   |                    |
|                    |   OrganicShimmer  |                    |
|                    |   多色流体折射    |                    |
|                    |                   |                    |
|                    +-------------------+                    |
|                          (居中排布)                         |
+-------------------------------------------------------------+

[场景 B：画廊/时间线流模式（已有历史媒体，新任务追加就地占位）]
+-------------------------------------------------------------+
|  +------------+   +------------+   +--------------------+   |
|  | 历史媒体 1 |   | 历史媒体 2 |   | 新任务原位占位卡片 |   |
|  |  (已完成)  |   |  (已完成)  |   | (OrganicShimmer)   |   |
|  |            |   |            |   | [9:16 / 16:9]      |   |
|  +------------+   +------------+   +--------------------+   |
+-------------------------------------------------------------+
```

### 2.2 组件结构与层级树（DOM Architecture）

```
<div class="omx-media-slot" data-ratio="9:16" data-state="running">
  │
  ├── [执行态动效层：仅在 pending/running 渲染，完成时 fade-out]
  │   <div class="wf-organic-shimmer">
  │     <div class="wf-organic-shimmer__canvas" aria-hidden="true">
  │       ├── <div class="wf-organic-shimmer__field"></div>       <!-- 1. 多色环状弥散光谱底场 -->
  │       ├── <div class="wf-organic-shimmer__distortion"></div>  <!-- 2. SVG 湍流折射波浪层 -->
  │       └── <div class="wf-organic-shimmer__glow-layer">        <!-- 3. 三层高质感微光边缘系统 -->
  │             <div class="wf-organic-shimmer__glow-wrap">
  │               ├── <div class="wf-organic-shimmer__glow-deep"></div>
  │               ├── <div class="wf-organic-shimmer__glow-mid"></div>
  │               └── <div class="wf-organic-shimmer__glow-border"></div>
  │             </div>
  │           </div>
  │     </div>
  │   </div>
  │
  └── [完成态产物层：任务成功时渲染并淡入激活]
      <div class="omx-media-result active">
        <img class="omx-media-result__content" src="..." alt="" />
        <!-- 仅在成型为视频时允许纯客观技术参数标：如 "720P · 5s"，不包含主观形容词 -->
      </div>
</div>
```

### 2.3 状态流转契约（Lifecycle Transition）

| 阶段 | 任务状态 (State) | 原位卡片行为 | 视觉呈现 |
|---|---|---|---|
| **1. 提交建卡** | `pending` | 创建 `omx-media-slot` 容器，绑定目标长宽比属性 | 纯黑底色基底，微弱边缘预发光 |
| **2. 任务计算中** | `running` | `wf-organic-shimmer` 全速运转 | 光谱弥散场循环 + 4000ms 匀速往返液体折射湍流 |
| **3. 产物就绪** | `success` (瞬态) | 启动 300ms 交叉过渡（Morph）：`shimmer` 渐隐，`result` 渐显 | 无感知平滑融合，视口位置与容器外框绝对不动 |
| **4. 最终呈现** | `success` (稳态) | 卸载 `shimmer` DOM 节点，完全转为常规媒体卡片 | 真实图片展示 / 视频播放控件就绪 |
| **5. 任务异常** | `failure` / `cancelled` | 就地淡出或移出查看器，错误信息仅向主会话流/通知中枢报告 | 严禁在卡片内写红字报错或插入“重试”按钮 |

---

## 三、UI 元素与 SaaS 文案锁定规格表（UI & Copy Spec — 唯一真源）

> **【许清楚铁律】**
> 下表是前端开发的**绝对白名单（Whitelist Lock）**。未在表内列出的组件标签、文本字符串、图标、状态 Badge 一律属于**非法越权元素**，PM 验收阶段发现即判 REJECT。

| 区域 / 组件 ID | 允许的元素类型 | 允许显示的文案（逐字锁定） | 显隐与交互状态规则 | 严禁附加项（显式红线） |
|---|---|---|---|---|
| `slot.container` | 固定比例容器 (`div.omx-media-slot`) | **无文字（空字符串）** | 常驻，根据入参锁定 `data-ratio="9:16"`、`16:9` 或 `1:1`；自适应视口宽度，最大宽度/高度由舞台统一约束 | 严禁添加外置标题栏、严禁添加卡片顶部小标题（如“任务正在生成”）、严禁添加关闭角标 |
| `shimmer.root` | 动效根容器 (`div.wf-organic-shimmer`) | **无文字（空字符串）** | 任务处于 `pending` / `running` 时挂载；任务成功时添加 `.fade-out`（0.3s opacity: 0）后卸载 | 严禁内嵌任何文本、严禁居中放置 Spinning Loader、严禁居中放置品牌 Logo |
| `shimmer.canvas` | 纯装饰层 (`div.wf-organic-shimmer__canvas`) | **无文字（空字符串）** | `aria-hidden="true"`，禁用所有鼠标事件 (`pointer-events: none`) | 严禁响应点击、严禁任何可聚焦 (focusable) 行为 |
| `shimmer.field` | 光谱底场 (`div.wf-organic-shimmer__field`) | **无文字（空字符串）** | 6 组多色径向渐变混合（蓝、粉红、翠绿、紫罗兰、暖橙、青色） | 严禁改用单色灰阶呼吸骨架屏 |
| `shimmer.distortion` | 液体湍流折射层 (`div.wf-organic-shimmer__distortion`) | **无文字（空字符串）** | 嵌入 SVG `feTurbulence` + `feDisplacementMap` 湍流滤镜，`4000ms linear infinite alternate` 往返平移 | 严禁使用普通闪烁条（Linear Bar Shimmer）替代 |
| `shimmer.glow` | 边缘发光层组 (`div.wf-organic-shimmer__glow-layer`) | **无文字（空字符串）** | 包含 deep 模糊场、mid 发光与 1px 微渐变边框 | 严禁添加粗边框、严禁添加高饱和纯色外发光 |
| `result.container` | 产物呈现容器 (`div.omx-media-result`) | **无文字（空字符串）** | 任务成功时激活，平滑渐入（opacity: 0 -> 1，0.3s ease） | 严禁出现弹跳、缩放动画等夸张动效 |
| `result.badge`（仅限视频） | 客观参数技术标签 (`div.result-badge`) | 仅允许**客观技术规格**（如：`720P · 5s`、`1080P · 10s`、`4K`） | 浮动于产物底部，仅在视频载入完成后显示；图片类型**不显示** | 严禁添加“高清”、“精细成品”、“最新生成”、“AI极速”等任何主观营销词汇或表情符号 |

---

## 四、前端开发实施与验收计划（Implementation & Acceptance Plan）

### 4.1 前端开发前置实现指引
1. **样式与组件复用**：
   - 必须复用 `plugins/omnimux-workflow/src/canvas/editor/components/OrganicShimmer.tsx` 或 `plugins/omnimux/src/client/media-viewer/styles.js` 中既有的有机流体折射动效类与动画契约，保持全产品视觉资产统一。
   - 比例计算：严格遵循现代 CSS 规范 `aspect-ratio: 9/16`、`16/9`、`1/1` 或使用内联 padding-top hack 兼容保底。
2. **状态驱动与 Store 订阅**：
   - 在 `media-viewer-store.js` 中新增/规范 `generationSlot` 状态模型，仅保留任务标识、目标比例 `ratio`、任务生命周期 `status`（`pending` | `running` | `success` | `failure`）以及成功时的产物引用。
   - 彻底删除旧版 `GenerationTasks.jsx` 中遗留的文字标签字典（`labels: { pending: '等待生成...', running: '生成中...' }`）及 `copyPrompt` 冗余逻辑。

### 4.2 质量门禁与自动化校验（Automated Gate Assertions）
前端开发完成后，必须满足以下硬性门禁测试：
1. **纯净度断言（Zero-Text Assertion）**：
   ```js
   const taskCard = document.querySelector('.omx-media-slot[data-state="running"]');
   assert.strictEqual(taskCard.textContent.trim(), '', '任务占位卡片内部文本必须绝对为空');
   ```
2. **零多余控件断言（Zero-Button Assertion）**：
   ```js
   const buttons = taskCard.querySelectorAll('button, [role="button"], a');
   assert.strictEqual(buttons.length, 0, '任务占位卡片内严禁出现任何交互按钮或链接');
   ```
3. **结构层级断言（Shimmer DOM Contract）**：
   必须包含 `.wf-organic-shimmer__field`、`.wf-organic-shimmer__distortion` 及 `.wf-organic-shimmer__glow-layer`。

### 4.3 产品经理终验标准（PM Sign-off Checkpoints）

| 验收序号 | 检查维度 | 判定准则 | 严重级别 |
|---|---|---|---|
| **C-1** | 视觉文字排查 | 任务执行中卡片内存在任何字样（包括占位文字、加载说明） | **一票否决 (REJECT)** |
| **C-2** | 标签徽章排查 | 卡片上挂有带彩色背景的提示 Badge 或状态字样 | **一票否决 (REJECT)** |
| **C-3** | 比例吻合度 | 卡片比例与创建时指定的目标长宽比完全一致（容差 < 1px） | **一票否决 (REJECT)** |
| **C-4** | 动效表现一致性 | 正确加载 OrganicShimmer（光谱底场 + 湍流液体折射） | **阻塞整改 (REJECT)** |
| **C-5** | 完成态切换平滑度 | 任务完成时原位就地淡入，无跳动，无重排闪烁 | **阻塞整改 (REJECT)** |

- 终验通过标志：当且仅当上述检查点 100% 达标时，由产品经理许清楚签署：
  `PM_SIGN_OFF: PASS`。
