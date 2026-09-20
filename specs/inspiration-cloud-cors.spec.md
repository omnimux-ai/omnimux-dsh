# Spec: 中枢云端灵感库网关 CORS 响应头补齐 (Issue #2492)

## 1. 问题与目标
中枢官方灵感库网关（`GET /omnimux/inspiration`，云端公共灵感社区）响应未携带 CORS 头，跨域页面（file:// 单文件工作台、外部域）调用 `fetch` 被浏览器拦截（`TypeError: Failed to fetch`）。对照：领域插件本地灵感库路由 `/omnimux/inspiration/local` 的 `sendJson` 已带完整 CORS 头。
目标：中枢官方网关与本地路由行为一致，跨域 GET 可读、OPTIONS 预检放行。

## 2. 最小实现范围
- `plugins/omnimux/src/auth/http-routes.js`：`sendJson` 增加 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Headers: *`、`Access-Control-Allow-Methods` 三个响应头（与领域插件本地路由完全对齐）。
- `plugins/omnimux/src/official/inspiration-http.js`：`registerInspirationRoutes` 的处理器对 `OPTIONS` 方法短路返回 204。

## 3. 不变更项
- 不改任何业务逻辑、鉴权逻辑与媒体流（`streamMedia`）行为；`<img>/<video>` 标签天然不受 CORS 限制，无需改动。

## 4. 验收标准
1. `GET /omnimux/inspiration` 响应头含 `Access-Control-Allow-Origin: *`。
2. `OPTIONS /omnimux/inspiration` 返回 204。
3. 新增适配层 CORS 断言测试通过；`pnpm --filter omnimux test` 全绿。
