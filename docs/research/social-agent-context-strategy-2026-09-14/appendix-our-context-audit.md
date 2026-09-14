# 我方浏览器扩展「上下文获取策略」审计报告

> 审计对象：`plugins/omnimux-browser/extension/src/content/**`（只读审计，未修改任何业务源码）
> 审计目的：与竞品 SoPilot 的上下文获取机制做逐项对照
> 审计日期：2026-09-14
> 证据纪律：每条结论后给 `文件:行号`；非直接引用代码的判定一律显式标注「推断」

---

## 0. 审计范围与调用链总览

```
用户点击推文输入框旁的幽灵图标（anchor.ts:128-133）
  → detectTwitterScene(anchorButton)            [extractor.ts:31-83]  判定 4 个场景
  → toggleCopilotMenu(btn, scene)               [menu.ts:99]          按场景过滤出功能菜单
  → 用户点某个功能项                             [menu.ts:179-189]
  → extractTwitterContext(anchorButton, scene)  [extractor.ts:85-171] ★上下文唯一采集点
  → item.generatePrompt(ctx, locale)            [prompts.ts]          ★上下文唯一消费点
  → requestLlmGeneration(...)                   [menu.ts:229-260]     经 background 转发本机引擎
  → injectTweetText(generated, anchorButton)    [injector.ts:39-140]  填回页面输入框
```

关键结论（先说结论）：**17 个功能共用同一个采集函数 `extractTwitterContext`，该函数只产出 6 个字段，其中 5 个字段是「页面里抓到的文本」；但 17 个功能对字段的消费极不均衡——5 个功能完全只用用户输入、7 个功能完全不用用户输入。**

---

## 1. 总表：twitter-copilot 4 个场景 × 17 个功能

场景定义与入口判定见 `extractor.ts:31-83`：

| 场景 | 中文名 | 判定依据（`extractor.ts` 行号） |
| --- | --- | --- |
| `POST_NEW` | 原创发新帖 | 发帖弹窗无被引卡片/内嵌推文 → `POST_NEW`（:46）；首页顶部发帖框占位符含「有什么新鲜事/happening」或按钮文案=发帖（:53-56, :73-74）；最终兜底 return（:82） |
| `POST_QUOTE` | 引用转发 | 弹窗内 `[data-testid="attachments"] [data-testid="tweetText"]` 命中（:36-38） |
| `REPLY_DETAIL` | 详情页回帖 | 回帖弹窗 + `hasFocalTweetBehind()`（页面仍留 `article[data-testid="tweet"][tabindex="-1"]`）（:42-44）；或 URL 命中 `/用户名/status/数字`（:19-21, :78） |
| `REPLY_FEED` | 信息流快速互动 | 回帖弹窗但详情页特征缺失（:44）；或按钮位于 `article[data-testid="tweet"]` 内部（:67-70） |

### 1.1 场景一 POST_NEW（5 个功能）

| # | 功能名 | 触发场景与条件 | 上下文从哪里取（函数名 + 关键选择器） | 取不到时发生什么 | 风险 |
| --- | --- | --- | --- | --- | --- |
| 1 | 爆款推文复刻 | `POST_NEW`；发帖框/发帖弹窗点图标 | `extractTwitterContext` → `draftText`，选择器链 `closest('[data-testid="tweetTextarea_0_label"]').parentElement` → `[role="dialog"]` → `form` → `article` → `document`（`extractor.ts:93-102`），取 `div[data-testid="tweetTextarea_0"][role="textbox"]` 或 `div[role="textbox"][contenteditable="true"]` 的 `textContent`（:100-106） | **塞写死主题**「分享关于效率工具与现代技术创新的思考」（`prompts.ts:46`；英文 `:40`）。无任何提示 | **高** |
| 2 | 行业长推串 (Threads) | 同上 | 同上（仅 `draftText`） | **写死**「深度教程与核心经验复盘」（`prompts.ts:67`） | **高** |
| 3 | 金句观点提炼 | 同上 | 同上（仅 `draftText`） | **写死**「很多时候越做加法产品越难用，极简才是硬功夫」（`prompts.ts:88`） | **高** |
| 4 | 热点借势发帖 | 同上 | 同上（仅 `draftText`） | **写死**「探讨当前技术工具的快速演进」（`prompts.ts:109`） | **高** |
| 5 | 地道英文原创 | 同上 | 同上（仅 `draftText`） | **写死**「Building useful developer tools and shipping fast」（`prompts.ts:123`） | **中** |

### 1.2 场景二 POST_QUOTE（4 个功能）

