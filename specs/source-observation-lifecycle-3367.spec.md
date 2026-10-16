# #3367 来源观察自然退出失败的真实回收

## 目标与边界
修复已合入99c5c84的生命周期缺口：等待exit reject会跳过TERM、exit误当close、WS失败仍detached=true。仅既有scripts/runtime-source-observation.mjs、原test.mjs和本spec。公共observeLoadedSource仍只验证受控ESM解析来源，不安装/启动产品/注入loader、不证明OS隔离或产品激活。原拒payload停止，不能删除文件改变作者检查基线、换工具/helper或缩拆重送。

## 新公开失败契约
entry静态导入expected、打印marker后interval保活，不理stdin EOF。原语必须失败且返回/拒绝前完成有界回收；失败附cleanup收据，包含ownerRoot、childPid、自然退出/TERM/KILL阶段、实际exit与close（code/signal）、WS是否确认关闭、原失败。不能自填closed=true，须来自spawn事件；计时宽限分别报告，不谎称总≤观察timeout。只回收本次spawn child，不扫进程、不杀未知PID。所有监听spawn后立即绑定；等待拒绝必须进入回收兜底，强制回收也不能报observed。

## 正式验证与红绿
原文件固定literal新case，现成makeFixture写受控entry，publicobserveLoadedSource；仅assert.rejects不足，检查error.cleanup.childClosed/exit与childPid并可用process.kill(pid,0)公开存活查询核ESRCH。旧实现失败时测试自身从受控entry输出记录的PID（如必须）确认仅其owner child后在finally停止并等待，不因红例泄漏破坏环境；该逻辑先独立读审才运行。禁止child_process新测试导入、动态title/Spread/私有deps/挂钩，仅生产公开失败字段。先写与语法检查，不先跑会泄漏旧版，父确认回收安全后运行真实RED，再最小生产修GREEN。第一case只EOF保活正常TERM；后续独立case才锁定忽略TERM→KILL，原六例完整保留。

## 首片测试候选安全门（执行前父静态接受）
仅新增固定名称 `rejects an EOF-resistant entry only after confirmed child cleanup`。entry 使用标准 fs 写本 fixture 的 JSON PID 文件，内容为 canonical ownerRoot、entryPath、childPid、parentPid；随后 marker 与普通 interval，不处理 EOF。失败公开字段约定为 error.cleanup.ownerRoot/childPid/childClosed/exit/close/websocketClosed；首片应保留 SOURCE_OBSERVATION_CHILD_EXIT_TIMEOUT，exit 与 close 均来自实际 SIGTERM（code=null）。生产回收完成后必须可探测 ESRCH。

测试使用 3 秒观察预算与独立 10 秒外层等待上限，清除外层 timer；即使断言失败也进入 finally。finally 从受控文件核对 canonical owner、entry、parentPid 与正整数 PID（非父 PID），每次发信号前重读记录确认未变，仅此 PID 可 TERM，最多等 1.5 秒，必要 KILL 再最多等 1.5 秒；每次以 kill(pid,0) 仅接受 ESRCH 为消失。测试诊断输出原错误、公开 cleanup 与 fallback 的信号/探测收据；fallback 不是生产 exit/close 证据。仅确认消失才删除临时 fixture，身份不符保留证据并失败，不扫机找 PID。普通 entry 在 inspector 释放前无法写 PID 是边界，身份缺失时不能盲杀；父静态审查须确认该受控输入与旧路径可达性足以批准本 RED。候选落盘只做 node --check 和 git diff --check，未批准不得执行任何包含该 case 的 suite。

## 源实现和范围
有限改动：spawn后建立exit/close promise与error状态，成功仅exit0+close且自然退出完成；有界等待超时以状态值而非throw跳过清理，TERM宽限→KILL宽限→失败收据。WS关闭实际事件才detached true，不吞失败刷绿；观察error与cleanuperror都保留。stop后如实error无需删owner。此处不顺手全库重构。

## Phase2 计时与收据
观察 deadline 为 min(timeoutMs, 20000ms)，只限制 endpoint、连接、协议响应和源码观察；不包含后续回收宽限，不能称总耗时≤timeoutMs。收尾依次给予 WS close 事件最多 2000ms、stdin EOF 后自然 child close 最多 1000ms、必要 TERM 后 close 最多 1000ms、必要 KILL 后 close 最多 1000ms；阶段提前完成即停止等待。等待 timeout 兑现 false 并清 timer，只有真实 child close 事件能写 childClosed=true。自然退出不完成时保留 CHILD_EXIT_TIMEOUT（已有更早错误则保留原错误），即使强制回收成功也失败。cleanup.phases 记录各阶段宽限与 completed，signals 记录仅本 child 的实际发送尝试，originalFailure 保留首个失败；WS detached 只随实际 close 事件为 true，disable/close 失败不再吞掉。事件循环调度与同步文件工作不作为严格墙钟 SLA。

## 检查与交付
定向原test、node--check、diffcheck；父独立审查后必要gates保宿主缺失失败；fixedbase/head独审、requiredCI/nativeMQ实际MERGED、retainowner/evidence、standardship。无外部安装/配置/secret/官方/跨repo/Prod、全局环境或新常驻服务。

## 基线与未知
Node标准spawn/inspector，缺能力大声失败；不能借当前开发机路径作产品默认。原SOURCE_MISMATCH反例缺口和动态import窗口仍记录，不据本修宣称闭环全C/E。