# QA 交付后验收报告 · R4（Issue #3113 增速胶囊第三轮）

- 验收对象：工作树 `.worktrees/task-3113`，分支 `feat/task-3113-issue-3113`，**HEAD `01dc8479a`**（第三轮）
- 上游：`b38032fd9`（第二轮）、`3cadcb476`（第一轮）；基底 `4452f7592`
- 验收人：QA 严过关 · 方式：**只读**（未改任何业务源码或测试；`git rev-parse HEAD` 验收前后同为 `01dc8479a`）
- 全部数字由本报告作者独立复算，未采信任何上游报告

## 0. 复算时使用的枚举过滤器（复现集合边界）

| 段 | 过滤器（原样，由 shell 展开） | 命中文件数 |
|---|---|---|
| 8 文件集 | **显式文件列表**，非通配符：`src/rival/rival-feed-velocity.test.js src/rival/rival-feed.test.js src/client/rival-post-preview-modal.test.js src/client/rival-format.test.js src/client/rival-masonry.test.js src/client/rival-filter.test.js src/client/inspiration-section-render.test.js src/client/use-rival-feed-poll.test.js` | 8 |
| 第一段 | `src/*.test.js src/rival/*.test.js src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js` | 99 |
| 第二段 | `src/explore/*.test.js src/explore/*.e2e.test.js src/explore/trending/*.test.js src/explore/templates/*.test.js src/explore/skills/*.test.js` | 49 |

- **为什么不能用 `rival*` 复算 8 文件集**：`ls src/rival/rival*.test.js src/client/rival*.test.js` 实测命中 **25** 个文件，而 8 文件集里有 **2 个** 文件名不以 `rival` 开头、会被通配符漏掉：`src/client/inspiration-section-render.test.js`、`src/client/use-rival-feed-poll.test.js`。更窄的过滤器（如只取 `rival-*`）同样漏。
- 两段并集覆盖完整性实测：插件内 `find src -name '*.test.js'` = **128** 个；`comm -23` 对比两段清单 → **差集为空**（99 + 49 = 148 > 128 因两段清单有重复项；无任何测试文件落在两段之外）。

## 1. 相关 8 文件集

```
cd <工作树>/plugins/omnimux-inspiration && \
node --import ./scripts/deny-network.mjs --test <上述 8 个文件> > /tmp/qa8.log 2>&1; echo "REAL_EXIT=$?"
```

- `REAL_EXIT=0`
- `ℹ tests 184 / suites 43 / pass 184 / fail 0 / cancelled 0 / skipped 0 / todo 0`
- `ℹ duration_ms 1377.3`，wall `real 1.417s`
- **结论：184 / 184 / fail 0 —— 与主理人报数一致，独立复算通过。**
- deny-network 回执：本段 0 outbound attempts。

## 2. 插件全量段回归（第一段 + 第二段）

### 2.1 第一段（命令与 `package.json` 的 `test` 脚本第一段逐字相同，含 deny 装置）

```
node --import ./scripts/deny-network.mjs --test src/*.test.js src/rival/*.test.js \
  src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js > /tmp/qa-seg1.log 2>&1
```

- `REAL_EXIT=1`
- `ℹ tests 1179 / suites 285 / pass 1176 / fail 1 / skipped 2`
- 唯一红项：`src/client/rival-filter-polish.e2e.test.js`（180.5ms，文件级 `'test failed'`）→ **已知环境性红项**，`esbuild` 用 `nodePaths:[repoRoot/node_modules]` 而非 `absWorkingDir`，在任何 git 工作树内恒红；基底同形，本票不修。

### 2.2 第二段 —— **两种跑法数字不同，必须分开报**

**(a) 按 `package.json` 原样跑（第二段命令本身不带 `--import deny-network`）**

```
node --test src/explore/*.test.js src/explore/*.e2e.test.js \
  src/explore/trending/*.test.js src/explore/templates/*.test.js src/explore/skills/*.test.js
```

