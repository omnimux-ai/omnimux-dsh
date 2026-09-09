# #832 首页推荐最终准入名单

## 1. 最终决定与工程输入

- 用户已选择「采用现有近似 Skill，缺失暂不展示」：保留真实名称、能力边界与稳定身份，功能去重，不要求凑满 16 或 9 项。本文件收口[增量 PRD](issue-832-home-recommendations-incremental-prd.md)，不改原文件；原 PRD 中「必须16项齐备」的数量验收应以该决定为准。
- **本轮直接可配置的现有 catalog ID：0 个；获准转工程正式收录的来源：1 个（E）；其余暂缓，不在本次首页名单展示。** 「来源准入」不是「已安装可运行」或「已上首页」。E 完成下列收录验收后，最终首页为 1 个独立 Skill；此前显式名单保持空，不回退旧48精选。
- 优先检查了本库 A/J/K，但旧 catalog 不是许可证或公开分发可用性的证明。没有为了数量追加不相关技能，也没有将 J/K 无条件替代 H/I。
- 本轮仅新增本文。未改 catalog、业务代码、原 PRD、外仓；未执行 Skill 内容、安装、采集评论、使用密钥、调用付费服务、生成封面或启用内部 workflow。旧48精选与旧封面仍保留，本结论不授权全局删除旧条目。
- 核验日期：2026-09-09；任务树 HEAD `1e4510308a2d2bfd0c079bf25659efad10b62f9c`。工程同时修改配置/UI，本文不对其他成员改动签字。

## 2. 唯一来源准入项：E

| 字段 | 收口值 |
|---|---|
| 推荐候选 / 原16意图 | E / 11「亚马逊评论优化」的评论采集近似项 |
| 真实 slug | `bggg-data-amazon` |
| 本库 catalog ID | **尚不存在**；不得将总库 ID 当产品 ID。工程可采用新 ID `sk-bggg-data-amazon`，但它仅为拟定值，必须经正式收录及唯一性校验后才能进入首页配置 |
| 来源 | git repo `binggandata/bggg-skills`；subpath `bggg-data-amazon`；ref **`1034ee5805f3fd5b010a4f57affa4aa796ab75d5`**，不要用浮动 main 代替已审版本 |
| 真实名称 | **BGGG Amazon Data**（SKILL.md 一级标题；可加中文释义「Amazon 评论采集」，不改称「评论优化」） |
| 卡片准确描述 | 采集 Amazon US 已公开展示的书面评论，保留尝试/错误记录并归一化为可追溯 JSONL，为 VOC 与低星痛点分析提供输入；不含完整 QA 优化报告，不保证全部评论或评分覆盖 |
| 新封面方向 | 16:9；评论原文卡、星级分组、可追溯 JSONL 文件组成一个清晰主题；不画评分提升箭头、不用假用户头像/真实评论截图、不暗示官方 Amazon 背书 |
| 许可 | 根 LICENSE：MIT，Copyright (c) 2026 BGGG；包内 `references/upstream_LICENSE`：保留的上游抓取器 MIT 许可 |
| 工具兼容结论 | **静态可接入**：三个 Python 脚本仅使用标准库；无 BrowserAct、amazon-mcp、登录/API Key 或内部 workflow 强制依赖。`run_batch.py` 以 `__file__` 定位同包 scraper。不是本轮实跑通过 |
| 运行限制 | 必须由运行环境提供 Python 3；外部 Woot 端点与网络可用性未实测。仅采集授权目标、遵守站点规则与数据权利；MIT 只授权软件，不授权再发布评论内容或绕过访问限制 |

### E 的收录验收（工程负责，不需要重做候选研究）

