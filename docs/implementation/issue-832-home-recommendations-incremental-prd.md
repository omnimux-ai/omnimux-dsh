# #832 增量 PRD：16 项 Skill 映射、首页显式推荐与专属封面

## 1. 结论与实施边界

- 项目：`skill_home_recommendations`；语言：简体中文；技术：沿用现有 omnimux-market JavaScript/TypeScript + React，不新建应用或技术栈。
- 原始需求：按用户截图转述顺序寻找 16 项对应或相似 Skill，全部设精选并首页推荐；首页官方精选只展示明确配置项；每项新专属封面；旧 48 精选及封面保留。
- **本次只完成映射与产品需求，不改业务代码、catalog、封面或外部资产，不安装 Skill/连接器，不执行运营或生成任务。** 唯一产品交付为本文件；主理人审阅后转工程。
- 核验结论：**完全匹配 0 项；相似候选 11 项；未找到可承担目标的候选 5 项（1、2、4、5、6）。** “相似”包含明显能力缺口，不是可以直接改名上架的批准。
- 11 个相似位置仅对应 9 个不同的首选候选（7/8 共用一个；13/14 共用一个），且数项未进入本产品 catalog。**目前不能如实配置出 16 张不同、完全满足原需求的可用卡片。** 不用重复卡、空壳 Skill、伪造 slug 或更名掩盖缺失补足数量。
- 缺失仅指本次已查本库与本机总库的真实源范围未找到，不宣称全互联网不存在；未发外部搜索、未访问书签链接、未 clone。

### 既有改动保留

