# PM 终验 · 第三轮改动（`01dc8479a`）· UI 元素与文案一致性签收

- **验收对象**：工作树 `.worktrees/task-3113`，分支 `feat/task-3113-issue-3113`，HEAD `01dc8479a`（基底 `4452f7592`；三轮链 `3cadcb476` → `b38032fd9` → `01dc8479a`，7 文件 `+310/−8`）
- **验收范围**：本轮四处改动（median 按账号预计算 / A 档回滚逐对检查 / 族序具名常量 / 弹窗口径行同门）
- **本次为只读终验**：未改动任何业务源码；新增产物仅本文件
- **权威规格**：`specs/account-monitor-velocity-3113.spec.md`、`docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md`（§2 D3、§3.3、§3.4、§3.6、§9.1、§9.4、§9.6）、原型 `docs/prototypes/account-monitor-v2-prototype.html`、`design.md` v2.0
- **前两轮**：`pm-signoff-r2.md`、`pm-signoff-r3.md`（均 PASS）；本轮为对第三轮提交的增量复验

---

## 0. 裁定

> **`PM_SIGN_OFF: PASS`**

| 项 | 结论 |
|---|---|
| 本轮四处改动 | **全部通过**（逐条见 §1） |
| 必修项（本轮改动引入） | **无** |
| 新发现缺口 | **1 条：O-1 弹窗口径行 `.omnimux-rival-detail-velocity` 全仓无 CSS 规则**（非本轮引入，建议随本票收口；见 §2.B） |
| 观察项 | O-2 ～ O-5（非阻断，登记备查，见 §3） |
| 阻断性结论 | 无。四件套齐备（§2.A），零越权元素（§2.C），文案域无新缺口（§2.D） |

---

## 1. 四处改动逐条判定

### 1.1 `rival-feed.js`：median 按账号预计算 —— **PASS（纯记忆化，可见文案与胶囊零变化）**

- **改法**：`kept.map(...)` 内的 `feedMedianViews(postsByAccount[account.id])` 提到 map 之前，按 `account.id` 记忆化为 `medianByAccount`；`feedVelocity` 的入参值不变。
- **等价性证据（旧路径重放探针）**：对同一夹具同时跑「新路径（`mergeAccountPosts`）」与「旧路径（逐行现算 `feedMedianViews(postsByAccount[acct.id])` 后调用 `feedVelocity`）」，逐行 `JSON.stringify` 比对 —— **7 行 / 3 账号 `mismatch 0`**。夹具覆盖：同账号 3 行（1000 / 9000 / 1000）、含 `views:0` 的账号、中位数为 0 的账号、含回滚历史的行。
- **键等价性论证**：`postsByAccount` 与 `counts` 本来就以 `account.id` 为键，同 id 账号共享同一份历史数组 ⇒ 「按 id 记忆化」与「逐行重算」数学同值；`kept` 为空时不调用，无分支差异。
- **可见面确认**：同一探针输出 `rivalVelocityText` / `rivalVelocityHasSignal`，语义与本轮前一致（示例行 `该号 4x` / `hasSignal=true`；无信号行 `""` / `false`）。`toFeedRow`、`rivalCardHeightPx`（瀑布流高度预算）本轮未被触碰。
- **结论**：**可见文案与胶囊零变化**，性能收益成立。

### 1.2 `rival-feed.js`：A 档回滚改为逐对检查相邻采样 —— **PASS（降级后果与 §3.3 一致，零新增越权文案）**

