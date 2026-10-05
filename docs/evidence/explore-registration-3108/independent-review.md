# 独立评审报告 · PR #3115（Issue #3108）探索菜单运行时注册接缝

- 评审对象：commit `5b421d8ea74b22806a1e7203fd9cae4b669dff84`（分支 `agent/omnimux-explore-registration-issue-3108`）
- 评审基线：`5602c94081fe79ac7dc7c984b9e4910c67423a62`（`git merge-base HEAD main` 实测，与 PR 描述一致）
- 工作树：`.worktrees/omnimux-explore-registration-issue-3108`（只读评审；除本报告外未修改任何文件）
- 评审时间：2026-10-05

## 结论

**REQUEST CHANGES**

接缝本身的设计与实现是干净的：单一协调器、内置白名单只读、非法输入不抛错、注销语义自洽、内置 11 项的 id/顺序/图标/点击语义零改动、无第三方插件 id 硬编码进产品白名单、无第二套视觉度量、无新增 observer。单元与 e2e 用例在本机实测全绿（23/23、2/2），浏览器证据的取值来源经逐条核对**未发现造假或硬编码常量代替真实 DOM 测量**。

但有两处需要在合入前处理：

1. 运行时注册项**无数量上限**，而菜单防溢出几何仍用**写死的高度常量 380px**（`computeExploreMenuPosition`），且 `.omnimux-explore-menu` 无 `max-height` / 无滚动容器 —— 每多注册 1 项，防溢出判定就多偏差约 33px，末项可能落到视口外且**无法滚动到**。这是本 PR 新引入的、对既有「带视口防溢出定位」保证的削弱。
2. e2e 第 6 段断言读取**已提交的静态证据 JSON**（`docs/evidence/.../explore-registration-browser.json`），该断言无法在行为回归时变红，属测试剧场；且该 e2e 文件未接入任何 runner（不在 `test:gates`，CI `quality-gate.yml` 也不引用），当前不产生可执行的覆盖。

## 问题清单

### 阻塞（建议合入前修复）

**B1 · 运行时注册项无上限 + 防溢出几何写死高度 → 末项可能落在视口外且不可达**

- 位置：`plugins/omnimux/src/client/sidebar-coordinator.js:420-442`（`menuH = 380`，第 425 行）、`plugins/omnimux/src/client/sidebar-coordinator.js:193-202`（`.omnimux-explore-menu` 样式块）、`plugins/omnimux/src/client/sidebar-coordinator.js:1017-1034`（`registerExploreItem`，无数量上限）、`plugins/omnimux/src/client/sidebar-coordinator.js:501`（`for (const item of resolveExploreMenuItems())`）
- 问题：接缝把菜单项数从固定 11 项变成无上限（契约 `docs/contracts/sidebar-extra-entries.md:80` 明写「注册项一律追加在末尾」），但定位函数仍按常量 380px 判定「是否放得下」，样式块也没有 `max-height` 或滚动兜底。注册项越多，防溢出判定偏差越大，菜单底部（即注册项所在的末尾）会被裁到视口外，且用户无法滚动看到。
- 证据：
  - 真实浏览器证据 `docs/evidence/explore-registration-3108/explore-registration-browser.json:106-134` 显示 12 项时第 12 项 `top: 461, bottom: 493`、`viewportHeight: 900`，可反推该次渲染的菜单实际高度约 `12×33 + 分隔线 + padding ≈ 424px`，而 `computeExploreMenuPosition` 仍按 380px 计算 —— 单次注册即已产生约 44px 的判定偏差；每多注册 1 项再增加 33px。
  - 代码核对：`.omnimux-explore-menu` 只有 `min-width/max-width/width: max-content`，**无** `max-height`、**无** `overflow-y`；`openExploreMenu` 在 `document.body.append(menu)`（第 528 行）之后才调用 `computeExploreMenuPosition(anchor)`，即菜单**已经可以被真实测量**，却仍用常量。
  - 横向同类偏差：`menuW = 180`（第 424 行）与 CSS `max-width: 240px` 不一致，注册项文案较长时（内置最长仅「Google Vids」）水平翻转阈值最多偏 60px。
  - 注意：这不是既有 11 项的老问题被放大——既有情况下误差约 10px（内置实际高度 ≈390px），属可忽略；本 PR 把它变成**随注册数线性增长、无上界**。
