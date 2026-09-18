# 全量模型渠道分组积分对齐脱虚向实规范 (All Models Pricing Points Alignment Spec)

- 任务工作树：`.worktrees/align-all-model-pricing-points`
- 分支：`agent/align-all-model-pricing-points`
- 对应基线：`origin/main` @ `7de58d0fb`
- 日期：2026-09-18

## 1. 目标与背景

继 MiniMax H3 积分虚高问题修复后，对全系统所有在售模型及旧存量模型的渠道分组积分进行第二阶段全量校准：
1. **Seedance 2.0 系列**：校准为真实实测积分（经济版 1.5 积分、标准版 4.9 积分、优选版 5.7 积分、旗舰版 9.8 积分）；
2. **GPT Image 2.5 系列**：校准为真实实测积分（标准版 0.1 积分、极速版 0.2 积分、画质版 0.2 积分）；
3. 确保中枢 `channel-groups.js` 与创作画布镜像 `channelGroups.ts` 保持 100% 逐字一致；
4. 确保所有策略排序（成本优先、稳定性优先）逻辑完全成立，所有单元测试与模型契约严格门禁 100% 通过。

## 2. 详细校准清单

### Seedance 2.0 (`seedance-2-0`)
- `cheap`（经济版）: 800 -> `1.5` 积分（上游按次单价 $0.294118 × 0.5 × 10 ≈ 1.5）
- `standard`（标准版）: 1040 -> `4.9` 积分（上游单价 $0.0971/秒 × 5秒 × 10 ≈ 4.9）
- `official`（官方版）: 3568 -> `4.9` 积分（上游单价 $0.0971/秒 × 5秒 × 10 ≈ 4.9）
- `preferred`（优选版）: 1560 -> `5.7` 积分（上游单价 $0.0971/秒 × 1.178倍率 × 5秒 × 10 ≈ 5.7）
- `pro`（旗舰版）: 3476 -> `9.8` 积分（上游按次单价 $0.294118 × 3.333倍率 × 10 ≈ 9.8）

### GPT Image 2.5 系列
- `gpt-image-2.5` (`standard`): 200 -> `0.1` 积分（单张图 $0.013072 × 10 ≈ 0.1）
- `gpt-image-2.5-flare` (`standard`): 225 -> `0.2` 积分（单张图 $0.014706 × 1.125 × 10 ≈ 0.2）
- `gpt-image-2.5-sunburst` (`standard`): 225 -> `0.2` 积分（单张图 $0.014706 × 1.125 × 10 ≈ 0.2）

## 3. 验收标准

- **AC-1 (数值脱虚向实)**：`channel-groups.js` 与 `channelGroups.ts` 中上述两大家族模型积分全量替换为真实小数积分。
- **AC-2 (镜像逐字对齐)**：两文件对应模型的配置内容保持 100% 逐字一致。
- **AC-3 (门禁与测试)**：
  - `channel-groups.test.js` 100% 通过；
  - `channelGroups.test.mjs` 100% 通过；
  - `verify-cross-plugin-model-alignment.test.mjs` 100% 通过；
  - `verify-model-contracts.mjs --strict` 契约门禁 100% 绿灯。
