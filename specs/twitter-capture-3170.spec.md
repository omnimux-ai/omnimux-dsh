# 推特推文结构化采集规格（Issue #3170 · 阶段一）

> 本规格是本次改动的人机共享真相源。实现前必须存在；验收以第 6 节为准。
> 关联调研（本地，未入库）：`.agent-reports/twitter-card-adaptation/01-inspiration-save-triggers.md`、`02-inspiration-data-model-and-cards.md`、`03-extension-insertion-points.md`。
> 本票是三阶段计划的第一阶段（补采集）。卡片渲染见阶段二，X 卡片入口见阶段三。

## 1. 背景与问题

精灵助手（`plugins/omnimux-browser/extension`）在推特上保存帖子时，落库载荷只有 8 个字段，且 `content` 取的是**网页标题**（`postText` 根本没进 `directItem`）。推文的正文、作者、发布时间、互动数据、多图全部丢失，灵感库因此只能显示一张封面图。

同时，`/omnimux/inspiration/local/import-url` 的 `auto_analyze` **默认开启**（`plugins/omnimux-inspiration/src/http-handlers.js:1120` 判定 `body.auto_analyze !== false`），而扩展目前**一处都没传该字段** —— 从扩展保存推文会被自动拆解，与「只保存、不拆解」的定位相反。宿主侧早已支持该字段（`local-store.js:126-129` 白名单已含，`?? true` 保留显式 `false`），这是纯粹的不对称，不需要新宿主能力。

另有两个已确证的实现陷阱：

1. 字段透传经过**两个显式白名单**：`background/index.ts:2621-2634` 的 TS 入参类型、`plugins/omnimux-inspiration/src/local-store.js:99-141` 的 `buildRow`。任一漏改，字段被**静默丢弃**，读回为 `undefined`。
2. `PageSceneContext`（`page-sensor.ts:9-20`）与面板的 `PageSceneInfo`（`SceneBadge.tsx:4-16`）是**两个近似接口**；新增字段必须两处同时加，否则面板读不到。

## 2. 目标

1. 扩展侧新增推文结构化采集：从一条推文的 DOM 里抽出正文、作者、时间、互动数据、全部媒体、引用、线程、投票与类型。
2. 采集结果随保存载荷进入灵感库，落库后字段可读回。
3. 扩展发出的全部灵感库保存请求显式传 `auto_analyze: false`。
4. 抓不到的字段一律留空（键缺失），绝不补 0、绝不编造。
5. 复用既有选择器真源，不复制第二份。

## 3. 非目标

- 不做卡片渲染（阶段二）、不做 X 卡片触发器（阶段三）。
- 不做推文内容分析、摘要、提示词生成。
- 不改 `type` 枚举（保持 `video | image | link`），不改 `import-url` 的云端解析能力。
- 不改 `MediaCard`、不改灵感库网格、不改 `media-hover` 胶囊与 TikTok 行为。
- 不修 `scripts/scan-ui-gates.mjs` 的 `includes('lib')` 子串豁免缺陷（真问题，属独立范围；本票在证据中记录为发现项）。

## 4. 数据契约

### 4.1 扩展侧 `TweetCapture`（新增，`src/content/twitter-capture/types.ts`）

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `shape` | `'text'\|'photo'\|'gallery'\|'video'\|'quote'\|'repost'\|'thread'\|'article'\|'poll'\|'link'` | 推文类型。选择器校验未通过的类型退化为 `text` / `photo` |
| `url` | `string` | 永久地址 `https://x.com/{handle}/status/{id}` |
| `text` | `string` | 推文正文；无正文时为空串 |
| `author` | `{ name, handle, avatar, verified }` | `avatar` 为绝对地址；`verified` 为布尔 |
| `postedAt` | `string \| null` | ISO 时间；抓不到为 `null` |
| `mediaUrls` | `string[]` | 全部媒体绝对地址，按 DOM 顺序 |
| `coverUrl` | `string` | 卡片封面：首图 / 视频 poster / 链接卡缩略图；无则为空串 |
| `stats` | `{ likes?, comments?, shares?, views? }` | **键缺失表示抓不到**，不是 0 |
| `quoted?` | `{ author: {name,handle,avatar}, text, coverUrl? }` | 引用推文，一层嵌套 |
| `threadItems?` | `string[]` | 线程条目，上限 10 |
| `poll?` | `{ options: {label,pct}[], votes, closesAt? }` | 投票 |

导出 `extractTweetCapture(article: HTMLElement): TweetCapture | null`。签名与 `twitter-velocity/extractor.ts` 一致（传入一个 `HTMLElement`），使单测成本最低。