- 建议：在 `openExploreMenu` 中改用实测高度，例如把 `computeExploreMenuPosition(anchor, viewport, menuRect)` 的第三个参数改为实测 `menu.getBoundingClientRect()`（或直接 `menu.offsetHeight/offsetWidth`），并在样式块补 `max-height: calc(100vh - 16px); overflow-y: auto;` 作为兜底。同步补 1 条单测：注册 N 项后断言菜单 `bottom <= viewportHeight - 8`。

**B2 · e2e 对静态证据文件的断言无法反映行为回归，且该 e2e 未接入任何 runner**

- 位置：`tests/e2e/sidebar-explore-convergence.e2e.test.mjs:212-220`
- 问题：第 6 段断言「证据文件存在 + `assertions` 里 `pass` 全为 true」，读的是仓库里已提交的 `explore-registration-browser.json`。该文件是**历史某次运行的冻结产物**，任何产品行为回归都不会让它变红；它只在有人改了/重跑失败覆盖了证据文件时变红——即把测试套件耦合到一个生成物上，方向是反的。同时注释声称「必须与本用例同版本落盘」，但代码未校验任何版本绑定（证据 JSON 里没有 commit/SHA 字段，见 `docs/evidence/explore-registration-3108/explore-registration-browser.json:1-24`）。
- 证据：
  - 该断言是纯文件读取 + JSON 解析，不启动浏览器、不重新驱动页面（第 213-220 行）。
  - 实测该 e2e 文件**未被任何 runner 执行**：`package.json:56` 的 `test:gates` 只列了 `tests/e2e/guard-no-transparent-popover.test.mjs`；`package.json:58-59` 的 `test` / `test:all` 不含 `tests/e2e`；`.github/workflows/quality-gate.yml` 未引用 `tests/e2e`；全仓 `grep -rn "tests/e2e" scripts/*.mjs` 仅命中 `guard-quality-loop.mjs` 的路径分类逻辑与 `verify-share-button-visual.mjs` 的另一个 harness。
  - 本机手工执行 `node --test tests/e2e/sidebar-explore-convergence.e2e.test.mjs` → 2 pass / 0 fail，说明它可运行，只是无人调用。
- 建议：二选一。(a) 把断言换成「证据 JSON 记录的 `runId`/时间戳不得早于被测源码的 mtime」这类真实版本绑定，并在 `runId` 之外记录被测文件的 `git rev-parse HEAD`，断言与当前 HEAD 一致；(b) 删除该段静态断言（浏览器证据由 `scripts/verify-explore-registration-browser.mjs` 自己保证零失败并以退出码表达），并至少把该 e2e 接入 `test:gates`，否则它不构成交付证据。

### 次要（nits，可随下一次改动一并处理）

**N1 · 注册项 `label` 走 `innerHTML` 拼接，未做转义**

- 位置：`plugins/omnimux/src/client/sidebar-coordinator.js:508`
- 问题：`btn.innerHTML = ...${item.iconSvg}...${item.label}`。内置项是可信常量，但接缝把这两个字段开放给第三方/个人插件；`label` 含 `<`（如 `<b>快讯`）会被当标记解析，轻则排版异常（`aria-label` 与可见文案不一致），重则注入 `onerror` 类属性。同源插件代码本身已有完整 JS 权限，不构成越权，但契约把 `label` 定义为「菜单文案」、把 `iconSvg` 定义为「14×14 纯矢量」，未声明字段是 HTML 还是纯文本。
- 建议：`label` 改用 `textContent`（或 `escapeHtml`），只把 `iconSvg` 保留为受信 HTML 字段，并在契约小节里写明「`iconSvg` 按 HTML 注入、`label` 按纯文本渲染」。

**N2 · 契约 front matter 的 `updated` 未随新小节推进**

- 位置：`docs/contracts/sidebar-extra-entries.md:8`（`updated: "2026-09-25"`）与 `docs/contracts/sidebar-extra-entries.md:76`（本次新增的 2026-10-05 小节）
- 证据：本次新增小节在同一文件内，`updated` 仍为 `2026-09-25`。本机 `node scripts/doc-lint.mjs` 未对该文件报错（仅全局既有 1778 项错误，与本 PR 文件无关），所以这是文档卫生问题而非门禁失败。
- 建议：改为 `2026-10-05`。

**N3 · 契约未记录「同 id 二次注册会移到末尾」的顺序语义**