| # | 功能名 | 触发场景与条件 | 上下文从哪里取 | 取不到时发生什么 | 风险 |
| --- | --- | --- | --- | --- | --- |
| 6 | 增量视角补充 | `POST_QUOTE`；引用转发弹窗点图标 | `quotedTweetText` ← `dialog.querySelector('[data-testid="quoteTweet"]')` \|\| `article[data-testid="tweet"]` \|\| `[data-testid="attachments"]`，再取其内 `[data-testid="tweetText"]`（`extractor.ts:112-119`）；`quotedAuthor` ← 卡片内第一个 `a[href*="/status/"], a[role="link"][href^="/"]` 的路径首段（:121-128）；另叠加 `draftText` | 正文为空串 → prompt 出现「正文：」空白；作者回退写死「博主」（`prompts.ts:147`）/「author」（`:142`）；用户没写字时代补充思路写死「无特别指定，请给出高价值专业延伸」（`prompts.ts:147`） | **中** |
| 7 | 核心要点提炼 | 同上 | 仅 `quotedTweetText \|\| targetTweetText`（`prompts.ts:163`） | 两者皆空 → 原样渲染出 `undefined` 字样（见 §2.4） | **高** |
| 8 | 批判碰撞探讨 | 同上 | 仅 `quotedTweetText \|\| targetTweetText`（`prompts.ts:184`） | 同上 `undefined` | **高** |
| 9 | 真诚背书推荐 | 同上 | `quotedTweetText` + `quotedAuthor`（`prompts.ts:205, :210`） | 正文空白；作者写死「博主」（`prompts.ts:210`） | **中** |

### 1.3 场景三 REPLY_DETAIL（5 个功能）

| # | 功能名 | 触发场景与条件 | 上下文从哪里取 | 取不到时发生什么 | 风险 |
| --- | --- | --- | --- | --- | --- |
| 10 | 高赞神评生成 | `REPLY_DETAIL`；详情页主推评论区点图标 | `targetTweetText` ← 弹窗内 `article[data-testid="tweet"]` → `document.querySelector('article[tabindex="-1"][data-testid="tweet"]')` → 按钮最近 `article` → `document.querySelector('main article[data-testid="tweet"]')`（`extractor.ts:135-150`），再取内层 `[data-testid="tweetText"]`（:153-154）；`targetAuthor` ← `div[data-testid="User-Name"] a[role="link"]` 路径首段（:156-161） | 正文回退写死「行业最新动态」（`prompts.ts:239`）；作者回退写死「博主」（`:239`）；用户没写字时该段整段拼接消失（`prompts.ts:239` 三元表达式） | **中** |
| 11 | 专业深度探讨 | 同上 | 仅 `targetAuthor` + `targetTweetText`（`prompts.ts:260`） | **无兜底**：`targetTweetText` 为 `undefined` 时 prompt 原样出现 `undefined`（见 §2.4） | **高** |
| 12 | 同行互关建联 | 同上 | 仅 `targetAuthor` + `targetTweetText`（`prompts.ts:281`） | 作者写死「同行」（`prompts.ts:281`）；正文 `undefined` | **高** |
| 13 | 机智幽默回怼 | 同上 | 仅 `targetTweetText`（`prompts.ts:302`） | **无任何兜底、无作者**：正文 `undefined` | **高** |
| 14 | 地道英文评论 | 同上 | 仅 `targetAuthor` + `targetTweetText`（`prompts.ts:316`） | 作者写死「author」；正文 `undefined` | **高** |

### 1.4 场景四 REPLY_FEED（3 个功能）

| # | 功能名 | 触发场景与条件 | 上下文从哪里取 | 取不到时发生什么 | 风险 |
| --- | --- | --- | --- | --- | --- |
| 15 | 日常快速破冰 | `REPLY_FEED`；信息流里展开回复框点图标 | 仅 `targetTweetText`（`prompts.ts:340`） | **无兜底**：`undefined` 进 prompt | **高** |
| 16 | 共鸣同感认可 | 同上 | 仅 `targetTweetText`（`prompts.ts:361`） | **无兜底**：`undefined` 进 prompt | **高** |
| 17 | 提问追问互动 | 同上 | 仅 `targetTweetText`（`prompts.ts:382`） | **无兜底**：`undefined` 进 prompt | **高** |

### 1.5 非 copilot 功能（旁路，同样纳入审计）