### 4.2 落库字段（宿主 `LocalInspirationRecord`）

新增四个字段，`buildRow` 白名单同步：`content_shape`（string）、`quoted`（object）、`thread_items`（string[]）、`poll`（object）。

复用既有字段：`content`（推文正文）、`author`（`{name,handle,avatar}`，新增可选 `verified`）、`stats`（`likes/comments/shares/views/bookmarks`）、`media_urls`、`cover_url`、`posted_at`、`source_url`、`auto_analyze`。

X 的指标映射沿用宿主既有语义（`local-store.js` / `http-handlers.js`）：点赞 → `likes`、回复 → `comments`、转推 → `shares`、浏览 → `views`。

### 4.3 保存请求契约

扩展的 5 处灵感库保存请求全部显式带 `auto_analyze: false`：

| 位置 | 端点 |
| --- | --- |
| `App.tsx:1404` | `/omnimux/inspiration/local/import-url` |
| `App.tsx:1413` | `/omnimux/inspiration/local`（直存 `directItem`） |
| `background/index.ts:2675` | `/omnimux/inspiration/local/import-url` |
| `background/index.ts:2684` | `/omnimux/inspiration/local`（直存 `itemBody`） |
| `background/media-export.ts:223` | `/omnimux/inspiration/local/import-url`（TikTok 链路乙） |

## 5. 用户操作旅程与期望反馈

**旅程 A（主路径）**：用户在 x.com 打开一条图文推文 → 打开侧边栏/浮动工作台 → 点「保存到灵感库」→ 面板显示「已保存到 OmniMux 灵感素材库！」→ 灵感库中出现该记录，正文、作者、时间、点赞/浏览、全部图片均可读。

**旅程 B（纯文字推文）**：用户保存一条无媒体的纯文字推文 → 保存成功 → 记录 `content_shape = 'text'`、`media_urls` 为空、`cover_url` 为空；不报错、不写入占位图。

**旅程 C（互动数据缺失）**：某条推文的互动栏未渲染 → 保存成功 → `stats` 中对应键**不存在**（不是 0）。

**旅程 D（保存失败）**：OmniMux 未运行 → 面板显示既有文案「保存失败，请检查 OmniMux 运行状态」，不新增分支、不静默成功。

**期望界面反馈**：本票**不改变任何界面外观**（卡片渲染是阶段二）。唯一可见变化是灵感库记录的详情/预览里出现正文与作者等字段。

## 6. 验收用例（以本节为准）

**AC-1 字段完整性**：在 x.com 详情页保存一条图文推文后，库内记录满足：`content` = 推文正文；`author.name` 与 `author.handle` 非空；`author.avatar` 为绝对地址；`media_urls` 长度等于推文图片数；`content_shape` ∈ 类型枚举；`source_url` 匹配 `^https://x\.com/[^/]+/status/\d+$`。

**AC-2 关闭自动拆解**：同一条记录的 `auto_analyze` 落盘为 `false`；且 5 处保存请求的 body 均含 `auto_analyze: false`（源码字符串断言）。

**AC-3 纯文字推文**：保存一条纯文字推文后，`content_shape === 'text'`、`media_urls` 为空数组、`cover_url` 为空串，且记录可正常读回。

**AC-4 缺失即缺键**：构造一条互动栏缺失的推文 DOM，`extractTweetCapture` 返回的 `stats` 中不含对应键；**断言键不存在，不断言值为 0**。

**AC-5 类型识别**：对单图、多图（2/3/4）、视频、引用、投票、链接卡各构造一次 DOM，`shape` 分别返回 `photo`、`gallery`、`video`、`quote`、`poll`、`link`；引用推文同时返回 `quoted.text` 与 `quoted.author.handle`。

**AC-6 不误取头像**：构造一条推文 DOM，其 article 内**第一个 `img` 是头像**、第二个才是推文图片；断言 `media_urls` 只含推文图片地址、不含头像地址。

**AC-7 不误取引用卡的链接**：构造引用推文 DOM；断言 `url` 指向**外层**推文的 `/{handle}/status/{id}`，不是被引用推文的地址。

**AC-8 宿主白名单**：`local-store` 单测断言四个新字段经 `buildRow` 后仍在；同时断言一个未列入白名单的键被丢弃（锁定「逐键构造」语义不被无意放宽）。

**AC-9 无回归**：`extension` 包测、`typecheck`、`build` 全绿；`omnimux-inspiration` 包测全绿；`pnpm verify:stages` 通过；被改红的既有断言（`surface-registry` 除外 —— 本票不动 surface）已同步更新。

