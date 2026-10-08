# 消化笔记

> **历史定位边界（2026-10-08）**：本文的社媒全链路、短剧首发、矩阵增长和旧“唯一定位”属于所记日期的研究或决策；产品定位部分已由[角色生成与视频复刻](../../docs/contracts/product-positioning.md)替代。原历史正文、证据与技术分工保留，不据此恢复旧产品路线、执行旧请求示例或宣称当前功能已交付。


对照 `SOURCES.md`。只把过两关的主张写进主文档：同一事实在两处一手文本重复，或能预测官方对新问题会怎么答。

## 材料怎么过筛

| 主张 | 过关数 | 处理 |
|---|---|---|
| OmniMux 对外是「面向 AI Agent 的社交媒体全链路 API」，制作 + 编排，按调用付费 | 官网 + llms.txt + brand v1.5+ + docs 首页 | 主文档 |
| 仓本体是 QuantumNous/new-api 的维护 fork，产品层另写 | FORK.md + AGENTS.md + 根 README 仍是 New API | 主文档，标分层 |
| 用户 CLI 不管 admin；密钥只走 copy/apply/exec | cli/AGENTS.md + setup.md + ERROR_CONTRACT + no-admin 测试 | 主文档 |
| 方法论 skill 扁平安装到 `.agents/skills/<id>`，默认 link | skill/README + skill.js + setup.md + layout 测试 | 主文档 |
| 视频 skill 是导演/合同，不是出片网关 | 各 SKILL.md「不得强制 workflow」+ OMNIMUX.md「明确意图才 POST」 | 主文档 |
| 出片客户入口是 `POST/GET /v1/video/generations` | OMNIMUX.md + relay.json + video-task.mdx + Seedance changelog | 主文档 |
| Gxgen/RunningHub 是网关渠道 type 61，不是插件 dest | AGENTS.md + FORK_CUSTOMIZATIONS + runninghub skill | 主文档硬边界 |
| 脚本/分镜 schema 以商品、卖点、CTA 为 required | output.schema / storyboard.schema / ugc pack | 主文档：对齐形，不抄语义 |
| 本仓 shots.json 已借用 planning 的 `shot_id` / 时码 / `scene_purpose` / `visual_description` | fixtures + domain.js + planning shot.schema | 主文档 worked example |
| 社交发布 `/api/social/v1` 不是 Drama Center | social.js + docs publishing + 本仓 tiktok-drama-center | 主文档 reject |
| `video-creation/SKILL.md` 仍写 `generate-video` / `sceneOptionId` | 只在该 SKILL.md | 主文档标矛盾：以 OMNIMUX.md 为准 |

## 矛盾

1. **产品句 vs 根 README**  
   brand / 官网写社交媒体全链路 API。根 README 仍是上游 New API 网关介绍。两边都是仓内一手。主文档采用：对外产品看 brand 与官网；实现脊柱看 new-api fork + CLI + skill。

2. **OpenAPI poll 形 vs 运行时 poll 形**  
   `relay.json` / `dto/video.go` 写瘦 `VideoTaskResponse`（`task_id` + `status` + `url`），状态示例还有 `succeeded`。文档仓 video-task 写 `queued|in_progress|completed|failed`，并说结果字段随模型变。本机 relay 实现还会吐 `TaskResponse` 包一层 `data.status=SUCCESS|IN_PROGRESS`。主文档两边都留：提交认 `task_id`；完成认产物 URL；状态枚举不要写死一种。

3. **SKILL.md 工具名 vs OMNIMUX.md 绑定**  
   `video-creation/SKILL.md` 仍出现 `generate-video`、`sceneOptionId`、`r2_key`（迁入残留）。同目录 `OMNIMUX.md` 写死 `POST /v1/video/generations`，并禁止发明 Gxgen/editor 工具名。主文档：插件跟 OMNIMUX.md。

4. **两套分镜合同**  
   `video-storyboard` 是轻量表（`shot/duration/purpose/visual/...`）加另一份 JSON（`title/hook/scenes`）。`video-storyboard-planning` 是重 schema（`shot_id/start_time/end_time/...`）。planning 自己说不要和轻量表叠成重复输出。主文档：开发状态机对 planning schema；产品 Agent 一次只装/只用一个。

5. **「Skill 即能力」vs「Skill 不是运行时」**  
   官网说内容制作以 API 与 Skill 供 Agent 调用。每个业务 SKILL.md 又写 `codeExecutionCore: false`，不得强制 workflow。主文档：Skill 教 Agent 怎么想和怎么交卷；副作用走 CLI / `/v1`。

## 大纲（主文档）

1. 这篇文档回答什么  
2. 先拆开四层  
3. 对外产品句（以及不是什么）  
4. 网关与出片 HTTP  
5. CLI、两套凭证、Agent RPC  
6. Skill 包装与安装  
7. 视频方法论管线与字段交接  
8. 电商偏见：对齐什么、改写什么  
9. 和本仓 `omnimux` / `omnimux-drama` 怎么对号  
10. 插件开发逐条对照  
11. 硬边界  
12. 仍不确定的事  
13. 延伸阅读  

每节只引用上面过关的来源。
