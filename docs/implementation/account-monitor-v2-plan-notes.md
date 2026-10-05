# 账号监控 v2 · 票外实现参考（#3110–#3114）

> **这份文档是什么**：架构师写给实现者的 HOW。它不是规格、不是票面、不具验收权威。
> 票面（GitHub #3110–#3114）只写端到端行为与验收；**规格**（`.worktrees/account-monitor-v2-prototype/docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md`，下称「规格」）与**原型**（`.worktrees/account-monitor-v2-prototype/docs/prototypes/account-monitor-v2-prototype.html`，PM_SIGN_OFF: PASS）是行为与文案的唯一真源。
> 三者冲突时：**规格 > 票面 > 本文**。本文只补文件落点、复用路径、判据与顺序。
>
> **落盘位置说明**：本文按指示拟落于主检出 `docs/implementation/account-monitor-v2-plan-notes.md`，但该路径被仓库守卫 `scripts/guard-worktree.mjs` 硬拦（`docs/` 属 `PROTECTED_DIR_PREFIXES`，且新建未跟踪文件命中 `untracked-protected-scope`）。工作树目录在该守卫里完全豁免（`worktree-isolated`），故先落在本工作树同一相对路径下；升级到主干路径需走 §10.1 的两条合法路径之一。

**交付范围约束**：本文只新增这一个文件，未改动任何源码、规格与票面。

---

## 0. 一句话结论（先看这 6 条）

1. **瀑布流不新写第三套**：账号监控只加一层薄适配（比例解析 + 卡身高度），贪心分列调用共享核心 `distributeColumns`。
2. **卡片组件按方案 A 分叉**：新写监控专用卡片，灵感库与资产库零改动。代价是两个组件会漂移，缓解靠共享 token 与共享比例解析，形态分支只留在卡片组件内部。
3. **`--dsw-specific-media-*` 与 `--dsw-specific-velocity-*` 两族 token 目前只存在于原型，产品代码里没有**。这是 #3110 的前置预重构，必须先补，否则规格 §9.1/§9.2 的全部媒体与胶囊样式会静默回落。
4. **`consecutive_failures` 已经在持久化、也已经上 E1 线**，不需要新增 Host 字段；需要补的是契约固化与测试锁定。「四态判据」落在 Client 一个纯函数里，Host 只报事实。
5. **`buildPostRow` 是全仓库唯一持久化白名单**，任何新字段必须同时进它、进 `updatePost` 路径的断言、进 `rival-accounts-store.test.js`——否则「写入成功、读回为空」的老 bug 会第三次发生。
6. **最该先做的是 #3110**，它是 #3113/#3114 的地基，也是唯一一处结构风险；最容易踩坑的不是瀑布流算法，而是 **DOM 顺序**（见 §2.5）。

---

## 1. 现状事实清单（已核对，不要再调研）

### 1.1 共享瀑布流核心

| 文件 | 角色 | 关键导出 |
|---|---|---|
| `plugins/omnimux/src/client/components/library-flow/masonry-layout.js` | 共享核心，纯函数、零 DOM | `DEFAULT_ASPECT_RATIO`(9/16)、`CARD_CHROME_RATIO`(0.15)、`cardRatioOf(card)`、`cardHeightOf(ratio)`、`distributeColumns(items, columns, ratioOf)`、`columnsForWidth(w, opts)` |
| `plugins/omnimux/src/client/components/library-flow/useFlowColumns.js` | 共享列数监听 | `useFlowColumns({ defaultColumns, minColWidth, maxCols, minCols, gap })` → `[containerRef, columns]`，无 `ResizeObserver` 时降级为 `defaultColumns` |
| `plugins/omnimux-assets/src/client/masonry.js` | **已有的薄适配层范本** | `MASONRY_DEFAULT_RATIO`、`MASONRY_AUDIO_RATIO`、`MASONRY_CHROME`、`coverRatioOf`、`cardHeightOf`、`distributeColumns`、`columnHeights`、`columnIndexById` |

资产层的接法是本文要照抄的范式，三点值得注意：

- 它 `import { distributeColumns as distributeColumnsCore, DEFAULT_ASPECT_RATIO }`，**只包一层**，没有复制贪心算法。
- 它**自己**定义 `cardHeightOf`（`1/ratio + MASONRY_CHROME`），因为「卡身附加高度」是各 lane 自己的事；核心的 `CARD_CHROME_RATIO = 0.15` 只服务灵感库。
- 它把「核心不认识的比例」变成常量（`MASONRY_AUDIO_RATIO = 260/112`，按最小列宽反解纯语音色块），**没有去改 `cardRatioOf`**。

### 1.2 客户端现状（账号监控）

| 文件 | 现状职责 | 本批是否动 |
|---|---|---|
| `plugins/omnimux-inspiration/src/client/RivalFeedGrid.jsx` | 渲染 `.omnimux-inspiration-grid` + 复用 `InspirationCoverCard`；四种空态 | 大改（#3110） |
| `plugins/omnimux-inspiration/src/client/RivalAccountsPanel.jsx` | 内容区收口：导入弹窗、详情弹窗、立即复刻、`injectRivalStyles()` | 改（#3114 挂操作栏回调） |
| `plugins/omnimux-inspiration/src/client/InspirationSection.jsx` | 外壳：三 Tab、顶部气泡、`useRivalFeed` 挂载点、导入成功收口 | 改（#3111 状态条、#3112 进度轮询） |
| `plugins/omnimux-inspiration/src/client/RivalAccountFilter.jsx` | D1 账号筛选 Popover，已用 `toAccountFilterRow` / `rivalSelectionSummary` | 改（#3111 四态与原因行） |
| `plugins/omnimux-inspiration/src/client/rival-filter.js` | 纯规则：选择集 + `toRivalCardRow` + `toRivalPost` | 改（映射扩字段） |
| `plugins/omnimux-inspiration/src/client/use-rival-feed.js` | Tab 的唯一状态源，**刻意无定时器** | 改（#3112 受控轮询；#3113 排序键） |
| `plugins/omnimux-inspiration/src/client/rival-api.js` | 浏览器侧 HTTP 包装，全部过 `authGuard(quotaGuard(...))` | 改（#3114 新端点） |
| `plugins/omnimux-inspiration/src/client/rival-styles.js` | 账号监控专用 CSS（`injectRivalStyles()`，仅面板挂载时注入） | 大改（新卡片与瀑布流样式） |
| `plugins/omnimux-inspiration/src/client/styles.js` | 插件全局 CSS（含 `.omnimux-inspiration-grid`） | **不动**（灵感库/资产库网格必须字节不变） |
| `plugins/omnimux-inspiration/src/client/InspirationCoverCard.jsx` | 共用卡片（平台角标、播放遮罩、两个 CTA、导入状态） | **不动**（方案 A） |

### 1.3 Host 现状

| 文件 | 与本次相关的既有能力 |
|---|---|
| `plugins/omnimux-inspiration/src/rival/constants.js` | `REFRESH_STATES`、`BACKOFF_MINUTES = [5,15,60]`、`LIMIT_CALLS_PER_ACCOUNT_CYCLE = 2`、`VIEWS_HISTORY_MAX = 30`、`TICK_INTERVAL_MS = 60_000`、`CLIENT_POLL_INTERVAL_MS = 2_500`、`RIVAL_ERROR_CODES` |
| `plugins/omnimux-inspiration/src/rival/rival-accounts-store.js` | `buildAccountRow`（含 `consecutive_failures`）、`buildPostRow`（持久化白名单）、`updatePost`、`updateAccount`、`reserve`/`canReserve` |
| `plugins/omnimux-inspiration/src/rival/rival-refresh.js` | `enqueue`（预算→限流→`queued`→`drain()` 同步启动）、`tick()`、`onFailure`（退避序列用尽 → `error`） |
| `plugins/omnimux-inspiration/src/rival/rival-accounts-service.js` | `importAccount`（已 `mode:'first'` 入队）、`listAccounts`（`withSummary` 展开整行）、`listFeed`（E15） |
| `plugins/omnimux-inspiration/src/rival/rival-feed.js` | `toFeedRow` / `mergeAccountPosts` / `sortFeedRows`（纯函数，排序与分页的唯一实现） |
| `plugins/omnimux-inspiration/src/rival/rival-routes.js` | E1–E15 的 dispatcher（只做协议适配） |
| `plugins/omnimux-inspiration/src/client/rival-add-to-chat.js` | `addRivalPostToSession(post, account, io)`：附件挂载 + `ensureRivalPostMedia` + `revealConversation` |

### 1.4 已确认的缺口

