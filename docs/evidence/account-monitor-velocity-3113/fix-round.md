# Issue #3113 · 修复轮报告（四轴必修 M1–M10 收口）

- 修复对象：工作树 `.worktrees/task-3113`，分支 `feat/task-3113-issue-3113`（第一轮提交 `3cadcb476`，第二轮提交 `b38032fd9`，第三轮见下节；未推送、未开 PR）
- **本文档只覆盖第一轮**（四轴必修 M1–M10）；第二轮的六项必修见 `pm-signoff-r2.md` / `qa-report-r3.md`，第三轮见文末「第三轮整改」。
- 裁定依据：`pm-signoff.md` REJECT 必修 A/B/C + `qa-report.md` FAIL M1/M2/M3，四轴独立命中同一组缺陷
- 修复人：前端开发 裴像素

## 三项必修的修法与改后实测

### M1 · 谓词与文案数值域对齐（28px 空胶囊行）
- 修法：`rivalVelocityHasSignal` 移入 `rival-format.js`（与 `rivalVelocityText` 同文件、同数值域），
  速率族 `Number.isFinite(vph) && vph >= 200`，相对族 `multiplier > 0`；`rival-format.js` 的
  `rivalVelocityText` 同步把速率族 <200 的输出归 `''`（media 支路不经谓词直接消费文案）；
  `rival-filter.js` 仅 re-export，`rival-masonry.js` 改从 `rival-format.js` 引入（顺带消 M6 循环依赖）。
- 实测（真机 Chrome CDP，`extra2.html` 压力夹具，`probe5.mjs`）：
  `vph0-average` → `row=false h=0 pill=false`（暗/亮同形）；`mult0-relative` → 同上；
  `vph180-average` → 同上（M2 联动）；`ok-average` → `row=true h=28 pill=true`（`均速 1.8k/h` 保留）。
  估算层同值：`estimate=144`（text 卡基线），36px 空洞不再进入瀑布流预算。

### M2 · B 档套 §3.3 的 200 下限
- 修法：`feedVelocity` B 档算出 `vph` 后过 `vph >= VELOCITY_TIER_WATCH` 门，低于下限不落 B 档、
  继续走 C 档判定（倍数族不受 200/h 约束）。
- 实测（`rival-feed-velocity.test.js`，`now` 注入）：
  `{views:0, posted_at:08:00Z}@12:00Z` → `null`；`{views:400, posted_at:00:00Z}@12:00Z`（33.3/h）→ `null`；
  `{views:1800, posted_at:11:00Z}@12:00Z` → `{confidence:'average', tier:'average', vph:1800}`（§9.4 的
  `均速 1.8k/h` 保持渲染）。边界补 200（含边界）/199.9/199，`vph<200` 且相对成立 → `relative` 9x。

### M3 · 「增速最快」两族分桶
- 修法：`velocityRank` 显式分桶——有限正 `vph` → `1e9 + vph`（速率族恒先于相对族），
  `multiplier > 0` → `multiplier`，其余（含 `vph=0` 无胶囊）→ `-Infinity` 沉底。
- 实测（`rival-feed-velocity.test.js`）：`vph=0.005` 在 `multiplier=9.5` 之前；
  `vph=23000` 在 `vph=200` 之前且最小相对族 `3x` 仍居其桶；`vph=0` 与 `velocity=null` 同沉末尾。

## M4–M10 处置
- M4：`sortFeedRows` JSDoc 归位（重新落在函数头上）；`velocityRank` 注释改为分桶语义。
- M5：`toFeedRow` 删 `views_history`/`first_seen_at` 透传；断言反向钉住「wire 行不带原料」。
- M6：`rival-masonry.js → rival-filter.js → rival-masonry.js` 循环解为 `masonry → format → locales`，
  `filter → format`（单向）。
- M7：3 处零鉴别力断言钉住真实降级落点：views 回退 → `average`（vph=7500）；<1.5h 间隔 → `average`（1250/h）；
  未来 posted_at → `relative`（100x）。
- M8：**选「补 `now` 注入」**——spec 已声明「`listFeed` 透传 `now`」，且 service 本就有 `deps.now`
  注入链（`markPotential`/`computeAnalysis` 同形），补一行比改 spec 更贴既有范式：`now: new Date(now()).toISOString()`。
- M9：实测档 `samples_at` 任一端不可解析 → 不渲染 `detail.velocityNote` 行（不再有 `基于 -- 与 -- 两次采样`）。
- M10：边界夹具已补——速率族 `0/199.9/200/1e3/2e4/2e4+ε` × 4 tier、相对族 `multiplier 0/3`、
  各族极小值 vs 他族极大值（`vph=0.005` vs `multiplier=9.5`、`vph=23000` vs `multiplier=3`）。

## 新增/修改断言清单（改前会红证据）
红阶段实测（修复前源码）：`tests 95 / pass 86 / fail 9`，REAL_EXIT=1——
`views=0→null`、`vph=33.3→null`、`vph 边界 200/199.9/199`、`vph<200→relative`、`toFeedRow 不带原料`、
`分桶排序`、`不变量(谓词 true⇒文案非空,模块级缺导出)`、`modal 缺导出`、`masonry vph0/mult0`。

