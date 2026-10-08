# OmniMux：短剧 Agent 插件该拿什么

> **历史定位边界（2026-10-08）**：本文的社媒全链路、短剧首发、矩阵增长和旧“唯一定位”属于所记日期的研究或决策；产品定位部分已由[角色生成与视频复刻](../../docs/contracts/product-positioning.md)替代。原历史正文、证据与技术分工保留，不据此恢复旧产品路线、执行旧请求示例或宣称当前功能已交付。


研究日期：2026-08-14。  
对照：`/Users/x/Desktop/Project/OmniMux`（`@omnimux/cli` 0.3.0）+ sibling `OmniMux-docs`。  
消化过程见 [NOTES.md](NOTES.md)，来源表见 [SOURCES.md](SOURCES.md)。  
本文件只写开发参考。不拷 skill 正文，不在本会话执行 `omnimux skill install`，不出片。

现行用语：`omnimux` 是**执行中枢**，不是网关。词表与 I/O 见 [docs/contracts/hub.md](../../docs/contracts/hub.md)。下文「网关」只指 OmniMux 云 HTTP（new-api fork），不是这个插件。

## 这篇文档回答什么

你们已经定了：核心业务是 OmniMux；短剧只是接到 dsh 上的一层领域工具。上一份 [dsh 站位](../dsh/POSITIONING.md) 把公式写成：

```text
Agent = OmniMux（灵魂面） + dsh（借来的 harness）
```

这份文档回答下一问：**灵魂面具体是什么，插件该调哪一层，字段对齐哪份合同。**

结论先说：

1. **OmniMux 不是短剧运行时。** 它是 new-api 维护 fork 上的网关产品，外加用户级 CLI 和一套电商口味很重的方法论 skill。
2. **插件分两包。** `omnimux` 接网关（模型 + 图 + 视频 job + 密钥）。`omnimux-drama` 管 `series/` 磁盘。方法论 skill 给产品 Agent 以后按正常方式装，不要 vendoring 进插件。
3. **出片只认一条客户入口：** `POST /v1/video/generations`，再 poll `GET /v1/video/generations/{task_id}`。Gxgen / RunningHub 是网关内部渠道，不是插件 dest。
4. **脚本/分镜 schema 能抄形，不能抄语义。** required 字段是商品、卖点、CTA。短剧要把它们改写成集、角色、悬念；本仓 `shots.json` 已经在借 planning 的镜头形。

## 先拆开四层

不要把「OmniMux」当成一个词到处套。仓里至少有四层，插件各用一层：

| 层 | 是什么 | 真源 | 短剧插件怎么用 |
|---|---|---|---|
| 产品句 | 面向 AI Agent 的社交媒体全链路 API。制作 + 多平台编排。按调用付费，无订阅。 | 官网、`omnimux.ai/llms.txt`、`docs/brand/` v1.5+ | 对外解释「为什么接 OmniMux」时用这句。不要说自己是短剧 SaaS。 |
| 网关 | QuantumNous/new-api 的维护 fork。Go relay、计费、OpenAI 兼容 `/v1`。官方实例 `https://omnimux.ai`，API `https://api.omnimux.ai`。 | `FORK.md`、`AGENTS.md`、`dto/`、`docs/openapi/relay.json` | 聊天、生图、生视频都走这里。不要 fork 这份仓来写系列状态机。 |
| 用户 CLI | `@omnimux/cli`。查模型/定价/余额，管自己的 token，装 skill。**没有 admin。** | `cli/AGENTS.md`、`cli/skill/omnimux/` | 密钥只走 `tokens copy/apply/exec`。Agent 分支走 JSON `ok` / `error.type`。 |
| 方法论 skill | 扁平目录 `cli/skill/<id>/`。`codeExecutionCore: false`。教 Agent 怎么写脚本/分镜/prompt。 | `cli/skill/README.md`、`manifest.json`、各 `SKILL.md` | 开发期 `index` 真源。产品 Agent 再用 `omnimux skill install --project`。 |

根 `README.md` 仍是上游 New API 文案。产品身份以 brand 与官网为准，不要从根 README 推断 OmniMux 是什么。