| 缺口 | 影响票 | 说明 |
|---|---|---|
| 卡片只认 9:16 | #3110 | `InspirationCoverCard` 硬编码 `aspectRatio="9:16"`（`MediaCard` prop） |
| 无 `--dsw-specific-media-*` / `--dsw-specific-velocity-*` token | #3110/#3113 | 只在原型 `<style>` 里定义 |
| 无「无媒体」卡的高度模型 | #3110 | 核心按 lane 推比例，没有「纯文本卡」概念 |
| 无增速字段 | #3113 | `views_history` 已够推导，无需新采集 |
| 无互动/处理状态持久化 | #3114 | 只有 `inspiration_id` / `in_library` 表达「转成灵感」 |
| 客户端不使用 `poll_interval_ms` | #3112 | E1 的 `config_summary.poll_interval_ms` 已下发，无人消费 |

---

## 2. #3110 的复用路径（最大的一张，也是地基）

### 2.1 新增文件：账号监控的薄适配层

**新增** `plugins/omnimux-inspiration/src/client/rival-masonry.js`（纯函数，零 DOM，可 Node 单测）。

职责边界，与资产层一一对应：

```
import { distributeColumns as distributeColumnsCore, columnsForWidth as columnsForWidthCore }
  from '../../../omnimux/src/client/components/library-flow/masonry-layout.js'

export const RIVAL_MIN_COL_WIDTH = 220     // 规格 §9.3
export const RIVAL_GAP = 16
export const RIVAL_MIN_CARD_HEIGHT = 144   // 规格 §9.3 所有卡片最小高度
export const RIVAL_DEFAULT_IMAGE_RATIO = 4 / 5

export function rivalColumnsForWidth(containerWidth)   // 包 columnsForWidthCore
export function rivalRatioOf(card, columnWidth)        // 比例解析（本文档的核心）
export function rivalCardHeightOf(ratio)               // 1/ratio + 卡身，卡身按类型
export function rivalPlacements(cards, columns, columnWidth)  // Map<id, {col, top, height}>
```

- `rivalColumnsForWidth(W)` 直接传 `{ minColWidth: 220, gap: 16, minCols: 2, maxCols: 6 }`。核心公式是 `floor((W + gap) / (minColWidth + gap))`，代入即 `floor((W+16)/236)`，与规格 §9.3 的 `n = max(2, min(6, floor((W+16)/236)))` **逐字等价**。断点表（<692→2、692–927→3、928–1163→4、1164–1399→5、≥1400→6）因此不需要手写。
- `rivalPlacements` 内部只调 `distributeColumnsCore(cards, columns, ratioOf)` 拿到分桶，再按桶内顺序累加高度算出每张卡的 `top`。**贪心决策本身绝不重写**；累加高度是渲染所需的纯几何，属于适配层。
- 列数监听复用 `useFlowColumns`（`plugins/omnimux/src/client/components/library-flow/useFlowColumns.js`），传 `{ defaultColumns: 3, minColWidth: 220, gap: 16, minCols: 2, maxCols: 6 }`。

### 2.2 五种内容类型 → 比例的映射

核心 `cardRatioOf` 认识的只有：显式宽高、分辨率串、`trending`/`inspiration`→9:16、`assets`/`products`→3:4、`featured`→16:10、`skills`→1:1。账号监控需要的 **4:5** 与 **无媒体** 它不认识——这正是薄适配层的存在理由。

| `type` | 媒体比例 | `rivalRatioOf` 的取值 | 备注 |
|---|---|---|---|
| `short-video` | 9:16 | `9 / 16` | 常量，不读数据 |
| `long-video` | 16:9 | `16 / 9` | 常量 |
| `image` | 原图比例，限制在 4:5（最高）到 1.91:1（最宽） | `clamp(row.ratio ?? 4/5, 1/1.91, 4/5)` | `ratio` 缺失 → 4:5；超出区间 → 裁切到边界 |
| `text` | 无媒体 | **等效比例** `columnWidth / 估算高度` | 见 2.3，是核心完全没有的情况 |
| `text-media` | 视频 16:9；图片同上 | `16 / 9` 或 `clamp(row.ratio, 1/1.91, 4/5)` | 媒体内嵌、左右各缩进 12px，高度要按内嵌宽度算 |

**实现口径（三条硬要求）**：

1. **比例必须来自数据，不能来自 DOM**。规格 §9.3 要求「媒体区高度在图片加载前就按数据里的比例占位」；任何 `naturalWidth` 测量都会造成加载后重排，直接违反 V7/V3。
2. **`image` 的 `ratio` 字段要落进数据链**：E15 的 `toFeedRow` 目前不输出 `ratio`。需要在 `plugins/omnimux-inspiration/src/rival/rival-feed.js` 的 `toFeedRow` 增加一个透传（`ratio: Number.isFinite(post?.ratio) ? post.ratio : null`），并在 `buildPostRow` 里持久化 `ratio`（与 `duration` 同级、同样是 `nullableNumber`）。**这是 #3110 唯一需要动 Host 的地方**，且必须按 §4.2 的白名单纪律一起改。
3. **`type` 字段已在线上**（`toFeedRow` 输出 `type`，`buildPostRow` 持久化 `type`），不需要新增。

### 2.3 无媒体卡的高度模型（核心不认识的第二件事）

核心的接口是「给一张卡 → 给一个比例」，纯文本卡没有媒体，必须**反解等效比例**：`ratio = columnWidth / estimatedHeightPx`。资产层对纯语音色块用的就是这个手法（`MASONRY_AUDIO_RATIO = 260/112`）。

按规格 §9.3 的高度表反推估算：

```
text 卡高度 = 内边距(12*2) + (有胶囊 ? 胶囊行 28 + 间距 8 : 0) + 正文行数 * 20
             正文行数 = clamp(ceil(charCount / charsPerLine), 1, 8)
             charsPerLine ≈ floor((columnWidth - 24) / 14)      // 14px 正文，中文按 1 字宽计
             结果与 RIVAL_MIN_CARD_HEIGHT 取 max

text-media 卡高度 = 内边距 + 胶囊行 28 + 间距 8 + 3 行 * 20 + 间距 8
                    + (columnWidth - 24) / mediaRatio          // 内嵌媒体宽 = 列宽 - 24
```

自检（列宽 220px，`charsPerLine ≈ 14`）：

- 规格 §9.4 的 #11（134 字）：10 行 → 截到 8 行 → `24 + 36 + 160 = 220`，等效比例 `220/220 = 1.0`，与「`text` 上限约 220px」一致。
- 规格 §9.4 的 #12（30 字）：3 行 → `24 + 60 = 84` → 取最小 144，等效比例 `220/144 ≈ 1.53`，与「短推文按最小高度 144px」一致。

这两个数应当写成 `rival-masonry.test.js` 的固定断言，作为估算公式的护栏。**允许估算与真实渲染有几像素误差**——分列只需要相对高度正确；但同一批输入的估算必须确定（纯函数、无随机、无 `Date.now()`）。

### 2.4 卡身附加高度

`rivalCardHeightOf(ratio)` 用**自己的**卡身常量，不要用核心的 `CARD_CHROME_RATIO`：

- 媒体类：媒体高度 `1/ratio` 已包含标题区（规格 §9.1 标题在媒体下方、卡底内），因此卡身附加高度就是标题区 + 内边距，按列宽归一 ≈ `(18 * 行数 + 24) / columnWidth`。
- 文本类：`rivalRatioOf` 返回的等效比例已经把全部高度算进去了，卡身附加为 0。

写法上保持「一个函数、一个常量、注释说明数字来源」，与 `plugins/omnimux-assets/src/client/masonry.js` 的 `MASONRY_CHROME = 48 / 260` 同构。

### 2.5 渲染：DOM 顺序是这条票最容易踩的坑

**这是本票唯一的结构性风险，必须在实现前定死。**

- 共享核心返回的是**分桶**（`any[][]`，每列一个数组）。资产层直接按桶渲染（`.omnimux-assets-grid` 是横向 flex，`.omnimux-assets-masonry-col` 每列一个纵向 flex）——资产库没有排名语义，列优先的 DOM 顺序无所谓。
- **账号监控不能照抄这个渲染方式**。规格 §9.3 要求「DOM 顺序必须等于排序顺序，保证 Tab 键顺序和读屏顺序与排名一致」，验收项 V4 会逐张核对 Tab 键顺序。按列渲染会让 DOM 变成列优先，排名语义直接崩掉，而单测（只测 `distributeColumns` 的返回值）**发现不了**。

**采用的方案**：单一扁平列表 + 绝对定位。

