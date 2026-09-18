# 规格文档：TikTok 运营专家团预设体系与多环境物化

## 1. 业务目标
基于现有资产库组建「TikTok 运营专家团」，构建覆盖选品洞察、爆款拆解、分镜创作、视听生成、评论截流与投流归因的全链路智能体专家团队，并将其配置为 OmniMux Dev 和正式（Prod）环境的 Agent 预设。

## 2. TikTok 运营业务场景分析
1. **选品与赛道挖掘**：蓝海爆品挖掘、竞对热销商品监控、买家口碑与差评洞察、高佣金联盟筛选。
2. **爆款内容解构与创意**：短视频 5D 解构、黄金前 3 秒 Hook 抓手、短视频分镜脚本与图文轮播、垂直热门标签挖掘。
3. **多媒体视听工业化生产**：9:16 竖屏关键帧生图、分镜视频生成、高完播率口播配音、卡点音效 SFX 与趋势 BGM、剪辑工坊多轨合成与安全区字幕。
4. **电商视觉资产矩阵**：主图白底图、真实使用场景图、卖点图、四宫格细节微距、买家秀 UGC、真人模特试穿。
5. **互动截流与社群转化**：评论区高赞互动、风趣神评、商机信号与痛点挖掘、品牌声量舆情监控、私信建联。
6. **营销投放与全链路归因**：带货广告创意、多素材 A/B 测试矩阵、播放留存漏斗诊断与 ROI 归因复盘。

## 3. 专家团队编制与资产库映射
- **主理人（Lead）**：TikTok 全域运营操盘手
- **创作与视听子团队**：
  - `expert_content_copywriter`（文案专员可可）
  - `expert_speech`（配音解说专家沃伊斯）
  - `expert_image`（视觉生图专家维森）
  - `expert_video`（分镜生成专家维迪奥）
  - `expert_music`（配乐音效专家缪斯）
  - `expert_editing`（剪辑合成专家艾迪特）
- **互动与舆情子团队**：
  - `expert_interaction_automator`（合规互动运营专家柏特）
  - `expert_ai_comment`（评论运营专家瑞普）
  - `expert_signal_miner`（信号挖掘专家麦恩）
  - `expert_brand_monitor`（品牌监控专家沃奇）
- **投放与增长子团队**：
  - `expert_ad_creative`（广告创意总监克里斯）
  - `expert_traffic_growth`（投放增长操盘手葛洛斯）
  - `expert_data_attribution`（数据分析与ROI归因师安娜）

## 4. 验收与交付标准
1. `presets/tiktok-agent/preset.yml` 与 `agent.cordis.yml` 完成专家团全量注入与人设定制；
2. `presets/tiktok-agent/skills.json` 覆盖选品、视频、图文、数据分析与营销五大类完整技能；
3. `scripts/build-agent-presets.mjs` 纳入 `tiktok-agent` 自动插桩构建；
4. `scripts/sync-agent-presets.sh` 将 `tiktok-agent` 列为出厂保留项，并物化到 `~/.omnimux-dev` 和 `~/.omnimux`；
5. `plugins/omnimux/src/client/agent-presets-i18n.js` 支持「TikTok运营专家团」国际化多语言回显。
