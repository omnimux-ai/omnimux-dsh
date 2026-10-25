> 稳定副本说明：本目录是 Issue #3774 隔离 worktree 真实浏览器验收证据的持久副本（任务 worktree 收尾后仍可查阅）。原件位于该任务 worktree 的 `.workbuddy/evidence/more-menu-3774/` 与合同封套目录 `.workbuddy/evidence/contract/omnimux-explore-more-menu-issue-3774/1fbda842-cce1-4a86-ac47-5137a861b794/`（含 `evidence.json`，run 整体 status=failed，唯一失败项为与本改动无关的 `asset-hub-reachable-via-library`）。
# Issue #3774 验收（task-2）· 终态证据 + 独立复核

- 任务板：task-2（owner `verify-more-menu`，status in_progress）
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-explore-more-menu-issue-3774`
- 候选：base = head = `457db50c12250f46dc38420d2254fa2f4bc8a35c`（= `origin/main`，无提交）
- 记录时间：2026-10-25 19:21–20:05（Asia/Taipei）
- **结论：菜单内容与分组 = 通过（真实浏览器 + 截图）；点击关闭菜单 = 通过；点击后目标 Stage/Tab 打开 = 未观察到（已定位原因，非本改动回归）。整体 run 仍为 failed（另有 1 项既有环境断言失败）。**

## 1. 环境与证据身份

| 项 | 值 |
|---|---|
| 入口 | `node scripts/worktree-app-qa.mjs --request .workbuddy/evidence/more-menu-3774/request-observe.json` |
| 运行器 | `scripts/worktree-app-qa.mjs`（合同 candidate 路径，`producer: controlled-runner`，`contract: candidate`） |
| 宿主 App | `/Applications/OmniMux Dev.app`（build-info：OmniMux `2.0.10`、dsh `0.2.1-rc.3`、submodule `1f81c047fc`） |
| mode / 插件集 | `ui`；`taskPlugins: ["omnimux-inspiration"]` → 实际安装 `omnimux@0.1.2` + `omnimux-inspiration@0.1.0` |
| origin / 端口 | `http://127.0.0.1:65444`（动态，服务端口 65444，CDP 49517） |
| runId | `1fbda842-cce1-4a86-ac47-5137a861b794` |
| 时间 | 11:51:42Z – 11:58:16Z |
| 绑定 | `taskBinding: installed-loaded`、`userFresh: true`、`task-source-installed-loaded: pass` |
| 自清理 | `cleanup.cleaned: true`（app-child / mock-server / app-private-directory 全部 completed） |
| 门禁脚本 | **未修改**：证据跑用的是 HEAD 版 `scripts/*`（`git diff --stat HEAD -- scripts/` 为空） |

证据目录（合同路径，未提交）：`.workbuddy/evidence/contract/omnimux-explore-more-menu-issue-3774/1fbda842-cce1-4a86-ac47-5137a861b794/`
稳定副本：`.workbuddy/evidence/more-menu-3774/final/`

## 2. 终态：官方「更多」菜单内容（通过）

真实 Chrome 打开的真实 OmniMux 应用，展开侧栏「更多」后菜单共 **12 行**：

| # | 行文案 | 归属 | 该行前有分隔线 |
|---|---|---|---|
| 1 | 浏览更多插件 | 官方 | 否 |
| 2 | 创建你的插件 | 官方 | 否 |
| 3 | 应用 | OmniMux | 否 |
| 4 | 视频剪辑 | OmniMux | 否 |
| 5 | 产品库 | OmniMux | **是**（视频剪辑 `dividerAfter`） |
| 6 | 发布 | OmniMux | 否 |
| 7 | 账号 | OmniMux | 否 |
| 8 | 手机管理 | OmniMux | 否 |
| 9 | 数据分析 | OmniMux | **是**（手机管理 `dividerAfter`） |
| 10 | 自动化 | OmniMux | 否 |
| 11 | 任务表单 | OmniMux | 否 |
| 12 | 社交采收 | OmniMux | 否 |

- 10 项自第 3 行起**连续**，文案与顺序与 `plugins/omnimux/src/client/sidebar-coordinator.js` 的 `EXPLORE_MENU_ITEMS` 逐字一致。
- 分隔线位置与真源 `dividerAfter`（视频剪辑、手机管理）一致。
- 结构化观察：`final/more-menu-observation.json`（`rowTexts` / `omnimuxBlockSeparators` / `tenInOrder: true` / `separatorsMatch: true`）。
- 截图：`final/more-menu-open.png`（1280×657，243740 字节，PNG CRC 校验通过；可见「更多」菜单展开与两条分隔线）。
- 断言：`journey:ten-items-in-order` = pass、`journey:separators-match-source` = pass、`journey:sidebar-more-anchor-present` = pass、`journey:observation-recorded` = pass。

