# 规格：资产库「公共」页签二级分类行上下净空与一级↔二级节奏统一

- **文件**：`specs/assets-public-nav-breathing-parity.spec.md` ｜ **优先级**：P0（用户可见的明显视觉缺陷）｜ **模块**：`plugins/omnimux-assets`（Client / Stage）
- **变更面**：**仅 2 处 CSS 间距声明**（1 条新增 + 1 处改值）。零 DOM 结构、零文案、零图标、零组件增删。
- **取证**：`docs/evidence/public-tab-gap-2026-09-25/README.md` + `probe.mjs`（真实 Chromium 无头 + 真实布局读数）。
- **设计依据**：`design.md`（v2.0，§2.1 几何基准 / §2.2 圆角体系 / §6 开发红线）＋ `docs/contracts/ui-design-guidelines.md`；同类既有间距口径见 `specs/assets-tab-spacing.spec.md`。
- **相邻规格修订**：本规格修订 `specs/assets-tab-spacing.spec.md` AC-2 中「胶囊下方 14px 外滑入遮挡区」的数值口径（改为 20px），理由与副作用见 §6.3。

---

## 1. 目标（Objective）

### 1.1 用户可见缺陷

资产中心顶栏（一级 Tab：`本地` / `公共` / `产品库` / `AI生成`）与其下方二级分类胶囊行（`全部` / `角色` / `场景` / …）之间的纵向净空，**「公共」页签明显大于其余三个页签**；且该差额只在页面未滚动时存在，一旦滚动吸附到位即消失，表现为**净空随滚动跳变**（30px → 14px）。

次要缺陷：**「二级分类行 ↔ 内容」**的净空四页签不一致（三页签 30px / 公共 24px，差 6px）。

### 1.2 两条净空指标的可测口径（唯一判定口径）

| 指标 | 上锚点 | 下锚点 | 说明 |
|---|---|---|---|
| **一级↔二级净空** | 一级 Tab 元素底边（含下划线） | 二级分类行首个胶囊元素顶边 | 分「未滚动（静止）」与「滚动吸附置顶后」两种状态分别读数 |
| **二级↔内容净空** | 二级分类行首个胶囊元素底边 | 内容区首个内容节点顶边（`.omnimux-assets-main` 或 `.omnimux-assets-cloud` 内导航行之后的首个节点） | 静止态读数 |

- 读数一律取 `Math.round(getBoundingClientRect())`（与既有门禁 `tabs-spacing.e2e.test.js`、取证探针同一口径）。
- 「吸附置顶后」定义为把页面滚到吸附栏顶边钉在 `top: 0` 之后的状态（探针用 `scrollTop = 320` 达成）。

### 1.3 已拍板决策（用户已确认，本规格不重新讨论）

1. 修掉「公共」多出来的 16px，四个页签的**一级↔二级净空一致**；
2. 顺带统一**二级↔内容净空**，四页签收敛为同一节奏。

### 1.4 不做什么（Non-Goals）

- 不改任何可见文案、标签文字、图标、元素增删；
- 不做 DOM 结构重排、不做 Token 化 / data 属性重构；
- 不动左右 20px 基准线、`main` 的下内边距、`.omnimux-assets-cloud` 的 `gap` 对其它兄弟元素的作用；
- 不动卡片栅格、滚动吸附契约、资产库其它页签的既有排版。

---

## 2. 根因（已实测定位，不需重查）

两条路径的 DOM 层级不同，而留白被**无条件叠加**：

```
本地 / 产品库 / AI生成（吸附栏路径）              公共（body > main 路径）
──────────────────────────────────────     ──────────────────────────────────────
div.omx-stage-sticky （吸附栏）              div.omx-stage-sticky （吸附栏）
  FilterBar .omnimux-assets-stage-toolbar      FilterBar .omnimux-assets-stage-toolbar
  div.omnimux-assets-local-nav（12/20/14）   div.omnimux-assets-body
div.omnimux-assets-body                        div.omnimux-assets-main（16px 20px） ← 多出的 16px
  div.omnimux-assets-main（16px 20px）           div.omnimux-assets-cloud（flex gap 10px）
                                                   div.omnimux-assets-cloud-nav（12/0/14）
                                                     position: sticky; top: var(--stage-rail-h)
```

