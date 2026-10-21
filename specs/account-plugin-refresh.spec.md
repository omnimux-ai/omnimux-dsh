# 手动「更新这个账号」：默认浏览器插件采集（Issue #3556）

## 1. 背景与目标

账号监控当前依赖云端刷新：每账号每轮 2 次调用，全局日预算 50 次。用户手动想立刻更新某个账号时，只能等调度器 ≤60s 或点刷新消耗额度。本单提供一条**零云端、即时、用户主动**的刷新通道：

> 点「更新这个账号」→ 默认浏览器打开 TikTok/X 主页（带一次性 token）→ 扩展在真实会话里采集 profile + 最新作品 → 回写 host 合并 → 成功后自动关闭该标签页。

## 2. 用户旅程

| # | 场景 | 期望 |
| --- | --- | --- |
| J1 | 点「更新这个账号」（TikTok/X） | 默认浏览器打开该账号主页；页面顶部出现「OmniMux 正在更新…」提示；成功后自动关闭标签页，app 账号数据更新 |
| J2 | 默认浏览器没装插件 | 页面正常打开但不采集；host 在 token TTL 内未收到回写 → 标记超时；app 提示「未检测到浏览器插件」；不写脏数据 |
| J3 | 未登录/验证码/页面不完整 | 扩展校验 handle 失败或提取失败 → 回写失败原因；tab 保留；app 提示；回退现有刷新链路不受影响 |
| J4 | 点完又打开别的账号/手动关闭 tab | 带 token 的 tab 已不在 → host 超时；不补刀、不误写 |
| J5 | token 过期（>2 分钟） | 扩展/回写被 410 拒绝；tab 保留；app 提示重新发起 |
| J6 | 同一账号连点两次 | 第一次 token 作废（一次性）；只有最新一次有效，避免重复刷新 |
| J7 | 云端数据已存在 | 合并：profile 覆盖最新字段；posts 按平台 post id upsert；新帖标记；统计更新；不清空历史 |

## 3. 协议

### 3.1 发起（client → host）

`POST /omnimux/inspiration/local/rival-accounts/:id/plugin-refresh-request`

- host 读取账号（含 platform/handle/主页 URL），生成 token：
  - `token = randomBytes(16).toString('hex')`，保存在账号行 `plugin_refresh`（内存/持久化均可，含 `token, expires_at, created_at, opened_at`）。
  - 同一账号发新 token 时旧 token 立即作废（一次性）。
- 响应：`{ data: { token, url, expires_at } }`；`url = 账号主页 + '#omnimux-refresh=' + token`。
- 非 TikTok/X 平台 → 400 `platform-unsupported`。

### 3.2 打开（client）

用现有 `openExternalUrl(url)` 打开默认浏览器（已有安全校验与测试）；不新增窗口 API。

### 3.3 校验（extension → host）

内容脚本在 TikTok/X 主页检测 hash `#omnimux-refresh=<token>`（只在 `location.hash` 中，不改平台自身 query）。检测到后：

`POST /omnimux/inspiration/local/rival-accounts/plugin-refresh/claim` body `{ token, page_url, handle }`

- host 校验 token 存在、未过期、未使用；平台匹配；`handle` 与账号期望 handle 一致（大小写不敏感、去 `@`）。
- 成功：返回 `{ data: { account_id, platform, handle, page_url } }`，token 标记 claimed（仍等待回写，TTL 内有效）。
- 失败：`404` 未知 token / `410` 过期 / `409` 已使用 / `409` handle 不一致（可读 message）。

### 3.4 采集（extension）

`content/capture/account.ts` 新增 `captureAccount()`：

- 仅 TikTok 与 X 主页；返回：
  ```ts
  {
    platform, handle, nickname, avatar_url, bio,
    followers, following, posts_count,
    posts: [{ platform_post_id, source_url, title, content, posted_at, stats:{likes,comments,views,shares}, media:[...] }],
    captured_at, extractor: 'tiktok-profile' | 'x-profile'
  }
  ```
- TikTok：优先读内嵌 JSON（`__UNIVERSAL_DATA_FOR_REHYDRATION__` / `SIGI_STATE` 的 `userInfo` + `itemList`），DOM 兜底。
- X：读 profile header DOM（昵称、@handle、bio、followers/following）+ 首屏 `article[data-testid="tweet"]` 列表（链接 `/status/<id>`、正文、时间、互动数），最多 30 条。
- 页面懒加载：最多滚动 2 次，间隔 600ms；每次滚动后重新采集，直到达到 20 条或页面没有新内容。
- 提取失败返回 `{ ok:false, reason }`（`not-profile-page` / `handle-mismatch` / `empty` / `page-incomplete`）。

### 3.5 回写（extension → host）

`POST /omnimux/inspiration/local/rival-accounts/plugin-refresh/complete` body `{ token, account }`

