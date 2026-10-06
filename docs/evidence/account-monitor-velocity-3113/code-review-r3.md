# #3113 增速胶囊 · 第三轮整改代码审查（R3）

- **工作树**：`.worktrees/task-3113`（分支 `feat/task-3113-issue-3113`）
- **审查对象**：仅最新提交 `01dc8479a`（第三轮整改）
- **上游**：`b38032fd9`（第二轮）、`3cadcb476`（第一轮）；**基底** `4452f7592`
- **审查方式**：只读 + 出仓探针（`/tmp` 内建变体复跑真实测试文件），**未改动工作树任何文件**
- **裁定**：**PASS**（无必修项；4 项修复全部复核为「真修且行为安全」，另带 2 项 Low 级残留，见 §5）

## 0. 只读证明与基线

```
$ git -C <工作树> rev-parse HEAD
01dc8479afe46f48465b5153e83a15a22fe1ab55
$ git -C <工作树> status --porcelain        # 空
$ git -C <工作树> diff                      # 空
$ git -C <工作树> diff --cached             # 空
```

本轮全部临时实验都在 `/tmp/r3probe/` 完成（复制源码到 `/tmp` 后改写副本），工作树零写入。

**8 文件回归**（`node --import ./scripts/deny-network.mjs --test <8 files>`）：

| 轮次 | tests | pass | fail | REAL_EXIT |
|---|---|---|---|---|
| 第 1 次 | 184 | 183 | **1** | 1 |
| 第 2 次 | 184 | 184 | 0 | 0 |
| 末次（报告前） | 184 | 184 | 0 | 0 |

第 1 次的失败**不是本提交缺陷**，是装置缺陷，见 §3.1。

## 1. 逐条独立复核（不采信提交信息）

### M-B `medianByAccount` 按账号预计算 —— 真修，行为等价

`src/rival/rival-feed.js:424-427`：

```js
const medianByAccount = new Map()
for (const { account } of kept) {
  if (medianByAccount.has(account.id)) continue
  medianByAccount.set(account.id, feedMedianViews(postsByAccount[account.id]))
}
```

- **确实每账号只算一次**：以 `account.id` 为键去重，且遍历的是 `kept`（只含至少 1 行存活作品的账号）。实测计数桩（提交自带 Proxy 断言）在回退版本下读到 3 次、新版本 1 次 → 见 §2。
- **有无行为变化**：**无**。我把 `feedMedianViews(...)` 挪回 `kept.map` 回调（旧实现）后，对 10 组边界输入逐一比对新旧 `mergeAccountPosts` 的完整 JSON 输出，**0 组不同**（§4.1）。关键边界：
  - `kept` 为空 → 预计算循环体不执行，`medianByAccount` 为空 Map，`kept.map` 返回 `[]`，与旧实现一致。
  - 同一账号对象重复出现 → 被 `has()` 挡住；且**取值来源完全相同**（旧实现每行取 `postsByAccount[account.id]`，新实现取同一表达式），故复用不引入差异。
  - `account.id` 为 `undefined`/`null` 的多个账号 → 共享 Map 键，但它们的 `postsByAccount[account.id]` 本来也是同一个字符串键（`"undefined"`），median 输入相同 → 值仍相同。实测 DIFF=0。
  - 数字 `1` 与字符串 `'1'` → Map 视为两个键，但 `postsByAccount[1]` 与 `postsByAccount['1']` 解析到同一属性 → median 相同。实测 DIFF=0。
  - `feedMedianViews` 是纯函数、`toFeedRow` 不改写 post（只读 `post?.stats.*` 并构造新对象），所以「先算 median 再逐行建行」与「逐行算 median」不存在顺序耦合。
- **性能契约成立**：`feedMedianViews` 会对账号全量缓存列表（上限 `POSTS_CACHE_MAX_ROWS = 500`）排序，旧实现是 O(行数 × 历史排序)。调用点 `src/rival/rival-accounts-service.js:472` 是真实请求路径（非死代码），改善有效。

### M-C 相邻采样回滚检测 —— 真修，与 docblock 一致，正常序列不误伤

