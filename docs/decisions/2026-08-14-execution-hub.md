---
title: "决策：执行中枢与领域插件"
id: "decision-execution-hub"
type: "decision"
status: "accepted"
authority: "L2"
date: "2026-08-14"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# 决策：执行中枢与领域插件

> **历史定位边界（2026-10-08）**：本文的社媒全链路、短剧首发、矩阵增长和旧“唯一定位”属于所记日期的研究或决策；产品定位部分已由[角色生成与视频复刻](../contracts/product-positioning.md)替代。原历史正文、证据与技术分工保留，不据此恢复旧产品路线、执行旧请求示例或宣称当前功能已交付。


日期：2026-08-14。  
状态：**站位已确认。** 中性缝 `videoGenerate` 与 `needs-provider` 已于 T8 落地。其余差距见文末。  
补丁：[2026-08-16 中枢拥有全部核心能力](2026-08-16-hub-owns-core.md) — 产品外壳 / 登录 / 模型路由也进 `dsh-omnimux`，禁止再拆兄弟包。
补丁：[2026-08-16 执行中枢 I/O 与落地设施](2026-08-16-hub-io-and-facilities.md) — 规范用语是执行中枢，不是网关；垂直包只经中枢 I/O。词表真源 [docs/contracts/hub.md](../contracts/hub.md)。
性质：架构决策 + 讨论审计。本文件是这次讨论的可追溯真源，不替代 `docs/capabilities.md` 的能力表。

依据：同日会话（设计方向 → 两包关系 → 官方缝 vs 仓规 → 开源获客 → 多垂直复用）+ [POSITIONING.md](../../research/dsh/POSITIONING.md) + [EXTENSION.md](../../research/dsh/EXTENSION.md) + [PLUGIN.md](../../research/omnimux/PLUGIN.md) + 活树 `plugins/`。

## 结论

`dsh-omnimux` 是 dsh 上的 **执行中枢**（模型 / 图 / 视频，以及以后只有 OmniMux 云才有的工具）。默认 provider 是 OmniMux，第三方兼容 API 也配在这个包里。

`omnimux-drama` 以及以后的电商视频、电商设计等，是 **领域插件**。它们消费中枢挂上的中性缝，自己不配密钥、不维护第二套 HTTP 客户端。

短剧包不依赖中枢才能存在。没装中枢时，领域读写照常，出片走 stub 或报 `needs-provider`。装上并配好，所有领域包一起打通。

OmniMux 云提供 `/v1` 与官方独有 HTTP。`dsh-omnimux` 是执行中枢：把这些收成 dsh 可调用的缝和工具。不要把中枢叫网关。

## 背景：讨论从哪来

讨论开始时文件夹还叫 `tiktokdramacenter`，像 Drama Center 产品仓。同日稍后已改名为 `omnimux-dsh`。活树是树外两个 dsh bundle。当时先对齐了这些已有站位：

- OmniMux 是产品；dsh 是借来的 harness，不 fork、不重发。
- 分发单位是 `dsh plugin add`。官方没有插件市场。
- 两个包、无 npm 互引：`omnimux-drama` 只有 `yaml`；`dsh-omnimux` 不认 `series/`。
- 产品真源是磁盘 `series/`，不是 session。

随后问题收成四句：

1. 两个插件是不是 dsh 架构必须拆的？
2. drama 是不是必须经 omnimux 才能用？
3. OmniMux skill 是否已经够了，还要独立插件做什么？
4. 以后还有电商等垂直包时，API 配在哪？

## 讨论里钉死的事实

### dsh 官方有什么，没有什么

官方（architecture + EXTENSION）允许：

- profile 上平级叠多个 bundle
- 插件 `ctx.tools.register`、`ctx.llm.registerAdapter`
- capability seam：接口 + provider + consumer；换一个 provider，整棵树跟着换
- Settings 手加 custom provider，聊天可直连 `https://api.omnimux.ai/v1`

官方没有：

- 社区插件 A 必须给社区插件 B 当底座
- 名为 `omnimuxVideo` 的视频缝
- 「领域包不得自己 fetch，live 必须住在品牌包里」

活树里 `ctx.provide('omnimuxVideo')` / `ctx.get('omnimuxVideo')`，**手法**是 Cordis 的 provide / get，**把缝焊成 OmniMux 品牌名、并写进仓规**，是本仓自己定的。

### 当前实现实际绑在哪

`AGENTS.md` 写死：`omnimux-drama` 禁止打 OmniMux HTTP；live generate 属于 `dsh-omnimux`。

`drama_generate_shot` 只 `ctx.get('omnimuxVideo')`，没有就拷 `stub.mp4`。

因此：

