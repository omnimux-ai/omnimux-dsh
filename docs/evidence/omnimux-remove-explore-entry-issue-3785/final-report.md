# Issue #3785 验收（task-4）· 终态证据 + 独立复核

- 任务板：task-4（owner `verify-more-menu`）
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-remove-explore-entry-issue-3785`
- 候选：base = head = `dfc4e58e0e5bb1ac4855ab02d8df30da7c62d0b3`（= `origin/main`，含已合入的 #3774/#3781；无提交）
- 记录时间：2026-10-25 21:25–22:30（Asia/Taipei）
- **结论：三项终态断言全部通过（真实应用 + 真实浏览器 + 截图）；另在独立复核里发现一处会红的门禁回归（`guard-no-transparent-popover`），见 §5。**

## 1. 环境与证据身份

| 项 | 值 |
|---|---|
| 入口 | `node scripts/worktree-app-qa.mjs --request .workbuddy/evidence/remove-explore-3785/request-observe.json` |
| 宿主 App | `/Applications/OmniMux Dev.app`（OmniMux `2.0.10` / dsh `0.2.1-rc.3` / submodule `1f81c047fc`） |
| mode / 插件集 | `ui`；`taskPlugins: ["omnimux-inspiration"]`（安装 `omnimux@0.1.2` + `omnimux-inspiration@0.1.0`） |
| runId | `a5858e90-3536-450e-a579-a55f936d51cf` |
| origin / 端口 | `http://127.0.0.1:50354`（动态；CDP 50470） |
| 绑定 | `taskBinding: installed-loaded`、`userFresh: true`、`task-source-installed-loaded: pass` |
| 时长 / 清理 | 175.3s；`cleanup.cleaned: true`，`errors: []` |
| 检查结果 | app-environment 3/3 pass（exit 0）；**task-journey 5/5 pass（exit 0）**；app-browser 9/10（唯一失败见 §6） |
| 门禁脚本 | 未修改（`git diff --stat HEAD -- scripts/` 为空） |

### Chrome 启动器披露（1 处环境适配，非产品/门禁改动）

本机在验收期间处于高负载（swap 已用 5.57GB / 7GB，45 个 node/Electron 进程），运行器的浏览器阶段连续 5 次失败在 `chrome-cdp-listen` 之后、`auth-cookie-apply` 之前（运行器把该异常统一吞成 `TEST_APP_QA_BROWSER`，原始错误不落盘）。已排除：Chrome 版本（系统 155 与 CfT 152 同样失败）、仓库代码变化（`scripts/worktree-app-qa.mjs` 在 `457db50c1..HEAD` 间未变）、candidate 漂移（后续运行无 `INSTALL_CANDIDATE_CHANGED`）、插件集（inspiration 与 automation 同样表现）、CDP 能力（同期 `node scripts/worktree-web-qa.mjs accounts` 2.86s PASS，同一 Chrome 与握手路径）。

最后一次通过 `CHROME_PATH` 指向本目录的 `chrome-launcher.sh`：它只 `exec` 系统 Chrome 并追加标准 CI 启动开关（`--no-first-run`、`--disable-background-networking`、`--disable-component-update`、`--use-mock-keychain`、`--password-store=basic` 等），运行器传入的每个参数原样透传；**没有自建驱动**，所有 CDP 操作仍在 `scripts/worktree-app-qa.mjs` 内。证据据此取得，特此披露。

## 2. 终态三项（全部通过）

证据目录：`.workbuddy/evidence/contract/omnimux-remove-explore-entry-issue-3785/a5858e90-3536-450e-a579-a55f936d51cf/`
稳定副本：`.workbuddy/evidence/remove-explore-3785/final/`、`docs/evidence/omnimux-remove-explore-entry-issue-3785/`

### 2.1 侧栏无「探索」行 / 浮动菜单 / 探索样式（`journey:explore-entry-absent` = pass）

| 探针 | 实测 |
|---|---|
| `#omnimux-explore-entry` | 不存在 |
| `#omnimux-explore-menu` | 不存在 |
| `#omnimux-sidebar-explore-styles` 样式节点 | 不存在 |
| 样式表/`<style>` 文本里 `omnimux-explore-entry` / `omnimux-explore-menu` 命中 | **0** |
| 类名含 `omnimux-explore-entry` / `omnimux-explore-menu` 的节点 | **0** |
| `nav[aria-label]` 内带 id 的条目 | `[]`（无自绘行） |

**区分依据**：同页仍有 21 个类名含 `omnimux-explore` 的节点（`omnimux-explore-templates-root` / `-header-row` / `-title` / `-filter-bar` / `-primary-tab` …）与 31 处样式文本命中，它们属于**新会话「探索模板/探索专区」**（另一功能），不是被删的侧栏行/菜单。报告里以 `starterGuideExploreClassNodeCount: 21` 与 `retiredStyleTextHits: 0` 分开记录。