`src/rival/rival-feed.js:220-228`：逐对比较 `samples[i].views < samples[i-1].views`，命中即 `hasRollback = true` 并 break。

- **正常递增序列不被误伤**：单调不减（含相邻持平补采点）序列 `hasRollback = false`，实测仍产 `measured/rising vph=2333.3`（提交自带守卫用例在回退版本下**同样通过**，即该用例只防误伤、无鉴别力，属设计意图）。
- **单点 / 空 / 重复时间戳**：
  - 空或单点 → `samples.length >= 2` 不成立，新循环根本不进入，与旧实现等价。
  - 恰好 2 点 → 循环只跑 `i=1`，`!hasRollback` ⟺ `delta >= 0`，新增条件冗余无害；实测 2 点（3h 跨度）上升/下降/持平三例新旧输出**完全一致**（§4.2 S1–S3）。
  - 重复时间戳 → 排序只按 `at`（稳定排序保输入序），是否降级由 `span >= VELOCITY_MIN_SAMPLE_SPAN_MS`（1.5h）先行决定；跨度不足时新旧都跳过 A 档（§4.2 V3/V4 一致）。
- **与 docblock 一致性**：docblock「A views rollback is a data anomaly, never a negative speed — degrade」在本轮被完整覆盖（旧实现只看端点，`1000→500→3500` 端点差为正却签发 measured，与 docblock 相反）。spec `specs/account-monitor-velocity-3113.spec.md` 已同步登记该口径，**代码与规格一致**。
- **冗余**：`!hasRollback` 在逻辑上已蕴含 `delta >= 0`，`&& delta >= 0` 属防御性冗余，无害，不构成缺陷。

### Low-1 `RIVAL_VELOCITY_RANK_FAMILY` —— 真修且无残留内联，无循环依赖

- `src/rival/constants.js:67` 新增 `Object.freeze({rate:2, relative:1, none:0})`；`velocityRankKey`（`src/rival/rival-feed.js:454-464`）三处返回全部改用具名成员。
- **无残留内联族序**：全仓 `grep -rn "velocityRank\|\[2, \|\[1, "`（排除 `.esbuild-cache`）仅命中 `constants.js` / `rival-feed.js` 的**文档注释散文**（提到历史 `1e9` 方案）与调用点，**无任何内联族序字面量**。
- **导入无循环依赖**：`constants.js` **不含任何 `import`**（全文件只有 `export`），`rival-feed.js` 单向依赖它 → 不存在环。生产侧消费者唯一（`velocityRankKey`），语义域与同文件的 `RIVAL_VELOCITY_TIER_WATCH = 200` 同处集中，符合注释所述意图。

### Low-5 `velocityNote` 增加信号门 —— 真修，与卡胶囊同门，无过度抑制

- `src/client/RivalPostPreviewModal.jsx:36`：`if (!rivalVelocityHasSignal(velocity)) return ''`。
- **与卡胶囊确实同门**：卡侧 `rival-masonry.js:625` 的 `rivalHasPill = (card) => rivalVelocityHasSignal(card?.velocity)`，与弹窗调用的是**同一个导出函数**；文案侧 `rivalVelocityText` 也用同一个地板常量 `VELOCITY_RATE_FLOOR_VPH = RIVAL_VELOCITY_TIER_WATCH = 200`（`rival-format.js:18`）。三处同域。
- **无过度抑制（实测）**：回退该门后，两条「门不误伤」断言（速率族 1800/h、相对族 4.2x 的逐字文案）**仍然通过**，只有三条「谓词判 false 的残留描述」转红（12 tests / 9 pass / 3 fail，与主理人给出的参考值逐字吻合）。即该门恰好只杀残留描述，不误杀真实信号。
- **机理上也不会误杀**：`feedVelocity` 产出的 measured/average 描述必经 200/h 门，relative 描述必经 `multiplier >= VELOCITY_RELATIVE_MIN_MULTIPLIER`（`rival-feed.js:274`）→ 宿主真实产出的描述恒满足谓词，该门对生产路径是 no-op，只对缓存残留/手造描述生效。

## 2. A. 新断言有没有鉴别力？（逐条实测）

