# 首次运行恢复模型渠道引导（只选文字通道）（Issue #3926）

## 背景

「运行方式」三选一引导（官方登录 / 本机助手 / 自己的密钥）在 release 线被移除后，新装用户首次进入没有任何渠道指引。本工作只恢复首跑的**文字对话通道**选择；其余消费用途仍按设置页逐场景配置，不恢复独占运行模式。

## 目标

- 首跑（无任何已保存渠道标记）时，shell.overlay 上挂载全屏引导，顺序 29，位于登录门禁（30）之下。
- 三条路径各自完成后写入一次 `runtimeMode` 标记：官方（沿用登录）、本机助手（选择已探测 CLI）、自己的密钥（保存 BYOK 配置并把 `text` 场景绑定到该 provider）。
- 引导挂载不依赖设置页打开（不进 `whileServed`）；快照就绪后自行判定显隐。
- 已配置任何渠道（`runtimeMode`/`runtimeAgentId`/`runtimeKeyEndpoint`/`byokProviders` 任一非空）不再显示，升级用户不受打扰；`暂时跳过`按官方处理，写入 `runtimeMode: 'official'`。

## 非目标

- 不恢复独占运行模式；官方 / CLI / API key 继续共存为逐场景绑定。
- 不改变 AgentPanel / ProviderConfigPanel 的既有交互语义（`onVerified` = 保存确认后触发，与 42ca13d31 原实现一致）。

## 验收用例

- S1：空 settings → 引导可见，四个选项文案齐全；overlay 注册 id `omnimux-runtime-guide`、order 29。
- S2：点击「本机助手」→ CLI 面板渲染（空列表显示「你的 CLI (0)」）。
- S3：点击「自己的密钥」→ BYOK 表单渲染；填文字模型并保存 → PUT `/omnimux/byok/config` 携带 `scenarioBindings.text = {channel:'byok', provider}` → `onVerified` → PUT `/omnimux/runtime/mode {mode:'key'}` → 引导关闭。
- S4：点击「暂时跳过」→ PUT `{mode:'official'}` → 引导关闭。
- S5：已配置（`runtimeMode` 非空）→ 引导不出现。
- 证据：`scripts/runtime-guide-web-qa.mjs` 全绿（含 save→bind→close 端到端断言）。

## 旧标准变更

- `plugins/omnimux/src/client/runtime-guide-view.test.js` :: `does not force a fresh install into an exclusive runtime choice`
- `plugins/omnimux/src/client/runtime-guide-view.test.js` :: `keeps unconfigured legacy scenarios local instead of blocking all creation`
- `plugins/omnimux/src/client/settings-placement.test.js` :: `keeps only product chrome on the first-level Settings nav`

说明：

1. `does not force a fresh install...` 原断言空/undefined/null settings 下 `visible === false`——那时引导已移除，`visible` 恒为 false 是退役后的残影，而非产品要求。本次恢复引导后空 settings 必须 `visible === true`，故重写为 `shows the first-run chooser while no channel has been configured` 并新增 `hides once any channel carries a saved choice` / `does not mistake schema defaults or empty containers for a choice` 两条覆盖原语义两侧。
2. `keeps unconfigured legacy scenarios...` 原断言包含 `runtimeMode:'key'` 时 `visible === false`，该语义已由新的 `hides once any channel carries a saved choice`（key/official/agent/nonsense 全覆盖）承接；保留用例名但只断言 `pendingScenarios` 不变。
3. `keeps only product chrome on the first-level Settings nav` 原断言 `doesNotMatch(hub, /ModelsSettingsCard|RuntimeGuideGate|omnimux-model-settings/)` 把 `RuntimeGuideGate` 一并禁用；引导现在合法地由 `index.js` 挂载到 `shell.overlay`（非 Settings nav），故从拒绝正则移除该标识，`ModelsSettingsCard`/`omnimux-model-settings` 仍在拒绝列。引导的正确挂载位置由同文件新增 `mounts the first-run runtime guide on the session overlay` 用例正向锁定（id/order/非 whileServed 三断言）。
