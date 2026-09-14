# 推特助手上下文修复（第一批）：去掉写死主题、杜绝 undefined 入 prompt

## 背景（证据见 `.agent-reports/sopilot-context/our-context-audit.md` 与 `docs/research/social-agent-context-strategy-2026-09-14/`）

竞品 SoPilot 的上下文以页面为主料、用户输入为补充，抓不到时靠页面或停下；我方两点相反：

1. **10 处写死主题**：`prompts.ts:40,46,62,67,83,88,104,109,123,147` —— 发帖框为空时把固定主题（如「分享关于效率工具与现代技术创新的思考」）当作用户需求发给模型。这是「同一功能每次点都得到同类结果」的直接根因（已实测：空栏连点两次，模型两次收到的提问完全一致）。
2. **`undefined` 直入 prompt**：`extractor.ts:152` 的 `if (targetTweet)` 把 `targetTweetText` 的赋值整块包住，抓不到推文时字段保持 `undefined`，场景三/四共 13 处模板插值直接输出字面量 `undefined`（`prompts.ts:255,260,276,281,297,302,316,335,340,356,361,377,382`）。
3. **伪造身份**：抓不到作者时写死 `@博主` / `@author` / `@同行` / `@creator`（`prompts.ts:142,147,205,210,232,239,255,260,276,281,316`）。

## 目标行为（验收标准）

1. **不许凭空造主题**：`prompts.ts` 内不得再出现任何写死主题/身份兜底；上下文缺什么就留空，不得伪造。
2. **不许 `undefined`**：`extractTwitterContext` 返回的每个字段都是字符串；任何场景下拼出的 prompt 都不含字面量 `undefined`。
3. **生成前有闸门**（新）：点击菜单项后先校验上下文是否就绪，不就绪则**不调用模型**、给出双语提示：
   - 原创发新帖：发帖框为空 → 「请先写下你的主题或想法，再使用该功能」/「Write your topic or idea first, then run this again.」
   - 引用转发：未读到被引用原推 → 「没有读到被引用的推文，请刷新页面后重试」/「Couldn't read the quoted tweet — refresh the page and try again.」
   - 推文回帖 / 信息流互动：未读到原推 → 「没有读到原推内容，请刷新页面后重试」/「Couldn't read the target tweet — refresh the page and try again.」
4. **补齐信封**：生成请求的上下文信封补上 `quotedAuthor` / `tweetUrl` / `scene`（此前采集后被丢弃）。

## 交互验收步骤

1. 打开 x.com 首页（发帖框留空）→ 点图标 → 点「爆款推文复刻」→ **不生成任何文案**，出现上述中文提示；
2. 在发帖框写入任意主题 → 再点同一功能 → 正常生成，且内容围绕该主题；
3. 推文详情页回帖框 → 点「高赞神评生成」→ 正常生成（上下文就绪）；
4. 单元测试覆盖上述三条路径与「prompt 无 undefined、无写死主题」的断言。

## 非目标

- 不改上下文抽取锚点（把「整页第一个」改成「点击控件所在容器」属第二批）；
- 不补互动数据/媒体字段（第二批）；
- 不改提示词风格与输出红线。