截图 `.workbuddy/evidence/remove-explore-3785/final/more-menu-runtime-item.png` 肉眼可见侧栏为「灵感社区 / 插件 / 自动化任务 / 更多」，**没有「探索」行**。

### 2.2 官方「更多」菜单仍 10 项 + 2 条分隔线（`journey:more-menu-ten-items-in-order` / `journey:more-menu-separators-match` = pass）

菜单 12 行 = 官方 2 行 + 我们的 10 行（第 3 行起连续）：

`浏览更多插件` / `创建你的插件` ‖ `应用` `视频剪辑` ‖ `产品库` `发布` `账号` `手机管理` ‖ `数据分析` `自动化` `任务表单` `社交采收`

分隔线恰在 `产品库`、`数据分析` 之前（对应真源 `视频剪辑.dividerAfter`、`手机管理.dividerAfter`）。

### 2.3 运行时注册项出现在末尾、注销后消失、非法输入不注册（`journey:runtime-item-appended-and-removed` = pass）

| 步骤 | 实测 |
|---|---|
| `window.__omnimuxSidebar.registerExploreItem({id:'qa-runtime-probe', label:'QA运行时项', iconSvg, tabId})` | 返回可调用注销函数；重开菜单 **13 行**，末项 `QA运行时项` |
| 非法输入 ×6（null / {} / 缺 label / 缺 iconSvg / id 全空白 / id 非字符串） | 全部不抛错；菜单仍 **13 行**（不新增） |
| 与内置 id 冲突（`apps`） | 不抛错、不新增行；菜单仍 **13 行** |
| 注销后重开 | 回到 **12 行**，不含 `QA运行时项` |

截图：`more-menu-baseline.png`（213554 B）、`more-menu-runtime-item.png`（214697 B，含第 13 行）、`more-menu-after-unregister.png`（213554 B）——均 1280×713、PNG CRC 校验通过。

## 3. 基线（按 Lead 口径：静态）

HEAD `dfc4e58e0` 实读：`sidebar-coordinator.js` 里 `omnimux-explore-entry` 15 处、`EXPLORE_STYLES`:159、样式注入 `omnimux-sidebar-explore-styles`:440、`getExploreEntryForTests`:1177 —— 改动前探索行确实在。live 基线一次尝试因 impl 并发写盘触发 `TEST_ENV_INSTALL_CANDIDATE_CHANGED`，按 Lead 指示不再补跑。

## 4. 独立复核（B）

- **diff 面**：`git diff origin/main...HEAD` 为空（未提交）。实际改动 8 个路径：`plugins/omnimux/src/client/{sidebar-coordinator.js,sidebar-coordinator.test.js,explore-more-menu.jsx,explore-more-menu.test.js}`、`scripts/verify-explore-registration-browser.mjs`、`docs/contracts/sidebar-extra-entries.md`、`docs/evidence/explore-registration-3124/*`、`specs/…spec.md`。
- **① 单一真源未被复制**：`EXPLORE_MENU_ITEMS`:160、`EXTRA_EXPLORE_ITEMS`:261、`resolveExploreMenuItems`:278、`activateExploreItem`:290、`registerExploreItem`:774 全部仍在 `sidebar-coordinator.js`；全仓无第二份清单/图标/激活实现。`explore-more-menu.jsx` 本次仅改注释（12 行）。
- **② 删除面残留引用**：`plugins/*/src` 内已无 `#omnimux-explore-entry` / `#omnimux-explore-menu` / `getExploreEntryForTests` / `EXPLORE_STYLES` 使用。但仓内仍有 3 处引用被删表面的**外部脚本**（见 §5），其中 1 处会红。
- **③ 无空 catch**：改动文件里 `catch` 共 2 处——`explore-more-menu.jsx:95` 是注释；`sidebar-coordinator.js:861` 是既有 `delete window[key]` 回退（catch 体内有赋值，非空）。`node scripts/verify-silent-catch.mjs` exit 0。
- **④ 测试真跑（我独立重跑）**：
  - `node --test plugins/omnimux/src/client/sidebar-coordinator.test.js plugins/omnimux/src/client/explore-more-menu.test.js` → **34/34 pass，exit 0**
  - `pnpm --filter omnimux test` → exit 1：三段 `2/2`、`3644/3646`、`89/89`；2 例失败均在 `src/agents/local.test.js`（本机 codex 本地 agent 模型探测），与本次改动面无交集，属既有环境性失败（Lead 已在干净 main 复核）。
  - 静态：`verify-stage-contracts`（14 Stage / 8 sidebar target，PASS）、`verify-slot-contracts` exit 0、`verify-plugin-boundaries` exit 0、`verify-anti-slop` 3/3、`verify-silent-catch --quiet` exit 0。
  - 组件级浏览器证据独立重跑：`node scripts/verify-explore-registration-browser.mjs` → **9/9 PASS，RESULT: PASS，exit 0**（Chrome 155，真实鼠标点击，产物仍落 `docs/evidence/explore-registration-3124/`，未改路径）。

## 5. 复核发现：一处会红的门禁回归（需处理）

