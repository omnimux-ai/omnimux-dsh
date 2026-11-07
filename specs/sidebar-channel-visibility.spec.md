# 规格：侧栏入口按发布渠道显隐（开发版全开 / 正式版过滤 Alpha）

- 状态：实现中
- 归属包：`plugins/omnimux`（hub 客户端侧栏单一协调器）
- 关联 Issue：#3971
- 取代：#3920 引入的「正式版只保留 DSH 原生侧栏」无条件收敛（见 `specs/sidebar-dsh-native-only.spec.md`）

## 背景与目标

#3920 把 `sidebar-coordinator.js` 的 `PINNED_ENTRY_PREFIXES` 清空、`EXPLORE_MENU_ITEMS` 砍到只剩「应用」「视频剪辑」，导致**开发版也失去** 项目、资产库、灵感社区、技能/专家、AI 网红工作室 等入口。这与 `docs/contracts/alpha-release.md`「开发源码与 Dev 保留 Alpha 插件和已有能力，不能因标记而隐藏或停用」相矛盾。

目标：按发布渠道区分——

- **开发版（`release-channel.json` = `development`）**：侧栏与官方「更多」菜单恢复全部入口，Alpha 项照旧带 `Alpha` 内测标识。
- **正式版（`release-channel.json` = `production`）**：只过滤 `plugin-lifecycle.json` 标为 Alpha 的测试版四项（账号、发布、数据分析、任务表单），其余非 Alpha 入口保留。

## 用户操作旅程

1. 用户启动开发版 OmniMux，左侧栏「新对话」下方依次出现：任务看板 / 项目 / 技能·专家 / 资产库 / 灵感社区 / AI 网红工作室 等常驻行；点官方「更多」行，菜单里可见 应用、视频剪辑、发布、账号、手机管理、数据分析、任务表单、社交采收；其中 Alpha 项右侧带「Alpha · 内测」标识。
2. 用户打开正式版 OmniMux，上述常驻行只保留非 Alpha 项；「更多」菜单不出现 账号、发布、数据分析、任务表单 四项，其余入口照常可点。
3. 点击任意入口的行为、登录门、选中态、关闭逻辑全部保持不变（本改动只影响可见性）。

## 期望界面反馈与验收用例

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| A1 | development 渠道，注册 `omnimux-workflow/assets/inspiration/market/avatar` 行 | 五行实际挂进侧栏 DOM，按 rank 排序 |
| A2 | development 渠道，`resolveExploreMenuItems()` | 返回 8 项：应用、视频剪辑、发布、账号、手机管理、数据分析、任务表单、社交采收 |
| A3 | production 渠道，`resolveExploreMenuItems()` | 返回非 Alpha 的 4 项：应用、视频剪辑、手机管理、社交采收 |
| A4 | production 渠道，注册 Alpha 行（accounts/publish/analytics/forms） | 不挂入侧栏 DOM，也不进入菜单 |
| A5 | 两渠道 | 非 Alpha 行的点击、登录门、选中态不变 |

## 假设

1. `plugins/omnimux/src/release-channel.json` 是发布渠道的唯一真源：源码/开发目标为 `development`，发布入口写入 `production`，客户端构建时随包内联，因此同一份客户端代码在两种渠道下读到不同值。
2. `plugin-lifecycle.json` 的 `stage: alpha` 名单（账号、发布、数据分析、任务表单）就是用户所说的「测试版」，不另立第二份名单。
3. 正式版发布脚本已把 Alpha 插件排除出加载名单；即使个别 Alpha 插件仍注册，协调器在 production 下也要兜底不挂载。

## 证伪方式

1. 用 `resolveExploreMenuItems()` 在 production 通道调用，若仍返回账号/发布/数据分析/任务表单任一项，则假设 1 或过滤实现被证伪；预期应恰好只剩 `['应用','视频剪辑','手机管理','社交采收']`。
2. 在 development 通道注册 `omnimux-workflow-entry`，若该元素 `parentElement === null`，则「开发版常驻行恢复」被证伪；预期挂在 `[data-pane="sidebar"]` 内。
3. 运行 `node --test src/client/sidebar-coordinator.test.js src/client/explore-more-menu.test.js`（cwd=`plugins/omnimux`），出现任一失败即证伪。