## 对外产品句（以及不是什么）

官网和 `llms.txt` 把受众写死了：给你已经在用的 Agent（Claude / ChatGPT / Codex / Cursor / MCP）一双手，不是再做一个给人点的调度台。

能从两处以上一手源重复的承诺：

- 一个 API 做内容制作和多平台编排。
- 交付形态：REST、本地 CLI、Agent Skill、MCP。
- 全球渠道：X、LinkedIn、YouTube、Instagram、TikTok、Threads。公开矩阵**不包含**中国大陆境内平台。
- 免费安装，按调用付费，不为席位订阅。
- **不是**端到端自动内容工厂。方向盘留在用户/Agent。

对短剧插件的含义：

- 接 OmniMux，是为了模型和媒体执行，以及以后可选的全球社媒发布。
- 不要在插件介绍里写「OmniMux 短剧版」。
- TikTok Drama Center 入驻/传片/结算走本仓 `tiktok-drama-center`，不走 OmniMux 社交 API。

## 网关与出片 HTTP

### 客户入口

技能绑定、OpenAPI、文档仓、Seedance changelog 对齐同一条路径：

```http
POST https://api.omnimux.ai/v1/video/generations
Authorization: Bearer sk-…
Content-Type: application/json

GET  https://api.omnimux.ai/v1/video/generations/{task_id}
Authorization: Bearer sk-…
```

提交体以 `dto/video.go` 的 `VideoRequest` 为合同：

| 字段 | 用途 |
|---|---|
| `model` | 线上目录 id。用 `omnimux models` / `omnimux pricing` 现查，不要发明。 |
| `prompt` | 文本。图生视频可加 `image`（URL 或 base64）。 |
| `duration` | 秒。ApiMart 类渠道按秒计费。 |
| `width` / `height` / `fps` / `seed` / `n` | 可选。 |
| `metadata` | 厂商附加（负向、分辨率、风格）。插件先走统一 JSON，不要直接打 Kling/即梦原生 URL。 |

运维备忘录里的可运行例子（`docs/ops/apimart-media-onboard-zh.md`）：

```json
{
  "model": "seedance-2-0-fast",
  "prompt": "...",
  "duration": 4,
  "resolution": "720p"
}
```

文档仓 2026-08-07 条目：`seedance-2-5` 同样走这两条路径。接入前以线上定价的精确 ID 为准。

静帧：`POST /v1/images/generations`。聊天脑：`POST /v1/chat/completions`。三者共用同一把用户 API token。

### 完成证据

`task_id` 只表示已提交。`video-creation/OMNIMUX.md` 写死：要产物 URL（`videoUrls` / `videoUrl` / `url` / `result_url` 等，随模型变）或明确失败，才能说成片完成。排队/生成中只能报进度。

文档仓 poll 页给的状态词是 `queued` / `in_progress` / `completed` / `failed`。OpenAPI 瘦响应和运行时 `TaskResponse` 包一层的内部状态（`SUCCESS` / `IN_PROGRESS`）并不完全同形。插件不要只解析一种 JSON；先取 `task_id`，再在常见字段里找 URL。

文档 FAQ 另有一条：这条 poll **不是** OpenAI Videos 的 `GET /v1/videos/{id}/content`。

### 渠道类型（插件不直接碰）

网关内部用数字渠道对接上游。和视频相关、开发时容易绕错的：

| type | 名字 | 插件该不该看见 |
|---|---|---|
| 50 / 51 / 54 / 55 | Kling / 即梦 / Doubao 视频 / Sora | 不该。只看见目录 model id。 |
| **61** | **GxgenAI / RunningHub** | **渠道，不是 dest。** 禁止把 Gxgen CLI、editor tool、RH OpenAPI 写进插件。 |
| 63 | ApiMart（公开 Kling / Seedance / MJ / Suno） | 不该。只看见 `kling-v2-6`、`seedance-2-0` 这类目录名。 |

`AGENTS.md` 对 type 61 的硬规则：只走 TaskAdaptor + `/v1/video/generations`。禁止 type 58 chat、`*-query` 模型、客户端 `precharge_seconds`。