1. `.omnimux-assets-local-nav`（`styles.js:57`，`padding: 12px 20px 14px`）与 `.omnimux-assets-cloud-nav`（`styles.js:1017`，`padding: 12px 0 14px`）的上内边距**完全一致**，都不是缺陷点；
2. 差额来自 `.omnimux-assets-main { padding: 16px 20px }`（`styles.js:161`）：三页签的分类行挂在吸附栏内（`AssetsStage.jsx:521-548`），不经过 `main`；公共的分类行由 `CloudAssetsView` 自行渲染（`CloudAssetsView.jsx:663-676`），随视图落在 `AssetsBody > main` 内（`AssetsStage.jsx:285-289`），**白拿一份 16px 上内边距**；
3. 叠加工具栏余量（48px 栏高内 44px 页签体）：三页签 `2 + 12 = 14px`，公共 `2 + 16 + 12 = 30px`；
4. 该 16px 处于正常流中，而公共分类行自带 `position: sticky; top: var(--stage-rail-h)`（`styles.js:1024-1025`）→ 静止时被顶下（30px），滚动到吸附阈值后顶边钉住（14px），**净空随滚动跳变**（实测导航行静止顶边与吸附位相差 16px）；
5. 「二级↔内容」的 6px 是独立小项：三页签 `14（分类行下内边距）+ 16（main 上内边距）= 30px`；公共 `14（分类行下内边距）+ 10（.omnimux-assets-cloud 的 flex gap）= 24px`。

---

## 3. 权威数值（PM 决策，唯一真源）

### 3.1 结论（拍板值，前端不得自行取整或改值）

| 指标 | 权威值 | 允许误差 |
|---|---|---|
| **一级↔二级净空（四页签，静止）** | **14px** | **±0px**（取整后严格相等；取整来源见 §3.2 注 3） |
| **一级↔二级净空（公共，吸附置顶后）** | **14px** | **±0px**，且必须与静止态同值 |
| **二级↔内容净空（四页签）** | **30px** | **±0px** |

### 3.2 取值依据

**14px（一级↔二级）** 由两段构成，且**就是三个页签的已上线值**，因此本次对它**零改动**：

- `12px` = 分类行自身 `padding-top`，落在既有呼吸节奏（4/8/12/16/20/24）上；
- `2px` = 结构余量（吸附栏 48px 高 − 页签体 44px），**不是间距声明**，不参与节奏判定；
- 取 14px 而非 16px 的决策理由：把「多数页签的既有、已验收值」定为标准，修复就只需动「公共」这一条异构路径，另外三个页签的每一个测量值在修复前后逐一不变（见 AC-7），爆炸半径为最小值。若改取 16px，则须同时改 `.omnimux-assets-local-nav` 的 `padding-top`（12→14），会把三个页签的胶囊行整体下移 2px，属无收益的扩大爆炸半径。

**30px（二级↔内容）** 由两段构成：

- `20px` = `.omnimux-assets-cloud-nav` 的 `padding-bottom`（由 14px 改为 20px），**落在节奏上**；
- `10px` = `.omnimux-assets-cloud` 的 flex `gap`，**既有值、本次受保护不改**；
- **注意**：30px 本身不是 4 的倍数，但它是**三个多数页签已上线且已通过验收的下净空值**；本规格把「声明值」锁在节奏内（20px），把「受保护既有权重」保持原样（10px），合成 30px。若要把净空推进到节奏内的 24px，唯一可行杠杆是把 `.omnimux-assets-local-nav` 的下内边距从 14px 砍到 8px —— 那会让三个页签的吸附栏高度由 102px 缩到 96px、栅格整体上移 6px、胶囊吸附态遮挡内缩从 14px 变成 8px（比自身 12px 的上内边距还紧），**爆炸半径从 1 个页签扩到 3 个页签且视觉更紧**，故否决（对照实测见 §3.3）。

> **注 1（节奏与 Token 事实）**：`design.md` v2.0 本体规定的是 32px 控件高基准、8px 圆角体系、8px 行动栏间距等，**未固化独立的间距刻度表**；本组件族引用的「4/8/12/16/20/24 呼吸节奏」见 `specs/assets-tab-spacing.spec.md:5`。本规格因此以「4 的倍数（声明值落在节奏上）＋既有已上线值（不制造新数值）」双重口径裁定。
> **注 2（Token 纪律）**：间距在本仓库 `.js` 样式文件中沿用**字面 px** 写法；`design.md` §1.1 与 §6「严禁做」第 2 条明确禁止自建 `--omx-*` 等平行变量体系，故本次**不得**引入新的间距 Token / CSS 变量（Token 化属 §7 的范围外项）。
> **注 3（±0 的取整来源）**：所有参与布局的量都是整数 CSS px，读数经 `Math.round(getBoundingClientRect())` 取整；亚像素偏差 ≤0.5px 时取整后仍为 14 / 30，不构成失败；**取整后任何 ≥1px 的差值即判 FAIL**。

