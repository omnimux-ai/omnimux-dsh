# 登记 GPT Image 2.5 极速版 / 画质版并接入创作画布

- 任务：`.worktrees/catalog-image-flare-sunburst-issue-1861`（分支 `agent/catalog-image-flare-sunburst-issue-1861`，基线 `origin/main` @ `eb95e47ea`）
- 日期：2026-09-15
- 上游：Issue #1861。用户 2026-09-15 指令「gpt-image-2.5、gpt-image-2.5-flare、gpt-image-2.5-sunburst 挨个验证这三个，如果验证可用，配置到创作画布插件中图片生成节点」。
- 依赖：Issue #1851 / PR #1856（分组头 `X-Omnimux-Group` 的下发）。本任务的线路机制在它之上才真正可达。

## 1. 问题

真实调用验证（证据 `.agent-reports/image-model-live-validation/README.md`）得出两条决定性事实：

1. `gpt-image-2.5-flare` / `gpt-image-2.5-sunburst` 在默认分组下回 `503 model_not_found`「分组 auto 下模型 … 无可用渠道」；带各自专属分组（`-std` / `-pro`）后 `200` 且同步返回 `b64_json`。
2. `model=gpt-image-2.5` + `X-Omnimux-Group=gpt-image-2.5-flare-std` 同样 `503` —— **分组与模型名绑定**。因此必须作为独立模型登记，不能做成同一模型的档位。

接入创作画布还缺一环：画布的媒体请求白名单（`omnimuxGateway.ts`）只透传 `strategy` 与 `allowedGroups`，**不含 `group`**，所以画布无法显式指定分组。而 `route.js` 仅在调用方给出路由意图时才走分组计划，无意图时回落 `gatewayCandidates` 的裸模型名 —— 裸名打网关只会落到 auto 分组，对这两个模型必然是 `503`。

结论：新模型必须在**没有调用方意图**时也走自己的线路，否则画布选到它们必定失败。

## 2. 目标

新增 `gpt-image-2.5-flare` 与 `gpt-image-2.5-sunburst` 两个在售图像模型，各自带标准档与优选档线路，并让「声明了默认线路的模型」在无显式线路意图时自动走默认线路；画布图片生成节点可选到这两个模型。

## 3. 验收标准（可测试）

### 3.1 契约与线路

- AC-1 两个模型进入图像契约，`text_to_image` 操作 `listed: true`，`research.status`、`implementation.status`、`execution.status` 依据本次 dated live 记录登记。
- AC-2 每个模型登记一条标准档线路：`wireGroup` 指向网关 `-std` 分组，并标记为默认线路。与既有 `gpt-image-2.5` 只登记一条线路的口径一致；网关 `-pro` 分组留待有明确档位定价依据时再开，本次不登记。
- AC-3 线路表带 `default: true` 标记时，无显式路由意图的 image 请求携带 `X-Omnimux-Group`，值等于默认线路的 `wireGroup`。
- AC-4 默认线路锁定单档：该模型默认线路下的候选序列只含默认档，不因 failover 跨到优选档（费用不上跳）。
- AC-5 调用方显式给了 `group` 时，请求使用调用方选择，默认线路不覆盖它。
- AC-6 未声明默认线路的模型行为逐字不变：请求体是裸模型名，且**不带** `X-Omnimux-Group`。

### 3.2 画布闭环

- AC-7 创作画布生成策略的图片白名单包含两个新 id；`projectCanvasCatalog` 能投影出它们（各自带 `listed` 操作与 `output.type === 'image'`）。
- AC-8 画布图片生成节点的模型选择器可读出这两个模型（真实浏览器验证）。

### 3.3 回归与门禁

- AC-9 `pnpm verify:model-contracts` 通过，新增条目 admission 无错。
- AC-10 `plugins/omnimux` 与 `plugins/omnimux-workflow` 测试全绿（既有 ego 浏览器环境问题除外，需在报告中标注）。
- AC-11 既有图像模型（`gpt-image-2.5`）的候选序列与请求形态不变。

## 4. 不做

- 不改网关侧；`gpt-image-2.5` 的取图故障是网关服务端问题，另案待用户授权。
- 不改 `resolveChannelPlan` 的 fail-closed 语义与 auto 排序。
- 不改既有 `gpt-image-2.5` 的登记与默认模型地位。
- 不发新的真实模型请求（证据已在验证阶段取得）。
- 不做界面文案之外的新交互（沿用既有模型选择器）。

## 5. 实现要点

- `catalog/serving/channel-groups.js`：两个模型各两条线路，标准档 `default: true`。
- `media/route.js`：取模型线路，若存在 `default: true` 的线路且调用方无意图，则以该线路的 `wireGroup` 作为 `group`、以该线路限定池（`allowedGroups`）走 `resolveChannelPlan`。
- `catalog/specs/image-models.yaml` + `catalog/contract/dispositions.json`：两个模型条目与处置。
- `omnimux-workflow/src/shared/generationPolicy.ts`：图片白名单加入两个 id。

## 6. 风险

`route.js` 是图像 / 视频 / 音频的共同入口。缓解：新分支只在模型**显式声明默认线路**时启用；未声明者走原路径，并由 AC-6 / AC-11 两条断言锁定。