任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-header-832`，初始干净；HEAD `1e4510308a2d2bfd0c079bf25659efad10b62f9c`，分支 `agent/market-skill-header-issue-832`。没有切换、reset、stash 主树或任务树。

沿用 [工程报告](issue-832-engineering.md)、[独立 QA](issue-832-qa.md)、[依赖状态](issue-832-dependency-status.md)：旧源码 654/654 离线通过；正式 L2/ego-browser/verify:live 因受管 viewer 的 `installSettingsSection/settingsNamespace` 导出兼容问题 BLOCKED。此为既有报告结论，不是本次重新启动或复测结果。新需求不能替代旧顶部、搜索分类、创建、安装失败重试、我的 Skill 精选修复和三张既有封面；旧 QA 不自动覆盖新增推荐行为。

## 2. 真实源与身份口径

按本库 catalog → bundled → 总库索引 → 已索引实际包顺序核对。`plugins/omnimux-market/catalog/index.json` 当前有 192 个 Skill，其中 9 bundled、183 git；`recommended=true` 的 Skill 为 48 个。bundled 中无截图同名电商分析包；plugins 内也未命中 `shopee-mcp/amazon-mcp/Topview` 运营 Skill。

- 本库 catalog SHA256：`22178ae680e84e1c73312e8a60fa260741c886913ba653bf2f6a1a8e45aa6e5f`。
- 总库索引：`/Users/x/Desktop/Project/OPC/资产库/index.json`，SHA256 `8fc0ee0277e6f40184dec3763c401fde3f8867cc4d209297fb9bff8e29a40345`。
- 总库入口统一为 `/Users/x/Desktop/Project/OPC/资产库/skills/<总库ID>/SKILL.md`，实际正文路径见下表；已读取被选候选的 SKILL.md，不仅根据索引描述判断。
- 已只读核对总库 `Github/catalog.json`、`Bookmarks/catalog.json`；Topview/Amazon 书签仅网站入口，不是 Skill 包或连接器证据。
- 上游 checkout HEAD：OmniMux-skills `7fd236638ab0b1e3a8b160fd9aae7e4bebe613f1`；workbuddyskills `78170571d08e7d38c6baf0a13ef805487bfa6dc2`；Gxgen `21c5f7b41595bfecffc6a119d1cd8478cc90d486`。这是只读 checkout 身份，不代表对其工作树清洁度、许可或当前 DSH 工具兼容性签字。

身份必须分开：**产品 catalog ID ≠ 总资产库 ID ≠ skill slug**。以下 `—` 表示没有核实存在的身份，不可把建议名称当真实身份。

### 候选身份字典

| 引用 | 真实 slug | 产品 catalog ID / 状态 | 总库 ID | 真实源目录（目录内 SKILL.md 已读） |
|---|---|---|---|---|
| A | brand-promo-video-generator | `sk-omx-brand-promo-video-generator`，git，已精选 | `OmniMux-skills-brand-promo-video-generator` | `/Users/x/Desktop/Project/Github/OmniMux-skills/skills/brand-promo-video-generator` |
| B | amazon-competitor-analyzer | —，未收录 | `browser-act-skills-amazon-competitor-analyzer` | `/Users/x/Desktop/Project/Github/browser-act-skills/solutions/ecommerce/amazon-competitor-analyzer` |
| C | a-plus-content | —，未收录 | `Gxgen-image-a-plus-content` | `/Users/x/Desktop/Project/Gxgen/server/skills/image/a-plus-content` |
| D | amazon-search-listing | —，未收录 | `browser-act-skills-amazon-search-listing` | `/Users/x/Desktop/Project/Github/browser-act-skills/solutions/ecommerce/amazon-search-listing` |
| E | bggg-data-amazon | —，未收录 | `bggg-skills-bggg-data-amazon` | `/Users/x/Desktop/Project/Github/bggg-skills/bggg-data-amazon` |
| F | amazon-bestseller-listing | —，未收录 | `browser-act-skills-amazon-bestseller-listing` | `/Users/x/Desktop/Project/Github/browser-act-skills/solutions/ecommerce/amazon-bestseller-listing` |
| G | ecomseer | 当前 catalog 无；`dropped.json:2141` 记录旧 ID `sk-ecomseer`，因 `source-category: sk-knowledge` 剔除 | `workbuddyskills-ecomseer` | `/Users/x/Desktop/Project/Github/workbuddyskills/skills/ecomseer` |
| H | video-analysis | —，未收录 | `Gxgen-video-video-analysis` | `/Users/x/Desktop/Project/Gxgen/server/skills/video/video-analysis` |
| I | video-script-creation | —，未收录 | `Gxgen-video-video-script-creation` | `/Users/x/Desktop/Project/Gxgen/server/skills/video/video-script-creation` |
| J | video-deconstruct | `sk-omx-video-deconstruct`，git，已精选 | `OmniMux-skills-video-deconstruct` | `/Users/x/Desktop/Project/Github/OmniMux-skills/skills/video-deconstruct` |
| K | ugc-ad-production | `sk-omx-ugc-ad-production`，git，未精选 | `OmniMux-skills-ugc-ad-production` | `/Users/x/Desktop/Project/Github/OmniMux-skills/skills/ugc-ad-production` |
| L | ecommerce-copywriter | `sk-ecommerce-copywriter`，git，未精选 | `workbuddyskills-ecommerce-copywriter` | `/Users/x/Desktop/Project/Github/workbuddyskills/skills/ecommerce-copywriter` |

产品 A/J/K 的 source 为 `infometa/OmniMux-skills`、`skills/<slug>`、`ref=main`；L 为 `infometa/workbuddyskills` 同结构。其远端 ref 不是本次联网验证结果；上架前应使用仓库正式机制核实包可分发、依赖和版本，不把本机绝对路径写成用户端安装源。

## 3. 按截图顺序的 16 项映射与每图方向

表中“依赖”是正文声明或用户截图转述，不是连接器已安装/配置/可用的证据。**本库未找到 `shopee-mcp`、`amazon-mcp`、Topview/td 对应连接器 catalog 行，不能编造 cn-* ID。** 没有检查用户凭据或当前安装状态。

| 顺序与目标 | 匹配 / 真实候选 | 功能证据与不等价点 | 连接器/工具依赖口径 | 一句封面方向 |
|---|---|---|---|---|
| 1 Shopee品牌分析 | **缺失**；id/slug/path 均 — | 未找到覆盖品牌排名、详情、趋势、商品组合、网站/类别分布的 Skill；跨境电商专家不等于专属 Skill | 用户指定 `shopee-mcp`，真实包和连接器定义未找到 | 暂不生成；待真实包确认后，以品牌排行、商品组合和站点分布的三联信息图表达，不画虚假销量。 |
| 2 Shopee关键词分析 | **缺失**；id/slug/path 均 — | 未找到热搜词排名、详情、趋势、相关商品的专属包 | 用户指定 `shopee-mcp`，未核实存在及可用性 | 暂不生成；待包确认后，以搜索词、趋势线和关联商品卡的视觉链路表达。 |
| 3 视频生成画布 | **相似 A**；另有总库 video-creation、canvas-workflow | A 的 allowed-tools 有生成、编辑、画布分组，正文覆盖品牌短片从素材到组装；它是品牌宣传片入口，不是所有视频请求的通用画布路由；Gxgen canvas-workflow 明确 internal，不可当公共视频生成 Skill | A 声明 `hub_generate_image/video`、`hub_video_edit`、画布分组及媒体工具；未核实 DSH 适配，未声明电商 MCP；Gxgen video-creation 使用 `generate-video` 语义且排除仅剪辑 | 若采用 A，以品牌素材进入分镜、视频片段和编辑时间线的完整制作流程为封面，不冒充通用画布功能。 |
| 4 电商路由策略 | **缺失**；id/slug/path 均 — | 未找到共享给电商运营代理的路由规则；通用流量路由、模型路由不是电商任务路由 | 没有真实包，不能推断“无需连接器”；未来规则可引用任务所需工具，但本次不设计第二路由器 | 暂不生成；待共享路由真源确认后，以一个运营问题分流至市场、商品、内容三个目的地表达。 |
| 5 电商输出规范 | **缺失**；id/slug/path 均 — | 未找到该共享报表及文件输出规范；BGGG 的 VOC 目录约定只是采集套件内部规范，不等价 | 无真实包，依赖未知；不得将普通 Markdown 模板伪称现成 Skill | 暂不生成；待规范真源确认后，以一致的报表、表格与文件目录交付包表达。 |
| 6 电商日报复盘 | **缺失**；id/slug/path 均 — | 未找到 Amazon + TikTok Shop 每日/每周运营复盘包；社媒月报和 EcomSeer 实时分析不覆盖此口径 | 数据源、周期口径和连接器均待真实包确认；这里的每日每周是 Skill 能力，不是创建自动任务的请求 | 暂不生成；待包确认后，以日/周对照报表、异常标记及下一步行动清单表达。 |
| 7 亚马逊市场分析 | **相似 B** | SKILL.md:13–26 支持多 ASIN 市场格局、价格带、竞争壁垒与机会；不是 amazon-mcp 品类级市场全景 | BrowserAct.com API、`BROWSERACT_API_KEY`、Python requests；不是 `amazon-mcp` | 以多个真实产品维度的价格带与竞争机会矩阵表达，避免暗示全市场实时份额。 |
| 8 亚马逊产品分析 | **相似 B**（与7重复） | 支持 ASIN 竞品规格、价格、评论、图片对比并输出 CSV/Markdown/JSON；没有上传文件解析、SKU 全链路约定 | 同 B；不是截图指定的 amazon-mcp；不得为了16卡复制出第二个虚构包 | 以 ASIN 产品对照、规格表和优势/缺口标记表达；若与7仍为同一 Skill，不生成第二张重复卡。 |
| 9 亚马逊商品详情优化 | **相似 C**；本库弱备选 L | C 明确 Amazon A+ 模块规划、文案、品牌故事、视觉提示和检查；不自动采集、生成最终图、发布，未证明关键词覆盖审计；L 主要面向国内电商，不能冒充 Amazon 专用 | C 方法论，无固定必需连接器；依赖用户产品资料；L 同样未声明 amazon-mcp | 以 A+ 模块排版、产品卖点与品牌故事层级表达，不画自动上架或关键词排名增长承诺。 |
| 10 亚马逊关键词流量分析 | **明显近似 D（数据采集层）** | 可按关键词采集搜索商品、排名和 sponsored 标识；**没有流量来源、ABA 趋势、PPC 机会分析**，不可用原目标名称直接上架 | `browser-act` + Python DOM 脚本、已打开目标页；不是 amazon-mcp，无 ABA 数据权限证明 | 若仅采用 D，以搜索结果、自然/广告标记和商品位次表达，不画 ABA 漏斗或 PPC 投资回报。 |
| 11 亚马逊评论优化 | **相似 E（数据采集层）** | Amazon US 书面评论采集、保留原文与审计 JSONL，适合 VOC 输入；非完整 VOC/QA 痛点优化报告，未含 QA 采集，且有结果窗口限制 | Python 标准库与 Woot 公共 review 路径；不需要 Amazon 登录/API Key（源声明），不是 amazon-mcp；未实测端点 | 以评论原文、星级分组及可追溯数据文件表达，不宣称自动改善评分或覆盖全部评论。 |
| 12 亚马逊趋势风险监控 | **明显近似 F（排名快照层）** | 当前 Best Sellers 排名/ASIN/品类/分页；重复采集可积累历史，但**没有销售预测、商标风险监测或持续监控服务** | browser-act + Python DOM 脚本，已打开榜单；不是 amazon-mcp，无商标数据连接器 | 若采用 F，以榜单快照和时间标记表达，不画商标盾牌、销售预测或持续预警仪表盘。 |
| 13 TikTok市场趋势分析 | **相似 G** | 地区、商品、店铺、达人、销量排行、广告与深度趋势研究；与 Topview td 的数据来源/字段不等价；当前产品被剔除，不能直接当可安装项 | EcomSeer HTTP API 与 `ECOMSEER_API_KEY`；不是 Topview/td MCP | 以地区切换、品类趋势与店铺对照表达，清楚保留 EcomSeer 实际数据来源，不借用 Topview 品牌。 |
| 14 TikTok选品 | **相似 G**（与13重复） | 搜商品、爆品、销量榜、商品详情；商品评分字段不是本任务选品评分模型，未见目标评分权重与决策口径 | 同 G；还需核对恢复收录规则，不安装或配置 Key | 以候选商品对比、销量排名和筛选器表达，不生成未经定义的选品总分。 |
| 15 TikTok素材拆解 | **相似 H**；本库备选 J | H 明确 TikTok 适配、commerce-analysis，输出钩子/卖点/证据/异议/CTA；仅分析用户可见素材，不自动找爆款。J 已在本库但主要逐镜复刻，非运营 CTA 拆解专用 | H 无固定连接器，需视频/转写/关键帧；J 声明 `hub_analyse_media`、`hub_ffmpeg`、画布写入；仅分析不得自动生视频 | 若采用 H，以一条竖屏视频拆成 Hook、卖点、证据、CTA 四段时间线表达。 |
| 16 TikTok脚本创作 | **相似 I**；本库备选 K | I 支持平台/受众/产品输入、口播/UGC/测评脚本与改写，但未证明直播脚本；K 支持15秒UGC脚本+人像+视频，锁定模型与外部后期，不等同只写脚本 | I 方法论，无固定连接器；K 声明 hub 图/视频工具、Kling3.0/Nano Banana、Canva外部后期；仅文本请求不应被强制付费生成 | 若采用 I，以创作者口播脚本、产品动作与 Hook→证明→CTA 结构表达，不画直播间或自动发布。 |

### 使用候选之前必须解决的差异

1. 总库包的旧工具名称、平台强制流程、密钥收集要求不能原样当作本产品运行合同。例如 EcomSeer 正文有聊天配置 Key / OpenClaw 命令，UGC 包有固定模型与外部后期；只读分析不执行这些指令。由工程核对现有安全设置入口和工具适配，不改外部真源。
2. BrowserAct 候选声明自己的浏览器工具；本项目浏览器执行必须遵守 ego-browser。未做兼容验证前只能作为来源候选，不能标记“当前可用”。
3. 不直接公开 Gxgen `canvas-workflow`（metadata 与正文均为 internal）。公共的 video-creation 也不等价于视频编辑画布。
4. **开放问题交主理人**：取得缺失5包的可读原始位置；确认10/12的明显近似是否接受降级且改用准确名称；确认7/8与13/14是否有不同真实包；决定C/H/I等未入产品catalog包的合规收录路径。截图“已安装”不解答上述问题。

## 4. 增量产品定义

### 目标

1. 推荐可控：默认首页推荐100%来自独立显式配置，不受全局精选数量、远端排序和分页影响。
2. 发现不丢失：旧48个精选、原有分类和封面保持可访问，搜索不会把未进首页的精选藏掉。
3. 承诺可核对：每张卡的名称、功能、依赖和封面与实际 Skill 一致；缺失与近似可见披露，不因截图状态伪造安装。

### 用户故事

- 作为首次进入 Skill 的用户，希望默认看到运营明确指定的首页推荐，而不是所有分类精选混合展示，以便快速找到当前重点能力。
- 作为需要查找技能的用户，希望“全部/分类/精选”与搜索形成明确交集，以便不遗漏未在首页推荐的 Skill。
- 作为已安装 Skill 的用户，希望“我的 Skill”只反映真实安装结果，不把首页推荐误当已安装。
- 作为配置维护者，希望能按稳定身份和显式顺序调整首页，而不改变全局精选资格或覆盖已有封面。

## 5. Requirements Pool

### P0 必须

**R1 独立首页名单。** 最小方案是在现有 catalog 配置层增加有序的首页推荐 ID 列表（名称可用 `homeRecommendations`，这是建议字段，不是已存在 API）。引用本产品真实 Skill catalog ID，列表顺序即展示顺序；不用标题、标签、下载量或总库 ID 排序。保持现有 `recommended` 的“全局精选”语义。入首页的真实 Skill 必须同时为全局精选；全局精选不自动进入首页。默认空名单应显示无推荐/隐藏推荐区，不回退到全部精选。非法ID、非Skill、重复ID必须在配置验证报错，不能悄悄补位。

**R2 按16位意图维护顺序。** 真源齐备并完成近似决策后，首页位置按本文件1→16；当前不以 A/B 等占位写配置。一个稳定Skill只出现一次；身份重复的行需要真实不同包或明确缩减目标，不做两个入口假装两项能力。不得伪造新ID“暂占坑”。

**R3 首页定义。** 首页明确指 Skill 工坊 `mainTab=discover`、全部分类 `category=""`、未提交搜索的默认页，**不是我的 Skill**；保留原顶部创建/安装、Tab和分类行结构。

**R4 搜索与分类。**

| 状态 | 内容语义 |
|---|---|
| 全部 + 无搜索（默认首页） | 顶部“官方精选”仅显式首页名单；下方其余全部 Skill，扣除已在上方展示的ID，含旧非首页精选，避免消失/重复。 |
| 全部 + 有搜索 | 对全部可发现 Skill 搜索，不限首页名单；标题使用“搜索结果”，不继续呈现未匹配推荐。 |
| 具体分类 + 无/有搜索 | 分类与查询交集；分类精选按原精选资格展示，普通列表只扣除实际已展示项；不把首页名单当分类成员全集。 |
| 精选 + 无/有搜索 | 所有全局精选（旧48 + 新准入项去重）与查询交集，不限首页名单。 |
| 我的 Skill | 真实安装集合与搜索/分类交集；精选判断保留旧修复的稳定slug身份逻辑；未安装项不进入。 |

搜索框范围随 Tab 清楚标注“搜索全部 Skill”或“搜索我的 Skill”；分类按钮“全部/精选”继续存在。“官方精选”是默认首页的区块标题，不是全局精选资格定义。清空搜索并回全部恢复同一显式首页顺序。若保留“只看未安装”，必须对当前明确展示范围一致生效，并说明过滤后的结果不再强求16张。

**R5 不依赖搜索首屏取推荐。** 当前 `skill-plaza.js:333–336` 从 `items` 取所有精选并从普通区扣除；仅换一个筛选函数不足以保证名单齐全。工程必须在现有数据/API边界内确保显式名单能完整解析，网络fallback、分页追加、搜索返回次序、ratings回填不得造成首页漏卡/重排；不新建第二市场或路由服务。

**R6 旧资产保留与新封面。** 旧48条推荐记录、旧封面及此前三张变更图均保留，不批量取消精选、不删除、不覆盖。批准后的每个不同首页 Skill 新增专属封面文件；与旧封面重合的 Skill，使用独立首页封面引用/覆盖字段（具体命名由工程沿现有schema最小扩展），不能直接覆盖旧文件来满足“新封面”。新图必须依据本表实际功能，而不是截图未实现功能。

**R7 安装与依赖真实。** 卡片精选/推荐配置只控制发现，不自动安装或启用、不安装连接器、不改变用户安装状态。不把截图的开关状态硬编码进去。依赖展示区分“需某服务/工具”和“已配置/已可用”，没有实时证据只显示前者或待核实。

### P1 应当

- 新封面统一16:9、建议1280×720，符合现有 `object-fit:cover`，每图一个清晰功能主题；名称由DOM呈现，避免把长文写进图片；不生成 H3 字样、水印、虚构平台徽章/排名/收益。
- 工程生成时使用已批准的 OmniMux 生图路径，记录实际provider/model、prompt、输出文件、尺寸、权利/来源和检查结果，不把请求模型当实际provider证据；本阶段只交方向，不调用生成工具。
- 新文件命名绑定稳定ID/slug而非中文标题；封面、alt和详情文字可追溯到映射版本；新封面列表不触发旧图清理。
- 近似项在最终卡片描述/详情公开其范围，例如“排名快照采集”而非“趋势风险监控”。

### P2 可选，不扩大本轮

- 为配置维护提供简短的静态错误诊断；不新增运营后台、拖拽推荐管理器、连接器安装向导或独立电商业务执行能力。

## 6. 最小验收条件（工程阶段）

| 验收 | 最低通过条件 |
|---|---|
| 身份与完整性 | 最终每个配置ID都有实际可读包、唯一slug、准入来源和依赖说明；缺失5项及明显近似决策有处理结果；不能凭当前映射宣称16项已就绪。 |
| 精选分离 | 新增一个非首页 `recommended=true` 条目不改变默认首页推荐；它仍在分类/精选/全部搜索可发现。空名单不回退；非法/重复/非Skill ID验证失败。 |
| 顺序与数量 | 经批准16个不同真实身份齐备后默认首页恰好16且按截图顺序；远端乱序、分页、fallback、刷新、ratings回填不变；搜索/分类过滤允许少于16。 |
| 不丢旧资源 | 旧48个ID和精选资格仍在，旧封面路径/字节不变；默认首页下方与精选页可找回非首页精选，无重复卡；既有三张图及顶部/创建/安装修复无回退。 |
| 搜索/分类/我的 | 全部搜索能命中非首页精选；具体分类∩搜索正确；精选页包含旧48；我的仅真实已安装；切Tab、清空查询、回全部恢复正确范围和顺序。 |
| 封面 | 每个不同新首页ID有独立新封面并可解码，16:9；人工逐图核对实际功能和alt，无H3/假数据/假平台背书；旧图未覆盖。缺失包不生成“已完成能力”封面。 |
| 安装副作用 | 浏览首页/更改推荐配置不产生安装或连接器写入；模拟安装失败仍保留错误和未安装状态，沿用旧回归。 |
| 离线与真实UI | market相关测试/构建及所需边界验证通过；正式受管L2 + ego-browser + verify:live验证宽屏/分屏/375px、中英/深浅、16卡及交互。旧654通过不代替新增验收，viewer未解阻时明确BLOCKED，不能合入放行。 |

本次文档验收仅要求：`git diff --check`、新文档空白检查、所有选定SKILL.md路径与总库ID对应校验、任务树唯一新增本文件，HEAD与旧业务内容不变。不重复运行654测试，不启动Host或生成付费请求。

## 7. 主理人交工程的最小分工

1. **主理人**收口缺失来源与近似/重复决策；“全部首页推荐”的目标保留，但在真源不足时不得指令工程伪造16项。
2. **工程**可先实现独立显式名单、全局精选保留、搜索语义和新增首页封面引用这条不依赖缺失包的最小增量；不改外部资产库/OPC/opc-skills/Gxgen/OmniMux-skills真源，不运行现有带联网和绝对旧路径的批量catalog生成脚本来覆盖本库。
3. 身份准入与封面生成按确认后的不同真实包进行；本文件未授权复制外部正文、解除internal发布限制或修改外部连接器。新增内容留在本仓正式配置/分发机制，不写用户配置。
4. **QA**在新源码身份上补推荐列表、保留旧精选与封面测试；viewer依赖就绪后再正式L2，不拆除viewer或以替代服务器冒充当前App。
5. 本次无远端提交、push、PR、merge、部署；没有联系其他成员。产品分析可回传，产品整体“16项上首页+新封面”尚未实施，不能关闭原任务。
