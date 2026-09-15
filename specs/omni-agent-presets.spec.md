# 规范：OmniMux 全能操盘手体系与三大领域预设规范

> 任务真源：新建营销、短剧操盘手，并将 tiktok-agent 全面纠偏重构为全能定标 omni-agent。
> 本文件是人与 Agent 共享的验收真相源：写码前定死"建什么、怎样算完成"。

## 1. 业务目标与体系定位

### 1.1 背景与问题
1. **命名单一化与平台局限**：既有 `tiktok-agent` 命名将全能社媒操盘手绑死在单一 TikTok 平台上，缺乏全域全能站位，与“全网爆款与矩阵运营”的产品价值冲突；
2. **场景空白**：顶部虽然存在「营销」与「短剧」Tab，但缺少领域专属的操盘手预设（Preset）与成套专家团（Subagents），用户在垂直领域无法一键调遣工业级智囊团；
3. **权责混淆**：Agent 角色与垂直技能（Skills）界限不够分明，易出现大模型凭空脑补分镜或过度繁琐问答的问题。

### 1.2 建设目标
1. **预设去平台化**：将 `tiktok-agent` 重构更名为 **`omni-agent`**，中文名保持「全能社媒操盘手」，彻底面向全域（TikTok/Instagram/YouTube/小红书/X）；
2. **新建营销操盘手**：新建 **`omni-marketing-agent`**（全能营销操盘手），下辖营销战役策划师、广告创意师、转化文案大师、视觉设计专家、投放增长师、数据归因师 6 位专家；
3. **新建短剧操盘手**：新建 **`omni-drama-agent`**（全能短剧操盘手），下辖金牌编剧、分镜导演、角色美术指导、声效与配音导演、影视剪辑合成师、出海译配主管 6 位专家；
4. **确立协同边界**：Agent 主理人把控“意图对齐、流程编排、门禁确认与交付闭环”，Skill 提供“专业方法论、结构化数据契约与工具参数规范”。

## 2. 核心架构契约

### 2.1 预设文件矩阵
```
presets/
├── omni-agent/                      # 【重命名】全能社媒操盘手
│   ├── preset.yml                   # name: 全能社媒操盘手 / order: 1
│   ├── agent.cordis.yml             # 主理人 System Prompt + 10 社媒专家
│   └── skills.json                  # 45 个垂直技能
├── omni-marketing-agent/            # 【新建】全能营销操盘手
│   ├── preset.yml                   # name: 全能营销操盘手 / order: 2
│   ├── agent.cordis.yml             # 营销主理人 System Prompt + 6 营销专家
│   └── skills.json                  # 营销专属垂直技能集
├── omni-drama-agent/                # 【新建】全能短剧操盘手
│   ├── preset.yml                   # name: 全能短剧操盘手 / order: 3
│   ├── agent.cordis.yml             # 短剧主理人 System Prompt + 6 短剧专家
│   └── skills.json                  # 短剧专属垂直技能集
└── fragments/
    ├── content-experts.cordis.yml    # 社媒创作片段 (可可/沃伊斯/维森/维迪奥/缪斯/艾迪特)
    ├── engagement-experts.cordis.yml # 社媒增长片段 (柏特/瑞普/麦恩/沃奇)
    ├── marketing-experts.cordis.yml  # 【新建】营销 6 专家片段
    └── drama-experts.cordis.yml      # 【新建】短剧 6 专家片段
```

### 2.2 别名兼容与解析契约
- 在 `plugins/omnimux-market/src/client/skill-picker-logic.js`、`plugins/omnimux/src/client/agent-preset-enhancer.js`、`plugins/omnimux/src/client/agent-presets-i18n.js` 中：
  - 历史输入 `tiktok-agent`、`tiktokagent`、`tiktok` 统一平滑映射到 `omni-agent`；
  - 完整支持 `omni-agent`、`omni-marketing-agent`、`omni-drama-agent` 及其对应中文名。

## 3. 验收标准
1. `node scripts/build-agent-presets.mjs` 执行成功，能正确拼装三大操盘手的 `agent.cordis.yml`；
2. 运行 `node --test scripts/verify-agent-presets.test.mjs` 与相关单测，断言 100% 绿灯；
3. 前端别名与技能货架绑定逻辑单测全部通过。