- 位置：`plugins/omnimux/src/client/sidebar-coordinator.js:1021-1024`（先 `splice` 旧的、再 `push` 新的）；契约 `docs/contracts/sidebar-extra-entries.md:88` 只写「同 id 二次注册覆盖前一项」
- 证据：浏览器脚本 `scripts/verify-explore-registration-browser.mjs:720-735` 显式断言二次注册后该项是**末项**（`lastLabel === '二次'`），说明顺序变化是既定行为，但契约没写。
- 建议：契约补一句「同 id 覆盖后该项位于末尾」。

**N4 · 契约未记录 `entryId` / `pluginId` 这两个会被消费的字段**

- 位置：`plugins/omnimux/src/client/sidebar-coordinator.js:476-483`（`activateExploreItem` 第二段 `CONVERGED_ROWS.get(item.entryId) ?? CONVERGED_ROWS.get(item.pluginId)`）与 `plugins/omnimux/src/client/sidebar-coordinator.js:1025`（`{ ...item, id }` 会把任意额外字段一起带上）
- 问题：注册项若带 `pluginId`/`entryId`，会命中「已挂载行 click」这一段委托；契约的接口示例只列了 `id/label/iconSvg/tabId/action`。这既是未文档化的能力，也是一条冒充通道（注册项传入已安装插件的 `pluginId` 即可借用该行 click）。
- 建议：契约要么显式声明这两个可选字段，要么在 `registerExploreItem` 里剥掉 `pluginId`/`entryId`，只保留白名单字段。

**N5 · hub 未提供「接缝就绪」信号，先于 hub 启动的插件会静默丢失入口**

- 位置：`specs/omnimux-explore-registration-issue-3108.spec.md:59-62`（「hub 全局不存在 → 插件侧只做一次有界轮询后放弃」）
- 问题：`install()` 幂等（`plugins/omnimux/src/client/sidebar-coordinator.js:1035-1037` 命中既有全局即返回），因此注册一旦成功就不会因重装丢失；但若第三方插件先于 hub 装载全局，按契约「有界轮询后放弃」就再也不会注册，用户看不到入口且无任何提示。仓内同类实现（`plugins/omnimux-device/src/client/sidebar-entry.js:47-64` 的 `registerWhenCoordinatorReady`，500ms 轮询、无超时）实际上是不放弃的，契约与既有实践不一致。
- 建议：明确推荐的重试上界（或 hub 侧补一个 `omnimux-sidebar-ready` DOM 事件），并把既有 `registerWhenCoordinatorReady` 的写法作为契约示例。

**N6 · 证据 JSON 落盘了开发机绝对路径**

- 位置：`docs/evidence/explore-registration-3108/explore-registration-browser.json:6`（`root: /Users/x/Desktop/.../.worktrees/omnimux-explore-registration-issue-3108/`）、`:9`（`chrome.path: /Applications/Google Chrome.app/...`）
- 证据：`scripts/verify-explore-registration-browser.mjs:419` 直接写 `root: ROOT`（绝对路径）；`:421` 写 `chrome.path`。本机 `node scripts/verify-product-baseline.mjs` 通过（该门禁只扫运行时源码，不扫 `docs/evidence`），所以不违反产品基线硬边界，但把机器相关路径固化进仓库属无收益的耦合。
- 建议：`root` 写仓库相对路径（脚本里 `path.relative(ROOT, ...)` 已用于 `source`），`chrome.path` 可只保留版本信息。

## 明确**没有**覆盖的范围

1. **未重跑真实浏览器验收脚本**：`scripts/verify-explore-registration-browser.mjs` 会覆盖写入 `docs/evidence/explore-registration-3108/`，与「只读评审」冲突，故未执行。我对该脚本的结论来自逐行阅读 + 与已提交 JSON 的交叉核对（断言名称、`actual` 取值、截图字节数 42564 与磁盘 PNG 一致、`file` 实测 1280×900），**未**独立复现其浏览器行为。
2. **未做真实产品宿主集成验证**：该脚本的页面是自建骨架（`buildIndexHtml()`，`scripts/verify-explore-registration-browser.mjs:104-296`）并自带 `--dsw-*` token 与最小侧栏 DOM；`window.__omnimuxWorkbench` 是页面内 stub（`:220-229`）。因此「真实 host 侧栏 + 真实 workbench Tab 打开」这一层**未被证明**。
3. **未在 Electron / Dev 应用（45120）验收**：属人类所有，未触碰。
4. **未跑全量门禁**：仅跑了与本变更相关的少量只读门禁（见下）。`pnpm test:gates`、`pnpm verify:stages`、`pnpm --filter omnimux test` 等未执行（前者会先跑 `build-client.mjs` 写入产物，超出只读边界）。
5. **未评审 PR 的 CI 结果、Merge Queue 状态与 Dev 物化**：本报告只针对代码与证据文件本身。
6. **未覆盖跨插件真实注册者**：仓内没有任何插件实际调用 `registerExploreItem`（全仓 grep 仅命中测试、规格、证据与脚本），因此「第三方插件真实接入后的端到端表现」无实例可验。
7. **未验证 `action` 分支的浏览器行为**：浏览器脚本中不存在 `action` 字段（`grep -n "action" scripts/verify-explore-registration-browser.mjs` 无命中），AC4 仅由单元测试覆盖。

