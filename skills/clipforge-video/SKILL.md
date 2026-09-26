---
name: clipforge-video
description: 基于 ClipForge 工业级短视频生产流水线（Script → Footage → Voiceover → Subtitles → Compose），深度融合 OmniMux 三大专业数据源（灵感库真实作品、商品库实拍图、营销模板库）与 Jev 极速结构化决策模型的社媒短视频 Agent 生产技能。覆盖 TikTok / Reels / Shorts / 抖音 / 小红书，具备严格的质量门禁与防重发散机制。
license: AGPL-3.0-only
metadata:
  {
    "version": "1.0.0-omnimux",
    "homepage": "https://github.com/xixihhhh/clipforge",
    "keywords": "ai-video, faceless-video, text-to-video, tiktok, reels, shorts, 抖音, 快手, 小红书, product-video, tiktok-shop, ugc, omnimux, jev-decision, minimax-h3, seedance",
    "openclaw":
      {
        "emoji": "🎬",
        "homepage": "https://github.com/xixihhhh/clipforge",
        "requires": { "bins": ["node", "ffmpeg"] },
      },
  }
---

# ClipForge for OmniMux — AI 短视频工业化生产中枢

本技能将开源 **ClipForge** 完整短视频流水线与 **OmniMux 媒体执行中枢、三大数据底座及 Jev System 1 决策模型** 深度融合。
通过自然语言驱动全链路：产品画像/话题 ➔ 灵感库框架检索 ➔ Jev 三数据源匹配 ➔ 四裁判台词对抗评审 ➔ 多模态视听参考智能裁决 ➔ 视频渲染 ➔ 客观质量门禁验收。

在 DSH / OmniMux 环境下，无需常驻外部独立的 Next.js 后端服务，直接由本仓内置的 `tools/clipforge-omnimux.mjs` 脚本驱动，100% 继承 ClipForge 原生业务逻辑、提示词规范与流程框架。

---

## 十一条铁律守卫 (Eleven Hard Rules)

1. **组合与生产必须有数据源证据支持 (Evidence-First Provenance)**：
   - 严禁 Agent 凭空臆想剧情框架与台词。
   - **内容框架** 必须锚定灵感库真实作品（经过大盘播放/完播率检验的骨架）；
   - **核心道具** 必须锚定商品库真实实拍图（`reference_images`），严禁将白底商品平铺图直接塞入 `first_frame`；
   - **黄金 Hook 与 CTA** 必须锚定营销模板库与成熟技能库，并附带 Jev 决策评分回执。
2. **Jev 充当高速二元去重与创新门禁 (Anti-Repetition Gate)**：
   - 针对同一产品持续生产时，算法提取历史生成指纹（已用模板ID + 人设 + 场景Hook）；
   - Jev 在 80ms 内执行 `pass_novelty` 或 `reject_repetition` 门禁，对雷同套路严厉拦截，确保单品能衍生 100+ 绝不雷同的异构爆款。
3. **时长与分镜科学决策，严禁单镜头死扛 (Duration & Shot Splitting)**：
   - 严禁把包含冲突、反转、喷香的完整多镜头剧本硬塞给模型在单镜头 5 秒内演完；
   - 商业短视频标准时长由目标平台决定（TikTok 冲动带货 6–9 秒；小红书/抖音反差剧情 12–15 秒）；
   - 12–15 秒视频必须由成熟导演 Skill 拆分为 **3 个独立的微镜头（Shot 1 开场冲突 3s + Shot 2 动作因果 4s + Shot 3 高光定格 4s）**，再由剪辑器组装。
4. **素材参考方式由成熟 Skill 动态裁决 (Dynamic Material Arbitration)**：
   - 拒绝死板硬套规则（严禁每个 Prompt 必须套满首尾帧与视频参考）；
   - 由成熟技能依据镜头动作复杂度动态裁决：
     - 细腻神态/环境建立 ➔ 【单图首帧驱动 (Image-to-Video)】；
     - 强烈的物理状态转变（注满、变色、修复） ➔ 【首尾双帧状态锁定 (Start & End Frames)】；
     - 高难度复杂运动/暴力碰撞 ➔ 【引入参考视频 (Motion Reference)】；
     - 纯宏观光影流动 ➔ 【纯文本与机位参数驱动 (Pure Text)】。
