# 官方意图对齐：OmniMux 落到 dsh 插件生态

> **历史定位边界（2026-10-08）**：本文的社媒全链路、短剧首发、矩阵增长和旧“唯一定位”属于所记日期的研究或决策；产品定位部分已由[角色生成与视频复刻](../../docs/contracts/product-positioning.md)替代。原历史正文、证据与技术分工保留，不据此恢复旧产品路线、执行旧请求示例或宣称当前功能已交付。


日期：2026-08-14。
依据：[EXTENSION.md](EXTENSION.md) 的扩展面事实 + 官方中英产品页。
本文件只定站位，不写实现。活能力和包边界见 [docs/capabilities.md](../../docs/capabilities.md)、[docs/contracts/hub.md](../../docs/contracts/hub.md)、[docs/decisions/2026-08-14-execution-hub.md](../../docs/decisions/2026-08-14-execution-hub.md)。

## 本仓是什么

本仓聚焦一件事：把 OmniMux 落到官方 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件生态。不 fork harness，不另做一套 agent 运行时。

两条交付：

| | 是什么 | 现在的包 |
|---|---|---|
| 执行中枢 | dsh 上的 OmniMux 接头：产品外壳、账号、模型 / 图 / 视频；第三方兼容 API 也配在这里；只有 OmniMux 云里封装了业务逻辑的付费接口，只能走官方密钥 | `omnimux` |
| 垂直解决方案 | 开源、可产品化的领域包。可接第三方 API（经中枢配一次）。OmniMux 是推荐渠道 | 第一条：`omnimux-drama` 短剧创作 |

短剧创作是 **社交媒体运营自动化** 方向的第一条解决方案，不是本仓的唯一产品，也不是 Drama Center 后台。以后的电商视频、电商设计是同一条线上的后续包。中枢不是社媒运营套件，不认 `series/`，也不做账号排期。

开源切入：基础能力（领域状态机、兼容的出片合同）用户可接任意第三方。付费接口服务可选；这类接口的业务逻辑封在 OmniMux 云里，第三方接不进，垂直包只能提示安装 / 配置中枢。不要把执行中枢叫网关。

## 官方在做什么

中文产品页把受众写死了：面向全球 **Harness 开发者** 的预览，不是面向短剧创作者的应用商店。

他们的公式：

> Agent = Model + Harness
> 模型是 Agent 的灵魂。Harness 给予 Agent 理解环境、使用工具，并在真实场景中持续工作的能力。

Cordis 内核「只负责插件的加载、卸载和依赖关系，**不承载 Agent 的具体能力**」。官方自己的标准 / PTC / 极简 / 创造模式，是这套内核上的展示组合，不是唯一合法业务。

生态意图（CONTRIBUTING + README）：

- 不收外部 PR，不要改官方仓。
- 社区包和官方包平级。
- 发现通道：`dsh-plugin` 话题、Discussions、Discord、how-to。
- 官方仓是理念和示例，不是必须遵守的产品方向。

一句话：他们要的是「别人在旁边挂能力」，不是「别人来帮他们写短剧」或「别人 fork 出垂直发行版」。

## 我们怎么对上号

核心业务是 OmniMux。dsh 是落地用的插件生态，少写一套 agent 运行时。短剧是第一条垂直方案，用来证明：中枢配一次，领域包能开源卖、能接第三方、也能升级到官方付费接口。

套进官方公式：

```text
官方：  Agent = Model              + Harness
我们：  Agent = OmniMux（灵魂面） + dsh（借来的环境/工具/会话/UI）
                 │                      │
                 聊天 / 生图 / 生视频     loop / jobs / skills / Web
                 社交 / 计费 / 密钥
                 │
                 omnimux = 执行中枢（配一次，多领域复用）
                 omnimux-drama   = 第一条社媒运营方案（短剧）
                 以后         = 电商视频、电商设计…
```

少写的是 loop、session、sandbox、审批、Web，不是少写 OmniMux，也不是少写领域文件约定。

## 拆成中枢 + 领域，才不破坏生态

