---
title: "DSH 0.2.1 服务契约下的 22 个产品插件激活清点（webRuntime / settingsScope / settings 面）"
id: "evidence-dsh-021-plugin-activation-sweep"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-25"
authors: ["x", "agent"]
subsystem: "global"
tags: ["dsh", "compat", "rc-upgrade", "plugin-activation", "settings-service"]
---

# DSH 0.2.1 服务契约下的 22 个产品插件激活清点

## 1. 身份与范围

- 任务：[#3775](https://github.com/omnimux-ai/omnimux-dsh/issues/3775)（P1，跨插件验证）。
- 目的：在**真实 0.2.1 宿主**上逐一确认本仓 `plugins/*` 22 个产品插件：① 没有 `webRuntime` / `settingsScope` 遗留；② 对 `settings` 服务的引用是**按需取**（`ctx.get`）而非硬等待（`inject` / 硬依赖）。
- 前置批次：本仓 #3773 把 `settings` 从硬 `inject` 改为按需 `ctx.get`，并移除了 `settings-value-reader.js` 的 `ctx.inject(['settingsScope'], …)` 分支；壳仓 PR #100/#101/#102 处理 `dsh-community-market` 与 `dsh-better-sidebar`（不在本文范围）。
- 基线：任务工作树 `cross-plugin-021-activation-issue-3775`，创建 base `origin/main` `457db50c1`；集成前已 fast-forward 到 `origin/main` `901eec472`（#3765），零冲突。
- 方式：静态全量扫描 + 真实 cordis 挂载 + 真实 rc.3 宿主的 profile 组合与 boot。**未修改任何插件运行期源码**（本次改动只有 1 个 e2e 用例与规格文档，见 §6）。

## 2. 口径：本机有两个 0.2.1 代际，必须区分

这是本任务最容易出错的地方。本机同时存在两个 0.2.1 宿主，**只有一个是产品宿主**：

| 身份 | 版本来源 | 是否产品宿主 |
| --- | --- | --- |
| `/Applications/OmniMux Dev.app` 2.0.10 | `Contents/Resources/build-info.json` 的 `dsh.packageSpec` = **`0.2.1-rc.3`**（`upstream.master` `9847a9bb63`） | ✅ 是。Dev profile `~/.omnimux-dev/profiles/omnimux` 归它 |
| `/Applications/DeepSeek Harness.app` | `0.2.1-rc.2.20261020.1` | ❌ 不是 |
| npm 全局 `dsh`（`~/.nvm/.../bin/dsh`） | `0.2.1-rc.2` | ❌ 不是 |

**误报陷阱**：用 npm 全局 `dsh`（rc.2）组合同一份 profile，会 **skip 5 个 bundle** ——
`omnimux-browser`、`omnimux-intercept`、`omnimux-market`、`omnimux-studio`、`omnimux-viewer`，
因为它们的 peer 范围从 `>=0.2.1-rc.3` 起（`omnimux-market` 为 `>=0.0.0 <0.2.1-0 || >=0.2.1-rc.3`）。
换用 rc.3 宿主后 **stderr 零 skip**。拿 rc.2 复现会得出与事实相反的结论。

## 3. 静态面结论（22/22）

扫描口径：`plugins/*` 下生产源码，排除 `node_modules` / `lib` / `dist` / `build` / 测试与文档。

| 符号 | 命中 | 判定 |
| --- | --- | --- |
| `webRuntime` | **0**（全仓 0，含测试与文档；唯一提及在 `research/dsh/sources/official/04-cli-reference.md`，属上游文档引文） | 干净 |
| `webStartup` | **0**（该标识符只存在于壳层 Dev profile 的 `cordis.patch.yml`） | 干净 |
| `settingsScope`（生产源码） | **3**，全在 `omnimux`，且**全部是注释** | 2 处文档级遗留 + 1 处移除说明（见 §6） |
| `settings` 服务硬 `inject` | **0**（22 个包全 0；`cordis.patch.yml` 无一声明 `inject:`；`dsh.manifest.json` 的 `dependencies` 无一处引用 `settings`） | 干净 |
| `settings` 服务按需 `ctx.get` | 14 处，集中在 3 个包 | 按需取 ✅ |

按需取站点：

| 插件 | 文件:行 |
| --- | --- |
| `omnimux` | `src/host/apply.js:168,220,246,247,248,270,306,405,416`；`src/host/http.js:116,121,129,135`；`src/media/mount.js:168`；`src/text/mount.js:42,152` |
| `omnimux-market` | `src/host.ts:457` |
| `omnimux-products` | `src/http-routes.js:289`（经 `readSeat(ctx, 'settings')` → `ctx.get`） |

其余 19 个插件与 `settings` 服务**零耦合**。

非遗留说明：`omnimux-browser/src/remote-host-api.ts:686` 的 `namespace: 'settings'` 是**远程 RPC 命名空间字符串**，不是服务注入。

## 4. 真实宿主取证（三层证据）

### 4.1 组合进 profile（真 rc.3 宿主算法）

`dsh --dump-config` 是「组合出的 profile」的官方产物，且为 **boot-free**（只跑 patch 合成算法，不 mount、不求值 `!!js`）。

```sh
PROBE=/tmp/dsh-3775-probe          # 私有 DSH_HOME；Dev/Prod 未被触碰
# 22 个 worktree 插件作 bundle，node_modules 内软链指向 worktree 的 plugins/*
DSH_HOME=$PROBE node /tmp/dsh-rc3/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile verify3775 --dump-config
```

结果：**exit 0；stderr 0 行 skip；22 个 `# == omnimux*` bundle 段 + 22 条 inserted row**。

### 4.2 目标代际 apply 演练

```sh
node scripts/verify-profile-preflight.mjs $PROBE/profiles/verify3775 \
  --app "/Applications/OmniMux Dev.app"
```

结果：**22/22 `apply(ctx)` 成功，核验 156 个工具契约，exit 0**；脚本自报「声明宿主代际 `0.2.1-rc.3`」。

### 4.3 真实宿主 boot + fiber phase（运行期激活）

`--dump-config` 只证组合不证 mount；而 cordis 里 `inject` 永不满足时插件**静默停在 pending 且不报错**，所以「boot 没崩」不是证据，fiber phase 才是。用宿主自带的 `pluginInventory` 服务（`@deepseek-ai/dsh-host-plugin-inventory`，`static inject = ['loader']`，`list()` 返回每条 loader entry 的 `fiberPhase`）取证：

```js
// 私有 DSH_HOME，仅 /tmp
const { runProfile } = await import('@deepseek-ai/dsh/profile-boot')
const { createLaunchEnvironmentSnapshot } = await import('@deepseek-ai/dsh-launch-environment')
const environment = createLaunchEnvironmentSnapshot([{ source: 'process', values: { ...process.env } }])
const { ctx, shutdown } = await runProfile({
  environment, profile: 'verify3775', patchFiles: [], args: ['--port', '0', '--no-open'],
})
const { entries } = await ctx.pluginInventory.list()
```

结果：**`{"active": 22} of 22 product plugins`，exit 0**（观察到 216 条 loader entry）。22 个产品插件全部 `fiberPhase = active`，无 `pending` / `failed` / `MISSING`。

### 4.4 契约静态校验

| 命令 | 结果 |
| --- | --- |
| `pnpm verify:plugin-load`（`node scripts/verify-plugin-load.mjs --json …`） | **22/22 通过**，exit 0 |
| `node --test scripts/verify-plugin-load.test.mjs` | 8/8 通过 |
| `node scripts/verify-dsh-declaration-range.mjs` | 通过：44 条 peer 容纳 `0.2.1-rc.3` 且未收窄旧世代 |
| 同上 + `OMNIMUX_VENDOR_MANIFEST=<rc.3 manifest.json>` | 通过：48 个 `dsh-*` 引用名全部在底座清单内 |

## 5. 逐插件结论表

| 插件 | 静态判定 | verify:plugin-load | profile 组合（rc.3） | fiberPhase |
| --- | --- | --- | --- | --- |
| `omnimux` | ⚠️ 3 处 `settingsScope` 注释；`settings` 按需 12 处 | ✅ ok | ✅ | active |
| `omnimux-market` | ✅ `settings` 按需 1 处 | ✅ ok | ✅ | active |
| `omnimux-products` | ✅ `settings` 按需 1 处 | ✅ ok | ✅ | active |
| `omnimux-accounts` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-analytics` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-apps` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-assets` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-automation` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-avatar` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-browser` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-clip` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-device` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-forms` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-inspiration` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-intercept` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-publish` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-social-harvest` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-studio` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-video` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-video-preview` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-viewer` | ✅ 零命中 | ✅ ok | ✅ | active |
| `omnimux-workflow` | ✅ 零命中 | ✅ ok | ✅ | active |

## 6. 发现的遗留与处理

### 6.1 功能级（已修）

`plugins/omnimux/tests/e2e/settings-value-reader.e2e.test.js:74` 的
`E2E: 0.1.5 settingsScope value keeps the same bypass behaviour` 仍用
`fakeCtx({ settingsScope: binder })` 驱动 reader。#3773 已删除该模块的
`ctx.inject(['settingsScope'])` 分支，因此 `read()` 恒为 `undefined`、登录门不再放行，
该用例**在本机稳定失败**（实测 2 pass / 1 fail）。

它不在 `plugins/omnimux/scripts/run-tests.mjs` 的 `src/**` 收集范围内，所以
`pnpm --filter omnimux test` 从不暴露它 —— 这是一个长期躺在仓库里的红用例。

**修法**：改写为移除回归用例 `E2E: retired settingsScope service no longer bypasses the login gate`，
断言 `read() === undefined`、`bypassed === null`、`getSnapshot().phase === 'prompt'`，
把 #3773 的移除固化成回归保护。改后 **3/3 通过**。变更声明见
[issue-3775-settings-scope-leftover.spec.md](../../specs/issue-3775-settings-scope-leftover.spec.md) §旧标准变更。

### 6.2 文档级（本次不改，已知延后项）

| 位置 | 问题 |
| --- | --- |
| `plugins/omnimux/src/client/settings-value-reader.js:1-12` | 模块头仍称「跨 DSH 两代客户端 API」，并称 0.1.5 走 `ctx.settingsScope.bind({ namespace })` |
| `plugins/omnimux/src/client/ModelsSettingsCard.jsx:51` | 仍称写入走 `official settingsScope.set / unset`；该组件实际用服务无关的 `scope` prop |

两处都在 `src/client/` 下，改动会把任务变成「客户端/UI 变更」，按
[plugin QA](../contracts/plugin-qa.md#本地最小命令选型agent-默认) 必须附隔离工作树
**功能路径浏览器证据**；而本任务可用的工作树浏览器运行器
（`scripts/worktree-web-qa.mjs`）只覆盖侧栏 chrome 几何，与这两行注释无关，
拿它当证据属于「首页打卡冒充」。因此**报告不改**，建议随下一个本就携带浏览器证据的
客户端 PR 一并修正（各一行）。

### 6.3 有意保留（非遗留）

- `plugins/omnimux/src/client/settings-value-reader.js:67` 的注释 —— 它记录的正是该服务在 0.2.1 已不存在。
- `settings-value-reader.js` 中 `adopt()` 的 `fromConfigForms` 优先保护 —— 当前只有一代服务、该分支不可达，但它是「旧服务若回归也不得覆盖新服务」的显式不变量。
- 各 `*.test.js` 的 `fakeCtx` `settingsScope` 分支 —— 用来模拟「只有退役服务的宿主」的夹具。

## 7. 未验证项

1. **`pnpm --filter omnimux test` 的 2 个 fail 属既有红灯，非本次改动引入**。
   `plugins/omnimux/src/agents/local.test.js` 的
   `marks only the binaries that answer --version as installed` 与
   `probeAgentModels returns dynamic models from local cache/config`。
   证明：在**干净主检出**（`origin/main`，无本次改动）跑同一文件 = **11 pass / 2 fail**，
   断言消息逐字相同；且本次改动全在 `tests/e2e/` 与 `specs/`，不在 `run-tests.mjs` 的
   `src/**` 收集范围内。属本机环境依赖（缺 `gpt-6-astra` 本地缓存 fixture）。
2. **Dev 真机验收未取证**（人工职责）。Dev 实例（`OmniMux Dev.app`，45120）为共享单实例，
   Agent 不得据其出证据、不等待、不阻塞交付。本文全部证据来自私有 `DSH_HOME`（`/tmp`）。

## 8. 对既有 evidence 的更正指针

[2026-10-24-dsh-0-2-1-rc-3-four-api-surfaces.md](2026-10-24-dsh-0-2-1-rc-3-four-api-surfaces.md)
的两节已在后续 PR 中修复，**当前 main 上不再成立**，后续引用该文时按本节口径更正：

| 原节 | 原结论 | 当前实测 |
| --- | --- | --- |
| §4.4 peer 范围风险 | `omnimux-viewer` / `omnimux-browser` / `omnimux-intercept` / `omnimux` 共 **25 条** `@deepseek-ai/*` peer 不含任何 `0.2.x` | **44 条 peer 全部容纳 `0.2.1-rc.3` 且未收窄旧世代**（`verify-dsh-declaration-range` 通过）；`omnimux-viewer` 的 peer 已含 `>=0.2.1-rc.3 <0.3.0-0`，devDependency 为 `0.2.1-rc.3` |
| §4.3(2) `invariants` | `omnimux-browser` 的 `src/invariant.ts` companion 在 rc.3 无法装载，`package.json:73` 的 `@deepseek-ai/dsh-invariants` peer 是死声明 | 当前 `omnimux-browser/package.json` **已无** `@deepseek-ai/dsh-invariants`，该包 `verify:plugin-load` 与 rc.3 boot 均通过 |

§4.3(1) 的 `settingsScope` 判定（服务被移除、消费点静默降级）**仍然成立**，且已由 #3773 处理完毕；
本文 §3 确认生产源码已无该服务的任何消费点。

## 9. 复现命令与环境

环境：macOS（darwin），2026-10-25；产品宿主 `/Applications/OmniMux Dev.app` 2.0.10（`dsh.packageSpec 0.2.1-rc.3`）；
任务工作树 `.worktrees/cross-plugin-021-activation-issue-3775`（集成前 `901eec472`）。全部证据只读或落在 `/tmp` 私有目录，未写 Dev/Prod。

```sh
WT=<repo>/.worktrees/cross-plugin-021-activation-issue-3775

# 0. 静态面
rg -n "webRuntime|webStartup" plugins --glob '!**/node_modules/**' --glob '!**/lib/**'   # 0 命中
rg -n "settingsScope" plugins --glob '!**/node_modules/**' --glob '!**/lib/**'            # 仅 omnimux 注释 + 测试
rg -nU "inject\s*[:=]\s*\[[^\]]{0,200}\]" plugins -g '!**/node_modules/**' | rg settings  # 0 命中
rg -n "get\s*\??\.?\s*\(\s*['\"]settings['\"]\s*\)" plugins -g '!**/node_modules/**'       # 14 处按需取

# 1. 真实 cordis 挂载
cd $WT && node scripts/verify-plugin-load.mjs --json .workbuddy/evidence/issue-3775/plugin-load.json

# 2. 契约静态校验
node scripts/verify-dsh-declaration-range.mjs
OMNIMUX_VENDOR_MANIFEST=<shell-fork>/vendor/dsh-runtime/0.2.1-rc.3/manifest.json \
  node scripts/verify-dsh-declaration-range.mjs

# 3. 私有 probe profile（22 插件作 bundle）+ rc.3 组合
#    rc.3 运行时取自 npm 发布包：npm i @deepseek-ai/dsh@0.2.1-rc.3（装到 /tmp）
DSH_HOME=/tmp/dsh-3775-probe node /tmp/dsh-rc3/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile verify3775 --dump-config

# 4. 目标代际 apply 演练
node scripts/verify-profile-preflight.mjs /tmp/dsh-3775-probe/profiles/verify3775 \
  --app "/Applications/OmniMux Dev.app"

# 5. 运行期 fiber phase（见 §4.3 的 runProfile + ctx.pluginInventory.list() 片段）
```

证据原件（gitignored，随任务工作树）：`.workbuddy/evidence/issue-3775/`
（`EVIDENCE-SUMMARY.md`、`plugin-load.json`、`plugin-load.log`、`profile-dump-rc3.yml`、
`profile-dump-rc3.summary.md`、`profile-preflight-rc3.log`、`plugin-activation-fiber-phase.log`）。

## 10. 边界声明

- 本文的组合/boot 证据来自**私有 `DSH_HOME`**，不是 Dev 真机验收；Dev 真机验收仍是人工职责。
- §4.3 的 rc.3 运行时取自 **npm 发布包** `@deepseek-ai/dsh@0.2.1-rc.3`；产品宿主
  `OmniMux Dev.app` 自带的是同版本号的 vendor 构建（`upstream.master 9847a9bb63`），
  两者**同代际但非逐字节同一构建**。§4.2 的 preflight 直接以 `OmniMux Dev.app` 为
  `--app` 目标，其宿主包替身导出面取自该 App 自带副本。
- 本文不证明任何业务功能在 0.2.1 下可用，只证明**服务契约面无遗留**与**插件能被组合并激活**。