- `REAL_EXIT=0`，`ℹ tests 261 / pass 261 / fail 0`，日志内 **0 条** `DENY-NETWORK RECEIPT`
- 这正是主理人报的「第二段 261/261/fail 0」。

**(b) 与第一段同装置（显式加 `--import ./scripts/deny-network.mjs`）**

- `REAL_EXIT=1`，`ℹ tests 264 / pass 261 / fail 3`，**确定性复现（连续 3 次同形）**
- 3 个红项均为**文件级** `'test failed'`（无具名断言）：
  `src/explore/component.test.js`（4466ms）、`src/explore/skills/skills-tab.test.js`（2955ms）、`src/explore/trending/trending-source.test.js`（100ms）
- **根因（独立定位）**：这三个文件各有 `fetch` 出网尝试被 deny 装置拦下，回执分别为 **11 / 2 / 1** 次，目标均为 `/omnimux/inspiration?sort=views&page_size=48&page=1&type=video`。调用栈经 `/tmp/trace-net.mjs` 探针捕获：

  ```
  at fetchSourcePayload (.../plugins/omnimux/src/client/session-guide/trending/trending-source.js:525:23)
  at .../trending-source.js:603:18  (Array.map)
  at executeFetch (.../trending-source.js:599:21)
  at loadTrendingPage (.../trending-source.js:684:19)
  at TestContext.<anonymous> (.../omnimux-inspiration/src/explore/trending/trending-source.test.js:430:24)
  ```

  即该测试**故意**传 `{ fetchImpl: null, fetch: undefined }`（用例名「没有可用 fetch 时不抛错，直接报 unavailable」），源码按设计回落到 `globalThis.fetch`；断言本身**通过**（`unavailable` 是合法结果），但 `scripts/deny-network.mjs` 的 `process.on('exit')` 在「有出网尝试且 code===0」时强制 `process.exitCode = 1`，node 测试运行器据此把**整个文件**记为失败。
- **归属**：与本票无关且基底同形 —— `git diff --stat 4452f7592 01dc8479a -- plugins/omnimux/ plugins/omnimux-inspiration/src/explore/` **输出为空**（本票未触碰这两个目录的任何文件）。属**装置策略性红项**，不计入本轮。

### 2.3 合计

| 口径 | 测试数 | 通过 | 失败 | REAL_EXIT |
|---|---|---|---|---|
| 与 `package.json` 对齐（第一段带 deny / 第二段不带） | 1179 + 261 = **1440** | 1437 | **1** | 1 |
| 两段都带 deny 装置 | 1179 + 264 = 1443 | 1437 | **4** | 1 |

### 2.4 对「环境性红项」清单的两处更正

- **`rival-filter-polish.e2e.test.js` 恒红**：确认（第一段唯一红项）。
- **「assets 层 4 项因 `dsh-ui-kit` file: 依赖未物化而红」**：**未在本票两段中复现**。本票两段过滤器内**只有 1 个红项**（上表）。仓库内依赖 `dsh-ui-kit` 的测试文件分布在其他插件目录（`plugins/omnimux/src/client/*`、`plugins/omnimux-products/*`、`plugins/omnimux-studio/tests/*` 等），不在本票两段过滤器命中范围内。该 4 项若存在，其口径属仓库级/其他插件段，**不应记在 #3113 的插件全量段账上**。
- **「每段 0 outbound attempts」**：第一段成立；**第二段不成立**（11 + 2 + 1 = 14 次被拦）。见 2.2(b)。

## 3. 鉴别力：四处修复逐一注入式回退

方法：把 `01dc8479a` 的 `plugins/`+`packages/` 用 `git archive` 解到 `/tmp/qa3113`（`node_modules` 软链到主检出，未触碰工作树），对源码做**最小反向补丁**（每次只撤销一处修复），跑**第三轮新增断言所在的测试文件**，随后 `restore` 回 pristine。

