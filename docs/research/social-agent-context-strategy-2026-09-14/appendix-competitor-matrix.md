# SoPilot 社媒智能体「上下文获取策略」竞品拆解报告

- **分析对象**：SoPilot（sopilot.net）14 个社媒智能体
- **素材来源（全部本地，未联网）**：
  - 提示词真源：`presets/tiktok-agent/skills/sopilot-social-agents/references/prompts/*.md`（14 个文件）
  - 清单元数据：`presets/tiktok-agent/skills/sopilot-social-agents/references/catalog.json`
  - 技能入口：`presets/tiktok-agent/skills/sopilot-social-agents/SKILL.md`
- **证据约定**：`文件:行号` 表示该提示词 md 的行号；元数据用 `catalog.json → <键名>`。凡无直接证据的结论一律标注 **【推断】**。
- **覆盖**：14 / 14 个 agent（`catalog.json:5` `count: 14`，与 prompts 目录文件数一致）。

---

## 0. 核心结论（先看这 6 条）

| # | 结论 | 证据 |
| :-- | :--- | :--- |
| 1 | SoPilot 的上下文获取**不是通用的网页正文抓取，而是一套写在系统提示词里的“页面抓取模板语言”**——模板字符串与系统提示词同属一个 prompt 字段，运行时代码补齐后作为 prompt 一部分喂给模型。 | 各 md 的「系统提示词」段末直接内嵌模板；`catalog.json → agents[].sysPromptLen`（如 `ai-tweet-reply-high` 2540、`ai-tweet-imitation` 1370）与 md 中「系统提示词 + 模板」正文字符数吻合（误差 ≤ ~50 字符，见 §6.1）【推断：长度吻合推得二者同串】 |
| 2 | **14 个 agent 只有 3 类真实上下文来源**：① 当前查看的推文详情（7 个）；② 首页信息流多推文（1 个）；③ 私信会话流（1 个）。其余 5 个分别是「编辑框回读」「表单页元数据 ×2」「附件按钮文本（异常样本）」「推文+媒体直链」。 | 见 §4 分类表；`catalog.json → agents[].websites` |
| 3 | **互动数据（点赞/转发/回复数）只有 1 个 agent 显式抽取**：`ai-tweet-imitation` 用 `$attr('aria-label')` 读互动按钮组的 aria-label。其余 13 个都不点名要互动数。 | `ai-tweet-imitation.sys-prompt.md:169-171` |
| 4 | **作者名只有 2 个 agent 显式抽取**（`ai-tweet-imitation`、`ai-tweet-translate`），私信 agent 额外抽对端用户名（`ai-twitter-dm`）。 | `ai-tweet-imitation.sys-prompt.md:167`；`ai-tweet-translate.sys-prompt.md:27`；`ai-twitter-dm.sys-prompt.md:30` |
| 5 | **媒体直链只有 1 个 agent 拼得出来**：`ai-tweet-translate` 用 video / card / photo 三路 `$attr(...,'href')` 拼绝对 URL。其余 agent 只取 `[data-testid="attachments"]` 的**可读文本**，拿不到媒体 URL。 | `ai-tweet-translate.sys-prompt.md:29-37`；其余见各 agent 模板最后一行 |
| 6 | **两个 agent 的模板里写着“输出语言 = 一段抓取伪代码”**，即“语言判定”与“上下文抓取”在 SoPilot 里是同一个机制（读 DOM 的 `lang` 属性决定模型用什么语言输出）。 | `ai-tweet-reply.sys-prompt.md:22-31`；`cmqolx85u000x1fbggacvllkj.sys-prompt.md:30-32` |

---

## 1. 总表（一行一个 agent）

