---
title: "Dev App Electron 专属追加验收参考"
id: "standard-dev-app-cdp-acceptance"
type: "reference"
status: "living"
authority: "L4"
date: "2026-09-02"
updated: "2026-09-09"
related:
  - "docs/contracts/dev-pipeline.md"
  - "docs/contracts/plugin-qa.md"
  - "scripts/verify-dev-cdp.mjs"
---

# Dev App Electron 专属追加验收参考

> 本文保留 Electron CDP 方法与历史案例，不定义通用验收政策，也不证明当前 App 已通过验收。适用层以 [plugin-qa.md](../contracts/plugin-qa.md) 为准，环境以 [dev-pipeline.md](../contracts/dev-pipeline.md) 为准；本文不替代这两份合同。

## TL;DR

- 合并前在隔离 worktree 完成相关自动化测试、静态检查和独立评审，再通过 required CI / Merge Queue；没有独立 App/Host 测试环境。普通 Web/Stage 改动合并后从 `main` 物化 Dev `~/.omnimux-dev`，在 45120 使用 ego-browser + 共享 `verify:live`，默认不要求 Electron。
- Dev/Prod 不得 link 或接收未合并工作树。纯文档、流程、脚本无需 App 物化；CI `qa:pass` 仅证明合入前静态与测试，不证明 Dev 验收。
- 只有涉及 **壳层样式 / `data-dsh-desktop-*` / 平台门控** 等 Electron 专属行为时，才追加 **CDP 直连 Electron renderer** 证据；45120 网页不能代替该层，CDP 也不能代替所需 Web 证据。
- 下文记录 desktop-fork #33 的 Dev CDP 端口方案（默认 `9229`）及 `pnpm verify:cdp` 用法。实际构建、目标窗口和运行身份须在每次验收时核对。

## 一、为什么「45120 网页 ≠ Dev App 窗口」

Dev App 是 **Electron 应用**。`http://127.0.0.1:45120` 是其 **host 端口**：

| 访问方式 | 触达对象 | 能读到什么 |
|---|---|---|
| Ego-Browser / curl / opencli 访问 `45120` | **web 侧宿主页**（另一个 Chromium 渲染进程） | 网页 DOM，**不含 Electron 窗口特有的样式门控** |
| CDP 连接 `9229` 的 page target | **Dev App 的真实 Electron renderer** | 真实的窗口 DOM / computed 样式 / 交互 |

**本质差异**：`data-dsh-desktop-platform="darwin"` 等壳层样式只在 Electron 窗口触发，web 侧（非 darwin）**永远不会触发**。因此：

> 一个只在 Electron 窗口生效的样式回归（如 `.wf-panel-shell__card` padding 被壳层规则覆盖），在 web 侧验收**永远是绿的**，在 Dev App 却坏了。**web 侧绿 ≠ Dev App 验收通过。**

## 二、何时必须 CDP 直连验收

凡命中以下任一条件的改动，**必须**用 CDP 在 Electron 窗口验收，不得以 web 侧代替：

1. 触及壳层样式：`dsh-plugin-desktop/src/client/*.ts` 注入的、`[class*=...]` / `!important` / `data-dsh-desktop-*` 门控规则；
2. macOS / Windows 平台门控的布局、窗口、滚动、panel 表现；
3. 用户在 Electron 窗口上报、Web 侧无法复现，且需要核实壳层/平台差异的行为。

纯插件 Web/Stage 逻辑（不涉壳层/平台门控）按 `plugin-qa` 的 Web 证据完成适用验收，不追加 Electron 要求；curl 或页面可达性不能替代共享浏览器探针。

## 三、验收通道：CDP 直连（desktop-fork #33）

### 3.1 Dev App 暴露 CDP

Dev App（Dev 构建）通过 desktop-fork #33 在 `start()` 注入：

```ts
const cdpPort = resolveDevCdpPort({ env: process.env })
if (cdpPort !== null) app.commandLine.appendSwitch('remote-debugging-port', cdpPort)
```

- Dev 启动 → 默认 `9229`，可用 `OMNIMUX_DEV_CDP_PORT` 覆盖；
- Prod / release → `resolveDevCdpPort` 返回 `null`，**永不暴露 CDP**。

### 3.2 Agent 探针：`pnpm verify:cdp`

`scripts/verify-dev-cdp.mjs` 自动：

1. 连 `http://127.0.0.1:<CDP_PORT>/json/list`，优先选择指向 `:45120`（可由 `OMNIMUX_PORT` 覆盖）的 page target；脚本在无匹配时会回退到任意 page，不能仅凭脚本 PASS 确认目标就是所需 Dev App 窗口；
2. 若目标 selector 不在，驱动窗口（创作 → 画布 → 选中节点）；
3. `Runtime.evaluate` 读 `.wf-panel-shell__card` 的 computed 样式；
4. 断言 `padding-top`（默认 `12px`）；
5. 落盘 `docs/evidence/live-cdp-qa-report.json`。

**用法**：

```sh
# 默认断言 .wf-panel-shell__card padding-top=12px
pnpm verify:cdp

# 自定义 selector / 期望值 / 端口
OMNIMUX_CDP_SELECTOR='.some-stage' OMNIMUX_CDP_PADDING_TOP='8px' pnpm verify:cdp
OMNIMUX_CDP_PORT=9333 pnpm verify:cdp
```

**前置条件**：Dev App 正在运行且已暴露 CDP 端口（desktop-fork #33 已合并 + Dev App 以新构建启动）。

## 四、合同落点

- [dev-pipeline.md](../contracts/dev-pipeline.md)：定义隔离 worktree 检查、合并后 Dev 与生产环境边界；只有壳层/平台门控改动额外要求 Electron。
- [plugin-qa.md](../contracts/plugin-qa.md)：定义适用矩阵、Web 共享探针与 Electron 追加证据。需要 Electron 而 CDP 不可用时为 BLOCKED，不以网页或截图猜测代替。

现有 CDP 脚本只提供 selector/computed style 的定向测量；其报告未记录完整代码 SHA、dirty、profile 和 Host 身份，不能单独构成当前任务的完整放行证据。验收者须按合同补核身份和适用项。

## 五、判别法则（给 Agent 的检查清单）

按 `plugin-qa` 判定需要 Electron 追加证据后，检查：

- [ ] 目标行为是否依赖 `data-dsh-desktop-*` 或壳层规则？普通 Web/Stage 不追加该层。
- [ ] 测量是否来自目标 Electron 窗口，且运行身份已核对？45120 网页不能证明 Electron 专属行为。
- [ ] `.wf-panel-shell__card` / 关键 selector 的 computed 值是否符合预期、无 `!important` 外部覆盖？按目标行为配置 `verify:cdp` 断言。
- [ ] `docs/evidence/live-cdp-qa-report.json` 是否属于本次运行，并与任务代码和环境身份一同留存？文件存在或历史 PASS 不等于当前验收。

## 六、历史根因（参考）

以下保留 2026-09-02 文档中的历史案例，不证明当前桌面构建、样式或验收状态。桌面壳 `extended-styles.ts` 曾用：

```css
body[data-dsh-desktop-platform="darwin"] [class*="panel"] { padding-top: 0 !important }
```

`[class*="panel"]` 误伤 `.wf-panel-shell__card`，把其 `padding-top` 压成 0，造成「web 正常 / Dev App 顶部贴顶」。已收窄为 `[class*="_panel"]`（desktop-fork #32）。此案例说明**壳层 `[class*]` 泛匹配 + `!important` 会误伤插件**，亦应成为壳层 CSS 审查红线。