1. 使用上述固定 git 来源及真实 subpath，沿现有正式 catalog/分发机制创建唯一 Skill ID，验证 slug 与包内容，不复制未知来源资产，不改外部仓库。
2. **完整保留两层 MIT notice**。仅安装 subpath 会遗漏仓库根 LICENSE；工程必须证明现有分发/notice 机制保留根许可证与包内 `references/upstream_LICENSE`，否则仍不展示。本文不批准以漏许可的裸 subpath 包发布。
3. 核对安装后的脚本寻址：原 SKILL.md 同时要求从项目根运行以及使用 `scripts/*.py` 相对路径；宿主必须能按已安装 Skill 绝对根解析脚本、以用户项目为数据工作目录。未证实该执行语义前，不宣称「即装即用」；不得通过执行外部 Skill 或外仓改写来绕过本轮边界。
4. 验证产品运行面存在 Python 3/命令执行能力；不把其他插件私有 Python 自动视为此 Skill 的公共供应。此轮只读会话的 python3 可访问不代表所有客户环境已具备。任何额外供应或代码适配必须在既有授权范围内，否则暂缓该项。
5. 上述通过后才把真实 ID 加入显式首页名单、设全局精选并绑定独立新封面；保留原48精选及原封面，不自动安装 Skill/依赖，不调用采集服务做「验活」。运行时首次真实采集须按用户实际任务授权处理。

## 3. A–I 与优先备选 J/K 的最终处置

下表 source 中的本地 HEAD 只是审计定位，不把不可公开访问的仓当可安装源；所有暂缓项均不生成本次首页封面。

| 候选 / 原意图 | 真实名称 / slug | 本库 ID；源 repo / subpath / ref | 处置与证据、暂缓原因 |
|---|---|---|---|
| A / 3 | Brand Promo Video Generator / `brand-promo-video-generator` | `sk-omx-brand-promo-video-generator`；catalog 为 `infometa/OmniMux-skills` / `skills/brand-promo-video-generator` / `main`；本地 HEAD `7fd236638ab0b1e3a8b160fd9aae7e4bebe613f1` | **待核，不展示**。品牌短片不是通用视频画布。公开 GitHub API 返回404，本地无 origin/remotes，根及该包无适用 LICENSE；其他技能的独立 LICENSE 不覆盖此包。正文是 Design-native `hub_*`，有缺工具降级规则，但未证明 DSH 适配。需权利/正式可分发源与工具证据，不能凭已精选准入 |
| B / 7、8（只可一张） | Amazon Competitor Analyzer / `amazon-competitor-analyzer` | 无本库 ID；`browser-act/skills` / `solutions/ecommerce/amazon-competitor-analyzer` / `11c057b03f92101642cadc9f840564574120d184` | **许可与目录通过，工具待核，不展示**。公开 MIT；依赖 BrowserAct 托管浏览器 API、账号/Key、Python requests；并非 amazon-mcp。需证明现有执行与安全凭据入口兼容，且不会违反本项目 ego-browser 执行约束；本轮不配置、不安装、不付费，不把近似授权扩大为引入浏览器服务 |
| C / 9 | A+ 内容 / `a-plus-content` | 无本库 ID；本地 origin `laozhong86/rhapi` / `server/skills/image/a-plus-content` / `21c5f7b41595bfecffc6a119d1cd8478cc90d486` | **待核，不展示**。方法论与文案规划；元数据 publicationStatus=public 不等于再分发许可证。公开仓API404，tracked 文件未查到适用 LICENSE；不从 Gxgen 复制或启用内部工作流 |
| D / 10 | Amazon — Search & Category Listing / `amazon-search-listing` | 无本库 ID；`browser-act/skills` / `solutions/ecommerce/amazon-search-listing` / `11c057b03f92101642cadc9f840564574120d184` | **许可与目录通过，工具不匹配，不展示**。正文强制加载 browser-act 并调用其 eval/Python DOM 脚本，本项目要求 ego-browser；不存在已验证等价桥接。仅搜索结果采集，无 ABA/流量/PPC 分析，不因接受近似就擅自安装或替换浏览器工具 |
| E / 11 | BGGG Amazon Data / `bggg-data-amazon` | 见§2 | **来源准入，正式收录验收前不展示**。唯一可转工程的合法来源；静态标准库兼容不代替环境及分发验收 |
| F / 12 | Amazon — Best Sellers Listing / `amazon-bestseller-listing` | 无本库 ID；`browser-act/skills` / `solutions/ecommerce/amazon-bestseller-listing` / `11c057b03f92101642cadc9f840564574120d184` | **许可与目录通过，工具不匹配，不展示**。与D同样强制 browser-act；仅榜单快照，无销量预测/商标风控/持续监控 |
| G / 13、14（只可一张） | EcomSeer — TikTok Shop Intelligence Assistant / `ecomseer` | 当前无；旧 `sk-ecomseer`；`infometa/workbuddyskills` / `skills/ecomseer` / 本地HEAD `78170571d08e7d38c6baf0a13ef805487bfa6dc2` | **保持 dropped，不展示**。`dropped.json:2141–2144` 为 `source-category: sk-knowledge`；未知过滤不能擅自恢复。公开仓可读但API license=null，所查根/包无许可证；还含 ECOMSEER_API_KEY、聊天配置/OpenClaw流程，非 Topview。即使补许可也需独立解决恢复规则与安全工具兼容 |
| H / 15 | 视频分析 / `video-analysis` | 无本库 ID；`laozhong86/rhapi` / `server/skills/video/video-analysis` / `21c5f7b41595bfecffc6a119d1cd8478cc90d486` | **待核，不展示**。可基于可见视频/转写/关键帧做带货结构拆解，但与C同样无已证实公开分发源/适用许可。public 方法论标签不能越过许可门槛 |
| I / 16 | 视频脚本创作 / `video-script-creation` | 无本库 ID；`laozhong86/rhapi` / `server/skills/video/video-script-creation` / `21c5f7b41595bfecffc6a119d1cd8478cc90d486` | **待核，不展示**。真实文本脚本方法论，无固定生成工具，但与C/H同样缺公开分发/许可证据；不冒充直播脚本或复制未知版权内容 |
| J / 15 优先备选 | 视频拆解与复刻 / `video-deconstruct` | `sk-omx-video-deconstruct`；`infometa/OmniMux-skills` / `skills/video-deconstruct` / catalog `main`；本地HEAD同A | **已优先检查，待核，不展示**。与A同样公开API404及许可缺失；依赖 `hub_analyse_media`、`hub_ffmpeg`、画布以及知识/工作流模板路径，尚未验证 DSH 等价能力。明确支持只分析不生成是优点，但不足以证明可分发或可执行；不因已精选直接放行 |
| K / 16 优先备选 | UGC Ad Production Pipeline（本库题名「UGC 广告」） / `ugc-ad-production` | `sk-omx-ugc-ad-production`；`infometa/OmniMux-skills` / `skills/ugc-ad-production` / catalog `main`；本地HEAD同A | **已优先检查，待核，不展示**。与A同样来源/许可缺口；原文锁定15秒、Kling3.0、Nano Banana Pro及外部Canva，脚本只是全流程第2步，后续强制图/视频生成；不能把本次文本脚本意图默认升级为付费完整UGC流程 |

