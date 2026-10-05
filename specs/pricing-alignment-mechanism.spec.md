# spec: 校正 Claude Sonnet 4.6 积分并建立网关定价自动算价与门禁防线

## 背景
用户指出创作画布上 Claude Sonnet 4.6 的积分显示错误（标准版 ≈1500 积分，畅享版 ≈428 积分）。
经核查网关官方定价元数据 `GET /api/pricing`：
- `gemini-3.8-flash`: model_ratio=0.375，标准版=100 积分，畅享版(pool)=28 积分
- `claude-sonnet-4-6`: model_ratio=1.5，严格等于 Gemini 的 4 倍
按客观公式等比换算：
- 标准版 pointsEstimate 应为 `100 * 4 = 400`
- 畅享版 (pool) 应为 `400 * 0.285714 = 114`
之前 1500 / 428 为人工手工硬编码臆造，导致次旗舰价格失真且比顶级旗舰 Opus 还高。

## 目标与改动
1. **立即修复**：
   - `plugins/omnimux/src/catalog/serving/channel-groups.js`：claude-sonnet-4-6 标准版改为 400，畅享版改为 114。
   - `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts`：同步镜像改为 400 / 114。
2. **机制升级（定价真实性门禁）**：
   - 在 `pricing-calculator.js` 扩充文本模型基准换算与自动推导。
   - 在门禁 `verify-channel-group-pricing.mjs` 中对渠道分组的所有文本模型预估积分进行数学公式对账，禁止脱离网关底表的随意硬编码。

## 验收标准
- `channel-groups.js` 与 `channelGroups.ts` 保持镜像一致并通过 `verify:channel-group-naming`。
- 新增/执行 `verify-channel-group-pricing.mjs` 门禁全绿。
- 工作流单测全部通过。