| 回退项 | 最小反向补丁 | 命令 | 结果 | 变红的断言 |
|---|---|---|---|---|
| **R3-Low-5** | 删 `RivalPostPreviewModal.jsx` 中 `if (!rivalVelocityHasSignal(velocity)) return ''` | `--test src/client/rival-post-preview-modal.test.js` | **12 tests / pass 9 / fail 3**，REAL_EXIT=1 | ①`谓词判 false 的残留描述不渲染口径行（与卡胶囊同门，R3-Low-5）` ②`低于 200 地板的 vph 同样不渲染（门与卡胶囊同值）` ③`相对族 multiplier 为 0 同样不渲染（门与卡胶囊同域）` |
| **R3-M-C** | 删相邻采样回滚循环 + `&& !hasRollback` | `--test src/rival/rival-feed-velocity.test.js` | **36 / pass 35 / fail 1** | `中间采样回退（端点 delta 仍为正）→ 降级，不产 measured` |
| **R3-M-B** | 删 `medianByAccount` 预计算，`medianViews` 回到 `kept.map` 内联调用 | 同上 | **36 / pass 35 / fail 1** | `中位数按账号只算一次：同一账号 N 行 feedMedianViews 恰被调用一次` |
| **R3-Low-1** | 删 `constants.js` 的 `RIVAL_VELOCITY_RANK_FAMILY` 导出 + `rival-feed.js` 三处回到字面量 `2/1/0` | 同上 | **36 / pass 35 / fail 1** | `族序序号来自 constants.js 的具名常量（速率 > 相对 > 无信号）` |

- **每次回退恰好 1 条（Low-5 为 3 条）具名断言变红，无附带红项** ⇒ 四处修复各自可被独立鉴别，无「一条断言替四条修复背书」。
- **回退后 restore 复绿**：`--test src/rival/rival-feed-velocity.test.js src/client/rival-post-preview-modal.test.js` → `48 tests / pass 48 / fail 0`，REAL_EXIT=0。
- 与已知参考一致：Low-5 回退 `12/9/3` **逐字命中**。

## 4. 无过度抑制（正常信号必须逐字保留）

**单元层**（HEAD 绿跑）：弹窗测试文件内两条「门不误伤」断言通过 ——
`vph:1800` average → `按发布至今的平均速度估算`；`multiplier:4.2` relative → `与该账号历史播放中位数对比`。

**真机层**（见 §6，`probe-r4.mjs` 36/36 检查通过）：暗/亮两态下

| 正向对照 | 卡胶囊逐字 | 弹窗口径行逐字 |
|---|---|---|
| 速率族 `vph=1800` average | `均速 1.8k/h` | `按发布至今的平均速度估算` |
| 相对族 `multiplier=4.2` relative | `该号 4.2x` | `与该账号历史播放中位数对比` |
| 相对族 `multiplier=50` relative | `该号 50x` | —（未开弹窗，卡片层已核） |
| 实测档 `vph=23000` hot | `爆款 23k/h` | 含 `两次采样`（保留） |
| 实测档 `vph=235` watch | `观察 235/h` | — |

**结论：两族正常信号在卡与弹窗两侧均逐字不变，无过度抑制。**

## 5. 测试装置耗时（`src/client/rival-post-preview-modal.test.js`）

**当前文件整轮耗时（独立实测 3 次）**

```
node --import ./scripts/deny-network.mjs --test src/client/rival-post-preview-modal.test.js
```

| 次 | REAL_EXIT | `ℹ tests/pass/fail` | `duration_ms` | wall |
|---|---|---|---|---|
| 1 | 0 | 12 / 12 / 0 | 519.9 | 0.563s |
| 2 | 0 | 12 / 12 / 0 | 531.2 | 0.574s |
| 3 | 0 | 12 / 12 / 0 | 520.3 | 0.563s |

⇒ **亚秒级确认**；本报告实测 **≈0.52s（duration_ms）/ 0.56s（wall）**，比主理人报的 0.83s 更快（同一量级，不构成分歧）。

**「218s 挂死」的根因：主理人给的解释不成立，已由两个独立探针否证**