| 功能 | 触发条件 | 上下文从哪里取 | 取不到时发生什么 | 风险 |
| --- | --- | --- | --- | --- |
| 推速角标 | 每个 `article[data-testid="tweet"]` 挂载（`twitter-velocity/index.ts:13-18`） | 以**该推文元素为根**作用域查询：浏览量 `a[href*="/analytics"]` 文本/aria-label 与 `div[role="group"]` aria-label（`extractor.ts:26-32`）；回复数 `button[data-testid="reply"]`（:51-57）；时间 `time[datetime]`（:75-80）；作者/正文 `div[data-testid="User-Name"]` / `div[data-testid="tweetText"]`（:97-101） | 浏览量解析不出 → `0`（:47）；无时间元素 → **默认 1 小时前** `Date.now() - 3_600_000`（:76）；作者 → 写死「推特用户」（:98）；无 `/status/` 链接 → **随机假 ID** `tweet-\${random}`（:93） | **中** |
| 推速小面板 | 点角标（`badge.ts:30-36`） | 复用角标数据；`predictedExposure` 由 `computeExposure(pace, hoursAlive, replies)` 计算（`extractor.ts:118`，常数在 `algorithm.ts:3-22`） | 无。面板内「抢评预估截流曝光」为公式推算值，非页面事实 | 低 |
| 一键抢评 | 面板点「一键抢评」（`panel.ts:82-86`） | **完全不取被评推文**：`handleOneClickComment` 的 `_data: TweetVelocityData` 参数带下划线标注为未使用（`panel.ts:96`），改为从 3 条**写死话术**里 `Math.random()` 抽一条填入（`panel.ts:107-115`） | 无兜底概念——永远生成同一批三条话术之一，与推文内容无关 | **极高** |
| 引用转发按钮 | 面板点「引用转发」（`panel.ts:88-93`） | 仅 `tweetEl.querySelector('button[data-testid="retweet"]').click()`（`panel.ts:119-121`），不生成任何文案 | 找不到按钮则静默无反应 | 低 |
| 浮动球 / 工作台 | FAB 挂载即注入（`fab-companion.ts:35-53`）；点球/拖拽后点击展开（:405-407） | `getFullContext()`（`fab-companion.ts:249`）→ `page-sensor.ts:194-213`：`url`、`title`、`platform`、`pageType`、`selectedText`、`author`、`postText`、`heroImage`；另叠加 `sniffViewportMedia()` 的视口媒体（`media-sniffer.ts:61-81`，最多 8 条，`SNIFF_MEDIA_LIMIT`） | `extractPostData` 与 `extractHeroImage` 均 try/catch 静默返回 `{}`/`undefined`（`page-sensor.ts:155-157, 188-191`）→ 上下文退化为「只有 url/title」 | **高** |
| 工作台「填回页面」 | iframe 发 `FILL_HOST_DOM`（`fab-companion.ts:453-462`）或原生侧栏消息（:525-530） | 不含页面上下文：只把 `text` 交给 `fillHostInput(text, detectPlatform())`（`dom-fill.ts:105`） | 定位不到输入框 → 复制到剪贴板并提示（`dom-fill.ts:109-124`） | 中 |
| 媒体悬浮胶囊 | 指针停在 ≥120px 的帖子媒体上（`classifier.ts:42` 的 `MIN_POST_MEDIA_SIZE_PX`；检测链 `detector.ts:297-349`） | 以**指针命中的那个元素**为准：`elementFromPoint` → `findMediaElement` 向上走（`payload.ts:457-472`）→ `normalizeMedia` 产出 `id/src/previewSrc/pageUrl/pageTitle/width/height/naturalWidth/naturalHeight/alt/capturedAt/sourceKind/attachable`（`payload.ts:379-405`） | 图片非 `http(s)` → 整条丢弃返回 `null`（`payload.ts:327-331`）；视频降级阶梯 `poster → direct → blob → frame → page`（`payload.ts:279-303`）；`blob` 外发时降级为页面链接（`actions.ts:28-38`） | 低 |

---

## 2. 重点问题清单

### 2.1 写死的默认值（用户没写字时塞固定主题）

**共 10 处字面量**（中文 5 + 英文 5），全部集中在 `prompts.ts` 的 `draftText` 兜底。这是「每次点同一个功能，生成结果高度雷同」的直接根因。

| 功能 | 行号 | 原文（逐字） |
| --- | --- | --- |
| 爆款推文复刻（zh） | `prompts.ts:46` | `userMessage: \`我的发帖主题或想法：\n${ctx.draftText \|\| '分享关于效率工具与现代技术创新的思考'}\`` |
| 爆款推文复刻（en） | `prompts.ts:40` | `Draft / Idea:\n${ctx.draftText \|\| 'AI agents and software evolution trends'}` |
| 行业长推串（zh） | `prompts.ts:67` | `userMessage: \`长文素材或主题：\n${ctx.draftText \|\| '深度教程与核心经验复盘'}\`` |
| 行业长推串（en） | `prompts.ts:62` | `Thread topic:\n${ctx.draftText \|\| 'Hard lessons learned in software development'}` |
| 金句观点提炼（zh） | `prompts.ts:88` | `userMessage: \`我的想法：\n${ctx.draftText \|\| '很多时候越做加法产品越难用，极简才是硬功夫'}\`` |
| 金句观点提炼（en） | `prompts.ts:83` | `Idea:\n${ctx.draftText \|\| 'Product simplicity always beats feature bloat'}` |
| 热点借势发帖（zh） | `prompts.ts:109` | `userMessage: \`发帖主题：\n${ctx.draftText \|\| '探讨当前技术工具的快速演进'}\`` |
| 热点借势发帖（en） | `prompts.ts:104` | `Core idea:\n${ctx.draftText \|\| 'Practical developer insights'}` |
| 地道英文原创 | `prompts.ts:123` | `userMessage: \`Topic / Draft:\n${ctx.draftText \|\| 'Building useful developer tools and shipping fast'}\``（该功能无 zh 分支，恒走英文） |
| 增量视角补充（zh） | `prompts.ts:147` | `My take: ${ctx.draftText \|\| 'Add distinct practical value'}` → 中文口径为「我的补充思路：${ctx.draftText \|\| '无特别指定，请给出高价值专业延伸'}」 |

