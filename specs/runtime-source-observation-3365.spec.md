# #3365 标准进程来源观察原语与受控验证

## 目标与成功标准
为「证明任务安装的代码就是候选源码」提供可维护的公共原语：对任务自有、只读的可控子进程做标准 Node inspector 外部观察，核对实际加载模块 URL 与全部字节/摘要是否精确绑定指定文件。先以纯受控 ESM 样本验证能力；本票不安装产品、不启动应用、不注入 loader、不改产品源码。

## 写集与结构
仅新增 `scripts/runtime-source-observation.mjs`、`scripts/runtime-source-observation.test.mjs` 与本规格。复用仓库既有风格（ESM、两空格、无分号）与 owner 目录生命周期思路；不建第二 runner、不改 hooks/超时/官方代码、不重送此前被前置检查终止的一次性载荷。

## 公开接口
`observeLoadedSource({ rootDir, entryName, expectedName, decoyName?, timeoutMs? })`（参数可微调但须保持简单）：只允许在传入的 owner 根下工作，要求 entry/expected/decoy 为普通相对名或安全相对路径，拒绝绝对路径、空路径、`..`、符号链接与缺文件。返回值至少含 `status`（`observed` 或明确失败分类）、`scriptId`、`url`、`path`（realpath）、`isModule`、`bytes`、`sha256`、`matching`、`decoyAbsent`、`exit`、`observations`、`rawReceipts`；成功也只表示「VM 已解析该源码并精确等于受控文件」，须显式标注 `activation: 'not-proven'` 与 `productLoaded: 'not-tested'`，不得把解析当激活、把字符串当任意原始 bytes。

## 执行约束（实现必须遵守）
- 只 spawn `process.execPath`（或等价的固定绝对 Node）于受控 ESM entry；child env 为最小白名单（PATH 仅可执行目录与系统路径、HOME/owner、LC_ALL），不继承 NODE_OPTIONS/NODE_PATH/代理/凭据。
- 仅用标准 Node inspector：`--inspect=127.0.0.1:0`（或该 Node 版本支持的等效 wait/publish 组合），从**同一 child 的 stderr**解析 loopback 随机 WS endpoint；校验 host 为 127.0.0.1 且端口非零，不扫描端口、不接既有进程、不连其他目标。
- 先注册事件/读事件游标，再 `Debugger.enable`，然后 `Runtime.runIfWaitingForDebugger`；持续收集 `Debugger.scriptParsed`，按目标 scriptId 请求 `Debugger.getScriptSource`；只允许 enable/getScriptSource/disable 与放行命令，不 evaluate、不改源码、不注入。
- 文件绑定必须精确：`file://` URL 解码后 realpath 精确等于 expected 文件，`isModule===true`、`hasSourceURL===false`；取回源码经 UTF-8 编码后与文件全部 bytes 相等且 SHA-256 相等，禁止规范化/模糊匹配。未导入的 decoy 不得出现；同名多个解析即失败。
- 生命周期：整体有界 `timeoutMs`（默认 ≤20s）与事件上限（≤256）；结束条件=child 正常 exit 0 且完成标记出现；finally 断开 inspector、关闭 WS、确认 child exit/close；owner 目录按 dev/ino 精确创建与清理或保留，不报假成功。stderr/stdout/事件/退出码保留为 raw receipts。
- 失败分类独立且可定位（如 `SOURCE_OBSERVATION_*`），不把子进程错误吞成空通过；任何一步失败保留原始收据并附 owner 身份。

## 正式测试（node:test，全部字面量标题）
- 用既有临时目录模式创建受控 `entry.mjs`（导入 expected）、`expected.mjs`、`decoy/expected.mjs`，调用公开原语；断言 `status=observed`、URL/isModule/bytes/sha256/decoyAbsent/exit 成立，且 `activation` 与 `productLoaded` 标注为非证明。
- 反例必须各自真实失败：expected 内容被改动（bytes 不匹配）、decoy 意外被导入（出现多余脚本或重复）、entry 非零退出/超时（未出现完成标记）。测试不得引入 `child_process`/`vm`/`eval`/新 Spread/动态成员访问等新执行风险，不得把被拒 payload 挪位/改字面量/拆送或搬入 helper；正常工具拒绝或超时即停止整个受影响请求并保存完整 payload 与返回。
- 命令：先 `node --test scripts/runtime-source-observation.test.mjs`，再 `node --check`、 `git diff --check` 与相关守门测试；适用时父跑完整 gates。

## 边界与非目标
- 不证明产品/安装/激活/候选候选绑定；不放宽 Dev45120；不改 hooks、不提高 timeout、不新增 hooks.json 条目、不新豁免。
- 不执行产品/安装/网络/凭据/真实模型/官方/全局/跨仓写；不创建服务或常驻子进程；不读取 Dev/profile/秘密。
- 本票完成后，「已安装/已加载/新鲜环境/合成旅程」仍未证；若作者门禁拦截新能力或正式测试 payload，保持停止不绕行，父后续按合法新契约另行处理。
- 新用户基线：标准 Node 22.19+/24 自带 inspector 与 ESM，无新依赖；宿主缺官方 Node 时原语应明确 fail 而非退化为伪造通过。