本仓 `AGENTS.md` 另定：视频执行经 `omnimux` → `aigc-provider-runtime-kit`，不要再写第二套网关。运行时可以是 kit 调 OmniMux `/v1`，也可以是 kit 调其它厂商；**密钥仍经 OmniMux token**。不要为了省事直接把 `sk-` 写进 job 配置。

## CLI、两套凭证、Agent RPC

### 两套凭证，不要混

文档 FAQ 和 CLI setup 一致：

| 凭证 | 用途 | 存哪 | 插件怎么碰 |
|---|---|---|---|
| 系统 access token | `omnimux login` 之后调控制台用户 API（models、tokens、balance、社交） | Keychain 或 `~/.config/omnimux/secrets.json`（0600）。**不进** `config.json`。 | 只跑 CLI。不要读 secrets 文件。 |
| 用户 API token `sk-…` | 调 `/v1/*` 中继 | 创建后只在内存里出现一次 | `tokens copy` / `apply` / `exec`。占位符必须是 `__OMNIMUX_TOKEN_{id}__`。 |

CLI 默认连 `https://omnimux.ai`。中继 base 是 `https://api.omnimux.ai/v1`。很多 OpenAI SDK 需要带 `/v1` 的后缀。

### Agent 只认稳定字段

`cli/docs/ERROR_CONTRACT.md`：`contract_version: 1`。成功 stdout `{ ok, data, meta }`，失败 stderr `{ ok:false, error:{ type, subtype, ... } }`。按 `ok` / `error.type` / 退出码分支，不要解析 `message` 文本。

退出码：`0` 成功，`1` api，`2` 配置/鉴权，`3` 用法，`4` 网络，`5` 内部，`10` 要人确认。高风险写操作必须先拿到人的明确批准，再带 `--yes`。禁止静默加 `--yes`。

`tokens exec` 是例外：子进程 stdout/stderr 消毒后原样转发，并传播子进程退出码。默认超时 300 秒，视频要加大，例如 `--timeout=600`。`--timeout=0` 会被拒。

登录是两轮：`omnimux login --no-wait` 拿到 URL 和 `flow_id`，用户授权后再 `omnimux login --resume <flow_id>`。同一轮里不要空转轮询。

## Skill 包装与安装

### 包装形

`cli/skill/README.md`：一个目录 = 一个 Agent 可发现的 `name`。`manifest.json` 列 17 个 id：1 个共享 `omnimux` + 16 个 business。没有嵌套 `packs/`。layout 测试禁止 `scripts/` 和 Gxgen `relatedTools:`。

典型业务包：

| 文件 | 角色 |
|---|---|
| `SKILL.md` | 唯一运行时入口。YAML `name` + `description` 供发现。 |
| `OMNIMUX.md` | 只绑 CLI / `/v1`。方法论仍在 SKILL.md。 |
| `PUBLICATION-GOVERNANCE.md` | 公开边界。部分文件仍残留 Gxgen 目录名，以 `manifest.json` 为准。 |
| `schemas/` | 参考合同，CLI **不校验**。 |
| `docs/` `prompts/` `templates/` `examples/` `config/` `references/` | 按需读。 |

全部业务包声明 `publicationStatus: public`、`codeExecutionCore: false`。它们是软约束，不是 workflow 引擎。

`omnimux skill read <id>` 只读包装里的 `SKILL.md`，不读 `OMNIMUX.md` 和 schema。装完后 Agent 自己打开兄弟文件。

### 安装合同

```text
包装真源:  <cli-package>/skill/<id>/SKILL.md
Agent 面:  ~/.agents/skills/<id>  或  <repo>/.agents/skills/<id>
登记:      ~/.config/omnimux/skill-targets.json  (schema 2，一行一个 skill_id)
```

```bash
# 需要 skill 树时用 npm 包，不要用未内嵌 skill/ 的纯二进制
npm install -g @omnimux/cli
omnimux login

# 短剧相关子集（产品 Agent 就绪后再跑；本会话不执行）
omnimux skill install --project \
  --only=omnimux,video-script-creation,video-analysis,video-storyboard,video-storyboard-planning,video-prompt-generation,video-creation,image-recreation,recreate-viral-video

omnimux skill status
```

