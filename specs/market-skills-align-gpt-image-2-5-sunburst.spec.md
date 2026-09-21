# 需求规格：技能市场提示词与工作流规范全面对齐 GPT Image 2.5 画质版 (gpt-image-2.5-sunburst)

## 一、目标与背景 (Objective & Background)

在系统模型中枢与网关的收敛演进中，原历史模型代号 `gpt-image-2` 已被正式停用并下架，新一代标准图像模型已全面收敛至 `gpt-image-2.5` 家族（含标准版 `gpt-image-2.5`、极速版 `gpt-image-2.5-flare`、画质版 `gpt-image-2.5-sunburst`）。

然而，当前技能市场（`plugins/omnimux-market/catalog/skills/`）的 17 个应用技能（如 `/ugc-confessional`、`/ugc-unwrap`、`/motion-design-flow`、`/amazon-product-listing` 等）中仍保留了大量 `model="gpt-image-2"` 的硬编码与历史解释说明，导致智能体在执行任务向用户汇报时，出现“口头陈述使用 gpt-image-2、底层实际被网关映射为 gpt-image-2.5-sunburst”的口径分裂现象。

本任务目标：
1. **技能提示词与调用契约纠偏**：
   - 将 17 个专业技能中用于多格分镜底板、微距商标印刷、文字排版、同图人物道具一致性锁定的模型 ID，统一收敛并纠偏为官方画质版标准标识 **`gpt-image-2.5-sunburst`**。
2. **规范文档与微文案统一**：
   - 将相关技能的 `SKILL.md` 和 `board-prompt-guide.md` 等参考文档中的原理解析与错误拦截指南，由旧代号 `gpt-image-2` 统一纠正为规范名称 **`GPT Image 2.5 画质版 (gpt-image-2.5-sunburst)`**。
3. **安全边界与门禁守护**：
   - 保留核心模型契约与测试中对已废弃旧模型的防御拦截用例（如 `dispositions.json` 中 `gpt-image-2` 状态保持 `unavailable`，相关提交守卫测试保持不变），防止旧标识在运行时被误放行。

---

## 二、验收标准 (Acceptance Criteria)

- **AC-1 (分镜与排版类技能模型 ID 升级)**：
  - `plugins/omnimux-market/catalog/skills/` 下的分镜底板与排版类技能（`ugc-confessional`, `ugc-unwrap`, `ugc-fit-check`, `ugc-showcase`, `ugc-walkthrough`, `motion-design-flow`, `pedestal-product-hero`, `amazon-product-listing`, `ads-static-image-from-reference`, `retail-multi-variant-carousel-sale`, `playstore-ui-anchored-promo`, `podcast`, `landing-page-dr-skill`, `editorial-apparel-static`, `white-bg-feature-callout-product-overview`, `video-adapt`, `product-photoshoot`），其分镜板与排版图的 `model` 参数由 `"gpt-image-2"` 升级为 `"gpt-image-2.5-sunburst"`。
- **AC-2 (文档与指南文案收敛)**：
  - 各技能文档中关于“排版选择”、“三分格布局”、“一致性锁定”的说明文本，全面更新为 `GPT Image 2.5 画质版 (gpt-image-2.5-sunburst)`。
- **AC-3 (防回归与契约门禁全绿)**：
  - 运行 `pnpm verify:model-contracts` 契约校验通过；
  - 既有单元测试与技能校验全部通过。
