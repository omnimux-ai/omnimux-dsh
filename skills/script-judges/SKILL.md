---
name: script-judges
description: 融合 Jev System 1 极速决策模型的四裁判对抗评审与台词重构技能 (Pacing, Spoken Voice, Freshness, Structure)。在花钱调用视频生成模型之前，对分镜台词进行毫秒级硬性审查，彻底消灭书面语、陈词滥调与重复套路，确保台词 100% 具备口语网感与高留存转化力。
license: AGPL-3.0-only
metadata:
  {
    "version": "1.0.0-omnimux-jev",
    "homepage": "https://github.com/xixihhhh/clipforge",
    "keywords": "script-review, ugc-ads, hook-writing, short-video, copywriting, 口播, 带货脚本, 台词, judge-panel, jev-decision",
    "openclaw":
      {
        "emoji": "⚖️",
        "homepage": "https://github.com/xixihhhh/clipforge",
        "requires": {},
      },
  }
---

# Script Judges with Jev — 花钱生成前先撕碎每一句台词

无论是 MiniMax H3、Seedance 还是可灵，模型渲染一段糟糕台词所消耗的算力，与渲染一段神级台词没有任何区别。
一旦视频画面过关，决定用户是继续滑动还是下单转化的生死线，100% 取决于**台词是否像真人自然说出来的口语（Spoken, not Written）**。

本技能完整保留 ClipForge 四裁判对抗机制，并全面升级为 **Jev 赋能的类型化硬门禁**，由 Jev（70~120ms）在毫秒级执行结构化裁决与二元门禁，严禁大模型闭门自嗨。

---

## Jev 赋能的四裁判对抗陪审团

每个裁判由 Jev 专属的 System 1 模型单选/评分指令驱动，严苛胜于礼貌：

### 1. 节奏官 (Pacing Judge · Jev 留存概率裁决)
- **核心判定**：第一句话能否在 2 秒内留住手指？
- **Jev 契约**：
  `score_criteria: ["Killed (必死)", "Weak (平庸)", "Average (合格)", "Strong (强劲)", "Unskippable (不可跳过)"]`
- **一票否决权**：若前 3 秒 Hook 得分低于 "Strong"，整个剧本直接打回，严禁进入后续环节。

### 2. 口语官 (Spoken Voice Judge · Jev 官话书面语枪毙门禁)
- **核心判定**：听起来像日常说话，还是像广告背书？
- **Jev 契约**：
  `choices: { "written_kill": "书面语/官话腔（严禁出现'因此/综上所述/不可否认/今天给大家介绍'）", "spoken_pass": "自然大白话（中途切入、真实口癖、极简半句话）" }`
- **铁律**：CTA 必须漫不经心（如“反正链接放这了”），严禁口号式催单。

### 3. 创意官 (Freshness Judge · Jev 历史指纹排重门禁)
- **核心判定**：这个套路或词句之前是否出现过？
- **Jev 契约**：
  `state: { history_records, current_script }`
  `choices: { "repetition_kill": "与历史人设/痛点/句式雷同", "fresh_pass": "全新正交视角与真实证据支撑" }`
- **证据链溯源**：检查当前创意是否具有灵感库真实作品、成熟 Hook 库与营销模板的真实证据支撑，无证据的臆想直接驳回。

### 4. 结构官 (Structure Judge · Jev 剧情爬升与因果张力)
- **核心判定**：全片是否符合 3-stage 因果递进（0-3s 冲突 ➔ 3-8s 动作解药 ➔ 8-15s 高光定格），有无断层或提前泄气？
- **Jev 契约**：
  `score_criteria: ["Plateaued (高开低走/平铺直叙)", "Escalating (因果环环相扣)", "Climaxed (高光收官)"]`

---

## 台词重构与修改铁律 (Rewrite Rules)

1. **保留事实，重塑语态**：保留商品的核心卖点与参数（如 5ml 便携、底部充装、买二送一），绝对禁止捏造疗效与违规绝对化用语；
2. **长度约束**：重写后的台词长度必须在原长度的 $\pm 15\%$ 以内，严格对齐分镜时段的配音时间槽；
3. **粗砺真实胜于精致文案**：只要读起来像精心设计的广告词，立即打回重写真人闲聊语态。
