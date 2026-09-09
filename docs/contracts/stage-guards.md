---
title: "stage-guards — 一级 Stage / 本地写闸 / 空态静态契约"
id: "contract-stage-guards"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-26"
updated: "2026-08-31"
authors: ["x", "agent-architect"]
subsystem: "omnimux-accounts"
---

# stage-guards — 一级 Stage / 工作台 Tab / 本地写闸 / 空态静态契约

> 解决问题：E2E 反复踩「关页卸树丢状态」「写路由无同域闸」「空态文案混用」。
> 配套：`plugin-qa.md`（验收五维）+ `yarn omnimux:doctor`（静态拦）+ `hub.md`（垂直禁 import）。

## 1. 关页保活（一级 Stage / 工作台 Tab / Plaza）

座已迁到 `dsh-better-sidebar`（[workbench-split.md](./workbench-split.md)）。保活规则对 **Tab 根组件** 与残留 overlay 同样生效。关闭工作台 Tab = `closeTab` + `display:none` 保活，**不是** `claim`/`release` overlay。

| 规则 | 判定 |
|------|------|
| MUST | 首次打开后子树保活：`everOpened`（或等价 keep 旗）+ 关闭用 `display:none` / `aria-hidden`，禁止关页卸树 |
| MUST NOT | 以 `if (!open …) return null` 作为**已打开过**的关页路径 |
| 允许 | 从未打开：`if (!stage \|\| !everOpened) return null`；**Modal/Dialog** 关闭 `return null` |
| 金标（doctor / `pnpm verify:stages` **FAIL** 若回归） | `AccountsStage.jsx`、`ProductsStage.jsx`、`AssetsStage.jsx`（已合入 main） |
| 工作台 Tab 根（**FAIL**） | `ProjectLibraryPage.jsx`、`plaza-shell.js`（或继任 `PlazaTab`）、各 `*Stage.jsx` 在迁入右栏后仍要保活 |
| 已知债（doctor **WARN**） | `WorkflowStage.jsx`（已不再挂 overlay，遗留文件）、`AppsStage.jsx`（未挂载货架）、`ClipStage.jsx`（仅 portal） |

## 1.1 工作台座门禁（#318）

`scripts/verify-stage-contracts.mjs` 必须同时扫：

1. Tab / Stage 根保活（上表）。
2. **禁止库页 overlay 回潮**：下列包的 `src/client/index.js`（market 为 `src/client/apply.js`）**不得** `slots.inject('shell.overlay')`：`omnimux-assets` / `products` / `accounts` / `inspiration` / `publish` / `analytics` / `workflow` / `market`。
3. **允许 overlay 白名单**：`plugins/omnimux/src/client/index.js`（LoginGate）、`plugins/omnimux-clip/src/client/index.js`（ClipStage portal only）。
4. **禁止库页 claim**：迁入名单包的 sidebar / workbench-store 源码不得出现 `claimProductStage` / `stage.claim(`（clip portal 除外）。

实际 sidebar 检查从 client 装配入口捕获传给 kit 的 adapter；六方法、取消订阅、Tab 注册、会话隔离与关闭重开必须执行通过。静态入口不再以旧 wrapper 的工厂导出作为运行覆盖。合并前在隔离 worktree 完成相关自动化/静态检查和独立评审；合入后物化 Dev，在 45120 用 ego-browser 与 `pnpm verify:live <stage>` 完成真实浏览器验收，证据格式见 [plugin-qa.md](./plugin-qa.md)。

## 2. 本地写闸

| 规则 | 判定 |
|------|------|
| MUST | Host 变更类路由（POST/PUT/DELETE 或 method 触发写盘 / 装包 / 重启）在执行副作用前过闸 |
| 闸形态 | `assertLocalWrite`（hub `apps/origin.js` 或插件本地副本）**或** `trustedRestartRequest`（market） |
| 金标已闸（doctor **FAIL** 若丢失） | market `pluginRestart`；products / assets / workflow / hub 写路由上的 `assertLocalWrite` |
| 推进中 / 债（doctor **WARN**） | market `config`+`save`（业务 PR 已补闸、待合入）；`install` / `uninstall` / `pluginInstall` / `catalogInstall` / `catalogSummon` / `catalogUninstall` — 契约仍 MUST |

## 3. 空态语义

| 面 | 正确语义 | doctor |
|----|----------|--------|
| products / assets | 无关键词 → `empty.all`；有关键词无命中 → `empty.noMatch` | key 缺失 → **WARN**（待业务 PR；合入齐全后可升 FAIL） |
| market Skills | 无命中可走 `search.fallback`（热门兜底） | `i18n.js` 缺失则跳过；有文件缺 key → **WARN**；**有** fallback **不算**缺陷 |
| market 其他 tab | `mkt.empty` / `expert.empty` / `connector.empty` 真空 OK | — |

## 4. 垂直禁 hub import

| 规则 | 判定 |
|------|------|
| MUST NOT | `omnimux-accounts` / `assets` / `products` / `market` / `workflow` / `analytics` 等垂直包 `from 'omnimux'` 或 import hub 包内路径 |
| 对齐 | `hub.md`；doctor 静态扫包名 import → **FAIL** |

## 5. 非本契约本轮实现范围

共享 StageShell、修卸树债、修 install/catalog / config 闸、改 Skills fallback —— 见 backlog；除 accounts/products 关页与 pluginRestart / assertLocalWrite 存在性外，债项本轮进 doctor **WARN**，不进 FAIL 集。
