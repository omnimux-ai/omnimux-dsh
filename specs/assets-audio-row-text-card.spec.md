---
title: "assets-audio-row-text-card — 「全部」页声音行空框与选品对齐 缺陷修复规格"
id: "spec-assets-audio-row-text-card"
issue: "#2664"
type: "spec"
status: "draft"
authority: "L1"
date: "2026-09-25"
authors: ["x", "product-manager"]
subsystem: "omnimux-assets"
worktree: ".worktrees/omnimux-assets-audio-row-text-card"
branch: "agent/omnimux-assets-audio-row-text-card-issue-2664"
base: "fcc4ef3c5 (origin/main)"
---

# 资产库「全部」页声音行空框与选品对齐 —— 开发前策划四件套

> **本文档是本次改动的唯一事实源。** 前端实现必须逐字遵循 ③ 的元素白名单与文案字典；未列入白名单的 Badge、副标题、装饰图标、提示条、占位图一律视为越权添加。
> 本规格由产品经理（许清楚）签发，前端（裴像素）零自由发挥。

---

## ① PRD

### 1.1 问题陈述

**现象**：资产库 → 公共 → 一级 Tab「全部」页的「声音」行，卡片呈现为 `300×169` 的空边框方块 —— 无底板、无播放键、无标题、无描述。

**实机证据**：Dev 45120 CDP 复核该行 24 张卡中 22 张 `data-kind="text"`，无 thumb 元素，`.omnimux-assets-card-body` 计算样式 `opacity: 0`。

**双重根因（已由实机证据与源码锁定，本次不重新排查）**：

| # | 根因 | 位置 | 事实 |
|---|---|---|---|
| R1 | 音色（配音）描述行被判为 `text` 类 | `plugins/omnimux-assets/src/client/cloud-feed-helpers.js:189-197` | `cloudCardKind()` 对「无 cover 且 `media_type !== 'audio'`」的行返回 `'text'` |
| R2 | 单行流把 `text` 卡唯一的正文藏掉 | `plugins/omnimux-assets/src/client/styles.js:1549-1561` | `.omnimux-assets-cloud-row-cards .omnimux-assets-card-body { opacity: 0; transform: translateY(8px) }`（悬停才浮现）；`CloudAssetsView.jsx:263` 中 `kind === 'text'` 时整块 thumb 不渲染 → 卡片零内容 |
| R3 | 抽样落点几乎必然命中音色页 | `CloudCategoryRow.jsx:51` | `fetchCategoryRandomSample('audio', cloudPage, normalizeCloudAsset, 24)` 在 `audio` 的 27 页里随 1~2 页；第 5–26 页几乎 100% 是音色行 → 约 81% 概率整行落到音色页 |
| R4 | 面板色板未覆盖 `text` | `CloudAssetsView.jsx:250` | `data-theme` 仅在 `canPlay && !showArt`（即 `kind === 'audio'`）时写入；音色描述行从未拿到底板 |

**回归引入点**：`cbb03716a`（PR #2225「悬停暗化标题浮现」，2026-09-17）—— #2198 引入单行流时正文是默认可见的。

**云端目录实测构成**（`plugins/omnimux-assets/cloud-catalog/`，本次不改）：

| scope | 行数 | 页数 | `media_type` 分布 | 有 `media_url` | 可播放 |
|---|---|---|---|---|---|
| `audio`（全量） | 640 | 27 | `audio` 130 / `video` 1 / `other` 509 | 131 | 131 |
| `audio/voiceover` | 527 | 22 | `other` 509 / `audio` 18 | 18 | 18 |
| `audio/bgm` | 108 | 5 | `audio` 107 / `video` 1 | 108 | 108 |
| `audio/sfx` | 5 | 1 | `audio` 5 | 5 | 5 |

即 `audio` 全量中 **510 行（79.7%）是音色描述行**（`media_type:"other"`、`media_url:""`、无 `meta.playable`），例：「双节棍小哥 / 甜美悦悦 / Russell / 爽快思思·Skye」。可播放范围只占 20.5%。

### 1.2 用户价值

1. **不再出现零内容卡片**：任何分类行的单行流都必须让每张卡片有可见内容 —— 这是「一张卡片必须说清它是什么」的底线，与是否选中可播放素材无关。
2. **「声音」行说到做到**：该行副标题承诺「爆款卡点配乐、节奏音频与专业环境音效」，但 81% 概率整行是「点不动的空框」。收敛抽样范围后，声音行呈现的正是它声称的内容：可试听的 BGM 与音效。
3. **不丢任何既有内容**：音色（配音）描述行仍由「声音 → 配音」二级标签完整可达（527 行 / 22 页），本次不删除、不隐藏任何云端行。

### 1.3 范围