## 回归（tests 计数，非 pass 计数；`cmd > log 2>&1; echo REAL_EXIT` + `ℹ fail N` 交叉验证）
- 关联 10 文件：**188 tests / 188 pass / fail 0**，REAL_EXIT=0。
- 第一段 · 插件全量：**1161 tests / 1158 pass / fail 1**（`rival-filter-polish.e2e`，环境性：工作树缺
  `repoRoot/node_modules`，基底与 HEAD 同形挂，本票不修）。
- 第二段 · explore：**261 tests / 261 pass / fail 0**，REAL_EXIT=0。
- codepoint-probe：`mismatches=0`，REAL_EXIT=0，产物 `/tmp/3113-codepoint.json`。
- deny-network 回执：每段 `0 outbound attempts`。

## 人眼复检（display_file 级）
- 压力夹具（`shot-predicate-fixture.png` + `shot-fix-pill-gallery-{dark,light}.png`）：
  `vph=0` / `multiplier=0` / `{text:''}` / `vph=180` 四卡标题顶格、无 28px 空带——**空洞消失已确认**。
- 整页暗/亮（`shot-fix-dark-full.png` / `shot-fix-light-full.png`）：五档胶囊形态与裁定轮一致，
  `均速 1.8k/h` 保持渲染，`该号 4.2x` 中性描边无 /h。

## 环境性红挂（如实列出，未记成 0）
- `rival-filter-polish.e2e` ×1（fail 1）：esbuild `nodePaths:[repoRoot/node_modules]` 在任何 git 工作树
  都红，基底同形——本票不修。
- 资产层 `dsh-ui-kit` file: 依赖未物化 ×4：基底同形——本票不修。

## 第三轮整改（四轴 R3 复审：3 medium + 6 low）

来源：OCR `ocr review` 判 BLOCKING 的 3 medium + 6 low，全部源自第一轮实现 `3cadcb476`。
主理人逐条核实后确认 M-B / M-C / Low-1 / Low-5 为真，两个「嵌套三元」low 为 CLI 假阳性
（本仓无 eslint/biome/oxlint 配置，规则来自 CLI 自带清单）。

- **M-B · `feedMedianViews` 每行重算**：原实现把 `feedMedianViews(postsByAccount[account.id])`
  写在 `kept.map(...)` 回调内，同一账号每可见行都重排一次整份缓存历史。改为 map 之前按账号
  预计算一次（`medianByAccount`）。断言：同一账号 N 行时 `feedMedianViews` 恰被调用一次。
- **M-C · 回滚只比端点**：原实现只比 `first`/`last`，`1000 → 500 → 1500` 的端点 delta 为正，
  会被签成 measured，与函数 docblock「a views rollback is a data anomaly, never a negative
  speed — degrade」相反。改为逐对检查相邻采样，任一 `views[i] < views[i-1]` 即降级。
  断言：端点 delta 为正但中间回退 → 不产 measured（且不误伤正常递增序列）。
- **Low-1 · 族序序号内联**：`velocityRankKey` 的 `2/1/0` 提为 `constants.js` 的
  `RIVAL_VELOCITY_RANK_FAMILY`（`Object.freeze({rate:2, relative:1, none:0})`），与
  `RIVAL_VELOCITY_TIER_WATCH` 同处集中。断言：常量存在且次序正确。
- **Low-5 · 弹窗口径行门不统一**：`velocityNote` 只看 `confidence` 字符串，不看 `vph`/`multiplier`，
  于是谓词判 false 的残留（`vph:0` / `multiplier:0` / `vph:199.9`）在卡胶囊已被抑制的情况下
  仍在弹窗落一行。改为复用既有共享谓词 `rivalVelocityHasSignal`（第三次「同一份信号域各写各的门」）。
- **spec**：A 档落空后的严格逐档降级链（先 B 后 C，含 PM 裁定与实测口径）、A 档相邻采样回滚、
  以及采样窗口与「指数平滑（近一次权重 0.7）」两项**成对登记**为遗留。

### 第三轮红/绿证据（主理人亲自执行）

- 绿：相关 8 文件 `184 tests / 184 pass / fail 0`，`REAL_EXIT=0`。
- 红（新增断言 × 未修源码）：`36 tests / 35 pass / fail 1`（Low-1 常量缺失）+ 弹窗 3 条
  `AssertionError: predicate-false descriptor must not render the note line at all`。
- **弹窗测试装置缺陷（已修）**：原两条测试在断言失败时不报红而**挂死到 218s 超时**
  （文件级 `'test failed'`，无断言细节），根因是断言抛在 `try` 内打断了 jsdom/React 清理。
  改法：断言一律移到 `unmount()` 之后，并把多次挂载拆成单次挂载。修后整轮 0.83s，
  红阶段可见具名断言。**该装置此前无法产出红阶段证据，这一条同样适用于任何复用它的人。**