- **改法**：`for (i = 1..) if (samples[i].views < samples[i-1].views) { hasRollback = true; break }`，与既有 `span >= 1.5h && delta >= 0` 合取后才产 `measured`。
- **与规格逐字对应**：spec「规格缺口说明」A 档中间采样回退条（L102-105）：「`views_history` 任一相邻对 `views[i+1] < views[i]` 即视为数据异常回滚，不产 measured、降级到下一档（与端点 `delta<0` 同列失败形态；函数 docblock『a views rollback is a data anomaly, never a negative speed — degrade』的完整覆盖）」。
- **降级链未变**：A 落空 → **先经 B**（同一 `views` 的真实发布均速，过同一 200/h 门）→ B 亦落空才落 C（倍数族不受 200/h 约束）→ 三者皆不可用 `null`。这正是 `pm-signoff-r3.md` §2.2 驳回「A 直接跳 C」后的既定口径，本轮未回退该裁定。
- **断言鉴别力**（`rival-feed-velocity.test.js`）：
  - `1000 → 500 → 3500`（端点 delta `+2500` 为正，旧实现会签成 measured）→ **不产 `measured`**，落点 `relative / multiplier 35`（`posted_at:null` 使 B 落空、median 100 使 C 成立，降级落点被钉死）；
  - 单调不减且含持平补采点 `1000 → 1000 → 8000` → 仍产 `measured / rising / vph 2333.3`（**不误伤**；相邻相等不算回滚）。
- **文案面**：该改动只改变「哪一档成立」，三档文案仍全部取自字典键。本轮 diff 中非测试源码**无任何新增可见字符串**（新增引号串只有模块路径 `'./rival-format.js'` 与标识符）。
- **结论**：降级后果与 §3.3 一致；**不产生任何新的越权文案**。

### 1.3 `constants.js` + `rival-feed.js`：族序序号提为具名常量 —— **PASS（排序结果不变）**

- **改法**：`RIVAL_VELOCITY_RANK_FAMILY = Object.freeze({ rate: 2, relative: 1, none: 0 })`（与 `RIVAL_VELOCITY_TIER_WATCH` 同处集中），`velocityRankKey` 三处 `2/1/0` 字面量改为引用常量。比较器仍为二元组 `[family, value]`，未改结构。
- **数值全等**：`rate=2 > relative=1 > none=0` 与原内联值逐一相等 ⇒ 全序不变。
- **实测排序**：`sortFeedRows([hot 23000, watch 200, relative 50, null], 'velocity')` → **`x4, x1, x2, x3`**（速率族按 vph 降序 → 相对族按倍数 → 无信号垫底），与 spec 测试策略条「`sortFeedRows('velocity')`：vph 降序 → relative 按倍数降序 → null 最后」及 §9.6 V2 同序。
- **入桶门与渲染门仍同值**：速率族入桶沿用 `RIVAL_VELOCITY_TIER_WATCH`（200），与客户端谓词/文案地板共享同一常量。

### 1.4 `RivalPostPreviewModal.jsx`：`velocityNote` 增 `rivalVelocityHasSignal` 门 —— **PASS（本轮唯一可见行为变化，判定为修复成立）**

门与卡胶囊、`rivalHasPill`、高度估算共用**同一个**谓词（定义在 `rival-format.js`，与 `rivalVelocityText` 同文件同数值域）。

| 输入描述 | 谓词 | 弹窗口径行 | 卡胶囊 |
|---|---|---|---|
| `{confidence:'average', tier:'average', vph:0}` | `false` | **不落行** | 无胶囊 |
| `{confidence:'relative', tier:'relative', multiplier:0}` | `false` | **不落行** | 无胶囊 |
| `{confidence:'average', tier:'average', vph:199.9}` | `false` | **不落行** | 无胶囊 |
| `{confidence:'average', tier:'average', vph:1800}` | `true` | `按发布至今的平均速度估算` | `均速 1.8k/h` |
| `{confidence:'relative', tier:'relative', multiplier:4.2}` | `true` | `与该账号历史播放中位数对比` | `该号 4.2x` |

- **谓词 false 的残留不再落口径行**：`vph:0` / `multiplier:0` / `vph:199.9` 三种残留（缓存里仍带 `confidence` 字符串）现在与卡胶囊**同门抑制**，符合「无信号不留位」在卡与弹窗上是同一条规则的要求。
- **谓词 true 的正常信号逐字不变**：
  - `vph:1800` 的 `average` → `按发布至今的平均速度估算`（= PRD §2 D3 `detail.velocityNote` 均速句 = §3.6 `detail.velocity.average`）；
  - `multiplier:4.2` 的 `relative` → `与该账号历史播放中位数对比`（= PRD §3.6 `detail.velocity.relative`）。
