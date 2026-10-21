# #3556 手动「更新这个账号」：证据

- 任务：Issue #3556（worktree `cross-account-refresh`，分支 `agent/cross-account-refresh-issue-3556`）
- 时间：2026-10-21
- 目标：账号卡片「更新这个账号」→ 默认浏览器打开带一次性 token 的主页 → 扩展采集 profile + 作品 → host 合并 → 自动关闭标签页；不消耗云端预算。

## 1. 真实的页面提取（ego，已登录真实页面）

`ego-extraction-summary.json`：用构建后的 `captureAccount` bundle 在真实页面执行，边滚边 merge。

| 平台 | handle | followers | 提取作品数 | extractor |
| --- | --- | --- | --- | --- |
| TikTok | @tiktok | 96,400,000 | **31** | tiktok-profile |
| X | @NASA | 92,312,000 | **20** | x-profile |

TikTok：`__DEFAULT_SCOPE__['webapp.user-detail'].userInfo` 的 stats 原样进入；作品来自 `div[data-e2e="user-post-item"]`，卡片文本含 views/comments/日期。
X：`[data-testid="UserName"]`、`UserDescription`、`/followers` 与 `/following` 链接文本；作品来自 `article[data-testid="tweet"]`（边滚边累积，虚拟列表回收不影响）。

## 2. Host 合并（真实提取数据 → 隔离 host）

`merge-verify.log`：seed 账号 → request token → claim → complete（用上面的真实数据）→ 读 store。

| 平台 | request | claim | complete | new_posts | store posts | nickname | plugin_refresh | next_auto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tiktok | 201 | 200 | 200 | 31 | 31 | TikTok | null | +24h |
| x | 201 | 200 | 200 | 20 | 20 | NASA | null | +24h |

`MERGE_RESULT PASS`；云端 0 调用（handler 不触 `remote`，单测另有 spy 断言）。

## 3. 扩展 + 一次性 token + 自动关标签页（scripts/lib/extension-e2e.mjs 真实 Chrome）

`harness-tiktok.log`：真实 Chrome（headless=new）+ 构建 dist + 隔离 host。

- `POST /plugin-refresh-request` → 201，url 带 `#omnimux-refresh=<32hex>`；
- 打开该 URL → 内容脚本识别 token → claim 200 → 采集（登录态缺失时只有 profile）→ complete 200；
- host 账号 `last_checked_at` 更新、`followers=96,400,000`、`plugin_refresh=null`；
- **标签页被自动关闭**（`tabStillOpen=false`）。

### 环境限制（如实记录）

harness 使用全新临时 profile（未登录，仓库禁止复制用户登录态）：
- TikTok 未登录主页的视频网格加载失败（页面显示「出错了」），因此本次 harness 只回写了 profile，`posts=0`；
- X 对该 headless 环境直接返回 **403**（`chrome-error://chromewebdata/`），无法在 harness 完成 X 的成功路径。
- 因此「带作品的完整点击流程」拆成两段证据：真实登录页提取（ego，31/20 条）+ host 合并（merge-verify），而 token/claim/complete/自动关 tab 的管线由 harness 证明。产品里用户默认浏览器已登录，两段在同一次点击中完成；Dev 45120 真机验收归人工。

## 4. 测试计数

- host：`src/rival-plugin-refresh.test.js` 34/34；全量（含 client）**1844 passed / 0 fail**。
- extension：`tests/capture-account.spec.ts` 16/16；全量 **151 files / 1603 passed + 1 expected fail**；`node scripts/build.mjs` 通过（dist 含 account capture 与账号刷新流程）。

## 5. 失败/安全行为（代码与单测）

- token：32hex、2 分钟 TTL、绑定账号、一次性；重复 claim 409、过期 410、handle/platform 不匹配 409；
- complete 后 `plugin_refresh=null`；旧 token replay 409（内存 tombstone，TTL 内）；
- 自动关 tab 只在 complete 成功后由内容脚本请求；失败/未装插件/账号不匹配时保留 tab 并显示原因；
- 合并：profile 非空覆盖；posts 按 platform_post_id upsert，重复帖只更新统计，不删除其它帖子；`source:'plugin'`。

## 6. 证据边界

- 不使用/复制用户登录 profile；ego 仅用于真实页面提取验证（agent 的浏览器），不进入产品运行时。
- harness 的真实 Chrome 是 headless 临时 profile，因此 TikTok/X 的登录态受限已在 §3 说明。
- 未做定时后台标签页刷新（下一单）。