- 校验 token claimed 且未完成、未过期；再次校验 handle。
- 合并（事务式写 store）：
  - profile：`nickname/avatar_url/bio/followers/posts_count` 用非空值覆盖；
  - posts：按 `platform_post_id`（无则 canonical URL）upsert；新行 `source:'plugin'`、`first_seen_at`；已有行更新 `stats`、`views_history`（沿用现有 store 语义）；
  - 账号：`last_checked_at/last_refresh_at = now`、`refresh_state='idle'`、`consecutive_failures=0`、`next_auto_refresh_at=now+interval`、`plugin_refresh=null`。
- 不调用云端 `omnimux_social_data`，不消耗预算。
- 响应 `{ data: { updated_posts, new_posts, account } }`。

### 3.6 自动关闭（extension）

- 仅当 `complete` 返回 200 且当前 tab 仍带同一 token 时：background `chrome.tabs.remove(tabId)`。
- 失败、超时、token 被替换、用户已跳转 → 不关闭。
- 关闭前在页面注入一条轻量提示「OmniMux 已更新 @handle（N 条新作品）」，1.2 秒后关闭。

## 4. 失败与安全

- token 一次性、2 分钟 TTL、绑定账号；claim 后 2 分钟内未 complete 视为过期。
- handle 不一致、平台不一致、token 不存在/过期/已用 → 拒绝并保留 tab。
- 不关闭非本 token 打开的 tab；不修改平台页面内容（除一条 OmniMux 提示条，Shadow DOM 隔离）。
- 扩展只对 `tiktok.com` / `x.com` / `twitter.com` 的主页路径生效；其它页面忽略 hash。
- 采集结果只写入本机 host，不回传任何第三方。

## 5. 测试

- host：token 生成/一次性/TTL/handle 校验/claim-complete 状态机；posts upsert 去重；profile 不覆盖非空为空的规则；不触发云端（注入 remote spy 断言 0 调用）；complete 后账号计时重置。
- extension：`captureAccount` TikTok 内嵌 JSON fixture、X DOM fixture、滚动上限、失败原因；hash 识别与「失败不关 tab」文本契约；complete 后关闭消息。
- 真实浏览器（`scripts/lib/extension-e2e.mjs` + 隔离 host）：TikTok 与 X 各一次完整流程 → 账号/profile/posts 更新、tab 关闭、云端 0 调用；截图/trace 证据。

## 6. 非目标

- 定时后台标签页刷新（下一单，复用本单 captureAccount + complete 端点）。
- 评论抓取、全量历史回补、非 TikTok/X 平台。
- 用 ego 作为产品运行时（ego 仅用于验收）。

## 假设

- TikTok 主页内嵌 JSON（UniversalData/SIGI_STATE）与 X 主页 DOM 能稳定提供 profile 字段和首屏 20+ 条作品；X 未登录时会出现登录墙，失败应如实返回而不是空数据。
- 默认浏览器已安装本扩展且用户已登录对应平台；未满足时应超时失败并保留 tab。
- 一次性 token 放在 URL hash 不会破坏平台路由，也不会被平台页面脚本清除或上报；hash 不进服务端日志。
- 合并写入可复用现有 rival store 的 upsert/统计语义，不需要新的数据表。

## 证伪方式

- ego/真实页面验证中，若 TikTok 或 X 主页只能拿到 profile、拿不到 ≥20 条作品（或字段大量缺失），则「页面可满足监控」被证伪，需要改为只更新 profile 或降低条数。
- 真实 E2E 中若扩展拿不到 hash、token claim 失败、或 tab 被关闭后 host 无数据，则「hash + 一次性 token 流程」被证伪，需要改为 host pending 队列 + 扩展轮询。
- 若合并出现重复帖子、旧统计被清空、或 complete 后仍触发云端调用，则合并/零成本假设被证伪。
- 可执行验证：
  - `cd plugins/omnimux-inspiration && node --import ./scripts/deny-network.mjs --test src/rival-plugin-refresh.test.js`
  - `cd plugins/omnimux-browser/extension && npx vitest run tests/capture-account.spec.ts`
  - `node scripts/lib/extension-e2e.mjs` 驱动的真实 Chrome 流程（TikTok + X）
  - host 日志断言 0 次 `omnimux_social_data`

## 实测补充（2026-10-21）

- 真实登录页（ego）提取：TikTok @tiktok **31** 条作品、X @NASA **20** 条作品，profile 字段完整；作为 merge 验证输入。
- `scripts/lib/extension-e2e.mjs` 真实 Chrome（临时未登录 profile）：TikTok token→claim→complete→自动关 tab 全链路成立（profile 回写、`last_checked_at` 更新、tab 关闭）；但未登录 TikTok 主页视频网格被平台拦截（页面显示「出错了」），posts=0。
- X 在该 headless 环境返回 403，无法在 harness 完成成功路径。
- 结论：token/claim/complete/自动关 tab 与「带作品的合并」分别有真实证据；一次连续点击内同时完成两者需要用户已登录的默认浏览器，属产品运行时/人工验收范围。Dev 45120 真机验收归人工。
