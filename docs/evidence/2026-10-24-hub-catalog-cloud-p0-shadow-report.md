# 中枢模型目录云端化 P0：影子模式差异报告（#3691）

- 日期: 2026-10-24
- 任务: #3691（P0 阶段，只读影子模式；计划见 `deliverables/omnimux-catalog-refactor/PLAN.md`）
- 中枢基线: `origin/main@9a2cb8ad7`
- 上游只读真源: `OmniMux` 网关仓配置基线（`scripts/ops/config-baseline/`）
- 命令: `node plugins/omnimux/scripts/catalog-diff.mjs --gateway <基线目录> [--hub-catalog <历史目录 JSON>] [--json]`
- 全程无网络请求，未调用任何真实模型；`--hub-catalog` 用于重放历史中枢投影。

## 1. 目的

验证新的「网关视图」模块（`plugins/omnimux/src/catalog/cloud/`）能否只凭两侧数据，机械地复现 2026-10-21 手工对账（`docs/evidence/2026-10-21-hub-gateway-drift-audit.md`）的结论。复现不出就说明归一化或差异判据有误。

## 2. 历史重放：复现 2026-10-21 对账

- 网关快照：`OmniMux@6d6bfee62`（2026-10-20）的 `channels.json`/`models.json`/`options.json`，摘要 `758e833ca91ab887`，64 条渠道中 17 条 `status=1`，可路由模型 21 个。
- 中枢目录：`471206b64`（#3516 修复前）的 `buildModelCatalog()` 输出，上架 16 个模型。
- 报告：`2026-10-24-hub-catalog-cloud-p0-historical.json`

| 类别 | 数量 | 与对账文档的一致性 |
| --- | --- | --- |
| 中枢上架但网关不可达 | 9 | 与 §2「上架 16 个，其中 9 个已无任何启用渠道」一致 |
| 中枢分组在网关缺失 | 8 | 与 §3 列举的分组漂移一致 |
| 网关在售但中枢未上架 | 14 | 与 §4「现役但产品未提供的能力」同族 |

9 个不可达模型（逐条可核）：`claude-sonnet-4-6`、`doubao-asr-bigmodel`、`gemini-3.8-flash-tts`、`gpt-image-2.5-flare`、`gpt-image-2.5-sunburst`、`indextts-2`、`minimax-h3`、`seed-audio-1.0`、`seedasr-auc`。

8 条分组漂移含：`seedance-2-5 @ default`（网关现役 `seedance-2-5-480p`/`-720p`）、`seedance-2-0 @ seedance-2-0-task-pro`/`seedance-standard`/`cheap`、`gpt-image-2.5 @ gpt-image-2.5-pro`、`gemini-3.8-flash @ gemini-cheap`/`pool`。

## 3. 当前状态：P0 合并时的实际漂移

- 网关快照：`OmniMux` 现役基线（2026-10-23 之后），摘要 `7a9dac0955798061`，68 条渠道中 24 条 `status=1`，可路由模型 24 个。
- 中枢目录：本工作树的 `buildModelCatalog()`，上架 9 个模型。
- 报告：`2026-10-24-hub-catalog-cloud-p0-current.json`

| 类别 | 数量 | 说明 |
| --- | --- | --- |
| 中枢上架但网关不可达 | 0 | #3516 之后中枢与网关成员资格已一致 |
| 中枢分组在网关缺失 | 0 | 分组亦已对齐 |
| 网关在售但中枢未上架 | 15 | `kling-v2-6`/`kling-v3`/`wan-3.0`/`nano-banana-2`/`suno-sounds`/`tiktok-*`/`x-*` 等 |
| 网关分组中枢未登记 | 5 | 含 `seedance-2-5 @ seedance-2-5-480p`/`-720p`（中枢只登记 `desktop-480p`/`desktop-720p`）、`nanobanana-economy`、`whisper-1 @ default` |
| 积分估算不一致 | 0（可比对 0 项） | 配置基线不含计费字段，价格比对在 P1 接入 `/api/pricing` 后才可用 |

## 4. 覆盖限制（已写入报告）

- 配置基线不含 `supported_endpoint_types` 与逐模型 `contract`；两者在快照中记为未知，不计入差异。
- 基线快照只代表「有启用渠道绑定该模型」，不代表模型本身可用；真实调用仍以执行结果为准。
- 本轮快照是匿名/全量视图；登录后的分组视图（账号维度缓存键）属 P1。
- 价格比对依赖网关计费字段，本轮无输入，`priceChanged` 恒为 0 不构成「价格无漂移」的结论。

## 5. P1 前置条件（独立评审提出，P0 不受影响）

- **`billing_expr` 优先级**：网关某些模型实际按 `billing_expr`（`fixed(x)`）扣费，`model_price` 不生效（对账文档 §3 注 2，`gpt-image-2.5` 即如此）。快照已归一 `billing.expr`；`expectedPoints()` 在该字段非空时返回「不可比对」，差异报告单列「积分无法比对」一节，避免 P1 系统性误报价格漂移。
- **`enable_groups` 缺失**：若 `/api/pricing` 响应不含 `enable_groups`，归一化会写入 `pricing-response-without-enable-groups` 限制；`isSnapshotEmpty()` 同时拒绝把这类快照写入缓存（保留上一份）。P1 接入前须用真实响应核对字段存在性，否则会把「全体不可达」当成事实。

## 6. 复现步骤

```bash
# 现役基线
node plugins/omnimux/scripts/catalog-diff.mjs \
  --gateway /Users/x/Desktop/Project/OmniMux/scripts/ops/config-baseline

# 历史重放（网关 2026-10-20 基线 + 中枢 471206b64 投影）
git -C /Users/x/Desktop/Project/OmniMux show \
  6d6bfee62:scripts/ops/config-baseline/channels.json > /tmp/gw-baseline-20261020/channels.json
# models.json / options.json 同理；中枢侧用 git archive 471206b64 后调用 buildModelCatalog()
node plugins/omnimux/scripts/catalog-diff.mjs \
  --gateway /tmp/gw-baseline-20261020 \
  --hub-catalog /tmp/hub-catalog-471206b64.json
```

## 7. 影子模式确认

P0 只新增 `src/catalog/cloud/`、`scripts/catalog-diff.mjs` 与测试/夹具，未修改任何运行时路径（`list.js`、`host/apply.js`、`contract/*` 均未改动），因此 `buildModelCatalog()` 的输出与合并前逐字节一致；差异结果只经 CLI 输出，不进入任何用户可见界面。