| 项 | 内容 | 优先级 |
|---|---|---|
| **A** | 单行流版式为 `kind === 'text'` 的卡片兜底 —— 保证任何分类行都不会再出现零内容卡片 | 必修 |
| **B** | 「声音」行抽样收敛到可播放范围（`bgm` + `sfx`），与该行副标题一致 | 必修（与 A 同批） |

### 1.4 验收标准（可度量）

| ID | 断言（必须成立） | 判定方式 |
|---|---|---|
| **AC-A1** | 单行流中不存在「无任何文本内容」的卡片：每个 `.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card` 要么含 `[data-kind="media"]`/`[data-kind="audio"]` 的 thumb，要么其 `.omnimux-assets-card-title` 非空且计算 `opacity === '1'` | 样式 DOM 探针 + 真实浏览器实测（任意抽样页面） |
| **AC-A2** | 单行流 `text` 卡正文常驻：`.omnimux-assets-card-body` 计算 `opacity === '1'`、`transform === 'none'` | 样式 DOM 探针 |
| **AC-A3** | 单行流 `text` 卡 `data-theme` 为空（不取五色微彩），底板为单一中性表面 `var(--dsw-alias-bg-layer-1)` | 样式 DOM 探针 |
| **AC-A4** | 单行流 `text` 卡悬停时 `.omnimux-assets-cloud-card-mask` 计算 `display === 'none'`（不压暗正文） | 样式 DOM 探针 |
| **AC-A5** | 单行流 `text` 卡悬停时右上角「添加到会话」按钮 `opacity` 由 `0 → 1`，且 `aria-label` 为 `添加到会话` | 真实浏览器实测（hover 后读计算样式） |
| **AC-A6（反向锁定）** | 单行流 `media`/`audio` 卡保持现状：正文 `opacity === '0'`、遮罩 `opacity === '0'`（现有断言 `category-row-layout.e2e.test.js:135,139` 必须保持绿） | 现有 e2e 测试不改动即通过 |
| **AC-B1** | 「全部」页「声音」行渲染出的全部卡片 `data-kind === 'audio'`（100%，不变量） | 真实浏览器实测 + 单测 |
| **AC-B2** | 「声音」行卡片必含 `.omnimux-assets-cloud-play`，且 `data-theme` ∈ `['indigo','jade','azure','violet','charcoal']` | 真实浏览器实测 |
| **AC-B3** | 「声音」行渲染卡片数 === 24 | 真实浏览器实测 |
| **AC-B4** | 采样只命中 `audio/bgm` 与 `audio/sfx` 两个 scope；不得请求 `audio/page-NNNN.json` 的随机页 | 单测（fetch 调用参数断言）+ 网络面板 |
| **AC-B5** | 「声音 → 配音」二级标签仍能列出音色行（`audio/voiceover`，527 行 / 22 页），该处网格 `text` 卡正常显示音色名 + 音色说明 | 真实浏览器实测 |
| **AC-C1** | 「全部」页其余五个分类行（角色 / 场景 / 道具 / 素材 / 风格）的抽样范围与版式不变 | 单测 + 实测抽查 |
| **AC-C2** | 网格版式（声音 Tab 网格、配音二级标签网格）的 `text` 卡版面与本规格 2.3 一致，不受 A 影响 | 样式 DOM 探针 + 实测截图 |

### 1.5 非目标（Non-Goals）

1. **不改云端目录数据**：`plugins/omnimux-assets/cloud-catalog/**` 一行不动。含 `audio/bgm` 中唯一一张 `media_type:"video"` 的行（`id: audio-bgm-1f565b029b3a`，name `下载 (1)`，`file:素材库/音频/舞蹈/下载 (1).mp4`）—— 该行由客户端 `kind` 过滤消化，不修数据、不重命名、不重建目录。
2. **不改其他五个分类行**（角色 / 场景 / 道具 / 素材 / 风格）的抽样范围与版式。
3. **不改网格版式** —— 尤其不改声音 Tab 与配音二级标签下的 `text` 卡版面。
4. **不改 `cloudCardKind()` 的三态判定语义**（`audio` / `media` / `text` 的定义不动，仅新增消费方过滤）。
5. **不新增文案键、不新增图标、不新增组件、不改一级/二级 Tab 名称**。
6. **不改 `audio` 一级 scope 页（`audio/page-*.json`）的内容与编号**。
7. **不新增空态、提示条、Toast、占位插画**（本次不需要任何新的用户可见文案）。

---

## ② 原型（Prototype）

### 2.1 单行流「声音」行 —— 最终版面（300×169 · 间距 14px）