### 3.3 候选对照（PM 预演实测，同一夹具、同一夹具口径）

夹具：`docs/evidence/public-tab-gap-2026-09-25/probe.mjs` 的同构 DOM（两页签路径各一组，`ASSETS_CSS` 拼接覆盖片段后用 `runStyleDomProbe` 渲染）。

| 方案 | 一级↔二级（三页签 / 公共） | 二级↔内容（三页签 / 公共） | 三页签是否位移 | 吸附栏高 | 胶囊吸附态遮挡内缩 | 结论 |
|---|---|---|---|---|---|---|
| 基线（未修） | 14 / **30→14（跳变）** | 30 / 24 | — | 102 / 48 | 14 / 14 | 缺陷 |
| **采用：公共 `cloud-nav padding-bottom: 20px`** | **14 / 14（不跳变）** | **30 / 30** | **否** | **102 / 48** | 14 / 20 | ✅ 采用 |
| 否决 A：三页签 `local-nav padding-bottom: 8px` | 14 / 14 | 24 / 24 | **是（整体上移 6px）** | **96** / 48 | **8** / 14 | ❌ 爆炸半径扩至 3 页签 |
| 否决 B：三页签 `local-nav padding-bottom: 20px` | 14 / 14 | 36 / 24 | 是 | 108 / 48 | 20 / 14 | ❌ 方向相反，未收敛 |
| 否决 C：公共 `cloud-nav margin-bottom: 6px` | 14 / 14 | 30 / 30 | 否 | 102 / 48 | 14 / 14 | ❌ 同时把「导航行↔错误提示/通知条」的兄弟间距由 10px 变为 16px，越过 §6.2 红线 |

### 3.4 否决记录（存档，勿重开）

- 否决 A / B：见 §3.2，扩大爆炸半径；
- 否决 C：几何上更"完美"（连吸附态遮挡带都能对齐），但代价是**改动兄弟元素之间的间距关系**（`.omnimux-assets-cloud` 的 `gap` 之外再挂一条 margin），与用户拍板的边界「`gap` 对其它兄弟元素的作用必须保持不变」相冲突，且引入第二套并行间距机制；故不采用。其 6px 遮挡带差异作为**已知副作用**显式披露于 §6.3。

---

## 4. 修复方案（精确到声明）

### 4.1 两处改动（`plugins/omnimux-assets/src/client/styles.js`，且仅此两处）

**改动 1 —— 新增：让公共路径自我抵消 `main` 的上内边距**（置于 `.omnimux-assets-main` 声明块 `styles.js:161` 之后）

```css
/* 公共的分类行自带 12px/14px 呼吸留白，main 的上内边距会与之叠加成 30px（见 Issue 视觉缺陷）。 */
.omnimux-assets-main:has(> .omnimux-assets-cloud) {
  padding-top: 0;
}
```

- `:has()` 在本仓库已有先例（`styles.js:209` / `226-227` / `248`），运行宿主为 Chromium 内核，无兼容风险；
- 该选择器特异度（0,2,0）高于 `.omnimux-assets-main`（0,1,0），**无需 `!important`**；
- 只归零 **`padding-top`**：`padding-right / left: 20px` 与 `padding-bottom: 16px` 原样保留（实测 `main` 计算值为 `0px / 16px / 20px`）。

**改动 2 —— 改值：公共分类行下内边距 14px → 20px**（`styles.js:1017` 声明块）

```diff
 .omnimux-assets-cloud-nav {
   display: flex;  flex-direction: column;
   gap: 8px;
   flex: 0 0 auto;
-  padding: 12px 0 14px;
+  padding: 12px 0 20px;
 }
```

- 上内边距 12px 与左右 0px **保持不变**；
- `14 + 10 = 24px` → `20 + 10 = 30px`，与三页签的 `14 + 16 = 30px` 逐像素持平。

### 4.2 为什么修复后不可能再跳变（不变式）

