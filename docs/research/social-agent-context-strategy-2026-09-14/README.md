# 社媒智能体「上下文获取策略」调研与落地规范

> 调研对象：竞品 SoPilot（sopilot.net）系统智能体全量 14 个 + 我方 OmniMux 浏览器扩展全量功能
> 调研日期：2026-09-14 ｜ 结论口径：以实测页面配置与仓库源码为准，推断处显式标注
> 复核素材：`.agent-reports/sopilot-context/competitor-context-matrix.md`（竞品逐条）、`.agent-reports/sopilot-context/our-context-audit.md`（我方逐条，含 `文件:行号` 证据）

## 0. 一句话结论

**竞品把「上下文」当成可配置的一等公民：每个智能体声明「在哪些页面出现（URL 白名单）+ 抓页面的哪几段（抽取表达式）+ 按钮挂在哪里（注入点选择器）+ 用户还要补什么（输入占位）」，四个字段独立配置、互不耦合；我们把上下文写成了一段固定 JS，17 个功能公用一个采集函数，抓不到就塞写死的主题——这就是「每次同一条结果」与「场景之间互相串味」的结构性根因。**

---

## 1. 竞品 SoPilot 的上下文模型（实测）

### 1.1 智能体配置面（来自 `sopilot.net/zh/myagent/<id>` 编辑器实测）

一个智能体由这些字段定义，其中**前四个直接决定上下文**：

| 字段（编辑器原文） | 作用 | 实测样例（`ai-tweet-imitation`） |
| --- | --- | --- |
| **支持的网站** | 激活页面白名单，一行一条，支持通配符与正则，`-` 前缀表示排除 | `x.com/home` |
| **操作元素的 DOM 选择器** | 上下文锚点：以哪个元素为上下文根 | `[data-testid="tweetTextarea_0"]` |
| **注入 SoPilot 按钮的 DOM 元素选择器** | UI 注入点 | `[data-testid="tweetButtonInline"]` |
| **系统提示词** | 提示词正文，内嵌**页面抽取表达式**（见 1.2） | 长文，末尾带 `for [data-testid="tweet"] { … }` 抓取块 |
| 用户提示词占位符 | 告诉用户还能补什么 | 「请输入你的要求或要参考的热点推文（建议在推特首页执行 SoPilot 插件，会自动获取首页热点推文）」 |
| 默认用户自定义提示词 | 用户级覆盖 | 空 |
| 操作类型 | 生成内容 / AI 对话 / AI 智能体 / 生成表单 / 录制视频 | 生成内容 |
| 访问类型 | 系统 / 公开 / 私有 | 系统 |

### 1.2 抽取表达式语言（竞品自研的小模板语言）

系统提示词里可内嵌以下表达式，运行时由插件在页面上下文执行、把结果拼进最终 prompt：

| 写法 | 语义 | 出处 |
| --- | --- | --- |
| `{title}` / `{content}` / `{description}` | 页面级字段（标题/正文/描述） | `ai-blog-comment.sys-prompt.md:30-31` |
| `{formHtml}` | 页面表单的 HTML 快照（给「代填表单」类智能体） | `ai-blog-comment.sys-prompt.md:32`、`ai-submitdir.sys-prompt.md:29` |
| `{textContent('选择器')}` | 取该选择器首个匹配元素的文本 | `ai-hot-tweets.sys-prompt.md:184-186` |
| `$textContent('选择器')` | 同上，块内写法（与花括号写法等价） | `ai-tweet-reply-high.sys-prompt.md:157` |
| `$attr('选择器', '属性名')` | 取属性（`href` / `aria-label` / `lang` …） | `twitter-velocity` 无关；竞品见 `ai-tweet-translate.sys-prompt.md:30`、`cmqolx85u000x1fbggacvllkj.sys-prompt.md:31` |
| `{innerHTML}` / `{outerHTML}` | 取整段 HTML | 编辑器字段说明原文 |
| `for 选择器 { … }` | 遍历匹配元素，逐条产出结构化字段 | `ai-tweet-imitation.sys-prompt.md:165-172` |
| `if 选择器 { … }` | 条件块（元素存在才产出字段） | `ai-tweet-translate.sys-prompt.md:29-35` |
| `数组[下标]` | 取第 n 个匹配的 href | `ai-tweet-translate.sys-prompt.md:30` |
| `${promptform}` | 用户表单回答的注入点 | `ai-submitdir.sys-prompt.md:23` |