**方法**：把源码复制到 `/tmp/r3probe/<变体>/`，在副本上做**定向回退**，用**提交自带的真实测试文件**跑，看断言是否转红。副本控制组 `base` 36/36 通过，证明装置本身有效。

| # | 断言（提交自带） | 回退方式 | 实测结果 | 鉴别力 |
|---|---|---|---|---|
| 1 | `中位数按账号只算一次：同一账号 N 行 feedMedianViews 恰被调用一次` | M-B：median 挪回 `kept.map` 回调 | `36 tests / 35 pass / 1 fail`，唯一红项即该断言 | **有** |
| 2 | `中间采样回退（端点 delta 仍为正）→ 降级，不产 measured` | M-C：删掉逐对循环，恢复端点判定 | `36 / 35 / 1`，唯一红项即该断言 | **有** |
| 3 | `相邻采样单调不减（含持平补采点）仍照常产 measured` | 同上（M-C 回退） | **仍通过**（新旧皆绿） | 无（设计意图：只防误伤） |
| 4 | `族序序号来自 constants.js 的具名常量（速率 > 相对 > 无信号）` | ① 恢复内联 `[2,…]/[1,…]/[0,…]`，**常量保留导出** | **`36 / 36 / 0` 全绿** | **无** |
| 4′ | 同上 | ② 连同常量一并删除（等价提交前源码） | `36 / 35 / 1`，红项即该断言（`undefined.rate` TypeError） | 仅能抓「常量缺失」 |
| 5 | 弹窗三条「谓词判 false 的残留描述不渲染」 | Low-5：删掉 `if (!rivalVelocityHasSignal(...)) return ''` | `12 tests / 9 pass / 3 fail`，红项恰为这三条 | **有** |
| 6 | 弹窗两条「谓词判 true 的口径行逐字不变」 | 同上 | **仍通过**（新旧皆绿） | 无（设计意图：只防误伤） |

**结论**：

- M-B、M-C、Low-5 的新断言**具备鉴别力**，回退即红，红得准（唯一/恰为该断言）。
- **Low-1 的新断言不具备鉴别力**：它断言的是**常量自身的数值次序**（`rate > relative > none`），而它声称要防的回归是「**sorter 恢复内联族序**」。把 sorter 改回内联字面量、常量原地保留导出时，断言全绿 —— 断言与缺陷不同轴。它只在常量被删除时才红。**若要把这条修成可鉴别，必须改断言对象**（例如：对 `velocityRankKey` 的返回元组做行为断言，或断言 `rival-feed.js` 源码不出现族序字面量），而不是断言常量自身。
- 三条「防误伤」断言按设计不具鉴别力（新旧皆绿），这是它们存在的意义，但**不能计入「红/绿证据」**：它们的绿不能证明修复存在。

## 3. B. 测试装置有没有缺陷？

### 3.1 8 文件首跑的那 1 个 fail：缓存目录跨进程竞争（真装置缺陷，非本提交缺陷）

第 1 次回归的失败项：

```
✖ renders no platform dropdown while a single platform is known
  Error: ENOENT ... open '.../src/client/.esbuild-cache/section/section-0.mjs'
    at writeFileSync (…/inspiration-section-render.test.js:82:3)
    at bundleSection (…:60 mkdirSync 之后、esbuild.build 之后)
```

定位与判据：

1. `inspiration-section-render.test.js` 是**唯一**触碰 `.esbuild-cache/section` 的文件（全仓 grep 仅命中它）。
2. 该文件单独跑 `9 tests / 9 pass / 0 fail`（REAL_EXIT=0）；8 文件整体重跑 `184/184`。
3. 时序：`mkdirSync(cacheDir)` → `await esbuild.build(...)` → `writeFileSync(outFile)`；ENOENT 出现在 `writeFileSync`，说明**目录在 await 期间被删**。删除者只可能是该文件自己的 `after(() => rmSync(cacheDir, …))`（第 193 行）在**另一个进程**中执行。
4. 首跑期间实测到同一工作树内有并发测试进程在跑（`node --import ./scripts/deny-network.mjs --test src/explore/...`，17:53），即本仓多会话/多 agent 并行工作流的常态。

