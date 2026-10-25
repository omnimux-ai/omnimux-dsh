# Spec: 登录门设置读取兼容 0.1.5 与 0.2.x 两代 DSH 客户端服务

- Issue: #3666（R2，单插件 `omnimux`）
- 来源：#3658 清点报告 §4.3
- 依赖批次：#3652（壳层 pin 迁移）；本改动同时兼容旧新宿主，不依赖切换先后

## 目标

DSH `0.2.1-rc.3` 移除了客户端服务 `settingsScope`，改为 `configForms`。`omnimux` 客户端目前通过 `ctx.inject(['settingsScope'], …)` 读取 `omnimux` 设置命名空间，用于登录门判断本地模型/自定义 key 是否仍需要提示登录。在新宿主下该注入不会命中，读取静默降级。本任务把读取抽成一个小模块，同时支持两代服务，并保持旧宿主行为不变。

## 范围

- 新增 `plugins/omnimux/src/client/settings-value-reader.js`：注入 `configForms` 与 `settingsScope`，优先 `configForms`，返回一个实时 `read()`（每次调用重新取快照）；快照带 `status` 时只有 `ready` 才算可读（Host 停服后残留的旧值不算选择）。
- 新增 `plugins/omnimux/src/client/settings-value-reader.test.js`、`settings-value-reader-status.test.js`：覆盖仅旧服务、仅新服务、两者并存、无服务、服务形状残缺、缺 inject、loading/unavailable 不读旧值。
- 新增 `plugins/omnimux/tests/e2e/settings-value-reader.e2e.test.js`（跨模块：reader → 登录门放行/提示）与 `settings-value-reader-wiring.e2e.test.js`（入口接线断言）。
- 修改 `plugins/omnimux/src/client/index.js`：用该模块替换内联的 `settingsScope` 注入块，仍调用 `setRuntimeChoiceReader(read)`。
- 不改 `auth-gate.js` 的读取契约，不改设置 UI/schema，不改其他插件。

## 假设

1. 两代快照都带 `value` 字段：0.1.5 `SettingsScopeSnapshot.value`、0.2.x `ConfigFormSnapshot.value`（已在两版本 `lib/types` 核对）。
2. `configForms.get(<entryId>)` 的 `entryId` 与 Host 插件入口 id 一致；本仓插件 id 为 `omnimux`，先用它，读取失败时仍有旧宿主路径兜底。
3. `ctx.inject` 的回调在服务可用时各触发一次；两代服务不会同时存在于同一宿主，若同时存在则新服务优先。

## 证伪方式

1. 若单测显示旧宿主路径行为变化（读不到值或抛错），说明抽取破坏了原语义，回退并保留内联实现。
2. 若 `configForms.get('omnimux')` 在真实 0.2.1 宿主下返回 `unavailable` 或抛错，说明 entryId 映射不对，需改为 `describe()` 的命名空间读取；本轮无 0.2.1 宿主，此项记入残留。
3. 若 client 构建（`pnpm --filter omnimux build`）因新模块导入失败，按构建报错修正导入路径/语法。
4. 若 `pnpm --filter omnimux test` 出现既有测试失败且与本改动相关，逐条排查；不相关则记录跳过原因。

## 验收

1. 新模块单测通过，覆盖 §2 五种情况；旧宿主语义与现状一致（每次读取实时快照）。
2. `rg "settingsScope" plugins/omnimux/src` 只剩新模块与测试（无其他运行时消费）。
3. `pnpm --filter omnimux test`、`pnpm --filter omnimux build` 通过。
4. 0.2.1 真实宿主路径标注为“未运行时验证”，不写成已通过。

## 风险

R2。读取失败时登录门维持旧行为（仍提示登录），不会拦截生成或产生错误态；不影响支付、凭据或发布。

## 旧标准变更

- `plugins/omnimux/src/client/settings-value-reader.test.js` :: `settingsScope: reads the live namespace value`
- `plugins/omnimux/src/client/settings-value-reader-status.test.js` :: `settingsScope: snapshots without a status field keep reading their value`

**原断言**：两个用例都按已退役的 `settingsScope` 服务命名，`fakeCtx` 用 `settingsScope` inject 驱动；`settingsScope` 服务在 DSH 0.2.1 已不存在，原实现也已改为 `configForms`，用例名与实际不再匹配。

**必须改的理由**：`settingsScope` 被上游移除，`configForms` 是兼容两代服务的新接口；用例名与覆盖路径要跟着接口走。按门禁要求，改动只涉及**用例命名与桩的类型**，读取行为不变。

**实际改法**：用例名改成 `configForms:` 前缀，`fakeCtx` 改用 `configForms` 驱动（`forms.get(entryId)` 返回带 `getSnapshot` 的 controller）；`read()` 的行为与断言期望值全部不变。`configForms` 单测原本就在同一文件里（`configForms: reads through get(entryId) and prefers the newer service`），本变更只补齐**另一处 settingsScope 前缀的用例**的命名一致性。

**新期望证据**：`node --test src/client/settings-value-reader*.test.js` 在本机全过（8 用例）。