`sidebar-coordinator.js` 删掉 `EXPLORE_STYLES` 后，**仍要求该样式块存在的门禁**没跟着退役：

| 命令 | 结果 |
|---|---|
| `node scripts/guard-no-transparent-popover.mjs` | **exit 1**，FATAL `[EXPLORE_MENU_MUST_EXIST] sidebar-coordinator.js 必须定义 .omnimux-explore-menu 浮层菜单样式规则。` |
| `node --test tests/e2e/guard-no-transparent-popover.test.mjs` | **exit 1**，`硬门禁 2: sidebar-coordinator.js 探索菜单纯实体深色背景断言` → `必须找到 .omnimux-explore-menu 样式块` |

`tests/e2e/guard-no-transparent-popover.test.mjs` 是 `pnpm test:gates` 的成员（见 `package.json`），因此**当前门禁套件会红**。修法应由门禁 owner 决定：退役「探索菜单必须存在」这条断言（其守护对象已删除），或把守卫对象改到仍存在的浮层（如新建菜单）；不建议为凑绿保留一段死样式。

另两处被删表面的外部引用（不红，但属残留）：
- `scripts/verify-issue-2721-split-stage.mjs`（在 `scripts/governance-manifest.json` 登记，但未挂任何 npm script）仍在查 `#omnimux-explore-entry, [data-omnimux-explore-entry]`；
- `plugins/omnimux-workflow/tests/e2e/preset-operation-3206.journey.mjs` 第二段仍查 `.omnimux-explore-menu` 且期望清单含 `Google Vids` / `快讯中枢` —— Lead 已确认该文件本任务不改，记为待 workflow owner 重定向（改动前它已不成立，且 `guard-anti-cheat` 对匿名断言削弱是硬拒绝）。

## 6. 已知失败 / 未执行

| 项 | 状态 | 原因 |
|---|---|---|
| `asset-hub-reachable-via-library`（app-browser） | fail | 该插件集不含侧栏支持包 → `__omnimuxWorkbench.openWorkbench` 返回 false；与本改动无关（`explore-section-visible` / `explore-cards-present` 均 pass）。同一原因在 #3774 验收里已记录 |
| `pnpm test:gates` 整链 | 未跑 | 已知会因 §5 的 popover 门禁红；其余成员未验证 |
| Electron / `verify:cdp` | 不适用 | 本改动为 web 客户端注册，无 Electron-only 行为 |
| Dev 45120 | 不适用 | 合同规定人工职责，Agent 不连 |

## 7. 证据文件清单

- `.workbuddy/evidence/remove-explore-3785/final/more-menu-baseline.png`（1280×713）
- `.workbuddy/evidence/remove-explore-3785/final/more-menu-runtime-item.png`（含第 13 行「QA运行时项」）
- `.workbuddy/evidence/remove-explore-3785/final/more-menu-after-unregister.png`
- `.workbuddy/evidence/remove-explore-3785/final/app-home.png`
- `.workbuddy/evidence/remove-explore-3785/final/explore-removed-observation.json`、`raw-run.json`
- `.workbuddy/evidence/remove-explore-3785/journey-explore-removed.mjs`、`request-observe.json`、`chrome-launcher.sh`
- `.workbuddy/evidence/remove-explore-3785/logs/`（`final-run*.log`、`independent-checks.log`、`baseline-run.log`）
- 合同原件 + 封套：`.workbuddy/evidence/contract/omnimux-remove-explore-entry-issue-3785/a5858e90-…/`（含 `evidence.json`）
- 稳定副本：`docs/evidence/omnimux-remove-explore-entry-issue-3785/`

## 8. 复跑记录（应 Lead 要求，为 e2e 前置产生晚于 spec 的证据）

同一 request JSON、同一探针、未改任何非证据文件：

| 项 | 值 |
|---|---|
| runId | `cbd603d9-5555-4229-b2b6-274f2398adb9` |
| origin | `http://127.0.0.1:52792`（动态；CDP 52878） |
| 开始 / 结束（CST） | 2026-10-25 22:32:06 / **22:34:55** |
| 结果 | task-journey **5/5 pass（exit 0）**；app-environment 3/3 pass；唯一失败 `asset-hub-reachable-via-library`（既有环境项） |
| errors / cleanup | `[]` / `cleaned: true` |
| 截图（22:34:27–22:34:31 生成） | `more-menu-baseline.png`（22:34:27）、`more-menu-runtime-item.png`（22:34:28）、`more-menu-after-unregister.png`（22:34:29）、`app-home.png`（22:34:31），均 1280×713 |
| 合同原件 + 封套 | `.workbuddy/evidence/contract/omnimux-remove-explore-entry-issue-3785/cbd603d9-…/` |
| 稳定副本写入时间 | 22:36:36（`.workbuddy/evidence/remove-explore-3785/final/`、`docs/evidence/omnimux-remove-explore-entry-issue-3785/`） |

§1–§7 仍是 `a5858e90-…` 那次的记录，两次结论一致（终态三项全绿）。