| 包 | 给谁 | 在官方生态里说什么 | 和 OmniMux 的关系 |
|---|---|---|---|
| `omnimux` | 所有 dsh 用户；也被各领域包复用 | 「不 fork，把 OmniMux 接到 dsh：模型 + 图 + 视频」 | **对外主资产**；付费独有接口只走这里 |
| `omnimux-drama`（或 preset） | 短剧工作流 | 开源短剧方案：系列文件 + 分镜工具；出片经中枢 | 第一条垂直方案，不是中枢的子包 |

只发短剧包、把 OmniMux 藏在里面：官方社区看不懂，也带不来只想接 OmniMux 的 dsh 用户。
只做中枢、短剧全靠 bash：系列状态会散在聊天里（见 EXTENSION）。

借力官方通道时，推的是中枢。短剧包在 Discussions 里当第一条 worked example，不要当整仓主标题。

## 分发现状（不要把意图当成货架）

官方**没有**插件市场、审核上架、应用内货架。现货发现通道只有：

- `dsh plugin add <npm | git | tarball>`（安装协议）
- GitHub 话题 `dsh-plugin`（产品页 “Community plugins” 也指向这类入口）
- Discussions / Discord / how-to

「官方希望社区插件生态」是真的。「肯定会有上架位、上了就有流量」是推断，仓库和文档里没有承诺。自部署今天能做的是打 profile + bundle 给别人装；官方 `dsh web` 仍拒绝 `--host 0.0.0.0`，不能当成现成的局域网/公网发行版。

## 借力官方，但不消费官方

做：

- 独立仓，MIT，`dsh-plugin` 话题。
- `dsh plugin add <npm 或 tarball>`，peer 钉 `>=0.1.0-rc.5 <0.2.0`。
- Discussions 发插件帖（对照 #174 / #516 的写法：不改 harness 源码、给出安装命令、说明测过的 rc）。
- 写一篇 how-to：Custom provider 指到 `https://api.omnimux.ai/v1`，再挂视频 job。CONTRIBUTING 点名欢迎这种文章。
- Discord 答「怎么接非 DeepSeek 网关 / 怎么跑长视频任务」。
- 密钥继续走 `omnimux tokens exec`，不要教人把 `sk-` 写进 dsh 聊天。

不做：

- 不发「DeepSeek 短剧版」或改过的 `dsh` 发行包。
- 不改 inbox 行的语义让别人的 profile 悄悄坏掉。
- 不在官方仓提功能 PR。
- 不把 Drama Center / 蚁小二 / GeeLark 塞进 `omnimux`。
- 不在 dsh 上面再叠一套自研 loop（那正好违背「少写 agent 代码」和官方「内核不承载能力」）。

官方社区的人是 harness 开发者。他们能转化成 OmniMux 的，是需要多模型 + 生视频的人。短剧创作者不在这条通道里；那条获客不要指望 Discussions。

模型面官方就不是 DeepSeek 专用：Settings 可加 catalog 提供方（Anthropic、OpenAI、Bedrock、Vertex、Azure、Codex）和 custom provider（任意 OpenAI-compat endpoint）。`omnimux` 应把 OmniMux 注册成一条可切换路由，并允许用户另接别的提供方。不要把短剧包写成只认 DeepSeek。

## 领域层写多薄

dsh 已经有：loop、session、jobs、skill 加载、审批瀑布、Web。

短剧这条方案只保留无法用 skill 表达的副作用：

- `series/` 文件约定（圣经、分集、shots.json）
- 出片打中枢的中性缝（实现复用 `omnimux`，不要在领域包里复制 HTTP）
- 一篇短剧 skill（钩子、集末悬念、竖屏）

人设用 preset，不改官方 standard 的源文件。TikTok Drama Center 入驻 / 传片仍是 skill `tiktok-drama-center`，不是这条方案的工具面。

## 成功标准（和官方意图对齐）

生态向：一个没听说过短剧的 dsh 用户，能 `dsh plugin add` 中枢之后用 OmniMux 打一轮带 tool 的对话，并提交一个视频任务。
方案向：同一套运行时，一句话题材写出 `series/` 并出一镜；出片既可走第三方兼容 API，也可走 OmniMux。
付费向：点到只有 OmniMux 云里封装了业务逻辑的接口时，清楚提示必须接 OmniMux，第三方接不进。
失败相：为了短剧 fork harness；为了垂直包重写一套 agent 框架；或把中枢做成社媒运营套件 / 某个领域的私有后端。
