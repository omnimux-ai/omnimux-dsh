# picker 失败诊断接入受控日志（Issue #3479）

## 目标与成功标准
`nativeFilePicker` 在 `picker-failed` 时输出一条受控诊断日志：错误 code、stdout 长度、截断片段（≤200 字符），每次失败最多一条；成功与取消不输出。日志只在本机宿主，不进入 HTTP body 或客户端 toast。成功标准：单测注入 logger 锁定日志内容/截断/次数，既有取消、成功、错误码与 HTTP 契约不变。

## 新用户基线
仅 macOS picker 失败路径；无新增依赖或外部日志服务。`log` 可注入，默认受控 `console.warn`；非失败路径静默，避免新用户日志噪音。

## 计划与项目结构
- `plugins/omnimux/src/host/native-picker.js`：`PickNativePathDeps` 增加 `log`；`pickNativePath` 构造 `picker-failed` 后调用一次 `log('[nativeFilePicker] ...')`（code + stdout 长度 + 截断片段）；`createNativeFilePicker` 透传 `log`。
- `plugins/omnimux/src/host/native-picker.test.js`：注入 `log` 捕获，覆盖失败调用一次、含 code/长度/片段、超长片段截断；成功/取消不调用。
- `docs/contracts/hub.md`：seam 表补充「失败诊断仅写宿主日志、截断 200 字符、不进 HTTP body」。
- 不改域插件：HTTP body 仍只有 `{ error, message }`。

## 命令
`node --test plugins/omnimux/src/host/native-picker.test.js`；`pnpm --filter omnimux test`；`pnpm check:boundaries`；`git diff --check`。

## 代码风格
沿用 hub ESM + JSDoc、可注入依赖；日志固定前缀便于检索；不序列化整个 error 对象。

## 测试策略
单测：失败路径断言 logger 恰好一次且内容含 code/stdout 长度/片段；片段 >200 被截断；成功与取消 0 次；stdout 为空时长度 0 且不因空串误判。域插件路由测试保持注入 picker，不依赖日志实现。

## 假设
picker 失败时 `PickerError` 已携带可诊断的 stdout（或 runner 非零退出附带的 stdout），且失败路径与成功/取消可由 code 明确区分；因此可以在不改变 HTTP body 与客户端文案的前提下，把诊断只写入宿主日志。日志写入失败也不应影响 picker 错误本身的抛出。

## 证伪方式
若 `picker-failed` 路径始终拿不到 stdout（日志恒为 `stdout=0chars` 且真实失败无法定位），或成功/取消路径也触发日志（日志次数 >0），则诊断覆盖假设被证伪；若注入抛错 logger 后不再抛出 `picker-failed`，则日志隔离假设被证伪。可执行：`node --test plugins/omnimux/src/host/native-picker.test.js`；删掉截断、成功/取消静默或 logger 抛错保护后，对应用例必须失败。

## 浏览器与 Electron 边界
不改 Client/Stage；Dev 物化后由 Agent/人工复核 picker 面板与一次失败日志（临时注入非法输出），不伪造截图。

## 边界与文档影响
始终：保持成功/取消/错误码与 HTTP 契约。先问：新增日志基础设施、把 stdout 放进 HTTP/客户端。绝不：记录整段 stdout、在成功/取消路径打日志、改 CI。日志片段中用户主目录折叠为 `~`、最多 200 字符。文档影响：hub 契约 seam 表一句；任务 spec。