补充：L `ecommerce-copywriter` / 本库 `sk-ecommerce-copywriter`（`infometa/workbuddyskills` / `skills/ecommerce-copywriter` / catalog `main`）不作为凑数替代；主要国内电商文案，对9匹配弱，且所在仓 license=null、没有已证实该包适用许可。原意图1、2、4、5、6继续缺失，不展示占位卡，不生成封面。

## 4. 可复核证据与限制

### 公共来源（本轮只读 GET，无登录）

- [BGGG 仓库元数据](https://api.github.com/repos/binggandata/bggg-skills)：public、main、MIT；[固定目录](https://github.com/binggandata/bggg-skills/tree/1034ee5805f3fd5b010a4f57affa4aa796ab75d5/bggg-data-amazon)。contents API 验证 SKILL.md blob `5dfdf3fa95f8874d5e0539826e2ff279ed3560f9`、scripts tree `8c01614bdc96a501b32bf6a24c36df8e8de31763`、references tree `15d078fbbd64b8bc5e4876948c37d4871feed052` 与本地干净包一致。
- [BGGG 固定根许可](https://github.com/binggandata/bggg-skills/blob/1034ee5805f3fd5b010a4f57affa4aa796ab75d5/LICENSE)：API blob `f7f6f5e831eaae0afea9565f47c5eaa66545c7fc`；[包内上游许可](https://github.com/binggandata/bggg-skills/blob/1034ee5805f3fd5b010a4f57affa4aa796ab75d5/bggg-data-amazon/references/upstream_LICENSE)：API blob `14fac913ccf80234b1848540089a3bbcb6e5283d`。两份本地正文已读；源说明标明抓取器来自 `mrlong0129/amazon-review-scraper`，本轮不宣称已独立审计该上游完整历史。
- [BrowserAct 仓库元数据](https://api.github.com/repos/browser-act/skills)：public、main、MIT。固定ref三个候选目录 contents API 均可读，SKILL.md blob：B `2a2c765422d79533685d7ddc3b7a290aa1efa697`；D `72b0c9bcd92dd0223cbe8e82c661b8c30e4e7f77`；F `87d2028eb110685b830b7c325ee29b79274507aa`。本地根 LICENSE 已读，Copyright (c) 2026 BrowserAct，要求随分发保留 notice。
- [workbuddyskills 元数据](https://api.github.com/repos/infometa/workbuddyskills)：public、main、license=null；不能把 null 推断为禁止所有使用，也不能推断已授权再分发。
- `https://api.github.com/repos/infometa/OmniMux-skills` 与 `https://api.github.com/repos/laozhong86/rhapi` 本轮均 HTTP404。**404只证明匿名公共入口不可读，不证明仓已删除或归属关系**；没有使用凭据进一步探测。

### 本地资料（只读，不作为用户安装路径）

- `/Users/x/Desktop/Project/Github/OmniMux-skills/skills/{brand-promo-video-generator,video-deconstruct,ugc-ad-production}/SKILL.md`；该仓 git remotes为空，tracked LICENSE只有其他三个独立技能的许可，目标包无统一/包内许可证据。
- `/Users/x/Desktop/Project/Github/browser-act-skills/solutions/ecommerce/{amazon-competitor-analyzer,amazon-search-listing,amazon-bestseller-listing}/SKILL.md` 与根 LICENSE。
- `/Users/x/Desktop/Project/Github/bggg-skills/bggg-data-amazon/`：SKILL.md、references/source_and_limits.md、upstream_LICENSE，静态检查scripts导入与相对路径。未执行任何脚本或测试。
- `/Users/x/Desktop/Project/Gxgen/server/skills/{image/a-plus-content,video/video-analysis,video/video-script-creation}/SKILL.md`；目标路径干净，git tracked许可查询无输出。node_modules的第三方许可证不覆盖本体。
- `/Users/x/Desktop/Project/Github/workbuddyskills/skills/ecomseer/SKILL.md`；[本库 dropped记录](../../plugins/omnimux-market/catalog/dropped.json)、[真实 catalog](../../plugins/omnimux-market/catalog/index.json)。

本报告是有限来源/许可文件与静态工具审计，不是法律意见、安全认证、端点可用性测试或正式发行签字。证据不足的项维持待核；不反向改写用户「接受近似/缺失不展示」决定。

## 5. 交接与验收

- **工程现在可继续**：显式名单/空态/旧精选保留逻辑，以及E的固定源合法收录准备；优先完成E的notice与脚本寻址验收，过关后才配置一个真实ID与专属新封面。无法满足则保留空名单，不用A/J/K或旧48补位。
- **主理人后续输入**：仅当希望恢复A/J/K或C/H/I时提供适用权利证明和用户可用的正式分发源，再转工具兼容核对；G还须明确合法恢复过滤规则。不是要求用户重选已接受的近似策略。
- 本文件的完成不代表整个#832交付：业务测试、独立新封面、正式L2/ego-browser/verify:live仍归工程/QA；旧报告不能替代新行为验收。无commit/push/PR/merge/部署。
- 文档检查：运行限定本文的 `git diff --check`，另检查未跟踪新文件空白、相对链接及代码围栏；不运行Skill或业务测试。验收实绩见回传摘要。
