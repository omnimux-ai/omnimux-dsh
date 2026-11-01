# 3868 新会话引导页工作区行未与输入框对齐

Issue: #3868 · 分支 `agent/omnimux-starter-row-align-issue-3868` · 风险等级 **R1**（hub 客户端 CSS + `scripts/` 回归门禁 + 根 `package.json` 入口；见文末风险说明）

## 背景

新会话引导页（标题「属于你的 AI 社媒运营团队」+「热门入门方式 / 探索模板 / 王牌短视频应用」）里，输入框上方的「工作区 / Agent 预设」两个下拉胶囊（官方 `heroWorkspaceRow`）没有和输入框卡片对齐：

- 输入框卡片：`680px` 宽，在会话栏内水平居中；
- 工作区行：被渲染成约 `920px` 宽（原生 `--dsh-chat-content-width`），比卡片宽 240px，整体左移约 120px，两个胶囊悬在卡片左侧之外；
- 用户可见现象即截图：两个胶囊的左边明显超出输入框卡片左边。

## 根因

| 事实 | 位置 |
|---|---|
| 引导页（starter host）把工作区行与输入框卡片都收敛为 `max-width:min(680px, calc(100% - 24px))` + `margin-inline:auto` | `plugins/omnimux/src/client/session-guide/styles.js`（`[data-omnimux-starter-host] [class*="heroWorkspaceRow"]` 规则） |
| 通用 Hero 规则把工作区行覆盖成 `width:calc(100% - 2 * var(--dsh-composer-side-clearance))`、`max-width:var(--dsh-chat-content-width)`、`padding:0` | `plugins/omnimux/src/client/composer-compact.js`（`[data-phase='hero'] [class*="heroWorkspaceRow"]` 规则） |
| 两条规则都是 `!important`、特异性相同（各 2 个属性选择器）→ 谁在 `<head>` 中后注入谁赢 | 上述两处 |
| 引导页样式由 `omnimux-inspiration` 在 mount 时注入 `installGuideStyles()`；通用 Hero 样式由 hub `omnimux` 的 chrome effect 注入 `ensureComposerCompactChrome()`。Issue 2949 把探索页从 hub 拆到 inspiration 后，两份样式不再同插件内按代码顺序注入，跨包注入顺序无保证 | `plugins/omnimux-inspiration/src/explore/mount.js`、`plugins/omnimux/src/client/chrome.js` |
| 引导页的卡片 680 / 内容区 1200 都已生效，只有工作区行输掉 → 证明 starter 样式表已注入，输的是级联（`!important` + 同特异性 + 注入顺序），不是样式丢失 | 截图几何测量：卡片 680 CSS px、行宽 920 CSS px、行左缘比卡片左缘小约 120 CSS px |

## 方案

不改注入顺序（跨包顺序本身不可靠），改为让引导页规则**在特异性上严格高于**通用 Hero 规则，使结果与注入顺序无关：

1. 普通态：`[data-omnimux-starter-host] [class*="heroWorkspaceRow"]` → `[data-phase][data-omnimux-starter-host] [class*="heroWorkspaceRow"]`（3 个属性选择器 > 通用的 2 个）。
2. 分栏/紧凑态：四条选择器里的 `[data-omnimux-starter-host]` 同样补成 `[data-omnimux-starter-host][data-phase]`（4 属性 + `html` 类型 > 通用的 3 属性 + `html`）。
3. 普通英雄页（无 starter host）不受影响：`[data-phase]` 复合条件只在 starter 引导页根节点上成立。
4. 补一条静态回归测试：从两份样式源解析工作区行规则，断言引导页选择器特异性严格高于通用 Hero 规则（普通态 + 分栏态），并让选择器在 `data-phase` + `data-omnimux-starter-host` 同元素时真实命中。

`data-phase` 与 `data-omnimux-starter-host` 必在同一元素：`SessionGuide.jsx` 的 `useLayoutEffect` 取 `guideRef.current.closest('[data-phase]')` 并给它设置 `data-omnimux-starter-host`，官方 `ConversationMainPanel` 的根节点即带 `data-phase`。

## 假设

- 运行中的 Dev 包仍按当前源码注入两份样式（已核对 `~/.omnimux-dev/profiles/omnimux/node_modules/omnimux/src/client/session-guide/styles.js` 含同样的 680 规则），所以修复只需改源码规则优先级，不需要改注入机制。
- 引导页根节点同时带 `data-phase` 与 `data-omnimux-starter-host`（当前生产链已核对：`SessionGuide.jsx` 把属性设在 `closest('[data-phase]')`，官方 `ConversationMainPanel` 根节点带 `data-phase`）。若未来官方改掉根节点，本规则会失效；静态回归测试硬编码合成 DOM，只能锁定当前选择器组合，**不能**兜住官方 DOM 结构变更，届时应由真实应用验收或宿主变更评审发现。
- 工作区行与输入框卡片左缘对齐（行内 `padding` 为 0，二者同宽同左缘）就是本任务期望的「对齐」口径；不恢复官方 20px 行内缩进。