5. **四裁判对抗评审必须前置 (Judge Panel Before Spend)**：
   - 在消耗算力生成视频之前，必须先经过「节奏官、口语官、创意官、结构官」四裁判对抗审查与台词重写；
   - Jev 毫秒级提供抓眼率、口语化判定与去重门禁，台词不通过绝不提交渲染。
6. **异步渲染与状态轮询 (Async Compose & Polling)**：
   - 媒体生成任务统一通过 OmniMux 执行中枢提交（`task_id`），后台轮询直到 `status: "succeeded"` 并下载落盘，严禁阻塞重复发起。
7. **交付前必须通过 5 大客观验收门禁 (5-Point Quality Gate Before Delivery)**：
   - 视频下载后，必须通过 `clipforge-omnimux gate` 执行自动化质检（ffprobe + 多模态视觉逐帧审计）：
     ① 严格 9:16 竖屏（高宽比 $\ge 1.70$，严禁 1:1 方形与黑边）；
     ② 三维空间物理连贯（严禁白底图融化/液化/橡皮泥拉伸）；
     ③ 真实产品特征还原（磨砂金属外壳、口红尺寸、透明视窗）；
     ④ 静默表演守卫（严禁张嘴说话露齿对白，手部无多指畸变）；
     ⑤ 运镜轨迹与动作因果合理。
8. **目视接触板验证 (Look Before You Claim)**：
   - 生成后自动抽取 3–5 关键帧生成接触板（Contact Sheet），确认画面无瑕疵后再向用户汇报成片。
9. **静默表演与语音解耦 (Decoupled Voiceover Track)**：
   - 画面中人物禁止张嘴说话，台词全部由独立 TTS 配音轨（Edge-TTS / FishAudio / WhisperX 词级对齐）驱动，保证口型绝不崩坏。
10. **诚实汇报与降级透明 (Transparent Reporting)**：
    - 若某一镜头因模型能力降级为静态平移，或门禁提出告警，必须客观陈述，绝不掩盖缺陷。
11. **产物入库沉淀复用 (Asset Persistence)**：
    - 验证通过的高质量分镜、角色设定、音频资产与生成视频，自动归档至项目资产库与历史指纹库。

---

## 路由决策矩阵 (Route First, Then Work)

| 优先级 | 用户输入类型 | 推荐路由路径 | 必填要素 | 默认配置 |
|---|---|---|---|---|
| 1 | 商品链接 / 本地商品库 ID | `clipforge-omnimux product` | 商品数据 (从商品库拉取实拍图与卖点) | 风格: 自动匹配; 目标: 带货转化; 时长: 12-15s (三分镜) |
| 2 | 已有完整口播脚本或分镜 | `clipforge-omnimux import` | 分镜文本 | 走四裁判对抗审查 ➔ 素材裁决 ➔ 渲染合成 |
| 3 | 泛主题 / 创意灵感话题 | `clipforge-omnimux create` | 核心主题 | 从灵感库检索 Top 真实作品框架 ➔ 三数据源装配 |
| 4 | 真实生活/反常识测评诉求 | `clipforge-omnimux drama` | 冲突核心 | 匹配「痛点反转」或「硬核暴力实测」模板 |

---

## 核心命令行驱动器：`tools/clipforge-omnimux.mjs`

在当前工作区中，直接通过 Node 驱动替代原生 clipforge 后端：

```bash
# 1. 基于商品库与灵感库全自动生产视频（含三数据源证据链 + Jev 评分 + 5项质检门禁）
node tools/clipforge-omnimux.mjs product --product-id prd_29ef2448 --goal direct_conversion

# 2. 运行 Jev 赋能的四裁判对抗审查
node tools/clipforge-omnimux.mjs judge --script-file my-script.json

# 3. 驱动 OmniMux 中枢媒体模型（MiniMax H3 / Seedance 2.5）按分镜合成
node tools/clipforge-omnimux.mjs compose --project <projectId> --model minimax-h3@video_pro

# 4. 执行 5 大客观商用级质量门禁审计
node tools/clipforge-omnimux.mjs gate --video <videoPath> --strict

# 5. 抽取关键帧接触板
node tools/clipforge-omnimux.mjs sheet --video <videoPath>
```
