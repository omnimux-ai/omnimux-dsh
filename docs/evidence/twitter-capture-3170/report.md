# 推特推文结构化采集 · 实机验证报告（Issue #3170）

> 规格：`specs/twitter-capture-3170.spec.md`。验收以规格第 6 节为准，本报告记录实机证据。
> 采集代码在真实 x.com 页面、真实登录态下运行（ego-browser + esbuild 打包的探针，探针源码 `.tmp/tweet-probe-entry.ts`）。

## 1. 结论

推文采集在真机上可用：**10 条真实推文全部采集成功，0 条返回 null、0 次抛错**，正文（含中文多段）、作者、handle、头像、认证态、时间、互动计数、多图与视频形态均正确。

实机验证推翻了两处**仅凭源码写下的假设**，两处都已修复并复验：

| # | 假设（源码推断） | 实机事实 | 处置 |
| --- | --- | --- | --- |
| 1 | 头像容器是 `[data-testid="UserAvatar-Container"]`（仓库既有写法） | **精确匹配 0 命中**；真实 test id 带 handle 后缀（`UserAvatar-Container-<handle>`），前缀匹配 18 命中 | 改为前缀选择器；头像尺寸后缀由 `_x96` 升为大图 |
| 2 | 视频推文由 `videoPlayer` 容器表示，按容器去重即可 | 视频被**两个容器画一次媒体**（静图包裹 + 播放器），共用同一地址；按地址去重后只剩静图，视频被误判为 `photo` | 形态判定读全部容器，媒体列表按地址去重 |

## 2. 修复前（实机首次运行）

`live-capture-before-fix.json` / `x-home-before-fix.png`

- 5 条推文，5 条采集成功、0 失败。
- `author.avatar` **全部为空**（头像选择器 0 命中）。
- 形态：`["photo","photo","gallery","photo","photo"]` —— 含视频的帖子被报成 `photo`。

## 3. 修复后（实机复跑）

`live-capture-report.json` / `x-home-live.png`

- 10 条推文（滚动加载更多），10 条采集成功、0 null、0 失败。
- 形态：`["video","text","text","text","video","text","text","photo","photo","video"]` —— **3 条视频正确识别为 `video`**。
- 首个 `img` 位于头像容器内的帖子：**10 / 10**（修复前 0）—— 证实「article 内第一个 img 是头像」，也证实前缀选择器生效。
- 样例（真实记录，非构造）：

```
url        https://x.com/heisdavies94285/status/2107097097644183607
text       How?😳
author     { name: "Anny", handle: "heisdavies94285", verified: false }
postedAt   2026-10-05T13:14:30.000Z
mediaUrls  [ "https://pbs.twimg.com/amplify_video_thumb/…/V5xFqRzYnQIcTgSo.jpg" ]
coverUrl   同上
stats      { likes: 174, comments: 75, views: 176914 }
```

另一条（中文多段正文 + 头像升图 + 认证态）：

```
url        https://x.com/lksmlabc/status/2107168951457456601
author     { name: "Lucas", handle: "lksmlabc",
             avatar: "https://pbs.twimg.com/profile_images/…/t7AGn1R5_400x400.jpg",
             verified: true }
stats      { likes: 7, comments: 2, views: 458 }
```

## 4. 选择器勘察（`selector-discovery.json`）

在真实首页与真实详情页统计各选择器命中数：

| 选择器 | 首页命中 | 详情页命中 | 说明 |
| --- | --- | --- | --- |
| `article[data-testid="tweet"]` | 5 | 21 | 详情页 = 焦点推 + 20 条回复 |
| `article[tabindex="-1"][data-testid="tweet"]` | 0 | **1** | 详情页焦点推，索引 0 —— 规格 §5 的焦点优先判据成立 |
| `article` 嵌套 `article` | **0** | **0** | 实机无嵌套（阶段三的挂载密度风险低于预估） |
| `[data-testid="UserAvatar-Container"]` | **0** | — | 精确匹配失效 |
| `[data-testid^="UserAvatar-Container"]` | **18** | 29 | 真实形态 |
| `[data-testid="tweetPhoto"]` | 6 | — | |
| `[data-testid="videoPlayer"]` / `videoComponent` | 3 / 3 | — | |
| `[data-testid="cardPoll"]` | 0 | 0 | 该页无投票帖，未取得正样本 |
| `[data-testid="quoteTweet"]` / `attachments` | 0 | 0 | 该页无引用帖，未取得正样本 |
| `[data-testid="card.wrapper"]` | 0 | 0 | 该页无链接卡，未取得正样本 |
| `[data-testid="socialContext"]` | 0 | 0 | 该页无转推帖，未取得正样本 |

## 5. 未取得正样本的类型（规格 §9.2 的退化处理）

投票、引用、链接卡、转推、线程、长文六类在本轮真机页面上**没有出现**，因此：

- 采集器对这六类**只在选择器实际命中时**才判定该形态；命中不了即退化为 `text` / `photo`，不猜、不编造字段。
- 单元测试用构造 DOM 覆盖了这六类的解析路径（含「引用卡内的媒体不计入本推文」「引用卡内的认证徽章不算本推文作者认证」）。
- 因此：这六类的**解析逻辑有测试覆盖，但无真机正样本**。后续在真实页面遇到这些类型时应补充取证；若实机选择器与仓库既有写法不一致，按第 1 项的方式修正。

## 6. 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `cd plugins/omnimux-browser/extension && pnpm test` | **137 文件 / 1458 通过 / 0 失败**（1 个预期失败为既有） |
| `pnpm typecheck` | 41 条既有错误（`origin/main` 基线同样失败，与本次改动无关）；**本次新增文件 0 错误** |
| `node scripts/build.mjs` | 通过 |
| `pnpm --filter omnimux-inspiration test` | **1100 测试 / 1098 通过 / 0 失败**；另 261/261 |

## 7. 证据清单

| 文件 | 内容 |
| --- | --- |
| `live-capture-before-fix.json` / `x-home-before-fix.png` | 修复前实机运行（暴露两处缺陷） |
| `live-capture-report.json` / `x-home-live.png` | 修复后实机运行（10 条推文） |
| `selector-discovery.json` / `discovery-home.png` / `discovery-detail.png` | 选择器命中数与详情页结构 |

## 8. 发现项（不在本票范围，未处理）

- `src/content/page-sensor.ts` 的 `extractHeroImage` 仍使用失效的精确头像选择器 `div[data-testid="UserAvatar-Container"] img`（三处）。本票未改动该函数，但该选择器在真机上 0 命中，其头像排除逻辑实际不生效。
- `scripts/scan-ui-gates.mjs` 的 `isExempt` 用子串 `includes('lib')` 判定豁免，`library-flow/` 与 `Library*` 命名会整体绕过 UI01–UI10。本票未触碰。
