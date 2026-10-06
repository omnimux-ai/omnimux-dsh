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
- **弹窗测试装置：观察到挂死，但机制未定（主理人已自行更正）**。观察到的事实：原两条测试
  在断言失败时文件不报红而挂到 199s / 218s / 147s 超时（文件级 `'test failed'`，无断言细节，
  `ℹ tests 8` 少于源码的 10 条）。**主理人起初把根因写成「断言抛在 `try` 内打断 jsdom/React
  清理」——该解释已被两个独立探针否证**：①代码审查轴把一条既有用例的断言改错（仍在 `try` 内）
  → `12/11/1`、1s、具名带 `AssertionError`；②主理人在 `/tmp` 副本上造「多次挂载 + 断言在 `try`
  内 + 必然失败」的探针 → `1/0/1`、**0.082s**。⇒ 挂载次数与断言位置**都不是**充分原因。
  **最可能的真实原因**：`.esbuild-cache` **非进程隔离**——审查轴在同族文件
  `inspiration-section-render.test.js` 独立发现同一类 bug（该文件 `mkdirSync` 与 `writeFileSync`
  之间被**另一进程**的 `after(() => rmSync(cacheDir))` 删掉目录 → ENOENT；单跑 9/9、重跑 184/184）。
  主理人三次挂死观测期间，同工作树内确有并发 `node --test` 进程。**⇒ 挂死归因未定论，不要在
  别处引用「try 内断言必挂死」这一说法。**
- 已做的两处改动（断言移到 `unmount()` 之后 + 多次挂载拆成单次）**本身是良性改进**（红阶段
  现在可见具名断言、整轮 0.83s），但**它们不是挂死的解药**，别把它们当作该现象的证据。
- **可复用判据**：单文件测试耗时达百秒级且只报文件级 `'test failed'` 时，**先怀疑并发进程共享
  构建缓存目录**，而不是断言写法；对照 `ℹ tests N` 与源码 `it()` 条数判断「有测试从未跑完」。

## 第三轮证据文本更正（QA R4 验收：证据文本 FAIL，业务代码 PASS）

来源：QA 轴独立复算后指出三处**证据文本**不实（非代码轴）。**这些更正属于 `01dc8479a`
提交本身**——更正前，提交内的 `fix-round.md` 仍写着已被否证的挂死解释，与工作树不一致。

- **更正①·第二段数字与出网声明**：第二段「`261 / 261 / fail 0`」只在**去掉 deny 装置**时成立；
  带装置为 `264 / 261 / fail 3`（三文件按设计回落到 `globalThis.fetch`，被装置拦 11+2+1 次后
  `exitCode=1`）。⇒ 「每段 0 outbound attempts」**对第二段不实**，只对第一段成立。
  与 `package.json` 口径对齐的合计是 **1440 / 1437 / fail 1**。
- **更正②·删除「assets 层 `dsh-ui-kit` 4 项红」段账**：该 4 项**未在本票两段复现**——属其他插件
  目录，不在本票过滤器内。本票两段只有 1 个红项（`rival-filter-polish.e2e`，环境性）。
- **更正③·挂死解释**：本文件上文已改为「观察到挂死但机制未定」。QA 轴做了比主理人更干净的
  单变量隔离：**拿第三轮前的旧测试文件逐字**跑同写法的失败断言 → `8 / 7 / 1`、**151,831ms**、
  文件级 `'test failed'` 无断言细节；**新装置**同写法 → `13 / 12 / 1`、**845ms**、具名
  `AssertionError`。⇒ **挂死跟随旧测试文件，不跟随断言位置**；机制仍属未定论。

**可复现的枚举过滤器（QA 轴提供）**：8 文件集用**显式文件列表**（`rival*` 通配符命中 25 个文件，
会漏掉 `inspiration-section-render.test.js` 与 `use-rival-feed-poll.test.js`）；第一段
`src/*.test.js src/rival/*.test.js src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js`（99 个）；
第二段 `src/explore/*.test.js src/explore/*.e2e.test.js src/explore/trending/*.test.js src/explore/templates/*.test.js src/explore/skills/*.test.js`（49 个）。

**Low-1 鉴别力的两种口径（不是矛盾）**：审查轴 R1 称「恢复内联族序（**常量保留导出**）仍 36/36 全绿，
只有连常量一并删除才红」；QA 轴称「最小反向补丁（Low-1）→ `36/35/1`」。两者**补丁范围不同**：
QA 的补丁删掉了常量，所以红的是「常量缺失」；审查轴保留常量、只恢复内联，所以不红。
**R1 成立** —— 该断言断言的是常量自身数值次序，而声称要防的是「sorter 恢复内联族序」，两者不同轴。
