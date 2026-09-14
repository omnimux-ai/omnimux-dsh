# omnimux-intercept 上下文获取审计（只读）

**审计对象**：`plugins/omnimux-intercept/**`（根：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh`）
**审计范围**：该插件的入口与流程、采集层取数路径、评论生成提示词的字段喂入、以及是否存在「抓评论区」意图。
**不在范围**：浏览器扩展本体（由并行审计负责）；本报告不对其做任何推断性描述。
**只读声明**：本次审计未修改、创建、删除任何业务源文件，未运行测试，未访问网络；本报告是唯一写入的文件。
**证据纪律**：所有结论均带 `file:line`；凡非逐字引用代码的推理，均以「推断：」前缀显式标注。

---

## 一、数据来源与流向

### 1.1 取数入口与流向总览

| 环节 | 落点 | 代码位置 | 说明 |
| --- | --- | --- | --- |
| 命令注册 | `apply(ctx)` 注册 `scan` | `src/index.js:51-68` | 无命令 seam 时静默；CLI 直调 `run()` / `main()` |
| 参数解析 | `parseCliArgs` | `src/cli.js:95-167` | `--limit/--type/--source/--fixture/--style/--lang/--max-chars/--now` 等 |
| 依赖装配 | `assembleDeps` | `src/cli.js:294-344` | `run` = 真实 `spawn`（`src/cli.js:314`）；`request: undefined`（`src/cli.js:315`） |
| 子进程 | `createSpawnRunner` → `spawn(opencli, argv)` | `src/cli.js:224-286`（`spawn` 在 `:234`） | 唯一真实外部进程触达点 |
| 主源命令 | `['twitter','timeline','-f','json','--limit',N]` | `src/collect/opencli-source.js:80-86`（argv 在 `:83`） | `--type following` 追加于 `:84` |
| 采集编排 | `fetchTimeline` 分派 opencli/hub/fixture | `src/collect/timeline-fetcher.js:151-202` | 主源失败可选降级 hub（`:177-200`） |
| 归一 | `normalizeRecords` → `buildRecord` | `src/collect/tweet.js:360-363`、`:302-351` | 脏 JSON → 规范 `TweetRecord` |
| 本地计算 | `scoreTweets` → `stats` | `src/pipeline.js:264`；`src/core/algorithm.js:144-154` | `R`/`j`/`tier`/`exposure` 全部本地算 |
| 生成文案 | `generateComments` | `src/pipeline.js:287-301`；`src/comment/comment-service.js:228-289` | 逐条；三级降级 |

### 1.2 字段级：字段 → 来源 → 代码位置 → 是否可能取错

| 字段 | 实际来源 | 代码位置 | 是否可能取错 |
| --- | --- | --- | --- |
| `id` | OpenCLI/hub/fixture 原始记录 → 别名表首命中键 | `src/collect/tweet.js:47`、`:306` | **是**：别名按顺序取第一个「存在且非空」键（`:119-130`）；且缺失时为空串（契约 `docs/shared/README.md`），下游以空串作 Map 键会碰撞（见 F2） |
| `author`（显示名） | 别名 `author/name/author_name/...` | `src/collect/tweet.js:48`、`:309-320` | **是**：`name` 常为账号名而非显示名，优先级高于 `display_name` |
| `authorHandle` | 别名 → `author` 以 `@` 开头 → 从 `url` 反解 → `author` 去 `@` | `src/collect/tweet.js:49`、`:310-319`、`handleFromUrl` `:272-275` | **是**：URL 正则 `(?:twitter\.com|x\.com)/([A-Za-z0-9_]{1,50})/` 会把 `/i/status/…`、`/home`、`/search?…` 这类非用户路径首段当作 handle |
| `text`（推文正文） | 别名 `text/content/full_text/fullText/body` | `src/collect/tweet.js:50`、`:334` | **是**：`content` 与 `body` 可能是信封层字段而非正文 |
| `createdAtMs` | 别名 → epoch/ISO/中文相对时间/英文相对时间/`Sep 13` | `src/collect/tweet.js:51`、`:141-203` | **是（兜底）**：解析不出时**回填 `nowMs`** 并标 `CREATED_AT_INVALID`（`:151`、`:156`、`:202`）→ 脏时间会伪装成「刚刚发布」，直接推高时速 |
| `url` | 别名 `url/link/permalink/tweet_url` | `src/collect/tweet.js:52`、`:307` | 一般否 |
| `metrics.views` | 别名含 `views/impressions` | `src/collect/tweet.js:57`、`:325`、`:338` | **是**：解析失败 `null`，算法层按 0（`src/core/algorithm.js:144` `nullToZero`）→ 爆款被判哑帖 |
| `metrics.likes/retweets/replies/bookmarks` | 别名表 | `src/collect/tweet.js:53-56`、`:339-342` | **是**：`replies` 的别名含 `comments/comment_count`（`:55`）；若源把 `comments` 给成**评论对象数组**，`parseMetric` 直接返回 `null`（`src/collect/parse-metrics.js:85`）→ 评论数静默丢失（见 F5） |
| `hasMedia` / `mediaUrls` | 别名 + 数组归一 | `src/collect/tweet.js:58-59`、`:328`、`:344-346` | **采集到但无人消费**：`src/**` 内除 `tweet.js` 外无任何读取点 |
| `quotedTweetId` | 别名含对象/字符串/数字三形态 | `src/collect/tweet.js:60`、`:347`、`extractQuotedId` `:282-291` | **采集到但无人消费**：`src/**` 内除赋值处无任何读取点 |
| `source` | 分派参数写死 | `src/collect/tweet.js:348`；`opencli-source.js:296`、`hub-source.js:167`、`timeline-fetcher.js:118` | 否（但仅标记用途，输出层几乎不展示） |
| `anomalies` | 采集层缺陷码集合 | `src/collect/tweet.js:304-349` | 否；会在 `:349` 排序后透传 |
| `stats.hoursAlive`(`R`) / `pace`(`j`) / `tier` / `exposure.*` | **本地算法**（非源字段） | `src/core/algorithm.js:144-154`；`src/core/sort.js:11-33` | 否（但强依赖 `views` 与时间解析质量） |
| 提示词模板文本 | 仓库既有资产，运行时按路径读盘 | `src/comment/prompt-templates.js:19-20`、`:95-100`、`src/cli.js:296-305` | **是（降级）**：读不到即用内置模板（`prompt-templates.js:136-141`），来源从 `sopilot` 变 `builtin` |

### 1.3 三个数据源的实际可达性

| 数据源 | 是否可达 | 证据 |
| --- | --- | --- |
| `opencli`（主源） | 可达 | `src/cli.js:314` 装配真实 `spawn`；`src/collect/opencli-source.js:255` |
| `hub`（降级源） | **仅在宿主注入 `request` 时可达** | `src/cli.js:315` 写死 `request: undefined`，`assembleDeps` 只在 `overrides` 显式给值时才覆盖（`:332-334`）。纯 CLI 运行时 `fetchTimelineFromHub` 会因缺 `request` 抛 `INTERNAL`（`hub-source.js:127-133`） |
| `fixture`（离线源） | 可达 | `src/collect/timeline-fetcher.js:56-124`；`--fixture` 参数 `src/cli.js:154` |

---

## 二、提示词实际喂入字段清单

提示词由 `buildCommentPrompt`（`src/comment/prompt-builder.js:63-124`）拼装，`sections` 数组在 `:83-118` 逐行追加，最后由 `:122` `sections.join('\n')` 成文；`system` 取自模板对象（`:121`）。**没有 JSON 结构化输入，没有 few-shot 示例，没有历史草稿，没有评论区内容。**

### 2.1 逐字段清单（字段 → 代码变量 → file:line → 示例值形态）

| 提示词中的位置 | 字段/变量 | 代码变量 | file:line | 示例值形态 |
| --- | --- | --- | --- | --- |
| 【原推全文】 | `record.text`（截断至 1200 字） | `tweetText` | `prompt-builder.js:74-78`（常量 `:15`） | `实测 6 个语音转写工具：中文标点准确率最高 94%…` |
| 【作者】 | `record.author` | `record?.author` | `prompt-builder.js:88` | `某作者名` |
| 【作者】 | `record.authorHandle` | `record?.authorHandle` | `prompt-builder.js:88` | `@some_handle` |
| 【推文链接】 | `record.url` | `record?.url` | `prompt-builder.js:89` | `https://x.com/u/status/1001` |
| 爆速指标 | `stats.hoursAlive`（R） | `stats?.hoursAlive` | `prompt-builder.js:92` | `存活时长 R = 2.0000 小时` |
| 爆速指标 | `stats.pace`（j） | `stats?.pace` | `prompt-builder.js:93` | `时速 j = 60,000 次浏览/小时` |
| 爆速指标 | `stats.tier` | `stats?.tier` | `prompt-builder.js:94`（标签 `:45-48`） | `分级 = 爆款（viral）` |
| 爆速指标 | `stats.exposure.predicted` | `stats?.exposure?.predicted` | `prompt-builder.js:95` | `预估抢评曝光 = 1,234` |
| 爆速指标 | `exposure.timeDecay / freshnessBonus / competition` | 同名字段 | `prompt-builder.js:96` | `时间衰减 5.3000 × 时效加成 1.1689 × 竞争折扣 0.85` |
| 【互动量】 | `metrics.likes` | `metrics.likes` | `prompt-builder.js:99` | `点赞 812` |
| 【互动量】 | `metrics.retweets` | `metrics.retweets` | `prompt-builder.js:99` | `转推 34` |
| 【互动量】 | `metrics.replies`（**仅计数**） | `metrics.replies` | `prompt-builder.js:99` | `回复 3` |
| 数据健康度 | `record.anomalies` | `anomalies` | `prompt-builder.js:81`、`:100` | `存在缺陷 VIEWS_MISSING` |
| 【任务】指令 | `style` + `language` + `maxChars` | `style`/`language`/`maxChars` | `prompt-builder.js:103-111` | `写 1 条评论。` / `字数上限：220 字` |
| 【硬性要求】 | 常量指令 4 条 | `INFORMATION_VALUE_RULE` 等 | `prompt-builder.js:113-117`（常量 `prompt-templates.js:41`） | `1. 信息增量优先、禁止复述原文：…` |
| `system`（消息体） | 模板 `system` 全量 | `template.system` | `prompt-builder.js:121` | 见 2.2 |

**未进入提示词的已采集字段**：`record.id`、`record.source`、`metrics.views`（仅经算法变为 `pace`/`predicted`，`src/core/algorithm.js:144`）、`metrics.bookmarks`、`hasMedia`、`mediaUrls`、`quotedTweetId`、`stats.hoursAliveRaw`、`stats.exposure.baseRate/floored`、`degraded`。

### 2.2 系统提示词的真实来源与最终形态

| 消息 | 内容来源 | 代码位置 | 实际文本 |
| --- | --- | --- | --- |
| `system`（reply） | `presets/.../ai-tweet-reply-high.sys-prompt.md` | 路径 `prompt-templates.js:26-28`、`:95-100`；装配 `src/cli.js:296-300` | 该文件 `:18-26`：`你是一位在Twitter上深度运营的真实用户。请基于以下推文内容或后续用户输入的推文内容,生成5条高质量评论。` + 「⚠️ 重要原则」5 行 |
| `system`（quote） | `presets/.../ai-retweet.sys-prompt.md` | 同上 | 该文件 `:20-32`：`请基于以下推文内容，输出一条高质量的引用转发的中文推文，无需其他解释。` + 示例格式代码块 |
| `user` | `buildCommentPrompt(...).prompt` | `comment-service.js:161-170` | 见 2.1 |
| 组装点 | `complete({system, prompt, maxTokens?, signal?})` | `comment-service.js:165-170` | host 通道 `complete-gateway.js:184-206`；HTTP 通道 `:91-101`（`messages:[{role:'system'…},{role:'user'…}]`） |

---

## 三、重点发现

### F1（核心结论）全链路只抓「焦点推文」，**从不抓取评论区/回复内容**

- 唯一采集入口是 OpenCLI 时间线命令：`src/collect/opencli-source.js:83`（`['twitter','timeline','-f','json','--limit',N]`）；hub 侧只有 `x/user-tweets` 与 `x/tweet` 两个 capability（`src/collect/hub-source.js:24`、`:27`），**没有任何评论/reply-list capability**。
- `replies` 字段在全仓**仅以数字形态消费**：`src/collect/tweet.js:341`（解析为数字）、`src/core/algorithm.js:145`（竞争折扣）、`src/pipeline.js` 与 `src/present/*` 仅展示（如 `src/present/table-renderer.js:156`）、`src/comment/prompt-builder.js:99`（写入提示词作为计数）。**无任何一处读取回复的内容文本**。
- **显式「评论区」意图的唯一出现**是测试夹具里的一句推文正文：`test/fixtures/timeline.json:92`（`…表在评论区。`）——它是被采集的原文内容，不是抓取目标。
- 契约文档同口径：`docs/shared/README.md` 的 `TweetRecord` 字段表无任何评论/回复实体；`docs/system_design.md:669`（U6）明确「本期只做首页时间线」。
- 因此：**本插件不存在评论区抓取，也不存在「评论内容作为生成上下文」的代码路径**。

### F2 无 `id` 的推文会让草稿错配到别的推文（真实缺陷）

- 契约允许 `id` 缺失为空串（`docs/shared/README.md` §1「源缺失时为空串」）。
- `generateComments` 用 `String(tweet?.record?.id ?? '')` 作结果键：`src/comment/comment-service.js:280`。
- `pipeline` 用同一键建 Map 并按候选行回查：
  1. `generatedByTweet.set(draft.tweetId, draft)` — `src/pipeline.js:303`
  2. `generatedByTweet.get(String(row.record.id))` — `src/pipeline.js:326`
- 结果：两条以上 `id === ''` 的候选行全部映射到**同一个 Map 键**，后者覆盖前者（`:303`），随后**同一份草稿被贴到每一条无 id 的候选行上**（`:326`）。即「A 推文的评论显示在 B 推文下面」。
- 去重表救不了：`isAlreadyDrafted` 对空串直接返回 `false`（`src/run-store.js:208`）。
- 严重度：仅在源缺失 id 时触发；`anomalies` 里**没有** `ID_MISSING` 这类码（`src/collect/tweet.js:12`），所以该状态在输出层不可见。

### F3 hub 的「单条推文」路径从主流程不可达（死代码）

- `buildHubRequest` 支持 `author` / `tweetId`，并在有 `tweetId` 时切到 `x/tweet` capability：`src/collect/hub-source.js:40-54`。
- 但唯一生产调用点 `src/pipeline.js:220-231` 构造的 options **只含** `source/limit/type/nowMs/timeoutMs/maxTweets/chunkDelayMs/fixturePath/allowHubFallback`，**没有 `author`/`tweetId`**；`fetchTimeline` 也未从别处补（`src/collect/timeline-fetcher.js:164`、`:187`）。
- 叠加 `src/cli.js:315`（`request: undefined`），纯 CLI 运行时 hub 分支整体不可用。**推断：**该能力是为宿主注入场景预留的扩展位，`docs/system_design.md:669`（U6）说明作者维度「不在 T01–T05 范围」。

### F4 `unwrapEnvelope` 会把「非推文对象」兜成一条推文

- `src/collect/hub-source.js:88-97`：`data` 不是数组时，先在 `items/tweets/results/list` 里找数组；**都找不到就把整个对象包成单元素数组**（`:96` 注释「单条推文场景：data 本身就是一条记录」）。
- 后果：返回 `{data: {user: {...}}}` 这类元信息信封时，`user` 对象会被 `buildRecord` 归一成一条**全字段空的「推文」**（`src/collect/tweet.js:302-351`），只带 `AUTHOR_MISSING`（`:320`），随后进入打分并为它生成评论。
- 同类风险（OpenCLI 侧）：`parseEnvelope` 在 `['data','items','tweets','results','list']` 中**取第一个数组值**（`src/collect/opencli-source.js:152-155`），若信封同时含元数据数组与推文数组，取到的是先声明键的那个。

### F5 `pickField` 的「第一命中」与 `comments` 别名会静默丢弃回复数据

- `pickField` 按候选键顺序返回**第一个存在且非空**的值：`src/collect/tweet.js:119-130`。
- `replies` 的候选键含 `comments` / `comment_count`：`src/collect/tweet.js:55`。若源提供的 `comments` 是**评论对象数组**（评论区常见形态），`parseMetric` 对非字符串/非数字类型返回 `null`（`src/collect/parse-metrics.js:85`），`metrics.replies` 变 `null`，且**不产生任何 anomaly**（`parseMetricWithAnomaly` 只为 `views` 打标，`src/collect/tweet.js:325-326`）。
- 影响：竞争折扣项被按 `nullToZero` 当 0 处理（`src/core/algorithm.js:100`、`:145`），`competition` 顶到上界 1.08（`src/core/algorithm.js:42`、`:112`），曝光被高估，且提示词里的 `回复 —`（`src/comment/prompt-builder.js:99`）会误导模型。

### F6 抵达模型的硬编码兜底文本（逐字）

| 兜底文本（字面量） | 触发条件 | file:line |
| --- | --- | --- |
| `（原推正文为空）` | `record.text` 为空 | `src/comment/prompt-builder.js:85` |
| `—`（作者） | `record.author` 为空 | `src/comment/prompt-builder.js:88` |
| `—`（链接） | `record.url` 为空 | `src/comment/prompt-builder.js:89` |
| `—`（数字） | 数值非有限 | `src/comment/prompt-builder.js:23`、`:33` |
| `未知` | 未知 tier（外层亦兜 `normal`） | `src/comment/prompt-builder.js:46`、`:94` |
| `这条推文` | 离线草稿话题片段取不到 | `src/comment/comment-service.js:92`、`:96` |
| 离线骨架 `关于「{topic}」，我补一个原推没提的点：__（填一个具体数据或案例）。…` | 模型通道不可用/校验不过 | `src/comment/comment-service.js:118` |
| 离线骨架（引用）`「{topic}」这个结论值得记一下。\n\n我看到的补充是 __（填一个具体数据或案例）…` | 同上 | `src/comment/comment-service.js:117` |
| 内置系统提示词全文（reply / quote 各一段） | SoPilot 提示词读不到（`TEMPLATE_FALLBACK`） | `src/comment/prompt-templates.js:47-66` |
| `信息增量优先、禁止复述原文` | 恒定注入 | `src/comment/prompt-templates.js:41`、`src/comment/prompt-builder.js:114` |

**提示：** `__（填一个具体数据或案例）` 是留给**人**的填空占位符，但离线草稿会**原样**进入 `drafts[].reply.text` 并输出到表格/Markdown/GenUI（`src/pipeline.js:324-328`、`src/present/table-renderer.js:311-313`）——它**不会**被再次送给模型。

### F7 模板指令与用户指令直接冲突（5 条 vs 1 条）

- `system`：`…生成5条高质量评论`（`presets/.../ai-tweet-reply-high.sys-prompt.md:20`，经 `extractSystemPrompt` 生效）。
- `user`：`写 1 条评论。`（`src/comment/prompt-builder.js:107`）。
- 同一会话内两条互斥的数量要求，且后置校验只按字数/联系方式判合格（`src/comment/comment-service.js:58-72`），**不会**因「输出了 5 条」而判不合格。

### F8 生效的系统提示词只是资产的一小截

- `extractSystemPrompt` 按 `^##\s+` 切分，只返回 `## 系统提示词` 到**下一个** `##` 之间的内容：`src/comment/prompt-templates.js:75-87`（切分 `:78`、标题匹配 `:82`）。
- `ai-tweet-reply-high.sys-prompt.md` 共 175 行，其中 `## 评论核心公式`（`:28`）、`## 应用公式的思考流程`（`:96`）、`## 写作要求`（`:115`）、`## 生成策略`（`:142`）等约 130 行方法论**全部被丢弃**，生效的只有 `:19-26`。
- 例外分支：若文件中**不存在**标题为「系统提示词」的小节，则回退为去 frontmatter 的**全文**（`:86`）——此时整份资产（含示例与占位符小节）会整体作为 system 注入。

### F9 同族资产内含浏览器 DOM 选择器（不进 prompt，但可作对照证据）

- `ai-retweet.sys-prompt.md:35` 逐字为：`{textContent('[data-testid="attachments"] button span')}`。
- 该行位于 `## 推文内容如下:` 小节（`:34`）之内，而 `extractSystemPrompt` 的 system 提取截止到 `:34` 的 `##` 之前，因此**当前不会进入模型上下文**（依据 `src/comment/prompt-templates.js:78-86` 的切分逻辑）。
- 但若走到 F8 的「无系统提示词小节 → 取全文」分支（`:86`），这类浏览器 DOM 选择器语法就会整体注入 system。
- **推断：**该选择器形态（`data-testid` + `textContent(...)`）说明这一资产族原本面向浏览器页面取数；在本 CLI 插件中它既不被执行也不被替换，属于「来源是浏览器、消费方是 CLI」的语义残留。此点交由并行审计的浏览器扩展侧交叉验证。

### F10 补全响应只取第一个候选

- `extractCompletionText` 取 `choices[0]` 的 `message.content`，否则回退 `choices[0].text`：`src/comment/complete-gateway.js:164-177`（`choices[0]` 在 `:168`）。
- 不读 `finish_reason`，不合并多候选；若网关按「多条评论」返回多 choice（与 F7 的 system 指令相契合），**只有第 1 条**进入草稿。

### F11 提示词与推文原文会出境到第三方端点

- HTTP 直连通道默认基址 `https://api.omnimux.ai`（`src/comment/complete-gateway.js:16`），模型默认 `omnimux-default`（`:19`），请求体含 `system` + `prompt` 全文：`:91-101`、`:106-114`。
- 触发条件：进程环境存在非空 `OMNIMUX_API_KEY` / `OMNIMUX_TOKEN`（`complete-gateway.js:57-64`）且已注入 `fetcher`（`src/cli.js:310` 传 `globalThis.fetch`）。
- 后果：推文正文、作者、链接、互动量与本地算法指标随请求离开本机；README 未就此提示（`README.md:86-95` 只描述通道层级）。

### F12 `OMNIMUX_BASE_URL` 从不被读取；`.credentials.yaml` 通道在 CLI 路径不可用

- `OMNIMUX_BASE_URL` 仅出现在**错误提示字符串**里：`src/comment/complete-gateway.js:117`、`:124`，`src/**` 中**无任何读取点**；`resolveCompleteChannel` 只接受注入的 `deps.baseUrl`（`:226-231`），而 `src/cli.js:310` 只传 `{env, fetcher}`——**推断：**用户照提示设置该环境变量不会生效。
- `.credentials.yaml` 兜底依赖 `deps.credentialsText`（`complete-gateway.js:63`），`src/**` 中除该处与类型注释外无任何赋值点，`src/cli.js` 也从不读凭据文件 → 该兜底在 CLI 路径**不可达**，与 `README.md:89` 的说明不符。

### F13 进入提示词的上下文缺口（模型盲区）

- 引用推文：`quotedTweetId` 已采集（`src/collect/tweet.js:347`）但**全仓无消费点**，提示词不含被引用推文内容 → 模型基于一条「上下文缺失」的推文写评论。
- 图片/视频：`hasMedia` / `mediaUrls` 已采集（`src/collect/tweet.js:344-346`）但**无消费点**，提示词不含媒体信息或媒体直链。
- 原始浏览量与发布时间：`metrics.views`（`src/collect/tweet.js:338`）与 `createdAtMs`（`:335`）均不进提示词，只以本地推导的 `R`/`j`/`predicted` 形式出现（`src/comment/prompt-builder.js:92-96`）。
- 长推文：正文超 1200 字即截断并追加 `…（原推过长，已截断）`（`src/comment/prompt-builder.js:75-78`），模型看不到后半段。

### F14 哪些字段是「真的逐条」、哪些是「全局静态」

| 类别 | 内容 | 证据 |
| --- | --- | --- |
| **真·逐条（per-target）** | `text`、`author`、`authorHandle`、`url`、`hoursAlive`、`pace`、`tier`、`exposure.predicted/timeDecay/freshnessBonus/competition`、`likes`、`retweets`、`replies`、`anomalies` | `src/comment/prompt-builder.js:74-100` |
| **全局静态（所有推文共享同一份）** | `system` 提示词全文、`INFORMATION_VALUE_RULE`、硬性要求第 2–4 条、语言指令、风格指令、`maxChars` 默认 220、离线骨架文案 | `prompt-builder.js:113-117`、`:104-111`、`:12`；`prompt-templates.js:41`、`:47-66` |
| **关键推论** | 由于 F1，提示词中**没有**任何「评论区已有讨论」的上下文；所谓「抢评」的竞争判断只由本地算法算出的**回复计数**近似（`src/core/algorithm.js:112`），而非真实评论区内容 |  |
| **需注意** | `maxChars` 属全局参数（`--max-chars`，`src/cli.js:157`），但模板 system 中的段落数量要求（`分为3~5个段落`）与之**互不校验** | 资产 `presets/tiktok-agent/skills/sopilot-social-agents/references/prompts/ai-tweet-reply-high.sys-prompt.md:25` vs `src/comment/prompt-builder.js:111` |

---

## 四、未覆盖的部分

本次审计**未覆盖**以下内容，任何据此报告做的判断均不应延伸至这些区域：

1. **浏览器扩展本体**（`dsh-browser-extension` 等）：按要求完全未看；F9 的对照结论需由并行审计补齐。扩展侧的 `data-testid` 选择器、注入点、取数时机在本报告内**没有任何结论**。
2. **SoPilot 资产的其余文件**：仅读了 `ai-tweet-reply-high.sys-prompt.md`（结构 + `:18-34`）与 `ai-retweet.sys-prompt.md`（结构 + `:18-38`），未读 `ai-tweet-comment`、`ai-tweet-reply`、`ai-tweet-reply-follow`、`twitter-reply-en`、`SKILL.md` 路由表全文。
3. **插件内未逐行读的文件**：`src/core/algorithm.js`（仅读公式相关行）、`src/core/metrics.js`、`src/core/errors.js`、`src/run-store.js`、`src/present/report-writer.js`、`src/present/table-renderer.js`、`src/present/genui-dashboard.js`、`src/pipeline.js` 的落盘/日志段、`cordis.patch.yml`、`dsh.manifest.json`、`docs/algorithm.md`、`docs/system_design.md`（仅 grep 关键段）、时序/类图 mermaid。
4. **测试体系**：`test/*.test.js` 与夹具仅用于交叉印证字段形态（例如 `test/fixtures/timeline.json`），**未运行**任何测试，也未据此断言行为正确性。
5. **运行时行为**：未执行 CLI、未访问网络、未启动子进程，因此 F2/F3/F4/F5/F12 均为**静态代码推断 + 代码级可复现路径**，未经实机复现。
6. **宿主侧**：宿主如何注入 `request` / `textComplete`（`src/cli.js:315`、`:337-340`）由 `plugins/omnimux/**` 决定，本报告未跨插件核对，故「hub 通道是否在真实宿主中启用」**未验证**。
7. **提示词效果**：未评估生成质量、未对比模型输出，本报告只描述「喂了什么」，不评价「写得好不好」。

---

### 附：一句话摘要

`omnimux-intercept` 的上下文 = **一条焦点推文的正文/作者/链接 + 本地算法算出的 4 组指标 + 计数型互动量**，全程**不抓评论区**；评论内容在数据模型里根本不存在（`replies` 只是数字）。提示词中确定性的硬编码兜底有 10 处（见 F6），系统提示词来自仓库资产的**单一一小节**（F8），并与用户提示词存在数量冲突（F7）。