**另一类写死默认值——身份/字段占位**（不是主题，但同样进 prompt）：

| 位置 | 原文 | 说明 |
| --- | --- | --- |
| `prompts.ts:239` | `正文：${ctx.targetTweetText \|\| '行业最新动态'}` | 抓不到主推正文时塞固定行业词 |
| `prompts.ts:232`（en） | `${ctx.targetTweetText \|\| 'Tech trends'}` | 同上 |
| `prompts.ts:142, 147, 205, 210` | `@${ctx.quotedAuthor \|\| '博主'}` / `\| 'author'` / `\| 'creator'` | 抓不到引用作者时伪造一个身份 |
| `prompts.ts:232, 239, 255, 260, 276, 281, 316` | `@${ctx.targetAuthor \|\| '博主'}` / `'author'` / `'同行'` / `'peer'` | 抓不到作者时伪造一个身份 |

> 说明：`extractor.ts:105` 在无输入框时给出的是**空字符串**而非 `undefined`，因此第 1–5 项的 `||` 兜底会被触发；而 `targetTweetText` 在 `targetTweet` 为空时**根本不会被赋值**（`extractor.ts:152-167` 整个块被 `if (targetTweet)` 包住），于是第 10–17 项拿到的是 `undefined`。两者行为不同，见 §2.4。

### 2.2 从「整页第一个匹配元素」取上下文

| # | 位置 | 代码 | 为什么可能取错 |
| --- | --- | --- | --- |
| 1 | `extractor.ts:93-102`（`composerContainer` 兜底到 `document`） | `anchorButton.closest('[data-testid="tweetTextarea_0_label"]')?.parentElement \|\| closest('[role="dialog"]') \|\| closest('form') \|\| closest('article') \|\| document`，随后 `composerContainer.querySelector('div[data-testid="tweetTextarea_0"][role="textbox"], div[role="textbox"][contenteditable="true"]')` | 前四级全部落空时容器==`document`，`querySelector` 返回**文档顺序第一个**可编辑 textbox。推文详情页/信息流同时存在多个编辑器（回复框、私信、评论区快捷回复）时，取到的可能不是图标所在的那个框 → `draftText` 是别人的草稿 |
| 2 | `extractor.ts:148-150`（回帖正文兜底） | `targetTweet = document.querySelector('main article[data-testid="tweet"]')` | 这是**信息流里第一条可见推文**，不是被回复的那条。详情页与回帖弹窗都失效时才走到这里，届时模型会对着错误的推文写「神评」 |
| 3 | `page-sensor.ts:164`（工作台 / 侧栏） | `const tweetArticle = document.querySelector('article[data-testid="tweet"]')` → `postText` / `author` | **无任何 `tabindex="-1"` 或场景限定**，恒取整页 DOM 顺序第一条推文。工作台在信息流里显示「已关联帖子上下文」时，关联的可能是屏幕外的第一条 |
| 4 | `page-sensor.ts:112`（heroImage） | `mainCol.querySelector('article[data-testid="tweet"]')` | 同上，封面图取的是整页第一条推文里的图 |
| 5 | `injector.ts:59-63`（填入兜底） | `if (!targetArea) { targetArea = document.querySelector('div[data-testid="tweetTextarea_0"][role="textbox"], ...') }` | 锚点容器内找不到输入框时，**退化为整页第一个输入框**——生成好的文案可能被填进另一个框 |
| 6 | `dom-fill.ts:52-59, 61-72` | 优先 `document.activeElement`（若可编辑）；否则按 `SELECTOR_REGISTRY[platform]` **按序第一个可见匹配**返回 | 工作台「填回页面」场景：`twitter` 白名单首项 `[data-testid="tweetTextarea_0"]`（:8）即整页第一个推文框，多框并存时可能填错对象 |
| 7 | `twitter-velocity/extractor.ts:84-93` | `const links = tweet.querySelectorAll('a[href*="/status/"]'); for (...) { 返回第一个 }` | 以推文为根，但**引用转推**的卡片内也含 `/status/` 链接；取到的是**被引用推文**的 ID/URL |
| 8 | `extractor.ts:121-128`（`quotedAuthor`） | `quoteCard.querySelector('a[href*="/status/"], a[role="link"][href^="/"]')` | 命中卡片内第一个链接。**推断**：X 引用卡片首链接通常是原作者，但也可能是媒体/外链卡内的链接 → 作者身份可能错 |

> 对照价值：竞品 SoPilot 若以「点击控件所在的那个编辑器/那条推文」为锚点，则第 1、5、6 项是我方明确落后点；第 2、3、4 项属于「当前推文 vs 信息流第一条」语义混用。