默认 `--mode=link`：每个目标是指向包装目录的符号链接。`--mode=copy` 才写 `.omnimux-skill-meta.json`。旧版 0.2.6 整树安装（一个 `omnimux` 指到整个 `skill/` 或带 `packs/`）会在重装时拆成扁平兄弟目录。

硬限制：`resolvePackageSkillRoot` 在二进制发行里找不到 `skill/` 会失败。要从 npm 或设 `OMNIMUX_SKILL_SOURCE`。根目录 `skills-lock.json` 只锁 `newapi` 管理 skill，不锁这 17 个 CLI skill。

开发期对照真源即可：

```text
/Users/x/Desktop/Project/OmniMux/cli/skill/<id>/SKILL.md
```

不要把 skill 正文拷进 `omnimux-dsh` 或 `short-drama-router`。

## 视频方法论管线与字段交接

dest id 是本仓路由器的索引名，不是 OmniMux 目录 id。目录 id 是文件夹名。

```text
分析 ──► 脚本 ──► 分镜（两份里选一份）──► prompt ──► 成片（明确要求才走）
              │
              └── 可选：image-recreation（定妆 / Style Bible，不是分集）
```

| dest | 目录 id | 激活 | 先读合同 | 短剧对齐 |
|---|---|---|---|---|
| `omnimux-video-analysis` | `video-analysis` | 拆参考片 / 口播 / 节奏 | `schemas/analysis-report.schema.json` | `evidence_level`；`toc` / `scene_breakdown` 当镜头种子。`url-only` 不能声称已看片。 |
| `omnimux-video-script` | `video-script-creation` | 写/改脚本、hook、对白 | `schemas/output.schema.json` | `script.scenes[]` 的 `scene_id/duration/segment/task/visual/voiceover`。口播节奏看 `docs/talking-head-pacing.md`。 |
| `omnimux-storyboard` | `video-storyboard` | 轻量镜头表 | SKILL 列 + `references/output-contract.md` | `shot,duration,purpose,visual,camera_action,voice_or_dialogue,sound,transition,prompt_note`；`interClipBoundary` / `audioRouting` 对多镜有用。 |
| `omnimux-storyboard-planning` | `video-storyboard-planning` | 重规划、质检、逐镜 prompt | `schemas/shot.schema.json` + `storyboard.schema.json` | **开发状态机优先对这套。** required：`shot_id,start_time,end_time,duration,scene_purpose,visual_description`。 |
| `omnimux-video-prompt` | `video-prompt-generation` | 已有脚本/分镜 → 模型 prompt 包 | `schemas/prompt-output.schema.json` | `target_model`: `generic\|sora\|veo\|seedance` 是**写法**，不是第二套 API。输出 `optimized_prompt` + `per_shot_prompts` + `negative_constraints`。 |
| `omnimux-video-creation` | `video-creation` | 明确要成片 / 图生视频 / 参考生视频 | SKILL 模式表 + `OMNIMUX.md` | 只有 `generate-video` / i2v / r2v 模式才要求产物。brief / prompt-only / 诊断不要催生成。 |
| `omnimux-image-recreation` | `image-recreation` | 角色/场景静帧一致性 | `schemas/style-bible.schema.json` | `subject_preservation_rules` 可当角色定妆规则。电商套图走 `not-drama`。 |

相邻但不进短剧默认安装：

- `recreate-viral-video`：只借「可迁移结构 vs 必须替换」。不要当系列圣经。
- `ugc-commerce-video-skill`：**不要当脊柱。** 它把分析/脚本/分镜/prompt 收成一个转化包，和「拆开合同」对着干。
- 图文/商品套图/A+/信息图：不是分集生产。

交接时一次只用一个分镜 dest。planning 自己写了：不要和轻量表叠成两份镜头表。

`video-creation` 的 talking-head 合同对短剧有用的几条：人脸参考跨镜复用；默认不烧字幕；不要把独白静默剪短去塞进单 take；OmniMux **没有**一键多 take 拼接 SaaS。多镜 = 多个 `/v1` 任务，或一条不超过模型上限的长 prompt。要写明走哪条。