**这是整个模型的关键**：上下文不是代码分支，而是提示词里的一段声明式抓取块；换页面、换字段、换格式都只改配置。

### 1.3 全量 14 个智能体的上下文矩阵（按上下文形态分类）

> 归纳口径：**14 个智能体只有 3 类真实上下文来源** —— ① 当前查看的推文详情（7 个）；② 首页信息流多条推文（1 个）；③ 私信会话流（1 个）；其余 5 个属特例（编辑框回读、表单页 ×2、附件按钮文本、推文+媒体直链）。逐条行号证据见附录矩阵。
>
> 三个「唯一」值得注意：**互动数据（点赞/转发/浏览）只有 `ai-tweet-imitation` 抽**；**作者名只有 2 个抽**（`ai-tweet-imitation`、`ai-tweet-translate`）；**媒体直链只有 `ai-tweet-translate` 拼得出来**（其余只取附件区的可读文本）。另有 2 个智能体用页面的 `lang` 属性决定输出语言——**语言判定与上下文抓取在竞品里是同一套机制**。

**A 类 · 读「当前查看的那条推文」（7 个）** — 白名单 `x.com/*/status/*`（部分加 `x.com/compose/post`）

| slug | 中文名 | 抽取表达式（关键选择器） |
| --- | --- | --- |
| `ai-tweet-reply-high` | Twitter生成高赞评论 | `{textContent('article[tabindex="-1"][data-testid="tweet"]')}` + `...tweetText']')}` + `{textContent('[data-testid="attachments"]')}` |
| `ai-tweet-comment` | Twitter 生成高质量评论 | 同上三件套 |
| `ai-tweet-reply` | 推特简短评论 | 同上；另带**语言判定** `if $attr('div[lang]:not([lang=""])','lang')` 与日文分支示例 |
| `ai-tweet-reply-follow` | 推特中文互关评论 | 同上三件套 |
| `twitter-reply-en` | 推特英文评论 | 同上三件套 |
| `cmqolx85u000x1fbggacvllkj` | Twitter回怼助手(带图) | 同上三件套 + `$attr('div[lang]:not([lang=""])','lang')` |
| `ai-tweet-threads` | 推文改写为推文串 | 同上三件套（输入是「一条推文 → 一条长推串」） |

**B 类 · 读「你正在写的那条 + 你正在看的那条」（1 个）** — 白名单 `x.com/*/status/*`

| slug | 中文名 | 抽取表达式 |
| --- | --- | --- |
| `ai-hot-tweets` | 推特改写爆款推文 | **同时给两份上下文让模型自选**：`{textContent('[data-testid="tweetTextarea_0"]')}`（发帖框里你自己写的） + `{textContent('[tabindex="-1"][data-testid="tweet"]')}`（当前打开的那条推文整卡） + `{textContent('[tabindex="-1"][data-testid="tweetText"]')}`（其正文） |

**C 类 · 读「首页信息流多条推文 + 互动数据」（1 个）** — 白名单 `x.com/home`

| slug | 中文名 | 抽取表达式 |
| --- | --- | --- |
| `ai-tweet-imitation` | Twitter生成热点推文 | `for [data-testid="tweet"] { author: $textContent('[data-testid="User-Name"]'); content: $textContent('[data-testid="tweetText"]'); for div[aria-label][role="group"] { stat: $attr('aria-label') } }` —— **作者 + 正文 + 互动数据（aria-label 里的点赞/转发/浏览数）逐条列出**，提示词要求模型「从提供的推文数据里挑最有传播潜力的热点，直接生成 1 条」 |

**D 类 · 读「会话消息流」（1 个）** — 白名单 `x.com/i/chat/*`

| slug | 中文名 | 抽取表达式 |
| --- | --- | --- |
| `ai-twitter-dm` | Twitter生成私信 | `for [data-testid="dm-message-list-container"] ul li { if div.justify-start { A说: $textContent(div.justify-start) } if div.justify-end { B说: $textContent(div.justify-end) } }` —— 会话双方历史消息成对喂入 |

**E 类 · 读「当前查看的推文」并抽媒体（1 个）** — 白名单 `x.com/*/status/*`