改动 1 使公共分类行的**静止顶边**恰好等于它的**吸附阈值**（`--stage-rail-h` = 吸附栏高 48px）：

- 修复前：静止 `navTop = 624`、吸附 `navTop = 608`，**位移 16px** → 净空 30px → 14px 跳变；
- 修复后：静止 `navTop = 608`、吸附 `navTop = 608`，**位移 0px** → 净空恒为 14px。

**不变式（写入门禁）**：`公共分类行静止顶边 == 吸附栏底边 == --stage-rail-h`。只要该等式成立，滚动过程中就不存在可被"吃掉"的位移余量，净空不可能跳变。

### 4.3 状态覆盖论证（为何该覆盖式不会产生新缺陷状态）

- `.omnimux-assets-cloud` 是 `CloudAssetsView` 的**唯一根节点**，其全部渲染分支（行布局 / 首次加载骨架 / 空态 / 卡片网格，`CloudAssetsView.jsx:585-676`）都挂在该根内；
- `CloudCategoryNav` **无条件渲染**（`CloudAssetsView.jsx:477-479`，无 `return null` 分支）→ 不存在"导航行缺失时上留白归零"的新状态；
- 其他页签的 `main` 均不含 `.omnimux-assets-cloud` 直接子节点（本地/产品库/AI生成 的视图根分别为网格 / 产品视图 / 生成视图），` :has() ` 不会命中 → 三页签 `main` 上内边距实测仍为 16px；
- **若未来 `CloudCategoryNav` 增加返回 `null` 的分支**，则须把选择器收窄为 `.omnimux-assets-main:has(> .omnimux-assets-cloud > .omnimux-assets-cloud-nav)` —— 此项写为**后续义务**，本条修复不预先引入。

---

## 5. 验收标准（可测、带数字）

### 5.1 几何与视觉（P0）

| ID | 场景 | 断言（逐字可执行） |
|---|---|---|
| **AC-1** | 四页签（本地 / 公共 / 产品库 / AI生成）一级↔二级净空（静止） | 四个读数**全部 == 14px**，跨页签最大差值 **0px（±0）** |
| **AC-2** | 公共页签滚动前后 | 静止读数 == 吸附置顶后读数 == **14px**；且 `公共分类行静止顶边 − 吸附态顶边 == 0px`（修复前为 16px） |
| **AC-3** | 四页签二级↔内容净空 | 四个读数**全部 == 30px**，跨页签最大差值 **0px** |
| **AC-4** | 公共二级分类行左基准线 | 首个胶囊元素左边缘与一级 Tab 元素左边缘**差值 == 0px**（同在 20px 基准线）；`main` 计算 `padding-left == 20px`，`padding-right == 20px` |
| **AC-5** | `main` 内边距作用域 | 公共路径 `main` 计算 `padding-top == 0px`；三页签路径 `main` 计算 `padding-top == 16px`；两条路径 `padding-bottom == 16px`（**防"全局改 main"回归**） |
| **AC-6** | 回归门禁（**新增覆盖，必做**） | 见 §5.2 |
| **AC-7** | 三页签零改动 | 本地/产品库/AI生成 的全部既有读数逐一不变：一级↔二级 `14 / 14`（静止 / 吸附）、二级↔内容 `30`、吸附栏高 `102px`、`main` 上内边距 `16px`；且 `styles.js` 的 diff 不得出现 `.omnimux-assets-local-nav` 的任何改动 |
| **AC-8** | 卡片栅格 | 栅格列数、列宽、卡片宽高与间距**逐值不变**（对比修复前后同一位置的 `getBoundingClientRect`）；仅纵向起点按 AC-3 变化 |
| **AC-9** | 吸附行为契约 | `.omnimux-assets-cloud-nav.omx-stage-sticky { top: var(--stage-rail-h) }` 声明保留；`.omx-stage-sticky` / `.omx-stage-scroll` 骨架类声明不变；公共吸附栏高度仍为 `48px` |
| **AC-10** | 静态门禁 | `pnpm verify:stages` 7/7 通过；`pnpm test:ui` 零违规；`pnpm --filter <assets 包> test` 全绿 |

### 5.2 AC-6 门禁扩展要求（现有夹具覆盖不足，必须补齐）