- **`measured` 支路保留**：仍为 `基于 {t1} 与 {t2} 两次采样`（`HH:mm`），且 `samples_at` 任一端不可解析时不落行（四轴 M9 口径未被本门覆盖或改写）。
- **没有新增任何未在文案字典里的字**：本轮**未改动 `locales.js`**；弹窗新增内容仅一行 `import` 与一行门判断；JSX 未新增元素、图标、标签、副标题、分隔线。非测试源码新增引号串零条。
- **一致性收益**：卡胶囊 / 弹窗口径行 / 高度估算三处的「有没有信号」现在只有**一处定义**（共享谓词），消除了「同一份信号域各写各的门」的第三次复发。

---

## 2. 必须回答的四问

### A. 四件套齐备性 —— **齐备，无缺件，不阻断**

| 件 | 落点 | 状态 |
|---|---|---|
| PRD | `docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md`（§1 概况与口径声明 + §1.2 Non-Goals + §2 元素白名单 + §3 逐字文案字典 + §5 验收 Checklist + §8 签收回填 + §9 v2.1） | 齐（2026-10-05 落盘，含 PM 签收记录 §8） |
| 原型 | `docs/prototypes/account-monitor-v2-prototype.html`（单文件自包含；`PM_SIGN_OFF: PASS`，17 张截图 / 42 项交互断言） | 齐 |
| Spec | `specs/account-monitor-velocity-3113.spec.md`（本票规格；本轮同 commit 追加两处口径：严格逐档降级链、相邻采样回滚） | 齐 |
| Plan | `docs/implementation/account-monitor-v2-plan-notes.md`（638 行，#3110–#3114 实施参考；自述「不是规格、不是票面、不具验收权威」，冲突时**规格 > 票面 > 本文**）+ PRD §7 实施计划 | 齐 |

- **时序**：本轮新增的两条口径真源是 `pm-signoff-r3.md`（16:23）中的 PM 裁定，代码 17:52 才落盘 ⇒ **规格先于实现**。同 commit 内落 `specs/*.md` 亦满足本仓「规格前置」硬门禁。
- **结论**：本轮**不违反**「前端动工前必须确认 PRD / 原型 / Spec / Plan」；无缺件，不阻断。

### B. `design.md` 遵循状态 —— **有该文件；本轮零新增违规；发现 1 处存量未落地（O-1）**

- **文件存在**：仓库根 `design.md`（v2.0，自述「权威等级：L1（最高设计与交互契约）」，适用范围明列 `plugins/omnimux-inspiration`）。
- **本轮改动面核对**：本轮唯一含界面的文件是 `RivalPostPreviewModal.jsx`，改动只是「对既有 `<p>` 增加条件渲染」。**未新增元素、未新增颜色/字号/圆角/间距、未新增组件、未引入内联样式** ⇒ 对 design.md 的 token 体系（`--dsw-*`）、32px 控件高基准、8px 圆角体系、WCAG AA 对比度底线**零新增违规**。
- **O-1（存量缺口，非本轮引入）**：`.omnimux-rival-detail-velocity` 在 `rival-styles.js`、`styles.js` 及**全仓任何 CSS 中都没有规则**（全仓 grep 仅命中 `RivalPostPreviewModal.jsx` 与测试文件）。同容器兄弟行 `.omnimux-rival-detail-time` 则有 `margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary)`。后果：
  1. 该行以**浏览器默认 `<p>`** 呈现 —— 默认 `margin-block: 1em` 与 `.omnimux-rival-detail-body` 的 `gap: 10px` 叠加，垂直间距约为设计值两倍以上；
  2. 字号/颜色继承弹窗上下文，未经 token 收敛；
  3. 原型 `.detail-note`（`margin-top:14px; padding-top:12px; border-top:1px solid var(--dsw-alias-border-l1); font-size:11px; line-height:1.6; color: var(--dsw-alias-label-tertiary)`）的视觉语言未落地（含那条分隔线）。
  - **来源**：首轮 `3cadcb476` 起即如此；R2/R3 只核了**文案**（「只承载 §3.6 那一句原文」），未核样式。
  - **建议修法**（不新增文案/元素，仅补一条规则）：在 `rival-styles.js` 详情弹窗段补
    `.omnimux-rival-detail-velocity { margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }`
    与兄弟行对齐；若要完全贴原型，再叠 `padding-top` 与 `border-top`（用 `--dsw-alias-border-l1`）。修后按 design.md §2.6 复测对比度（`label-secondary` 在两主题均 ≥ 4.5:1，PRD §9.2 已实测 7.1:1 / 9.4:1）。
  - **是否阻断**：**不阻断本轮裁定**（不在本轮四处改动内，文案与行为均正确）；但**建议随本票收口**，并同步登记进 spec「规格缺口说明」（当前 spec 未登记该样式缺口）。