### 打开方式（诊断）

- 锚点：`nav[aria-label] button[aria-haspopup="menu"]`，`aria-label="更多"`，rect 252×36（宽侧栏）。
- CDP 真实鼠标事件**点不开**该菜单：锚点中心被 `div._mask_o6lrb_18` 覆盖（`hitInsideAnchor: false`）——该遮罩来自应用的「预览版说明」弹窗（截图可见），运行器只关「内测声明」那种弹窗。
- 回落元素 `.click()`（真实 Chrome 里的真实 click 事件）可正常展开，`aria-expanded` 变 `true`。证据里记录实际生效方法为 `openMethod: "dom-click"`。

## 3. 点击结果

| 点击项 | 行被点到 | 菜单关闭 | 目标 Stage/Tab 打开 |
|---|---|---|---|
| 应用 | 是 | 是（`menuFoundAfter: false`，`aria-expanded: "false"`） | **否** |
| 视频剪辑 | 是 | 是 | 否 |
| 产品库 | 是 | 是 | 否 |
| 自动化 | 是 | 是 | 否 |
| 任务表单 | 是 | 是 | 否 |

- 断言 `journey:click-closes-menu-and-opens-target` = **fail**（关菜单满足，开目标不满足）。
- 未观察到 `html[data-dsh-product-stage]`、`.omnimux-apps-stage`、`.omx-hub-panel` 任何变化；`overlayStages` 始终为空。
- 根因（均非本次改动引入）：
  1. **「应用」当前无挂载目标**：hub `index.js` 注释明确「Apps shelf temporarily taken down (core-first)」，应用行 / app tabs / AppsStage 三个挂载被摘除；`item.action` 只派发无人监听的 `omnimux-app-open`。
  2. **其余项的目标插件未安装**：fresh 任务环境只允许 `omnimux-inspiration/browser/assets/workflow/automation`；本 run 只装了 hub + inspiration，10 项里的域插件（clip/products/publish/accounts/device/analytics/forms/social-harvest）都不在安装集内。
  3. **唯一可装的 10 项目标「自动化」被门禁挡住**：见 §6。
  4. `window.__omnimuxWorkbench` 存在（`open`/`openWorkbench` 均为 function），但没有侧栏支持包时 `openWorkbench` 返回 false（`hubPath.workbenchRequestAccepted: false`），tab 兜底路径不可用。
- 说明：点击委托本身有实现侧单测覆盖（mock workbench 下断言 `dismiss → open` 顺序与 tabId），本环境无法做端到端「点击即打开」。

## 4. 整体 run 判定

| 检查 | 断言数 | 结果 |
|---|---|---|
| app-environment | 3 | exitCode 0（含 `task-source-installed-loaded`） |
| app-browser | 10 | exitCode 1（`asset-hub-reachable-via-library` fail） |
| task-journey | 5 | exitCode 1（`click-closes-menu-and-opens-target` fail） |

封套 `evidence.json`：`result: { scope: task, status: failed, pass: false }`，`errors: []`，产物 6 件全部入封。

`asset-hub-reachable-via-library` 失败原因：本插件集不含侧栏支持包，`__omnimuxWorkbench.openWorkbench` 返回 false，hub 资产库工作台打不开；与「更多」菜单改动无关（`explore-section-visible` / `explore-cards-present` 均 pass）。

## 5. A 基线（live 不可得，静态记录）

task-1 的实现代码在能起环境之前已落进同一工作树，此时截「菜单里没有 10 项」不是 HEAD 事实，故不做 live 基线。HEAD（`457db50c1`）静态事实：

- `plugins/omnimux/src/client/explore-more-menu.jsx` 在 HEAD 不存在。
- HEAD 的 `plugins/omnimux/src/client/index.js` 有 **0** 处 `panellist`。

夹具排除：`grep -c "更多|panellist|aria-haspopup" scripts/worktree-web-qa.mjs scripts/sidebar-chrome-qa-fixture.mjs` 均为 0，该 runner 是单插件模拟宿主，不含官方侧栏。

## 6. 门禁阻断记录（供 Lead / PR #3772 参考）