| 层 | 是否必须经过 `dsh-omnimux` |
|---|---|
| 建剧、圣经、分镜 | 否 |
| 真出片（活树） | 是，本仓规 + 当前代码 |
| 聊天走 OmniMux | 否，Settings custom provider 已通 |

文档站位（两包平级、omnimux 卖给所有 dsh 用户）和出片接缝（drama 的私有后端）不一致。这是这次讨论要收口的缝。

### Skill、插件、直连不是一条路

OmniMux skill 是说明书（`codeExecutionCore: false`），教模型怎么调 CLI / `/v1`，自己不执行。

| 路径 | 做什么 | 还要不要插件 |
|---|---|---|
| Settings custom provider | 聊天直连 OmniMux | 聊天不必为这个单独做包 |
| OmniMux skill | 方法论，不跑 HTTP | 替代不了 poll、job、密钥封装 |
| 领域包自己 fetch | 物理上可以 | 本仓禁止，垂直一多会复制客户端 |
| `dsh-omnimux` 工具 / 服务 | 把底层接口收成 dsh tool + job | 这才是独立包的理由 |

独立包相对 skill 多出来的：模型可调用的工具、长任务进 `ctx.jobs`、密钥不进聊天、poll 和下盘统一、官方独有云能力做成工具并在未开通时报错。

若它只为 drama 转发一次视频 HTTP，包可以不做。多垂直复用、官方云工具要挂在 dsh 上，包才值得单独存在。

### 开源获客和官方云怎么同时成立

插件定位是开源、可改、可复用。基础能力（领域状态机、兼容的出片合同）用户可接任意第三方。OmniMux 是推荐渠道，也是部分云能力的唯一实现。

转化必须发生在「本地脚本 + 大模型做不到」的点上。视频生成很多家都有，单独拿它当「必须接官方」说服力弱。社交发布、统一计费、托管任务、账号矩阵更像楔子。

C 类（只有 OmniMux 云有）的具体工具名单本次未锁。名单不定，提示文案会飘。

dsh 不会替插件弹窗。提示只能是工具自己的结构化错误（比如 `needs-omnimux` / `needs-provider`）。

## 否决过的方案

| 方案 | 为何否决 |
|---|---|
| 合成一个「OmniMux 短剧包」 | 官方社区看不懂；只想装中枢的用户被短剧绑架 |
| 发改过的 dsh 发行版 / `om-drama` 家族前缀 | 官方不要垂直发行版；`dsh-` 才是插件话题握手；`om-` 和「可接任意 API」打架 |
| 把 `dsh-omnimux` 改定义成通用社媒运营套件 | 那是公司产品句，不是本仓已写下的包；社交 API 默认关，短剧 v1 不依赖；硬边界禁止把 Drama Center / 社交塞进此包 |
| 每个领域包自己配第三方 API | 垂直一多就复制密钥和 poll；和官方 seam（一处 provider 换全树）相反 |
| 在 drama 里抽象「每一个模型 / 工具调用」+ 任意自定义 HTTP | 第二套执行客户端，踩中 POSITIONING 失败相 |
| 聊天也由 drama 配置 | dsh 已有 `ctx.llm` 和 Settings |
| 把 OmniMux 方法论 skill 正文 vendoring 进插件 | 继续 `omnimux skill install` |

## 新方案

```text
官方 dsh
  聊天大脑：Settings / 以后中枢注册的 adapter
  │
  └─ dsh-omnimux     执行中枢（provider）
       配一次：OmniMux（默认）或第三方兼容 endpoint
       挂中性缝：videoGenerate / 以后的 imageGenerate
       另挂官方独有工具（未配密钥则 needs-omnimux）
            │
            ├─ omnimux-drama           短剧：series/、确认门、drama_*
            ├─ （以后）电商视频
            └─ （以后）电商设计
                 不配密钥，只消费缝
                 未挂缝 → stub 或 needs-provider
```

包名保持 `dsh-omnimux`、`omnimux-drama`。品牌在文档和升级提示里，不靠改名前缀。

### 谁拥有什么

| | `dsh-omnimux` | 领域包（drama / 以后） |
|---|---|---|
| 给谁 | 所有 dsh 用户；也被多个领域包复用 | 单一垂直工作流 |
| 磁盘 | 不认 `series/`、货盘、SKU | 自己的领域文件 |
| HTTP / 密钥 | 唯一维护处 | 禁止 import 中枢；禁止写品牌专用客户端 |
| 工具 | `omnimux_*`、官方云能力 | `drama_*` 等领域工具 |
| 没装对方 | 仍能提交一条视频任务 | 领域读写仍可用 |

出片解析顺序（目标，非活树）：

1. 中性缝已挂（中枢或别人的 provider）→ live
2. 未挂 → stub，或明确 `needs-provider`（不要假装生成了模型片）

