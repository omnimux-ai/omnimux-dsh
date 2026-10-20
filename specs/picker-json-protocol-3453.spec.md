# nativeFilePicker 改用 JSON 路径协议（Issue #3453）

## 目标与成功标准
`nativeFilePicker` seam 从 `osascript` 收到的结果改为单行 JSON 字符串数组协议，支持含换行、行尾空格、制表符的合法 macOS 路径原样返回；空输出仍表示取消 `{path:null,paths:[]}`；非法输出明确抛错并映射 `picker-failed`，不误判为取消。成功标准：hub 单测覆盖上述边界并通过，三域插件与 HTTP 契约不变。

## 新用户基线
仅 macOS 原生选择器内部协议；依赖系统自带 `osascript` 与 AppKit。非 darwin 仍 `picker-unsupported`；JSON 解析失败按 `picker-failed` 明确报错，不静默返回空选择。

## 计划与项目结构
只改 hub 的 `plugins/omnimux/src/host/native-picker.js` 与其单测：
- JXA 脚本 `return JSON.stringify(picked)`（换行等字符被正确转义，输出单行）；
- `parsePickedPaths` 严格解析：空/空白 → `[]`；JSON 字符串数组 → 原样返回（不 trim/不切行）；其他 → 抛错；
- 取消/超时/失败的既有 error code 与 `{path,paths}` 返回契约不变。

## 命令
`pnpm --filter omnimux test`；`node --test plugins/omnimux/src/host/native-picker.test.js`；`pnpm check:boundaries`；`pnpm verify:product-baseline`；`git diff --check`。

## 代码风格
沿用 hub ESM + JSDoc、可注入 `platform`/`run`/`prompt` 的测试边界；解析函数保持纯函数，不新增依赖。

## 测试策略
单测覆盖：脚本含 `JSON.stringify(picked)` 且不再 `join("\n")`；`parsePickedPaths` 对 `JSON.stringify(['/tmp/a b','/tmp/c\nd\t'])` round-trip 精确；空/换行输出取消；非法 JSON、非数组、含非字符串元素抛错；`pickNativePath` 将其映射为 `picker-failed`；真实 `osascript -l JavaScript` 做一次无面板 JSON round-trip 探针（进程证据，不弹窗）。

## 浏览器与 Electron 边界
不改 Client/Stage DOM；原生面板交互不变。Dev 物化后三入口仍弹面板由人工/Agent 复核；不伪造截图。

## 边界与文档影响
始终：保持 seam 的 `{path,paths}`、错误 code、prompt 传递给三个域插件的方式不变。先问：改其它插件、改 HTTP 状态码、引入 NUL/二进制协议。绝不：静默吞掉解析错误、把非法输出当取消、改 CI。文档影响：hub seam 表补一句「输出为 JSON 路径数组，支持换行/尾空格文件名」；任务 spec。