**现状问题**：`plugins/omnimux-assets/src/client/tabs-spacing.e2e.test.js` 的夹具**只挂了 `.omnimux-assets-local-nav`**（吸附栏路径），公共路径（`body > main` 内）**完全无覆盖**，且只断言了上净空。本次缺陷正是从这条盲区漏出去的。

**必须扩展为**：

1. **两条挂载路径同时覆盖**（同一夹具内并列渲染，参照 `docs/evidence/public-tab-gap-2026-09-25/probe.mjs` 的 `stageA` / `stageB` 结构）：
   - 路径 A（吸附栏内）：`.omx-stage-sticky` 内含工具栏 + `.omnimux-assets-local-nav` → 代表 **本地 / 产品库 / AI生成** 三页签（后两者复用同一 `.omnimux-assets-local-nav` 节点与内边距，见 `ProductsView.jsx:32`、`GenerationsView.jsx:43`）；
   - 路径 B（body > main 内）：`.omnimux-assets-body > .omnimux-assets-main > .omnimux-assets-cloud > .omnimux-assets-cloud-nav.omx-stage-sticky` → 代表 **公共**。
2. **上下两个净空都断言**，且锁死为 §3.1 的权威值：
   - 上净空：路径 A `== 14`、路径 B `== 14`；路径 B 在 `scrollTop = 0` 与 `scrollTop = 320` 两个状态下**均 `== 14`**（消除跳变断言）；
   - 下净空：路径 A `== 30`、路径 B `== 30`；
   - 结构断言：`main` 的 `paddingTop`，路径 A `== '16px'`、路径 B `== '0px'`；两条路径 `paddingLeft == '20px'`。
3. **替换过松断言**：现有 `assert.ok(gap >= 10 && gap <= 16)` 的宽松区间必须收紧为 `assert.equal(gap, 14)`，并保留 `paddingTop === '12px'` 断言。
4. **夹具完整性（反"自证读数"）**：夹具只负责把两条真实挂载路径的 DOM 摆对，**不得**在夹具内写死会决定结论的内边距 / 高度（如给 `main` 内联 `padding-top`、给导航行内联 `padding`）；数字必须由 `ASSETS_CSS` 生产样式产出。**移除改动 1 或改动 2 时，对应断言必须失败**（两条改动各自可被独立证伪）。

---

## 6. 边界（Boundaries）

### 6.1 允许改（白名单，仅此两处）

| # | 位置 | 改动 |
|---|---|---|
| 1 | `styles.js`：**新增**一条 `.omnimux-assets-main:has(> .omnimux-assets-cloud) { padding-top: 0; }` | 归零公共路径 `main` 上内边距 |
| 2 | `styles.js:1017` `.omnimux-assets-cloud-nav` 的 `padding` | 下内边距 `14px → 20px`（上、左、右不动） |
| 3 | `tabs-spacing.e2e.test.js` | 按 §5.2 扩展夹具与断言 |

### 6.2 禁止改（红线，越线即驳回）

1. **禁止全局改 `main` 内边距**：不得写 `.omnimux-assets-main { padding: 0 20px 16px }` / `padding-top: 0` 之类**无 `:has()` 限定**的写法 —— 该 16px 被本地/产品库/AI生成 共用，全局改会让三个页签的内容整体上移，属扩大爆炸半径；
2. **禁止改 `.omnimux-assets-cloud { gap }`**：`gap: 10px` 同时作用于「导航行 ↔ 错误提示 ↔ 通知条 ↔ 内容」全部相邻兄弟，改它必然牵连非本次目标元素；也不得新增 `margin` 绕过（见 §3.4 否决 C）；
3. **禁止改 `.omnimux-assets-local-nav` 的任何内边距**：该节点被三个页签共用，改下内边距会连带缩短吸附栏高度、位移三个页签的栅格并漂移 `--stage-rail-h`；
4. **禁止改 `.omnimux-assets-stage-toolbar` 高度与一级页签高度**：2px 结构余量是四个页签上净空的共同组成部分，改它等于同时改四个页签；
5. **禁止改左右 20px 基准线、`main` 的下内边距（16px）**；
6. **禁止补偿式 hack**：不得使用 `margin-top: -16px`、`transform: translateY()`、`!important`、JS 侧量高后写内联样式等任何"抵消"手法；
7. **禁止改吸附契约**：`.omnimux-assets-cloud-nav.omx-stage-sticky` 的 `top: var(--stage-rail-h)`、`.omx-stage-sticky` / `.omx-stage-scroll` 声明一律保持原样；
8. **禁止改任何可见文案、标签文字、图标与元素增删**（本次为纯间距修复，见 §6.4）。

