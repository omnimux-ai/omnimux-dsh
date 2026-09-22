# 独立行级评审 · 输入框下方四条快捷方式：无边框「图标 + 文字 + 箭头」并整行居中（Issue #2572）

## 0. 评审对象与固定版本

| 项 | 值 |
| --- | --- |
| 工作树根 | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-quick-shortcuts-icon-style-issue-2572` |
| 分支 | `agent/omnimux-quick-shortcuts-icon-style-issue-2572` |
| 基线 / 目标 | 基线 `origin/main` = HEAD `83b2d48bf2193eee7f0f7e058844295c18c3e035`；目标 = **工作区未提交改动**（工作树 HEAD 即 origin/main） |
| 改动清单 | 已跟踪修改 4 个：`ComposerQuickShortcuts.jsx`、`catalog.js`、`catalog.test.js`、`styles.js`；新增 4 个：`icons.jsx`、`styles.test.js`、`tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs`、`specs/composer-quick-shortcuts-icon-style.spec.md`（另有一处与本任务无关的 `.test-env-uHeEE5/` 测试环境残留目录，未纳入评审） |
| 评审命令 | `git -C <工作树> status --porcelain` / `git -C <工作树> diff`；`node --test`（改动相关用例）；`node scripts/scan-ui-gates.mjs`；`git diff --check` |

**被评审内容指纹（sha256 前 16 位）**

| 文件 | sha256(16) | mtime |
| --- | --- | --- |
| `plugins/omnimux/src/client/composer-quick-shortcuts/ComposerQuickShortcuts.jsx` | `617420a19b81fa6c` | 21:18:42 |
| `plugins/omnimux/src/client/composer-quick-shortcuts/catalog.js` | `a54d1dcac92e8096` | 21:18:42 |
| `plugins/omnimux/src/client/composer-quick-shortcuts/catalog.test.js` | `4a4ce28d2d3d9656` | 21:18:42 |
| `plugins/omnimux/src/client/composer-quick-shortcuts/styles.js` | `7aab1b8206234b53` | 21:18:42 |
| `plugins/omnimux/src/client/composer-quick-shortcuts/icons.jsx` | `ffe01180d9731464` | 20:59:51 |
| `plugins/omnimux/src/client/composer-quick-shortcuts/styles.test.js` | `69f20511a60c0d6d` | 21:14:21 |
| `plugins/omnimux/tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs` | `45f4f865af2f5549` | 21:14:24 |
| `specs/composer-quick-shortcuts-icon-style.spec.md` | `8d4e7c61be2199ce` | 20:57:31 |

> **并发写入告知**：评审期间（21:12→21:19）实现方仍在同一工作树内迭代。已核实：21:18:42 的四个文件 mtime 变动但**内容哈希与 21:14 版完全一致**（同一次评审读取的内容）；21:14:29 重建过 `plugins/omnimux/lib/client.js`（构建产物，gitignored）；21:16 与 21:18 两次重写 `.agent-reports/quick-shortcuts-icon-style/` 证据目录（旧截图的几何快照 `browser-geometry.json` 一度被删除，随后重生成）。本报告结论以第 0 节哈希对应的内容为准。

## 1. 结论

**有建议（无阻塞性缺陷）**：逐字落地、唯一真源、样式归属、行为不回退、居中与位置这五项核心要求的实现侧均成立；未发现严重 / 高问题。另有 **4 条中等问题**（1 条证据链缺口、1 条真源脱钩、1 条断言粒度不足、1 条规格与实现漂移）与 **5 条低优先建议**（脆弱点与文档精度），建议在合并前处理中等问题、按需处理低优先项。

按需求逐项核对的判定：

| 核查点 | 判定 | 依据 |
| --- | --- | --- |
| 1 唯一真源（条目图标名只在 catalog 新增，渲染处无四段硬编码） | ✅ 通过 | `catalog.js:24/34/44/54` 新增 `icon`；渲染处 `ComposerQuickShortcuts.jsx:262` 只用 `entry.icon`，全文无按 id 分支 |
| 2 五枚 lucide 图标逐字落地、尺寸 14/12px | ✅ 通过（实现） | 规范化空白后逐元素比对，5 枚全部逐字一致；`icons.jsx:58/61`、两处 `viewBox="0 0 24 24"` |
| 3 样式只在样式表、无内联业务样式、颜色全取 token | ✅ 通过 | `styles.js` 单一样式表；两个 JSX 内无 `style=`；CSS 中无裸 `#hex`/`rgb(`；`--dsw-alias-label-secondary/-primary/-brand-primary` 均在宿主 token 快照（163 个）内 |
| 4 居中实现自洽（`justify-content: center` + 控件 `flex-basis: 100%` + `order: 3`） | ✅ 通过（有脆弱点，见 L1/L2） | 真实浏览器实测：四态 `driftFromRowCenter = 0`、`driftFromCardCenter = 0`、`anyOverlap = false`；这一排均在输入框卡之下 |
| 5 既有行为无回退 | ✅ 通过 | 59/59 单测、新 E2E 4/4（人工执行）；预填、链接、技能、模型与参数、写失败提示、撤回、互斥均有断言覆盖 |
| 6 测试是真断言、未削弱既有断言 | ⚠️ 部分（M1/M3） | `catalog.test.js` 仅新增断言、无删除；但新增 E2E 无自动化执行入口；「逐字落地」断言只采样 |
| 7 一致性（导入/导出、重复实现、死代码） | ⚠️ 部分（M2） | 导入路径与导出名正确、图标路径仅一份；箭头图标名与真源脱钩，部分导出无外部消费者 |

