# 全模型渠道分组积分脱虚向实与统一定价对齐规范

- 任务工作树：`.worktrees/fix-model-pricing-points-alignment`
- 分支：`agent/fix-model-pricing-points-alignment`
- 对应基线：`origin/main` @ `7a70170cd`
- 日期：2026-09-18

## 1. 背景与根因

用户在创作画布选择 MiniMax H3 版本时发现积分展示异常失真（经济版 ≈350 积分、极速版 ≈540 积分、长片版 ≈5825 积分）。
经溯源排查，确认为历史遗留缺陷：
1. 早期为了在线路列表对候选进行排序，曾为标准版指定了 `1100` 作为相对权重锚点，后续版本接入时直接按上游单价比例算出 540 / 350 / 440 / 5825，纯作为内部排序权重；
2. 但由于未接入中枢统一定价规范，前端界面直接把内部权重作为积分展示，导致标价虚高近 1500 倍（长片版折合几百元人民币，实际成本仅 2.65 元）；
3. 类似情况在 `seedance-2-0` 与 `gpt-image-2.5` 等早期接入的模型中同样存在，严重影响用户决策与信任度。

## 2. 核心原则与计算准则

统一遵循平台唯一定价基准（`plugins/omnimux/src/catalog/pricing-calculator.js`）：
- 汇率基准：`1 USD = 10 积分`（即 1 积分 = 0.1 美元 = 1 角钱/7角人民币）。
- 视频按秒计费（`per_second`）：`积分 = 美元单价 × 5秒基准时长 × 分组倍率 × 10`。
- 视频/图片按次计费（`per_task`）：`积分 = 美元单价 × 分组倍率 × 10`。
- 格式化呈现：小于 10 积分保留 1 位小数（如 `≈0.2 积分`、`≈3.8 积分`），大于等于 10 积分取整（如 `≈16 积分`）。

## 3. 校准范围与参数清单

### A. MiniMax H3 系列 (5 档分组)
- **经济版 (`video_fast`)**：AutoDL 极速出片，$0.025 × 0.9 = $0.0225/次 -> `pointsEstimate: 0.2`
- **高清版 (`video_pro`)**：AutoDL 极限画质先行版，$0.025 × 1.15 = $0.02875/次 -> `pointsEstimate: 0.3`
- **极速版 (`turbo`)**：海螺 3.0 极速版，$0.0350/次 -> `pointsEstimate: 0.4`
- **标准版 (`standard`)**：官方原生专线，0.0714 美元/秒，5 秒基准 -> `pointsEstimate: 3.6`
- **长片版 (`task`)**：固定 15 秒长片专线，$0.3781/次 -> `pointsEstimate: 3.8`

### B. Seedance 2.0 系列
- **标准版 (`standard`)**：0.0971 美元/秒，5 秒基准 -> `pointsEstimate: 4.9`
- **官方版 (`official`)**：0.0971 美元/秒，5 秒基准 -> `pointsEstimate: 4.9`
- **优选版 (`preferred`)**：倍率 1.178 -> `pointsEstimate: 5.7`
- **经济版 (`cheap`)**：特惠走量 -> `pointsEstimate: 2.4`
- **旗舰版 (`pro`)**：满血任务版 -> `pointsEstimate: 9.8`

### C. GPT Image 2.5 系列
- **标准生图 (`gpt-image-2.5`)**：0.013072 美元/次 -> `pointsEstimate: 0.1`
- **极速版 (`gpt-image-2.5-flare`)**：0.014706 × 1.125 美元/次 -> `pointsEstimate: 0.2`
- **画质版 (`gpt-image-2.5-sunburst`)**：0.014706 × 1.125 美元/次 -> `pointsEstimate: 0.2`

## 4. 验收标准（可测试）

- **AC-1 (数值脱虚向实)**：`getModelChannelGroups('minimax-h3')` 中 5 档分组积分估算值分别为 `0.2`、`0.3`、`0.4`、`3.6`、`3.8`。
- **AC-2 (路由策略自洽)**：`cost_first` 模式依然首选 `video_fast`（0.2 最低），`stability_first` 依然首选 `standard`（99% 稳定性）。
- **AC-3 (跨插件镜像一致)**：中枢 `channel-groups.js` 与画布 `channelGroups.ts` 逐字对齐。
- **AC-4 (门禁验证)**：
  - `pnpm verify:model-contracts` strict 100% 绿灯通过；
  - `verify-cross-plugin-model-alignment.test.mjs` 100% 绿灯通过；
  - 中枢与画布分组相关单测 100% 绿灯通过。