| 探针 | 装置 | 注入 | 结果 |
|---|---|---|---|
| **PROBE-A2**（本报告作者，`/tmp/qa3113` 副本） | **第三轮装置**（断言在 `unmount()` 之后、单次挂载） | 在 `try` 内故意写错一条 `assert.equal` | **13 tests / pass 12 / fail 1**，`duration_ms 845`，**具名 `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal`**，wall 0s |
| **PROBE-B**（本报告作者） | **第三轮前的测试文件逐字**（`b38032fd9` 版本） | 追加一条同样写在 `try` 内的必然失败断言 | **8 tests / pass 7 / fail 1**，`duration_ms 151831.9`（**151.8s**），**文件级 `'test failed'`，无具名断言** |

⇒ **「断言抛在 `try` 内会让文件挂死超时」被否证**：同一写法在第三轮装置上 0.85s 报出具名断言。挂死现象跟随的是**旧测试文件**，而不是断言位置。主理人给的「每次挂载都重跑 esbuild」也不足以解释（第三轮文件 12 次挂载、旧文件 10 次挂载，前者不挂）。

**该解释在提交内仍留存，但工作树里已被主理人自我撤回**：`01dc8479a` 提交的 `fix-round.md` 仍写着「断言抛在 `try` 内打断 jsdom/React 清理」；而工作树内**未提交**的 `docs/evidence/account-monitor-velocity-3113/fix-round.md` 已改写为「观察到挂死，但机制未定」，并列出两个否证探针与最可能原因（`.esbuild-cache` **非进程隔离** —— 同族文件 `inspiration-section-render.test.js` 的 `mkdirSync`/`writeFileSync` 被**另一进程**的 `after(() => rmSync(cacheDir))` 删目录 → ENOENT），并明确「不要在别处引用『try 内断言必挂死』」。

**本报告对根因的裁定**：现有证据**只能否证旧解释**，不足以确认新假设（本报告未在并发条件下复现 cache 竞争）。已确证的两条是：(1) 整轮耗时从百秒级降到 **0.52s**；(2) 红阶段现在能产出**具名断言**。挂死的**机制仍属未定论**，与工作树内更正文本一致。

## 6. 真机浏览器验证（暗/亮两态）

装置（新增于本票证据目录，可从 HEAD 一条命令重建）：`docs/evidence/account-monitor-velocity-3113/harness/`
复用 #3110 已提交装置（`build-demo.mjs` / `cdp.mjs` / `demo-entry.jsx` / `covers/`），并加 `?v3113=1` 追加本票谓词边界夹具（正对照 `f1/rel42/avg/hot/meas` + 残留 `vph0/gap/mult0/none`，账户取 `platform: x` 以落在 **on-surface 文本卡面**，即 28px 空行回归面）。

```
node docs/evidence/account-monitor-velocity-3113/harness/build-demo.mjs
python3 -m http.server 8713 --bind 127.0.0.1 --directory <该 harness 目录>
node docs/evidence/account-monitor-velocity-3113/harness/probe-r4.mjs "http://127.0.0.1:8713/demo.html"
```

- **`probe-r4: 36/36 checks passed`，REAL_EXIT=0**（暗 18 + 亮 18）
- 逐项：5 张正向卡胶囊逐字保留 ×2 态；4 张残留卡「无胶囊且**无空胶囊行**」×2 态；四张残留卡确在 on-surface 文本卡面；21 张卡里恰有 17 张带胶囊；弹窗 3 条正向逐字/保留 ×2 态；弹窗 4 条残留抑制 ×2 态。
- 产物：`probe-r4.json` + **16 张 PNG**（`r4-{dark,light}-full.png`、`-zoom-capsules.png`、`-modal-{avg,rel42,vph0}.png` 及 `-zoom.png`）。