## 非目标

- 不把任何 Alpha 插件转正（不改 `plugin-lifecycle.json`）。
- 不改发布脚本的 Alpha 加载名单与 `sync-stable.sh` 行为。
- 不写生产 profile、不改宿主官方 `packages/` 或类名。
- 不恢复已退役的「探索」常驻行/浮动菜单。

## 旧标准变更

#3920 把「全部自研入口无条件收敛」写成测试标准；本任务按发布渠道恢复，以下既有用例的原断言与新行为冲突，逐条声明：

- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `Alpha entries are excluded from sidebar placement while retaining source registers`
  - 原断言：`for all rows: element.parentElement === null`（因 `PINNED_ENTRY_PREFIXES` 为空，所有 `omnimux-*` 都收敛不挂 DOM）。
  - 必须改的理由：#3920 的无条件收敛按渠道恢复为「开发版常驻、正式版过滤 Alpha」，核心常驻项必须重新挂回侧栏，原断言把正确行为判成失败。
  - 新期望证据：`workflow`、`inspiration` 的 `parentElement === [data-pane="sidebar"]`；`accounts/publish/analytics/forms/automation` 仍为 `null`；文档内 Alpha 徽章计数仍为 0。用例改名为「开发版：Alpha 内测项不挂 DOM，核心常驻项挂回侧栏」。
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `desktop 外壳包住内层 pane 时 assets 收敛不挂 DOM`
  - 原断言：`assets` 行 `parentElement === null`。
  - 必须改的理由：`omnimux-assets` 重新回到核心常驻白名单，desktop 外壳内层 pane 里必须挂出该行。
  - 新期望证据：`assets` 行 `parentElement === [data-pane="sidebar"]`，且无探索行。用例改名为「desktop 外壳包住内层 pane 时 assets 常驻项挂进侧栏 DOM」。
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `常驻行按 rank 挂载在侧栏，探索行不再出现在最下方`
  - 原断言：`workflow/market/assets/inspiration` 四行 `parentElement === null`。
  - 必须改的理由：四项均属核心常驻白名单，按 rank 挂载是 #3920 前的既定契约，恢复后必须重新成立。
  - 新期望证据：四行 `parentElement === [data-pane="sidebar"]`，且它们在 `root.children` 中的索引按 4 / 4.1 / 6 / 7 升序。用例改名为「核心常驻行按 rank 挂载在侧栏，探索行不再出现」。

补充声明（用例改名后的现行名，同样为 #3920 无条件收敛标准被按渠道恢复）：
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `desktop 外壳包住内层 pane 时 assets 常驻项挂进侧栏 DOM`
  - 原断言（改名前的同名语义用例）：`assets` 行 `parentElement === null`；必须改为挂进内层侧栏 pane，理由同前。
  - 新期望证据：`assets` 行 `parentElement === [data-pane="sidebar"]`。
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `开发版：Alpha 内测项不挂 DOM，核心常驻项挂回侧栏`
  - 原断言：所有 `omnimux-*` 行 `parentElement === null`；必须改为核心常驻项挂回、Alpha 仍不挂。
  - 新期望证据：`workflow`/`inspiration` 挂入 `[data-pane="sidebar"]`，Alpha 行仍为 `null`。
- `plugins/omnimux/src/client/sidebar-coordinator.test.js` :: `核心常驻行按 rank 挂载在侧栏，探索行不再出现`
  - 原断言：四行 `parentElement === null`；必须改为按 rank 挂入侧栏。
  - 新期望证据：四行 `parentElement === [data-pane="sidebar"]` 且子节点索引升序。

- `tests/e2e/sidebar-explore-convergence.e2e.test.mjs` :: `E2E: 非核心及内测插件仍收敛，核心常驻项仍不收敛`
  - 原断言：`expectedLabels` 含 `产品库`、`自动化` 共 10 项。这两项已在 #3816（产品库并入资产库）与 #3842（自动化退役）后不存在，原列表已过期。
  - 必须改的理由：断言与当前真源清单（8 项）不符，任何实现都无法通过，属于陈旧标准。
  - 新期望证据：`expectedLabels` 为 8 项（应用/视频剪辑/发布/账号/手机管理/数据分析/任务表单/社交采收），文件包含全部 label 且无 Emoji。