```
┌─ <section .omnimux-assets-cloud-row-section data-category="audio"> ───────────────────────────────┐
│                                                                                                   │
│  声音                                                              查看全部 ›                     │
│  ┗ h2.…-row-title（可点击进入该分类）                              ┗ Button ghost size=sm         │
│  爆款卡点配乐、节奏音频与专业环境音效                                                             │
│  ┗ p.…-row-desc（文案不变）                                                                       │
│                                                                                                   │
│ ┌ .omnimux-assets-cloud-row-wrapper ────────────────────────────────────────────────────────────┐ │
│ │ [◀]   ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐  [▶] │ │
│ │ 36×36 │  300 × 169 · 16:9       │  │  300 × 169 · 16:9       │  │  300 × 169 · 16:9       │      │ │
│ │ 圆形  │  ┌────────────────────┐│  │  ┌────────────────────┐│  │  ┌────────────────────┐│      │ │
│ │ 翻页  │  │                    ││  │  │                    ││  │  │                    ││      │ │
│ │ 按钮  │  │      ( 32×32 )     ││  │  │      ( 32×32 )     ││  │  │      ( 32×32 )     ││      │ │
│ │ 悬停  │  │       居中播放键    ││  │  │       居中播放键    ││  │  │       居中播放键    ││      │ │
│ │ 才现  │  │                    ││  │  │                    ││  │  │                    ││      │ │
│ │       │  └────────────────────┘│  │  └────────────────────┘│  │  └────────────────────┘│      │ │
│ │       └────────────────────────┘  └────────────────────────┘  └────────────────────────┘      │ │
│ │          data-kind = "audio"          data-kind = "audio"        data-kind = "audio"          │ │
│ │          data-theme = indigo          data-theme = jade          data-theme = azure           │ │
│ │          底板 = 暗调微彩（五色轮换，按 id 确定性）                                              │ │
│ └───────────────────────────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
   卡片间距 gap: 14px · 容器 padding: 6px 4px 14px · 圆角 12px · 边框 1px var(--dsw-alias-border-l2)
```

**静止态**：整块暗调微彩底板 + 正中央 32×32 播放键。**无标题、无描述**（正文 `opacity: 0`，悬停才浮现）—— 这是 `audio`/`media` 类的既定行为，本次**不改**。

```
              ┌──────── 悬停态（data-kind="audio"）────────┐
              │  ┌──────────────────────────────┐          │
              │  │ ┌────────────────────────┐   │          │  .omnimux-assets-cloud-actions
              │  │ │                 [ 28×28 ]│   │          │  顶 8px 右 8px，opacity 0→1
              │  │ │        ( 32×32 )        │   │          │  按钮 aria-label="添加到会话"
              │  │ │              ▓▓▓▓暗化▓▓▓▓│   │          │
              │  │ ├─ 底部渐变蒙层 ──────────┤   │          │  .omnimux-assets-cloud-card-mask
              │  │ │ apple x supercut       │   │          │  全卡 bg-mask-1，opacity 0→1
              │  │ │ 短视频卡点配乐 · 0:15   │   │          │
              │  │ └────────────────────────┘   │          │  标题 14px/700 上浮 8px→0
              │  └──────────────────────────────┘          │  描述 11px 单行省略
              └────────────────────────────────────────────┘
```

### 2.2 A 兜底：单行流 `text` 卡的版面（修复前 → 修复后）

**修复前（缺陷）**：

```
   ┌────────────────────────┐
   │                        │   ← 300×169 空边框方块
   │                        │      · thumb 不渲染（CloudAssetsView.jsx:263）
   │                        │      · body opacity: 0（styles.js:1549）
   │                        │      · 无底板、无播放键、无标题、无描述
   │                        │
   └────────────────────────┘
```

**修复后（终局面板，本规格裁定）**：

```
   ┌──────────────────────────────────┐
   │ 双节棍小哥                        │  ← 标题 14px / 600 / line-height 20px / 最多 2 行
   │                          ┌──────┐│     padding-right 32px，让位右上角「添加到会话」
   │ 普通话男声，成熟稳重，适合口播…    │     ┌──────┐（28×28，悬停才现）
   │                          └──────┘│
   │                                  │  ← 描述 12px / 400 / line-height 18px / 最多 4 行
   │                                  │     color: var(--dsw-alias-label-secondary)
   └──────────────────────────────────┘
      底板：var(--dsw-alias-bg-layer-1)  单一中性表面 · 不取五色微彩 · 无 data-theme
      边框：1px var(--dsw-alias-border-l2)   圆角：12px（沿用 .omnimux-assets-card）
      内边距：14px 全边等宽 · gap: 6px · 顶部对齐 · 正文常驻可见
      悬停：仅右上角按钮淡入（opacity 0→1）；无暗化蒙层、无标题位移、无底板变化
```