## 2. 逐条问题

### M1（中）新增 E2E 没有任何自动化执行入口，CI 绿灯不含它

- **位置**：`plugins/omnimux/tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs`（新增，全文件）；`plugins/omnimux/package.json` 的 `test` 脚本 → `plugins/omnimux/scripts/run-tests.mjs:4-7`；`specs/composer-quick-shortcuts-icon-style.spec.md:64-73`；`.github/workflows/quality-gate.yml`
- **现象**：包内测试发现器只收 `src/**/*.test.js` 与 `src/**/*.test.ts`。实测 `discoverTestFiles()` 返回 **329** 个文件，`includes(new e2e?) === false`；`quality-gate.yml` 通篇无 `tests/e2e` 收集（只有显式列举的 `node --test ...` 清单）；本任务规格的「命令」一节也没有列出要跑这个 E2E。实现方是在证据报告 `.agent-reports/quick-shortcuts-icon-style/report.md:63-64` 里**人工**跑了一次（4 通过）。
- **为什么是问题**：`Test → Green` 要求"跑通全套自动化用例"；这条 E2E 承载的是**行为**断言（点击预填提示语与链接令牌、`aria-pressed`、撤回、互斥切换、控件出现/消失），其中最关键的点击链路在改动相关单测里没有等价覆盖。它不进入 CI，意味着这类回归会静默溜过合并门禁，而 `scripts/guard-quality-loop.mjs:75-77` 仍会把 `tests/e2e/**` 或 `*.e2e.test.*` 计为"E2E 已完成"，形成"有文件即算有证据"的错觉。
- **补充事实（避免误判）**：同目录下已有 41 个 E2E 文件（`*.e2e.test.mjs` / `*.spec.js`）同样不被收集，即这是本包既有的历史约定，不是本次新引入的错误；因此这是**证据口径问题**，需由交付方拍板，而非代码缺陷。
- **最小修法**：二选一。(a) 在 `plugins/omnimux/scripts/run-tests.mjs:4` 的 `TEST_GLOBS` 增加 `tests/e2e/*.e2e.test.mjs`（先确认同目录其它 `.mjs` 均可在纯 node/jsdom 下运行，避免引入新红灯）；(b) 不动收集器，改为把该文件路径显式写进本任务规格的「命令」一节，并在 CI 的工作流里加一条 `node --test plugins/omnimux/tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs`。

### M2（中）行尾箭头图标名与真源脱钩，且新测试把硬编码字面量钉住