**AC-10 真机证据**：工作树内真实浏览器上，在 x.com 按类型各保存一次（纯文字 / 图文 / 多图 / 视频 / 引用），留存截图与库内记录核对结果到 `docs/evidence/twitter-capture-3170/`。新选择器（poll / 线程 / 链接卡 / 转帖来源行 / gallery 容器 / bookmark）在真实页面实测命中数；未通过校验的类型退化为 `text`/`photo` 并记录原因。

## 7. 实现约束

- 新增模块放 `extension/src/content/twitter-capture/`；复用 `twitter-velocity/extractor.ts` 已导出的 `extractTweetIdAndUrl` / `extractAuthorAndText` / `parseMetricValue`。
- **偏离说明（以 AC-4 为准）**：`extractViews` / `extractReplies` 在「抓不到」时返回 `0`（`extractViews` 的兜底与 `extractReplies` 的末行 `return 0`），而 AC-4 要求缺失即缺键。因此本模块只复用它们的 `parseMetricValue`，计数器的存在性判断自己实现。`extractCreatedAtMs` 同样含「缺失时按 1 小时前估算」的兜底，属编造时间，故 `postedAt` 直接读 `time[datetime]`，缺失即 `null`。
- `TWEET_MEDIA_SELECTOR` 从 `media-hover/classifier.ts` **导出**后复用，不在新模块复制第二份字符串。
- 采集函数整体不吞错到静默：抓不到返回缺失字段；结构性失败返回 `null`（不返回半成品），由调用方决定退化为 `text`。
- 单测用 `// @vitest-environment jsdom`；DOM 用 `createElement` + `setAttribute('data-testid', …)` 逐层拼；`beforeEach` 同时清 head 与 body。
- 本票**不新增界面代码**，因此不触发 UI 门禁；若因改动意外触及 `.tsx`，`pnpm test:ui` 必须无新增违规。

## 8. 边界

**总是做**：改动前后跑本票选定的最小命令集；新字段同时改「扩展透传」与「宿主白名单」两处；抓不到就留空；证据落 `docs/evidence/`。

**先问**：改 `type` 枚举；新增第三方依赖；改 `MediaCard` 或灵感库网格；改动 `media-hover` 胶囊或 TikTok 行为。

**绝不做**：提交 `extension/dist/`（未入库的本地构建产物）；在载荷里补 0 或占位值冒充抓到的数据；把 `auto_analyze` 写成字符串 `"false"`（宿主用 `!== false` 判定，字符串会被当作开启）；修改 `surface-registry` 相关断言（属阶段三）。

## 9. 假设与未决（实机验证后已更新）

实机验证见 `docs/evidence/twitter-capture-3170/report.md`。10 条真实推文全部采集成功，0 失败；以下两条源码假设被实机推翻并已修复：

1. **头像容器选择器**：仓库既有写法 `[data-testid="UserAvatar-Container"]` 在真机上 **0 命中**；真实 test id 带 handle 后缀（`UserAvatar-Container-<handle>`）。已改为前缀匹配，并把头像地址的尺寸后缀（`_x96`）升为大图。
2. **视频形态判定**：真机上一条视频被**两个容器画一次媒体**（静图包裹 + 播放器），共用同一地址；按容器去重会只剩静图，视频被误判为 `photo`。已改为「形态读全部容器、媒体列表按地址去重」。

其余实测事实：`article[tabindex="-1"][data-testid="tweet"]` 在详情页命中 1 且索引为 0（焦点优先判据成立）；首页与详情页均**无 article 嵌套**（阶段三挂载密度风险低于预估）。

仍未取得真机正样本的类型：**投票、引用、链接卡、转推、线程、长文**（本轮页面未出现）。这些类型的解析逻辑有构造 DOM 的单元测试覆盖，但无真机样本；采集器只在选择器实际命中时才判定该形态，命中不了即退化，不猜不编造。

未决：`payload.media` 旁路是否适合承载推文结构化数据（下游 `detectedMedia[0]?.src` 是否误读）。本票选择把 `tweet` 放进 `PageSceneContext` 主通道，不走 `media` 旁路。

风险：云端社媒数据源对 X 返回哪些键无离线契约可查；本票**刻意不依赖**它，走扩展侧 DOM 采集 + 直存，`import-url` 仅作降级路径并关闭自动拆解。

发现项（不在本票范围）：`page-sensor.ts` 的 `extractHeroImage` 仍使用失效的精确头像选择器（三处），其头像排除逻辑在真机上实际不生效。