## 电商偏见：对齐什么，改写什么

脚本输出 schema 的 required 是 `product_understanding`、`creative_angles`（带 `conversion_logic`）、`recommended_direction`、`script`（带 `cta`、`main_selling_point`）。planning 的 `storyboard.project` 也要求 `core_selling_points`。这些是商品短视频的合同，不是宫廷反转剧的合同。

对齐（保留形）：

- 镜头有稳定 id、时码、时长、目的、可执行画面。
- 阶段拆开：分析 ≠ 脚本 ≠ 分镜 ≠ prompt ≠ 成片。
- 证据分级；链接不等于看过片。
- 完成要有产物或明确 blocker。

改写（不要当 required）：

| OmniMux 字段 | 短剧磁盘里换成 |
|---|---|
| `product` / `product_name` | `series.yaml` 的 `id` / `title` / `logline` |
| `core_selling_point` | 本集冲突或人物欲望 |
| `cta` | 集末悬念 / 下一集钩子 |
| `conversion_logic` | 为什么观众会划到下一集 |
| `selling_point`（逐镜） | `scene_purpose`（本仓已经用这个名字） |
| 商品主体一致性 | `bible.yaml` 角色 / 场景 `confirmed` |

本仓样例已经在做这件事。`fixtures/demo-series/series/shots.json` 的镜头行直接用了 planning 的 required 名，并加了短剧自己的字段：

```json
{
  "shot_id": "e01-s01",
  "episode_id": "e01",
  "start_time": 0,
  "end_time": 4,
  "duration": 4,
  "scene_purpose": "开场钩子：夜城墙上对刀",
  "visual_description": "9:16 近景。陈璃持刀，火把光切过半张脸。",
  "character_ids": ["chen-li"],
  "status": "confirmed"
}
```

`omnimux-drama` 的硬门：`status` 为 `generating` 或 `ready` 时，`character_ids` 里每个 id 必须在 `bible.yaml` 里 `confirmed: true`。这是 Jellyfish 式「确认后才生成」，不是 OmniMux schema 自带的。不要倒过去改 OmniMux skill 来表达这个门。它属于 `omnimux-drama`。

## 和本仓两包怎么对号

[dsh 站位](../dsh/POSITIONING.md) 已经拆过包。对照今天的 OmniMux 真源，职责可以钉死：

| 包 | 现在 | 下一阶段该接 OmniMux 的哪一层 |
|---|---|---|
| `omnimux` | Phase A：`apply()` 空挂载，证明 bundle 能装 | custom provider → `https://api.omnimux.ai/v1`；图/视频 job 走 `/v1/images|video/generations`；密钥只接受 `__OMNIMUX_TOKEN_*__` 或 `tokens exec`；执行器复用 `aigc-provider-runtime-kit`。**不要**放 `series/`，**不要**放 Drama Center。 |
| `omnimux-drama` | `drama_project_status` + `series/` 读写 | 继续做领域对象。分镜表形继续对 `shot.schema.json`。写脚本/拆镜时让产品 Agent 去读已安装的 sibling skill，不要在插件里复制 SKILL.md。 |
| 产品 Agent 工作区 | 尚未 `skill install` | 就绪后 `omnimux skill install --project --only=...`。开发 Agent 继续读 OmniMux 真源。 |

官方社区看懂的是第一包：「不 fork harness，把 OmniMux 网关接到 dsh」。短剧包是 worked example，不要当 Discussions 主标题。

## 插件开发逐条对照