### C. 零越权元素 —— **通过（逐字对照文案字典）**

- **本轮新增内容清点**：注释、`import`、谓词门、`hasRollback` 循环、`medianByAccount` 预计算、具名常量、测试断言、spec 文字、`fix-round.md`。
- **非测试源码新增可见字符串：零条**（仅模块路径与标识符）。
- **未新增**：标签、图标、副标题、括号解释、分割线、提示条、装饰元素；`locales.js` 未被本轮改动。
- **逐字对照**（弹窗三句 vs 字典）：
  | 实现渲染 | PRD 逐字 | 结论 |
  |---|---|---|
  | `基于 {t1} 与 {t2} 两次采样` | §2 D3 `detail.velocityNote` 实测句 / §3.6 `detail.velocity.measured` | 一致 |
  | `按发布至今的平均速度估算` | §2 D3 均速句 / §3.6 `detail.velocity.average` | 一致 |
  | `与该账号历史播放中位数对比` | §2 D3 相对句 / §3.6 `detail.velocity.relative` | 一致 |
- **胶囊侧抽验**：`均速 1.8k/h`（§9.4 #5）、`该号 4.2x`（§9.4 #8）与演示表逐字一致；相对档无 `/h`、无 `k/h`、无热度前缀（§3.3 绝对禁止条）。
- **边界复核**：`card.relativeBadge` 未重开、未加第 5 个排序项、未新增表现筛选档、未新增采集/云调用 —— 本轮均未触碰。

### D. 新发现的文案/口径缺口

- **文案域：无新缺口。** 两处已知遗留已在 spec **成对登记**（L106-109）：
  1. A 档采样窗口取「最早与最晚有效采样」，PRD §5.1 字面为「最近两次」→ **登记遗留，本票不改**；
  2. 同一 PRD 行另载「指数平滑（近一次权重 0.7）」，实现无平滑 → **登记遗留，本票不改**（spec 明写「与上一项成对登记，PM signoff R3 §3 要求」）。
  两条口径的出处是 `docs/implementation/account-monitor-v2-plan-notes.md` §3（A 档行），而该文档自述「不具验收权威」⇒ 以 spec 登记为准，**不构成违规**。
- **样式/Token 域：新增 1 条未登记缺口 O-1**（详见 §2.B）。按「成对登记」原则，建议同步写进 spec「规格缺口说明」，或在收口时直接删除该缺口。

---

## 3. 观察项（非阻断，登记备查）

| # | 内容 | 状态 |
|---|---|---|
| O-1 | 弹窗口径行 `.omnimux-rival-detail-velocity` 无 CSS 规则（浏览器默认 `<p>`；与原型 `.detail-note` 不一致） | **新发现**，建议随本票收口（§2.B 附修法） |
| O-2 | 实测档 `{t1}/{t2}` 按本机时区渲染 `HH:mm`，与 §9.4 演示数据的采样标签不复现 | 延续 R2/R3 |
| O-3 | 排序下拉位于 tools 簇末尾（#3110 既有形态，不在本票范围） | 延续 R2/R3 |
| O-4 | en 层 `rivalFeed.pill.relative = 'Acct.'` 为缩写，PRD 未锁 en 逐字 | 延续 R2/R3 |
| O-5 | `rivalVelocityText` 的兼容支路 `{text}` 会使「谓词 true、弹窗口径行为空」（卡上有胶囊、弹窗无解释行）。当前 Host 只产结构化描述（`feedVelocity`），该支路仅对手造 wire 行可达 | 新增，极低，不作缺陷 |

