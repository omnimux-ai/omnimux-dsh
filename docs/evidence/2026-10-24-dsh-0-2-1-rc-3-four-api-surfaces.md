---
title: "DSH 0.2.1-rc.3 四个 API 面清点（client slot / host service / cordis / schemastery）"
id: "evidence-dsh-021-rc3-four-api-surfaces"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-10-24"
authors: ["x", "agent"]
subsystem: "global"
tags: ["dsh", "compat", "rc-upgrade", "api-surface"]
---

# DSH 0.2.1-rc.3 四个 API 面清点（client slot / host service / cordis / schemastery）

## 1. 身份与范围

- 任务：[#3658](https://github.com/omnimux-ai/omnimux-dsh/issues/3658)（`chore` / `common` / track B / R1 只读调研）。同批次代码改动在 [#3652](https://github.com/omnimux-ai/omnimux-dsh/issues/3652)，不在本文范围。
- 目的：桌面端从官方 `dsh-plugin-desktop` 迁到 `dsh-desktop-next`、运行时 pin 从 `0.1.5-rc.3` 升到 `0.2.1-rc.3` 前，给出四个 API 面的逐项判定，作为壳层迁移的风险输入。
- 基线：DSH `0.1.5-rc.3`（桌面壳工作区 `upstream.json`，commit `a4c74a91e06b00fe0b0937bde982170c526cc842`），本文解包 265 个运行时包。
- 目标：DSH `0.2.1-rc.3`（桌面壳 `origin/master` 的 `upstream.json`，commit `1f81c047fc48fa190a683e469daa699857e9afe8`），对应 vendor 树 `9847a9bb633dbf17e6d6050b0706b2ab2cbda9bb`，解包 344 个运行时包 + 1 个 `manifest.json`。
- 本仓基线：任务工作树 `common-dsh-four-api-surfaces-issue-3658`，base `origin/main` `328ae68ee`，开始时工作树干净。
- 方式：**只读静态比对**。材料从桌面壳仓库的 git 对象（`git show`，不 checkout）与 Yarn 缓存 zip 读取，解包到 `/tmp/dsh-audit/`；未修改插件源码、未改桌面壳仓库、未联网、未运行 Host/App，未做运行时验证。

### 1.1 版本口径更正

Issue 正文写的是目标 `0.2.1-rc.2`。同批次 owner 在 #3652 的 2026-10-23 评论已把目标更正为 `0.2.1-rc.3`（壳仓库 `upstream.json` 同步改成 rc.3）。本文按 **`0.2.1-rc.3`** 取证，并做了 rc.2 → rc.3 的增量核对（见 §7）：四个目标面在 rc.2 与 rc.3 之间无差异，因此以 rc.3 为口径不会漏掉 rc.2 的结论。

## 2. 结论摘要

| API 面 | 判定 | 一句话结论 | 受影响插件 | 建议承担层 |
| --- | --- | --- | --- | --- |
| client slot 注册 | **有变，且有低风险影响** | slots 包只做增量扩展（`SlotFactoryMap` 等），`register`/`inject` 签名不变；但 `settings.plugin.item` 在 rc.3 被退役，2 个插件的配置卡会静默失效 | `omnimux-market`、`omnimux-social-harvest` | 插件层 |
| host service 注入 | **有变，且有影响** | 我们消费的 15 个 Host 服务全部同名同包存在；但客户端服务 `settingsScope` 被移除（1 处降级）、`invariants` 服务与包被整体删除（1 个 companion 无法装载）；另有 25 条 peer 范围不含 0.2.x | `omnimux`、`omnimux-browser`、`omnimux-viewer`、`omnimux-intercept` | 插件层（peer 可由壳层统一兜底，但声明归属插件） |
| cordis `4.0.2 → 4.0.5` | **有变，但不影响我们** | 只有 3 处实质改动，全部落在我方未调用的 API 上；零插件需改代码 | 无 | — |
| schemastery `3.18.4 → 3.18.5` | **无变（API/语义）/ 声明面有影响** | 两个版本 `lib/` 文件逐字节相同；但 Host 要求 `~3.18.5`，`omnimux` 精确 pin 的 `3.18.4` 不满足 | `omnimux` | 插件层 |

**改动规模估计**（若后续开工，按此排期；本轮不改）：

| 面 | 需改内容 | 插件 | 预估文件数 |
| --- | --- | --- | --- |
| client slot | `settings.plugin.item` → `plugins.item` / `plugins.detail.section` 或壳层兼容 seat | 2 | 2–3 |
| host service（运行时） | `settingsScope` → `configForms`；`invariants` companion 降级/删除 | 2 | 2–3 |
| host service（声明） | peer 范围从 `0.1.x` 放宽到同时容纳 `0.2.1` | 4 | 4 个 `package.json` |
| schemastery（声明） | `3.18.4` → `~3.18.5` 或改 peer | 1 | 1 个 `package.json` |
| cordis | 无 | 0 | 0 |

## 3. client slot 面

### 3.1 DSH slots 包的 API diff（全部为增量）

比对 `deepseek-ai-dsh-client-ui-slots-0.1.5-rc.3` 与 `-0.2.1-rc.3` 的 `package/lib/types/index.d.ts`：`register` 的两个重载逐字相同（基线 `:589`、`:602`；目标 `:793`、`:806`），无删除、无签名变更。新增：

| 新符号 | 基线 | 目标 | 证据（目标 `lib/types/index.d.ts`） |
| --- | --- | --- | --- |
| `SlotFactoryMap` | 无 | 新增可复用组件工厂契约表 | `:20` |
| `SlotScopeTargetMap` | 无 | 新增非 root scope 的显式目标类型表 | `:87` |
| `SlotEntryDef.inline?: true` | 无 | 新增行内内容布局开关 | `:100`（另见 `:146`） |
| `FactoryLocalSlotDef` / `SlotFactoryDef` | 无 | 新增工厂局部 slot 与工厂静态定义 | `:122`、`:127` |

注册服务侧（`dsh-client-ui-renderer` 的 `ctx.slots`）同样是增量：新增 `registerFactory`（`client/registry.d.ts:95`）；`LiveSlotNode` 保留（`index.d.ts:669`），新增联合类型 `LiveCompositionNode = LiveSlotNode | LiveFactoryNode`（`index.d.ts:699`），`snapshot()` 返回类型改为该联合（`index.d.ts:860`、`registry.d.ts:180`）。我方未使用这两个新 API，也未导入 `LiveSlotNode`/`LiveCompositionNode`；`ctx.slots.inject` / `ctx.slots.register` 的调用面不受影响。

### 3.2 我方 slot 消费点与逐条判定

我方有两类声明：`dsh.manifest.json` 的 `capabilities.slots`（15 个插件、27 条）与运行期 `ctx.slots.inject/register`（24 处生产注册点，含 3 处动态常量；另有 2 处测试断言）。清单见 `/tmp/dsh-audit/inventory/slots-manifests.tsv` 与 `slots-runtime.txt`（临时材料，不随仓库提交）。

DSH 标准 slot 的条目定义在 0.1.5 与 rc.3 之间**未变**（kind/scope/owner 三项逐条相同）：

| slot id | 基线声明 | rc.3 声明 | 判定 |
| --- | --- | --- | --- |
| `settings.section` | `client-ui-settings/contract/slots.d.ts:67`（list/root） | `client-ui-settings/contract/slots.d.ts:73`（list/root） | 无变 |
| `settings.plugins.tab` | 同上 `:80`（list/root） | `:86`（list/root） | 无变 |
| `settings.general.item` | 同上 `:114`（list/root） | `:120`（list/root） | 无变 |
| `conversation.input.dock` | `client-ui-conversation/contract/slots.d.ts:187`（list/session） | `:301`（list/session） | 无变 |
| `conversation.input.left` | 同上 `:203`（list/session） | `:317`（list/session） | 无变 |
| `conversation.input.attachments` | 同上 `:219`（single/session-maybe） | `:339`（single/session-maybe） | 无变 |
| `conversation.composer.dock` | 同上 `:198`（list/session） | `:312`（list/session） | 无变 |
| `conversation.hero.brand.mark` | 同上 `:175`（single/root） | `:284`（single/root） | 无变 |
| `sidebar.footer.action` | `client-ui-sidebar/contract/slots.d.ts:69`（list/root） | `:83`（list/root） | 无变 |
| `tool.call.toolview` | `client-ui-tool/contract/slots.d.ts:22`（keyed/session） | `:19`（keyed/session） | 无变 |
| `shell.overlay` | `client-ui-layout/client/index.d.ts:80`（list/root） | `:95`（list/root） | 无变 |
| `plugins.item` | 无声明 | `client-ui-plugin-manager/client/slot-contract.d.ts:143`（新增包） | 有变但不影响：我方 hub 已提前注册（`plugins/omnimux/src/client/index.js:121`），该注册在 rc.3 下才会命中（生效未做运行验证） |
| `plugins.detail.section` | 无声明 | 同上 `:195` | 同上（`index.js:108`） |
| `settings.plugin.item` | `client-ui-settings-plugins/client/slot-contract.d.ts:19-23`（keyed/root） | **全仓无声明**（仅 `client-ui-settings-models` 注释提及） | **有变且影响**（见 3.3） |

归属说明：`sidebar.extra` 与 `brand.chrome` 只出现在我仓 `dsh.manifest.json` 与 `schemas/dsh-plugin.schema.json:159-160`，在 0.1.5 与 rc.3 的 DSH 包集合中均为 0 命中；它们是产品壳的 seat 词汇，不属于 DSH 四面判定。`betterSidebar.registerTab` / `betterSidebar.fileViewer` 同理（better-sidebar 服务，见壳仓库 `patches/dsh-better-sidebar/`）。这些 seat 的真实消费实现在桌面壳内，本轮未取证（见 §9）。

### 3.3 退役项：`settings.plugin.item`

- 基线：`client-ui-settings-plugins` 声明 `settings.plugin.item`（keyed/root，`client/slot-contract.d.ts:19-23`），插件配置卡按 Host settings 命名空间分发。
- 目标：该声明在 `0.2.1-rc.3` 全部 344 个包中**不存在**；插件配置能力迁到新包 `client-ui-plugin-manager`（`plugins.item`、`plugins.detail.section` 等，`client/slot-contract.d.ts:143`、`:195`）。
- 我方命中 2 处生产注册 + 2 处测试/断言引用：
  - `plugins/omnimux-market/src/client/apply.js:100`（`slots.inject("settings.plugin.item", …)`）；
  - `plugins/omnimux-social-harvest/src/client/index.js:68`（`ctx.slots.inject('settings.plugin.item', …)`）；
  - 断言/文档：`plugins/omnimux-market/src/tests/client-bundle.test.ts:42`、`plugins/omnimux/README.md:24`。
- 后果：`ctx.slots.inject` 在 slot 从未声明时不会回调，注册不会抛错，但两个插件的配置卡在 rc.3 下**静默不显示**（不是崩溃，是功能丢失）。

### 3.4 受影响插件清单（client slot 面）

| 插件 | 符号/slot | 需要改什么 | 预估文件数 | 建议承担层 |
| --- | --- | --- | --- | --- |
| `omnimux-market` | `settings.plugin.item`（`apply.js:100`） | 改注册到 `plugins.item` 或由壳层提供兼容 seat | 1–2 | 插件层 |
| `omnimux-social-harvest` | `settings.plugin.item`（`index.js:68`） | 同上 | 1 | 插件层 |

## 4. host service 注入面

### 4.1 服务名集合 diff

从两版本全部 `lib/types/**/*.d.ts` 的 `declare module '@deepseek-ai/cordis' { interface Context { … } }` 增广提取服务名（临时脚本 `/tmp/dsh-audit/services.mjs`，不提交）：**0.1.5-rc.3 共 102 个服务名，0.2.1-rc.3 共 135 个**。

- 删除（4 个）：`codeRuntime`、`e2b`、`invariants`、`settingsScope`。
- 新增（37 个）：`browserUse`、`claudeCodeMods`、`computerUse`、`configEditor`、`configForms`、`cotTranslation`、`deepseekAccount`、`feedbackUi`、`hmr`、`inspector`、`jobController`、`mcpResources`、`officeToPdf`、`otel`、`pluginManager`、`pluginMarket`、`pluginNavigation`、`pluginPackages`、`pluginRegistryProbe`、`productAnalytics`、`productTelemetry`、`profileContext`、`ptcRuntime`、`remoteAccess`、`schedule`、`shortcuts`、`speechController`、`speechToText`、`ssh`、`terminalController`、`translator`、`userQuestionPanels`、`webApp`、`webTerminals`、`workingDirectory`、`workspaceChanges`、`worktrees`。

### 4.2 我方消费点分类

本仓 `ctx.get('…')` 共 37 个不同键（含测试桩；排除文档示例里的占位符 `<seam>`）。按归属分类：

- **Host/上游服务（15 个，全部在 rc.3 存在且由同一包提供）**：`agents`、`approval`、`attachments`、`commands`、`connection`、`inputTriggers`、`llm`、`sessionPersistence`、`sessionTitle`、`sessions`、`settings`、`systemPrompt`、`tools`、`typertGateway`、`webServer`。逐项对照两版本服务名表，provider 包名未变（例：`tools`→`dsh-tools`、`settings`→`dsh-settings`、`typertGateway`→`dsh-api-gateway`），判定**无变**。
- **本仓自供 seam（不属本面，13 个）**：`assetLibrary`、`decisions`、`identity`、`mediaInspect`、`modelCatalog`、`nativeFilePicker`、`omnimux-workflow`、`socialData`、`inspirationShare`、`youtube`、`videoGenerate`、`videoProcess`、`textComplete`（均在 `plugins/*/src` 有 `ctx.provide` 证据）。
- **未在本仓 provide、也未在两版本 vendor 集合中出现的外部/可选服务（8 个）**：`composerAttachments`、`fetcher`、`resolver`、`workbenchMailbox`、`hubEvents`、`omnimux`、`omnimux-model-catalog`、`videoPreview`。消费点均有 `undefined` 兜底（例：`plugins/omnimux-inspiration/src/index.js:290-292`、`plugins/omnimux-workflow/src/workflow/index.ts:224`）；其中 `videoPreview` 只出现在 `plugins/omnimux-video-preview/dsh.manifest.json:37` 的 `interfaceDoc` 文案里，不是运行期消费。来源可能是壳层或其他插件，本轮无法判定其 rc.3 可用性（见 §9）。
- **cordis loader 服务**：`ctx.get('loader')`（`plugins/omnimux-automation/src/index.js`）来自 `@deepseek-ai/cordis-plugin-loader`，不在运行时 vendor 集合内，未能比对（见 §9）。

### 4.3 两个删除项的实际影响

**（1）`settingsScope` 被移除 —— 有变且影响（1 处）**

- 基线：`client-ui-settings` 提供客户端服务 `settingsScope: SettingsScopeBinder`（`client/settings-scope.d.ts:90`），按命名空间 `bind({ namespace })` 得到 `getSnapshot()` 读取值。
- 目标：`settingsScope` 在 rc.3 全部包中 0 命中；同一包改为提供 `configForms: ConfigForms`（`client/config-form.d.ts:93-95`），按 Host 插件入口 `get(entryId)` 得到带 `getSnapshot/subscribe/set` 的表单控制器（`:137`、`:51`、`:65`）。
- 我方：`plugins/omnimux/src/client/index.js:129-140` 用 `ctx.inject(['settingsScope'], …)` 读取 `omnimux` 命名空间，用于登录门的本地模型/自定义 key 兼容判断。rc.3 下该注入不会命中，读取逻辑静默降级（回退到旧行为：仍会提示登录）。
- 迁移映射：`settingsScope.bind({ namespace })` → `configForms.get(<entryId>)`（或 `configForms.describe()` 做跨命名空间读取）。属插件层改动，1 个文件。

**（2）`invariants` 服务与包被整体删除 —— 有变且影响（低风险，1 处）**

- 目标版本中 `invariants` 服务名消失，`@deepseek-ai/dsh-invariants` 包在 344 个运行时包中 0 命中（`ls /tmp/dsh-audit/021 | grep -c invariant` = 0）。
- 我方：`plugins/omnimux-browser/src/invariant.ts:8,15,32` 的 companion 插件 `export const inject = ['invariants']` 并 `ctx.invariants.register(...)`；该 companion 在 rc.3 下无法装载（服务不存在）。其 `install` 本身是空实现（`:24`），**无功能损失**，但：
  - `plugins/omnimux-browser/package.json:73` 的 peer `@deepseek-ai/dsh-invariants: ^0.1.5-rc.3` 指向已删除的包（死声明）；
  - `./invariant` 导出（`package.json:20-22`）继续指向不可运行的 companion。
- 建议：插件层删除该 companion 导出与 peer，或按 rc.3 的替代机制重写（本轮不改）。

### 4.4 peer 范围风险（声明面）

按目标版本 `0.2.1-rc.3`（cordis `4.0.5`、schemastery `3.18.5`）逐条校验插件 `package.json` 的 `@deepseek-ai/*` peer/dependency 范围，**4 个插件共 25 条不兼容**：

| 插件 | 不兼容声明（示例） | 文件:行 | 说明 |
| --- | --- | --- | --- |
| `omnimux-viewer` | `dsh-tools`、`dsh-agent`、`dsh-attachment`、`dsh-fs`、`dsh-home-paths`、`dsh-host-webserver`、`dsh-llm`、`dsh-sandbox`、`dsh-settings`、`dsh-system-prompt` 全部为 `>=0.1.0-rc.1 <0.1.1-0 \|\| >=0.1.1-rc.0 <0.1.2-0` | `plugins/omnimux-viewer/package.json:84-93` | 范围上限 `<0.1.2-0`，不含任何 `0.2.x` |
| `omnimux-browser` | 13 条 `^0.1.5-rc.3`（含已删除的 `dsh-invariants`） | `plugins/omnimux-browser/package.json:62-77` | 同上；`dsh-invariants` 已是死包 |
| `omnimux-intercept` | `dsh-base: ^0.1.5-rc.3` | `plugins/omnimux-intercept/package.json:29` | 同上 |
| `omnimux` | `schemastery: 3.18.4`（精确 pin） | `plugins/omnimux/package.json:33` | 不满足 Host 的 `~3.18.5`（见 §6） |

其余插件对 cordis 的声明（`omnimux-automation: >=4.0.1`、`omnimux-browser: ^4.0.2`）都能容纳 4.0.5，无需改。`omnimux-device` 另有一条未加 scope 的 `"cordis": "^3.18.1"` 陈旧 peer（该插件并不导入 cordis），建议另开 issue 清理。

### 4.5 受影响插件清单（host service 面）

| 插件 | 符号/服务 | 需要改什么 | 预估文件数 | 建议承担层 |
| --- | --- | --- | --- | --- |
| `omnimux` | `settingsScope`（`src/client/index.js:129`） | 改接 `configForms.get(...)` | 1 | 插件层 |
| `omnimux-browser` | `invariants`（`src/invariant.ts:15,32`）+ peer | 删除/降级 companion 与死 peer | 2 | 插件层 |
| `omnimux-viewer`、`omnimux-browser`、`omnimux-intercept`、`omnimux` | 25 条 peer 范围 | 放宽到容纳 `0.2.1-rc.3` | 4 个 `package.json` | 插件层（壳层可统一兜底，但声明归属插件） |

## 5. cordis `4.0.2 → 4.0.5`

两版本文件集合完全相同，`lib/index.js` 全量 diff 仅 3 个 hunk，`lib/types/*.d.ts` 仅 3 个文件变动。**总判定：有变，但不影响我们（零插件需改代码）**。

| 改动 | 证据 | 我方使用 |
| --- | --- | --- |
| `Fiber.update()` 返回值由 `void \| Promise<void>` 收窄为 `void` | `lib/types/fiber.d.ts:199`（两版同位置）、`lib/index.js:1437` | `Fiber.update(` 命中 0 |
| `LoggerService.exporter()` 销毁闭包 bug 修复（`++this._snExporter` 改为局部 id） | `lib/index.js:613-618` | `exporter(` 命中 0；只用 `ctx.logger.warn`，`logger.d.ts` 未变 |
| 新增类型再导出 `Volatile` / `VolatileSnapshot` | `lib/types/index.d.ts:16` | 未导入 |

包元数据：`exports`/`main`/`types`/`files` 未变；两版都无 `engines`；依赖 `cosmokit ^1.8.3 → ~1.8.6`，peer `cordis-plugin-include ^1.0.7 → ~1.0.10`、`loader ^1.0.3 → ~1.0.6`（均为 optional）。

我方实际消费面（口径：工作树 `plugins/` 下的生产源码，排除 `node_modules`/`lib`/`dist`/`docs`/测试；`rg -o` 计数）：`ctx.effect` 147、`ctx.inject` 108、`ctx.get` 74、`ctx.on` 29、`ctx.logger` 27、`ctx.provide` 25、`ctx.plugin` 7、`ctx.emit` 6；`ctx.set`/`ctx.accessor`/`ctx.waterfall`/`extends Service`/`Fiber.update`/`Volatile` 均为 0。这些签名在两版之间逐字一致（`fiber.d.ts:157,159`、`reflect.d.ts:14-16,41-43`、`registry.d.ts:111,185,198`、`events.d.ts:88,142`）。另：4.x 没有 `on('ready')` 这类生命周期事件（`Events` 仅 9 个 `internal/*`），不存在误用。

## 6. schemastery `3.18.4 → 3.18.5`

- **API/语义面：无变**。两版本 `lib/` 目录逐文件比对无差异（`diff -rq` 无输出），`package.json` 只差 `version` 与依赖 `cosmokit ~1.8.5 → ~1.8.6`。我方 5 个源码文件（另 1 个 `lib/host.js` 是构建产物，不重复计数）、53 处 `z.*` / `Schema.*` 调用无需改动。
- **声明面：有变且影响（1 处）**。基线 `@deepseek-ai/dsh` 声明 `schemastery 3.18.2`；目标 `0.2.1-rc.3` 声明 `~3.18.5`（`/tmp/dsh-audit/021/deepseek-ai-dsh-0.2.1-rc.3/package/package.json`）。`plugins/omnimux/package.json` 精确 pin `3.18.4`，不满足 `~3.18.5`，在 pnpm 布局下可能为 `omnimux` 装出第二份 schemastery 实例，违反 RC 的「Host singleton 不得出现第二份实例」要求（同类问题见 #3552）。
- 其余声明可容纳 3.18.5：`omnimux-viewer` 的 `^3.0.0`、`omnimux-automation` 的 `^3.18.1`、`omnimux-browser` 的 `^3.18.2`。
- 建议：插件层把 `omnimux` 的精确 pin 改为 `~3.18.5`（或改成 peer），随 #3652 批次一起做双版本兼容验证。

## 7. 版本口径（rc.2 → rc.3 增量核对）

- rc.2 材料仍可从桌面壳 commit `e19f7cfa89`（2026-10-17，`feat(desktop): adapt … to dsh v0.2.1-rc.2`）读取；本轮只对四个目标面包做了增量核对。
- `dsh-client-ui-slots` 的 `lib/types/index.d.ts` 在 rc.2 与 rc.3 之间 **diff 为空**；包数 rc.2 为 343 个 tgz + `manifest.json`，rc.3 为 344 个 tgz + `manifest.json`。rc.3 只新增 1 个包 `dsh-client-ui-entry-customization`（其类型面未声明 `SlotMap` 条目，不涉及本仓消费的 slot）。
- cordis / schemastery 是 npm 依赖，rc.3 的 `@deepseek-ai/dsh` 声明 `~4.0.5` / `~3.18.5`，壳 `origin/master:yarn.lock` 解析一致（第 1020、6383 行）。
- 结论：以 rc.3 为口径不会漏掉 rc.2 的四个面结论；issue 标题里的 rc.2 已由 #3652 的更正评论覆盖。

## 8. 无法判定项

1. **`ctx.get('loader')`（cordis loader 服务）**：来自 `@deepseek-ai/cordis-plugin-loader`，不在运行时 vendor 包集合，未比对。需要 0.2.1 Host 安装树或该包源码。
2. **`composerAttachments` / `fetcher` / `resolver` / `workbenchMailbox` / `hubEvents` / `omnimux` / `omnimux-model-catalog` / `videoPreview`**：本仓无 `provide`，两版本 vendor 服务名集合 0 命中；来源可能是壳层或其他外部插件（`videoPreview` 仅 manifest `interfaceDoc` 文案）。消费点有 `undefined` 兜底，本轮无法判定 rc.3 下是否仍提供。
3. **peer 声明的实际后果**（是否真的产生第二实例或安装失败）：取决于桌面壳 0.2.1 的安装布局与 pnpm 提升策略，未做运行时验证（本轮非目标）。
4. **壳层 seat**（`sidebar.extra`、`brand.chrome`、`betterSidebar.*`）：消费实现在桌面壳内，不在本仓与 vendor 集合中，未取证。
5. **rc.2 全量 343 包的逐包比对**：本轮只核对四个目标面，未全量比对。

## 9. 复现命令与环境

环境：macOS（darwin），2026-10-24；桌面壳工作区 `/Users/x/Desktop/Project/omnimux-desktop-fork`（当前分支 `omnimux`，目标对象取 `origin/master`）；本仓任务工作树 base `328ae68ee`。全部命令只读，未写仓库、未联网。

```sh
SHELL=/Users/x/Desktop/Project/omnimux-desktop-fork
BASE=/tmp/dsh-audit
# 基线：本地 vendor tgz，一包一目录
for f in "$SHELL"/vendor/dsh-runtime/0.1.5-rc.3/*.tgz; do
  n=$(basename "$f" .tgz); mkdir -p "$BASE/015/$n"; tar -xzf "$f" -C "$BASE/015/$n"
done
# 目标：从 git 对象读，不 checkout
cd "$SHELL"; sha=$(git rev-parse origin/master)
while IFS= read -r base; do
  pkg=${base%.tgz}; mkdir -p "$BASE/021/$pkg"
  git show "$sha:vendor/dsh-runtime/0.2.1-rc.3/$base" | tar -xz -C "$BASE/021/$pkg"
done < <(git cat-file -p "$sha:vendor/dsh-runtime/0.2.1-rc.3" | awk -F'\t' '{print $2}')
# cordis / schemastery：Yarn 缓存 zip
unzip -q ~/.yarn/berry/cache/@deepseek-ai-cordis-npm-4.0.2-*.zip -d "$BASE/cordis/4.0.2"
unzip -q ~/.yarn/berry/cache/@deepseek-ai-cordis-npm-4.0.5-*.zip -d "$BASE/cordis/4.0.5"
unzip -q ~/.yarn/berry/cache/@deepseek-ai-schemastery-npm-3.18.4-*.zip -d "$BASE/schemastery/3.18.4"
unzip -q ~/.yarn/berry/cache/@deepseek-ai-schemastery-npm-3.18.5-*.zip -d "$BASE/schemastery/3.18.5"

# 服务名集合 diff（脚本按 declare module '@deepseek-ai/cordis' → interface Context 提取）
node /tmp/dsh-audit/services.mjs /tmp/dsh-audit/015 > /tmp/dsh-audit/inventory/services-015.tsv
node /tmp/dsh-audit/services.mjs /tmp/dsh-audit/021 > /tmp/dsh-audit/inventory/services-021.tsv
comm -3 <(cut -f1 .../services-015.tsv | sort) <(cut -f1 .../services-021.tsv | sort)

# slots API diff
diff -u 015/deepseek-ai-dsh-client-ui-slots-0.1.5-rc.3/package/lib/types/index.d.ts \
        021/deepseek-ai-dsh-client-ui-slots-0.2.1-rc.3/package/lib/types/index.d.ts

# schemastery 逐文件比对（无输出 = 完全一致）
diff -rq 3.18.4/node_modules/@deepseek-ai/schemastery/lib \
         3.18.5/node_modules/@deepseek-ai/schemastery/lib

# 本仓消费面
rg -n "ctx\.slots\.inject\(" plugins --glob '!**/node_modules/**' --glob '!**/lib/**'
rg -n "ctx\.get\(" plugins --glob '!**/node_modules/**' --glob '!**/lib/**' | sort -u
```

## 10. 边界声明

本文是**静态只读**结论：不证明 0.2.1-rc.3 下 Host/App 实际可用，也不替代壳层迁移后的运行时验收。本轮没有修改任何插件源码、桌面壳代码或官方 DSH 源码；发现的改动只给规模估计与承担层建议，未开工。临时材料位于 `/tmp/dsh-audit/`，不随仓库提交。