### 2.3 上下文来源分类：纯用户输入 / 完全不用用户输入

**（a）根本没有页面上下文，纯靠用户输入（1 个）**

| 功能 | 证据 | 后果 |
| --- | --- | --- |
| 爆款推文复刻 | `prompts.ts:40, 46` 只引用 `ctx.draftText`，全文不含 `targetTweetText` / `quotedTweetText` / `targetAuthor` | 用户不写字时，模型只拿到写死的固定主题（§2.1 第 1 条）。**它是唯一「没有页面推文也可用」的功能，也是唯一「每次同一结果」的功能** |

**（b）完全没取用户输入（9 个）**

以下功能的 `generatePrompt` 通读下来只引用 `ctx.targetTweetText`（或再加 `ctx.targetAuthor`），**从不引用 `ctx.draftText`**：用户在回复框里写的补充说明被静默丢弃。

| 功能 | 证据（仅出现 target* 字段） |
| --- | --- |
| 核心要点提炼 | `prompts.ts:163, 168` |
| 批判碰撞探讨 | `prompts.ts:184, 189` |
| 专业深度探讨 | `prompts.ts:255, 260` |
| 同行互关建联 | `prompts.ts:276, 281` |
| 机智幽默回怼 | `prompts.ts:297, 302`（连作者都不要） |
| 地道英文评论 | `prompts.ts:316` |
| 日常快速破冰 | `prompts.ts:335, 340` |
| 共鸣同感认可 | `prompts.ts:356, 361` |
| 提问追问互动 | `prompts.ts:377, 382` |

**统计口径**（共 17 个功能）：
- 读取 `draftText`：场景一 5 个 + 场景二 4 个（增量视角补充、真诚背书推荐）= **9 个**
- 完全不读 `draftText`：场景二 2 个（核心要点提炼、批判碰撞探讨）+ 场景三 4 个 + 场景四 3 个 = **9 个**
- 17 = 9 + 9 − 1（爆款推文复刻同时属于「只读用户输入」与「读取 draftText」两组，去重后计一次）
- 无页面上下文（只靠用户输入、不读任何页面推文）的仅 **1 个**：爆款推文复刻

### 2.4 一处必然出现的缺陷：`undefined` 直接进 prompt

`extractor.ts:152` 的 `if (targetTweet) { ... }` 把 `targetTweetText` 的赋值整块包住——抓不到目标推文时该字段**保持 `undefined`**，而不是空字符串。

而场景三/场景四的多个功能直接模板插值、无 `||` 兜底：

| 行号 | 原文 | 抓不到推文时实际发出的内容 |
| --- | --- | --- |
| `prompts.ts:255` | `userMessage: \`Original tweet by @${ctx.targetAuthor \|\| 'author'}:\n${ctx.targetTweetText}\`` | `Original tweet by @author:\nundefined` |
| `prompts.ts:260` | `userMessage: \`原推内容：\n作者：@${ctx.targetAuthor \|\| '博主'}\n正文：${ctx.targetTweetText}\`` | `原推内容：\n作者：@博主\n正文：undefined` |
| `prompts.ts:276, 281` | 同上结构 | 含 `undefined` |
| `prompts.ts:297, 302` | `UserMessage: \`Tweet:\n${ctx.targetTweetText}\`` / `\`要回应的推文：\n${ctx.targetTweetText}\`` | `Tweet:\nundefined` |
| `prompts.ts:316` | `` `Original tweet by @${ctx.targetAuthor || 'author'}:\n${ctx.targetTweetText}` `` | 含 `undefined` |
| `prompts.ts:335, 340` | `` `Tweet:\n${ctx.targetTweetText}` `` / `` `推文正文：\n${ctx.targetTweetText}` `` | 含 `undefined` |
| `prompts.ts:356, 361` | 同上 | 含 `undefined` |
| `prompts.ts:377, 382` | 同上 | 含 `undefined` |
| `prompts.ts:163, 168, 184, 189` | `` `Quoted tweet:\n${ctx.quotedTweetText || ctx.targetTweetText}` `` | 两个都空 → 含 `undefined` |

对比：场景二的「增量视角补充」（`prompts.ts:142, 147`）与场景三的「高赞神评生成」（`:232, 239`）**有** `|| '行业最新动态'` 类兜底，所以同样抓不到时它们不会输出 `undefined` 字样——**同一个数据源，两种截然不同的失败表现**，说明兜底策略是逐条手写而非统一约定。

### 2.5 「当前查看的推文」vs「信息流里的某条」判定依据

