# 原生文件选择器收敛为 hub seam（Issue #3443）

## 目标与成功标准
macOS 原生文件/文件夹选择器的 JXA 实现只有一份真源，放在 hub 的 `nativeFilePicker` 中立 seam 里；`omnimux-assets`、`omnimux-products`、`omnimux-workflow` 删除各自的 `picker.js` / `picker.ts`，统一在请求时经 `ctx.get('nativeFilePicker')` 调用。三个入口的 prompt 文案、多选、取消 `{path:null,paths:[]}`、`picker-invalid-kind` / `picker-unsupported` / `picker-failed` 契约与 HTTP 状态码保持不变；seam 缺失时返回明确的 `picker-unavailable`（503），不静默降级。

## 新用户基线
依赖 macOS 自带 `/usr/bin/osascript` + AppKit（hub 源码随插件安装，无需额外二进制或 npm 依赖）；非 darwin 仍 `picker-unsupported`；hub 未挂载（理论异常）时明确 `picker-unavailable`，不伪造成功。

## 计划与项目结构
- hub：新增 `plugins/omnimux/src/host/native-picker.js`（JXA + `NSOpenPanel`，可注入 `run`/`platform`，`pick(kind, { prompt })`），单测 `native-picker.test.js`；`host/apply.js` 里 `ctx.provide('nativeFilePicker', createNativeFilePicker())`；`docs/contracts/hub.md` seam 表登记。
- 域插件：assets/products/workflow 的 dispatcher 默认 picker 改为「经注入的 `getService` 读 seam」；删除本地 picker 与 picker 单测；路由单测继续注入 fake picker，补「seam 默认路径 / seam 缺失 503」用例；prompt 常量留在各域路由（保持原文案）。
- 错误以 `{ code, message }` 形式跨 seam 抛出（普通 `Error` 带 `code`），域路由用 code 前缀识别 picker 错误并映射既有状态码。

## 命令
`pnpm --filter omnimux test`；`pnpm --filter omnimux-assets test`；`pnpm --filter omnimux-products test`；`pnpm --filter omnimux-workflow test`；`pnpm check:boundaries`；`node scripts/impact-matrix.mjs --git-diff --base origin/main`；`git diff --check`。

## 代码风格
hub 用 ESM + JSDoc、可注入 runner、错误带 `code`；域插件只经 `getService`/`ctx.get` 访问 seam，不 import hub 内部（`check:boundaries` 约束）；不新增运行时 npm 依赖。

## 测试策略
hub 单测覆盖：JXA 脚本含 `NSOpenPanel`/accessory、无 `System Events`、`runModal` 判定、file/directory 标志、多选、prompt 注入、路径解析、取消（空 stdout 与 -128 兼容）、非 darwin、失败。域路由单测覆盖：注入 picker 的既有行为、`getService` 返回 seam 时真实转发 prompt/paths、seam 缺失 503、coded error 状态映射。真实运行：hub 单测用注入 runner 零 osascript；Dev 物化后由人工/Agent 在各入口复核原生面板。

## 浏览器与 Electron 边界
不改 Client/Stage DOM；选择器仍由 Host 侧 `osascript` 进程显示原生面板。隔离 worktree Web 验收不覆盖原生对话框，以 hub 单测 + 路由单测 + Dev 真机人工复核为准，不伪造截图。

## 边界与文档影响
始终：保持三处入口文案与 HTTP 契约、保留各插件自有业务逻辑。先问：改 Electron 壳层/preload、新增平台选择器、给 domain 插件增加运行时 npm 依赖。绝不：让域插件 import hub 内部、复制 JXA 脚本、改 CI/门禁。文档影响：hub seam 表、三个插件的 picker 契约/README 描述、任务 spec。
