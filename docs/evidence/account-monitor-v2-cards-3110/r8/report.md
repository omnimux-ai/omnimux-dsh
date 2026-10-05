# #3166 R8 收口整改 · 证据与测量记录

工作树 `.worktrees/account-monitor-v2-cards-r8`，分支 `fix/account-monitor-v2-cards-r8-issue-3166`，基底 `origin/main` = `9a6da6050`。

## 决策一 · 删「非 CJK 守卫」（先红后绿）

- **红**：断言 `CJK 上下文不抑制断后：<CJK>？<拉丁词> 行数与 Chrome 一致` 在守卫存在下 REAL_EXIT=1（fail 1）。
- **绿**：删 `:202`（charWidthFactor 的 `cp > 0x2e7f` 特例，词分支不再含 >0x2E7F 码位故为死码）、`:286` 的 `&& !BREAK_AFTER.has(cp)`、`breakAfterAllowed` 的 `!(prevCp > 0x2e7f)` 后 REAL_EXIT=0（49/49）。
- **机理**：守卫把 `？`（FF1F，EX）粘进后续拉丁词 `？word`；Chrome 对 FF1F 仍按 EX 断后（探针 `中文？abc def`@60=2、@50=2，`中文？aa中文bb？cc`@50=3，`中文？bbbbbbbbbbbbbbbb`@40=3，`中文？word word word`@40=5、`中文？word word word`@80=2）。
- **衍生修复（同票，探针发现）**：`﹖`（U+FE56，小号问号，CL 类）在行首禁则集缺失——5 词夹具 Chrome 5 行 / 模型 6 行。Chrome 对 CL 标的执行的是**行尾悬挂溢出**（hang，w1+mark+w2@50=2），不是「前字符拉下」。行首禁则的 wrap 分支由「拉回 1 原子」改为「悬挂占满本行行尾」，集合补 `﹗﹖”｡､･`（FE57/FE56/201D/FF61/FF64/FF65）；`〉】〕` 补齐、`［` 去重属 ⑥。
- **探针**：`r8-codepoints.json` = **0 mismatches**（40+ 码位模型 vs Chrome 全一致）。

## 决策二 · 胶囊对比度（像素法）

取胶囊文字像素与相邻背景像素（bucket 聚类，16 级量化；背景 = 内缩 3px 区域内最大桶，文字 = 与背景距离 >60 的次桶）。`is-done` 中性化卡跳过（其胶囊本来就用中性档）。修前：

| 组合 | 修前 | 修后 |
|---|---|---|
| dark on-media hot | 3.84（bg 240,64,64 → #f0453a） | 4.59（#d92d20） |
| dark on-media rising | 4.20 | 5.29（深琥珀底 rgba(120,53,15,0.9) + #fbbf24） |
| dark on-surface rising | 6.52 | 6.52（未动） |
| dark on-surface hot | —（e4 卡实测） | 4.59 |
| light on-media hot | 4.82 | 4.82（#dc2626 未动） |
| light on-media rising | 2.69（最劣 ~1.6 于亮封面） | 5.29（同暗房底） |
| light on-surface rising | 2.51 | 5.56（#d97706→#92400e） |
| light on-surface hot | —（e4 卡实测） | 4.82 |
| dark/light watch·average·relative on-media | 4.77–11.57 | 不变 |
| dark/light watch on-surface | 8.96 / 7.01 | 不变 |

全部组合 ≥4.5:1。色相与层级不变：hot 仍最热、rising 次之；仅调明度/底深。
让步说明：on-media rising 的半透明琥珀底在亮封面下数学上无法达标（α=0.20 叠任意封面色对比度受封面支配），**最小让步**为媒体上的胶囊改用暗房深色琥珀底（两主题同值），保留琥珀色相与 1px ring；on-surface 半透明琥珀底+深琥珀字 5.56 达标。
规格 §9.1 已写入「胶囊文字与实际承载背景 ≥4.5:1（像素法实测）」底线与三处调整值。
截图：`pills-dark.png` / `pills-light.png`（修后）、`pills-dark-before.png` / `pills-light-before.png`（修前）、`contrast-results.json`。

## ① filter-jump hover `:not(:disabled)` + 类级断言

- disabled 元素全集（生产 JSX 中真实 `disabled=` 的元素）：`.omnimux-rival-act-btn`（RivalPostCard 原帖按钮，source_url 不安全时）、`.omnimux-rival-act-primary`（复刻按钮，busy 时）、`.omnimux-rival-filter-jump`（RivalAccountFilter 账号行跳转，profileUrl 不安全时）。
- 断言钉在**类**上：枚举全集 × 其在 RIVAL_CSS 中的**每一条** `:hover` 规则，逐条要求 `:not(:disabled)`（同类缺陷第三次逃逸：R5 act-btn → R6 act-primary → R7 filter-jump）。`filter-jump:hover` 已补 `:not(:disabled)`。

## ② ui-kit-shim Button → 生产 DOM 形状

- shim `Button` 由裸文本节点改为 `<button><span class="slot">{icon}</span><span class="label">{children}</span></button>`（生产 `Button.tsx` 同构）。
- 验证（真机 computed style）：`.omnimux-rival-act-btn > span` 现在匹配到 `{tag:SPAN, cls:"label", textOverflow:ellipsis, overflow:hidden, whiteSpace:nowrap}`；`.omnimux-rival-overlay-metrics` computed `{display:block, textOverflow:ellipsis, overflow:hidden}`——省略号/指标行规则在装置里**真可测**（此前匹配不到任何元素）。

## ③ measure-placement.mjs ONLY 语义

- `ONLY` 白名单只筛报告行（`rows`/`maxAbsDiff`/逐卡输出）；replay 最短列重放与同列重叠统计恒基于全量 `data.cards`（`allCards`）。注释写明该语义。

## ④⑤⑥ 注记/计数/禁则

- 注记方向重写：U+2E3B −28.271px 最坏低估；U+2764 −4.454、U+2192 −4.242、emoji −4.0；U+200D +8.288、U+2011 +1.835 安全方向；U+2E3B 双向可断登记（Chrome 9 vs 模型 6）。
- 计数：BREAK_AFTER=304（官方 306 − {0021,007C}，LineBreak.txt **18.0.0**）；锁表 EXPECT=18 字形；两处注释已写版本。
- 「行尾禁则未模拟」旧注已纠正为已实现；行尾禁则 `［` 去重。
- `demo-bundle-pre.js` 加 provenance 头（旧估算器快照、常量 0.55、重建命令 `build-demo.mjs --pre`）。

## ⑦ 补断言

- `rival-post-card.test.js`：disabled 原帖按钮用例补 vh DOM 结构断言——describedBy 目标必须带 `.omnimux-rival-vh`、是 `<button>` 的**兄弟**（同在 act-slot）、`!button.contains(vh)`。
- `rival-filter.test.js`：`cover_key`/`cover_src`/`cover_http_url` 三字段同源同值断言（cover_src 直值 + cover_url 兜底两路）。

## 全量回归与真机复检

- client 测试：第一段 **1097** / 第二段 **261** / 合计 **1358**，REAL_EXIT=0 ×2，`ℹ fail 0`。
- 资产层：`omnimux/masonry-layout.test.js` 4 + `omnimux-assets` masonry 10 + asset suite 133，全绿。
- 人眼复检：`r8-dark-1164-zh.png`、`r8-light-1164-zh.png`、`r8-dark-600-zh.png`（暗/亮、中英、5 列/2 列）无重叠、无破版；胶囊新色（深红底白字、深琥珀底亮琥珀字）可读且色相层级不变。