| 开发卡住的地方 | 不要做 | 做 |
|---|---|---|
| 模型从哪来 | 写死 DeepSeek；fork `llm-deepseek` | OmniMux 当一条可切换的 OpenAI-compat 路由；`omnimux models` 现查 |
| 密钥怎么进 job | 聊天里贴 `sk-`；读 `.env` | `omnimux tokens exec <id> --timeout=600 -- <cmd>` |
| 镜头状态机 | 把 ugc pack 的 hook→卖点→CTA 当脊柱 | `series/` + 角色确认门；镜头字段对 planning schema |
| 脚本模块字段 | 要求 `product_understanding` | 用 `script.scenes` 的形，语义改成集/对白/悬念 |
| 分镜两份合同 | 同一轮输出两张表 | 轻量表给人口述；重 schema 给磁盘 `shots.json` |
| 模型 prompt | 从一句题材直接写 Seedance prompt | 先有脚本或镜头，再走 `video-prompt-generation`；`seedance` 只是写法枚举 |
| 真正出片 | 调 Gxgen / hexiaochun / 自造 list-select-init-submit | `omnimux` job → kit → `POST /v1/video/generations`；`task_id` 先写入 `shots[].job_id` |
| 成片完成 | 看见 task id 就标 `ready` | 有产物 URL 才 `ready`；失败标 `failed`；未确认角色不得进入 `generating` |
| 参考片拆解 | 只丢链接就写「本片结构是…」 | 标 `evidence_level`；`url-only` 只给框架 |
| 角色一致性 | 像素级抄脸；或纯文字人设撑全集 | `image-recreation` 的 Style Bible 形 + 本仓 `confirmed` |
| 发布到 TikTok | `omnimux social` / `/api/social/v1/posts` | Drama Center 走 `tiktok-drama-center`。社交 API 最多以后发预告，不是原剧入库 |
| skill 更新 | 把 skill 正文 fork 进插件 | link 安装；CLI `skill update`；本仓只留 dest 指针 |

## 硬边界

- 不 fork OmniMux 核心路径来写短剧功能。网关改动有独立的 core-change 闸。
- 不把 Gxgen、`generate-video` 半流程工具、canvas 节点、`r2_key` 写进 `omnimux`。以 `OMNIMUX.md` 为准。
- 不把方法论 skill 拷进本仓。`short-drama-router` 只存索引。
- 不在 `omnimux` 里做 Drama Center 登录、上传、结算。
- 不把 `/api/social/v1` 或社媒数据模型（`tiktok-video` 等）当成短剧发行。
- 用户 CLI 没有 admin。渠道、ModelRatio、上架模型走 `newapi` skill / 人类，插件不要去碰。
- AGPL：`@omnimux/cli` 声明 AGPL-3.0。插件自己保持 MIT 树外包；不要把 CLI 源码合进 dsh 包。
- 付费/长任务先确认。CLI 退出码 10 必须停下来问人。

## 仍不确定的事

- 公开文档没有单独的 `/en/cli`、`/en/skills` 页（2026-08-14 抓取 404）。安装与 skill 合同以本机 `cli/` 为准。
- poll 响应的权威 JSON 形：文档、OpenAPI、运行时 `TaskResponse` 三套并存。接入时要对着一次真实任务打日志，不要只信其中一份。
- `video-creation/SKILL.md` 里的 Gxgen 期工具名会不会删掉，本轮没有改 OmniMux 仓，不知道时间表。
- 社交发布默认关（`SOCIAL_OPS_ENABLED`）。短剧 v1 不依赖它是否打开。
- Seedance 多模态参考（图/视频/音频）的请求字段以线上模型页为准；运维备忘录和 `metadata` 都能带附加参数，插件不要提前写死一套。

## 延伸阅读

开发 Agent 先读[现行产品定位](../../docs/contracts/product-positioning.md)和当前领域合同；以下三份仅按需查历史背景：

1. 本文件（站位 + 插件对照）。
2. `OmniMux/cli/skill/omnimux/docs/setup.md` + `actions-exec.md`（怎么装、怎么安全调 `/v1`）。
3. `OmniMux/cli/skill/video-storyboard-planning/schemas/shot.schema.json`（镜头磁盘对哪几个字段）。

然后按卡住的点打开 dest 真源，走 `short-drama-router`：

- 脚本合同：`cli/skill/video-script-creation/schemas/output.schema.json`
- 成片绑定：`cli/skill/video-creation/OMNIMUX.md`
- 官方 poll：`OmniMux-docs/en/api-reference/tasks/video-task.mdx`
- harness 为什么不 fork：`research/dsh/EXTENSION.md`

产品 Agent 要挂方法论时，用正常安装，不要在研究会话里替用户跑创作。