- **位置**：`plugins/omnimux/src/client/composer-quick-shortcuts/catalog.js:62`（`export const QUICK_SHORTCUT_ARROW_ICON = 'move-up-right'`）；`plugins/omnimux/src/client/composer-quick-shortcuts/icons.jsx:90-107`，其中 `icons.jsx:104` 写死 `QUICK_SHORTCUT_ICON_PATHS['move-up-right']`；`plugins/omnimux/src/client/composer-quick-shortcuts/styles.test.js:120`；`plugins/omnimux/src/client/composer-quick-shortcuts/catalog.test.js:69`
- **现象**：全仓库检索确认 `QUICK_SHORTCUT_ARROW_ICON` 的消费者只有测试（`catalog.test.js:5/69`、`styles.test.js:6/119/137`），**渲染路径一次都没用**：`QuickShortcutArrow()` 既不接受 `name` 参数，也不从 `catalog.js` 引入，而是在 `icons.jsx:104` 硬编码同一个字面量。新测试还正向钉住了这处硬编码——`styles.test.js:120` 断言源码里必须出现 `QUICK_SHORTCUT_ICON_PATHS['move-up-right']`。
- **为什么是问题**：任务把"图标名只住真源、渲染处不硬编码"列为真源纪律；四条条目确实做到了，但共用箭头在真源与渲染之间形成了**两个字符串真源**，且二者不会自动同步：改 `catalog.js:62` 的常量，界面不会变，测试也不会红（它只校验常量等于字面量）。这与"该常量是真源"的注释（`catalog.js:60-62`）自相矛盾。
- **最小修法**：让渲染路径消费真源——`QuickShortcutArrow({ name = QUICK_SHORTCUT_ARROW_ICON })`，并在 `icons.jsx` 顶部 `import { QUICK_SHORTCUT_ARROW_ICON } from './catalog.js'`，内部取 `QUICK_SHORTCUT_ICON_PATHS[name]`；同时把 `styles.test.js:120` 改为断言 `QuickShortcutArrow` 引用了该常量而非字面量。若反而不希望渲染依赖 catalog，则应删掉 `catalog.js:62` 这个常量，别让它以"真源"的措辞留在真源文件里。

### M3（中）「lucide 路径逐字落地」的断言只做了抽样指纹，改坏未采样分支仍会变绿

- **位置**：`plugins/omnimux/src/client/composer-quick-shortcuts/styles.test.js:130-143`（`it('lucide 路径逐字落地（抽样钉住五枚图标的特征路径）')`）；`plugins/omnimux/tests/e2e/composer-quick-shortcuts-icon-style.e2e.test.mjs:48-53`（`ICON_SHAPE`，只对拍标签名序列）与 `:129-133`
- **现象**：五枚图标**每枚只钉一条片段**：`film → 'M3 12h18'`、`text-search → 'm21 19-1.9-1.9'`、`workflow → 'M7 11v4a2 2 0 0 0 2 2h4'`、`sparkles → 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558'`、`move-up-right → 'M19 5L5 19'`。E2E 侧只断言子节点标签名（`['rect','path',...]`）与 `width/height/viewBox`，不校验任何几何属性值。
- **为什么是问题**：规格 `specs/composer-quick-shortcuts-icon-style.spec.md:39` 要求"`viewBox` 与全部 `path`/`rect`/`circle` 逐字照抄，不得增删或改写"，`icons.jsx:10` 的注释也写"改了就是产品事故"。但把 `film` 的 `M7 3v18` 改成 `M7 3v17`、或改掉 `sparkles` 路径里的任意后半段数值，这两套断言**都仍然绿**——于是这条"防事故"的断言在真正的事故形态（数值被改）上失效，属于典型的"换个写法就变绿"。测试名与注释宣称的强度高于实际断言强度。
- **最小修法**：`styles.test.js` 里把每枚图标的**整段元素串**与字面量做等值比较（复用现有 `glyphNames` 的切块方式，规范化空白后 `assert.equal` 整块字符串），或直接在 E2E 的 `ICON_SHAPE` 里补 `d`/`cx`/`cy`/`r`/`width`/`height`/`rx` 的逐节点期望值，把"抽样"换成"全量"。

### M4（中）规格与实现漂移：spec 写的居中方案（绝对定位）与代码（`flex-basis: 100%`）不是同一套

- **位置**：`specs/composer-quick-shortcuts-icon-style.spec.md:48-54`（"居中实现方式（本任务的关键决策）"）对比 `plugins/omnimux/src/client/composer-quick-shortcuts/styles.js:104-113`；`styles.test.js:73` 明确反着断言
- **现象**：规格写"模型与参数控件改为**绝对定位到该行右端**（`position: absolute; right: 0`），不占布局宽度……且留白只有一种形态：控件显示时给行容器左右**等量**内边距"；实现（`styles.js:105-113`）用的是"控件 `flex-basis: 100%` 自成一行"，`styles.js:11-16` 的实现注释也据此展开论证；`styles.test.js:73` 甚至断言"控件**不得**绝对定位"。规格文件 mtime 20:57，早于实现（21:14），即规格从未随实现更新。
- **为什么是问题**：本仓库把 `specs/<feature>.spec.md` 定义为人机共享的真相源，质量环的 Spec 门禁也以它为准。现在规格里那一段（含"关键决策"的论证与取舍结论）描述的是**已被放弃的方案**，会直接误导后续维护者与下一轮评审：照规格改代码会立刻撞上 `styles.test.js:73` 的红灯。
- **最小修法**：把 `spec.md:48-54` 改写为实际方案——"行容器 `justify-content: center`；控件与写失败提示取 `flex-basis: 100%` 自成一行、不参与按钮行的居中计算（浏览器实测 `driftFromRowCenter = 0`）"，并同步删除"绝对定位 + 等量内边距"的表述；`S9` 的判据也相应用"控件独占一行"表述。

