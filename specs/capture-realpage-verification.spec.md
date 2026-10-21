# 真实页面注入测试驱动的作品提取修正（Issue #3485）

## 1. 背景与目标

#3472/#3475 交付了 6 平台作品提取器，但只有合成 fixture。用 ego-browser 把真实构建产物（esbuild IIFE）注入真实作品页后发现 4 处真实结构差异，本次按实测结果修正，并把真实结构固化进单测。测试驱动，不靠猜测。

## 2. 验收标准（AC）

| # | 验收项 | 可观察证据 |
| --- | --- | --- |
| AC1 | Instagram reel 真实页：`capturePost` 返回 title、author、media（video 或 image 直链） | ego 注入 JSON + 截图 |
| AC2 | 小红书笔记真实页（带 `xsec_token`）：source_url 保留可回放 token、cover 为笔记图片、author 正确 | ego 注入 JSON + 截图 |
| AC3 | X 视频推文：媒体只取 `video.twimg.com`/`.mp4` 类直链；直播回放缩略图不得标为 video | ego 注入 JSON |
| AC4 | 抖音真实视频页：通过 MAIN world 读取页面数据（SSR_RENDER_DATA / aweme detail XHR）拿到 author 与 `play_addr` 直链 | ego 注入 JSON + 截图 |
| AC5 | 真实结构脱敏 fixture 进单测，全量测试绿；构建通过 | 测试计数 |
| AC6 | IG / XHS / X 的媒体直链被 host 侧成功下载（隔离 DSH_HOME 的 capture 接口） | 落盘文件 + `import_status=ready`。**实测结果：XHS/X/抖音 ready；IG 视频 25.9MB、CDN 约 119KB/s，60s 下载超时 → degraded，需要后台下载** |
| AC7 | TikTok/抖音「页面内取字节→本机回传」协议写入 spec，明确下一单实现（本次不实现） | 本 spec §5 |
| AC8 | 大媒体（>30s）保存不能让扩展 30s 超时后回退旧链路：host capture 改为 202 受理 + 后台下载，或扩展延长等待并展示进度 | 下一单；本次实测已确认 douyin 236MB、IG 25.9MB 均超过 30s |

## 3. 实测结论（2026-10-21，ego-browser，真实页面）

| 平台 | 提取 | 媒体直链 | host 下载 | 结论 |
| --- | --- | --- | --- | --- |
| YouTube | ✅ 元数据 | ❌ 27/27 流 signatureCipher，无 url | — | 保留云端媒体下载（用户已确认） |
| TikTok | ✅ 元数据 | ✅ 页面内 fetch 200 video/mp4 | ❌ 带 cookie/UA 仍 403（Akamai 拒非浏览器） | 需页面内取字节回传 |
| X | ✅ 文本/图片；直播缩略图误标 video | 普通视频未复测 | — | 修正媒体类型选择 |
| Instagram | ❌ media/author 空 | 数据在 `require.xdt_api__v1__media__shortcode__web_info.items[0]` | scontent CDN 页面 fetch 被 CORS 拒；host 可下 | 解析器修正 |
| 抖音 | ❌ media/author 空 | 数据经 XHR `/aweme/v1/web/aweme/detail/` + `SSR_RENDER_DATA`；视频 MSE blob | 待测（play_addr） | MAIN world 桥接 |
| 小红书 | ✅（tokenized 链接） | ✅ 图片直链 | 待测 | 保留 token、cover 修正 |

## 4. 实现

### 4.1 Instagram（`src/content/capture/instagram.ts`）

真实详情 JSON 形状：

```
script[type="application/json"] → { require: { xdt_api__v1__media__shortcode__web_info: { items: [ {
  code, pk, media_type, taken_at,
  video_versions: [{ url, width, height }],
  image_versions2: { candidates: [{ url, width, height }] },
  carousel_media: [{ media_type, video_versions, image_versions2 }],
  user: { username, full_name },
  caption: { text },
  like_count, comment_count, play_count
} ] } } }
```