| # | slug | 中文名 | opType | 激活页面（websites 原样） | 上下文来源（一句话） | 抽取出的上下文字段 | 是否要求用户补充输入 |
| :-- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `ai-tweet-reply-high` | Twitter生成高赞评论 | chat | `x.com/*/status/*`、`x.com/compose/post` | 读当前详情页 `/status/` 被聚焦的那条推文（整块 + 正文 + 附件文本） | 焦点推文整块文本、推文正文、附件区文本 | 有占位符但**非必需**：`请输入要评论的原始推文内容`（L163-165） |
| 2 | `ai-tweet-comment` | Twitter 生成高质量评论 | chat | `x.com/*/status/*`、`x.com/compose/post` | 同 1（完全相同的三元组模板） | 焦点推文整块文本、推文正文、附件区文本 | 有占位符，同上（L40-42） |
| 3 | `ai-tweet-reply-follow` | 推特中文互关评论 | genContent | `x.com/*/status/*`、`x.com/compose/post` | 同 1 | 焦点推文整块文本、推文正文、附件区文本 | 有占位符，同上（L40-42） |
| 4 | `cmqolx85u000x1fbggacvllkj` | Twitter回怼助手(带图) | genContent | `x.com/*/status/*` | 同 1 + 额外用 `$attr(div[lang],'lang')` 判定回复语言 | 焦点推文整块文本、推文正文、附件区文本、**正文语言码** | 有占位符：`请输入需要回怼的推文内容`（L67-69） |
| 5 | `ai-tweet-reply` | 推特简短评论 | genContent | `x.com/*/status/*`、`x.com/compose/post` | 同 1，另加一段“仅日文推文”的 `if` 分支模板 | 焦点推文整块文本、推文正文、附件区文本、`div[lang="ja"]` 正文、正文语言 | **无** `## 用户提示词占位符` 段，`catalog.json → agents[].userPromptLen = 0` |
| 6 | `twitter-reply-en` | 推特英文评论 | genContent | `x.com/*/status/*`、`x.com/compose/post` | 同 1（简化三元组，无 for/if） | 焦点推文整块文本、推文正文、附件区文本 | 有占位符（L35-37） |
| 7 | `ai-tweet-threads` | 推文改写为推文串 | chat | `x.com/*/status/*` | 同 1（简化三元组，无 for/if） | 焦点推文整块文本、推文正文、附件区文本 | 有占位符：`请输入你的推文threads创作需求`（L37-39） |
| 8 | `ai-tweet-translate` | Twitter翻译英推Threads | chat | `x.com/*/status/*` | 遍历当前页所有推文，逐条取作者/正文/**视频·卡片·图片直链** | tweet 序号、作者名、正文、视频 URL、卡片链接、图片 URL | 有占位符（L40-42） |
| 9 | `ai-hot-tweets` | 推特改写爆款推文 | chat | `x.com/*/status/*` | **先回读当前编辑框 `tweetTextarea_0`，再补焦点推文两级文本** | 编辑框已有内容、焦点推文整块文本、推文正文 | 有占位符，且明确“建议用插件自动读取当前推文内容”（L188-190） |
| 10 | `ai-tweet-imitation` | Twitter生成热点推文 | genContent | `x.com/home` | 遍历首页信息流所有推文卡片，取作者/正文/**互动数** | tweet 序号（`tweet$index`）、作者名、正文、互动统计（aria-label） | 有占位符：`请输入你的要求或要参考的热点推文`（L174-176） |
| 11 | `ai-twitter-dm` | Twitter生成私信 | genContent | `x.com/i/chat/*` | 读私信会话：对端用户名 + 逐条消息按左右对齐区分 A说/B说 | 对端用户名、A 侧消息文本、B 侧（自己）消息文本 | 有占位符：`请输入您的私信问题或要求`（L44-46） |
| 12 | `ai-retweet` | Twitter 中文引用转帖 | genContent | `x.com/compose/post` | **只取附件区按钮里的文字**（异常样本，不读推文正文） | `[data-testid="attachments"] button span` 的文本 | 有占位符：`请输入要引用转发的原始推文内容`（L37-39） |
| 13 | `ai-blog-comment` | AI博客评论助手 | genForm | 全部（`catalog.json → websites: []`） | 读**当前页面级元数据** + 表单 HTML，无推文上下文 | 页面标题 `{title}`、页面内容 `{content}`、表单 HTML `{formHtml}` | **有实质默认文案**：`ai-blog-comment.sys-prompt.md:41-50`（253 字符，`catalog.json → userPromptLen: 253`） |
| 14 | `ai-submitdir` | AI提交目录助手 | genForm | 全部（`catalog.json → websites: []`） | 只读**表单 HTML** + 用户填的产品信息表单 | 表单 HTML `{formHtml}`、产品信息字段 `${promptform}` | **有实质默认文案**：`ai-submitdir.sys-prompt.md:37-52`（794 字符，`catalog.json → userPromptLen: 794`） |

> 说明：`websites` 一列同时来自 `catalog.json → agents[].websites` 与各 md 末尾「表单配置 → 支持的网站」；两者**逐字一致**（唯一差异是 `ai-blog-comment` / `ai-submitdir` 在 md 中写作「全部」、在 catalog 中记为 `[]`）。opType 取自 `catalog.json → agents[].opType`，与各 md frontmatter `opType` 一致。14 个 agent 的 `accessType` 全部为 `system`（`catalog.json`）。

---

## 2. 抓取模板语言规格（跨 agent 归纳）

这套模板语言是 SoPilot 机制的核心，共出现 **3 种取值语法 + 3 种循环目标 + 4 种条件形态**。

### 2.1 取值语法三种变体

| 变体 | 写法 | 出现位置（文件:行号） |
| :--- | :--- | :--- |
| A. 花括号插值 | `{textContent('<选择器>')}` | 10 个文件（见下）；`ai-tweet-comment.sys-prompt.md:36-38` 等 |
| B. 美元前缀函数 | `$textContent('<选择器>')` | `ai-tweet-imitation.sys-prompt.md:167-168`；`ai-tweet-translate.sys-prompt.md:27-28`；`ai-twitter-dm.sys-prompt.md:35,38`；四个三元组 agent 的循环体内（如 `ai-tweet-reply-high.sys-prompt.md:157`） |
| C. 裸函数调用（无 `$` 无花括号） | `textContent('<选择器>')` | **仅** `ai-tweet-reply.sys-prompt.md:26,27,28` |

### 2.2 属性取值 `$attr` 的四种用法

| 用法 | 原文 | 证据 |
| :--- | :--- | :--- |
| 单参数（读当前迭代元素属性） | `stat: $attr('aria-label')` | `ai-tweet-imitation.sys-prompt.md:170` |
| 双参数（选择器 + 属性名） | `link: $attr('[data-testid="card.layoutLarge.media"] a', 'href')` | `ai-tweet-translate.sys-prompt.md:33` |
| 结果数组下标取值 | `$attr('[data-testid="User-Name"] a[dir="ltr"]','href')[3]` | `ai-tweet-translate.sys-prompt.md:30` |
| 当作布尔条件（选择器即参数） | `if $attr('div[lang="ja"]') { // 只处理日文推文`<br>`$attr('div[lang]:not([lang=""])', 'lang')` | `ai-tweet-reply.sys-prompt.md:24`；`cmqolx85u000x1fbggacvllkj.sys-prompt.md:31` |

### 2.3 循环目标三种

| 目标选择器 | 语义【推断】 | 证据 |
| :--- | :--- | :--- |
| `article[data-testid="tweet"]` + `if attr('tabindex') == '-1' { break }` | 遍历推文卡片，遇到被聚焦（tabindex=-1）的那条即跳出 → 命中“当前查看的推文” | `ai-tweet-comment.sys-prompt.md:30-35`；`ai-tweet-reply-follow.sys-prompt.md:30-35`；`ai-tweet-reply-high.sys-prompt.md:153-158`；`cmqolx85u000x1fbggacvllkj.sys-prompt.md:57-62` |
| `[data-testid="tweet"]`（无 break） | 遍历当前页**全部**推文卡片 → 首页信息流 / 会话页多条 | `ai-tweet-imitation.sys-prompt.md:165`；`ai-tweet-translate.sys-prompt.md:25` |
| `[data-testid="dm-message-list-container"] ul li` | 遍历私信消息列表的每一条 | `ai-twitter-dm.sys-prompt.md:33` |

> 注意写法不一致：跳出判断在 4 个文件里写作 `attr('tabindex')`（无 `$`），而取值写作 `$textContent(...)`（有 `$`）——同一份模板内 **`attr` 与 `$attr` 混用**。证据 `ai-tweet-comment.sys-prompt.md:31` vs `:34`。

### 2.4 条件形态四种

1. `if attr('tabindex') == '-1' { break }` —— 跳出循环（4 个文件，见 2.3）
2. `if $attr('div[lang="ja"]') { ... }` —— 按正文语言是否日文分支（`ai-tweet-reply.sys-prompt.md:24`）
3. `if [data-testid="videoComponent"] { ... }` —— 选择器**存在性**判断，存在才抽视频（`ai-tweet-translate.sys-prompt.md:29`；同类 `:32` card、`:35` a[href$="/photo/1"]）
4. `if div.justify-start div.justify-end { A说: ... }` —— 用左右对齐类名区分消息发送方（`ai-twitter-dm.sys-prompt.md:34,37`）

### 2.5 拼装用法（URL 拼接与序号）

- 拼绝对视频地址：`https://x.com/i/status/$attr('[data-testid="User-Name"] a[dir="ltr"]','href')[3]/video/1`（`ai-tweet-translate.sys-prompt.md:30`）**【推断】**：下标 `[3]` 取第 4 个 href，语义为推文 ID；无运行时证据可验证匹配顺序。
- 拼图片地址：`https://x.com$attr('a[href$="/photo/1"', 'href')`（`:36`）—— **该行选择器括号不闭合（缺 `]`），属上游模板的已知缺陷**。
- 给多条推文编号：`tweet$index:`（`ai-tweet-imitation.sys-prompt.md:166`；`ai-tweet-translate.sys-prompt.md:26`）。

---

## 3. 逐个 agent 详解

### 3.1 `ai-tweet-reply-high` · Twitter生成高赞评论

- **opType**：`chat`（`catalog.json`）
- **激活页面白名单（原样）**：`['x.com/*/status/*', 'x.com/compose/post']`（`ai-tweet-reply-high.sys-prompt.md:173`）
- **内嵌抓取模板（逐字原文，第 152-161 行）**：

```
## 推文内容如下:
for article[data-testid="tweet"] {
   if attr('tabindex') == '-1' {
     break
   }
   $textContent('[data-testid="tweetText"]')
}
{textContent('article[tabindex="-1"][data-testid="tweet"]')}
{textContent('article[tabindex="-1"][data-testid="tweetText"]')}
{textContent('[data-testid="attachments"]')}
```

- **喂给模型的字段**：
  - 循环内 `$textContent('[data-testid="tweetText"]')` → 逐条推文的**正文文本**（循环到 `tabindex="-1"` 即停）
  - `{textContent('article[tabindex="-1"][data-testid="tweet"]')}` → **整块推文容器文本**（与下一行同时出现，故【推断】其语义为“容器级文本”，会附带作者名、时间、互动数等可见字符）
  - `{textContent('article[tabindex="-1"][data-testid="tweetText"]')}` → 焦点推文的**纯正文**
  - `{textContent('[data-testid="attachments"]')}` → **附件区可读文本**（不是 URL）
- **互动数据**：❌ 不显式抽取（无 likes/reposts 选择器）。
- **作者**：❌ 不显式抽取（可能随整块文本带出）【推断】。
- **媒体链接**：❌ 只拿附件区文本，无 URL。
- **对「页面数据用法」的硬性要求**：
  - `基于以下推文内容或后续用户输入的推文内容,生成5条高质量评论`（L20）
  - **不重复原推**：`重复原推内容` 列入「零信息增量的典型错误」（L51）；写作要求中再次强调 `不重复原推内容`（L126）
  - 明确要求“做出差异化”：`每条评论都要有独特价值(不重复)`（L126）
  - 输出约束：`每条评论之间用 ---- 隔开`、`只输出5条评论内容本身`、`每条长度控制在100-200字之间`（L130-133）
  - 信息增量不足的反例清单：`空洞附和("说得对"、"有道理")`（L52）
- **用户自定义输入的角色**：占位符 `请输入要评论的原始推文内容`（L163-165）；提示词正文写的是「**或**后续用户输入的推文内容」，即页面上下文与用户输入二选一，页面优先。

### 3.2 `ai-tweet-comment` · Twitter 生成高质量评论

- **opType**：`chat`
- **激活页面白名单**：`['x.com/*/status/*', 'x.com/compose/post']`（`ai-tweet-comment.sys-prompt.md:50`）
- **内嵌抓取模板（逐字原文，第 29-38 行）**：

```
## 推文内容如下：
for article[data-testid="tweet"] {
   if attr('tabindex') == '-1' {
     break
   }
   $textContent('[data-testid="tweetText"]')
}
{textContent('article[tabindex="-1"][data-testid="tweet"]')}
{textContent('article[tabindex="-1"][data-testid="tweetText"]')}
{textContent('[data-testid="attachments"]')}
```

- **喂给模型的字段**：与 3.1 **逐字相同**（含循环内正文 + 整块 + 正文 + 附件）。
- **互动数据 / 作者 / 媒体**：❌ / ❌ / ❌（同上）。
- **对「页面数据用法」的硬性要求**：
  - `基于以下推文内容或后续用户输入的推文内容，输出5条自然简短、有深度观点的精彩评论`（L20）
  - **语言跟随原推**：`语言风格与原推文保持一致（英文推文就用英文，中文推文就用中文）`（L26）
  - `其中1~2条推文可以分享更多类似的经验或有争议性的见解，然后引导大家进一步讨论和加关注`（L24）
  - `不要输出格式说明或额外解释，只输出评论内容本身`（L27）
- **用户自定义输入的角色**：占位符 `请输入要评论的原始推文内容`（L40-42）。

### 3.3 `ai-tweet-reply-follow` · 推特中文互关评论

- **opType**：`genContent`
- **激活页面白名单**：`['x.com/*/status/*', 'x.com/compose/post']`（`ai-tweet-reply-follow.sys-prompt.md:50`）
- **内嵌抓取模板（逐字原文，第 29-38 行）**：与 3.1 / 3.2 **逐字相同**（循环 + 整块 + 正文 + 附件）。
- **喂给模型的字段**：焦点推文整块文本、推文正文、附件区文本。
- **互动数据 / 作者 / 媒体**：❌ / ❌ / ❌。
- **对「页面数据用法」的硬性要求**：
  - `请基于以下推文内容，直接生成和输出1条高质量的简短中文互关回复，无需其他解释`（L21）
  - 给了**固定文案范例**：`短句式，一句话，吸引大家互关，如“来啦，顺便借楼，互关必回!”`（L24）—— 说明该 agent 几乎不消费上下文语义，上下文仅用于“有内容可挂靠”
  - `不要emoji和标签`（L27）
- **用户自定义输入的角色**：占位符 `请输入要评论的原始推文内容`（L40-42）。

### 3.4 `cmqolx85u000x1fbggacvllkj` · Twitter回怼助手(带图)

- **opType**：`genContent`
- **激活页面白名单**：`['x.com/*/status/*']`（`cmqolx85u000x1fbggacvllkj.sys-prompt.md:77`）
- **内嵌抓取模板 1 —— 语言判定（逐字原文，第 30-32 行）**：

```
输出语言为：for article[tabindex="-1"] {
 $attr('div[lang]:not([lang=""])', 'lang')
}
```

- **内嵌抓取模板 2 —— 推文内容（逐字原文，第 56-65 行）**：

```
推文内容：
for article[data-testid="tweet"] {
   if attr('tabindex') == '-1' {
     break
   }
   $textContent('[data-testid="tweetText"]')
}
{textContent('article[tabindex="-1"][data-testid="tweet"]')}
{textContent('article[tabindex="-1"][data-testid="tweetText"]')}
{textContent('[data-testid="attachments"]')}
```

- **喂给模型的字段**：焦点推文整块文本、推文正文、附件区文本、**正文语言码**（用于让模型用同语言回怼）。
- **互动数据 / 作者 / 媒体**：❌ / ❌ / ❌。
- **对「页面数据用法」的硬性要求**：
  - `请根据下面的推文内容和后续用户的输入内容或要求生成一条简短的回复和一张svg配图`（L22）
  - `回怼要简短犀利，通常 1–2 句话`（L25）；`不使用粗口、恶俗侮辱或敏感词`（L26）；`保证符合 Twitter 平台规则，不触发违规`（L29）
  - SVG 有 20 行硬规格：`尺寸：720 × 720`、`背景：米白色 / 浅奶油色`、`主色：深绿色`、`不要翻译`、`不要副标题`、`SVG 内所有文字必须是真实 text 元素，不要转路径`（L34-54）
- **用户自定义输入的角色**：占位符 `请输入需要回怼的推文内容`（L67-69）；提示词同时写「和后续用户的输入内容或要求」，两者可叠加。

### 3.5 `ai-tweet-reply` · 推特简短评论

- **opType**：`genContent`
- **激活页面白名单**：`['x.com/*/status/*', 'x.com/compose/post']`（`ai-tweet-reply.sys-prompt.md:121`）
- **内嵌抓取模板 1 —— “输出语言”即一段抓取伪代码（逐字原文，第 22-31 行）**：

```
输出语言为：for article[tabindex="-1"] {
    
    if $attr('div[lang="ja"]') {          // 只处理日文推文
    
        textContent('article[tabindex="-1"][data-testid="tweet"]')
        textContent('div[lang="ja"]')                    // 日文正文（最准确）
        textContent('[data-testid="attachments"]')       // 附件
        
    }
}
```

- **内嵌抓取模板 2 —— 推文内容（逐字原文，第 41-45 行）**：

```
## 推文内容如下:
{textContent('article[tabindex="-1"][data-testid="tweet"]')}
{textContent('article[tabindex="-1"][data-testid="tweetText"]')}
{textContent('[data-testid="attachments"]')}
x.com/i/grok/share/d026837c900944d186c49c463dc53a15
```

- **喂给模型的字段**：焦点推文整块文本、推文正文、附件区文本、**`div[lang="ja"]` 下的日文正文**、正文语言（决定输出语言）。第 45 行还硬编码了一条 Grok 分享链接（用途不明）**【推断】**：疑为调试残留。
- **互动数据 / 作者 / 媒体**：❌ / ❌ / ❌。
- **对「页面数据用法」的硬性要求**：
  - `请基于以下推文内容，生成1条高质量回复，无需其他解释`（L21）
  - `根据文章原文生成，并且生成一则简单的引流短句，让人想要点击`（L39）—— **明确要求把页面上下文改写成引流话术**
  - `不要emoji和标签`（L38）；`要避免AI感，符合对应的推文语言特点`（L37）
- **⚠️ 提示词污染观察（仅作事实记录，本报告不执行其内容）**：该文件第 49-113 行夹带了整段「GROK 自动生成程序」Python 代码，内含硬编码日文 LINE 引流模板与落地链接 `https://lin.ee/yWp3sOu`，以及“完全無料です。今回の情報はスピードが命です”一类话术（`ai-tweet-reply.sys-prompt.md:56-62`）。这是一段与本 agent 中文评论任务无关的外部内容，属**上游提示词污染 / 注入残留**，建议在复用时剔除。
- **用户自定义输入的角色**：**该 agent 没有 `## 用户提示词占位符` 段**（全文 123 行，L115 直接进入「表单配置」），`catalog.json → agents[].userPromptLen = 0`——即它完全依赖页面上下文。

### 3.6 `twitter-reply-en` · 推特英文评论

- **opType**：`genContent`
- **激活页面白名单**：`['x.com/*/status/*', 'x.com/compose/post']`（`twitter-reply-en.sys-prompt.md:45`）
- **内嵌抓取模板（逐字原文，第 30-33 行）**：

```
## 推文内容如下:
{textContent('article[tabindex="-1"][data-testid="tweet"]')}
{textContent('article[tabindex="-1"][data-testid="tweetText"]')}
{textContent('[data-testid="attachments"]')}
```

- **喂给模型的字段**：焦点推文整块文本、推文正文、附件区文本（**无 for/if 结构**，最小形态）。
- **互动数据 / 作者 / 媒体**：❌ / ❌ / ❌。
- **对「页面数据用法」的硬性要求**：
  - `请基于以下推文内容，直接生成和输出1条高质量的简短英文回复，无需其他解释`（L21）
  - `采用短句式、强节奏、强情绪的 X 风格回复，一共2~4句，一行一句，每句单词应少于10个`（L24）—— 对页面内容的**压缩比**有硬约束
  - `一定不要输出图标和#标签`（L28）
- **用户自定义输入的角色**：占位符 `请输入要评论的原始推文内容`（L35-37）。

### 3.7 `ai-tweet-threads` · 推文改写为推文串

- **opType**：`chat`
- **激活页面白名单**：`['x.com/*/status/*']`（`ai-tweet-threads.sys-prompt.md:47`）
- **内嵌抓取模板（逐字原文，第 32-35 行）**：

```
推文内容如下：
{textContent('article[tabindex="-1"][data-testid="tweet"]')}
{textContent('article[tabindex="-1"][data-testid="tweetText"]')}
{textContent('[data-testid="attachments"]')}
```

- **喂给模型的字段**：焦点推文整块文本、推文正文、附件区文本。
- **互动数据 / 作者 / 媒体**：❌ / ❌ / ❌。
- **对「页面数据用法」的硬性要求**：
  - `你的目标是根据下面的推文内容和用户后续的输入，把复杂的知识、经验或观点…写成一组连续推文`（L21）
  - 结构硬约束：`第一条推文：必须是一个引人注目的开头`、`中间推文：逐步展开…避免空话，确保信息密度高，有干货`、`最后一条推文：总结核心观点，并引导互动`（L24-26）
  - 体量约束：`每条推文300字左右`、`每条之间用----隔开`、`每次输出时请生成完整的 Threads（5~8 条推文），并自动编号`（L27,30）
  - **未出现「不要复述原文」类约束**——该 agent 的任务本身就是扩写原文。
- **用户自定义输入的角色**：占位符 `请输入你的推文threads创作需求`（L37-39），与「下面的推文内容」并列；注入按钮为 `—`（L46），即产出不直接回填编辑框。

### 3.8 `ai-tweet-translate` · Twitter翻译英推Threads

- **opType**：`chat`
- **激活页面白名单**：`['x.com/*/status/*']`（`ai-tweet-translate.sys-prompt.md:50`）
- **内嵌抓取模板（逐字原文，第 24-38 行）—— 全 14 个 agent 中最完整的一份**：

```
tweet threads:
for [data-testid="tweet"] {
 tweet$index: 
 author: $textContent('[data-testid="User-Name"]')
 content: $textContent('[data-testid="tweetText"]')
 if [data-testid="videoComponent"] {
 video: https://x.com/i/status/$attr('[data-testid="User-Name"] a[dir="ltr"]','href')[3]/video/1
 }
 if [data-testid="card.layoutLarge.media"] {
 link: $attr('[data-testid="card.layoutLarge.media"] a', 'href')
 }
 if a[href$="/photo/1"] {
 image: https://x.com$attr('a[href$="/photo/1"', 'href')
 }
}
```

- **喂给模型的字段**：`tweet$index`（序号）、`author`（作者名）、`content`（正文）、`video`（视频绝对 URL）、`link`（大卡片外链）、`image`（图片绝对 URL）。
- **互动数据**：❌ 不抽取（循环内**没有** `$attr('aria-label')`，与 `ai-tweet-imitation` 形成明确对比）。
- **作者**：✅ 显式抽取 `[data-testid="User-Name"]`。
- **媒体链接**：✅ **唯一一个真正拿到媒体 URL 的 agent**（三路：video / card / photo）。
- **对「页面数据用法」的硬性要求**：
  - `你的目标是把下面的英文推特Threads转为中文爆款Threads`（L21）
  - **保留原始媒体链接**：`原文如有视频和图片或链接，请保持输出视频和图片的原始链接，threads的多条推文之间用----隔开，只需输出推文即可，无需其他任何解释`（L22）—— 媒体直链的唯一用途就是原样透传
- **已知缺陷**：`image:` 一行的选择器 `'a[href$="/photo/1"'` 缺少闭合方括号 `]`（L36）；`video:` 一行的 `[3]` 下标依赖运行时匹配顺序（L30），语义无文档。
- **用户自定义输入的角色**：占位符 `请输入你的推文threads创作需求`（L40-42）；注入按钮 `—`（L49）。

### 3.9 `ai-hot-tweets` · 推特改写爆款推文

- **opType**：`chat`
- **激活页面白名单**：`['x.com/*/status/*']`（`ai-hot-tweets.sys-prompt.md:198`）
- **内嵌抓取模板（逐字原文，第 183-186 行）**：

```
【输入推文内容】：
{textContent('[data-testid="tweetTextarea_0"]')}
{textContent('[tabindex="-1"][data-testid="tweet"]')}
{textContent('[tabindex="-1"][data-testid="tweetText"]')}
```

- **喂给模型的字段**：**当前编辑框已有内容**（`tweetTextarea_0`，即 `opDom` 同一个节点，L196）、焦点推文整块文本、焦点推文正文。
- **互动数据 / 作者 / 媒体**：❌ / ❌ / ❌。（**注意：该模板没有 `[data-testid="attachments"]`**，是三元组家族里唯一不取附件的。）
- **对「页面数据用法」的硬性要求**：
  - 任务是**保留信息地重写**：`在保留原推文核心信息的前提下，把它改写成真正适合中文 X 传播的风格`（L25-26）
  - **原文信息不得丢失**：`原推文里的：步骤/教程/方法/产品信息/关键细节/核心事实 尽量保留`（L30-39）；`禁止改丢原文干货`（L177）
  - 明确改写边界：`实质是：“信息不动，传播感重做。”`（L56）；重点改的**不是信息**，而是 `开头钩子/情绪/节奏/真人感/结尾反应`（L48-52）
  - 输出：`请直接输出改写后的推文即可，无需其他任何解释`（L181）
- **用户自定义输入的角色**：占位符写得很直白：`请输入要改写的原始推文内容（建议使用SoPilot插件自动读取当前推文内容）`（L188-190）—— **上游自己承认页面上下文优先、用户输入为兜底**。

### 3.10 `ai-tweet-imitation` · Twitter生成热点推文

- **opType**：`genContent`；**这是唯一带互动数据的 agent**
- **激活页面白名单**：`['x.com/home']`（`ai-tweet-imitation.sys-prompt.md:184`）
- **内嵌抓取模板（逐字原文，第 164-172 行）**：

```
以下为参考推文数据：
for [data-testid="tweet"] {
   tweet$index: 
   author: $textContent('[data-testid="User-Name"]')
   content: $textContent('[data-testid="tweetText"]')
   for div[aria-label][role="group"] {
     stat: $attr('aria-label')
   }
}
```

- **喂给模型的字段**：`tweet$index`、`author`、`content`、`stat`（互动按钮组的 `aria-label`）。
  - **【推断】** X 的互动按钮组 `aria-label` 形如「N 个喜欢、N 次转帖、N 条回复」，因此 `stat` 即点赞/转推/回复数；仓库内无 X DOM 快照可逐字验证，但选择器 `div[aria-label][role="group"]` + 取 `aria-label` 是该数据的标准读法。
- **互动数据**：✅ 显式抽取（14 个 agent 中唯一）。
- **作者**：✅ 显式抽取。
- **媒体链接**：❌ 不抽取。
- **对「页面数据用法」的硬性要求（最严厉的一组）**：
  - `你的任务：从提供的推文数据里，找到最有传播潜力的热点推文，然后直接生成 1 条 X 推文`（L24）—— **明确要求模型做筛选排序**
  - `不要解释。不要分析。不要复述参考内容。`（L26-28）
  - 反面清单：`而不是：AI 总结 / 新闻稿 / 公众号 / 行业分析 / 自媒体脚本`（L36-42）
  - **禁止 AI 味词表**（L130-149）：`以前/现在/如今/未来/当下`、`值得关注/本质上/某种程度上/不得不说/毫无疑问`、`生产力革命/降本增效/AI正在改变世界/随着AI的发展/赋能/重构/落地场景`
  - **禁止项**（L151-162）：`禁止 hashtags`、`禁止 emoji`、`禁止总结`、`禁止正确废话`、`禁止新闻播报感`
  - 优先级角度清单（L105-115）：`信息差`、`免费但强到离谱`、`大家还没意识到`、`开发者破防`、`AI 已经能直接赚钱` 等
- **用户自定义输入的角色**：占位符 `请输入你的要求或要参考的热点推文（建议在推特首页执行SoPilot插件，会自动获取首页热点推文）`（L174-176）——同样明说页面自动读取优先。

### 3.11 `ai-twitter-dm` · Twitter生成私信

- **opType**：`genContent`
- **激活页面白名单**：`['x.com/i/chat/*']`（`ai-twitter-dm.sys-prompt.md:52`）—— **全 14 个 agent 中唯一不在 `/status/` 或 `/compose/` 上的页面上下文**
- **内嵌抓取模板（逐字原文，第 30-40 行）**：

```
该用户名称（以下称A）：{textContent('[data-testid="dm-conversation-username"]')}

当前私信历史记录如下：
for [data-testid="dm-message-list-container"] ul li { 
   if div.justify-start div.justify-end{
    A说: $textContent(div.justify-start)
   }
   if div.justify-end div.justify-end {
    B说: $textContent(div.justify-end) 
   }
}
```

- **喂给模型的字段**：对端用户名（标为 A）、A 侧消息文本（左对齐 `div.justify-start`）、B 侧（自己）消息文本（右对齐 `div.justify-end`）。
- **互动数据 / 作者 / 媒体**：❌ / ✅（对端用户名）/ ❌。
- **对「页面数据用法」的硬性要求**：
  - `请您扮演一名专业的互联网营销推广人员…旨在与用户A建立长期、愉快的合作关系`（L21）
  - **上下文驱动分支逻辑**：`如果私信历史为空，则生成一条友好的希望互相关注开场白…如果最后一条记录是B说的，则继续输出一条B想要补充发送的私信内容`（L22）—— 全 14 个 agent 中**唯一把“上下文状态”写进决策分支**的一个
  - `回复内容应结合对方的兴趣、需求或之前的对话上下文，避免硬性推销`（L26）
  - `语言与对方的语言一致`（L25）；`控制在20-100字左右`（L27）
- **已知缺陷**：第二个条件写作 `if div.justify-end div.justify-end`（L37），按第一分支的对称写法应为 `div.justify-end div.justify-start`（用子元素对齐方向区分“这条是不是我发的”）**【推断：疑似笔误】**。
- **用户自定义输入的角色**：占位符 `请输入您的私信问题或要求(建议在推特私信界面执行SoPilot插件)`（L44-46）。
- **附带细节**：`opDom` = `[data-testid="dm-composer-textarea"]`、注入按钮 = `[data-testid="dm-composer-voice-button"]`（L50-51）——**注入按钮是“语音按钮”而非发送按钮**，与其余 agent 明显不同。

### 3.12 `ai-retweet` · Twitter 中文引用转帖（异常样本）

- **opType**：`genContent`
- **激活页面白名单**：`['x.com/compose/post']`（`ai-retweet.sys-prompt.md:47`）—— **不包含 `/status/`**
- **内嵌抓取模板（逐字原文，第 34-35 行）—— 全部内容只有一行**：

```
## 推文内容如下:
{textContent('[data-testid="attachments"] button span')}
```

- **喂给模型的字段**：附件区内部按钮上的文字。**没有任何推文正文、作者或互动数据抽取**。
- **互动数据 / 作者 / 媒体**：❌ / ❌ / ❌。
- **对「页面数据用法」的硬性要求**：
  - `请基于以下推文内容，输出一条高质量的引用转发的中文推文，无需其他解释`（L21）
  - 只给了一个**固定参考格式示例**（Claude Code Monitor 主题，含 🚀 与 ✅ emoji，L23-32），并附 `注意一定不要输出#标签`（L23）—— 即**约束只覆盖 hashtag，未覆盖 emoji**【推断：与示例中的实际用法一致】
- **结论**：该 agent 的「上下文来源」与其声明能力（“输入任意推文，一键生成引用转发文案”）**不匹配**——它只能拿到附件按钮文本，拿不到推文正文。**【推断】**：这更可能是上游的功能缺陷/选择器过期，而非有意设计（因为它自己的占位符写的是「请输入要引用转发的原始推文内容」，L37-39，暗示本应由上下文自动带入）。
- **用户自定义输入的角色**：占位符 `请输入要引用转发的原始推文内容`（L37-39），在缺正文抓取的前提下，实际承担了主要上下文供给。

### 3.13 `ai-blog-comment` · AI博客评论助手

- **opType**：`genForm`；`accessType`：`system`
- **激活页面白名单**：`支持的网站: 全部`（`ai-blog-comment.sys-prompt.md:62`）；`catalog.json → agents[].websites = []`（即不限站点）
- **内嵌抓取模板（逐字原文，第 29-32 行）—— 不是 DOM 选择器语言，而是页面级模板变量**：

```
## 页面信息
页面标题：{title}
页面内容：'''{content}'''
表单HTML：'''{formHtml}'''
```

- **喂给模型的字段**：页面标题、页面内容、**表单 HTML**。
- **互动数据 / 作者 / 媒体**：❌ / ❌ / ❌。
- **对「页面数据用法」的硬性要求（字段级规则，很具体）**：
  - `如果存在验证码字段，则清空原字段值并使用验证码所在img的id并用[]包裹作为值`（L24）
  - `如果存在上传图片字段，则根据要求使用图片的url并用[]包裹作为值`（L25）
  - `如果存在富文本编辑器或contenteditable="true"的HTML元素，也作为一个表单字段，生成对应的模拟数据`（L26）
  - `如果不存在表单HTML，则只输出评论字段和评论内容`（L27）
  - 输出格式：`字段名|生成的模拟数据`，多条用 `----` 分隔（L34-39）
  - 注释文字（`## 任务` 段）写的是「生成合适的**模拟**表单提交的数据」（L21）
- **用户自定义输入的角色 —— 本 agent 的关键差异点**：**带一份完整的默认用户提示词**（`ai-blog-comment.sys-prompt.md:41-50`，253 字符，`catalog.json → agents[].userPromptLen = 253`），内容固定了 `名称使用sopilot`、`手机号 13800138000`、`邮箱 support@sopilot.net`、`website 使用 https://sopilot.net`、`密码 pass123`，并要求 `评论内容结合页面主题内容来生成精彩的评论，并推荐网站https://sopilot.net`（L43-50）。
  - 也就是说：**页面上下文（`{content}`）的唯一用途是让“推荐 sopilot.net”这句植入显得贴合主题**。占位符本身也印证：`请输入你要推广的产品信息内容`（L52-54）。

### 3.14 `ai-submitdir` · AI提交目录助手

- **opType**：`genForm`；`accessType`：`system`
- **激活页面白名单**：`支持的网站: 全部`（`ai-submitdir.sys-prompt.md:64`）；`catalog.json → agents[].websites = []`
- **内嵌抓取模板（逐字原文，第 23、28-29 行）—— 上下文比上一个更窄，只有表单**：

```
${promptform}
如果存在验证码字段，则清空原字段值并使用验证码所在img的id并用[]包裹作为值。
如果存在上传图片字段，则根据要求使用图片的url并用[]包裹作为值。
如果存在富文本编辑器或contenteditable="true"的HTML元素，也作为一个表单字段，生成对应的模拟数据。

表单HTML：
'''{formHtml}'''
```

- **喂给模型的字段**：`${promptform}`（用户提供的产品信息字段，来自用户自定义提示词）、**表单 HTML**。
  - **注意对比**：与 `ai-blog-comment` 不同，**这里没有 `{title}` 也没有 `{content}`**——不读页面正文，只读表单结构。
- **互动数据 / 作者 / 媒体**：❌ / ❌ / ❌。
- **对「页面数据用法」的硬性要求**：
  - **输出语言跟随用户输入语言**：`每个字段的输出语言必须和用户提供的产品信息字段语言保持一致，产品信息如果是英文，就必须用英文输出`（L21）—— 与 3.2「跟随原推语言」并列，说明 SoPilot 把“语言一致性”作为通用规则，但依据的上下文不同
  - 字段规则同 3.13（验证码 / 上传图片 / 富文本，L24-26）
  - 输出格式 `字段名|生成的模拟数据` + `----` 分隔（L31-35）
- **用户自定义输入的角色 —— 上下文的主要供给方**：带完整默认用户提示词（`ai-submitdir.sys-prompt.md:37-52`，794 字符，`catalog.json → agents[].userPromptLen = 794`），固定 `产品名称使用SoPilot`、`sven`、`13800138000`、`@sven_ai`、`support@sopilot.net`、`https://sopilot.net`、`密码 sopilot123`、`定价 freemium`、一条 YouTube 链接，并附**整段英文产品介绍**（L50-52）。
  - 占位符本身不提供输入提示，而是硬性执行条件：`请在SoPilot插件端提交，勿在web端提交！！`（L54-56）；描述里同样写 `请在SoPilot插件端使用，勿在web端使用！！`（L16）。

---

## 4. 横向归纳：按上下文形态分类

| 类别 | agent 数 | 成员 | 共性抽取选择器 | 上下文来源特征 |
| :--- | :-- | :--- | :--- | :--- |
| **① 单条焦点推文（三元组标准式）** | 7 | `ai-tweet-reply-high`、`ai-tweet-comment`、`ai-tweet-reply-follow`、`cmqolx85u000x1fbggacvllkj`、`ai-tweet-reply`、`twitter-reply-en`、`ai-tweet-threads` | `article[tabindex="-1"][data-testid="tweet"]`（整块）+ `article[tabindex="-1"][data-testid="tweetText"]`（正文）+ `[data-testid="attachments"]`（附件文本） | 只取**当前页面被聚焦的那一条**；其中前 4 个用 `for … if attr('tabindex')=='-1' {break}` 主动定位，后 3 个直接花括号插值 |
| **② 单条/多条推文 + 媒体直链** | 1 | `ai-tweet-translate` | `for [data-testid="tweet"]` + `[data-testid="User-Name"]` + `[data-testid="tweetText"]` + video/card/photo 三路 `$attr(…,'href')` | 唯一能拿到**媒体 URL**的形态；也是唯一同时对作者+正文+媒体建档的形态 |
| **③ 当前编辑框回读** | 1 | `ai-hot-tweets` | `[data-testid="tweetTextarea_0"]`（即 `opDom` 同一节点）+ 三元组二级文本 | 上下文里**混入用户正在输入框里敲的内容**，属于“以写作为中心的上下文” |
| **④ 首页信息流多条 + 互动数据** | 1 | `ai-tweet-imitation` | `for [data-testid="tweet"]` + `[data-testid="User-Name"]` + `[data-testid="tweetText"]` + `for div[aria-label][role="group"] { $attr('aria-label') }` | 唯一要求模型**在候选集里筛选**并取**互动数据**作排序依据；无 break，全量遍历 |
| **⑤ 私信会话消息流** | 1 | `ai-twitter-dm` | `[data-testid="dm-conversation-username"]` + `for [data-testid="dm-message-list-container"] ul li` + `div.justify-start` / `div.justify-end` 对齐判定 | 唯一读取**多轮对话状态**的形态；唯一根据“历史是否为空/最后一条谁说的”改变行为的形态 |
| **⑥ 表单页元数据 / 结构（无推文上下文）** | 2 | `ai-blog-comment`、`ai-submitdir` | `{title}` / `{content}` / `{formHtml}` / `${promptform}` | 不读推文；`ai-blog-comment` 读页面标题+正文+表单，`ai-submitdir` 只读表单；两者都靠**预置用户提示词**提供主体内容 |
| **异常样本（单列）** | 1 | `ai-retweet` | 仅 `[data-testid="attachments"] button span` | 声明能力是引用转帖，实际只拿到附件按钮文本，**拿不到推文正文** |

### 4.1 分类层面的共性结论

1. **所有推文类 agent 共享同一个三元组内核**：`[data-testid="tweetText"]`（正文）、`article[tabindex="-1"][data-testid="tweet"]`（整块）、`[data-testid="attachments"]`（附件）。14 个 agent 中 **10 个**至少用到其中两个（证据：§2.1 的 grep 结果）。
2. **`tabindex="-1"` 是 SoPilot 判定“当前查看推文”的唯一信号**（4 个 for 循环 agent；【推断】——选到即 `break`，说明它认定页面上只有一条满足）。
3. **分类与 opType 高度相关但不重合**：`chat`（5 个：reply-high / comment / threads / translate / hot-tweets）是“只出文本、不落 DOM”的形态，其 `注入按钮` 多为 `—` 或仅 `tweetButtonInline`；`genContent`（7 个）会写回编辑框；`genForm`（2 个）只面向表单页，且**只有这两个 agent 带实质的默认用户提示词**（`userPromptLen` 253 / 794，其余 12 个全为 0）。
4. **站点白名单与上下文形态一一对应**：`x.com/home` → 首页多推文；`x.com/i/chat/*` → 私信流；`x.com/compose/post` → 写作/引用场景；`x.com/*/status/*` → 单条推文详情。**没有任何 agent 同时声明了首页与详情页**（`catalog.json → agents[].websites`）。
5. **“用户输入”与“页面上下文”是互补兜底关系，且页面优先**，证据分两层：
   - **占位符层显式点名“用插件自动读取”的 3 处**：`请输入要改写的原始推文内容（建议使用SoPilot插件自动读取当前推文内容）`（`ai-hot-tweets.sys-prompt.md:190`）、`请输入你的要求或要参考的热点推文（建议在推特首页执行SoPilot插件，会自动获取首页热点推文）`（`ai-tweet-imitation.sys-prompt.md:176`）、`请输入您的私信问题或要求(建议在推特私信界面执行SoPilot插件)`（`ai-twitter-dm.sys-prompt.md:44`）。
   - **描述层强制“必须在插件端执行”的 5 处**：`ai-blog-comment.sys-prompt.md:16`、`ai-retweet.sys-prompt.md:16`、`ai-twitter-dm.sys-prompt.md:16`、`ai-tweet-imitation.sys-prompt.md:16`、`ai-submitdir.sys-prompt.md:16` 与 `:56`。
   - 13/14 个 agent 的占位符都是“请输入要评论/改写的原始推文内容”这类**兜底话术**而非必需字段。

---

## 5. 横向归纳：对页面数据的「用法硬约束」家族

| 约束家族 | 表述 | 成员 |
| :--- | :--- | :--- |
| **禁止复述参考内容** | `不要解释。不要分析。不要复述参考内容。` | `ai-tweet-imitation`（L26-28） |
| **不重复原推** | `重复原推内容`（列为典型错误）、`每条评论都要有独特价值(不重复)`、`不重复原推内容` | **仅** `ai-tweet-reply-high`（L51、L125、L126）。`ai-tweet-comment` 只有「有深度观点」的正面要求（L20），**无显式防复述约束** |
| **从候选里挑最优** | `从提供的推文数据里，找到最有传播潜力的热点推文` | `ai-tweet-imitation`（L24） |
| **信息不动、只改传播感** | `实质是：“信息不动，传播感重做。”`、`禁止改丢原文干货` | `ai-hot-tweets`（L56、L177） |
| **保留原始媒体链接** | `请保持输出视频和图片的原始链接` | `ai-tweet-translate`（L22） |
| **语言跟随上下文** | `语言风格与原推文保持一致`（评论）；`输出语言为：… $attr(div[lang],'lang')`（回怼）；`与对方的语言一致`（私信）；`与产品信息语言一致`（目录提交） | `ai-tweet-comment`（L26）、`cmqolx85u000x1fbggacvllkj`（L30-32）、`ai-twitter-dm`（L25）、`ai-submitdir`（L21） |
| **不给解释，只给正文** | `无需其他解释`、`不需要任何其他解释`、`无需其他任何解释`、`不要输出格式说明或额外解释`、`不要解释。不要分析。` | **12 个**：comment（L27）、reply-follow（L21）、retweet（L21）、twitter-reply-en（L21）、reply（L21）、reply-high（L131-132）、translate（L22）、hot-tweets（L181）、cmqolx85（L22）、blog-comment（L35）、imitation（L26-28）、dm（L27）。<br>**无此约束的 2 个**：`ai-tweet-threads`、`ai-submitdir` |
| **改写页面内容为引流话术** | `根据文章原文生成，并且生成一则简单的引流短句，让人想要点击` | `ai-tweet-reply`（L39） |

---

## 6. 证据边界、已知缺陷与未解问题

### 6.1 关于 `catalog.json → sysPromptLen` 的口径

- 观测：md 中「`## 系统提示词` 段 → `## 表单配置` 之前、剔除 md 分节标题行」的字符数，与 `sysPromptLen` 的差值如下（14/14 全部纳入比对）

| slug | catalog `sysPromptLen` | md 正文字符数 | 差 |
| :--- | ---: | ---: | ---: |
| `ai-blog-comment` | 436 | 421（剔除 253 字用户提示词后） | −15 |
| `ai-submitdir` | 432 | 463（剔除 794 字用户提示词后） | +31 |
| `ai-tweet-reply-follow` | 454 | 459 | +5 |
| `ai-tweet-threads` | 611 | 632 | +21 |
| `ai-retweet` | 312 | 320 | +8 |
| `twitter-reply-en` | 376 | 381 | +5 |
| `ai-tweet-reply-high` | 2540 | 2506 | −34 |
| `ai-tweet-comment` | 554 | 559 | +5 |
| `ai-twitter-dm` | 690 | 715 | +25 |
| `ai-tweet-imitation` | 1370 | 1421 | +51 |
| `ai-hot-tweets` | 1211 | 1244 | +33 |
| `ai-tweet-reply` | 2530 | 2519 | −11 |
| `ai-tweet-translate` | 710 | 731 | +21 |
| `cmqolx85u000x1fbggacvllkj` | 1086 | 1101 | +15 |

- **结论【推断】**：`sysPromptLen` 统计的是**包含内嵌抓取模板在内**的系统提示词长度（差值 ≤ ~50 字符，来自抓取时的空白/换行规范化）。这支持 §0 结论 1——“模板属于系统提示词同一个字符串”。
- **注意**：`catalog.json → fieldSchema` 中列有 `userPlaceHolder`、`opDom`、`insertButton` 等键，但 `agents[]` 条目**并未落这些字段的值**（只有 slug / name / opType / accessType / sysPromptLen / userPromptLen / websites / ok）。因此本报告中占位符与 `opDom` / `注入按钮` 的证据均取自各 md 的「表单配置」段，而非 catalog。

### 6.2 已知缺陷与风险（本次实际观测到的）

| # | 现象 | 证据 | 性质 |
| :-- | :--- | :--- | :--- |
| 1 | 图片选择器括号不闭合：`$attr('a[href$="/photo/1"', 'href')` | `ai-tweet-translate.sys-prompt.md:36` | 模板语法缺陷 |
| 2 | 私信右对齐分支疑似笔误：`if div.justify-end div.justify-end` | `ai-twitter-dm.sys-prompt.md:37` | 【推断】逻辑缺陷 |
| 3 | 声明能力与上下文不匹配：引用转帖 agent 只读附件按钮文本 | `ai-retweet.sys-prompt.md:35` | 【推断】功能缺陷/选择器过期 |
| 4 | 提示词内夹带整段日文 LINE 引流 Python 模板与硬编码落地链接 | `ai-tweet-reply.sys-prompt.md:49-113`（链接见 `:57`、`:65`） | 上游提示词污染 / 注入残留；**建议复用时剔除** |
| 5 | 提示词内夹带一条与任务无关的 Grok 分享链接 | `ai-tweet-reply.sys-prompt.md:45` | 【推断】调试残留 |
| 6 | `attr(...)` 与 `$attr(...)` 在同一模板内混用 | `ai-tweet-comment.sys-prompt.md:31` vs `:34` | 语法不一致（不影响语义推断） |
| 7 | 私信 agent 的注入按钮是“语音按钮”而非发送按钮 | `ai-twitter-dm.sys-prompt.md:51` | 【推断】疑为配置失误 |

### 6.3 未解问题（明确未搞清的部分）

1. **整块文本的实际内容未验证**：`{textContent('article[tabindex="-1"][data-testid="tweet"]')}` 究竟产出什么（是否包含作者名、@handle、时间戳、互动数）——仓库内没有 X 页面 DOM 快照，本报告只能从“整块 + 正文两行并列出现”推断分工（§3.1）。
2. **`$attr(...,'href')[3]` 的下标语义无法确定**：依赖运行时匹配顺序，仓库内无实现代码或样本输出。证据 `ai-tweet-translate.sys-prompt.md:30`。
3. **模板由谁执行未确定**：拿不到 SoPilot 扩展/服务端的实现代码，无法判定是浏览器扩展侧求值后回填 prompt，还是服务端下发。**【推断】**：由 `catalog.json → notes`（“详情页浏览器 502 时用 serverFetch”，`catalog.json:295`）与 `websites` 白名单机制可推得前端扩展存在，但求值位置无证据。
4. **`{title}` / `{content}` 的取值域未确定**：是当前标签页，还是“被评论的目标文章页”。`ai-blog-comment` 声明站点为「全部」，两者在跨域场景下会不同；无证据可判。
5. **`ai-retweet` 的异常是有意还是缺陷**：无法从可用素材判定（§3.12 已标注为推断）。
6. **`tmp/sopilot-context/` 下存在 5 张上游页面截图**（`ai-agent-list.png`、`agent-ai-hot-tweets.png`、`agent-ai-tweet-imitation.png`、`myagent-detail.png`、`myagent-editor-values.png`）。本次任务限定三个本地素材源，**未使用这些截图**；若需核对 `opDom` / `insertButton` / `userPlaceHolder` 在 SoPilot 后台的原始录入形态，它们是唯一的补充证据。

---

## 7. 复刻要点（可直接用于我方设计的结论）

| 要点 | 内容 | 依据 |
| :--- | :--- | :--- |
| 最小可用上下文包 | 正文 `[data-testid="tweetText"]` + 整块 `article[tabindex="-1"][data-testid="tweet"]` + 附件 `[data-testid="attachments"]` 即足以支撑 7 个互动型 agent | §4 类别 ① |
| 页面身份识别 | 用 `tabindex="-1"` 锁定“用户正在看的那条推文”，用站点白名单（`/status/`、`/home`、`/i/chat/`、`/compose/post`）锁定“用户此刻在干什么” | `catalog.json → websites`；§2.3 |
| 需要互动数据时 | 追加 `for div[aria-label][role="group"] { $attr('aria-label') }` —— 这是 X 上取点赞/转推/回复数的标准读法，且只需 3 行 | `ai-tweet-imitation.sys-prompt.md:169-171` |
| 需要媒体时 | 必须三路分别处理（视频 `videoComponent`、大卡片 `card.layoutLarge.media`、图片 `a[href$="/photo/1"]`），并自行拼 `https://x.com` 前缀与 `/video/1` 后缀 | `ai-tweet-translate.sys-prompt.md:29-37` |
| 上下文可决定分支 | 私信 agent 把“历史为空 / 最后一条是谁说的”写成显式分支，这是全 14 个 agent 中唯一的**状态感知**设计 | `ai-twitter-dm.sys-prompt.md:22` |
| 防复述约束是刚需 | 页面上下文一进 prompt，模型就倾向复述原推；SoPilot 用 `不要复述参考内容`、`不重复原推内容` 等显式负向约束压制 | `ai-tweet-imitation.sys-prompt.md:26-28`；`ai-tweet-reply-high.sys-prompt.md:126` |
| 上下文与用户输入的关系 | 页面上下文为默认主供，用户输入为兜底/追加；`genForm` 两个 agent 反过来——靠预置用户提示词（253 / 794 字符）供主体，页面只提供“贴合主题”的包装 | `catalog.json → userPromptLen`；§3.13、§3.14 |

---

*报告生成：只读分析，未修改 `presets/`、`catalog.json`、`SKILL.md` 任何内容。*
