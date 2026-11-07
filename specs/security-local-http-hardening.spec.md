# 安全审查：本地 HTTP 信任边界加固

## 目标

修复静态安全审查发现的本地 HTTP 信任边界问题，防止任意网页或本地 HTML 文件读取、删除本地灵感库，读取已连接社交账号/分析数据，或通过未鉴权的应用/插件写入口执行操作。修复后，所有本地写入口和敏感读接口只接受本应用同源请求，或返回明确的 503/403，不再发送通配 CORS。

## 用户操作旅程

- 正常用户在 OmniMux 桌面 Web UI 中打开灵感库、账号页、应用页或插件设置：操作与以前一致。
- 正常用户从另一个 localhost 端口打开的页面尝试写入本机 OmniMux：请求被 403 拒绝。
- 用户打开普通网页尝试读取本地账号/灵感数据：浏览器无法读取；无凭证时服务端返回 503/401。
- 用户从应用 UI 触发插件安装：仍可安装 catalog 中的允许包，但外部页面无法伪造安装。

## 命令

- `pnpm --filter omnimux test`
- `pnpm --filter omnimux-inspiration test`
- `pnpm --filter omnimux-apps test`
- `pnpm --filter omnimux-publish test`
- 定向回归：`node --test plugins/omnimux/src/http/local-origin.test.js plugins/omnimux/src/official/http-routes.test.js plugins/omnimux-apps/src/host/routes.test.mjs plugins/omnimux-inspiration/src/http-entry.test.js`

## 项目结构

- `plugins/omnimux/src/http/local-origin.js`：共享本地写来源校验。
- `plugins/omnimux/src/plugins/http-routes.js`：插件安装/卸载 HTTP 路由。
- `plugins/omnimux/src/auth/http-routes.js`：共享 JSON 响应写入器。
- `plugins/omnimux/src/official/http-routes.js`：账号/分析 HTTP 路由。
- `plugins/omnimux-inspiration/src/http-routes.js`、`src/index.js`：本地灵感库 HTTP 入口。
- `plugins/omnimux-apps/src/host/routes.ts`、`src/host/index.ts`：应用清单与执行 HTTP 入口。
- `plugins/omnimux-workflow/src/http/helpers.ts`、`plugins/omnimux-assets/src/http-routes.js`、`plugins/omnimux-publish/src/http-helpers.js`：同类型本地写校验副本。
- 测试文件与对应 `*.test.*` / `routes.test.mjs` 同目录。

## 代码风格

保持仓库现有 CommonJS/ESM 风格：小函数、显式参数、JSDoc 注释；安全校验集中在共享 helper，错误返回结构与现有 `{ error, message }` 一致；不使用裸 `catch` 吞错，不新增依赖。

## 测试策略

- 单元/路由级 Node test：覆盖 foreign origin、same-site、无 Origin、合法 same-origin 和连接缺失 503。
- 对灵感库 `sendJson` 验证不发送 `Access-Control-Allow-Origin: *`；对共享 `sendJson` 同样断言无通配 CORS。
- 对 apps route 验证 `getConnection` 缺失 503、拒绝时 403、合法同源继续、超大 body 413。
- 对 local-origin helper 验证 `same-site` 被拒绝，`same-origin` 通过。
- 不新增 UI；无需浏览器验收。

## 边界

- **总是做**：提交前跑上述相关测试；校验输入；保持错误码稳定；更新触及行为的测试。
- **先问**：改公开 API 签名、改 CI、新增依赖、改生产发布配置。
- **绝不做**：提交密钥；放开通配 CORS 换取兼容；删除已有测试来变绿；修改生产 `~/.omnimux` 或 Dev 共享状态。

## 新用户基线

- 新用户只安装/登录 OmniMux 后即可使用本地 UI；所有修复依赖宿主已有的 `connection` 服务，缺失时返回 503，不依赖开发机 profile、端口或任何本地绝对路径。

## 假设

假设 1：生产宿主始终通过 `ctx.get('connection')` 提供连接鉴权服务，`mountHubHttp` 与 apps 的 `apply` 会把它传入；开发/单测未注入时，相关路由不获得“默认放行”，而是沿用现有测试 seam 或返回 503。
假设 2：桌面 UI 的本地请求是同源 `http(s)://<host>:<port>`；跨源 `file://` 页面不是必须支持的产品路径，若需要支持必须另加 nonce/token，不能恢复通配 CORS。

## 证伪方式

- 若 `pnpm --filter omnimux test` 失败，说明共享 JSON 或 local-origin 修改破坏了现有路由；若新增测试中 foreign origin 仍返回 200，说明 CORS/来源校验没有收紧。
- 若 `pnpm --filter omnimux-inspiration test` 失败，说明灵感库现有客户端或路由契约被误伤；若 `sendJson` 仍输出 `*`，说明修复未生效。
- 若 `pnpm --filter omnimux-apps test` 失败，说明应用路由/执行链路被误伤；若无 `getConnection` 时仍返回 200，说明鉴权缺口仍在。
- 可用 `git diff` 搜索 `Access-Control-Allow-Origin: '*'` 与 `secFetchSite === 'cross-site'` 的旧写法，确认没有遗漏副本。