```
<div class="omnimux-rival-masonry" style="position:relative; height:{maxColumnHeight}px">
  {cards.map(card => <RivalPostCard style={{ position:'absolute', left: col*(colWidth+gap), top, width: colWidth }} />)}
</div>
```

- `cards.map` 保持排序顺序 → DOM 顺序天然等于排名顺序（V4 通过）。
- 位置来自 `rivalPlacements`，与分列结果同源，不引入第二套几何。
- 容器高度 = 各列累计高度的最大值，避免绝对定位子元素撑不开容器。
- 明确**不使用** CSS `columns` / `column-count`，**不使用** `grid-auto-flow: dense`（票面与规格双重禁止）。

### 2.6 必须补的 token（#3110 的预重构）

规格 §9.1/§9.2 反复引用 `--dsw-specific-media-*` 与 `--dsw-specific-velocity-*`，但全仓库检索确认：**这两族 token 只在原型 HTML 的 `<style>` 里定义，产品代码里一处都没有**。`design.md` §3 也没有它们。

原型中的定义位置：`.worktrees/account-monitor-v2-prototype/docs/prototypes/account-monitor-v2-prototype.html` 第 35–66 行（`--dsw-specific-velocity-hot-*` / `-rising-*`，以及 `--dsw-specific-media-fg* / ink / badge-bg* / pill-bg* / chip-bg / btn-* / avatar-bg / border-* / scrim / overlay / glow-hot`）。

**落点**：新增 `plugins/omnimux-inspiration/src/client/rival-tokens.js`，导出 `RIVAL_TOKENS_CSS`（`:root` 与 `html[data-theme="light"]` 两段，与原型逐字一致）与 `injectRivalTokens()`。

**注入方是外壳而不是面板**：状态条 R3 在 `InspirationSection.jsx` 里渲染，而卡片在 `RivalAccountsPanel.jsx` 里渲染。token 是全局 `:root` 变量，**拥有者只能有一个**——由 `InspirationSection` 在账号监控 Tab 激活时注入一次（与面板挂载顺序解耦，避免首帧缺 token）。

**理由写清楚**：这些 token 的语义是「封面媒体上的文字/角标始终深底白字，亮暗主题共用同一组值」，与 `design.md` §3.6 暗房原则一致，因此**不在 light 主题重定义**——照抄原型即可，不要顺手「改进」成主题变量。

### 2.7 卡片组件分叉（方案 A：只改账号监控）

**决策**：新写 `plugins/omnimux-inspiration/src/client/RivalPostCard.jsx`，`InspirationCoverCard.jsx` 与资产库卡片**零改动**。

**代价（必须写进 PR 描述，让后来者知道这是有意为之）**：

- 两个组件从此可能漂移。共用卡片的原有理由——`RivalFeedGrid.jsx` 顶部注释写着「100% 一致是像素级承诺，只有一张卡片才守得住」——**这条理由在本批被用户明确否决**：v2.1 要求账号监控卡片默认态只留「媒体 / 增速胶囊 / 标题」，而灵感库卡片有平台角标、播放遮罩、CTA、导入状态。继续共用只能靠往共用组件里塞 `variant` 分支，那会让灵感库承担账号监控的回归风险。
- 漂移的具体表现会落在：圆角、内边距、hover 遮罩底色、字体阶梯。

**缓解办法（三条，写进组件顶部注释）**：

1. **共享 token，不共享字面值**：两边的颜色/圆角/间距一律走 `--dsw-alias-*` 与 §2.6 的两族 token，组件里不出现 hex。
2. **共享比例解析**：媒体比例的判定只存在于 `rival-masonry.js`；卡片组件拿到的是已算好的 `ratio`，不自己再判一次 `type`。
3. **形态分支只允许留在卡片组件内部**：`type → 结构` 的映射（标题行数、胶囊行有无、媒体位置）是一张表，写在组件文件里或紧邻的常量里，**不下沉到 `rival-filter.js` 的映射层**——映射层只搬运数据，不表达形态。

**Props 契约（建议形状，保持最小）**：

```
RivalPostCard({ card, t, ratio, columnWidth, onDetail, onReplicate, onDeconstruct, onOpenOriginal, onMarkDone, busy })
```

- `card` 就是 `toRivalCardRow(row)` 的产物（扩字段见 §4.1、§3.1），卡片不直接读 Host 行。
- 不预留任何「装饰字段」：不给 `card` 加 `badge` / `tagline` / `platformIcon` 之类。平台图标只在悬停作者行出现，从 `card.account.platform` 现算。
- 增速胶囊的文字与档位由 `rival-velocity.js` 现算（§3），卡片不缓存。

### 2.8 已处理样式（默认态）的实现要点

规格 §9.2 的「状态裁决」有三处同时生效，且**禁止整卡 `opacity`**：

1. 胶囊中性化：`爆款` 卡的橙红描边与外发光（B5）同时撤掉，描边回 `--dsw-alias-border-l1`。
2. 媒体去色淡出：`filter: grayscale(1)` + `opacity: 0.45`，**只作用在媒体元素本身**（`img` / `video`），不使用 `brightness`。胶囊是媒体之上的独立图层，不能被父级滤镜带下去——所以滤镜挂在 `img` 上，不挂在媒体容器上。
3. 文字降一级：`--dsw-alias-label-primary` → `--dsw-alias-label-secondary`，字号字重不变。

关键约束：**只改颜色和滤镜，不改尺寸**。这条是 V7（悬停/标为已处理不改变任何卡片位置）能过的唯一理由——高度不变 → `rivalPlacements` 结果不变 → 不重排。任何「加个 padding」「换个字号」的顺手改动都会让 V7 挂掉。

---

## 3. #3113 增速推导（阻塞于 #3110）

### 3.1 落点