### 2.3 对照：声音 Tab 网格里的音色 `text` 卡（**不受影响**）

```
┌─ .omnimux-assets-grid.omnimux-assets-cloud-grid（MasonryGrid，列数由容器宽度决定，封顶 5 列）─┐
│                                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │
│  │ 双节棍小哥    │  │ 甜美悦悦      │  │ Russell      │  │ 爽快思思·Skye │  ← 高随内容自适应 │
│  │              │  │              │  │              │  │              │                     │
│  │ 普通话男声…   │  │ 甜美女声，适合…│  │ 沉稳男声…     │  │ 爽朗女声…     │                     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘                     │
│   data-kind="text" · 无 thumb · body padding 14px · gap 6px · 正文 opacity 1（默认）          │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

**关键点**：A 的全部 CSS 选择器都以 `.omnimux-assets-cloud-row-cards` 为前缀，只作用于单行流；网格里的 `text` 卡不经过单行流规则，因此**渲染结果与本规格编写前逐像素一致**（AC-C2）。

### 2.4 「声音 → 配音」二级标签（**不受影响**，AC-B5）

```
声音  [ 全部 ] [ 配音 ] [ 背景音 ] [ 音效 ]        ← 二级 Tab（首项固定「全部」）
                    ▲
                    └─ audio/voiceover · 527 行 / 22 页
                       scope 由 use-cloud-assets-feed.js:245 拼为 `audio/voiceover`
                       网格渲染，text 卡正常显示「音色名 + 音色说明」
