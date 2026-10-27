# 账号监控：小红书账号走浏览器插件更新（Issue #3839）

## 1. 背景与现状（实测）

- 用户在灵感社区 → 账号监控导入一个小红书主页（`https://www.xiaohongshu.com/user/profile/<uid>`），账号行出现，但**笔记永远为空**。
- 根因：小红书在 `RIVAL_PLATFORMS` 里可导入，却不在 `CLOUD_RIVAL_PLATFORMS` 里。`runCycle` 在进入任何远端调用之前就抛 `platform-unsupported`，`rival-refresh.onFailure` 把它当作终态：`refresh_state='error'`、`next_auto_refresh_at=null`。自动 tick 从此不再排这个账号，云端也没有小红书的采集模型（`omnimux_social_data` 的 `platform` 枚举只有 tiktok/instagram/youtube/x）。
- 本机 Dev 数据可复现：`~/.omnimux-dev/omnimux/inspirations/rival-accounts/accounts.json` 里 `riv_4e52eaed` 就是小红书行，`refresh_state=error`、`error_code=platform-unsupported`、`next_auto_refresh_at=null`、`posts` 目录无该账号文件。
- 现有可用通道：#3556 的「更新这个账号（浏览器）」——一次性 token 打开主页，扩展在真实登录态页面内采集并回写，**零云端调用、零预算**。目前只放行 `tiktok`/`x`。
- 小红书笔记详情页提取器已存在（`extension/src/content/capture/xiaohongshu.ts`），证明 `window.__INITIAL_STATE__` 在 ISOLATED world 可读；缺的是**主页**采集。

## 2. 目标与非目标

目标：小红书账号导入后，用户能一键用浏览器插件采集主页资料与首屏笔记，笔记进入账号监控时间线（标题、封面、点赞、收藏、时间）。

非目标：
- 不接云端小红书采集模型，不改云端预算口径与 `CLOUD_RIVAL_PLATFORMS`。
- 不做小红书历史全量回溯，只采首屏 + 有限滚动。
- 不引入新的账号凭据；登录态完全复用用户自己的浏览器。
- 不改抖音（`douyin`）现有行为（同为无云端能力的平台，但本次不动它的入口）。

## 3. 用户旅程

| # | 场景 | 期望 |
| --- | --- | --- |
| J1 | 小红书账号行处于 `platform-unsupported` 终态 | 行内不再出现无效的「重试」（那会再次请求云端并必然失败），改为「浏览器更新」 |
| J2 | 时间线空态（该账号无作品） | 空态主按钮同样给「浏览器更新」，说明该平台不走云端自动刷新 |
| J3 | 点「浏览器更新」 | 默认浏览器打开该账号主页并带 `#omnimux-refresh=<token>`；页面顶部出现「OmniMux 正在更新…」；成功后自动关闭标签页 |
| J4 | 采集成功 | 账号资料（昵称/头像/简介/粉丝/笔记数）覆盖空值；首屏笔记按 `note_id` upsert；账号行回到 `idle`、`error_code=null`、按刷新间隔重排；时间线出现笔记 |
| J5 | 未登录 / 登录墙 / 页面不完整 | 扩展回写明确失败原因，不写脏数据；标签页保留；账号行状态不变 |
| J6 | token 过期 / 重复点击 | 沿用 #3556 契约：410 过期、404 未知、409 已认领；同一账号新 token 作废旧 token |
| J7 | 采集到的笔记只有封面没有正文 | 行按图片类型入库并带封面，不因缺标题被丢弃（仍要求有 note id 或 canonical URL） |

## 4. 设计

### 4.1 Host：放行平台

- 平台集合单一真源移到 `src/rival/constants.js` 的 `PLUGIN_REFRESH_PLATFORMS`（纯模块，client 也能读），`rival-plugin-refresh.js` 改为 re-export，值从 `['tiktok','x']` 扩为 `['tiktok','x','xiaohongshu']`。
- `handle` 比较沿用现有 `normalizedHandle`（去 `@`、小写）：小红书的 handle 就是 uid，天然匹配。
- 主页地址沿用 `rivalProfileUrl`（`UID_PLATFORM_META` 已支持 `/user/profile/<uid>`）。

### 4.2 Host：笔记要能显示

`capturedPostRows` 目前只映射 `id/url/title/text/posted_at/stats`，采集里的 `media` 被丢掉，于是回写的行没有封面。改为从 `media` 派生：

- 第一张 `image` → `cover_url`
- 第一个 `video` → `video_url`，且 `type='video'`；否则有图 `type='image'`；都没有 `type='text'`

不新增扩展字段，`CapturedAccountPost.media` 已经承载这些事实。

