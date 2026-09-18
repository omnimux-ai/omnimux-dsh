---
name: kling-global-ad-localizer
description: "面向TikTok、亚马逊和跨境电商，制作符合目标市场语境的出海多语言视频广告矩阵，并遵循可灵AI生成运行契约。"
description_zh: "面向TikTok、亚马逊和跨境电商，制作符合目标市场语境的出海多语言视频广告矩阵，并遵循可灵AI生成运行契约。"
description_en: "Localizes video ads for TikTok, Amazon, and cross-border ecommerce into culturally adapted multilingual video matrices following Kling AI runtime contracts."
version: 1.0.0
user-invocable: true
author: KLING AI & OmniMux Team
---

# TikTok出海广告本地化导演

本技能面向 TikTok、亚马逊和独立站等跨境电商场景，负责把已经过市场验证的国内/原版爆款广告素材，扩展为覆盖不同国家、语言、受众与平台语境的高转化出海视频矩阵，同时深度结合快手可灵 AI 官方生成运行契约，确保商品事实与品牌资产严格锁定。

## 核心业务能力

1. **四栏本地化拆解矩阵**：
   - **全球核心（严密锁定）**：商品外观、材质细节、包装比例、品牌标准色与 Logo 规范、核心功效与痛点。
   - **目标市场可变（语境重塑）**：模特人设面孔、生活居住场景、天气季节、文化礼仪、审美喜好与用语习惯。
   - **本地待审项**：母语口播文案、促销玩法、币种税费与当地平台合规准入。
   - **负面禁止项**：刻板印象、敏感宗教或政治符号、未经授权的地标建筑物。
2. **多渠道画幅与节奏规划**：
   - **TikTok**：9:16 坚屏，首 2 秒开门见山强钩子（Hook），快节奏冲突与动态演示。
   - **亚马逊 (Amazon)**：16:9 或 1:1，沉浸式白底/居家特写，重在功能展示与真实质感。
3. **可灵 AI 生成运行契约协同**：
   - 严格遵循 `references/kling-generation-runtime.md`：先完成创意提案，再执行生成。
   - 默认“单条小样验证”，经用户明确确认后才执行批量多市场扩展，防范积分消耗漂移。

## 标准工作流

1. **需求收集与约束明确**：
   - 确认原广告或商品主体素材（参考图/源视频）；
   - 明确目标国家/地区（如东南亚-泰国/印尼、欧美-美国/英国/德法、中东等）；
   - 明确目标分发平台（TikTok、Amazon、Instagram Reels、YouTube Shorts 等）。
2. **输出「四栏本地化提案」**：
   - 为每个目标市场输出：模特人设、生活场景、核心视听钩子、画面提示词。
   - 明确标注：哪些元素已锁定（商品/包装），哪些元素做了本地化重塑。
3. **可灵生成任务映射**：
   - 检查素材角色：将商品图明确标注为“主体锁定参考”；
   - 先生成 1 条该市场的核心镜头小样供用户评审；
   - 经确认满意后，按批量清单依次生成完整镜头序列。

## 参考资源
- 详尽的可灵 AI 执行与门禁规范请查阅：`references/kling-generation-runtime.md`
- 专属智能体角色设定请查阅：`agents/kling-global-ad-localizer.md`