### L1（低）位置完全依赖宿主 hero 栈的 `order`，规则失效时是静默的，且没有自动化几何断言兜底

- **位置**：`styles.js:115-121`（`[data-phase='hero'] .omx-quick-shortcuts { order: 3 }`）；断言仅 `styles.test.js:65-68` 与 E2E `:154`
- **现象**：这条规则假定两个宿主事实同时成立——(a) `.omx-quick-shortcuts` 是 hero 栈里与输入框块**同级**的 flex 项；(b) 输入框那块的 `order` 恰好是 2。评审中拿到直接反例：本任务 21:12 的构建**没有**这条规则时，真实浏览器里这一排落在输入框**上方**（当时几何快照：这一排 `y 210..240`、输入框卡 `y 258..372`；评测期间可在同目录 21:12 版证据中看到，随后被 21:16/21:18 的证据重写覆盖）；加入规则后同一环境变为这一排 `y 334..364`、输入框 `y 202..316`（当前快照），说明规则确实生效、同时也说明**默认落位就是错的**——任何使该规则失效的变化（宿主 hero 栈结构或 order 调整、停靠槽被包一层 wrapper）都会静默回到"输入框上方"，而现有断言只做 CSS 文本正则，抓不到这类回归。
- **为什么是问题**：这是本次唯一的"位置"实现手段，却是全链路最脆的一段；失效方式是视觉错位而非报错。
- **最小修法**：在回归套件里补一条真实浏览器几何断言（`row.top >= card.bottom` 且 `|groupCenter - cardCenter| <= 2`），让它进 CI；或在实现上不依赖数值 order（例如以输入框块为锚点排序），并把 `order: 3` 的取值来源与宿主契约写进注释。

### L2（低）窄列下这一排比输入框更宽，左右各外溢约 12px（改动前既有，本任务未触及）

- **位置**：`styles.js:32-33`（`width: var(--dsh-composer-card-max-width, 952px); max-width: 100%;`）
- **现象**：当前浏览器快照 `narrow640`：这一排 `x 8..350`（宽 342），输入框卡 `x 20..338`（宽 318）——中心一致（`drift = 0`）、纵向在输入框下方（750 之后），但这一排左右各比输入框多出 12px。原因：这一排取**槽宽**的 100%，而输入框卡被 `--dsh-composer-side-clearance` 收窄。
- **为什么是问题**：需求是"落在输入框正下方、整行左右居中"，两条都成立，所以不构成缺陷；但视觉上这一排的文字/热区比输入框更宽，窄列下与输入框边缘不对齐，属于"看起来差一点点"的观感问题，且这条宽度规则在本次改动中未被触及（`git diff` 只改了 `gap` 与 `margin`），是 #2562 遗留。
- **最小修法**：让这一排与输入框卡共用同一条清除量（如 `width: calc(100% - 2 * var(--dsh-composer-side-clearance, 16px))`），使其与输入框等宽。

### L3（低）颜色 token 去掉了回退值

- **位置**：`styles.js:48`（`color: var(--dsw-alias-label-secondary);`）、`:58`、`:74`、`:98`、`:66`
- **现象**：改动前的同类声明普遍带回退（例如被删除的 `var(--dsw-alias-border-l2, var(--dsw-alias-border))`），仓库他处也普遍如此（如 `plugins/omnimux-apps/src/client/apps.css:56` 的 `var(--dsw-alias-label-secondary, rgba(255,255,255,0.65))`）。现在的 `--dsw-alias-label-secondary`、`--dsw-alias-label-primary`、`--dsw-alias-brand-primary` 直接裸用。
- **为什么是问题**：已核对 `tests/e2e/fixtures/dsh-theme-tokens.json`（宿主主题 token 名全集 163 个，来源 DSH Desktop 主题 CSS），这三个 token 确实存在，因此当前无风险；但宿主升级（harness pin/RC）后若别名改名，声明会失效并静默继承父级颜色，而不是落到一个可见的兜底值。
- **最小修法**：补回退值（或按仓库既有先例 `tests/e2e/clip-primary-btn-contrast.e2e.test.mjs` 的写法，加一条"引用的宿主 token 必须存在于快照"的断言）。

