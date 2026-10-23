# 新会话探索区单一滚动归属实测证据（Issue 3628）

- 任务工作树：`.worktrees/inspiration-single-scroll`
- 分支：`agent/inspiration-single-scroll-issue-3628`
- 验收入口：`node scripts/worktree-app-qa.mjs --request .workbuddy/qa-3628/request.json`（隔离任务环境 + 真实无头 Chrome + 任务专属 journey）
- 结论文本以本轮实跑输出为准；本文件只记录可复核的数字与命令。

## 一、用户报告的缺陷

「新会话」页出现两个纵向滚动条：在内容区域滚动时只有内层内容在动、页面本身不动，交互体验差。

根因：`.omnimux-explore-grid-view-wrap`（`max-height: calc(100vh - 120px)` + `overflow-y: auto`）是嵌套在官方会话滚动底座
`[data-conversation-scroll]`（`.scrollBody`）里的第二个滚动容器。卡片超过视口上限时，滚轮先被内层吃掉；
`useComposerDocking` 只监听 `[data-conversation-scroll]`，因此内层滚动不驱动吸底阈值。

## 二、修复前基线（真实浏览器，`before-*`）

来源：`.workbuddy/evidence/contract/3628/c35fff74-efa3-46f0-9635-5b2b2d73e19c/`

| 指标 | 数值 |
| --- | --- |
| 纵向滚动容器数 | **2**（官方 `.scrollBody` + `.omnimux-explore-grid-view-wrap`） |
| 网格容器计算样式 | `overflow-y: auto`，`max-height: 593px`（`100vh - 120px`） |
| 网格容器内容高度 | `scrollHeight 645` / `clientHeight 585` → 自身可滚 |
| 2 次滚轮后 | 网格 `scrollTop 0 → 60`（滚轮被内层吃掉），页面 `scrollTop 265 → 685` |
| 断言结果 | `journey:single-vertical-scroll-owner` ❌、`journey:explore-grid-not-a-scrollport` ❌、`journey:grid-wrap-scroll-top-stays-zero` ❌ |

截图：`before-explore-double-scrollbar.png`（Skills 网格视图，可见内容区第二条滚动条）
审计：`before-scroll-audit.json`

## 三、修复后实测（真实浏览器，`after-*`）

来源：`.workbuddy/evidence/contract/3628/79e3c5a1-9724-4ba8-8531-30c6290dd8db/`（sealed evidence：`evidence.json`）

| 指标 | 数值 |
| --- | --- |
| 纵向滚动容器数 | **1**（只有官方 `.scrollBody`） |
| 网格容器计算样式 | `overflow-y: visible`，`max-height: none` |
| 网格容器 `scrollTop` | `0`（滚轮不再被内层吃掉） |
| 2 次滚轮后页面 | `scrollTop 265 → 685`，Tab 栏吸顶到滚动底座顶部（`filterBar.top = conversationRect.top = 0`） |
| 网格渲染数量 | 32（页面 `scrollHeight 1853 > clientHeight 713`，卡片越多页面越长） |
| 断言结果 | 21/21 全通过（`app-environment` 3 + `app-browser` 10 + `task-journey` 8） |

截图：`after-explore-single-scroll.png`
审计：`after-scroll-audit.json`
断言清单：`after-contract-checks.json`

## 四、复现命令与本地环境说明

```bash
# 任务私有环境 + 真实浏览器验收（准备→安装→启动→journey→seal）
node scripts/worktree-app-qa.mjs --request .workbuddy/qa-3628/request.json
```

本机（macOS + Chrome 155 + 默认 `python3` 3.15）需要两处**环境侧**规避，均与产品改动无关，已单独登记
[Issue 3632](https://github.com/omnimux-ai/omnimux-dsh/issues/3632)：

1. `python3` 指向 3.12（本机默认 3.15 会让 `scripts/managed-tarball-archive.py` 以写模式打开 `GzipFile`，归档检查直接失败）；
2. 无头 Chrome 需要 `--use-mock-keychain`，否则首次 `Network.setCookie` 在 macOS 上卡死 15s，浏览器阶段整体失败。

上述两处只影响**验收环境**，不改变被测产品代码；产品源码、样式与测试断言均按仓库规范提交。

**披露：本轮 QA 运行期间，工作树内曾临时修改过 `scripts/worktree-app-qa.mjs`（加 `--use-mock-keychain`）与
`scripts/materialize-graph.mjs`（临时诊断日志），两者均在提交前完整回退。** 因此 sealed 快照的
`candidate.head.resolvedSha` 记录为基线 SHA（`8f312e7…`），且快照中包含这两处未提交改动与当时尚未回退的
`specs/tab-sticky-top-min-height.spec.md`；但三个产品面文件（`styles.js`、`ExploreTemplatesSection.jsx`、
`picker-sticky-docking.test.js`）在快照 after 摘要与提交 HEAD 的 blob 摘要**逐字节一致**，即真机证据覆盖的
正是本 PR 提交的生产代码。`scripts/` 侧的环境规避应通过 #3632 修复或提交为显式开关后再跑，届时证据可与提交 SHA 绑定。

## 五、待维护者授权的历史标准清理

`plugins/omnimux-inspiration/src/explore/picker-sticky-docking.test.js` 中的两条断言
（「样式契约验证：.omnimux-explore-grid-view-wrap 视口上限内滚…」与「视口几何仿真断言：网格容器上限 100vh-120px 内部滚动…」）
锁定的是 Issue 2726/2914 的历史标准。全仓权威是 `scripts/guard-anti-cheat.mjs` RULE-01（禁止改写既有断言，只放行新增）
与 `docs/contracts/anti-agent-fake-completion-guard.md`；任务级先例见 `docs/plans/unified-upstream-input-2848.md`
（「保留红证据 + 就精确文件/用例请求授权」）。

本轮采取**只增不改**：历史基类声明原样保留，当前契约由修饰类 `.omnimux-explore-grid-view-flow` 表达，
并追加新用例锁定新契约。删除历史声明并把旧断言替换为新标准，需维护者就上述两个用例明确授权后再执行
（见 `specs/new-session-single-scroll.spec.md` §六）。

## 六、独立评审与补测

- 独立评审 Agent（与实现方无共享上下文）对本 PR 给出 **APPROVE**：真机 computed style 由
  `overflow-y: auto / max-height: 593px` 变为 `visible / none`；sealed evidence 中
  `styles.js` / `ExploreTemplatesSection.jsx` / `picker-sticky-docking.test.js` 的 blob 摘要与提交 HEAD 完全一致
  （即真机证据覆盖的正是本 PR 生产代码）；既有断言零改动。
- 评审提出的非阻塞项已处理：**吸底态覆盖缺口**（被删的 `[data-omnimux-dock-open]` 网格上限规则特异性 0,3,0
  高于修饰类 0,2,0，一旦回归两个测试仍会绿）已在 `single-scroll-ownership.e2e.test.js` 补上两条断言：
  禁止重新引入该规则 + 吸底态 DOM 计算样式仍为 `visible/none`；并用临时重新引入该规则的方式验证过断言会失败（非空转）。
- 其余非阻塞项（历史仿真用例 stale-green、`#3632` 环境缺陷、Dev 真机验收归人工）见上文与 Issue 记录。