```

---

## ③ UI 元素与文案字典（Spec — 唯一真源）

### 3.1 元素白名单（未列入者一律视为越权）

#### 3.1.1 单行流「声音」行 · `audio` 卡（`data-kind="audio"`）

| 元素名 | 是否出现 | 逐字文案 / 值 | 来源 Token 或类名 |
|---|---|---|---|
| 行标题 | 出现 | `声音` | `h2.omnimux-assets-cloud-row-title` · `t('cloud.category.audio')` |
| 行副标题 | 出现（**文案不改**） | `爆款卡点配乐、节奏音频与专业环境音效` | `p.omnimux-assets-cloud-row-desc` · `t('cloud.categoryDesc.audio')` |
| 「查看全部」按钮 | 出现 | `查看全部` | `Button.omnimux-assets-cloud-row-view-all` · `t('cloud.category.viewAll')` + `ChevronRightIcon` |
| 左右翻页圆钮 | 条件出现（可滚动时） | 无可见文字 | `IconButton.omnimux-assets-cloud-row-arrow` · 36×36 圆形 |
| 卡片容器 | 出现 | `data-kind="audio"`、`data-theme` ∈ 五色、`data-aspect="horizontal"` | `.omnimux-assets-card.omnimux-assets-cloud-card.omnimux-assets-cloud-card--audio` |
| 卡片底板 | 出现 | 暗调微彩（五色轮换） | `.omnimux-assets-cloud-thumb` · `styles.js:1237-1256` |
| 播放/暂停键 | 出现 | 无可见文字（SVG） | `.omnimux-assets-cloud-play` · 32×32 圆形居中 |
| 悬浮暗化蒙层 | 出现（悬停 `opacity 0→1`） | — | `.omnimux-assets-cloud-card-mask` · `var(--dsw-alias-bg-mask-1)` |
| 右上角「添加到会话」按钮 | 条件出现（悬停/聚焦才淡入） | 见 3.3 | `.omnimux-assets-cloud-actions > .omnimux-assets-cloud-chat` · 28×28 |
| 卡片标题 | 出现（悬停才浮现） | = `asset.name`（数据，非文案） | `.omnimux-assets-card-title` |
| 卡片描述 | 出现（悬停才浮现） | = `asset.description`（数据，非文案） | `.omnimux-assets-cloud-desc` |

#### 3.1.2 单行流 `text` 卡（A 兜底 · **本次核心裁定**）

| 元素名 | 是否出现 | 逐字文案 / 值 | 来源 Token 或类名 |
|---|---|---|---|
| 卡片容器 | 出现 | `data-kind="text"` | `.omnimux-assets-cloud-card--text` |
| **卡片底板** | 出现 | **单一中性表面** | `.omnimux-assets-cloud-card--text { background: var(--dsw-alias-bg-layer-1) }` |
| 卡片边框 | 出现（沿用） | 1px 常规描边 | `var(--dsw-alias-border-l2)`（`.omnimux-assets-card` 既有，不改） |
| 卡片圆角 | 出现（沿用） | `12px` | `.omnimux-assets-card` 既有，不改 |
| **正文容器** | **出现且常驻可见** | `opacity: 1`、`transform: none`、`inset: 0` | `.omnimux-assets-card-body` |
| **卡片标题** | **常驻出现** | = `asset.name`（数据，非文案） | 14px / 600 / line-height 20px / `-webkit-line-clamp: 2` / `padding-right: 32px` / `var(--dsw-alias-label-primary)` |
| **卡片描述** | 条件出现（`asset.description !== ''` 时） | = `asset.description`（数据，非文案） | 12px / 400 / line-height 18px / `-webkit-line-clamp: 4` / `var(--dsw-alias-label-secondary)` / `overflow-wrap: anywhere` |
| 右上角「添加到会话」按钮 | 条件出现（悬停/聚焦才淡入） | 见 3.3 | `.omnimux-assets-cloud-actions > .omnimux-assets-cloud-chat` · 28×28 |
| thumb 容器 | **不出现** | — | `CloudAssetsView.jsx:263` 既有行为，不改 |
| `data-theme` | **不出现（保持空）** | — | **禁止**给 `text` 类扩 `data-theme` |
| 悬浮暗化蒙层 | **不出现** | `display: none` | `.omnimux-assets-cloud-card-mask` 对 `--text` 关闭 |
| 标题位移动画 | **不出现** | `transform: none` | 常驻可见，不做上浮 |
| 占位图 / 类型图标 / 文档图标 | **不出现** | — | 红线 |
| Badge / 胶囊标签 / 副标题 / 营销口号 | **不出现** | — | 红线 |

#### 3.1.3 网格版式（声音 Tab · 配音二级标签）—— **明确不动**

| 元素名 | 状态 | 说明 |
|---|---|---|
| `text` 卡正文 | 常驻可见（现状） | 不经单行流规则，A 不影响 |
| `text` 卡底板 | `var(--dsw-alias-bg-base)`（现状） | `.omnimux-assets-card` 默认，**不改** |
| `text` 卡标题/描述/内边距 | 14px/600/clamp2 · 12px/18px/clamp4 · padding 14px（现状） | **不改** |

### 3.2 裁定 CSS（逐条写死，前端照抄）

> 全部追加在 `plugins/omnimux-assets/src/client/styles.js` 单行流样式段（`styles.js:1591` 之后），紧邻既有 `.omnimux-assets-cloud-row-cards` 规则。

```css
/* ── 单行流里的文本卡：正文就是卡片唯一的内容，因此它常驻可见，不做悬停浮现。
   底板取中性的次级表面（design.md §3.1「次级卡片容器」），不取声音行的五色微彩：
   五色微彩是「本身没有内容的媒体展示面」的豁免（exempt-ui03），文本卡是常规内容卡，
   按 design.md §3.6 保持黑白中性，不引入有色底、不扩 data-theme。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text {
  background: var(--dsw-alias-bg-layer-1);
}

/* 正文铺满整张卡、顶部对齐、常驻可见；不再有底部渐变蒙层。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text .omnimux-assets-card-body {
  position: absolute;
  inset: 0;
  padding: 14px;
  background: none;
  opacity: 1;
  transform: none;
}

/* 标题：与网格版式逐项一致（styles.js:1360-1372）。既有单行流规则用了
   !important 锁死 700 字重与主色，这里必须同样用 !important 才能覆盖。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text .omnimux-assets-card-title {
  font-size: 14px;
  font-weight: 600 !important;
  line-height: 20px;
  color: var(--dsw-alias-label-primary) !important;
  text-shadow: none;
  padding-right: 32px;
  white-space: normal;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* 描述：与网格版式逐项一致（styles.js:1373-1377），行数上限 4 行。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text .omnimux-assets-cloud-desc {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary) !important;
  text-shadow: none;
  white-space: normal;
  overflow-wrap: anywhere;
  text-overflow: clip;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}

/* 文本卡没有画面可暗化：暗化蒙层只会压暗卡片唯一的内容、拉低对比度，
   且不提供任何可供性（卡片本身整块可点）。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text .omnimux-assets-cloud-card-mask {
  display: none;
}

/* 常驻可见 → 悬停不改变正文位置与透明度；悬停只让右上角按钮淡入。 */
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text:hover .omnimux-assets-card-body,
.omnimux-assets-cloud-row-cards .omnimux-assets-cloud-card--text:focus-within .omnimux-assets-card-body {
  opacity: 1;
  transform: none;
}
```

**实现注意（必读）**：

1. `font-weight` 与 `color` **必须带 `!important`** —— 既有 `styles.js:1568-1580` 已用 `!important` 锁死 `font-weight: 700` 与 `label-primary`，不叠加 `!important` 无法覆盖。
2. **无需改任何 JS**：`CloudAssetCard` 已对 `text` 类无条件渲染 `.omnimux-assets-card-body`（`CloudAssetsView.jsx:296-307`），且 `description !== ''` 时渲染描述（同段 304 行）。A 是纯 CSS 修复，`data-theme` 保持 `undefined`。
3. `.omnimux-assets-card-body` 既有 `pointer-events: none`（`styles.js:1559`）**必须保留**：整卡 `onClick` 与正文 `role="button"` 走同一个 `openPreview`，保留穿透可避免重复触发。
4. 目录实测：全库 18904 行中 **0 行同时为空名空描述**，故「正文常驻可见」即可保证 AC-A1 成立。

### 3.3 文案字典（逐字锁定）

#### 中文（zh）

| 键 / 位置 | 逐字文案 | 可见性 |
|---|---|---|
| `cloud.category.audio` | `声音` | 常驻 |
| `cloud.categoryDesc.audio` | `爆款卡点配乐、节奏音频与专业环境音效` | 常驻 |
| `cloud.category.viewAll` | `查看全部` | 常驻 |
| `card.scrollLeft` | `向左滚动` | 仅 aria-label |
| `card.scrollRight` | `向右滚动` | 仅 aria-label |
| `cloud.action.play` | `试听` | 仅 aria-label（`${asset.name} · 试听`） |
| `cloud.action.pause` | `停止` | 仅 aria-label（`${asset.name} · 停止`） |
| `card.view` | `查看详情` | 仅 aria-label（`${asset.name} · 查看详情`） |
| `card.addToConversation` | `添加到会话` | aria-label + title，悬停/聚焦时可见 |
| `card.addedToConversation` | `已添加` | aria-label + title，点击后 1.8s 内 |

#### 英文（en）—— 同结构，仅作对照，本次不改

| 键 | 逐字文案 |
|---|---|
| `cloud.category.audio` | `Audio` |
| `cloud.categoryDesc.audio` | `BGM beats, rhythmic audio, and sound effects` |
| `cloud.category.viewAll` | `View all` |
| `card.view` | `View Details` |
| `card.addToConversation` | `Add to Chat` |
| `card.addedToConversation` | `Added` |

#### 卡片标题与描述（数据，非文案）

卡片标题 = `asset.name`，卡片描述 = `asset.description`，**逐字取自云端目录**，前端不得改写、截断成新句子或拼接后缀（`title` 属性原样透出）。示例（`audio/bgm/page-0000.json`）：标题 `apple x supercut`，描述 `短视频卡点配乐 · 0:15`。

### 3.4 本次新增文案

> **本次新增文案：0 条。**

「声音」行副标题 `爆款卡点配乐、节奏音频与专业环境音效` **不改** —— 该文案本就在描述 BGM + 音效；经 B 收敛抽样后，行内容第一次与它的承诺一致。全部可见文案（含 hover 态与 aria-label）均来自既有 `locales.js` 键，**不新增键、不改键值、不新增任何可见字符串**。

### 3.5 越权红线（一律 REJECT）

1. 给 `text` 卡加 `data-theme` 或任何有色底板 / 渐变 / 光晕。
2. 给 `text` 卡加 thumb、占位图、类型图标、文档图标、播放键（该卡无可播内容，播放键会是死键）。
3. 给 `text` 卡加 Badge、胶囊标签、副标题、营销口号、括号解释（如 `（音色）`、`（无音频）`）。
4. 保留或新增 `text` 卡的悬停暗化蒙层、标题上浮位移。
5. 改写 `cloud.categoryDesc.audio` 或任何 `locales.js` 键值。
6. 在单行流里为 `media`/`audio` 卡引入新文案或新图标。
7. 新增空态 / 提示条 / Toast / 占位插画。

---

## ④ 实施 Plan

### 4.1 改动清单

| # | 文件 | 改动点 | 建议签名 / 选择器 |
|---|---|---|---|
| **P1** | `plugins/omnimux-assets/src/client/styles.js`（追加于 `:1591` 之后，单行流样式段内） | A：新增 3.2 的 5 组选择器，纯 CSS，无 JS 改动 | 见 3.2 逐条 CSS |
| **P2** | `plugins/omnimux-assets/src/client/category-shuffle-cache.js` | B：新增多 scope 合并采样助手（`fetchCategoryRandomSample` 保持原样，其他 5 行不受影响） | `export async function fetchScopesRandomSample(scopes, fetchPageFn, normalizeFn = (x) => x, targetCount = 24, keepFn = () => true)` —— 逐 scope 调 `fetchCategoryRandomSample`，按 `id` 去重合并，`filter(keepFn)` 后再 `shuffleArray` 并 `slice(0, targetCount)` |
| **P3** | `plugins/omnimux-assets/src/client/CloudCategoryRow.jsx:49-62` | B：`audio` 行走双 scope 采样 + kind 过滤；其他分类走原路径 | 新增常量 `const ROW_SAMPLE_SCOPES = { audio: ['audio/bgm', 'audio/sfx'] }`；`const scopes = ROW_SAMPLE_SCOPES[catId]`；`scopes ? fetchScopesRandomSample(scopes, cloudPage, normalizeCloudAsset, 24, (row) => cloudCardKind(row) === 'audio') : fetchCategoryRandomSample(catId, cloudPage, normalizeCloudAsset, 24)`。导入 `cloudCardKind`（现仅导入 `normalizeCloudAsset`）。**`globalShuffleCache` 仍以 `catId`（`'audio'`）为键**，缓存与刷新语义不变 |
| **P4** | `plugins/omnimux-assets/src/client/category-row-layout.e2e.test.js` | 新增 `text` 卡断言（不动既有 `:135,139`） | 夹具补一张 `data-kind="text"` 卡；断言 body `opacity === '1'`、`transform === 'none'`、mask `display === 'none'` |
| **P5** | `plugins/omnimux-assets/src/client/CloudCategoryRow.test.js` | 新增 B 的调用参数断言 | `assert.match(rowJsx, /audio\/bgm/)`、`/audio\/sfx/`、`/cloudCardKind\(row\) === 'audio'/` |
| **P6** | `plugins/omnimux-assets/src/client/category-shuffle-cache.test.js` | 新增 `fetchScopesRandomSample` 单测 | 覆盖：两 scope 合并去重、`keepFn` 过滤、`targetCount` 截断、单 scope 失败容错 |

**B 的范围裁定（唯一真源）**：抽样范围 = **`audio/bgm` + `audio/sfx` 两个二级 scope**，再按 `cloudCardKind(row) === 'audio'` 客户端过滤。

- **不采用**「在 `audio` 全量 scope 内按 `cloudCardKind === 'audio'` 过滤」：可播放行只占 20.5%，且集中在 `bgm` 页内；`audio` 全量的 1~2 页随机采样在多数落点上只能得到 0~3 张可播放行 → 行仍然近乎空白，无法达成目标。
- 路由可行性**已确认**：`http-routes.js:94-109` 的 `resolveCatalogPagePath` 支持 `<category>/[<sub_category>/]page-NNNN.json`，`use-cloud-assets-feed.js:245` 已用同一路径形态服务二级标签（`audio/voiceover`）。目录实测存在 `audio/bgm/`（5 页）与 `audio/sfx/`（1 页）。
- **不足 24 张时的行为**：**接受少卡，不补页、不回退到 `audio` 全量**（补页会改 `fetchCategoryRandomSample` 的采样策略、波及另外 5 行，超出范围；回退会把本缺陷重新引回）。当前目录下 `bgm`(108) + `sfx`(5) 的候选池稳定 ≥28 张，**24 张恒成立**；若未来目录收缩至极小，则渲染实际条数，**绝不用占位卡补位**。
- **两个 scope 均拉取失败时**：沿用现状静默行为（该行不渲染卡片），不新增错误文案。

### 4.2 测试与证据清单

| 层级 | 命令 / 动作 | 断言 |
|---|---|---|
| 单测 | `pnpm --filter omnimux-assets test` | AC-A2/A3/A4、AC-B4、AC-C1；P4/P5/P6 新增用例全绿 |
| 静态门禁 | `pnpm verify:stages` | Stage 合同不漂移 |
| 样式 DOM 探针 | `category-row-layout.e2e.test.js`（含 P4 扩展） | AC-A2/A3/A4 通过，且既有 `:135`（media body `opacity '0'`）、`:139`（mask `opacity '0'`）保持绿 → AC-A6 |
| 真实浏览器（隔离 worktree Web） | `pnpm verify:app`（`node scripts/worktree-app-qa.mjs`，动态端口、自清理） | AC-A1/A5、AC-B1/B2/B3/B5、AC-C2；保留截图 + 结构化报告 |
| 证据归属 | `.workbuddy/evidence/app-qa/<runId>/` | 报告需含 base/head SHA、dirty 状态、端口与 URL、逐项 Given/When/Then、可解码截图 |

**证据口径**（`docs/contracts/plugin-qa.md`）：本改动属 **Client / Stage** 变更面，合并前需相关组件/行为测试与静态 Stage 检查 + 独立评审；Agent 侧验收为**本任务隔离 worktree 内的真实浏览器 Web 验证**。**Dev 45120 真机验收归人工**，Agent 不得据此出证据、不得等待或阻塞。

#### 4.2.1 规格预验证（出规格前已用真实 Chrome 跑通，非替代前端测试）

用仓库既有夹具 `scripts/test-fixtures/style-dom-probe.mjs`（headless Chrome + `ASSETS_CSS` 真实样式表）对 ③-3.2 的候选 CSS 做过一次预演，结论：**全部断言通过**（临时夹具已删除，工作树零残留）。该预演只证明 CSS 裁定的可行性，**不替代** 4.2 中前端应补的 P4/P5/P6 测试与真实浏览器验收。

| 检查 | 修复前 | 修复后 |
|---|---|---|
| 文本卡几何 | `300px × 169px` | `300px × 169px`（不变） |
| 正文 `opacity`（缺陷点） | `0` | `1` ✅ |
| 正文 `transform` | `translateY(8px)` 初值 | `none` ✅ |
| 正文铺满卡片 | 底部锚定 | `position: absolute` + `inset: 0`，`padding: 14px` ✅ |
| 正文底部渐变蒙层 | 有 | `none` ✅ |
| 正文 `pointer-events` 穿透 | `none` | `none`（保留） ✅ |
| 标题字重（关键风险点） | `700`（被 `!important` 锁死） | `600` ✅ —— 证明 `!important` 叠加必要且有效 |
| 标题 `14px / 20px / clamp 2 / padding-right 32px / text-shadow none` | — | 全部命中 ✅ |
| 描述 `12px / 18px / clamp 4 / white-space normal / text-shadow none` | — | 全部命中 ✅ |
| 悬停暗化蒙层 `display` | `block` | `none` ✅ |
| **AC-A6 反向锁定** | `media`/`audio` 正文 `opacity 0`、遮罩 `opacity 0`、遮罩 `display block` | **完全不变** ✅ |
| `media` 卡标题字重 / 描述字号 | `700` / `11px` | `700` / `11px`（不变） ✅ |

### 4.3 依赖与风险

| 风险 | 等级 | 处置 |
|---|---|---|
| 既有单行流规则用 `!important` 锁死标题字重与颜色 | 中 | 3.2 已对 `font-weight`/`color` 叠加 `!important`；实现时逐条对齐，勿自行降级 |
| `audio/bgm` 内有 1 行 `media_type:"video"`（`audio-bgm-1f565b029b3a`）会被判为 `media` | 低 | 由 `keepFn`（`cloudCardKind === 'audio'`）在截断前过滤掉，AC-B1 因此可保证 100% |
| 过滤发生在 `slice` 之前还是之后 | 中 | **必须在 `slice` 之前**（P2 已规定顺序：去重 → `keepFn` → `shuffle` → `slice`），否则 24 张偶发变 23 张，AC-B3 会抖动 |
| 远程网关 base 是否同样服务 `audio/bgm/page-NNNN.json` | 低 | 本地 Host 已确认；远程网关由既有 `audio/voiceover` 二级标签路径间接证明 —— **待前端实测确认**（网络面板确认一次） |
| `fetchScopesRandomSample` 被误用于其他分类行 | 低 | 由 `ROW_SAMPLE_SCOPES` 白名单限定，仅 `audio` 命中；AC-C1 锁定 |
| 深浅双主题下 `bg-layer-1` 底板与正文对比度 | 中 | 目标：正文 ≥ 4.5:1（WCAG AA，design.md §2.6）。`--dsw-alias-bg-layer-1` 为透明白/浅灰叠色，理论上安全，但**需实测取证**（AC-C2 截图含双主题）—— 待前端实测确认 |

**明确不涉及的依赖**：不改 `cloudCardKind()`、不改 `cloud-catalog/**`、不改 `locales.js`、不改网格与瀑布流（`masonry*` / `grid-columns.js`）、不改 Host 路由（`http-routes.js`）。

### 4.4 给前端（裴像素）的一句话交接

> 只需两件事：在 `styles.js` 单行流段追加 ③-3.2 那 5 组选择器，让 `--text` 卡在单行流里常驻显示中性底正文（`font-weight`/`color` 记得带 `!important`，**不要**碰 `data-theme`、thumb 和 `media`/`audio` 卡）；再把 `CloudCategoryRow.jsx` 里 `audio` 那一行的采样换成 `audio/bgm` + `audio/sfx` 双 scope 并在 `slice` 前按 `cloudCardKind === 'audio'` 过滤 —— 副标题一个字都不用改，其他五行、网格版式、云端目录数据全部不动。

---

## 签发

- **PM_SIGN_OFF**：规格签发 —— 元素白名单 100% 锁定，本次新增文案 **0 条**，零徽章 / 零装饰图标 / 零副标题 / 零括号废话。
- **待前端实测确认（3 项，未写成已定论）**：① 远程网关 base 是否同路径服务 `audio/bgm/page-*.json`；② `bgm` 那 1 张 `video` 行被过滤后的实际采样条数是否稳定 24；③ 深浅双主题下中性底板与正文的实测对比度。