- `mediaNode` 增加 `isInfoItem`：含 `video_versions`/`image_versions2` 且含 `code`/`pk`。
- `mediaOf`：`video_versions[0].url` → video；`image_versions2.candidates[0].url` → image；`carousel_media` 逐项展开；保留旧 `shortcode_media` 形状。
- 作者：`user.username` / `user.full_name`；正文：`caption.text`；统计：`like_count/comment_count/play_count`；时间：`taken_at`（秒）。
- cover：第一张 image（video 用 `image_versions2` 或 `display_url`）。

### 4.2 小红书（`src/content/capture/xiaohongshu.ts`）

- `source_url` 必须保留 `xsec_token`（真实页面回放必需）；canonical 去重由 host 的 `getCanonicalItemKey` 负责（已忽略 token）。
- `cover_url`：优先笔记首图，禁止落到平台静态 logo。
- 作者：`note.user.nickname` / `note.user.user_id`。

### 4.3 X（`src/content/capture/x.ts`）

- media 类型按 URL 判定：`video` 仅当 URL 匹配 `video.twimg.com` / `.mp4` / `.m3u8`；否则按 image 处理。
- 若推文本身是直播回放（媒体只是缩略图），media 取 image，`content_shape` 相应降级，封面仍可用。

### 4.4 抖音 MAIN world 桥接

- `manifest.json` 增加第二个 content script：`matches: ["https://www.douyin.com/*", "https://www.iesdouyin.com/*"]`，`js: ["capture-main.js"]`，`world: "MAIN"`，`run_at: "document_start"`。
- 新增入口 `src/content/capture/douyin-main.ts`（构建输出 `dist/capture-main.js`）：
  - document_start 包装 `XMLHttpRequest.prototype.open/send` 与 `window.fetch`，捕获 `/aweme/v1/web/aweme/detail/` 响应 JSON；
  - 若 `window.SSR_RENDER_DATA` 存在也读取；
  - 将找到的 aweme 对象写入 `<script type="application/json" id="omnimux-douyin-capture">`（≤2MB），供 isolated world 读取。
- `src/content/capture/douyin.ts`：优先读该 script 元素；字段映射 `aweme_id/desc/author.nickname/author.unique_id/video.play_addr.url_list[0]/video.cover.url_list[0]/statistics{digg_count,comment_count,share_count,play_count}/create_time`；旧 DOM/JSON 兜底保留。
- 构建：`vite.content.config.ts` 增加 `capture-main` 入口（IIFE，独立输出），`scripts/build.mjs` 无需改配置列表。

### 4.5 测试

- `tests/capture-extractors.spec.ts` 增/改：IG 真实形状（items[]）、carousel、XHS token 保留 + 首图 cover、X 直播缩略图按 image、抖音 MAIN 桥接 script 元素读取。
- 所有断言 `node:assert/strict`、无 TS 专有语法（写入门禁可解析）。

## 5. 下一单（本次非目标）：媒体字节回传协议

用户已确认允许「页面内取字节 → 本机回传」。协议（下单一实现）：

1. 扩展判断媒体需浏览器会话（platform ∈ {tiktok, douyin}，或 host 返回 401/403）。
2. content script 在页面内 `fetch(mediaUrl, { credentials:'include' })` 读取 `arrayBuffer()`。
3. 按 1MB 原始字节切片 → base64 → `chrome.runtime.sendMessage({ type:'CAPTURE_MEDIA_CHUNK', sessionId, index, seq, data, final })`。
4. background 逐块 `POST /omnimux/inspiration/local/capture-media-chunk`（JSON 体 ≤2MB，沿用现有 body 上限），host 按 `sessionId/index` 追加写临时文件并校验总大小上限。
5. 全部媒体完成后 `POST …/capture-commit`：host 校验会话、生成记录（`import_status=ready`）、返回 `{data}`；失败清理临时文件并返回可读错误。
6. 覆盖：TikTok 视频、抖音 `play_addr` 视频；图片仍需 host 下载（CORS 允许时也可回传）。

## 6. 风险

- 抖音 MAIN world 注入随平台前端变化失效时，isolated 提取器回退 DOM 兜底，host 回退 import-url，不假成功。
- Instagram/X 的 CDN 可能按地域/会话变化；以 host 实测下载结果为准（AC6）。
- X 直播回放不是普通视频文件，本次按图片处理并记录为图片，避免把缩略图当视频入库。