| slug | 中文名 | 抽取表达式 |
| --- | --- | --- |
| `ai-tweet-translate` | Twitter翻译英推Threads | `for [data-testid="tweet"] { author, content, if [data-testid="videoComponent"] { video: https://x.com/i/status/$attr(...)[3]/video/1 }, if [data-testid="card.layoutLarge.media"] { link: $attr(...,'href') }, if a[href$="/photo/1"] { image: ... } }` —— **正文 + 视频/大图卡片/图片三种媒体全抽** |

**F 类 · 无页面上下文，纯表单输入（2 个）** — `ai-blog-comment`（`{title}`+`{content}`+`{formHtml}`+用户表单）、`ai-submitdir`（`{formHtml}`+`${promptform}`）

**G 类 · 引用弹窗专用（1 个）** — 白名单 `x.com/compose/post`

| slug | 中文名 | 抽取表达式 |
| --- | --- | --- |
| `ai-retweet` | Twitter 中文引用转帖 | `{textContent('[data-testid="attachments"] button span')}` —— 直接取引用卡片里的文字 |

### 1.4 从竞品提炼的四条设计原则

1. **页面即上下文**：白名单决定「在什么页面用」，抽取表达式决定「抓什么」；用户不写字也有料。
2. **锚点优先于全文**：优先用「操作元素」和 `[tabindex="-1"]` 这类**语义锚点**（当前聚焦推文），而不是「整页第一个匹配」。
3. **结构化优于一整段文本**：首页场景按条产出 `author / content / stat` 三元组，模型自己做筛选；我方目前多是「一坨字符串」。
4. **用户输入是补充，不是唯一来源**：用户提示词占位符只负责「额外要求」，主料由页面提供；我方 8 个功能反倒完全不读用户输入，1 个功能只读用户输入。

---

## 2. 我方现状（审计摘要）

完整证据见 `.agent-reports/sopilot-context/our-context-audit.md`。核心事实：

- **一个采集函数服务 17 个功能**：`extractTwitterContext`（`plugins/omnimux-browser/extension/src/content/twitter-copilot/extractor.ts:85-171`）只产出 6 个字段（`scene` / `draftText` / `quotedTweetText` / `quotedAuthor` / `targetTweetText` / `targetAuthor` / `tweetUrl`）。
- **10 处写死主题**（`prompts.ts:40,46,62,67,83,88,104,109,123,147`）：发帖框为空就塞「分享关于效率工具与现代技术创新的思考」等固定主题 → 同一问题 → 同一类答案。**这是"每次同一条结果"的直接根因。**
- **`undefined` 直接进 prompt**：抓不到目标推文时字段保持 `undefined`，9 个功能无兜底，模型会读到字面量 `undefined`（`prompts.ts:255,260,276,281,297,302,316,335,340,356,361,377,382`）。
- **从整页第一个元素取上下文**：`composerContainer` 兜底到 `document`（`extractor.ts:93-102`）、回帖正文兜底到 `main` 区第一条（`:148-150`）、工作台 `page-sensor.ts:164` 恒取整页第一条推文、填入兜底取整页第一个输入框（`injector.ts:59-63`）。
- **采集了却送不出去的字段**：`quotedAuthor` 与 `tweetUrl` 采集后未进 `menu.ts:243-249` 的上下文信封，`background/index.ts:2071` 又把整个 `context` 丢弃——结构化上下文完全没到模型入口。
- **旁路功能更弱**：推速面板「一键抢评」完全不读被评推文，从 3 条写死话术里随机抽（`twitter-velocity/panel.ts:96,107-115`）。

### 2.7 跨插件交叉发现（扩展 × `omnimux-intercept`）

两侧同源于同一份 `sopilot-social-agents` 资产，但**都只用了资产的一小截**，且独立复现了同一种失败模式：

| 发现 | 证据 |
| --- | --- |
| CLI 侧把 175 行资产砍到只剩开头几行，丢掉「评论核心公式」 | 附录 `intercept-context-audit.md` F8 |
| 扩展侧把同一公式**写死**在代码里 | `twitter-copilot/prompts.ts:229-238` |
| 两侧都是「字段采集后到不了模型」：扩展丢 `quotedAuthor`/`tweetUrl`/`scene`；CLI 丢 `quotedTweetId`/`hasMedia`/`mediaUrls`/`views`/`createdAtMs` | 附录两份报告 |
| **两侧都不抓评论区**：CLI 的 replies 只当数字消费，扩展侧没有任何读取已有回复的选择器 | 附录 `our-context-audit.md`、`intercept-context-audit.md` |