### 6.3 副作用披露（采用方案的已知、可接受后果）

采用方案会把公共分类行的**不透明遮挡带**（吸附态卡片滑入其下的区域）由「胶囊底边 + 14px」加宽到「胶囊底边 + 20px」（导航盒高 54px → 60px），其余三个页签仍为 14px。

- 该差异**不产生跳变**（静止与吸附同值，AC-2 已断言），只影响滚动时卡片"消失"的纵向位置；
- 它修订了 `specs/assets-tab-spacing.spec.md` AC-2 的「14px」数值口径：那份规格的 14px 描述的是当时分类行自身的下内边距，本次因统一「二级↔内容」净空而下内边距变为 20px，**该 AC 的数值口径由本规格接管为 20px**，其"不贴脸、有沉浸缓冲"的意图不变；
- 选择接受这一 6px 遮挡带差异，是为了不触碰兄弟元素间距（§6.2 第 2 条）。若产品后续要求遮挡带也严格对齐 14px，须另开任务并显式解除该红线。

### 6.4 元素与文案冻结（PM 终验口径）

本规格**不授权任何可见文本、图标、Badge、副标题、占位的增删改**：

| 区域 | 冻结内容 |
|---|---|
| 一级 Tab | 文案与顺序不变（`本地` / `公共` / `产品库` / `AI生成`），元素数量不变 |
| 二级分类胶囊行 | 胶囊文案、数量、顺序、选中态样式不变；**只允许其容器的内边距变化** |
| 工具栏 / 搜索 / 视图切换 | 完全不动 |
| 卡片与栅格 | 元素与文案完全不动（仅纵向起点按 AC-3 变化） |

终验结论只有两种：`PM_SIGN_OFF: PASS`（两条净空达标、无文案/元素改动、门禁扩展到位）或 `PM_SIGN_OFF: REJECT`（列出越线元素或未达标读数）。

---

## 7. 本次不改（Out of Scope）

1. **页面其它留白**：`AssetsHeader` / `AssetsActionRow`（`padding: 8px 20px 12px`）/ 分隔线 / 栅格内部间距 / 卡片间距 / 空态留白；
2. **Token 与数据重构**：`padding` 字面值 Token 化、`--stage-rail-h` 机制改造、`data-*` 属性调整；
3. **跨插件页面**：`产品库`独立页（`plugins/omnimux-products`）、灵感库 / 素材工作台（`plugins/omnimux-inspiration`、`plugins/omnimux` 二级页）、画布与 Clip 工作台 —— 本次只在 `plugins/omnimux-assets` 资产中心内收敛；
4. **其它页签的横向/纵向节奏**：工具栏内部间距、胶囊行内 `gap: 6px`、第二层子分类（`.omnimux-assets-cloud-subnav`）的既有留白。

---

## 8. 复现与取证

```bash
# 1) 基线取证（真实 Chromium 无头，实测三页签 14/14/30、公共 30/14/24）
node docs/evidence/public-tab-gap-2026-09-25/probe.mjs

# 2) 修复后复跑：公共应变为 14/14/30，三页签读数逐值不变

# 3) 门禁（扩展后）
pnpm --filter <assets 包> test        # 含 tabs-spacing.e2e.test.js 两条路径断言
pnpm verify:stages                    # 骨架契约静态扫描
pnpm test:ui                          # UI 红线扫描
```

- 修复后的验收证据必须来自**本任务独立工作树**内的真实浏览器 Web 验证（截图或结构化读数报告），按 `AGENTS.md` 交付纪律执行；开发版真机验收由人工执行，不作为 Agent 交付前提。

---

## 9. 终验签收（PM Sign-off）

