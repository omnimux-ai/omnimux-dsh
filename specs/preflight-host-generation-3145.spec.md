# 预检宿主包代际对齐：按目标应用声明解析，对不上就响亮失败

任务：`preflight-host-generation-3145`（Issue #3145）

## 背景与已确认事实

- 物化预检脚本 `scripts/verify-profile-preflight.mjs` 用**最小替身（仅保签名）**模拟宿主包，替身内容硬编码在脚本里（第 75–76 行仍在制造 `installSettingsSection`、`settingsNamespace`）。
- 目标应用 `OmniMux Dev.app` 自带代际 `dsh.packageSpec = 0.1.5-rc.1`（`build-info.json`），其 asar 内确有 `installSettingsSection`。
- Dev profile 的宿主包农场 `~/.omnimux-dev/profiles/node_modules/` 指向**全局 `dsh` CLI**（当前 `0.1.5-rc.3`），而该补丁版本**已移除**该符号。
- 结果：农场在场 → 预检以 CLI 的副本解析 → 报「缺少 installSettingsSection」；农场缺席 → 替身制造旧符号 → **假绿**。
- 判据：预检汇总行**有无「最小替身」注记**（`hostStubHits === 0` 时省略）区分真解析与替身掩盖。

## 目标与可测验收标准

1. **按目标应用解析**：预检解析宿主包代际时，以被物化目标的**应用自身声明**（`build-info.json` 的 `dsh.packageSpec`／其 asar 或 profile 内的实际副本）为准，而不是跟着全局 `dsh` CLI 走。若无法确定目标应用代际，必须**明确报错**，不得静默退回替身。
2. **响亮失败**：当替身被用来模拟宿主包时，替身**不得制造**目标代际并不存在的导出；真实解析到的宿主包若与目标代际不一致，预检必须**失败并指名**（哪个包、期望哪一代、实际哪一代），而不是造一个假接口让预检通过。
3. **不得引入假绿**：在农场与目标应用代际不一致的现场条件下，预检必须**失败**；在两者一致时，预检**通过且不带替身注记**（真解析）。
4. 现有 `scripts/verify-profile-preflight.test.mjs` 与仓库门禁脚本测试全绿；改动只限于本仓开发流水线，不改产品插件源码、不改全局 CLI、不改 Dev 应用。

## 用户关键操作旅程

交付任意插件 → 一键物化 → 若宿主包代际与目标应用不一致，立即得到**指名道姓的失败**（而不是时灵时不灵或假通过）；一致时正常物化。

## 边界

- 只改 `scripts/` 下的预检及其测试；如需同时改物化流水线里的农场生成逻辑，须在报告中说明理由与影响面。
- 不修改 `plugins/**` 产品源码，不改 `pnpm-lock.yaml`/`package.json` 的依赖代际。