> 结论：缺的不是某处代码，而是**「采集层 ↔ 提示词层」的字段契约**。这也是本文档 §4 要补的东西。抢评类功能的「竞争判断」目前两侧都只是本地公式推算，没有真实评论区信息——若竞品会读评论区，这是我方共同缺口。

---

## 3. 差距对照

| 维度 | 竞品 SoPilot | 我方现状 | 差距性质 |
| --- | --- | --- | --- |
| 激活范围 | URL 白名单（通配/正则/排除）声明式配置 | 按按钮位置 + 选择器启发式硬编码判定 | 架构级 |
| 上下文定义 | 提示词内声明式抽取表达式 | 单一 JS 函数 + 场景分支 | 架构级 |
| 抓取锚点 | 操作元素 + `[tabindex="-1"]` 语义锚点 | 部分正确（copilot 已用 `tabindex="-1"`），兜底退化为「整页第一个」 | 实现级 |
| 结构化程度 | 按条产出 author/content/stats | 单串文本，无互动数据 | 实现级 |
| 空上下文策略 | 页面为主料，用户输入为补充 | 写死主题 / `undefined` / 随机话术 | 实现级（**最痛**） |
| 上下文到模型 | 抽取结果拼进 system prompt | 采集对象被丢弃，只留拼好的字符串 | 架构级 |
| 多媒体 | 抽视频/大图/图片链接 | copilot 不抽；媒体能力在 media-hover 里另有实现 | 实现级 |

---

## 4. 统一上下文模型（Context Contract v1）

把我方改造为与竞品同构、但更贴合本地扩展的四层模型：

```
L1 页面层 Activation     { urlPatterns[], excludePatterns[] }            决定在哪些页面生效
L2 锚点层 Anchor         { anchorSelector, injectSelector, scope: nearest-ancestor | focused | page }
L3 抽取层 Extraction     { fields: { name, selector, from: text|attr|html, index, transform }[], list?: {...} }
L4 提示层 PromptInjection{ contextTemplate, userInputSlot, fallback: askUser | skip | pageOnly }
```

### 4.1 上下文对象（统一 schema）

```ts
type ContextSource = 'draft' | 'status' | 'feed' | 'quote' | 'dm' | 'form' | 'none'

interface PageContext {
  scene: string
  source: ContextSource           // 主料来自哪里（新增，必须显式）
  confidence: 'anchored' | 'fallback' | 'missing'   // 锚点质量（新增）
  status?: { author?: string; text?: string; stats?: string[]; url?: string; media?: string[] }
  feed?: Array<{ author?: string; text?: string; stats?: string[] }>
  quote?: { author?: string; text?: string }
  draft?: string
  dm?: Array<{ speaker: 'A' | 'B'; text: string }>
  form?: { title?: string; html?: string }
}
```

### 4.2 三条硬规则（写进代码与测试）

1. **不许凭空造主题**：`source === 'none'` 时禁止把写死主题当用户需求；必须走 `fallback` 策略（默认：提示用户先写主题，或改用页面主料）。
2. **不许 `undefined` 入 prompt**：所有插值统一走 `renderSlot(value, placeholder)`，`null/undefined/''` 一律替换为可读占位（如「（未取到原文）」），并在遥测里记一次 `context_missing`。
3. **锚点优先**：能拿到「点击控件所在容器 / `article[tabindex="-1"]` / 最近祖先卡片」时不得退化为整页第一个匹配；退化必须被记录并可观测。

### 4.3 场景 → 上下文映射（长期目标）

| 场景 | 主料（页面） | 补充（页面） | 用户输入位 | 空主料时的行为 |
| --- | --- | --- | --- | --- |
| 原创发新帖 | 首页信息流多条推文（作者+正文+互动数） | 当前页趋势词（可选） | 用户主题/想法 | 用信息流热点；仍为空则提示用户先写主题 |
| 引用转发 | 引用卡片正文 + 作者 | 附件/媒体 | 补充思路 | 取不到就提示「没读到被引用推文」 |
| 推文回帖（详情页） | `article[tabindex="-1"]` 整卡 + 附件 | 该推文的互动数据 | 补充角度 | 提示「未读到原推」并禁止生成 |
| 信息流快速互动 | 图标所在卡片（最近祖先）+ 互动数据 | —— | 补充角度 | 同上 |
| 推速面板一键抢评 | 该推文正文 + 作者 + 推速数据 | 面板算出的曝光预测 | —— | 无正文则禁用按钮 |
| 私信（规划） | 会话消息流（A说/B说） | 对方资料 | 目的 | 禁止无上下文生成 |
| 表单类（博客/目录） | 页面 `{title}` / `{content}` / `{formHtml}` | —— | 表单字段 | 页面无内容时禁用 |