## 已验证为「无问题」的关键项（供交叉核对）

| 评审点 | 结论 | 证据 |
|---|---|---|
| 内置 11 项 id/顺序/图标/点击语义是否改动 | 未改动 | `git diff 5602c9408 5b421d8ea -- plugins/omnimux/src/client/sidebar-coordinator.js` 全文核对：仅新增 4 个函数 + 1 处循环来源改动（第 501 行）+ 新增 API 成员 + 1 行 reset；`EXPLORE_MENU_ITEMS`(248-350)、`activateExploreItem`(465-489)、`closeExploreMenu`(444-453)、`computeExploreMenuPosition` 本体均未改 |
| Esc / 外部点击关闭、选中后关闭 | 未改动 | 同上（`openExploreMenu` 内 528-560 行的监听与清理逻辑无 diff） |
| 非法输入 / 内置 id 冲突 / 同 id 覆盖 / 注销语义 | 自洽 | `registerExploreItem`(1017-1034)：非法或冲突返回 no-op 注销函数；覆盖时先删旧再追加，且注销闭包捕获 `record` 引用，旧注销函数在覆盖后为 no-op（不会误删新注册项）——这一点比契约要求更强，正确 |
| `resolveExploreMenuItems()` 是否漏项/重复 | 无漏无重 | 375-378 行：内置在前、运行时项按 id 过滤内置冲突后追加；`registerExploreItem` 已保证集合内 id 唯一 |
| 是否把具体插件 id 硬编码进产品白名单 | 无 | 全仓 grep `fast-news-workbench` 仅命中 `specs/`、测试、脚本、证据，产品源码零命中 |
| 第二套视觉度量 / per-plugin observer / 产品基线死条目 | 无违反 | 未新增 CSS 度量（复用 `.omnimux-explore-menu-item`）；未新增 observer；未注册即不渲染（`EXTRA_EXPLORE_ITEMS` 为空时集合等于内置 11 项） |
| 是否有第二处写 `window.__omnimuxSidebar` 的降级 stub（会让第三方调用抛错） | 无 | `grep -rn "__omnimuxSidebar" plugins/*/src plugins/*/lib`：生产代码只读该全局，仅测试里出现 stub |
| 单元测试强度 | 强断言 | `plugins/omnimux/src/client/sidebar-coordinator.test.js:733-858`：`assert.deepEqual` 比对 id 序列、断言菜单 DOM 中 `[data-explore-id]` 数量与末项、断言 `__omnimuxWorkbench.open` 入参深等于、断言注销后 DOM 中该 id 为 null、断言非法输入不改变集合长度 |
| 浏览器证据是否造假 | 未发现 | 断言取值全部来自真实 DOM / 真实模块：`builtinIds` 取自 `mod.EXPLORE_MENU_ITEMS`（脚本 177 行）、菜单 id 取自 `menu.querySelectorAll('[data-explore-id]')`（237-239 行）、点击为 CDP `Input.dispatchMouseEvent` 打到实测 `getBoundingClientRect` 中心（475-489、636-638 行）；唯一硬编码常量 `EXPECTED_OPENED`(51) 用于比对 stub 记录的**产品代码真实入参**，非自证 |
| AC 覆盖 | AC1/AC2/AC3/AC5/AC6/AC7 三处（单测+e2e+浏览器）覆盖；AC4 仅单测 | 见上文「未覆盖范围」第 7 条 |
| 本机只读门禁 | 通过 | `node scripts/verify-product-baseline.mjs` ✅、`node --test scripts/verify-anti-slop.test.mjs` ✅（3/3）、`node scripts/verify-bilingual-docs.mjs` ✅（10 对）、`git diff --check` 无输出 |

## 实际执行过的只读命令