---

## 4. 证据与复现

### 4.1 测试（`cd plugins/omnimux-inspiration`，`node --import ./scripts/deny-network.mjs --test …`，`> log 2>&1; echo REAL_EXIT=$?` 交叉验证）

| 范围 | 结果 | 退出码 |
|---|---|---|
| 本轮相关 8 文件（`rival-feed-velocity` / `rival-feed` / `rival-post-preview-modal` / `rival-format` / `rival-masonry` / `rival-filter` / `rival-post-card` / `rival-velocity.e2e`） | **191 tests / 191 pass / fail 0** | `REAL_EXIT=0` |
| 其中核心 2 文件（`rival-feed-velocity` + `rival-post-preview-modal`） | **48 tests / 48 pass / fail 0** | `REAL_EXIT=0` |
| 插件全量（`src/*.test.js src/rival/*.test.js src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js`） | **1179 tests / 1176 pass / fail 1** | `REAL_EXIT=1` |

**唯一红挂为环境性**：`src/client/rival-filter-polish.e2e.test.js` —— esbuild 在临时目录解析不到 `react-dom/client` / `react/jsx-runtime`（工作树缺 `repoRoot/node_modules` 解析链），与本轮改动无关（`fix-round.md` 已记录基底同形挂；该票不修）。本轮改动**未新增任何红挂**。

### 4.2 只读探针（`node --input-type=module -e`，未写盘）

1. **median 等价重放**：新路径 vs 旧路径逐行比对 → `mismatch 0`（7 行 / 3 账号）。
2. **排序**：`x4(hot 23000), x1(watch 200), x2(relative 50), x3(null)`。
3. **谓词 / 文案六例**：`vph:0`→`false/""`；`multiplier:0`→`false/""`；`vph:199.9`→`false/""`；`vph:1800`→`true/均速 1.8k/h`；`multiplier:4.2`→`true/该号 4.2x`；`measured 480`→`true/观察 480/h`。

### 4.3 视觉面说明（如实声明）

本轮**无样式改动**，故未新建浏览器装置、未新增截图；视觉面沿用人眼级复检的历史证据（`01-feed-dark-5col.png`、`02-feed-light-5col.png`、`03-feed-edge.png`、`04-relative-pill-hover.png`、`05-detail-velocity-note.png`、`r3-dark-full.png` / `r3-light-full.png` / `r3-*-zoom-*.png`）。**O-1 若要收口，必须补一张 D3 弹窗口径行近景截图**（人眼级复检后再放行）。

---

## 5. 与 R2/R3 的连续性

- R3 裁定的**严格逐档降级链**（先 B 后 C，不得 A 直接跳 C）在本轮未被回退：1.2 的回滚降级仍经 B 档判定。
- R3 的**甲案**（200/h 只否决速率族、不兼任相对族否决器）在本轮未被回退：1.4 的门只作用于「有没有可渲染信号」，不改变档位归属。
- R3 遗留的**装置缺陷**（弹窗断言抛在 `try` 内导致红阶段不可见）已在本轮修复（断言移至 `unmount()` 之后）。
- R3 要求的两项口径**成对登记**已落实（spec L106-109）。

**结论重申：`PM_SIGN_OFF: PASS`** —— 本轮四处改动逐条成立，可见文案 100% 落在 §2 D3 / §3.3 / §3.4 / §3.6 / §9.4 授权范围内，零越权元素；新增缺口 1 条（O-1，存量样式未落地）已如实登记并给出收口路径。

—— 许清楚（PM），第三轮增量终验