⇒ **缓存目录不是进程隔离的**：同一工作树内并发跑同一测试文件时，A 进程的 `after()` 删掉 B 进程刚建好的目录。**这是会让复核者误判为 BLOCKING 的假红**（我首跑就中招）。建议把 cacheDir 改为进程私有（如 `join(here, '.esbuild-cache', 'section-' + process.pid)` 或 `mkdtempSync`），或在 `after()` 只删自己的产物。严重度：中（装置层，非产品）；不影响单跑/CI（CI 只跑一次）。

### 3.2 「断言移出 try」的改法是否彻底：**不彻底**

提交把 5 条新断言的取值留在 `try`、断言移到 `unmount()` 之后。实测该改法**有效**：Low-5 回退后 `12/9/3`，三条红项**逐条具名并带 AssertionError 明细**，无文件级挂死，耗时 561ms。

但范围只覆盖了**新增的 5 条**。同一文件内：

```
rival-post-preview-modal.test.js：12 个 try/finally，其中 7 个仍在 try 内断言
```

7 条既有用例（`RivalPostPreviewModal.jsx` 口径行与封面相关，第 114–188 行）**仍把 `assert` 写在 `try` 里**。若「抛在 try 内会挂死」这一风险成立，它在这 7 条上依然存在 —— 该约定是「新用例照办、旧用例不动」，不是「装置修好了」。

### 3.3 装置被别处复用：**广**（同一 mount-打包-断言模式）

`src/client/*.test.js` 中带 esbuild 打包装置的 20 个文件，`assert` 落在 `try` 内的计数：

| 文件 | try/finally | 其中 assert-in-try |
|---|---|---|
| `InspirationImportStatus.test.js` | 24 | 24 |
| `rival-post-card.test.js` | 16 | 16 |
| `account-monitor-feed-render.test.js` | 14 | 14 |
| `rival-post-preview-modal.test.js` | 12 | **7**（5 条新用例已修） |
| `rival-pool-health-render.test.js` | 10 | 10 |
| `inspiration-section-render.test.js` | 9 | 9 |
| `import-landing-render.test.js` | 8 | 8 |
| `rivals-layout-render.test.js` | 6 | 6 |
| `inspiration-category.e2e.test.js` | 3 | 3 |
| `qa-empty-state-entry.test.js` | 2 | 2 |
| `rival-accounts-panel.test.js`、`inspiration-selection-bar.e2e.test.js` | 各 1 | 各 1 |

即 **10 个兄弟文件、约 90 条断言仍在该模式内**。同时「每次挂载重跑 esbuild 冷构建」也是这套装置的共性（`mountModal` 每次调用 `await bundleStage()`，无缓存复用）——本文件实测 12 次挂载共 539ms，冷构建代价在本机可接受，但该模式被 20 个文件复制。

### 3.4 提交所述「挂死 ~160–218s、只报文件级 test failed」：**本次未能复现**

为独立验证，我在 `/tmp` 副本里**故意把一条既有用例的断言写错（保留在 `try` 内）**并运行：

```
REAL_EXIT=1 ELAPSED=1s
ℹ tests 12  ℹ pass 11  ℹ fail 1
✖ 均速档逐字「按发布至今的平均速度估算」
（日志含 AssertionError 明细）
```

⇒ 单次挂载 + `try` 内断言抛错 + `finally` 内 `unmount()`，**没有挂死，也给出了具名与明细**。因此「try 内断言必然挂到超时」这一机制**在当前装置上不成立**（至少不是由 try 位置单独决定；此前观测到的 160–218s 更可能由当时的多重挂载/冷构建叠加所致，本轮已无法复现）。

结论：§3.2 的「不彻底」是**约定未统一**的问题，**不是**「还有会挂死的路径」的实证。严重度：低；建议后续统一该文件的断言位置（并可选择性推广到 §3.3 的兄弟文件），但**不构成本轮阻断**。

## 4. C. 有没有新缺陷？

### 4.1 `medianByAccount` 边界行为：无新缺陷

10 组边界输入的新旧实现输出**逐字节相同**（`0 differing case(s) of 10`）：

