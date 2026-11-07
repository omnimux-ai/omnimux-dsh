# 安全加固收尾：exact-Host 覆盖与路由级回归

## 目标

补齐 #3955 的剩余非阻断安全缺口，使所有本地写入口在保留同源/扩展访问能力的同时，能够按 `scheme://host:port` 拒绝其他 localhost 端口和外部来源；并让官方云灵感的本地读取与 apps 直接工厂在缺少连接凭据时 fail-closed。

## 用户操作旅程

- 正常用户在 OmniMux 桌面 Web UI 中保存、执行或读取数据：操作保持不变。
- 浏览器扩展保存灵感：扩展 origin 精确匹配并被允许；普通网页仍被拒绝。
- 用户在另一个 localhost 端口页面尝试写入或读取：返回 403/503，而不是被 hostname 白名单放行。
- 宿主没有 connection 服务时：相关入口返回 503，不静默放行。

## 命令

- `pnpm --filter omnimux test`
- `pnpm --filter omnimux-apps test`
- `pnpm --filter omnimux-inspiration test`
- `pnpm --filter omnimux-assets test`
- `pnpm --filter omnimux-publish test`
- `pnpm --filter omnimux-products test`
- `pnpm --filter omnimux-workflow test`
- `pnpm check:boundaries`
- `git diff --check`

## 项目结构

- `plugins/omnimux/src/http/local-origin.js`：hub 本地写校验与 `readOriginHeaders`。
- `plugins/omnimux/src/{agents,byok,apps,official}/**`：hub 的本地写/云灵感入口。
- `plugins/omnimux-apps/src/host/routes.ts`：应用 HTTP 工厂与注册器。
- `plugins/omnimux-workflow/src/http/helpers.ts`、`routes/dispatch.ts`、`routes/canvasRoutes.ts`：workflow 本地写与 dispatch 字段。
- `plugins/omnimux-assets/src/http-routes.js`、`plugins/omnimux-products/src/http-routes.js`、`plugins/omnimux-publish/src/http-helpers.js`：同款 helper 与 dispatch。
- 各插件同目录 `*.test.*` / `*.e2e.test.mjs`。

## 代码风格

沿用现有 JSDoc 与 CommonJS/ESM 风格；来源校验集中在 helper，错误结构统一 `{ error, message }`；不新增依赖、不用异常吞掉错误。

## 测试策略

- helper 级：`assertLocalWrite` 在 `host` 存在时拒绝端口不匹配，`same-site` 与 `cross-site` 均拒绝，同源/无 Origin native 调用保留。
- 路由级：新增 `omnimux-inspiration` 安全路由测试，经 `apply`/registered handler 验证 browser origin 的 OPTIONS 无 CORS、扩展 origin 精确 CORS、foreign/same-site GET/POST 403。
- 官方云灵感：路由级 GET 带 foreign origin 返回 403，同源/无 Origin 本地读取保持可用。
- apps：直接 `createAppsRoutes` 缺少 `getConnection` 时返回 503；`registerAppsApiRoutes` 同样 fail closed。
- 所有相关包测试通过；不把既有 `agents/local.test.js` 环境失败或 `AppWorkspaceView.tsx` 既有类型错误算作本次回归。

## 边界

- **总是做**：提交前跑相关测试；保留已有正常同源/扩展路径；错误码保持稳定。
- **先问**：改扩展 ID/pairing token 策略、改公开 bridge-config CORS、新增依赖或改 CI。
- **绝不做**：把已安装扩展视为任意可信白名单之外的放宽、删除既有安全断言、写生产 `~/.omnimux`。

## 新用户基线

- 新用户只安装/登录 OmniMux 后即可使用本地 UI；所有入口依赖宿主 `connection` 服务，缺失时返回 503，不依赖开发机 profile、端口或本地绝对路径。

## 假设

假设 1：生产宿主始终通过 `ctx.get('connection')` 提供 connection 服务；开发/单测必须显式注入允许连接的 seam，不允许缺省放行。
假设 2：桌面 UI 与官方扩展是仅有的可信本地写调用方；普通外部网页和其他 localhost 端口不是可信来源，必须拒绝。
假设 3：官方云灵感 GET 可以按本地请求来源判定；同源 UI 与无 Origin 的本地 native 调用需要保留。

## 证伪方式

- 若 `pnpm --filter omnimux test` 失败，说明 exact-Host 字段接入破坏了现有路由；若新增测试中 foreign origin 仍返回 200，说明来源校验未生效。
- 若 `pnpm --filter omnimux-apps test` 失败，说明直接工厂 fail-closed 误伤正常 UI；若缺少 `getConnection` 仍返回 200，说明修复未生效。
- 若 `pnpm --filter omnimux-inspiration test` 失败，说明扩展/同源路径被误伤；若浏览器 origin 的 OPTIONS 仍带 `Access-Control-Allow-Origin: *`，说明 CORS 阻断未闭合。
- 若 `pnpm --filter omnimux-assets test` / `publish` / `products` / `workflow` 失败，说明 helper 副本的 exact-Host 校验破坏现有调用。
