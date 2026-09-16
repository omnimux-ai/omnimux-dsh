# 诊断证据：云端作品分享创建链接静默失败（Issue #2075）

采集时间：2026-09-16 21:43–21:47（Asia/Shanghai）
采集方式：CDP 直连开发版运行窗口（`http://127.0.0.1:9229/json` → page `OmniMux`，URL `http://127.0.0.1:45120/`），
在真实 Electron/Chromium 前端内点击真实 DOM，抓取 Network 与 DOM 状态。

> 说明：本文件是**缺陷根因诊断证据**，不是修复后的验收证据。修复的浏览器验收须在任务独立工作树内重新采集。

## 一、复现步骤

1. 打开「灵感社区」，列表切到含云端作品的视图；
2. 点击任意云端作品卡片（本次分别取 `2789 情绪共鸣型助眠歌单推广`、`2690 发现自己是"第三者"的现场通话录音`）；
3. 预览弹窗打开，点击右上角「分享」；
4. 分享浮层打开，显示「创建链接」按钮；
5. 点击「创建链接」。

## 二、观察到的现象

### 2.1 浮层保持打开（空闲时稳定）

点击「分享」后浮层稳定存在，静止 2 秒不消失：

```
after trigger click: {"popover":true,"triggerActive":true,"ariaExpanded":"true",
                      "submit":true,"progress":false,"steps":[],"link":null,"errTip":null}
after idle 2s:       {"popover":true,...同上前缀...}
```

### 2.2 点击「创建链接」后浮层立即消失，且无任何反馈

以 150ms 步长采样，**首次采样（+0.15s）浮层就已消失**，且没有链接、没有进度、没有错误：

```
+0.15s {"popover":false,"submit":false,"progress":false,"steps":[],"link":null,"errTip":null}
+0.30s ... 同前（持续 2.1s 无变化）
```

浮层内的真实文字随之从「分享灵感 / 链接与有效期…/ 创建链接」整体消失。

### 2.3 后台实际发起了发布并失败

Network 抓包（点击创建链接后）：

```
REQ  POST /omnimux/inspiration/local/2789/share
     {"source":"cloud","type":"image","title":"情绪共鸣型助眠歌单推广",
      "caption":"Give it a try 🥺❤️🫵","category":"Health & Wellness",
      "coverUrl":"","mediaUrls":[],"embedUrl":"",
      "sourceUrl":"https://www.tiktok.com/@charlottegreat2000/video/gxgen-aa5d20e5-..."}
RES  202 Accepted
     {"data":{"id":"2789",...,"share_status":"running","share_stage":"preparing",
              "share_error":null,"share_url":null}}

REQ  GET /omnimux/inspiration/local/2789        （轮询任务行）
RES  200
     {"data":{"id":"2789",...,"share_status":"failed","share_stage":null,
              "share_error":"该云端灵感没有可用的云端素材地址（封面与视频均为空），无法生成分享链接"}}
```

失败原因确凿：**载荷里的 `coverUrl` 与 `mediaUrls` 全为空串**。

### 2.4 云端目录真源其实携带完整素材地址（字段名不同）

`GET /omnimux/inspiration?page=1&page_size=20` 返回同一行（id 为**数字** `2789`）：

```json
{
  "id": 2789,
  "type": "image",
  "title": "情绪共鸣型助眠歌单推广",
  "content": "Give it a try 🥺❤️🫵",
  "cover_key": "/omnimux/inspiration/media/inspiration-covers/2789",
  "media_keys": [
    "/omnimux/inspiration/media/r2/publications/genviral/slideshows/48118b70-ab77-45f5-9323-8ed5daffc8be/slide-1.jpg",
    "/omnimux/inspiration/media/r2/publications/genviral/slideshows/48118b70-ab77-45f5-9323-8ed5daffc8be/slide-2.jpg",
    "/omnimux/inspiration/media/r2/publications/genviral/slideshows/48118b70-ab77-45f5-9323-8ed5daffc8be/slide-3.jpg"
  ],
  "analysis": { "embed_player_url": null, "tiktok_video_id": "gxgen-aa5d20e5-...", ... }
}
```

字段名是 `cover_key` / `media_keys`，而客户端只读 `coverUrl/cover_url` 与 `mediaUrls/media_urls`，
因此读成空串。地址形态也不同：目录给的是**本地媒体代理路径** `/omnimux/inspiration/media/…`，
而发布通道只接受**云端可发布前缀** `/api/inspiration/v1/public/media/…`。

### 2.5 弹窗并未重挂载（排除组件重挂）

在弹窗根节点打标后点击创建链接，标记全程存活：

```
{"t":0.4,"modalPresent":true,"tokenSurvives":true,...}
{"t":3.2,"modalPresent":true,"tokenSurvives":true,...}
```

即浮层消失不是组件重挂导致，而是弹窗内部状态被复位副作用清除。

## 三、根因定位

### 根因一：发布载荷读取的字段名与云端目录真源不匹配

`plugins/omnimux-inspiration/src/client/api.js` 的 `shareRequestPayload`：

- 读 `coverUrl ?? cover_url`，真源是 `cover_key` → 得到 `""`
- 读 `mediaUrls ?? media_urls`，真源是 `media_keys` → 得到 `[]`

结果：载荷素材地址为空 → 服务端 `resolveCloudMediaUrl` 得不到任何可用地址 → 拒绝发布。

### 根因二：弹窗复位副作用以 id 原始值为依赖，被类型翻转触发

`plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx`：

```js
useEffect(() => { setShowSharePopover(false); setShareError(null) }, [item?.id])
```

- 目录行 `id` 是数字 `2789`
- 服务端发布任务行回写的 `id` 是字符串 `"2789"`（`String(id)`）

点击创建的瞬间 `item` 被替换为服务端行，`2789 !== "2789"` 被 React 判为依赖变化，
于是浮层被关闭、`shareError` 被清空 —— 用户看到的就是「点了没反应」。
这也解释了为何 AC-4 要求的可读失败原因永远不可见。

## 四、地址形态映射（修复依据）

| 用途 | 路径形态 | 来源 |
| --- | --- | --- |
| 目录行携带 | `/omnimux/inspiration/media/<sub>` | 本机媒体代理路径 |
| 本地媒体路由服务 | `join(paths.mediaDir, <sub>)` | `http-routes.js` `streamLocalMedia` |
| 发布通道接受 | `/api/inspiration/v1/public/media/<sub>` | 中枢 `CLOUD_MEDIA_PATH_PREFIX` + `resolveCloudMediaUrl` 安全闸门 |
| 列表展示改写（已有） | `/api/inspiration/v1/media/<sub>` → `/omnimux/inspiration/media/<sub>` | `api.js` `hostMediaSrc` |

即：进入发布载荷时需把 `/omnimux/inspiration/media/` 前缀替换为
`/api/inspiration/v1/public/media/`；已是云端前缀或绝对 https 地址则保持原样。