## 证伪方式

- 在真实浏览器里把两份样式分别以「先 GUIDE 后 COMPOSER」「先 COMPOSER 后 GUIDE」两种顺序注入同一 DOM，修复前两种顺序结果不一致（一行 680 / 一行 920 且左缘差 120px），修复后两种顺序都必须得到 680 且左缘差 0px。
- `node --test plugins/omnimux/src/client/starter-hero-row-cascade.test.mjs`：删除/还原本次特异性改动后必须红（断言特异性严格大于通用规则），恢复后绿。
- `rg "heroWorkspaceRow" plugins/omnimux/src/client/session-guide/styles.js` 确认普通态与分栏态引导页选择器都带 `[data-phase]` 复合条件。

## 验收

- [x] 引导页工作区行 `max-width` 等于输入框卡片（680 / `min(680px, calc(100% - 24px))`），二者水平中心与左缘一致；修复前红、修复后绿（浏览器门禁反向对照 + 两种注入顺序）。
- [x] 分栏紧凑态下引导页工作区行同样保持 680 上限与居中（选择器覆盖分栏/紧凑四条变体，静态测试逐条断言特异性）。
- [x] 普通英雄页（无 starter 引导卡）工作区行样式不变（通用规则原样保留，测试断言其仍为原生内容宽）。
- [x] 新回归测试在还原修复后失败、修复后通过（本地 5/5；还原后 2 条转红）。CI required plugin tests 在 PR 上全绿（hub / inspiration / rest / workflow-market 四个 job 均 pass）。
  - 本工作树本地直跑有既有环境差异：`pnpm --filter omnimux test` 3693 项中 3 项失败（`agents/local.test.js` 2 项、`generation-core-package.test.js` 的 `pnpm pack`），`pnpm --filter omnimux-inspiration test` 269 项中 3 项失败。其中 `agents/local.test.js` 与 inspiration 这 3 项在**未改动的 main 检出**上用同一命令同样失败；`generation-core-package.test.js` 在 main 检出通过、仅在本工作树 pnpm 安装态下报 `ERR_PNPM_CANNOT_RESOLVE_WORKSPACE_PROTOCOL`（环境性）。以上均与本改动无关，未标记为通过。
- [x] **机制级**真实浏览器证据（真实 Chromium + 生产 CSS 常量 + 两种注入顺序 + 修复前反向对照）留存：`scripts/starter-workspace-row-align-qa.mjs`，本次 3/3 断言通过，截图与 `report.json` 见 `.workbuddy/evidence/starter-row-align-qa/777ce4f4-5d69-4b77-9b7e-30ad2bc48866/`。
- [ ] **真实功能路径**（启动应用/加载插件后的会话页）浏览器验收：**BLOCKED**（环境漂移，见「浏览器验证」）。按 `plugin-qa`，私有 harness 只能算局部机制证据，不替代功能路径验收；本项不勾承诺。
- [ ] 独立评审核对范围、回归风险、证据与授权（首轮 changes-requested 的阻断项已修复，待最终 head 复审）。

> 风险等级：本任务除 hub 客户端 CSS 外新增 `scripts/` 回归门禁与根 `package.json` 入口，按 `plugin-git-pr.md` 规则上调为 **R1**。

## 证伪记录（新增门禁：收紧型）

- 反例：把 starter 工作区行选择器里的 `[data-phase]` 复合条件删掉（修复前形态），并让通用 Hero 规则后注入。
- 造之前绿 / 造之后红：浏览器门禁内建「反向对照」断言，用同一份页面在修复前形态下实测必须复现「行宽 920、左移约 120px」；夹具失真（对照不红）时整条门禁失败。
- 真实输出：`prefix-bug.png` + `report.json`（行宽 920、左移约 120）；恢复 `[data-phase]` 后两种注入顺序均 widthDelta=0、leftDelta=0，门禁 3/3 PASS（A/B 标签与注入顺序已按评审意见校正后重跑）。
- 静态回归测试 `starter-hero-row-cascade.test.mjs`：还原 `[data-phase]` 后 `is strictly more specific…` 与 `tags every starter row sizing selector…` 两条断言转红；恢复后 5/5 PASS（已在本地执行并记录）。