---

## 5. 落地改造清单（分批，可独立交付）

### 第一批 · 止血（1 个 PR，改动小、收益最大）
1. `prompts.ts`：10 处写死主题改为 `renderSlot` 统一占位，**禁止把兜底主题当用户需求**；发帖场景空草稿时改为读取信息流热点（见下）或提示用户。
2. `extractor.ts`：`targetTweetText` 等字段初始化为 `''`，杜绝 `undefined` 进 prompt。
3. `menu.ts` 上下文信封补齐 `quotedAuthor` / `tweetUrl` / `scene`，`background/index.ts` 不再整体丢弃 `context`（至少透传给本机接口做结构化路由与审计）。

### 第二批 · 对齐竞品（2 个 PR）
4. **锚点优先**：`composerContainer` / `targetTweet` / `injector` / `dom-fill` / `page-sensor` 五处「整页第一个」改为「点击控件所在容器 → 最近祖先 → 明确失败」，失败进日志。
5. **补齐结构化字段**：按 §4.3 给每个场景补 `stats`（互动数据）、`media`（媒体链接）、`quote`（引用卡片），并新增「首页信息流多条推文」抽取（对应 C 类）。

### 第三批 · 平台化（1–2 个 PR）
6. 把抽取规则抽成声明式配置（§4 的 L1–L4），与竞品同构：新增场景只写配置，不写代码分支。
7. 抽取表达式语言按最小可用实现：`textContent` / `attr` / `for` / `if`（足够覆盖竞品全部 14 个 agent 的用法），并加一条 lint 保证配置里不含写死主题。

### 验收标准（每批通用）
- 单测：`context_missing` 时 prompt 不含 `undefined`、不含写死主题；锚点用例覆盖「同页多个输入框/多条推文」并断言取到正确对象。
- 真机：在 x.com 首页 / 详情页 / 引用弹窗 / 信息流各跑一次，用不同草稿验证输出随上下文变化（同一功能连点两次、分别写不同主题，输出必须不同）。
- 可观测：每次生成记录 `source` 与 `confidence`，为后续「上下文质量」看板留数据。

---

## 6. 复用指引（给后续做智能体的人）

1. 新做一个页面智能体，先回答四问：**在哪个页面（白名单）？锚点是什么（选择器）？抓哪几个字段（表达式）？用户还要补什么（占位）？**
2. 上下文缺了怎么办，必须在设计阶段决定三选一：**追问用户 / 只用页面 / 直接禁用**；永远不要「编一个主题」。
3. 抓取一律以「用户点击的那个控件」为锚点，不要用「整页第一个」。
4. 结构化字段优先于长文本拼接：能按条列举就按条列举（作者/正文/互动数），把筛选交给模型。
5. 参考实现：竞品 `ai-tweet-imitation`（首页多条）、`ai-hot-tweets`（双上下文并存）、`ai-tweet-translate`（媒体抽取）、`ai-twitter-dm`（会话流）。

## 7. 证据索引

| 素材 | 位置 |
| --- | --- |
| 竞品逐条矩阵（14 个智能体，含表达式原文与行号） | 本目录 `appendix-competitor-matrix.md` |
| 我方逐条审计（17 功能 + 6 旁路功能，含 `文件:行号`） | 本目录 `appendix-our-context-audit.md`；跨插件对照 `appendix-intercept-context-audit.md` |
| 竞品提示词本地副本（14 份，含抽取表达式） | `presets/tiktok-agent/skills/sopilot-social-agents/references/prompts/*.md` |
| 竞品清单元数据（slug / opType / websites） | `presets/tiktok-agent/skills/sopilot-social-agents/references/catalog.json` |
| 竞品线上编辑器实测（配置字段与真实取值） | 截图 `tmp/sopilot-context/myagent-editor-values.png`；智能体列表 `tmp/sopilot-context/ai-agent-list.png` |
| 我方采集函数 | `plugins/omnimux-browser/extension/src/content/twitter-copilot/extractor.ts:85-171` |
| 我方提示词组装 | `plugins/omnimux-browser/extension/src/content/twitter-copilot/prompts.ts` |