- **签收人**：产品经理 许清楚（Xu） ｜ **日期**：**2026-09-25**
- **判定**：**`PM_SIGN_OFF: PASS`**
- **验收对象**：工作树 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-public-nav-breathing`，分支 `agent/assets-public-nav-breathing`，HEAD `fcc4ef3c5`（== `origin/main` base）。
- **改动面（`git diff --name-only` 全量）**：`plugins/omnimux-assets/src/client/styles.js`、`plugins/omnimux-assets/src/client/tabs-spacing.e2e.test.js` —— 仅此 2 个 `.js`。

### 9.1 复测原始读数（PM 独立复跑，不采信开发自述）

`node docs/evidence/public-tab-gap-2026-09-25/probe.mjs`（夹具在本工作树内，其 `../../../plugins/omnimux-assets/src/client/styles.js` 相对导入解析到**本工作树**源码，被测样式源正确；夹具为 git 忽略产物，未新增任何文件）：

```json
{
  "local": {
    "gapBottom": 30,
    "navPaddingTop": "12px",
    "navPaddingBottom": "14px",
    "railHeight": 102,
    "rest":  { "gapTop": 14, "chipTop": 60,  "tabBottom": 46,  "navTop": 48  },
    "stuck": { "gapTop": 14, "chipTop": 60,  "tabBottom": 46,  "navTop": 48  },
    "scrolled": 320,
    "restGap": 14,
    "stuckGap": 14
  },
  "cloud": {
    "gapBottom": 30,
    "navPaddingTop": "12px",
    "navPaddingBottom": "20px",
    "railHeight": 48,
    "rest":  { "gapTop": 14, "chipTop": 620, "tabBottom": 606, "navTop": 608 },
    "stuck": { "gapTop": 14, "chipTop": 620, "tabBottom": 606, "navTop": 608 },
    "scrolled": 320,
    "restGap": 14,
    "stuckGap": 14
  }
}
```

`corepack pnpm --filter omnimux-assets test`：`ℹ tests 599 ｜ ℹ pass 599 ｜ ℹ fail 0 ｜ ℹ duration_ms 3031`。

**逐条对表**：AC-1 `14/14` ✔ ｜ AC-2 公共静止 == 吸附 == 14，`navTop` 608 == 608（位移 0px，修复前为 16px）✔ ｜ AC-3 `30/30` ✔ ｜ AC-4 `paddingLeft/Right == 20px` ✔ ｜ AC-5 公共 `padding-top 0px` / 三页签 `16px`，两条路径 `padding-bottom 16px` ✔ ｜ AC-7 三页签 `14/14/30`、`railHeight 102`、`local-nav padding 12/14` 逐值不变 ✔ ｜ AC-9 `railHeight` 公共 48 / 三页签 102、吸附声明保留 ✔。**无自行取整**：全部读数为整数 CSS px 精确相等。

### 9.2 §6.4 元素与文案冻结逐行核对（最高优先级，全部通过）

| 冻结区域 | 违例扫描 | 结论 |
|---|---|---|
| 一级 Tab | `AssetsStage.jsx` 等全部 `.jsx/.tsx` 本次**零改动**（`git diff --name-only` 无 `.jsx/.tsx`）；文案仍为 `本地` / `公共` / `产品库` / `AI生成`，元素数量不变 | ✔ 冻结 |
| 二级分类胶囊行 | 胶囊文案、数量、顺序、选中态样式零改动；仅有**其容器** `.omnimux-assets-cloud-nav` 的 `padding-bottom` 14→20 | ✔ 冻结 |
| 工具栏 / 搜索 / 视图切换 | 零改动（无相关文件进入 diff） | ✔ 冻结 |
| 卡片与栅格 | 元素与文案零改动，仅纵向起点按 AC-3 变化 | ✔ 冻结 |

- `styles.js` 的 diff **逐行全量列举**只有：1 行中文注释、1 条新增选择器块（3 行）、1 段英文注释改写、1 行 `padding` 值改动。**无 `content:` / `::before` / `::after` / emoji / aria / label / title / 徽章 / 副标题** 的增删改（已按关键词全量扫描确认）。
- **测试夹具文本未进入产品可见 UI**：`tabs-spacing.e2e.test.js` 内出现的中文（`本地`/`公共`/`全部`/`角色`/`场景`）与 `aria-label="二级分类"` 均为夹具造型，`package.json` 的 `test` 脚本才引用它；全仓扫描确认**无任何产品代码 import 该文件**，且物化产物 `plugins/omnimux-assets/lib/client.js` 中该夹具标识串（`assets-tabs-spacing-two-paths`）命中数为 **0** → 不进运行版。
- 无任何「未列入白名单」的多余 UI 元素、装饰图标或营销副标题被引入。

### 9.3 副作用口径复核（§6.3 一致性）

PM 独立实测（同一夹具，对比「撤销改动 2」的对照态）：

| 读数 | 修复前（对照） | 修复后 | §6.3 披露值 | 结论 |
|---|---|---|---|---|
| 公共导航盒高 | **54px** | **60px** | 54 → 60 | ✔ 一致 |
| 公共胶囊下方遮挡带 | **14px** | **20px** | 14 → 20 | ✔ 一致 |
| 三页签导航盒高 / 遮挡带 | 54px / 14px | 54px / 14px | 保持 14px | ✔ 一致 |
| 遮挡带不透明来源 | — | `.omx-stage-sticky { background: var(--dsw-alias-bg-base…) }` 实测 `rgb(17, 18, 21)` | 「不透明遮挡带」 | ✔ 一致 |

对 `specs/assets-tab-spacing.spec.md` AC-2 的 14px → 20px 口径接管，与 §6.3 披露一致。**未发现任何未披露的新副作用**：

- `.omnimux-assets-cloud { gap: 10px }`、`.omnimux-assets-local-nav { padding: 12px 20px 14px }`、`main` 的 `padding-bottom: 16px` 与左右 20px 基准线、吸附契约 `top: var(--stage-rail-h, 0px)`、骨架类声明 —— 均在 diff 外，逐条实测逐值不变；
- `:has()` 作用域**仅有 1 处触发点**：`CloudAssetsView` 全仓唯一挂载点为 `AssetsStage.jsx:287`，其 `main` **只有 1 个子节点**，故归零 `padding-top` 不会位移任何兄弟元素；且 `CloudAssetsView`（`CloudAssetsView.jsx:662`）为单一 `return` 根、`CloudCategoryNav` 无条件渲染 → 不存在「导航行缺失」新状态；
- 仅 1 条 `:has()` 限定的 `main` 规则，**无任何无 `:has()` 的全局 `main` 改动**（`styles.js` 中 `main` 相关规则仅 161 行原声明与 171 行新规则）。

### 9.4 独立证伪（§5.2 第 4 条 · 反「自证读数」）

在 `/tmp` 临时沙盒内以**未改动的真实测试文件**（仅重写两条 import 指向）对 `ASSETS_CSS` 施加单点变异，验证两条改动各自可被独立证伪（用完即删，工作树零残留）：

| 变异 | 结果 |
|---|---|
| `base`（不改） | ✔ pass 1 / fail 0（退出码 0） |
| `undo1`（移除 `:has()` 规则） | ✖ fail 1 —— `AssertionError: cloud 路径一级↔二级净空（静止）应为 14px`（退出码 1） |
| `undo2`（`padding-bottom` 20→14） | ✖ fail 1 —— `AssertionError: cloud 路径二级↔内容净空应为 30px`（退出码 1） |

结论：夹具数字确由 `ASSETS_CSS` 生产样式产出，非夹具内写死的自证读数，两条改动**各自独立可证伪**。

### 9.5 保留意见（不影响本次放行）

1. **AC-10 的全局口径在 base 上即不成立**：`pnpm verify:stages` 与 `pnpm test:ui` 在本工作树整体退出码为 1，但违规全部落在 `plugins/omnimux-social-harvest/src/client/HarvestStage.jsx`、`plugins/omnimux-accounts`、`plugins/omnimux-video/src/client/GoogleVidsStudioPanel.jsx` —— 这些文件与 `HEAD` 逐一比对**零改动**，属 base 既有问题；`omnimux-assets` 在两项门禁中**违规数为 0**。故不构成本次驳回事由，但 AC-10「7/7 通过 / 零违规」需另开任务收口。
2. **物化产物待重建**：`plugins/omnimux-assets/lib/client.js` 为未跟踪的手工/打包产物，本次未随 `src` 重建（`git status` 显示其未修改）。合入打包环节须执行 `npm run build`（`prepare`）后修复才会进入运行版；非本 diff 缺陷。
3. **§4.3 后续义务保持待命**：若未来 `CloudCategoryNav` 增加 `return null` 分支，须把选择器收窄为 `.omnimux-assets-main:has(> .omnimux-assets-cloud > .omnimux-assets-cloud-nav)`。当前实测该分支不存在，故本条不触发。

**终验结论：`PM_SIGN_OFF: PASS`** —— 两条净空达标（14px / 30px，零误差）、元素与文案 100% 冻结、门禁扩展到位且可独立证伪、副作用与 §6.3 披露逐值一致，准予放行。