| 取的是「当前查看的推文」 | 判定依据 | 证据 |
| --- | --- | --- |
| copilot 场景三（详情页回帖） | 1) 弹窗内 `article[data-testid="tweet"]`；2) **`article[tabindex="-1"][data-testid="tweet"]`**——`extractor.ts:139-140` 注释自陈「official Twitter gives the focal parent tweet tabindex="-1"」；3) `hasFocalTweetBehind()` 用同一选择器反证详情页入口（`:27-29`） | `extractor.ts:27-29, 43-44, 135-150` |
| copilot 场景四（信息流就地回复） | 按钮**最近祖先** `article[data-testid="tweet"]`（`:143-145`），再回退到主区第一条（`:148-150`）。用「最近祖先」实现了「点哪条评哪条」 | `extractor.ts:67-70, 143-145` |
| copilot 场景二（引用转发） | 作用域限定在 `[role="dialog"]` 内 | `extractor.ts:110-116` |
| 推速角标 / 面板 | 以被扫描的 `article` 元素为根，**每条推文一个角标**（`twitter-velocity/index.ts:13-18` → `badge.ts:7-12`） | 同上 |
| 媒体悬浮胶囊 | `document.elementFromPoint(x, y)` 命中 → 向上找最近 `img/video`（`detector.ts:222, 297-349`；`payload.ts:457-472`） | 以指针为准，最精确 |

| 取的是「信息流里的某条」（语义混用） | 判定依据 | 证据 |
| --- | --- | --- |
| 工作台的 `postText` / `author` | `document.querySelector('article[data-testid="tweet"]')` —— **无 tabindex、无场景、无作用域限定** | `page-sensor.ts:164-172` |
| 工作台的 `heroImage` | `mainCol.querySelector('article[data-testid="tweet"]')` —— 同样无限定 | `page-sensor.ts:112-122` |
| copilot 回帖正文的三级兜底 | `document.querySelector('main article[data-testid="tweet"]')` | `extractor.ts:148-150` |
| 推速的推文 ID/URL | 推文根内第一条 `/status/` 链接（引用卡片会抢先命中） | `twitter-velocity/extractor.ts:84-93` |

**结论**：copilot 侧对「哪条推文」判得较准（尤其 `tabindex="-1"` 这个官方锚点用得很好）；**工作台侧完全没做这个区分**——同一个产品里两套上下文标准。这是与竞品对照时最容易被抓的差异点。

### 2.6 采集了却没有真正生效的字段（额外发现）

| 字段 | 采集处 | 断点 | 后果 |
| --- | --- | --- | --- |
| `quotedAuthor` | `extractor.ts:126` | `menu.ts:243-249` 的 `context` 信封**只装** `targetTweetText` / `targetAuthor` / `draftText` / `quotedTweetText` / `itemId` —— **不含 `quotedAuthor`** | 提示词里 `ctx.quotedAuthor` 恒为空 → 永远回退写死「博主」（`prompts.ts:142, 147, 205, 210`） |
| `tweetUrl` | `extractor.ts:165` | 同上，未进信封 | 采集了完全未被消费 |
| `scene` | `types.ts:8` | 同上，未进信封 | 后端无法按场景路由 |
| `context` 整个对象 | `menu.ts:243-249` | `background/index.ts:2071` 只取 `systemPrompt` 与 `userMessage`，`context` 被**整体丢弃**后转本机 `/omnimux/text/complete`（:2090-2094） | 结构化上下文完全没到模型入口，模型只看到拼好的字符串 |

> **推断**：`requestLlmGeneration` 的 `context` 字段设计意图是给后端做结构化路由/审计，但当前实现中它是一段死数据。若竞品把结构化上下文（作者、推文 ID、场景）一并交给模型或后端，则此处是架构级差距。

---

## 3. 每个场景的上下文数据字典

字段唯一来源：`TwitterContext`（`types.ts:7-21`）；唯一赋值处：`extractTwitterContext`（`extractor.ts:85-171`）。

### 3.1 通用字段

| 字段名 | 来源选择器 / 语句 | 赋值行号 | 示例值形态 |
| --- | --- | --- | --- |
| `scene` | 由 `detectTwitterScene(anchorButton)` 决定，直接写入 | `extractor.ts:87` | `'POST_NEW'` |
| `draftText` | 容器（见 §2.2 第 1 项）内 `div[data-testid="tweetTextarea_0"][role="textbox"], div[role="textbox"][contenteditable="true"]` 的 `textContent.trim()`；无输入框时留空串 | `extractor.ts:88, 105-106` | `"今天想聊聊 AI 工具"` / `""` |

### 3.2 场景二 POST_QUOTE 追加字段

| 字段名 | 来源选择器 / 语句 | 赋值行号 | 示例值形态 |
| --- | --- | --- | --- |
| `quotedTweetText` | `dialog.querySelector('[data-testid="quoteTweet"]') \|\| dialog.querySelector('article[data-testid="tweet"]') \|\| dialog.querySelector('[data-testid="attachments"]')`，取其内 `[data-testid="tweetText"]`.textContent，缺失则退该卡片整体 textContent | `extractor.ts:112-119` | `"我们刚刚发布了 v2……"` |
| `quotedAuthor` | 同上卡片内 `a[href*="/status/"], a[role="link"][href^="/"]` 的 href 首段（`/^\/([^/]+)/`） | `extractor.ts:121-128` | `"elonmusk"`（**当前到不了模型**，见 §2.6） |

