# 作品采集改插件内完成：扩展提取 + host 直传落盘（Issue #3472）

## 1. 目标与背景

抖音/小红书作品只能存成降级链接：host 的导入管线依赖 hub `omnimux_social_data`，而该工具只支持 tiktok/instagram/youtube/x。用户已确认：作品采集可以由浏览器插件在已登录页面内完成，不需要接外部 API。

目标：6 平台（X / TikTok / YouTube / Instagram / 抖音 / 小红书）作品详情页保存时，扩展在页面内提取结构化作品 + 媒体直链，经本机回环直传 host；host 用普通 CDN 下载（按需带 Referer/UA/Cookie）落盘，写为灵感库记录。提取或下载失败时回退现有云端 / 降级链路，不出现假成功。

## 2. 用户旅程

| # | 场景 | 期望 |
| --- | --- | --- |
| J1 | 在 YouTube / TikTok / X 作品页点保存 | 扩展页面内提取标题/正文/作者/统计/封面/媒体直链 → host 下载落盘 → toast「已保存到 OmniMux 灵感素材库！」；库里是可播放视频（图集为多图） |
| J2 | 在 Instagram / 抖音 / 小红书作品页点保存（登录态页面） | 同上；平台专用解析不可用时用通用兜底（meta/JSON-LD/DOM 媒体），至少能存到标题/正文/封面/直链；提取不到媒体时回退云端/降级 |
| J3 | 在账号主页点保存 | 维持已上线行为：写入账号监控（不再尝试作品提取） |
| J4 | 页面结构变化 / 提取为空 / host capture 非 2xx | 回退现有 `import-url` 链路（抖音/小红书最终仍是降级链接），toast 按真实结果展示，不假成功 |
| J5 | 媒体下载单条失败（防盗链/404/超限） | 其余媒体照常入库；记录保留并把原因写入 `import_error`，`import_status` 反映实际结果 |
| J6 | 重复保存同一作品 | 按 canonical key 去重，返回既有记录，不新增行 |

## 3. 采集契约（扩展 → host）

### 3.1 扩展消息

| 消息 | 方向 | 载荷 | 响应 |
| --- | --- | --- | --- |
| `CAPTURE_POST` | background → content script（`chrome.tabs.sendMessage`） | `{}` | `{ ok: true, post: CapturedPost }` / `{ ok: false }` |

`CapturedPost`（`extension/src/content/capture/types.ts`）：

```ts
interface CapturedPost {
  platform: 'x' | 'tiktok' | 'youtube' | 'instagram' | 'douyin' | 'xiaohongshu' | 'web'
  source_url: string            // 作品详情页 URL（不是短链原样）
  title: string                 // 非空；通常是正文首行或作品标题
  content: string               // 正文/描述，可为空
  content_shape: 'text' | 'photo' | 'gallery' | 'video'
  author: { name: string, handle: string }
  stats?: { likes?: number, comments?: number, views?: number, shares?: number, collects?: number }
  posted_at?: string            // ISO
  cover_url?: string
  media: Array<{ type: 'video' | 'image', url: string }>   // 最多 20 条
  cookie?: string               // document.cookie（可能为空；HttpOnly cookie 读不到）
}
```

- 提取器只读页面已有内容：内联 JSON script（YouTube `ytInitialPlayerResponse`、TikTok `#__UNIVERSAL_DATA_FOR_REHYDRATION__`、抖音 `_ROUTER_DATA`/`RENDER_DATA`、小红书 `__INITIAL_STATE__`）、JSON-LD、og/meta、DOM。不发起额外网络请求做解析，不注入远端脚本。
- 每个平台一个 `extract<Platform>`；通用兜底 `extractGeneric` 覆盖任意作品页（og:title/description/image、JSON-LD、`<video src>`/`<source>`、正文容器内图片）。
- X 复用现有 `content/twitter-capture` 的 `extractTweetCapture`，映射为 `CapturedPost`。
- 不新增 manifest 权限：cookie 只取 `document.cookie`（JS 可读部分）；HttpOnly cookie 缺失时由 host 带 Referer/UA 尝试，仍失败则回退。

### 3.2 host 接口

`POST /omnimux/inspiration/local/capture`

```jsonc
{
  "platform": "douyin",
  "source_url": "https://www.douyin.com/video/7126745726494825736",
  "title": "标题",
  "content": "正文",
  "content_shape": "video",
  "author": { "name": "昵称", "handle": "id" },
  "stats": { "likes": 1 },
  "posted_at": "2026-10-20T00:00:00.000Z",
  "cover_url": "https://...",
  "media": [
    { "type": "video", "url": "https://...", "headers": { "referer": "https://www.douyin.com/", "user-agent": "...", "cookie": "..." } }
  ],
  "tags": ["抖音", "灵感采集"]
}
```

