# Spec: 本地灵感库路由放行 OPTIONS 预检 (Issue #2494)

## 1. 背景与目标
云端灵感库视频因上游存储问题（工单 No.257）大面积不可达。改为从卡片原帖（TikTok `source_url`）经既有社媒解析下载管线（`POST /omnimux/inspiration/local/import-url`）拉取真实视频流播放。跨域页面（file:// 单文件工作台）发起该 POST 会被浏览器 OPTIONS 预检拦截——本地路由对 OPTIONS 返回 404。
目标：本地路由对 OPTIONS 短路返回 204（其 `sendJson` 已带完整 CORS 头），与中枢云网关（Issue #2492）口径一致。

## 2. 最小实现范围
- `plugins/omnimux-inspiration/src/index.js`：`callLocalEndpoint` 起始处对 `OPTIONS` 短路 `sendJson(res, 204, {})`。
- 不改任何业务路由、鉴权与媒体流行为。

## 3. 验收标准
1. `OPTIONS /omnimux/inspiration/local/*` 返回 204 且带 `Access-Control-Allow-Origin: *`。
2. `http-entry.test.js` 新增适配层断言通过；`pnpm --filter omnimux-inspiration test` 全绿。
