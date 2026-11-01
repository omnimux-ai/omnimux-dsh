# 3868 新会话引导页工作区行未与输入框对齐

Issue: #3868 · 分支 `agent/omnimux-starter-row-align-issue-3868` · 风险等级 R2（单插件非破坏性修复）

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
- 引导页根节点同时带 `data-phase` 与 `data-omnimux-starter-host`；若未来官方改掉 `data-phase` 根节点，本规则会失效，需要用回归测试里的 DOM 命中断言兜住。
- 工作区行与输入框卡片左缘对齐（行内 `padding` 为 0，二者同宽同左缘）就是本任务期望的「对齐」口径；不恢复官方 20px 行内缩进。

## 证伪方式

- 在真实浏览器里把两份样式分别以「先 GUIDE 后 COMPOSER」「先 COMPOSER 后 GUIDE」两种顺序注入同一 DOM，修复前两种顺序结果不一致（一行 680 / 一行 920 且左缘差 120px），修复后两种顺序都必须得到 680 且左缘差 0px。
- `node --test plugins/omnimux/src/client/starter-hero-row-cascade.test.js`：删除/还原本次特异性改动后必须红（断言特异性严格大于通用规则），恢复后绿。
- `rg "heroWorkspaceRow" plugins/omnimux/src/client/session-guide/styles.js` 确认普通态与分栏态引导页选择器都带 `[data-phase]` 复合条件。

## 验收

- [ ] 引导页工作区行 `max-width` 等于输入框卡片（680 / `min(680px, calc(100% - 24px))`），二者水平中心与左缘一致；修复前红、修复后绿。
- [ ] 分栏紧凑态下引导页工作区行同样保持 680 上限与居中（不被通用分栏规则改成 100%）。
- [ ] 普通英雄页（无 starter 引导卡）工作区行样式不变（通用规则原样保留）。
- [ ] 新回归测试在还原修复后失败、修复后通过；`pnpm --filter omnimux test`、`pnpm --filter omnimux-inspiration test` 通过。
- [ ] 隔离工作树内真实浏览器证据（截图 + 结构化报告，两种注入顺序）留存。
- [ ] 独立评审核对范围、回归风险、证据与授权。

## 新用户基线

本任务只改产品自己的客户端 CSS 与一条静态回归测试，不新增运行时依赖、不读取本机路径/端口/凭据、不改变插件装载方式。全新安装的用户打开新会话引导页即可看到工作区行与输入框对齐；若样式未加载（插件缺失/宿主不支持）则表现为官方原生布局，不新增报错路径。

## 文档影响

无需改契约文档：`docs/contracts/` 未定义引导页工作区行的宽度契约，宽度铁律（680px、Issue 2830）已写在 `session-guide/styles.js` 注释里，本次只在同处补级联说明。

## 范围外

- 不改官方 `packages/`、Electron 壳层、Dev/Prod 物化流程。
- 不改普通英雄页、欢迎标题、引导卡片内容区（1200px）、输入框卡片既有度量。
- 不重排样式注入顺序、不新增跨插件依赖、不新增黑名单/隐藏规则。