```
git log --oneline -3 ; git status --short ; git merge-base HEAD main ; git rev-parse HEAD
git show --stat 5b421d8ea
git show 5b421d8ea -- plugins/omnimux/src/client/sidebar-coordinator.js
git show 5b421d8ea -- plugins/omnimux/src/client/sidebar-coordinator.test.js specs/omnimux-explore-registration-issue-3108.spec.md
git diff 5602c9408 5b421d8ea -- plugins/omnimux/src/client/sidebar-coordinator.js
git diff --check 5602c9408 5b421d8ea
git ls-files plugins/omnimux/lib/client.js docs/evidence/explore-registration-3108/
git check-ignore -v plugins/omnimux/lib/client.js docs/evidence/explore-registration-3108/explore-registration-browser.json
grep -rn "EXPLORE_MENU_ITEMS|resolveExploreMenuItems|registerExploreItem"（全仓，排除 node_modules/.git）
grep -rln "__omnimuxSidebar"（docs/ 与 plugins/*/src、plugins/*/lib）
grep -rn "fast-news-workbench"（全仓）
grep -rn "tests/e2e" scripts/*.mjs .github/workflows/*.yml package.json
grep -n "action" scripts/verify-explore-registration-browser.mjs（无命中）
node -v ; ls node_modules/jsdom/package.json
node --test plugins/omnimux/src/client/sidebar-coordinator.test.js      → 23 pass / 0 fail（REAL_EXIT=0）
node --test tests/e2e/sidebar-explore-convergence.e2e.test.mjs          → 2 pass / 0 fail（REAL_EXIT=0）
node scripts/verify-product-baseline.mjs                               → ✅（REAL_EXIT=0）
node --test scripts/verify-anti-slop.test.mjs                          → 3 pass / 0 fail（REAL_EXIT=0）
node scripts/verify-bilingual-docs.mjs                                 → ✅ 10 pairs（REAL_EXIT=0）
node scripts/doc-lint.mjs                                              → ❌ 1778 项（全仓既有，无一命中本 PR 文件；grep 本 PR 文件名零命中）
ls -l docs/evidence/explore-registration-3108/ ; file docs/evidence/.../explore-registration-browser.png
sed -n / grep -n 读取：sidebar-coordinator.js 全文关键段（159-250、250-400、395-445、440-600、1000-1114）、
  plugins/omnimux/lib/client.js（构建产物抽样 11200-11235、11755-11785）、
  tests/e2e/sidebar-explore-convergence.e2e.test.mjs、scripts/verify-explore-registration-browser.mjs（全文 799 行）、
  docs/evidence/.../explore-registration-browser.json（全文 362 行）、docs/contracts/sidebar-extra-entries.md（全文）、
  plugins/omnimux/AGENTS.md、plugins/omnimux-device/src/client/sidebar-entry.js（35-74）、
  docs/contracts/client-ui-remediation.md（135-142）、scripts/check-tracked-artifacts.mjs（1-60）、
  .github/workflows/quality-gate.yml（1-80）、package.json（13-85）、specs/omnimux-explore-registration-issue-3108.spec.md
```

## 读取过的文件清单

- `plugins/omnimux/src/client/sidebar-coordinator.js`（全文关键段）
- `plugins/omnimux/src/client/sidebar-coordinator.test.js`（新增段 730-858 + 头部 1-70）
- `tests/e2e/sidebar-explore-convergence.e2e.test.mjs`（全文 233 行）
- `scripts/verify-explore-registration-browser.mjs`（全文 799 行）
- `docs/evidence/explore-registration-3108/explore-registration-browser.json`（全文 362 行）
- `docs/evidence/explore-registration-3108/explore-registration-browser.png`（仅元数据：1280×900、42564 bytes）
- `docs/contracts/sidebar-extra-entries.md`（全文）
- `docs/contracts/client-ui-remediation.md`（135-142）
- `specs/omnimux-explore-registration-issue-3108.spec.md`（全文）
- `plugins/omnimux/AGENTS.md`、`AGENTS.md`、`CLAUDE.md`
- `plugins/omnimux/lib/client.js`（构建产物抽样；该文件被 `plugins/omnimux/.gitignore:1` 忽略，未入库）
- `plugins/omnimux-device/src/client/sidebar-entry.js`（35-74）
- `scripts/check-tracked-artifacts.mjs`（1-60）、`scripts/omnimux.mjs`（doc:lint 段落）
- `.github/workflows/quality-gate.yml`（1-80）、`package.json`（13-85）