- 响应：`201 { data: record }`；命中既有记录 `200 { data: record, existing: true }`；校验失败 `400/422 { error }`。
- 服务端规则：
  - `platform` 由 `detectPlatformFromUrl(source_url)` 复核，请求里的值只作为兜底展示；`source_url` 必须公开 http(s)。
  - `media[].url`、`cover_url` 必须公开 http(s)；条数 ≤ 20；单条/total 大小沿用 `downloader.js` 上限。
  - `headers` 白名单仅 `referer` / `user-agent` / `cookie`（大小写不敏感），值去 CRLF、长度 ≤ 4096，其余键丢弃；header 只用于该次下载，不落库、不写日志。
  - 下载复用 `downloadMedia`（新增 `opts.headers` 透传），目录/命名沿用灵感库 media 树（videos/images/covers）。
  - 记录结构复用导入路径：`title/source_url/source_platform/type/cover_url/media_urls/media_items/local_paths/content/author/stats/posted_at/content_shape/tags/auto_analyze:false`；去重按 `getCanonicalItemKey`。
  - 部分/全部媒体失败：能落盘的照常入库，`import_status` = `ready` | `degraded`，`import_error` 写第一条原因；全部媒体失败且没有封面 → 422，由调用方回退云端链路。
  - 不做 AI 拆解（`auto_analyze` 固定 false）。
- `url-normalizer.js` 补 canonical key：`douyin:video:<aweme_id>`、`xiaohongshu:note:<note_id>`（query 里的 `xsec_token` 等忽略）。

## 4. 扩展保存流程

`DSH_SAVE_INSPIRATION_PANEL` 现有顺序扩展为：

1. 分类（已上线）：`kind === 'account'` → 账号监控导入，结束。
2. 作品路径：查询当前活动标签页 → `CAPTURE_POST`；拿到 `CapturedPost` 且 `media.length > 0` →
   - 组装 headers：`referer = 页面 URL`、`user-agent = navigator.userAgent`、`cookie = post.cookie`；
   - `POST /local/capture`（候选端口同现有顺序，超时 ≤ 8s）；
   - 2xx → `{ ok: true, target: 'inspiration', via: 'capture' }`，写 `appendMediaInspiration` 缓存（与现有灵感库保存一致）。
3. 失败/无提取 → 现有 `import-url` + `/local` 兜底；成功 `{ ok:true, target:'inspiration', via:'import' }`；失败沿用 `local-header-overflow|save-failed`。

面板 `via` 不改变现有文案（用户体验仍是「已保存到 OmniMux 灵感素材库！」）；`via` 仅便于测试与后续诊断。

## 5. 影响范围

Host（`plugins/omnimux-inspiration`）：
- `src/http-routes.js`：capture 路由
- `src/http-handlers.js`：capture handler（校验/去重/下载/写库）
- `src/downloader.js`：`opts.headers` 透传（`fetchValidated`）
- `src/url-normalizer.js`：抖音/小红书 canonical key
- 测试：`capture-*.test.js`、`downloader.test.js`（若存在）、`url-normalizer.test.js`

Extension（`plugins/omnimux-browser/extension`）：
- 新增 `src/content/capture/{types,index,generic,youtube,tiktok,x,instagram,douyin,xiaohongshu}.ts`
- `src/content/index.ts`：注册 `CAPTURE_POST` 消息
- `src/background/index.ts`：capture 优先 + 回退
- 测试：`tests/capture-extractors.spec.ts`（fixture HTML/JSON）、`tests/capture-save-routing.spec.ts`（后台路由）

## 6. 非目标

- 账号监控自动刷新插件化（另单）。
- 移除云端采集通道；4 平台仍保留 import-url 兜底。
- 登录态/风控对抗（验证码、设备指纹等）；只使用页面已有内容。
- 图集去水印、转码、AI 拆解、历史记录迁移。

## 7. 全新用户基线

- 仅需本机 OmniMux host + 浏览器扩展 + 用户已登录的目标站点页面；不依赖云端 API、开发机路径或私钥。
- host 不可达：capture 请求失败 → 回退 import-url（同样失败则既有失败提示）。
- 抖音/小红书未登录/被风控：提取器返回 `ok:false` → 回退降级链接，不报假成功。

## 8. 测试与验收

Host：
```
cd plugins/omnimux-inspiration && node --import ./scripts/deny-network.mjs --test src/*.test.js src/rival/*.test.js src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js
```
新增断言：header 白名单/CRLF 拒绝；下载请求确实带 referer/cookie；部分失败降级与 `import_error`；canonical 去重；抖音/小红书 key。

Extension：
```
cd plugins/omnimux-browser/extension && npx vitest run tests/capture-extractors.spec.ts tests/capture-save-routing.spec.ts && npx vitest run
```
新增断言：6 平台 fixture 提取（标题/正文/作者/媒体数量/直链）；无 JSON 时通用兜底；空媒体返回失败；后台 capture 成功不再走 import-url、失败回退 import-url；账号路径不触发 capture。
构建：`node scripts/build.mjs`。

真实浏览器证据：worktree 隔离 runner 的 inspiration Stage + 扩展构建产物；抖音/小红书真实页面选择器需人工登录态验收（Dev 45120 归人工）。

## 9. 风险与回滚

- 抖音/小红书公网直取被风控，提取器只能基于登录态页面内联 JSON/DOM，选择器需真实页面回归；不可用时自动回退，不阻塞其它平台。
- 直链带时效签名（抖音/小红书），host 必须紧接着下载；失败即降级。
- Header 传递边界：白名单 + 去 CRLF + 不落库；HttpOnly cookie 不可读时自动降级。
- 回滚：capture 是新增前置分支，回退到 `import-url` 即恢复旧行为；不迁移数据。
