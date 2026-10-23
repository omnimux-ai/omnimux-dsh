# 规范：长文章帖（X Article）原帖正文读取修复

- Issue: [#3630](https://github.com/omnimux-ai/omnimux-dsh/issues/3630)
- 影响插件：`plugins/omnimux-browser`（扩展 content script）
- 风险：R2（单插件非破坏性修复，仅读取逻辑）

## 1. 问题定义

在 x.com 的**长文章帖（X Article）**详情页点击 OmniMux「推文回帖助手」并选择任一菜单项时，页面顶部弹出 toast「没有读到原推内容，请刷新页面后重试。」，不进入生成，也不写入回帖框。普通短推文详情页不受影响。

线上实测（ego-browser，2026-10-23，`https://x.com/Khazix0918/status/2113466426216583632`）：

- 聚焦原推 `main article[data-testid="tweet"][tabindex="-1"]` 内 **没有** `[data-testid="tweetText"]`（普通推文的正文节点），全文 `tweetText` 计数为 0。
- 文章标题在 `[data-testid="twitter-article-title"]`（实测「我好像陷入了某种，AI时代的虚无主义。」）。
- 文章正文在 `[data-testid="twitterArticleRichTextView"]` → `[data-testid="longformRichTextComponent"]`，为 Draft.js 块结构：每个段落是 `div.longform-unstyled`，内含 `div.public-DraftStyleDefault-block` 与行内 `span`；实测 `textContent` 4390 字、`innerText` 4516 字（含段间换行）。
- 读数块 `twitterArticleReadView` 自身还包含 `role="group"` 的互动计数文本（如 `45101591万`），因此不能直接取该容器的整段文本。

根因：`twitter-copilot/extractor.ts` 只用 `[data-testid="tweetText"]` 填 `targetTweetText` / `quotedTweetText`；长文章没有该节点 → 空字符串 → `menu.ts` 的 `checkContextReady` 判定上下文未就绪并拦截。`twitter-capture/extractor.ts` 的同名选择器同样取不到长文章正文。

## 2. 用户操作旅程与期望界面反馈

1. 用户打开任意长文章帖详情页（`/{handle}/status/{id}`，含 `twitterArticleReadView`）。
2. 点击帖子操作栏的 OmniMux 助手按钮 → 出现「推文回帖助手」菜单。
3. 选择任一菜单项（如「高赞神评生成」）。
4. 期望：**不再出现**「没有读到原推内容」提示；进入生成态，`targetTweetText` 为「标题 + 空行 + 正文段落」，生成完成后写入回帖框。
5. 用户在文章页收藏/采集该帖时，采集正文同样非空（标题 + 正文）。
6. 普通短推文详情页、信息流内联回复、引用转发弹窗的行为与报错文案保持不变。

## 3. 修复契约

### 3.1 新增共享读取器 `content/tweet-body.ts`

导出：

- `readArticleText(scope, exclude?)`：`scope` 内第一个 **不在 `exclude` 内** 的 `twitter-article-title` 与 `twitterArticleRichTextView`；
  - 正文按外层 `[class*="longform-"]` 块（过滤嵌套命中）压缩后以空行连接；块集合为空时退回容器文本，并先移除容器内嵌的 `tweetText`；
  - 返回 `标题 + "\n\n" + 正文`，任一部分缺失则省略；两者皆空返回 `''`；
  - 结果上限 `ARTICLE_TEXT_MAX_CHARS = 8000`，超出按字符截断并追加 `…`（标题-only 也受该上限约束）。
- `readCardText(scope)`：卡片自身文本——第一个 `tweetText`，否则 `readArticleText(scope)`，用于被引卡片（引用转发、采集 quoted）。
- `findQuoteContainer(scope)`：`scope` 内部的引用容器，统一两种线上形状——`[data-testid="quoteTweet"]`（时间线）与携带另一个帖子 header 的 `div[role="link"]`（编辑器/嵌入）。若某个 `div[role="link"]` 包住了本帖自己的 `User-Name`，那是整卡可点击包裹层而非引用卡，跳过。
- `readTweetBody(scope, exclude?)`：原帖自身正文——优先 `tweetText`，缺失时回退 `readArticleText(scope, exclude)`。
  - 调用方可显式传入 `findQuoteContainer(scope)`；未传时内部按同一规则自行判定，`tweetText` 与文章回退都排除引用容器。
  - 整卡 `role=link` 包裹（包裹层在 `scope` 内或外）都不算引用，正文照常读取。
  - 文章正文内嵌的 `tweetText` 不算文章自身正文。
- `hasPostBody(scope)`：`scope` 内是否存在 `tweetText` / 文章标题 / 文章正文任一。
- 所有返回值受 8000 字上限约束（含普通 `tweetText` 路径）。

### 3.2 读取点接入

| 位置 | 变更 |
| --- | --- |
| `twitter-copilot/extractor.ts` 回帖场景 | `targetTweetText = readTweetBody(targetTweet, findQuoteCard(targetTweet))`：被引卡片（`quoteTweet` 与 link 两种形状，含被引长文章）不会被当成原帖正文 |
| `twitter-copilot/extractor.ts` 引用转发场景 | `quotedTweetText` 改用 `readCardText(quoteCard)`，保留卡片的文章回退 |
| `twitter-copilot/candidates.ts` 候选池 | `findQuoteCard(article)` 直接复用 `findQuoteContainer(article)`：同时识别 `quoteTweet` 与 link 两种引用形状；卡片自身正文用 `readTweetBody(article, card)`，被引卡片用 `readCardText(card)` |
| `twitter-copilot/extractor.ts` prompt 素材 | `toFeedHotTweet` 对 seed 正文与被引正文各截断到 `MAX_SEED_TEXT_CHARS = 1200`，避免多条长文章的 seed 撑爆上下文 |
| `twitter-capture/extractor.ts` 采集正文 | `bodyOf` 改用 `readTweetBody(article, quoteRoot)`；`quoted.text` 改用 `readCardText(quoteRoot)` |
| `twitter-capture/extractor.ts` 引用容器判定 | `quoteRootOf` 的 `attachments` 条件从「含 `tweetText`」改为 `hasPostBody(attachments)`，被引长文章不再漏判 |

### 3.3 场景判定

引用转发弹窗中，被引卡片若是长文章，`[data-testid="attachments"] [data-testid="tweetText"]` 不存在。`detectTwitterScene`：

1. **先**判弹窗内是否内嵌 `article[data-testid="tweet"]`（回帖弹窗，attachments 也可能包着被回复的原推）→ `REPLY_DETAIL` / `REPLY_FEED`；
2. 其次用 `hasPostBody(attachments)` 判引用转发 → `POST_QUOTE`（长文章被引卡片不再漏判）。

### 3.4 已知边界（不在本修复内）

- `capture/account.ts`、`twitter-velocity/extractor.ts`、`page-sensor.ts` 的兜底仍只读 `tweetText`：账号监控 / velocity / 无永久地址兜底路径中文章帖正文仍为空。属独立读取路径，本 issue 不改动，后续按同一读取器收敛。
- 文章内嵌图片、视频、内嵌卡片不抓取；只读文本。

## 4. 非目标

- 不抓取文章内图片、视频、内嵌卡片，不改动文章排版渲染。
- 不改动生成/回帖提交链路、菜单文案与场景标题。
- 不重构 copilot 的场景判定与候选打分算法。
- 不为文章新增独立菜单项。

## 5. 验收用例

1. **回帖详情页（长文章）**：jsdom 构造 `main article[data-testid="tweet"][tabindex="-1"]`（含 User-Name、`twitterArticleReadView`、标题、两个 `longform-unstyled` 段落、无 `tweetText`），`extractTwitterContext(scene=REPLY_DETAIL)` 的 `targetTweetText` 含标题与两段正文，且 `checkContextReady` 返回 `null`。
2. **普通推文不回归**：含 `tweetText` 的推文，`targetTweetText` 仍等于该节点文本；被整卡 `role=link` 包裹时仍能读到。
3. **引用转发（长文章卡片）**：弹窗 `attachments` 内只有文章标题+正文时判为 `POST_QUOTE`，`quotedTweetText` 非空。
4. **REPLY 排除被引长文章**：无评论的引用转发，`targetTweetText` 为空（不得把被引文章当原帖），闸门给出既有提示；`quoteTweet` 与 `role=link` 两种引用形状都成立；评论与引用同处一个 `role=link` 时仍取评论。
5. **采集**：长文章 `article` 的 `text` 非空且包含标题；引用长文章时 `text` 只含引用者评论、`quoted.text` 含被引文章标题。
6. **候选池**：信息流长文章卡进入候选；卡片被 `role=link` 包裹（内/外两种形状）不被误判为引用卡；引用卡片的被引长文章不与评论混同。
7. **超长截断**：超过 8000 字的正文截断且以 `…` 结尾；seed 正文与被引正文各不超过 1200 字且以 `…` 结尾（`applyPickedSeed` 生成的 `feedHotTweets`）。
8. **无 Draft 块 fallback**：正文无 `longform-*` 块时，内嵌 `tweetText` 不进入文章正文。
9. **标题-only 与互动计数**：互动计数（`45101591万`）不进入正文。

## 假设

- 长文章详情页继续以 `article[data-testid="twitterArticleReadView"]`、`[data-testid="twitter-article-title"]`、`[data-testid="twitterArticleRichTextView"]` 暴露标题与正文，Draft.js 块类名保持 `longform-*` 前缀；这是 2026-10-23 线上实测结果，也是本修复的唯一选择器依据。
- 回帖框写入路径不依赖正文长度上限；把单帖上下文截到 8000 字、seed 素材截到 1200 字，既保住绝大多数文章，也避免本地模型上下文溢出。
- X 的整卡 `role=link` 包裹层一定包住本推自己的 `User-Name`，因此可用「link 容器是否包含自身 header」区分整卡链接与真正的引用卡片；时间线引用卡以 `[data-testid="quoteTweet"]` 呈现。这两个结构假设来自线上样本与仓库既有夹具，若线上出现第三种引用形状，需按 `findQuoteContainer` 扩展。

## 证伪方式

- 在真实文章页打开助手菜单并点击「高赞神评生成」：若仍出现「没有读到原推内容」，或采集该帖正文为空，则修复无效。
- 用 jsdom 跑 `tests/twitter-article-body.spec.ts`：构造无 `tweetText` 的文章结构，若 `targetTweetText` 为空或混入互动计数，说明选择器/回退顺序有误。
- 构造「普通推文 + 整卡 `role=link` 包裹（内/外）」「无评论引用长文章（`quoteTweet` 与 link 两种形状）」「评论与引用同处一个 link」：若前者读成空、后者把被引文章当原帖，说明引用排除有误。

## 8. 新用户基线

修复只依赖扩展自身 content script 与 x.com 公开 DOM，不依赖本地模型服务、开发端口、开发 profile 或本机路径。新建安装的用户在文章页点助手时若本地模型不可用，仍走既有「模型服务未响应」提示；本修复只保证上下文读取成功，不改变模型通道。文章页无正文时保持既有的「没有读到原推内容」拦截，不凭空生成。

## 9. 文档影响

只新增本规格文件；不改变既有契约、模型清单或界面文案规范，`docs/` 无需更新。

## 验证记录（2026-10-23）

- 实机预演（ego lite，任务工作树构建）：证据与截图在 `docs/evidence/2026-10-23-x-article-context-3630/`（`report.md`、`before-main-build.png`、`after-fix-build.png`、`after-fix-generated.png`）。
  - 修复前：同一页面同一路径点击「高赞神评生成」→ toast「没有读到原推内容，请刷新页面后重试。」
  - 修复后：进入生成 → 回帖框写入基于文章主旨的回复 → toast「已填入推文输入框，请复核后点击发帖！」
- 单测：`pnpm test`（extension）157 个文件 / 1728 通过 + 1 预期失败；新增 `tests/twitter-article-body.spec.ts`（23 例，含 wrapper 两种形状、quoteTweet/link 两种引用形状、REPLY 与候选池引用排除、capture 引用长文章、无 Draft 块 fallback、标题-only、1200 字 seed 预算）。
- 类型检查：`pnpm typecheck` 报 70 个历史错误（`origin/main` 同样 70 个，均为既有测试文件），本次改动文件 0 个错误。
- 构建：`node scripts/build.mjs` 通过，`dist/content.js` 含文章正文读取逻辑。
- 影响矩阵：`node scripts/impact-matrix.mjs --git-diff --base origin/main` → L0 必需、浏览器 Web 验证 not-applicable（本次仍主动做了实机预演）。
