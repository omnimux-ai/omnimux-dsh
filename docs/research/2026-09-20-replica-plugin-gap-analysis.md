# 复刻工坊插件 · 现有能力盘点与差距分析

日期：2026-09-20 ｜ 调查方式：主会话直查（三次子代理委派均异常中断，改为本机证据直读）
证据来源：`docs/contracts/plugin-agent-tools-inventory.md`、`docs/contracts/model-capabilities-matrix.md`、`docs/contracts/hub.md`、各插件 README、`plugins/omnimux/src/media/vendors/`

## 结论摘要

用户 7 步流水线中，**6 步已有现成 Agent Tool / Seam 可直接调用**，新插件确实可以做成「纯前端整合壳 + 一个轻量领域服务（复刻任务状态机）」。唯一需要新建的是：①复刻任务编排与产物血缘；②「目标账号」资产的持续管理界面（inspiration 的对标账号已有雏形，需决策复用还是新建）。

## 逐步对照

| # | 流水线步骤 | 现有能力 | 调用入口 | 差距 |
|---|---|---|---|---|
| 1 | 账号/作品链接提取视频 | `omnimux-social-harvest`：9 平台（TikTok/IG/Pinterest/YouTube/X/FB/小红书/抖音/LinkedIn），`harvest_tiktok_user`（账号→作品列表）、`harvest_tiktok_search`；`omnimux-inspiration`：`inspiration_create`/`omnimux_social_data` 作品链接解析（含 TikTok/YouTube/X 公共回退）；对标账号：`inspiration_rival_accounts` / `inspiration_rival_posts` | Agent Tool | ✅ 无差距。缺「一键把作品视频物化进资产库」的胶水 |
| 2 | 提取视频首帧图 | `omnimux-video`：`video_process(video_thumbnail_extract)`（本地 ffmpeg，支持 URL 直输） | `video_process` Tool / `videoProcess` seam | ✅ 无差距 |
| 3 | 生成新角色（文生图） | Hub `imageGenerate` seam + `omnimux_image_submit`；工作流生图节点 | Tool / seam | ✅ 无差距。产物需写入资产库「角色」类目（`assets_create`/`assets_upload` 已有） |
| 4 | 角色+参考图→新角色图 | `imageGenerate` 支持 image 输入；工作流多参考图节点受 node-input-submission 契约保护（多模态参考模式） | 同上 | ✅ 基本无差距；多参考具体模型能力按所选通道官方文档核验（契约：model-api-authority） |
| 5 | 选择复刻视频/链接 | 资产库查询：`assets_list`/`assets_search`/`assets_get`；灵感库与对标帖子查询 | Tool | ✅ 无差距（纯选择器 UI） |
| 6 | 提取视频音频 | `omnimux-video`：`video_process(audio_extract)`（mp3/m4a） | 同 #2 | ✅ 无差距 |
| 7 | 音频+视频+prompt→新视频 | Hub `videoGenerate` seam 的 `digital_human`（数字人/对口型，图/视频+音频驱动，`audioTrack` 为驱动音频，prompt optional）；适配档案 `videoDigitalHuman`；提交入口 `omnimux_video_submit` | Tool / seam | ⚠️ 能力缝已存在；具体可用模型（如 kling-avatar）取决于通道配置与上架状态（listed 需 verified+live 证据），属配置运营项，非开发缺口 |

## 现成但需注意的关联能力

- 解构三件套已存在：`video_analyze`（场景/运镜/色彩）、`video_reverse_prompt`（逆向提示词）、`video_breakdown_analyze`（分镜拆解+侧边栏预览）——复刻流水线可直接白嫖「解构」环节。
- 灵感库已有「对标账号工作台」雏形（`inspiration_rival_*` 7 个工具）——新插件的「目标账号」与其高度重叠，**建议复用其数据源，新插件只做复刻向的封装**。
- 下游闭环已有：产物→`omnimux-clip` 剪辑、→`omnimux-publish` 发布。

## 新插件必须自建的部分（最小集）

1. **复刻任务领域服务**：任务状态机（素材→角色→合成→产物）、步骤产物引用、血缘记录（哪条链接→哪个角色→哪个产物），落盘自有 store（边界：不写其他插件的盘）。
2. **复刻工作台 UI**：目标账号管理、作品网格、三步流水线、任务列表、资产选择器（调 `assets_*`）。
3. **胶水逻辑**：采集产物/首帧/音频/角色图自动 `assets_upload` 进资产库并互相关联。

## 边界约束（不可碰）

- 不实现第二个 OmniMux HTTP 客户端、不碰密钥；生成一律走 `ctx.get` seam / `omnimux_*` 工具。
- 页面挂 workbench Tabs，配置用官方 Settings seats；不 `claimProductStage`。
- UI 遵循纯黑+极光紫设计体系（`design.md`、`docs/templates/demo-page-template.html`）。

## 未覆盖范围

- 未逐模型核验「多参考图生图」「digital_human」在当前通道的 listed 状态（需 `pnpm verify:model-contracts` + 配置侧确认）。
- 未验证抖音作品链接在免登录态下的解析成功率（HARVEST_AUTH 引导登录的交互需原型覆盖）。