**人眼级复检（display_file 级，已执行）**
- 暗/亮胶囊带（`r4-dark-zoom-capsules.png` / `r4-light-zoom-capsules.png`）：第一行 3 张正对照卡均带中性描边胶囊（`该号 50x` / `该号 4.2x` / `均速 1.8k/h`）；第二行 3 张残留卡（`vph=0` / `vph=199.9` / `multiplier=0`）标题顶格、**无胶囊、无 28px 空带**；第三行实测档红/橙实底胶囊（`爆款 42k/h` / `飙升 3.4k/h`）形态与裁定轮一致。暗亮两态同形，无破败、无留白黑洞。
- 弹窗（`r4-dark-modal-avg-zoom.png` / `r4-dark-modal-vph0-zoom.png`）：`avg` 卡在「播放/点赞/评论/分享」下方逐字显示 `按发布至今的平均速度估算`；`vph0` 卡**同一位置无该行**，版面不塌陷。

## 7. 裁定

| 轴 | 结论 |
|---|---|
| 第三轮四处整改的**代码质量** | **PASS** —— 四处均可独立鉴别、无过度抑制、真机暗/亮两态无回归 |
| 相关 8 文件回归 | **PASS** —— 184/184/fail 0，REAL_EXIT=0 |
| 插件全量段（与 `package.json` 对齐口径） | **PASS（带 1 项环境性红）** —— 1440 tests / 1437 pass / fail 1（`rival-filter-polish.e2e`，环境性，基底同形） |
| 测试装置耗时与红阶段可观测性 | **PASS** —— 0.52s，红阶段具名断言 |
| **本票证据文本的准确性** | **FAIL** —— 见下 |

### 路由结论

- **业务代码：NoOne**（无前端/后端/产品缺陷需修）。四处整改无需返工。
- **证据与报告文本：路由 QA / 主理人**（非代码轴），须修正三处：
  1. 「第二段 261/261/fail 0」只有在**去掉 deny 装置**时成立；带装置实为 264/261/**fail 3**（确定性）。「每段 0 outbound attempts」对第二段为**不实**（14 次被拦）。
  2. 「assets 层 4 项因 `dsh-ui-kit` 未物化而红」未在本票两段复现；本票两段只有 1 个红项。该 4 项不应记入 #3113 的段账。
  3. 「断言抛在 `try` 内导致 218s 挂死」的因果解释**已被否证**（PROBE-A2：同写法 0.85s 报具名断言），且**该解释仍留在 `01dc8479a` 的提交内容里**（`fix-round.md`），只有工作树未提交版本做了更正 ⇒ **提交与工作树不一致**，读提交的人会拿到被撤回的结论。建议把工作树内已更正的 `fix-round.md` 一并落盘（该文件当前为 ` M` 未提交状态，且受 `.git/info/exclude` 的 `docs/evidence/*` 排除，需 `git add -f`）。

### 已知遗留问题（Known Issues，不计入本轮裁定）

- `rival-filter-polish.e2e.test.js` 在**任何 git 工作树**内恒红（`nodePaths:[repoRoot/node_modules]` 而非 `absWorkingDir`）；基底同形。
- 第二段 3 个文件在 deny 装置下因「测试合法回落到 `globalThis.fetch`」被装置策略判红；根治需装置层区分「测试主动发起的出网」与「被测代码按设计回落」，非本票范围。
- 弹窗装置挂死的**机制未定论**（现有证据只否证了旧解释）；建议以「并发进程共享 `.esbuild-cache`」为假设做一次受控复现再定论。
- spec 已登记的两项遗留（采样窗口 / 指数平滑）不在本轮验收范围。

## 8. 工作树状态（只读声明）

- `git rev-parse HEAD` 验收前后均为 **`01dc8479a`**，未提交、未推送、未开 PR。
- 业务源码与测试**零改动**：`git status --porcelain` 中 `plugins/`、`packages/`、`specs/` 下无任何条目。
- 唯一非我产生的脏文件：` M docs/evidence/account-monitor-velocity-3113/fix-round.md`（主理人的自我更正，验收开始时即为此状态）。
- 本次新增写入全部落在 `docs/evidence/account-monitor-velocity-3113/`（受 `.git/info/exclude` 排除）：本报告 + `harness/`（装置与产物）。
- 注入式回退实验全部在 `/tmp/qa3113` 副本内进行，未触碰工作树。