第三方也走中枢配置，前提是缝是中性的。缝若仍叫 `omnimuxVideo`、请求体写死 OmniMux 私有字段，把 Runway 填进「omnimux 插件」会名实不符。

聊天继续留在 dsh 的 LLM 面。中枢以后可注册 OmniMux adapter，方便「装包即出现在模型列表」；不挡 Settings 手加这条已通的路。

### 验收（方案层，不是已实现）

1. 只装 drama：读写 `series/` + stub，零密钥。
2. 只装中枢：能 `omnimux_video_submit`（或等价工具），不出现 `series/`。
3. 中枢配好 OmniMux 或兼容第三方后，drama 与以后的领域包都不必再填密钥。
4. 点到官方独有能力且未配 OmniMux：结构化错误，指向安装 / 配密钥，不 500。
5. 不得对 `mode: "stub"` 声称模型渲了片子。

### 成功与失败

成功：一个没听过短剧的 dsh 用户只装中枢，能打一轮带工具的对话并提交视频任务；短剧或电商用户装领域包 + 中枢，配一次 API，出片走同一条缝。

失败：为了短剧 fork harness；或每个垂直包各写一套执行客户端；或把中枢做成社媒运营套件 / 短剧私有后端。

## 与活树的差距

下面这些**今天还是真的**，被本决策标为待改，不是已经落地：

- ~~`ctx.provide('omnimuxVideo')` / `get('omnimuxVideo')`，不是中性 `videoGenerate`~~ **done T8**（缝改名已同步 `scripts/verify-cordis-propagate.mjs` 与 `docs/capabilities.md`）
- ~~`AGENTS.md`：「Live generate belongs in `dsh-omnimux` (`ctx.omnimuxVideo`)」~~ **done T7**
- ~~`presets/drama/agent.cordis.yml` 仍写 generate 返回 stub（和 live 路径可能不一致）~~ **done T8**
- ~~根 README 仍有「真出片还没接到 OmniMux」一类过期句（以 `docs/capabilities.md` 为准）~~ **done T4a / T8**
- 中枢尚未注册聊天 adapter；生图 absent
- C 类官方独有工具名单未锁，也没有 `needs-omnimux` 错误码

改代码前先改仓规：把「drama 禁止任何 OmniMux HTTP」收成「drama 禁止 import 中枢、禁止写品牌专用客户端；出片只打中性缝」。在那之前，编码 Agent 仍遵守现有 `AGENTS.md` 硬边界。

## 仍待拍板（不阻塞本决策）

- C 类清单：哪几个工具是「只有 OmniMux 云做得到」，用来写升级提示。
- 中性缝的正式名字和参数合同（建议 `videoGenerate`，与品牌包名解耦）。
- 中枢是否在第一期就做第三方兼容 endpoint 配置，还是先只接 OmniMux、缝先改中性。

## 源

| 材料 | 在这次讨论里用来干什么 |
|---|---|
| `research/dsh/POSITIONING.md` | 旧站位：两包、不 fork、短剧要薄 |
| `research/dsh/EXTENSION.md` | 官方扩展面；adapter 不能放 preset |
| `research/dsh/sources/official/05-architecture.md` | seam：接口 / provider / consumer |
| `research/omnimux/PLUGIN.md` | OmniMux 云提供 `/v1`；skill 不执行；社交不是短剧发行 |
| `AGENTS.md` + `plugins/omnimux-drama/src/index.js` | 旧缝：`omnimuxVideo` 是仓规不是上游 |
| `docs/capabilities.md` | 活能力真假；本决策不覆盖该表 |

POSITIONING 里「调 OmniMux 的生成应复用 dsh-omnimux，不要复制」仍然成立，含义改为：复用中枢的 **中性缝**，不是 drama 把中枢当唯一品牌后端。

## 同日补记：整仓定位

同一会话稍后把文件夹级定位收成下面四句。不改上文审计过程，只改站位读法。已写进 [POSITIONING.md](../../research/dsh/POSITIONING.md) 和根 README。

1. 本仓是 **OmniMux 落到 dsh 插件生态** 的项目，不是 Drama Center 产品仓。文件夹与根包名是 `omnimux-dsh`。
2. 短剧创作是 **社交媒体运营自动化** 方向的第一条开源、可产品化解决方案，后面还可以有电商视频、电商设计。
3. 基础能力经中枢接第三方兼容 API。OmniMux 是推荐渠道。
4. 付费接口服务可选；业务逻辑封在 OmniMux 云里，第三方接不进，只能装中枢并配官方密钥。

仍不把 `dsh-omnimux` 做成社媒运营套件。中枢继续只做执行面和官方独有接口。账号排期、Drama Center 传片不进这个包。活树尚未实现第三方配置和 C 类付费工具表。