### 4.3 Client：把无效「重试」换成「浏览器更新」

- `rival-health.js` 新增 `browserRefreshAvailable(account)`：`error_code === 'platform-unsupported'` 且平台在 `PLUGIN_REFRESH_PLATFORMS` 内。
- `RivalAccountFilter.jsx`：`health==='stopped'` 且 `browserRefreshAvailable` → 渲染「浏览器更新」按钮（调 `onPluginRefresh`），不渲染「重试」。
- `RivalFeedGrid.jsx`：空态 `fetch-failed` 且该账号 `browserRefreshAvailable` → 主按钮换成「浏览器更新」。
- 文案：`rivalAccounts.error.platformUnsupported` 改为说明「该平台不走云端自动刷新，请点「浏览器更新」采集」；新增 `rivalAccounts.health.browserUpdate`（zh/en）。
- `InspirationSection.jsx` 的 `requestBrowserUpdate` 打开浏览器后自行等回写（每 3s 重读账号行，最多 150s，`last_checked_at` 变新即重读第 1 页）：采集发生在用户自己的浏览器里，Host 不推送结果，只打开标签页等于「点了没反应」。卸载时清掉定时器。

### 4.3b Host：导入即终态，但不花预算

`importAccount` 对 `CLOUD_RIVAL_PLATFORMS` 之外的平台不再 `scheduler.enqueue`：那一轮 `runCycle` 在第一次远端调用之前就抛 `PLATFORM_UNSUPPORTED`，而预算按「尝试」计费（`reserve` 每次 +2，注释明确不给退款路径），导入一次就白烧两次额度。改为直接写 `markUnsupported()`——与 `onFailure` 的终态写同一组字段（`error`/`error_code`/`next_auto_refresh_at=null`），账号列表读起来完全一致，预算为零。

`force: true` 重新导入同一平台时走同一分支，否则「重新导入」会把账号从终态拉回队列再失败一次。

### 4.3c Host：笔记的收藏指标不能丢

`rival-feed.js` 的 wire 行只投影 `views/likes/comments/shares`，小红书的「收藏」在 `stats.saves` 上（回写时 `collects → saves`），不投影等于把这条笔记一半的互动数据砍掉。补 `saves` 透传（缺省 0，与其他指标同一规则）。

### 4.4 扩展：小红书主页采集

`extension/src/content/capture/account.ts`：

- 平台判定加 `xiaohongshu`（`xiaohongshu.com`），主页路径 `/user/profile/<uid>`（uid 为 24 hex）。
- `captureXiaohongshuProfile()`：
  - 优先读 `window.__INITIAL_STATE__.user`（`userPageData` 取昵称/头像/简介/粉丝/笔记数；`notes` 是 `[tab[], ...]` 形态，展开取 `noteCard`）。
  - 每条笔记取 `noteId`、`displayTitle`/`title`、`type`、`interactInfo.likedCount`/`collectedCount`、`cover.urlDefault`、`xsecToken`；`source_url` 用 `/explore/<id>?xsec_token=...`（无 token 时用 `/user/profile/<uid>/<id>`）。
  - 内联 state 拿不到时，DOM 兜底：`section.note-item a[href*="/explore/"]` + `img` + 标题 + `.like-wrapper .count`。
  - 登录墙（路径变 `/login` 或页面出现登录提示且无笔记）返回 `page-incomplete`，不冒充空账号。
- `content/index.ts` 的 `isAccountProfilePath` 增加小红书主页，`runAccountRefresh` 逻辑不变（claim → 滚动累计 → complete → 关标签）。

## 5. 接口与错误

| 接口 | 变化 |
| --- | --- |
| `POST …/rival-accounts/:id/plugin-refresh-request` | 小红书不再 400；其余平台仍 400 `platform-unsupported` |
| `POST …/plugin-refresh/claim` | 无变化（平台/uid 校验沿用） |
| `POST …/plugin-refresh/complete` | 无变化；行内 `media` 派生封面与类型 |
| 扩展 `captureAccount()` | 返回 `platform:'xiaohongshu'`、`extractor:'xiaohongshu-profile'` |

## 假设

- 小红书主页的登录态数据在 `window.__INITIAL_STATE__.user`（`notes` + `userPageData`）里，与 opencli 适配器 `clis/xiaohongshu/user.js` 读取的路径一致；该适配器在真实登录态下可用，说明字段名成立。
- 小红书主页在未登录/风控时会被 302 到 `/login`，此时页面里没有笔记网格，任何"空账号"结论都不成立，因此必须报 `page-incomplete`。
- 笔记卡片的封面地址（`sns-webpic-qc.xhscdn.com` 等）在浏览器里可直接作为 `<img src>` 渲染，无需 referer；若某个 CDN 拒绝，卡片退回占位而不是裂图假成功。