1. `taskPlugins: ["omnimux-automation"]`（或 assets/workflow）会带上侧栏支持包 `dsh-better-sidebar@0.19.1`，其 14 个 `@deepseek-ai/dsh-*` peer 声明 `^0.1.5-rc.1` 与宿主 `0.2.1-rc.3` 结构性不相容 → `TEST_ENV_FRESH_RUNTIME`「Task peer version does not satisfy its declaration」。
2. 临时应用 PR #3772（`49254b996`）的三个门禁脚本后，版本关卡放行，但下一关变成 **`TEST_ENV_FRESH_RUNTIME`「Required task peer is missing」**（新的、不同的缺口）。已按 Lead 要求还原脚本（`git restore --staged --worktree`，`git status --short` 只剩任务产物）。
3. 因此「自动化」这条唯一可装的 10 项目标在当前 main + PR #3772 下都起不来，点击即打开无法在本环境完成。
4. 本 run 改用 `["omnimux-inspiration"]`（不带支持包）绕开该门禁，环境正常启动。

## 7. 独立复核（C）

- diff 面：`git diff origin/main...HEAD` **为空**（实现未提交），实际改动 = `git diff`（2 文件）+ 2 个 untracked 文件：
  `plugins/omnimux/src/client/index.js`(+4)、`plugins/omnimux/src/client/explore-more-menu.jsx`(新)、`plugins/omnimux/src/client/explore-more-menu.test.js`(新)、`docs/contracts/sidebar-extra-entries.md`(+17/-1)、`specs/…spec.md`(新)。
- 单一真源：新模块只 `import { activateExploreItem, resolveExploreMenuItems } from './sidebar-coordinator.js'`；源码内无 `EXPLORE_MENU_ITEMS =` 第二份清单、无 `iconSvg:` 字面量、无第二个 `activateExploreItem`。全仓 `sidebar.panellist.actions` 注册点只有 `explore-more-menu.jsx`（另加其构建产物 `lib/client.js`）。
- 无 slots 服务 no-op：`if (typeof ctx?.slots?.inject !== 'function') return false`；无 `try/catch`（全文件 0 个 `catch`）。
- 行原语缺失时不注册空壳：`isRenderableComponent(MenuItemButton)` 显式判定（`plugins/omnimux/src/client/explore-more-menu.jsx:66`）。
- 独立重跑实现方测试命令 `pnpm --filter omnimux test`：exit 1，三段 run 分别 `2/2 pass`、`3649/3651 pass（2 fail）`、`89/89 pass`。2 例失败都在 `src/agents/local.test.js`（本机 codex 本地 agent 模型探测 `gpt-6-astra`），与本次改动面无交集（未触及 `src/agents/`），与 Lead 在干净 main 上的核对一致。
  新用例全绿：`官方「更多」菜单注册形状` 4/4、`官方「更多」菜单内容` 6/6、`依赖注入与单一真源` 2/2。
- 静态检查（我独立跑，均 exit 0）：`node scripts/verify-stage-contracts.mjs`、`node scripts/verify-slot-contracts.mjs`、`node scripts/verify-plugin-boundaries.mjs`、`node --test scripts/verify-anti-slop.test.mjs`（3/3）。

## 8. 未执行 / 跳过

| 项 | 状态 | 原因 |
|---|---|---|
| A live 基线截图 | 未执行 | task-1 代码先落盘，live 基线已不可得（见 §5） |
| 点击 → 目标 Tab/Stage 打开 | 未观察到 | §3 根因 1–4 |
| Electron / `verify:cdp` | 不适用 | 本改动为 web 客户端注册，无 Electron-only 行为 |
| Dev 45120 真机验收 | 不适用 | 合同规定为人工职责，Agent 不连 |

## 9. 证据文件

- `.workbuddy/evidence/more-menu-3774/final/more-menu-open.png`（菜单展开）
- `.workbuddy/evidence/more-menu-3774/final/more-menu-after-click.png`（点击后）
- `.workbuddy/evidence/more-menu-3774/final/app-home.png`
- `.workbuddy/evidence/more-menu-3774/final/more-menu-observation.json`
- `.workbuddy/evidence/more-menu-3774/final/raw-run.json`
- `.workbuddy/evidence/more-menu-3774/logs/`（`observe-inspiration-4.log`、`omnimux-test.log`、`static-checks.log`、早期失败尝试日志）
- 合同原件：`.workbuddy/evidence/contract/omnimux-explore-more-menu-issue-3774/1fbda842-…/`（含 `evidence.json` 封套）