```
SAME  A 单账号 3 行            SAME  F 空作品账号 + 有作品账号
SAME  B kept 为空（筛选全落空）  SAME  G 3 账号交错
SAME  C 两个账号对象同 id       SAME  H views 全不可读（median=0）
SAME  D 两个账号都缺 id         SAME  I 同 id 但作品列表不同
SAME  E id 为数字 1 与字符串 '1'  SAME  J platform 筛选掉一个账号
```

`kept` 为空、账号重复、缺 id、id 类型混杂均**无行为变化**（分析见 §1 M-B）。

### 4.2 M-C 的行为面：3 处新增降级，均为规格要求的意图内变更

`post.stats.views=12000, medianViews=100`，新旧对比（`SAME/DIFF`）：

| 序列 | 新 | 旧 | 判定 |
|---|---|---|---|
| S1 2 点上升（3h） | measured/rising 1000 | 同 | SAME（2 点等价） |
| S2 2 点下降（3h） | relative x120 | 同 | SAME |
| S3 2 点持平（3h） | relative x120 | 同 | SAME |
| S4 4 点单调（4h） | measured/rising 1250 | 同 | SAME |
| S5 **同时间戳**内相邻对下降、端点上升 | relative x120 | measured/rising 2750 | DIFF（意图内） |
| S6 同时间戳内相邻对上升 | measured/rising 2750 | 同 | SAME |
| S7 中间回滚后恢复 | relative x120 | measured/rising 2000 | DIFF（意图内，即 M-C 本体） |
| S8 仅首对下降、端点上升 | relative x120 | measured/watch 750 | DIFF（意图内） |

三处 DIFF 全部满足本轮写入规格的「任一相邻对 `views[i+1] < views[i]` 即视为回滚」，**与规格一致，不是新缺陷**。

唯一值得记录的**边界语义**（S5）：采样仅按 `at` 排序，同时间戳的两点在稳定排序下保持输入序；此时「谁回滚了谁」没有时间依据，规则等价于「同时间戳出现更低值即否决 measured」。该判定偏保守（宁可降级也不签发 measured），与 docblock 的「数据异常即降级」同向，**可接受，无需改动**；仅当上游确实会用同时间戳做「同刻更正」时，才需要重新评估。

### 4.3 其它检查

- `!hasRollback` 已蕴含 `delta >= 0` → `&& delta >= 0` 为冗余防御，无害（Low，不催办）。
- 新增逐对循环 O(历史点数)，`VIEWS_HISTORY_MAX = 30`，可忽略。
- `RIVAL_VELOCITY_RANK_FAMILY` 为 `Object.freeze`，无被误改风险；`constants.js` 无导入，无环。

## 5. OCR 行级审查（本机开源代码审查 CLI）

```
$ ocr review --commit 01dc8479a --audience agent --format json \
    --output /tmp/ocr-r3.json --background "<本轮四项整改业务背景>"
```

- **执行**：`ocr v1.12.12`，provider `dsh-cpa` / model `gpt-5.5`，commit 模式，实际区间 `b38032fd9..01dc8479a`，`terminal_state: complete`，17s / 25329 tokens，EXIT=0。
- **覆盖**：`coverage.selected` / `completed` 恰为 3 个生产文件 —— `plugins/omnimux-inspiration/src/rival/rival-feed.js`、`src/rival/constants.js`、`src/client/RivalPostPreviewModal.jsx`；测试与文档文件未纳入（预期行为）。
- **行级意见：0 条**（`summary.comments = 0`，`comments: []`）。因此**本轮无可逐条判真/假阳性的条目**。
- **假阳性清单说明**：本仓确无 `.eslintrc*` / `eslint.config.*` / biome / oxlint（已实测目录与插件目录均不存在），故「引用项目代码质量规则」类条目**本轮未出现，判据不适用**。若后续轮次出现该类条目，仍应按「规则来自 CLI 自带清单 → 假阳性」处理。
- **注意**：0 条 = 本轮 CLI 未发现行级问题，**不等于**本轮无问题。§2 的 Low-1 断言无鉴别力与 §3 的装置问题，均属该 CLI 覆盖范围之外（它审生产代码行，不审测试断言与装置的鉴别力）。

## 6. 裁定与清单

**裁定：PASS**（无必修项）