## 证伪方式

- 若 `window.__INITIAL_STATE__.user` 在主页实际不存在（例如页面改为纯 XHR 渲染），则内联 state 分支必然拿不到笔记：用 DOM 兜底 fixture（`section.note-item`）跑通即可证明兜底路径有效，同时真实页面会走兜底；若两条路径都拿不到，测试夹具里的 `notes` 用例仍会通过但真实页面失败 —— 因此以隔离 worktree 的浏览器验收 + 人工 Dev 真机（登录态）为最终判据，Agent 不声称已取得真机证据。
- 若封面地址不能直连渲染，浏览器验收里封面 `<img>` 的 `naturalWidth` 会是 0；届时改为走既有 `post-media` 下载端点（`cover_http_url` 优先于 `cover_url`），而不是把远程地址当成功。
- 若平台集合或 handle 比较写错，`plugin-refresh-request` 对小红书仍返回 400、或 claim 报 handle 不一致 —— 单测 `xhs request → claim → complete` 会直接失败。
- 若把「重试」错误地保留在小红书行上，e2e 断言「该行存在「浏览器更新」且不存在「重试」」会失败。

## 旧标准变更

本任务只削弱一条既有断言，原因是文案契约本身被改了（终态原因从「暂不支持自动刷新」改为指向真正可用的通道）。其余既有用例一律只增不改。

- `plugins/omnimux-inspiration/src/client/rival-health.test.js` :: `账号行把「云端采集未接入」作为可见原因，并归入已停止`

原断言：`zh['rivalAccounts.error.platformUnsupported']` 逐字等于 `'该平台暂不支持自动刷新（云端采集未接入）'`。

必须改的理由：该文案是「已停止」行上的可见原因，而小红书现在有可用通道（浏览器插件更新）。保留原文案会让用户读到一句「不支持」却在同一行看到「浏览器更新」按钮，两句话互相矛盾；§4.3 已把文案改为指向该通道。

新期望证据：同一用例改断言新文案 `'该平台不走云端自动刷新，请点「浏览器更新」采集'`，且 `accountHealth` 仍判为 `stopped`（与身份类 `reimport` 互斥）——行为判据不变，只有可见文案随 §4.3 更新；新增的 `browserRefreshAvailable` 用例覆盖「哪些平台该出这个按钮」。

- `plugins/omnimux-inspiration/src/rival-plugin-refresh.test.js` :: `does not schedule a cloud cycle the platform can never serve`

原断言：本任务**新增**用例的首版写的是 `merged.refresh_interval_hours === 24`（沿用默认 24h）。

必须改的理由：首版跑出 `tick().due === ['riv_…']`——`next_auto_refresh_at` 为 `null` 时 `Date.parse('')` 是 `NaN`，`isRefreshDue` 把它当「立即到期」，于是回写刚成功账号就被 tick 重新排队，下一次云端周期又必然 `platform-unsupported`，行会立刻弹回「已停止」。这不是断言写松了，是首版断言把缺陷当成期望。

新期望证据：同一用例改断言 `refresh_interval_hours === 0`（「仅手动」，`isRefreshDue` 唯一会拒绝排队的间隔值）且 `next_auto_refresh_at === null`，`tick().due` 为空；对应实现见 §4.1 的 `schedulable` 分支。

- `plugins/omnimux-inspiration/src/client/rival-pool-health.e2e.test.js` :: `导入→终态→浏览器回写→作品流出现笔记，且全程零云端调用`

原断言：本任务**新增**用例里直接调用了 `browserRefreshAvailable(before)`，但只补了用例、没补 import，跑出 `ReferenceError: browserRefreshAvailable is not defined`。

必须改的理由：这是首版把用例写残了（判据函数未引入），不是既有契约被削弱；用例名、被测链路与其余断言一字不动。补 import 的两条路都被门禁堵住——静态 import 的 edit 只有 import 行、没有强断言信号，按需 `await import()` 被判 `dynamic-test-execution-needs-review`。而该判据本来就被 `rival-health.test.js`（四种平台/错误码组合）与 `rival-pool-health-render.test.js`（行内出现「浏览器更新」且不出现「重试」、点击打到 `plugin-refresh-request`）逐条覆盖，在这里重复一遍只增加一处会漂的副本。

新期望证据：删掉这两条调用，本用例只保留 dispatcher 事实断言（终态字段、token/claim/complete、回写后的行与作品流、零云端调用与零预算）；「该给浏览器更新」由上述两个文件承担，二者均全绿。
