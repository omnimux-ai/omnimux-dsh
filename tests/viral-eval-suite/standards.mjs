/**
 * 短视频 (5-30秒) 爆款评估标准与量化量表 (Ground Truth Rubric)
 * 用于对生成的分镜脚本、T2I 提示词、I2V 动作指令进行客观量化评测
 */

export const GROUND_TRUTH_RUBRIC = {
  // 1. 黄金 Hook 留存力 (0-3秒) - 权重 30%
  hookRetention: {
    weight: 0.3,
    criteria: [
      {
        rule: 'no_empty_intro',
        desc: '前 3 秒严禁出现品牌 Logo 漫游、空镜头风景、打招呼寒暄',
        passScore: 100,
        failScore: 0,
      },
      {
        rule: 'visual_or_emotional_conflict',
        desc: '前 3 秒必须建立强烈的视觉反常冲突、痛点共鸣或极端反直觉悬念',
        passScore: 100,
        failScore: 30,
      },
    ],
  },

  // 2. 视听分镜节奏与卡点推进 (每 2.5-4 秒一拍) - 权重 25%
  pacingDensity: {
    weight: 0.25,
    criteria: [
      {
        rule: 'rhythm_interval',
        desc: '5-30 秒短视频必须按时间划分为 3-6 个节拍分镜，单镜头最长不超过 5 秒',
        passScore: 100,
        failScore: 40,
      },
      {
        rule: 'shot_scale_variety',
        desc: '景别严禁全程固定平视，必须包含特写(Close-up)、中景(Medium)或主观微距变换',
        passScore: 100,
        failScore: 50,
      },
    ],
  },

  // 3. I2V 图生视频机器指令可执行度 - 权重 25%
  i2vExecutability: {
    weight: 0.25,
    criteria: [
      {
        rule: 'no_talking_head_mouth_movement',
        desc: '严禁角色对镜头大量口播张嘴念台词（防止 I2V 口型崩坏与恐怖谷效应），以动作、眼神与情绪演绎为主',
        passScore: 100,
        failScore: 0,
      },
      {
        rule: 'actionable_verbs_only',
        desc: '只写具体身体动作、运镜方向、物体受力因果；严禁堆砌“电影级、史诗级、高清唯美”等无法执行的空洞形容词',
        passScore: 100,
        failScore: 30,
      },
    ],
  },

  // 4. 商业事实与功能边界安全 - 权重 20%
  factSafety: {
    weight: 0.2,
    criteria: [
      {
        rule: 'within_whitelist_params',
        desc: '产品功能与数据指标 100% 局限在用户输入白名单内，零编造夸大功效',
        passScore: 100,
        failScore: 0,
      },
      {
        rule: 'single_actionable_cta',
        desc: '结尾 3 秒仅引导一个明确单一动作（暗号/主页链接/投票对立），严禁多个混乱指令',
        passScore: 100,
        failScore: 40,
      },
    ],
  },
};