### L4（低）注释中的实测数字未标注状态，与基础态不符，易误导

- **位置**：`styles.js:117`（"浏览器实测：输入框 202→390，这一排 416→484"）
- **现象**：该组数字对应**选中态**（控件出现、卡片高 188）的旧一次测量；当前基础态快照是输入框 `202→316`、这一排 `334→364`，选中态是输入框 `202→390`、这一排 `408→476`。注释未写状态，读者按基础态核对会对不上。
- **为什么是问题**：数值型证据写进源码注释是好事，但缺状态限定会让下一位维护者怀疑注释、进而怀疑结论。
- **最小修法**：注明"（选中态：输入框 202→390、这一排 408→476；基础态：输入框 202→316、这一排 334→364）"，或直接引用证据文件路径与生成时间。

### L5（低）选中态与悬停态只差一个字重；另有两处导出无外部消费者

- **位置**：`styles.js:57-59`（hover → `--dsw-alias-label-primary`）与 `:73-76`（is-active → 同色 + `font-weight: 600`）；`icons.jsx:12`、`:58`、`:61` 三个导出
- **现象**：(a) 去掉边框与底色后，选中态与悬停态的差异只剩字重 600/400，且字重变化会改变文字宽度，使居中的整组在选中瞬间轻微横向位移；规格 `S8` 只要求"文字色/字重可辨"，故实现合规，但可辨度偏薄，建议人工在真机上看一眼。(b) `QUICK_SHORTCUT_ICON_PATHS` / `QUICK_SHORTCUT_ICON_SIZE` / `QUICK_SHORTCUT_ARROW_SIZE` 三个导出在模块外无消费者（测试均按源码文本读取），属可收窄的公开面。
- **最小修法**：若判定可辨度不足，可补一处非色彩的选中信号（例如箭头常亮/文字下划线，仍只用既有 token）；三个常量导出改为模块内常量，仅保留 `QuickShortcutIcon` / `QuickShortcutArrow` 对外。

## 3. 已核对且无问题的清单（含证据）