理由：四项修复**全部复核为真修且行为安全**（M-B 10/10 输入行为等价；M-C 与 docstring/规格一致且正常序列不误伤；Low-1 常量集中、无残留内联、无循环依赖；Low-5 与卡胶囊同门且无过度抑制）；8 文件回归在干净环境下 `184/184 REAL_EXIT=0`；未发现产品级新缺陷。残留项均在**测试证据质量与装置健壮性**层面，不影响本次改动可交付性。

### 已解决的旧项（本轮四条，全部确认收口）

| 项 | 位置 | 判据 |
|---|---|---|
| M-B 每行重算中位数 | `rival-feed.js:424-427` | 按账号去重预计算；10/10 边界输入新旧输出相同；调用点在真实请求路径 |
| M-C 只看端点漏判中间回滚 | `rival-feed.js:220-228` | 逐对比较；`1000→500→3500` 由 measured 降为 relative x35；单调序列不误伤 |
| Low-1 族序内联字面量 | `constants.js:67` + `rival-feed.js:454-464` | 具名常量集中；全仓无残留内联族序；`constants.js` 无导入，无环 |
| Low-5 弹窗口径行与卡胶囊不同门 | `RivalPostPreviewModal.jsx:36` | 复用同一 `rivalVelocityHasSignal`；回退即 3 条红；真实信号不误伤 |

### 残留项（不阻断，建议后续收口）

| # | 项 | 位置 | 判据 | 鉴别力判断 |
|---|---|---|---|---|
| R1（Low） | **Low-1 的新断言无鉴别力** | `src/rival/rival-feed-velocity.test.js:519-520` | 恢复内联族序、常量保留导出 → `36/36` 全绿；仅删常量才红 | 断言对象是常量自身，与「sorter 恢复内联」不同轴；建议改为行为断言或源码级断言 |
| R2（Low） | **「断言移出 try」只覆盖新用例** | `src/client/rival-post-preview-modal.test.js:114-188` | 同文件 12 个 try/finally 中 7 个仍在 try 内断言；兄弟文件约 90 条同模式（§3.3） | 属约定未统一；本轮实测**未能复现**「try 内断言必挂死」（单挂载失败 1s 内具名报红），故无实证危害 |
| R3（中·装置） | **`.esbuild-cache/<dir>` 非进程隔离，并发跑同文件假红** | `src/client/inspiration-section-render.test.js:38/60/193`（同模式另有 19 文件） | 首跑 8 文件 `183/1`，ENOENT 在 `writeFileSync`；单跑 9/9；重跑 184/184；并发进程实测存在 | 会让复核/QA 误判为 BLOCKING；建议 cacheDir 带 `process.pid` 或用 `mkdtempSync` |

### 新发现项

- **产品级新缺陷：无。**
- 唯一新增观察（S5 同时间戳相邻对下降 → 否决 measured）为**规格意图内**的保守降级，非缺陷；仅在「上游用同时间戳做同刻更正」的假设下才需重新评估。

## 7. 证据留档

| 证据 | 路径 | 内容 |
|---|---|---|
| 基线回归 | `/tmp/r3-baseline.log`、`/tmp/r3-baseline2.log`、`/tmp/r3-final.log` | 184/183/1 → 184/184/0 → 184/184/0 |
| M-B/M-C/Low-1 回退探针 | `/tmp/r3probe/{base,mb,mc,low1,low1del}/` + `*.log` | base 36/36；mb 35/1；mc 35/1；low1 **36/0**；low1del 35/1 |
| 行为等价探针 | `/tmp/r3probe/equiv.mjs`、`mc2.mjs` | mergeAccountPosts 10 例 0 DIFF；M-C S1–S8 行为表 |
| Low-5 弹窗探针 | `/tmp/r3probe/{plug,plug-rev,plug-try}/` + `modal-*.log` | base 12/12；回退门 12/9/3（三条具名红）；try 内断言失败 1s 具名报红 |
| OCR 结果 | `/tmp/ocr-r3.json` | 3 文件 / 0 条意见 / 25329 tokens |

> 探针均在 `/tmp` 内运行；工作树自始至终 `git status` 为空、`HEAD` 未变（见 §0）。