## 新用户基线

本任务只改产品自己的客户端 CSS 与一条静态回归测试，不新增运行时依赖、不读取本机路径/端口/凭据、不改变插件装载方式。全新安装的用户打开新会话引导页即可看到工作区行与输入框对齐；若样式未加载（插件缺失/宿主不支持）则表现为官方原生布局，不新增报错路径。

## 浏览器验证（隔离工作树）

**结论：真实功能路径浏览器验收 BLOCKED，未取得；机制级真实浏览器证据已取得。**

全应用级入口 `pnpm verify:app` 在本机被两个环境漂移阻断：

1. `scripts/test-env-bootstrap.mjs` 把宿主脚本硬编码到 `/Applications/OmniMux Dev.app/Contents/Resources/app.asar/lib/desktop-cli.js`，但本机已安装的 Dev 包是解包布局（`Resources/app/`，没有 `app.asar`），启动即 `TEST_ENV_RUNTIME_EXIT`。临时把解包布局克隆成 `app.asar` 目录后应用可启动，说明代码本身未崩，纯属布局漂移；**该临时克隆（约 1.5G）已在排查结束后删除**，`Resources/app/` 原布局未改动（13:5x 已核对 `app/lib/desktop-cli.js` 存在、`app.asar` 不存在）。
2. 继续到任务准备阶段后报 `TEST_ENV_PREPARE_SOURCE_MUTATED`（`packages/dsh-ui-kit/lib/index.d.ts`）：该包 `build` 在隔离 stage 里重新生成的产物与仓库里提交的产物不一致（提交产物来自另一版 tsdown 生成器），属仓库既有生成物漂移，与本任务 CSS 改动无关，且修复它需要动 `packages/dsh-ui-kit` 生成物或 QA 引导脚本，超出本任务边界。

因此改为**机制级**真实浏览器门禁 `scripts/starter-workspace-row-align-qa.mjs`（`pnpm qa:starter-row-align`，沿用既有 `docked-slot-position-qa.mjs` 模式）：真实 Chromium、动态端口、临时 profile、用完即焚；两份样式**直接 import 生产模块取得已求值常量**（`${...}` 插值不丢真）；`report.pass` 同时要求断言全绿、无 error、Chrome 已停、临时 profile 已删。同一页面内实测三种状态：

| 状态 | 实际注入顺序（DOM 中在后者胜出） | 期望 |
|---|---|---|
| 反向对照：starter 规则去掉 `[data-phase]` 复合条件（修复前形态） | 通用规则在后 | 复现行宽 920、相对卡片左移约 120px |
| 正向 A | 通用规则 → GUIDE（历史输掉的顺序） | 行宽 680、左缘差 0 |
| 正向 B | GUIDE → 通用规则 | 行宽 680、左缘差 0 |

实跑结果（2026-11-01，本工作树）：3/3 断言通过；反向对照截图可见两个胶囊在卡片左缘外约 120px，修复后两种顺序截图均与卡片左缘对齐。证据：`.workbuddy/evidence/starter-row-align-qa/777ce4f4-5d69-4b77-9b7e-30ad2bc48866/{report.json,prefix-bug.png,guide-first.png,composer-first.png}`。

**限界（不隐藏）**：该门禁是真实浏览器 + 生产 CSS，但页面是合成 DOM，不是「启动应用 + 加载插件后的功能路径」，按 `plugin-qa` 只能算局部机制证据，**不替代** client/CSS 的功能路径验收；分栏/紧凑态也只有静态特异性断言、没有浏览器几何。功能路径验收与 Dev 真机验收均归人工：合并后 `worktree.sh ship` 物化到 `~/.omnimux-dev`，由用户在 Dev App 新会话引导页确认。**Agent 不声称完成功能路径验收或 Dev 真机验收。**

## 文档影响

无需改契约文档：`docs/contracts/` 未定义引导页工作区行的宽度契约，宽度铁律（680px、Issue 2830）已写在 `session-guide/styles.js` 注释里，本次只在同处补级联说明。新增 `scripts/starter-workspace-row-align-qa.mjs` 与根 `package.json` 的 `qa:starter-row-align` 入口，属回归门禁，不改任何契约语义。

## 范围外

- 不改官方 `packages/`、Electron 壳层、Dev/Prod 物化流程。
- 不改普通英雄页、欢迎标题、引导卡片内容区（1200px）、输入框卡片既有度量。
- 不重排样式注入顺序、不新增跨插件依赖、不新增黑名单/隐藏规则。
