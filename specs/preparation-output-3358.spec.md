# #3358 固定 pnpm 准备输出保留

## 目标与成功标准
为 #3357 的既有固定 pnpm 监督入口补全有界失败诊断。通过公开 `runPnpm` 观察 stdout 与 stderr，二者不能合并；成功 stdout 字节解码形状不变，原 `code` / `signal` 失败判据不变。非零退出、超时、中断、输出超限、退出后目录漂移均保留预算内已读取输出；日志不授予安装/执行/证据授权，不自动打印真实环境或凭据。返回的原输出可能含调用者注入的凭据；预算有界不等于脱敏。生产调用者只应提交本范围受信参数与环境，并自行约束输出消费；本票不新增通用脱敏器或自动日志。

## 项目结构与文档影响
改动限定 `scripts/managed-tarball.mjs`、原 `scripts/managed-tarball-preparation.test.mjs`、原 `scripts/managed-tarball-recovery.test.mjs` 的既有输出预算断言及本规格。父已全文读取独立旧标准语义审查，接受失败保留有界诊断前缀且消费者仍先核失败状态的契约变更；不得只删除旧空值期待，须同时核原code5、准确output-limit、固定pnpm11.7.0的已知十字节前缀及分流总预算。本轮实施报告归主树 `tmp/agent-infra-2026-10-14/preparation-output-3358-implementation-r2.md`，首轮未实现报告保留不重写。不改 #3357 树、bootstrap、缓存实现、辅助测试文件、CI 或其它合同；本规格拥有本票输出契约。

## 输出与资源契约
- 返回原 `code`、`signal`、`stdout` 并始终加字符串 `stderr`，含启动前已中断与无法解析监督回执的 `worker-failed` 分支。无有效回执时两流都为空，不能把损坏 JSON 当日志或制造成功。
- `maxOutput` 为两流共享的原始字节总保留预算，而非每流各一份。按 selector 读取顺序保留每流前缀；越界块仅保留剩余预算的前缀并标记原 `output-limit`，继续有界排空但不再追加。stdout/stderr 各自存字节块，结束后分别一次 `decode('utf-8','replace')`；不按块解码以免拆断多字节，截断或非法序列返回替换字符。
- 原始字节合计不超过 maxOutput；替换后的文本 UTF-8 重编码可能多于原字节数，不能把它冒充原始预算。Python 默认 ASCII JSON 转义最坏每原字节六个字符，两流共享预算仍小于既有父上限 `7 * maxOutput + 4096`，不扩大父传输上限。
- 正常结束须两流均 EOF 且 pnpm 已退出，不能因 stdout 先 EOF 而丢 stderr 尾部；有 reason 时保留既有 TERM、半秒排空窗口、最后本进程组 KILL 与父 close 后才 resolve。进程、lease、held-directory、stdin 生命周期及默认120秒均不改。

## 既有调用与兼容性清单
- `ManagedSync.pnpm` 返回完整结果；其版本检查读取 `code` / `signal` / `stdout.trim()`，capture 在失败判据后解析 `stdout` JSON。
- `materialize-cache.mjs` 的运行消费在 `code !== 0 || signal` 时拒绝，仅成功返回 stdout；新增 stderr 不能污染 JSON 或覆盖失败。
- 原 preparation 测试173行展开18例：2 no-op、3 mutation、1 recheck、1 ordinary copy、1 cwd、10 held descriptor；其原断言/声明均不改。
- 原 recovery 的 maxOutput10 空 stdout 期待与前缀保留存在实质旧契约冲突。独立语义审查确认现有消费者先检查 code/signal，父仅维护这一处预算断言：同时要求 code5、output-limit、固定十字节前缀、空 stderr、两流合计10字节；原 timeout/abort 后半及其它断言保持。历史65过1失败记录保留，不将它倒签为通过。其它公开调用测试没有整返回对象 literal deepEqual；pre-abort 新增字段是明确加法，不删旧字段。

## 新用户基线与边界
使用原安装前提：现有宿主 PATH 中固定 pnpm 11.7.0、Python3、公开调用者提供的私有 cwd/env；不改 PATH 来源、工具解析、参数界面或宿主设置。缺工具仍沿原错误，不新增替身/依赖安装/通用命令入口。此票只证明有限输出保留，不证明 OS 写隔离、#3301B、fresh App、源码安装加载或 #3357 实际构建打包。

## 代码风格
保持本文件既有 JavaScript 与内嵌 Python 风格；两流容器只服务现有监督循环，不引入执行抽象、导出或辅助 runner。新增测试只用既有 fixture 与公开入口，以明确合成文字做独立字面量断言；不复制 env spread、不增加 import、不 eval 私有 worker 源。

## 测试策略与命令
先在原正式测试末尾追加一例：既有 `fixture('isolated', 'stderr-failure')` 后执行固定 pnpm exec 当前 Node，只写已知 stdout/stderr 并 exit7；断言 code7、signal null、分流文字，先得到 stderr undefined 的真实 RED 再改源码。按一例→最小实现→下一例推进终止/共享预算/UTF8 覆盖，不一次堆未证矩阵。正常测试写若硬拒，停受影响请求并在报告保完整载荷，不绕路。

最小命令：
- `node --test --test-name-pattern='real pnpm preserves separate stderr on nonzero exit' scripts/managed-tarball-preparation.test.mjs`（先红后绿）。
- `node --test scripts/managed-tarball-preparation.test.mjs`（旧18例及新增用例）。
- `node --test scripts/managed-tarball.test.mjs scripts/managed-tarball-recovery.test.mjs`（归档/原监督生命周期，含经独立审查确认的唯一预算断言维护）。
- `node --test --test-name-pattern='same bytes in different peer contexts retain distinct occurrences and edges' scripts/materialize-cache.test.mjs`（本轮用户限定 actual pure subset；原 native/preflight 虽无注册表包仍经 fixture install 与空私有 Corepack，故不运行，不换工具或安装）。
- `node --check scripts/managed-tarball.mjs`、`git diff --check`；父另负责全门禁、独立审查、CI/PR/合入，不在本委派执行。

总是：保原断言、真实红绿、结果/skip数/摘要/mode；先交父审：旧空stdout契约冲突、超本写集或接口变更；绝不：未经独立审查改变旧期待、绕硬拒、真实profile/账号/系统写、外部包安装、提交/远程/发布/官方DSH写。唯一允许的旧标准变化仅第7、19行规定的输出预算断言。

## 本轮验证状态
父已在原源码证明同一 exit7 用例 stderr undefined 真 RED；最小实现后同例 GREEN。逐例追加共享7字节/截断替换、超时、中断、大量多字节 stderr 与成功 JSON 分流覆盖，均是已实现行为的后补验证，不虚报额外 RED。原173行完整保留；完整准备现23例。完整 managed/recovery 以规范 `TMPDIR=/private/tmp` 原样运行，66例65过1失败0skip，唯一失败为原 recovery134 的空 stdout 契约（实际 `Version 11`）。此为独立审查前的历史状态。经父采纳旧标准语义审查并精准维护唯一预算断言后，完整三正式文件实际89/89、0失败、0跳过，含原43 managed unit、23 recovery与23 preparation；独立固定候选审查再次复验89/89。完整门禁、真实持续检查与合并队列仍按当前候选核验，不由局部绿色宣称安装隔离或#3357完成。