**新增** `plugins/omnimux-inspiration/src/client/rival-velocity.js`（纯函数）。**放在 client 而不是 rival/**，理由：它只消费 E15 已经下发的 `views_history` 与 `posted_at`，不需要 Host 参与，也不需要新的云端调用；放 client 侧可与卡片同批单测，且不会有人误以为它该触发采集。

同时需要在 E15 的 `toFeedRow` 里透传 `metrics.views_history`（`plugins/omnimux-inspiration/src/rival/rival-feed.js`）——目前 `toFeedRow` **不输出** `views_history`，这是本票唯一的 Host 侧改动，且**零云调用**（只是把已落库的数据搬上线）。

### 3.2 三级降级的判据

```
velocityOf(card, { accountMedianViews, now })
  → { tier: 'measured'|'average'|'relative'|'none', value, label }
```

| 档 | 判据 | 计算 | 胶囊形态 |
|---|---|---|---|
| A · 实测增速 | 存在 ≥2 个**有效**采样点，且**首末采样时间跨度 ≥ 1.5 小时** | 取最近两次采样 `(v2 − v1) / Δh`，再指数平滑（近一次权重 0.7） | `爆款/飙升/观察 {v}/h` 或 `{v}k/h` |
| B · 发布均速 | 采样点 < 2，或时间跨度 < 1.5 小时 | `views / 作品年龄小时数`；作品年龄 < 1 小时或不可解析 → 降 C | `均速 {v}k/h`，中性描边 |
| C · 账号内相对爆发度 | A、B 都不可用 | `views / 该账号历史播放中位数` | `该号 {v}x`，中性描边 |
| none | C 也不可用（中位数为 0 / 无样本） | — | **不渲染胶囊，不留空位** |

**「有效采样点」的定义（必须逐条实现，否则会误判）**：

- `at` 能被 `Date.parse` 解析成有限数，`views` 是有限非负数——任一不满足即丢弃该点。`buildViewsHistory` 已做类型过滤，但**时间可解析性它不管**。
- 按 `at` 升序去重（同一 `at` 只留最后一个），因为 `buildPostRow` 每次刷新都可能追加同一秒的采样。
- **`views` 回退如何处理**：`v2 < v1` 时**丢弃这一对**，不取绝对值、不取 0。理由：播放量回退是平台侧的统计口径修正或删稿，不是「负增长」；把它当 0 会得到「增速 0」并渲染出一个虚假的「观察」档。丢弃后如果**没有其他可用对**，直接降 B 档。
- **`Δh <= 0`**（时钟异常、同一秒两条）同样丢弃该对。

**为什么相对爆发度不能带 `/h`**：`该号 4.2x` 是**同一账号内的横截面比值**（这条的播放量 ÷ 该账号历史播放中位数），它的量纲是「倍数」，不是「每小时播放增量」。`/h` 会把它读成速度，而它其实与时间无关——一条三年前的爆款和老帖的比值都可以是 4.2x。规格 §3.3 的「绝对禁止」栏把这条写死了：**严禁 `k/h` 单位、严禁 `爆款/飙升` 前缀、严禁橙红/琥珀色**。这也是三档降级的核心：只有 A 档是「实时速度」，B 档是「均值」（用 `均速` 前缀自我声明），C 档是「相对量级」（用 `x` 声明）。可信度分层不是配色装饰，是量纲区分。

**中位数来源**：复用 `plugins/omnimux-inspiration/src/rival/rival-potential.js` 的 `median(values)` 与 `computeBaseline(rows)`，不要在 client 侧重写一个中位数。E15 的行里没有账号中位数，需要由 `listFeed` 顺带下发（每行 `account.median_views`，或响应级 `account_baselines` 字典），**两者选一，且只选一**——不要既放行里又放响应级。

### 3.3 分级阈值与排序

- 阈值（`v` = 每小时播放增量）：`> 20000` → `爆款`；`1000–20000` → `飙升`；`200–1000` → `观察`；`< 200` → 不渲染胶囊。
- 档位文字模板与配色逐字取自规格 §3.3，**不要自己算千位缩写规则**：`{v}k/h` 与 `{v}/h` 是两种模板（观察档没有 `k`）。
- **排序「增速最快」**：排序键必须是同一套降级口径下的**可比数值**，否则「有增速的卡」和「没增速的卡」无法同表比较。建议的键：

```
sortKey = tier === 'measured' ? vph
        : tier === 'average'  ? vph * 0.5        // 均值不是瞬时速度，折半降权
        : tier === 'relative' ? accountMedianViews * multiplier * 0.25
        : -1                                     // 无增速排最后
```

  折半与四分之一是**实现决策，不是规格口径**，必须写成常量并注释「这是排序权重，不是展示值」——展示值永远来自 §3.2 的原式，两者不得互相污染。若 PM 后续给出正式权重，只改这一处。
- 排序**在 client 完成**（`use-rival-feed.js` 的 `sort` 分支），因为 E15 的 `sortFeedRows` 只有 `posted_at` / `views` 两种。**不要为了排序去动 `sortFeedRows`**：那是灵感库与账号监控共用的排序实现，加第三个分支会让「账号监控的排序语义」泄漏进共享函数。

### 3.4 稳定性

- 无采样、时钟异常、`views` 回退一律**降级到下一档，不抛错**（票面验收项）。
- `now` 作为参数注入（与 `rival-accounts-store.js` 的 `now` 注入同构），否则单测无法断言 B 档。

---

## 4. #3114 状态持久化与操作栏（阻塞于 #3110）

### 4.1 新增字段的命名与默认值

在 `plugins/omnimux-inspiration/src/rival/rival-accounts-store.js` 的 `buildPostRow` 白名单里新增**两个**字段：

| 字段 | 类型 | 默认值 | 写入方 |
|---|---|---|---|
| `done_at` | `string \| null`（ISO） | `null` | 本票新增的端点（`标为已处理`） |
| `interacted_at` | `string \| null`（ISO） | `null` | **本批没有写入方**（见下） |

命名理由：与既有 `first_seen_at` / `last_seen_at` / `posted_at` 同一后缀家族，`*_at` 表示时间戳；`done_at` 而非 `handled_at` / `processed_at`，因为它对应的字典条目是 `card.action.done` = `已处理`。

**`已复刻` 不新增字段**：它由既有的 `in_library` / `inspiration_id`（E13 写入）派生。新增一个 `replicated_at` 会让「同一事实两个字段」并存，两者必然有一天会不一致。**一事一源**。

**`已互动` 只定义读取契约，不定义写入**：字典要求渲染 `已互动 · {HH:mm}`，这需要时间戳；但本批 5 张票里**没有任何一票负责采集互动**。因此 `interacted_at` 是「为未来的写入方预留的读取位」，本批只做两件事：字段进白名单、卡片在有值时渲染。**严禁**用 `last_seen_at`、`first_seen_at` 等近似字段冒充互动时间——那会在 UI 上说出一个假事实。

**三态优先级**（本批的实现决策，非规格改动）：`done_at` > `in_library` > `interacted_at`。「已处理」是终态，覆盖其余两个；原型演示数据里从不出现双状态，所以这条不会被 PM_SIGN_OFF 的截图覆盖，必须写进测试。

### 4.2 `buildPostRow` 的同步清单（该文件丢过两次状态）

`plugins/omnimux-inspiration/src/rival/rival-accounts-store.js` 顶部注释明确写着：**`buildAccountRow` / `buildPostRow` / `buildConfig` 必须点名每一个持久化字段**，「a field written by a handler that the row builder never copied, so the write "succeeded" and the value never came back」，且「`rival-accounts-store.test.js` asserts that」。

因此 #3114 的字段改动必须**一次改齐四处**，缺一处就会复现老 bug：

1. `buildPostRow` 的返回对象里加 `done_at: nullableText(source.done_at)` 与 `interacted_at: nullableText(source.interacted_at)`。
2. `updatePost(accountId, postId, patch)` 不需要改（它走 `buildPostRow`），但**要有一条断言**：`store.updatePost(id, postId, { done_at: iso })` 之后 `store.findPost(id, postId).done_at === iso`。这条断言就是防止「写成功读回空」的机械门禁。
3. `rival-accounts-store.test.js` 里那条「caller 的多余 key 被丢弃」的用例需要**更新 fixture**：新字段从此是合法 key，不能再用它们当「多余 key」的例子（否则测试会因为字段被正确保留而失败，实现者会误以为门禁拦了自己）。
4. `toRivalCardRow`（`plugins/omnimux-inspiration/src/client/rival-filter.js`）扩两个字段；`toRivalPost` 也扩（`addRivalPostToSession` 的 payload 需要它们做状态一致性）。

同时按 §2.2 的同一纪律给 `ratio` 加白名单项。

### 4.3 端点与客户端

**新增端点**（`plugins/omnimux-inspiration/src/rival/rival-routes.js` 的 dispatcher + `rival-accounts-service.js` 的服务方法 + `plugins/omnimux-inspiration/src/client/rival-api.js` 的包装）：

```
POST /rival-accounts/:id/posts/:postId/done     body: { done: true }
  → 200 { data: { post_id, done_at } }
```

- **幂等**：重复标记返回同一个 `done_at`，不刷新时间戳（第二次点击不该把时间改掉）。取消标记（`done: false`）→ `done_at = null`，本批不提供 UI 入口，但服务端支持，方便回滚与测试。
- 走 `updatePost`，**零云调用**（票面验收项「操作不增加云调用次数」）。这条要在测试里断言 `budget.global_calls` 前后不变，而不是靠 code review。
- 不新增 E 编号：设计文档的端点表 E1–E15 已冻结，这条是 E12/E13 同级的 post 子资源操作，建议作为 **E12 的子操作**在实现时记进设计文档的补充说明（**改设计文档属于规格变更，需另开票或经主理人批准**，本批实现者不要擅自改 `docs/specs/2026-09-12-inspiration-rival-accounts-design.md`）。

**操作栏四个位（悬停层，规格 §9.2）**：

| 位 | 内容 | 落点 |
|---|---|---|
| 1 | `原帖直达` | `window.open(card.source_url)`；`source_url` 已在 `toRivalCardRow` 里。**不要**用 `hostMediaSrc` 处理它——那是本地媒体地址的白名单，原帖是外链 |
| 2 | `AI 拆解` | 复用 `plugins/omnimux-inspiration/src/client/rival-add-to-chat.js` 的 `addRivalPostToSession(post, account, io)`，与「立即复刻」同一条链路；差异只在**进入会话后预填的 prompt 不同**（拆解用既有 `/video-deconstruct` 通路，见 `composer-inject.js`） |
| 3 | `标为已处理` / 状态文字 | 无状态 → 按钮；点击后 → 静态文字 `已处理` + Toast `已标记为已处理`；有状态 → 静态文字（`已互动 · HH:mm` / `已复刻` / `已处理`），**不再提供按钮** |
| 4 | `立即复刻` | 既有 `RivalAccountsPanel.handleReplicate` → `addRivalPostToSession` → 附件挂载 |

- **`addRivalPostToSession` 的签名注意**：`addRivalPostToSession(post, account, io)`，第二个参数是 **account 对象**（它读 `account.id` 去调 `ensureRivalPostMedia(account.id, post.id, kind)`）。当前 `RivalAccountsPanel.jsx` 传的是 `{ id: card.account_id }`——只有 `id` 能工作，`buildRivalAttachmentPayload` 里的 `account.platform` 会拿到 `undefined`。本票顺手补齐：传 `card.account`（`toRivalCardRow` 已经带了完整账号块），让附件 metadata 里的 `platform` 不再是空串。
- **无可用会话**：走既有行为，不新增兜底（`addRivalPostToSession` 会 `revealConversation()` 展开会话列；失败时通过 `onStatus` 回 locale key）。
- **媒体下载不算云调用**：`ensureRivalPostMedia` 走的是 Host 的媒体下载（`plugins/omnimux-inspiration/src/downloader.js` 经 `rival-routes.js` 的 media 分支），**不经过** `plugins/omnimux-inspiration/src/rival/rival-remote.js` 的 `createCostGuard`。因此「操作不增加云调用」这条在实现上是自动成立的——但仍要有断言，因为将来有人可能把媒体下载挪进计量路径。

### 4.4 悬停层的两个结构细节

- **文本卡悬停层底色**：媒体类沿用 `--dsw-specific-media-overlay` 渐变；文本类必须用**不透明**的 `--dsw-alias-bg-elevated`，否则正文和悬停层文字叠在一起。
- **文本卡上沿 20px 渐隐带**：`linear-gradient` 从透明到 `bg-elevated`，**不占布局、不改变高度、不拦截鼠标**（`pointer-events: none`，且不能用 `padding`/`margin` 撑出来）。悬停层**无顶边描边、顶部无圆角**。渐隐带高度等于正文一行行高（20px），规格 §9.2 与 V21 都会核对计算值。

---

## 5. #3112 即时首采与进度承诺

### 5.1 先说清楚：首采**已经**是即时的

`plugins/omnimux-inspiration/src/rival/rival-accounts-service.js` 的 `importAccount` 在写库之后立刻：

```
const queued = scheduler.enqueue({ account_id: account.id, mode: 'first' })
```

而 `enqueue` 内部 `queue.push(...)` 之后**同步调用 `drain()`**（`plugins/omnimux-inspiration/src/rival/rival-refresh.js`），不依赖 60s tick。客户端 `importRivalAccount` 也固定发 `background: true`（`rival-api.js`）。

所以票面验收项「导入成功后立即入队首采，不等下一个定时周期」**在 Host 侧已满足**。本票的实际工作是三件事：把「承诺」表达出来、把「采完自动出现」做出来、把成本与幂等锁死。

### 5.2 与 `queued` 状态、60s tick 的关系

- `enqueue` 会把账号写成 `refresh_state: 'queued'`，`drain()` 随即改 `running`，成功回 `idle`。**这三个状态就是「首采进行中」的唯一信号**，不需要新增 job 概念。
- 60s tick 只负责「`next_auto_refresh_at` 到期的账号」；`importAccount` 写入时 `next_auto_refresh_at = now`，所以**即使首采被预算拒绝**（返回 `job: 'paused'`），下一次 tick 也会捞它。这个既有行为要保留。
- `mode: 'first'` **不受手动限流**：`checkManualCooldown` 只在 `mode === 'manual'` 时生效，`markManual` 同样。因此「导入即首采」不会被 10 分钟冷却拦住——这是既有设计，不要「顺手」改成 `manual`。

### 5.3 成本契约如何不被突破（三条）

1. **一次导入 = 一次 `enqueue` = 一次 `reserve({ scope: 'cycle' })`**，即 2 次云调用，正好等于 `LIMIT_CALLS_PER_ACCOUNT_CYCLE`。`drain()` 里的注释已经写明「The budget was claimed at enqueue time: one claim, one job」——**不要在 job 里再 reserve 一次**，那会双倍记账。
2. **不得新增任何云调用**：进度条、轮询、空态文案全部走本地状态与 E1/E15 的读取，不新增 `user` / `posts` 能力调用。`createCostGuard`（`rival-remote.js`）在第 3 次调用时抛错，这条是硬墙。
3. **重复导入幂等**（`importAccount` 的既有分支，逐条核对不要动）：

   | 情况 | 行为 | 云调用 |
   |---|---|---|
   | 账号已存在，且已有帖子 | `{ existing: true, is_duplicate: true, job: null }` | **0** |
   | 账号已存在，但无帖子且 `force: true` | 重新 `enqueue(mode:'first')` | 2（合理：上次没采到） |
   | 账号已存在，无帖子，`force` 未传 | 返回 `job: null` | 0 |
   | 账号不存在 | `addAccount` → `enqueue` | 2 |

   客户端**不得**在「重复导入」时自行补一次 `refresh` 调用——那会把 0 变成 2，且与「不重复计费」的验收直接冲突。如果 UI 需要「这次导入没花额度」的事实，就用返回体的 `is_duplicate` 判断，不要用请求次数猜。

### 5.4 轮询：唯一需要新写的机制

`plugins/omnimux-inspiration/src/client/use-rival-feed.js` 顶部注释写着「deliberately timer-free: no `setInterval`, no polling, no "retry in a moment" state」。**这条纪律本票要开一个受控的例外**，理由与边界必须写进注释：

- **只在该状态为真时轮询**：E1 返回的账号里存在 `refresh_state === 'queued' || 'running'`，且当前是账号监控 Tab。没有在跑的采集就**一次定时器都不开**（不能「无脑每 2.5s 拉一次」，那会让空闲的 Tab 持续打 Host）。
- **周期取服务端下发值**：E1 的 `config_summary.poll_interval_ms`（= `CLIENT_POLL_INTERVAL_MS = 2500`）**已经在线上但无人消费**。用它，不要在客户端硬编码 2500。这也是 `poll_interval_ms` 这个字段存在的意义。
- **有上限**：沿用文件里已有的 `REQUEST_BUDGET`（40）思路，给轮询单独设一个上限（建议按「承诺时间 / 周期 + 余量」，约 40 次 ≈ 100 秒），到顶后**停止并给出失败提示**，不允许无限转圈（票面验收项「首采失败或超时给出可理解提示与重试入口，不无限转圈」）。
- **判定「完成」**：轮询到「没有 `queued`/`running` 的账号」即停，并触发一次 `load()` 重读第 1 页——**内容自动出现靠的是这次重读，不是靠乐观插入**。`InspirationSection.handleAccountImported` 已经有一次 `reloadRivalFeed()`，那是导入当下的重读（此时还没有内容）；本票补的是「采集结束后的重读」。
- **超时后**：如果该账号变成 `backoff` 或 `error`，走失败提示；`backoff` 还要显示 `冷却中 · X 分钟后恢复`（与 #3111 共用同一判据函数，见 §6）。

### 5.5 空态文案与出口

- 空态三态（规格 §3.5）：`empty.import.*`（一个账号都没有）、`empty.fetching.*`（有账号、正在首采）、`empty.filtered.*`（被筛选排除）。**判据落在 `RivalAccountsPanel.feedEmptyKind`**（已有 `'loading' | 'no-accounts' | 'filtered' | 'no-posts'`），本票只需把 `'no-posts'` 按「是否有账号在 queued/running」拆成 `'fetching'` 与真·空态。
- `empty.fetching.desc` 的 `{n}` 与票面写的「约 1 分钟」要对齐：字典模板是 `首次采集约需 {n} 分钟，完成后内容会自动出现在这里。`，填 `1`。**不要新增文案**，`约 1 分钟` 不是一条字典条目。
- `去逛逛爆款趋势` 出口复用外壳的 Tab 切换（切到 `trend`），不新建页面或弹窗。
- 失败/超时出口复用既有 `EmptyState` 的 `action` 位与顶部气泡（`showToast`），不新增通知条——`RivalAccountsPanel` 的注释里写过「一句『刚刚成功了』的回执不该改变内容区的高度」。

---

## 6. #3111 的 Host 依赖与四态判据

### 6.1 连续失败次数：**已经有了**，要做的是固化

`plugins/omnimux-inspiration/src/rival/rival-accounts-store.js` 的 `buildAccountRow` 第 123 行：`consecutive_failures: finiteNumber(source.consecutive_failures, 0)`。

写入路径（`rival-refresh.js`）：

- 成功 → `onSuccess` 写 `consecutive_failures: 0`。
- 失败 → `onFailure` 写 `failures = (account.consecutive_failures || 0) + 1`；未用尽退避 → `backoff` + 该计数；用尽（`failures > BACKOFF_MINUTES.length`，即 > 3）或身份类 → `error` + 该计数。

上报路径：E1 的 `listAccounts` 用 `withSummary(account)`，函数体是 `{ ...account, ... }`——**整行展开，`consecutive_failures` 与 `error_code` 已经在线**。

所以票面「Host 需新增上报」的真实缺口不是字段，而是：

1. **契约固化**：`withSummary` 的展开是「碰巧」，没有一处写着「E1 必须带 `consecutive_failures` / `error_code` / `next_auto_refresh_at`」。建议在 `plugins/omnimux-inspiration/src/rival/rival-accounts-service.js` 的 `withSummary` 注释里点名这三个字段是**对外契约**，并在 `rival-routes.test.js` 加断言（真实 dispatcher 级别的 E1 响应里这三个字段存在且类型正确）。
2. **客户端消费**：`plugins/omnimux-inspiration/src/client/rival-filter.js` 的 `toAccountFilterRow` 目前不搬这三个字段（只搬 id/nickname/handle/platform/avatarUrl/profileUrl/initial/postCount/checked）。四态与原因行需要它们，**必须在这里扩**，让筛选行成为唯一的数据出口（组件不直接读 Host 行）。

**不建议**新增 `identity_failed: boolean` 之类的派生字段：它会是 `error_code` 的第二份真相，且需要 Host 参与判断，违反「Host 只报事实」。

### 6.2 四态判据：落在 Client，且只有一个函数

**一事一源**：Host 报事实（`refresh_state` / `error_code` / `consecutive_failures` / `next_auto_refresh_at`），**Client 判态**。

理由：判据是纯展示逻辑，Host 不消费它；放 Host 会多一次序列化，且池级计数（`pool.summary` 的五段）本来就要在 Client 聚合——如果 Host 判一次、Client 再判一次，两处必然漂移，而规格 §8.1 的验收项「计数闭合：正常 + 冷却 + 待重导入 + 已停止 = 监控池账号数」会变成两个实现互相打脸。

**落点**：新增 `plugins/omnimux-inspiration/src/client/rival-health.js`（纯函数，无 React），导出：

```
accountHealth(account, now) → 'reimport' | 'stopped' | 'cooling' | 'normal'
coolingMinutesLeft(account, now) → number | null
poolTally(accounts, now) → { total, ok, cooling, reimport, stopped }
stoppedReasonText(account, t) → string | null     // '连续 {n} 次刷新失败'，无 n 时返回 null
```

判据（严格按规格 §8.1 的顺序，先判身份类）：

| 顺序 | 条件 | 结果 |
|---|---|---|
| 1 | `refresh_state === 'error'` 且 `error_code === 'identity-unverified'` | `reimport`（`需要重新导入`） |
| 2 | `refresh_state === 'error'`（其余） | `stopped`（`已停止`） |
| 3 | `refresh_state === 'backoff'` 且 `next_auto_refresh_at` 可解析 | `cooling`（`冷却中 · {n} 分钟后恢复`，`n = ceil(剩余毫秒/60000)`，最小 1） |
| 4 | 其余 | `normal` |

- 身份类判据就是 `error_code === 'identity-unverified'`——`rival-refresh.js` 的 `onFailure` 在身份类失败时把 `error_code` 写成该值，非身份类失败写的是**云端错误码**（如 `cloud-error` / `no-content`）。这就是「`error` 的两个互斥子类」在数据上的落点。
- `n` 未上报（`consecutive_failures` 缺失或非有限数）时：**原因行整行不渲染**，`已停止` 标记仍在，**不显示占位符或 0**（票面验收项）。
- 优先级 `reimport > stopped > cooling > normal` 由上面的顺序天然保证；用 `if/else` 链而不是独立布尔，避免「两个条件同时成立」时出现两个健康态。
- **`paused` 的归属需要一次拍板**：规格 §8.1 的表里 `paused` 一行的「健康态」写的是「不显示（见 N12）」，但 §2.2 R3 又要求四段计数闭合到 `total`。**建议实现取「`paused` 计入 `正常`」**（额度是池级事实，由 `pool.quota` 常驻表达；账号行不新增额度态是 N12 的本意），这样闭合成立、账号行也不出现第五种标记。这条建议请主理人向 PM 确认一次，确认前按「计入正常」实现并留注释。

### 6.3 池级状态条（R3）

- 落点：`plugins/omnimux-inspiration/src/client/RivalPoolStatusBar.jsx`（新组件），挂载在 `InspirationSection.jsx` 的三 Tab 之下、筛选行之上，**仅账号监控 Tab 渲染**。
- 数据源：`useRivalFeed` 已经拉了 `accounts`（E1 全量）。`poolTally(accounts, now)` 现算，不新增请求。
- `pool.quota` 需要「今日剩余刷新额度」——E1 的 `config_summary.limits` 有上限，已用额度在 E9 `/status`（`budget_used`）里。**本票要么用 E9，要么从 E1 补下发**，两者选一并在 PR 里写明；不要既拉 E9 又猜。`pool.freshness` 的 `{n}` 取 `max(last_refresh_at)` 相对当前时间的分钟数，无数据时该段按规格「优先隐藏」。
- 三段文案 `pool.summary` / `pool.quota` / `pool.freshness` 逐字取自规格 §3.1。注意**同一个概念在两个位置用词不同**：状态条写 `待重导入`，账号行写 `需要重新导入`——两处都是逐字锁定，不要「统一」。

### 6.4 刷新按钮的置灰

- 三个置灰条件：冷却中（`filter.refresh` 的手动冷却）、额度耗尽、**筛选集内存在 `已停止` 账号**。
- 后者的文案是 `refresh.stopped`（规格 D4 字典，逐字不变）；点击时弹 D4 Popover 说明原因，**不静默无反应**。
- 「存在已停止账号」的判定必须基于**当前筛选集**，不是全池——所以这个判据要放在能同时看到 `selection` 与 `accounts` 的地方（`InspirationSection`，因为它同时持有 `useRivalFeed` 的 `selection` 与 `accounts`），复用 `selectedAccountIds(allIds, selection)`（`rival-filter.js` 已有）。
- `refresh.confirm.skip` 不改（规格 §8.1 明确：已停止账号在置灰阶段就被拦下，不进跳过计数）。

---

## 7. 逐票落点清单

### #3110 卡片分形与瀑布流（无阻塞 · 地基）

| 文件 | 动作 | 职责边界 |
|---|---|---|
| `plugins/omnimux-inspiration/src/client/rival-tokens.js` | **新增** | 两族 token 的 CSS 常量 + `injectRivalTokens()`；注入方是外壳 |
| `plugins/omnimux-inspiration/src/client/rival-masonry.js` | **新增** | 比例解析、卡身高度、`rivalColumnsForWidth`、`rivalPlacements`；贪心调共享核心 |
| `plugins/omnimux-inspiration/src/client/RivalPostCard.jsx` | **新增** | 监控专用卡片；五形态结构 + 已处理样式；不碰共用卡片 |
| `plugins/omnimux-inspiration/src/client/RivalMasonry.jsx` | **新增**（或并入 `RivalFeedGrid.jsx`） | 容器 + 绝对定位布局 + 空态/骨架；DOM 顺序 = 排序顺序 |
| `plugins/omnimux-inspiration/src/client/RivalFeedGrid.jsx` | 改 | 从「渲染 `InspirationCoverCard` 网格」改为「渲染 `RivalMasonry`」；保留四种空态 |
| `plugins/omnimux-inspiration/src/client/rival-styles.js` | 改 | 新增 `.omnimux-rival-masonry` / 卡片 / 悬停层样式；**不改** `styles.js` 里的 `.omnimux-inspiration-grid` |
| `plugins/omnimux-inspiration/src/client/InspirationSection.jsx` | 改 | 注入 token |
| `plugins/omnimux-inspiration/src/client/rival-filter.js` | 改 | `toRivalCardRow` 透传 `type` / `ratio` / 媒体可用性 |
| `plugins/omnimux-inspiration/src/rival/rival-accounts-store.js` | 改 | `buildPostRow` 白名单加 `ratio` |
| `plugins/omnimux-inspiration/src/rival/rival-feed.js` | 改 | `toFeedRow` 输出 `ratio` |

### #3111 状态条与账号健康态（无阻塞）

| 文件 | 动作 | 职责边界 |
|---|---|---|
| `plugins/omnimux-inspiration/src/client/rival-health.js` | **新增** | 四态判据、冷却分钟数、池级计数、原因行文案（唯一判据源） |
| `plugins/omnimux-inspiration/src/client/RivalPoolStatusBar.jsx` | **新增** | R3 三段文案的渲染 |
| `plugins/omnimux-inspiration/src/client/InspirationSection.jsx` | 改 | 挂状态条；刷新按钮三条件置灰 + D4 Popover |
| `plugins/omnimux-inspiration/src/client/RivalAccountFilter.jsx` | 改 | 账号行四态标记 + 常驻原因行 + 行内 `重试` |
| `plugins/omnimux-inspiration/src/client/rival-filter.js` | 改 | `toAccountFilterRow` 扩 `refresh_state` / `error_code` / `consecutive_failures` / `next_auto_refresh_at` |
| `plugins/omnimux-inspiration/src/client/rival-api.js` | 改（如用 E9） | `fetchRivalStatus()` 包装 |
| `plugins/omnimux-inspiration/src/rival/rival-accounts-service.js` | 改（仅注释+断言） | 点名 E1 的三个契约字段 |

### #3112 即时首采与进度承诺（无阻塞）

| 文件 | 动作 | 职责边界 |
|---|---|---|
| `plugins/omnimux-inspiration/src/client/use-rival-feed.js` | 改 | 受控轮询（条件开启、服务端周期、有上限、结束即停 + 重读） |
| `plugins/omnimux-inspiration/src/client/RivalAccountsPanel.jsx` | 改 | `feedEmptyKind` 增加 `'fetching'`；空态出口 |
| `plugins/omnimux-inspiration/src/client/InspirationSection.jsx` | 改 | 导入成功后启动轮询（与既有 `reloadRivalFeed()` 衔接） |
| `plugins/omnimux-inspiration/src/client/rival-api.js` | 不动 | 首采已由 Host 完成 |

### #3113 增速胶囊与增速排序（阻塞 #3110）

| 文件 | 动作 | 职责边界 |
|---|---|---|
| `plugins/omnimux-inspiration/src/client/rival-velocity.js` | **新增** | 三级降级、阈值、排序键；纯函数，`now` 注入 |
| `plugins/omnimux-inspiration/src/client/RivalPostCard.jsx` | 改 | 右上角胶囊渲染；`< 200` 不渲染 |
| `plugins/omnimux-inspiration/src/client/use-rival-feed.js` | 改 | `sort === 'velocity'` 分支（client 排序） |
| `plugins/omnimux-inspiration/src/client/InspirationSection.jsx` | 改 | 排序下拉加 `增速最快` |
| `plugins/omnimux-inspiration/src/rival/rival-feed.js` | 改 | `toFeedRow` 透传 `metrics.views_history` + 账号中位数 |

### #3114 卡片操作栏（阻塞 #3110）

| 文件 | 动作 | 职责边界 |
|---|---|---|
| `plugins/omnimux-inspiration/src/rival/rival-accounts-store.js` | 改 | `buildPostRow` 加 `done_at` / `interacted_at` |
| `plugins/omnimux-inspiration/src/rival/rival-accounts-service.js` | 改 | `markPostDone(accountId, postId, done)` 服务方法 |
| `plugins/omnimux-inspiration/src/rival/rival-routes.js` | 改 | 新路由分支（`/posts/:postId/done`） |
| `plugins/omnimux-inspiration/src/client/rival-api.js` | 改 | `markRivalPostDone()` 包装（走 `guarded`） |
| `plugins/omnimux-inspiration/src/client/RivalPostCard.jsx` | 改 | 悬停层四操作位 + 文本卡渐隐带 |
| `plugins/omnimux-inspiration/src/client/RivalAccountsPanel.jsx` | 改 | 回调接线；`addRivalPostToSession` 传完整 account |
| `plugins/omnimux-inspiration/src/client/rival-filter.js` | 改 | `toRivalCardRow` / `toRivalPost` 扩状态字段 |
| `plugins/omnimux-inspiration/src/rival/rival-accounts-store.test.js` | 改 | 「多余 key 被丢弃」fixture 更新 + 新字段读回断言 |

---

## 8. 测试接缝

### 8.1 纯函数单测（首选，快且能锁判据）

| 目标 | 建议文件 | 必测用例 |
|---|---|---|
| 比例与布局 | `plugins/omnimux-inspiration/src/client/rival-masonry.test.js` | 五种类型的比例；`image` 的 clamp 边界（>4:5、>1.91:1）；缺 `ratio` 回 4:5；`rivalColumnsForWidth` 的断点（692/927/928/1163/1164/1400）；`rivalPlacements` 的「最短列、相等取最左」逐张复算；**同一批输入的列索引在追加后不变**（追加稳定性）；#11/#12 的等效比例断言 |
| 增速三级降级 | `plugins/omnimux-inspiration/src/client/rival-velocity.test.js` | 跨度 ≥1.5h 走 A；<1.5h 走 B；单点走 B；`views` 回退丢弃该对；`at` 不可解析丢弃该点；同 `at` 去重；`Δh<=0` 丢弃；B 档年龄 <1h 降 C；中位数 0 → `none`；`<200` 不渲染；**C 档文案不含 `/h`**（字符串断言）；平滑权重 0.7 |
| 四态判据 | `plugins/omnimux-inspiration/src/client/rival-health.test.js` | `error` + `identity-unverified` → reimport；`error` + 其他 → stopped；`backoff` → cooling 且分钟数取整；`idle/queued/running` → normal；`paused` 归属（§6.2 决策）；`consecutive_failures` 缺失时 `stoppedReasonText` 返回 `null`；**计数闭合**（四种账号混合 → 四段和 === total） |
| 持久化白名单 | `plugins/omnimux-inspiration/src/rival/rival-accounts-store.test.js` | `buildPostRow` 保留 `done_at`/`interacted_at`/`ratio`；`updatePost` 写入后 `findPost` 读回一致；caller 多余 key 仍被丢弃（换一个真正多余的 key 当 fixture） |
| 排序键 | `rival-velocity.test.js` | `measured > average > relative > none`；同级按 `views` 兜底；无增速排最后 |

### 8.2 组件渲染断言（jsdom，沿用仓库既有做法）

仓库已有 `plugins/omnimux-inspiration/src/client/account-monitor-feed-render.test.js`、`rivals-layout-render.test.js` 等渲染测试范式（构造 fake host state → render → 断言 DOM/文案）。建议：

- `RivalPostCard` 五形态：每种 `type` 断言「默认态只出现媒体/胶囊/标题或正文」，以及**不得出现**平台角标、时长、头像、昵称、时间、匹配度、状态文字、指标行、操作按钮（V12 的机械版）。
- 已处理样式：断言 `img` 的 `style.filter === 'grayscale(1)'`、`style.opacity === '0.45'`，且**卡片根节点**没有 `opacity` 变化（V14）。
- 截断行数：`short-video` 1 / `long-video` 2 / `image` 1 / `text` 8 / `text-media` 3。
- 操作栏第四位：有状态 → 无按钮 + 文字；无状态 → 按钮；点击后变文字 + Toast。
- 状态条文案：三段逐字，含 `待重导入`（不是 `需要重新导入`）。

### 8.3 Host 侧 dispatcher 测试

- `plugins/omnimux-inspiration/src/rival/rival-routes.test.js`：新 `/posts/:postId/done` 的成功/404/幂等；**前后 `budget.global_calls` 不变**（零云调用）。
- 同一文件补 E1 响应里 `consecutive_failures` / `error_code` / `next_auto_refresh_at` 的存在性与类型断言。
- `rival-refresh.test.js`：**不要新增用例**——退避序列与 `error` 的两类失败已有覆盖（该文件已有 `identity-unverified` 与 `consecutive_failures` 的用例）。若发现覆盖不足，补在既有用例里而不是新开一段。

### 8.4 必须用真实浏览器验收的部分

单测与 jsdom 都测不到下面这些，**必须真实浏览器截图**（规格 §9.6 已指定证据文件名，存 `qa-evidence/account-monitor-v2/`）：

| 验收项 | 为什么必须真浏览器 |
|---|---|
| V2/V3/V4 瀑布流落位与 Tab 顺序 | jsdom 无布局，`offsetTop`/`getBoundingClientRect` 全为 0 |
| V5 断点列数与列宽 ≥220px | 需要真实 `ResizeObserver` 与容器宽度 |
| V6 间距/圆角实测值 | `getComputedStyle` 在 jsdom 下不可靠 |
| V7 悬停/标为已处理后坐标不变 | 依赖真实排版与滤镜 |
| V14 媒体淡出、对比度 ≥4.5:1 | 需要真实合成与像素采样（亮暗两套主题） |
| V21 文本卡渐隐带高度 20px、无硬切半行字 | 纯视觉，断言无意义 |
| #3112 首采进度→内容自动出现 | 端到端时序（导入 → queued → running → idle → 重读） |
| #3111 `重试` 后行回正常、`pool.summary` 同步变化 | 端到端状态机 |

**工具口径**：Dev 桌面应用开着 `127.0.0.1:9229` 调试端口（`/json/list` 里取 url 含 `:45120` 的 page），用 Node 原生 WebSocket 发 CDP 指令（`Runtime.evaluate` / `Page.captureScreenshot` / `Input.dispatchMouseEvent`）直接操作真实窗口；或按仓库既有做法用 esbuild 把真实页面组件打成单页（`react`/`react-dom` 必须 alias 到同一份真实路径，`dsh-ui-kit` alias 到 `../personal/dsh-ui-kit/lib/index.js`），否则会出现两份 React。**首页打卡式冒烟（只截 app-home.png）不算验收**。

---

## 9. 风险与顺序建议

### 9.1 顺序

```
预重构（token 落盘）  →  #3110  →  #3113
                              └→  #3114
#3111 ──── 独立，可与 #3110 并行（不同文件、不同组件）
#3112 ──── 独立，但会碰 use-rival-feed.js（与 #3113 冲突，见 9.3）
```

- **最该先做**：#3110。它是 #3113/#3114 的阻塞源，也是唯一一处「结构决定成败」的票（DOM 顺序、比例来源、token 缺失）。
- **可以并行**：#3111 与 #3110 文件重叠极小（`rival-health.js` / `RivalPoolStatusBar.jsx` 是全新的，`InspirationSection.jsx` 是唯一共同点）。若两人并行，**约定 `InspirationSection.jsx` 由 #3111 先改**，#3110 只在其中加一行 token 注入。
- **建议把 §2.6 的 token 落盘做成 #3110 的第一个 commit**，独立可回滚，且让后续所有样式改动有 token 可用。

### 9.2 最容易踩的坑（按危险度排序）

1. **按列渲染导致 DOM 顺序错**（§2.5）。危险在于单测全绿、视觉完全正确，只有 Tab 顺序和读屏顺序是错的。**缓解**：`rival-masonry.test.js` 里断言「渲染出的扁平顺序 === 输入排序顺序」，并在真浏览器里 Tab 走一遍。
2. **新字段没进 `buildPostRow`**（§4.2）。仓库丢过两次状态，`updatePost` 走 `buildPostRow`，所以「写成功、读回空」的表现是「点了标为已处理，刷新就没了」。**缓解**：单测直接断言读回值，而不是断言 `updatePost` 的返回值。
3. **相对爆发度被写成 `/h`**（§3.2）。这是产品红线（规格 §3.3「绝对禁止」）。**缓解**：字符串级断言 `!label.includes('/h')`。
4. **用 DOM 测量推导比例**（§2.2）。会造成图片加载后重排，V7 必挂。**缓解**：`rival-masonry.js` 保持零 DOM 依赖（连 `window` 都不碰），并让 `rival-masonry.test.js` 在纯 Node 下运行通过。
5. **轮询无上限**（§5.4）。`use-rival-feed.js` 的既有纪律是 timer-free；破例必须有条件与上限，否则空闲 Tab 会持续打 Host，且 `REQUEST_BUDGET` 会在用户正常操作时被轮询吃掉。
6. **顺手统一两处文案**（`待重导入` vs `需要重新导入`，§6.3）。两处都是逐字锁定，统一任何一个都是违规。
7. **把 `paused` 当成第五态**（§6.2）。会让计数闭合验收项失败，且违反 N12（账号行不新增额度态）。

### 9.3 冲突面（并行时先说好）

| 文件 | 涉及票 | 建议 |
|---|---|---|
| `plugins/omnimux-inspiration/src/client/use-rival-feed.js` | #3112、#3113 | 串行：先 #3112（轮询），再 #3113（排序分支）。两者改的是不同 callback，但同一文件的依赖数组容易互相踩 |
| `plugins/omnimux-inspiration/src/client/InspirationSection.jsx` | #3110、#3111、#3112、#3113 | 全部会碰。**约定一个拥有者**：建议 #3111 先落地状态条，其余票只追加自己的行 |
| `plugins/omnimux-inspiration/src/client/rival-filter.js` | #3110、#3111、#3114 | 三票都在扩 `toRivalCardRow` / `toAccountFilterRow`；按票拆成三次小提交，避免一次大改 |
| `plugins/omnimux-inspiration/src/rival/rival-accounts-store.js` | #3110、#3114 | 都在 `buildPostRow` 白名单加字段；建议合并为一次「白名单扩展」提交（`ratio` + `done_at` + `interacted_at`），一次性更新测试 fixture |
| `plugins/omnimux-inspiration/src/rival/rival-feed.js` | #3110、#3113 | 都改 `toFeedRow`；同上，合并为一次透传提交 |

### 9.4 值得先做的预重构（已含在 #3110 内）

1. **token 落盘**（§2.6）——不做，规格 §9.1/§9.2 的所有媒体样式静默失效。
2. **`rival-masonry.js` 先于卡片组件**——比例与布局可以先写完并单测，与视觉解耦；这样卡片组件只需要消费 `ratio` 与 `placements`。
3. **`ratio` 进持久化白名单**——数据链先通，视觉才有东西可渲染；且它与 #3114 的字段扩展是同一处改动，合并做省一次 fixture 更新。

---

## 10. 门禁与流程提醒（实现者必读）

### 10.1 本文档自身的落盘路径

- 拟落盘路径 `docs/implementation/account-monitor-v2-plan-notes.md`（主检出）**被仓库守卫 `scripts/guard-worktree.mjs` 硬拦**：
  - `docs/` 在 `PROTECTED_DIR_PREFIXES` 里（`plugins/` / `scripts/` / `docs/` / `research/` / `.github/` / `.agents/`）；
  - 主检出新文件命中 `untracked-protected-scope` → `deny`；**已跟踪文件同样 `deny`**（`tracked-file` 分支），因此主检出的 `docs/` 实质只读。
- 守卫对**独立工作树完全豁免**（`worktree-isolated` → `allow`），所以本文先落在 `.worktrees/account-monitor-v2-prototype/docs/implementation/account-monitor-v2-plan-notes.md`。
- **升级到主干路径的两条合法路径**（任选其一，不要用 `cp`/重定向绕过——那正是守卫要拦的动作）：
  1. 在原型工作树里提交该文件 → 推送分支 → 走 GitHub PR / 合并队列入 `origin/main`；
  2. 由用户明确指示改用其他落点（例如并入既有的 `docs/implementation/*.md` 之一，但那只在文件**已跟踪**时才可行——而 `tracked-file` 分支也是 `deny`，故仍走路径 1）。

### 10.2 其他门禁

1. **新增 `specs/*.md` 或 `*.test.*` 需要先在主检出登记豁免**：豁免文件实际读取的是**会话 cwd（主检出）**的 `.tmp/anti-cheat-exemptions.json`（`process.cwd()`），**不是工作树里的 `.tmp`**。本文档建议的每个新测试文件（`rival-masonry.test.js`、`rival-velocity.test.js`、`rival-health.test.js`）都属 `*.test.*`，**落盘前先登记**，否则 hook 会拦下。登记格式照既有条目：`{ id, filePath, status: "approved", justification }`，`filePath` 建议同时写工作树相对路径与仓库相对路径两条（既有条目就是这么做的）。
2. **规格前置门禁**：本仓 hook 要求「本次任务」内新建或修改 `specs/*.md`，否则禁止改动业务源码。规格（`.worktrees/account-monitor-v2-prototype/docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md`）已存在但**不属于实现工作树**，因此实现者在自己的任务树里仍需要落一份规格（或按既有惯例引用并登记豁免）。**这条请主理人在派工前确认一次**，避免实现者第一步就被拦。
3. **证据同捆**：界面源码提交必须与 `docs/evidence/<任务>/` 的证据同捆；`docs/evidence/*` 被 `.git/info/exclude` 忽略，需要 `git add -f`；hook 在命令执行前判定，因此证据要在**单独一次调用中先暂存**，再执行 commit。
4. **测试文件命名**：新建测试一律用 `.test.js` / `.e2e.test.js`。`plugins/omnimux/scripts/run-tests.mjs` 的 `TEST_GLOBS` 只匹配 `src/**/*.test.js` 与 `src/**/*.test.ts`，**`.test.mjs` 不会被 `pnpm --filter omnimux test` 执行**。
5. **不要改规格与设计文档**：规格、原型、`docs/specs/2026-09-12-inspiration-rival-accounts-design.md` 都是真源。本文档提到的两处需要 PM 拍板的点（`paused` 归属 §6.2、新端点的 E 编号 §4.3）**由主理人走确认流程**，实现者不要自行改规格。
6. **真机截图必须是人眼级复检**：涉及界面改动的票，断言绿灯不等于交付。规格 §9.6 已指定 8 张证据文件名，按它交。