### 3.3 场景三 / 四 REPLY_DETAIL / REPLY_FEED 追加字段

| 字段名 | 来源选择器 / 语句 | 赋值行号 | 示例值形态 |
| --- | --- | --- | --- |
| `targetTweetText` | `targetTweet` 内 `[data-testid="tweetText"]`.textContent.trim()；`targetTweet` 的解析顺序见 §2.5 | `extractor.ts:152-154` | `"为什么大多数 AI 产品会失败……"` |
| `targetAuthor` | `targetTweet` 内 `div[data-testid="User-Name"] a[role="link"]` 的 href 去前导斜杠后再按 `/` 切首段 | `extractor.ts:156-161` | `"levelsio"` |
| `tweetUrl` | `targetTweet` 内**第一个** `a[href*="/status/"]` 的绝对 href（元素为 `HTMLAnchorElement` 时取 `.href`） | `extractor.ts:163-166` | `"https://x.com/levelsio/status/1234…"`（**当前到不了模型**） |

### 3.4 实际拼进模型输入的字符串（真正的「数据字典」）

模型只收到两个字符串（`background/index.ts:2071-2094`）。以场景三「高赞神评生成」为例（`prompts.ts:236-239`）：

- `systemPrompt` = 角色设定 + 核心公式 + `STRICT_ZH_RULES`（`prompts.ts:8-14`，含 45~85 汉字、禁思考过程等硬约束）
- `userMessage` 模板：

```
楼主推文内容：
作者：@{targetAuthor || '博主'}
正文：{targetTweetText || '行业最新动态'}

{ctx.draftText ? `我的补充想法：${ctx.draftText}` : ''}
```

以场景四「日常快速破冰」为例（`prompts.ts:340`）：

```
推文正文：
{targetTweetText}          ← 无兜底，缺失即 "undefined"
```

### 3.5 其他功能的上下文数据字典

| 功能 | 喂给模型/下游的字段 | 来源 | 赋值/引用行号 |
| --- | --- | --- | --- |
| 推速角标 | `tweetId`(可能为随机值), `author`, `url`, `text`, `views`, `replies`, `createdAtMs`, `hoursAlive`, `pace`, `tier`, `predictedExposure` | 各 `extract*` 函数 | `twitter-velocity/extractor.ts:120-132` |
| 一键抢评 | **无任何来自被评推文的字段** | 写死话术数组随机取 | `twitter-velocity/panel.ts:107-115` |
| 浮动工作台 | `url, title, platform, platformLabel, pageType, selectedText, author, postText, heroImage, timestamp` + `media[]`（`id,type,src,previewSrc,alt,width,height`，≤8 条） | `getFullContext()` + `sniffViewportMedia()` | `page-sensor.ts:202-213`；`media-sniffer.ts:45-59, 61-81` |
| 媒体悬浮胶囊 | `id, type, src, previewSrc, pageUrl, pageTitle, width, height, naturalWidth, naturalHeight, alt, capturedAt, sourceKind, attachable` | `normalizeMedia()` | `payload.ts:389-404` |
| 选中文本（侧栏） | `text, truncated, title, url` | `readSelectionCapture()` | `selection.ts:108-114` |

---

## 4. 与 SoPilot 对照时应重点拿出的三条

1. **锚点精度**：我方 copilot 用「图标所在编辑器往上 14 层找容器」再退化为整页第一个 textbox（`extractor.ts:8-17, 93-102`），工作台则完全无锚点（`page-sensor.ts:164`）。竞品若以「用户点击的控件」为唯一锚点，这是最直接的能力差。
2. **无上下文时的行为**：我方 5 个场景一功能「静默塞固定主题」，9 个回复类功能「静默发 `undefined`」。竞品若选择「不生成并提示」，则我方在体验与可信度上双重落后。
3. **一键抢评是唯一「零上下文」的生成动作**：`panel.ts:96-115` 用 `Math.random()` 从 3 条写死话术里抽一条，参数里连推文数据都没接（`_data` 下划线标注未使用）。这在竞品对标中是最刺眼的一条，且文案与推文内容必然无关。

---

## 5. 与 `omnimux-intercept` 的交叉对照（简要）

对照材料：同目录 `intercept-context-audit.md`（`plugins/omnimux-intercept/**` 的独立只读审计，219 行）。

### 5.1 母线同源：同一批 SoPilot 资产、同一批功能 id

