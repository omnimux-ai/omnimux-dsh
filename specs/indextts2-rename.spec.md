# Spec: 模型级联选择器将 gxgenai 规范重命名为 Index TTS2

- 需求背景：在创作画布音频节点模型级联选择器中，声音克隆模型当前左侧分组显示为底层内部标识 `gxgenai`，用户体验突兀且不直观；需统一重命名为标准产品系列名称 `Index TTS2`。
- 风险级别：R3（纯展示文案与品牌分组映射，无破坏性运行时逻辑改动）

## 1. 目标与验收标准

1. **AC-1 级联选择器左侧分组名称**：
   - 模型级联选择器左侧品牌/系列栏显示 `Index TTS2`，不再显示 `gxgenai`。
2. **AC-2 模型卡片展示信息**：
   - 模型标题为 `Index TTS2 声音克隆`，副标题优化为 `Index TTS2 · 参考音 + 文稿直出克隆音色`，去除内部通道名称干扰。
3. **AC-3 兼容性与契约平账**：
   - 契约 `audio-models.yaml` 中更新 `family: "indextts"` 及相应展示标签，`pnpm verify:model-contracts` 严格模式 100% 通过。
4. **AC-4 单元测试覆盖**：
   - 级联候选分组测试 `modelPickerCandidates.test.mjs` 覆盖 `Index TTS2` 分组映射断言。
