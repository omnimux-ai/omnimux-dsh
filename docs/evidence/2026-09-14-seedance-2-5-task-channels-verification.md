# Seedance 2.5 按次计费与通道组对齐验证报告

- 日期：2026-09-14
- 任务：Issue #1801 Seedance 2.5 按次计费模型与通道组接入
- 状态：已验证通过 (Verified Pass)

## 一、验证范围与背景
执行中枢接入的 Seedance 2.5 基础模型（`seedance-2-5`）此前仅配置了 `standard`（按秒计费）与 `cheap`（指向通用组），未对齐网关实际开放的按次计费模型与通道组。本次更新：
1. 补齐 `seedance-2-5` 的 `pro` 进阶按次满血专线，对齐网关 `seedance-2-5-task-pro` 分组（`billingMode: "per_task"`）。
2. 将 `cheap` 特惠版线路的分组 `wireGroup` 从通用 `cheap` 修正为网关实际生效的 `seedance-cheap` 专属分组（`billingMode: "per_task"`），对应网关 9 图 30 秒长视频专线。
3. 确保中枢服务 `channel-groups.js` 与工作流画布 `channelGroups.ts` 逐字镜像一致。

## 二、验证证据与测试输出

### 1. 模型契约门禁严格校验
命令：`pnpm verify:model-contracts`
输出结果：
```
model-contracts mode=strict ok=true
auto-serving offline ok=true registered=17 required=13
cross-plugin offline ok=true whitelistChecked=14
schemaVersion=1.1
fingerprint=66cf9f0f34e25187
admission errors=0 warnings=0
coverage runtime=64 contract=39 missing=25 extra=0
dispositions total=76 unresolved=0 forbiddenListed=12
listedOperations=56
listedIds=23 (any-op model summary only; prefer listedOperations)
```
结论：契约门禁 100% 通过，无任何告警或错误。

### 2. 渠道路由与通道组解析测试
命令：`node --test plugins/omnimux/src/catalog/serving/channel-groups.test.js`
输出结果：
```
▶ OmniMux Model Channel Groups & Routing Strategies
  ✔ defines valid routing strategies (0.620958ms)
  ▶ parseModelAndGroup
    ✔ parses models without group (0.138292ms)
    ✔ parses model@group format (0.0735ms)
    ✔ handles empty or malformed inputs (0.065ms)
  ✔ parseModelAndGroup (0.376708ms)
  ▶ getModelChannelGroups
    ✔ returns defined channel groups for seedance-2-0 (0.16625ms)
    ✔ returns defined channel groups for seedance-2-5 including task-based pro and cheap (0.208917ms)
    ✔ returns empty array for models without defined groups (0.070625ms)
  ✔ getModelChannelGroups (0.552ms)
  ▶ resolveChannelCandidates
    ✔ resolves explicit group requests first (0.701083ms)
    ✔ resolves explicit group from inline model@group (0.117584ms)
    ✔ resolves explicit pro and cheap groups for seedance-2-5 (0.150166ms)
    ✔ sorts by cost_first (lowest points estimate first) (0.058584ms)
    ✔ sorts by stability_first (highest 24h stability first) (0.076208ms)
    ✔ filters by allowedGroups when provided (0.073333ms)
    ✔ fails closed when the requested pool matches no configured group (0.050917ms)
    ✔ reports a group this model does not serve instead of dropping it silently (0.048625ms)
    ✔ restricts the explicit-group failover tail to the allowed pool (0.043ms)
    ✔ orders the explicit-group tail by the requested strategy (0.041458ms)
    ✔ keeps a model without a channel pool on its base candidates and reports the intent (0.079792ms)
    ✔ falls back to gatewayCandidates for unregistered models (0.044167ms)
  ✔ resolveChannelCandidates (1.649125ms)
✔ OmniMux Model Channel Groups & Routing Strategies (3.679375ms)
ℹ tests 19
ℹ suites 4
ℹ pass 19
ℹ fail 0
```
结论：19/19 项单测全绿，`pro`（满血高价）和 `cheap`（30秒按次特惠）寻址解析准确无误。

### 3. 画布通道组镜像与模型级联菜单测试
命令：
- `node --test plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs`
- `node --test plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/modelCascadeMenu.test.mjs`
输出结果：
```
✔ Canvas ConfigPanel ChannelGroups (pass 9, fail 0)
✔ Canvas ConfigPanel ModelCascadeMenu (pass 9, fail 0)
```
结论：画布端镜像定义与执行中枢保持 100% 逐字一致，级联菜单渲染正常。

### 4. 全景接口面板更新
命令：`pnpm hub:interfaces`
输出结果：`docs/tools/hub-interfaces.html` 成功更新，覆盖 39 款模型能力接口与各通道规格。