| 对照项 | 浏览器扩展（本报告） | CLI 插件（intercept） |
| --- | --- | --- |
| 声称的资产来源 | `prompts.ts:3` 注释：「Powered by self-built Twitter skills (sopilot-social-agents)」 | `prompt-templates.js:19-20, 95-100` 运行期按路径读 `presets/.../sopilot-social-agents/references/prompts/*.sys-prompt.md` |
| 功能 id | `ai-retweet`、`ai-tweet-reply-high`、`ai-tweet-reply` 等 17 个（`prompts.ts` 各 `id:` 字段） | 同名资产 `ai-tweet-reply-high.sys-prompt.md`、`ai-retweet.sys-prompt.md` |
| 取数方式 | 浏览器 DOM 选择器（`[data-testid="tweetText"]` 等） | OpenCLI 子进程时间线 JSON（`opencli-source.js:83`） |
| 硬编码兜底 | 10 处字面量（本报告 §2.1） | 10 处字面量（intercept 报告 F6） |

### 5.2 同一套方法论，两边都只用了「一小截」

- intercept 侧：`extractSystemPrompt` 只取 `## 系统提示词` 到下一个 `##` 之间的内容，资产文件 175 行里约 130 行方法论（评论核心公式、思考流程、写作要求、生成策略）被丢弃（`prompt-templates.js:75-87`；详见 intercept 报告 F8）。
- 我方扩展侧：**同名的「高赞神评生成」把核心公式直接写进了 systemPrompt**（`prompts.ts:229-231` 英文版逐字含 `The Golden Formula: Comment Value = Information Delta × Emotional Resonance × Clarity`；中文版 `:236-238` 含「核心公式：评论价值 = 信息增量 × 情绪共鸣 × 表达清晰度」）。
- **结论（推断）**：两边消费同一份资产的**不同碎片**——CLI 侧拿到的是开头几行且丢了公式，扩展侧拿到了公式却与资产其余部分脱钩。资产没有单一真源，改动任一侧不会同步。

### 5.3 两边共同的结构性缺陷：字段「采集了但到不了模型」

| 侧 | 采集到的字段 | 断点 | 后果 |
| --- | --- | --- | --- |
| 扩展 | `quotedAuthor`、`tweetUrl`、`scene` | `menu.ts:243-249` 信封未装；`background/index.ts:2071` 整体丢弃 `context` | 提示词作者恒为写死「博主」（本报告 §2.6） |
| intercept | `quotedTweetId`、`hasMedia`、`mediaUrls`、`metrics.views`、`createdAtMs` | 无任何消费点（intercept 报告 F13） | 提示词不含被引用推文内容与媒体信息 |

同一种失败模式在两套实现里独立复现，说明问题出在「采集层与提示词层之间缺少字段契约」，而不是某一处的疏漏。

### 5.4 关键差异：评论区

- intercept 侧**全程不抓评论区**：`replies` 只以数字形态消费，无任何读取回复内容文本的路径（intercept 报告 F1，证据 `tweet.js:341`、`comment/prompt-builder.js:99`）。
- 我方扩展侧同样如此：copilot 的 `targetTweetText` 取的是**被回复的主推**（`extractor.ts:153-154`），**没有任何读取已有回复/评论内容的选择器**。
- **对照价值**：竞品 SoPilot 若在生成高赞评论前会读取评论区已有讨论（避免撞车、做增量），则这是我方**两侧都缺失**的能力，且缺在同一个位置——「抢评」的竞争判断目前只有 intercept 侧一个本地算法近似值（`algorithm.js:112`），扩展侧的「抢评预估截流曝光」同样是公式推算（`algorithm.ts:39-58`），两者都不是真实评论区信息。

### 5.5 一条残留证据链

intercept 报告 F9 发现资产文件 `ai-retweet.sys-prompt.md:35` 含浏览器 DOM 选择器字面量 `{textContent('[data-testid="attachments"] button span')}`；而我方扩展 `extractor.ts:36, 112-116` 正是用 `[data-testid="attachments"]` 定位引用卡片。**推断**：这批资产最初是为浏览器页面取数设计的，CLI 侧是后来接入的消费方，因此资产里残留了 DOM 语法。这一点支持 §5.1 的「同源」判断。

---

## 6. 未覆盖的部分

| 项 | 原因 / 状态 |
| --- | --- |
| `plugins/omnimux-intercept/**` 逐行细节 | 由独立子代理完成，见 `intercept-context-audit.md`（本报告 §5 只做交叉对照） |
| `tiktok-scene/**` | 不在本次任务范围（任务只列 twitter 相关 + fab/media/dom-fill） |
| `snapshot.ts`（页面文本快照） | 属页面快照链路，与「生成文案的上下文」非同一路径，未展开 |
| 端到端真实浏览器复现 | 任务要求只读、不跑测试、不联网，未做运行时验证；§2.1/§2.2/§2.4 的行号结论均为静态阅读所得，与 2026-09-14 13:59 的一次人工排查记录（「取整页第一个输入框」）互相印证 |
| background 下游 `/omnimux/text/complete` 的实际行为 | 只读到调用点（`background/index.ts:2087-2094`），未执行、未验证服务端是否再补上下文 |
| SoPilot 侧真实实现 | 本报告只审计我方；对照所需竞品机制未在本仓内，未获取。竞品行为均为条件式表述（「若竞品…则…」），非事实断言 |
