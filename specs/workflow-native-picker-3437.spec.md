# 文件选择器去除 Apple Events 依赖（Issue #3437）

## 目标与成功标准
ad-hoc 签名的 OmniMux Dev/Prod 中，画布导入素材、资源选择器「本地」页导入、素材抽屉导入、项目库导入、新建项目选目录都重新能弹出 macOS 原生文件选择器并拿回绝对路径；取消不报错、不弹「打开系统文件选择器失败。」；不再依赖 `kTCCServiceAppleEvents`（Automation）授权，也不再给新用户弹「控制 System Events」授权窗。诊断证据：OmniMux Dev/Prod 均为 adhoc 签名，系统日志在用户点击时刻拒绝为 adhoc 应用计算 Apple Events designated requirement，`osascript` 立即退出，`POST /omnimux-workflow/api/pick` 返回 500 `picker-failed`。

## 新用户基线
依赖 macOS 自带的 `/usr/bin/osascript` 与 AppKit（不用额外二进制、不用 Node 依赖、不用开发机状态）。非 darwin 仍返回 `picker-unsupported`，前端继续提示改用路径输入；缺少 GUI 会话时 `picker-failed` 报可理解错误，不静默退化。

## 计划与项目结构
只改 `plugins/omnimux-workflow/src/workflow/picker.ts` 内部实现：把 `tell application "System Events"` 的 AppleScript 换成 JavaScript for Automation，在 `osascript` 进程内以 `NSApplicationActivationPolicyAccessory` 驱动 `NSOpenPanel`，保持多选、`file`/`directory` 两种 kind、取消与错误契约不变；同步更新紧邻的 `routes/localFileRoutes.test.mjs` 脚本断言。前端与路由层不改。

## 命令
`node --test plugins/omnimux-workflow/src/workflow/routes/localFileRoutes.test.mjs`；`pnpm --filter omnimux-workflow test`；`node scripts/impact-matrix.mjs --git-diff --base origin/main`；`git diff --check`。

## 代码风格
沿用具名导出、`PickerError` 错误码、`PickNativePathDeps` 可注入 runner、显式返回 `{ path, paths }`；脚本用 `JSON.stringify` 嵌入固定文案，不拼接外部输入。

## 测试策略
单测注入 runner：断言 argv 使用 `osascript -l JavaScript -e`、脚本含 `NSOpenPanel` 且不含 `System Events`；保留多选解析、取消（-128/空输出）、失败、非 darwin、invalid-kind 用例。真实运行证据：用实现同款脚本触发一次原生面板并截图（不提交图片，证据留本地 run 目录），确认面板出现且无 Dock 临时图标；Dev 物化后由人工在 45120 复核真实导入入口。

## 浏览器与 Electron 边界
本次是 Host 侧原生对话框实现，不改 Client/Stage DOM。隔离 worktree Web 验收不覆盖 macOS 原生面板，故以「真实 osascript 面板截图 + 路由单测」作为本变更的运行证据，并在 Dev 物化后提示人工复核；不伪造浏览器截图证明原生面板。

## 边界与文档影响
始终：保持既有路由/前端契约与错误码；保留多选与目录选择。先问：改 Electron 壳层/preload、改 assets/products 各自的 picker、新增 Windows/Linux 原生选择器。绝不：提交密钥、改官方 DSH、改 CI/门禁、把 ad-hoc 签名或自动化授权当默认前提。文档影响：仅新增本任务规格；`docs/contracts` 与产品文档无需变更（行为契约未变）。授权：用户当前故障修复及仓库规定的正常开发交付。