1. **五枚图标逐字一致（实现侧）**：以脚本把 `icons.jsx` 中 `QUICK_SHORTCUT_ICON_PATHS` 的每个元素规范化空白后与给定源逐元素比对，`film`(rect+7 path)、`text-search`(3 path+circle+path)、`workflow`(rect+path+rect)、`sparkles`(path+path+path+circle)、`move-up-right`(2 path) **全部逐字一致**，属性值无增删改大小写；两处 `viewBox="0 0 24 24"`、`QUICK_SHORTCUT_ICON_SIZE = 14`、`QUICK_SHORTCUT_ARROW_SIZE = 12`，E2E 实测 `width/height` 分别为 14 与 12。
2. **唯一真源（四条条目）**：`icon` 只在 `catalog.js:24/34/44/54` 定义，随 `resolveQuickShortcuts` 的 `Object.freeze({ ...entry, skill })` 原样传到渲染处（`catalog.js` 的展开保留字段）；`ComposerQuickShortcuts.jsx:253-267` 只用 `entry.icon`（同时落到 `data-omx-quick-shortcut-icon` 供断言），全文无 `entry.id ===` 分支。`catalog.test.js` 用 `deepEqual` 钉死四条 `id/labelKey/prompt/skillSlug/links/showModelControls/icon` 全量映射。
3. **样式归属与颜色纪律**：视觉全部在 `styles.js` 单一样式表；`ComposerQuickShortcuts.jsx`、`icons.jsx` 内均无 `style=`；`styles.test.js:101-105` 断言 CSS 中无裸 hex/rgba 且取既有 token。样式表用到的引用经核对：`--dsw-alias-label-secondary`、`--dsw-alias-label-primary`、`--dsw-alias-brand-primary` 均在宿主 token 快照内；`--dsw-font-s-14`、`--dsh-composer-card-max-width` 为改动前既有引用（非本次新增色值）。
4. **UI 静态门禁无新增违规**：`node scripts/scan-ui-gates.mjs` 扫描 602 个客户端源文件，报告 6 处严重违规，全部落在本次未触及的既有文件（`components/product-picker/ProductCreateLinkModal.jsx`、`session-guide/skills/SkillCard.jsx`、`SkillsPanel.jsx`）；改动涉及的两个 JSX 文件 0 违规（原生 `<button>` 处保留了既有的 `/* exempt-ui01 */` 豁免注释并已更新描述）。
5. **居中与位置（真实浏览器几何，当前构建）**：`base`/`hover`/`activeClone`/`activePlusHover`/`activeSelling`/`narrow640`/`wideAgain` 七个状态全部 `driftFromRowCenter = 0`、`driftFromCardCenter = 0`、`anyOverlap = false`；这一排始终位于输入框卡之下（基础态 `row 334..364` vs `card 202..316`；选中态 `row 408..476` vs `card 202..390`）；`narrow640` 下按钮折成 2 行仍居中且不压字。控件实测 `flex-basis: 100%`、`overflowsRow = false`，确未参与按钮行的居中计算。
6. **行为不回退**：`node --test "plugins/omnimux/src/client/composer-quick-shortcuts/*.test.js"` → **59 通过 / 0 失败**（含新增 `styles.test.js` 11 条、`catalog.test.js` 新增 2 条）；人工执行新 E2E → **4 通过 / 0 失败**，覆盖"每项 = 图标 + 文字 + 箭头、共 2 个 svg、无边框""文案取字典""点击复刻预填 `请用我的产品复刻这个爆款视频\n\n[视频] [商品]` 并出现模型与参数控件""再点撤回后控件消失""切到拆解整组替换且不出现模型与参数""任一时刻只有一条 `is-active`"。写失败轻提示由既有 `dom.test.js`（"桥的回执契约与消费方的守卫"）继续覆盖，未被本次改动触碰。E2E 夹具自建假宿主桥与假技能库，不连真实服务、不写开发机状态。
7. **既有断言未被削弱或删除**：`git diff` 显示本次只修改了 4 个已跟踪文件，`catalog.test.js` 的改动**全部是新增**（新增 `icon` 字段断言与"四条图标互不相同、箭头不得与条目重名"一条），无删除、无放宽；其它测试文件未被触碰；`styles.js` 中被移除的胶囊样式（`border`/`border-radius: 999px`/`background`/`box-shadow` 相关）没有任何既有测试曾断言过（`git grep` 基线确认）。
8. **一致性与无重复实现**：`ComposerQuickShortcuts.jsx:13` 的导入路径/导出名正确（`./icons.jsx` 的 `QuickShortcutIcon`、`QuickShortcutArrow`），esbuild 打包与 node 执行均通过；箭头图形复用同一份 `QUICK_SHORTCUT_ICON_PATHS['move-up-right']`，没有复制第二份路径；`git diff --check` 干净（无空白错误）。

## 4. 未覆盖范围与不确定项

1. **未做独立浏览器复现**：本报告不接受"我复跑了验收"，浏览器几何结论引用的是工作树内现成证据（`.agent-reports/quick-shortcuts-icon-style/browser-geometry.json` 当前版与同名截图，工作树构建、`ui` 模式、动态端口）。评审期间实现方在并发重写该目录，若后续再有重写，需按第 0 节哈希重新核对。
2. **窄列数字的来源状态**：L2 的窄列外溢（342 vs 318）来自当前快照的 `narrow640`；更早的 900/620/420 三档旧证据在 21:16 被覆盖删除，未再复测，故只给出"窄列更宽"这一条，不覆盖更窄档位的行为。
3. **非 hero 形态未取证**：会话开始后的 `active` phase、分屏紧凑（`data-omnimux-split-compact`）、右栏展开时这一排的落位与 `order: 3` 的行为均未验证（实现注释称这些形态不渲染这一段，未获浏览器证据）。
4. **未跑全量测试**：仅跑了改动相关目录（59 例）、新 E2E（4 例）、UI 门禁扫描；未跑 `pnpm --filter omnimux test`（329 个文件）与 `pnpm test:gates`，也未跑 `pnpm verify:stages` / `verify:product-baseline` 等与本改动相关性较低的门禁。因此"无回归"的结论只覆盖被跑到的范围。
5. **规格门禁口径**：`specs/composer-quick-shortcuts-icon-style.spec.md` 是否为质量环 Spec 门禁认定的"本任务规格"，未在本轮以门禁脚本验证（只按文件存在与内容一致性核对）。
6. **选中态可辨度（L5a）属主观项**：仅按 `S8` 字面判据（文字色/字重）判定合规，实际观感需人工在开发版真机复核——按仓库约定这属人工范围，Agent 不代为判定。
