# 公共资产媒体路由 302 重定向的非 ASCII URL 编码（Issue #3028 跟进）

## 用户旅程
新安装用户打开资产库 → 公共 → 声音 → 点播放：卡片请求 `/omnimux/assets/cloud/media?id=…`，服务端应回 302 到 `assets.omnimux.ai` 的 URL；当前 voiceover 行（文件名含中文/空格）返回 500，bgm/sfx 行正常。

## 根因
`cloudMediaRoute` 把 `resolved.url` 原样写进 `Location` 响应头；URL 含中文/空格时 Node `writeHead` 抛 `ERR_INVALID_CHAR`，被路由的兜底 catch 包成 500。目录全云化后所有音频重定向都走这条路，问题面扩大。

## 范围
`plugins/omnimux-assets/src/http-routes.js`：302 分支写 `Location` 前对 URL 做 `new URL(url).href` 规范化（或等价 encodeURI），非法 URL 兜底为 `cloud-media-unavailable`。

## 验收
- 任一含中文/空格的 media_url 经 Dev 路由返回 302，`Location` 为百分号编码后的合法 URL；bgm/sfx 行为不变。
- 新增测试：voiceover 中文键 → 302 + 编码 Location；非法 URL → 404 语义。
- `pnpm --filter omnimux-assets test` 全绿。
