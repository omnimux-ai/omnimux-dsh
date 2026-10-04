# #3043 KI-N1 最终 deadline 单项只读验收

## 结论与路由

**PASS_SCOPED / NoOne：仅关闭 KI-N1 中“stopOwnedHost 在 SIGKILL 后等待 exit 无最终期限”的具体缺口，并确认 native 不吞清理失败、finally 仍调用 rm。**

本次为用户明确授权的单项复核，不是第 3 轮全 QA，也不重新签完整异常回收或总 PASS。[第 2 轮 native 报告](<qa-native-round2.md#L73-L97>) 的最终 deadline 旧结论由本报告局部更新；历史报告不覆盖。其余 native scoped 业务 PASS、UI 命名 FAIL、声明 0.18 前置、极端子孙进程/浏览器 task 回收 Known Issues 继续保留。

## 范围与验收依据

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-host-e2e-issue-3043`；HEAD：`d95764912e36da01d879ab65d6340469b48a4625`。
- 本次用户验收原句：“helper stopOwnedHost现termWait+killWait各有界，不收exit返回hostStopped=false且移除监听；native cleanup加assert.equal(stopped.hostStopped,true)并rethrow，同时finally rm”。
- [环境规格:15、21](<../../../specs/host-e2e-environment-3043.spec.md#L14-L21>) 要求“动态端口与测试进程在 finally 清理”“测试失败仍保留诊断、关闭任务浏览器和私有服务；不残留测试进程”。本次只核用户明确限定的最终等待及失败传播，不把局部控制流证据等同于该规格完整达标。
- 只读当前 helper/native 源码及既有证据；内存模型不访问用户 profile/凭据，不执行 resolveHost、装配、builder 或原生测试模块。唯一仓库文件产出为本报告，不改源码、不创建测试文件、不构建、不安装、不启动/重启应用、不提交/推送/合并/物化/部署。

## 源码核定

[helper:315–331](<../../../plugins/omnimux/test-support/comment-native-environment.mjs#L315-L331>)：默认 `termWaitMs=8000`、`killWaitMs=3000`；两次 wait 各有 setTimeout。`finish` 同时 clearTimeout、removeListener('exit', onExit)，再 resolve；监听在合成 kill 前注册。SIGTERM 没有收到 exit 才进入 SIGKILL 等待；最终没有收到 exit 时返回 `hostStopped:false / escalated:true / cleanupError`，不把 kill() 的返回值当作退出凭据。只调用传入 owned host 的 kill，不搜索或扩大 PID 范围。

[native:198–208](<../../../plugins/omnimux/src/client/comment-native.e2e.test.js#L198-L208>)：等待停止结果后写尽力保留的日志/清理证据，随后严格 `assert.equal(stopped.hostStopped,true)`；catch 尝试写失败证据并 `throw error`；嵌套 finally 调用 `rm(temp,{recursive:true,force:true})`。因此 helper 的 false 不再让 native cleanup 假通过，断言或证据写入异常不会跳过 rm 调用。

这里的有界结论为两个定时等待之和（默认名义 11 秒），不是事件循环被阻塞时的硬实时保证；内存复核证明 rm **被调用**，不证明真实文件删除或真实子进程死亡。

## 本轮独立内存复核

在指定 worktree 显式 workdir 执行 `node --input-type=module` 的 stdin 脚本，Node `v25.8.0`；测试脚本未落盘。只导入纯 helper，传入 `EventEmitter` 假 host，`kill` 被替换为记录信号的内存方法。native 不导入执行：从当前源码抽取 198–208 行原 try/catch/finally，以 `vm.runInNewContext` 执行，`stopOwnedHost/writeFile/rm` 均为内存 stub，使用真实 node:assert。

### helper：4 个断言全部通过

1. 永不 emit exit：`termWaitMs=5 / killWaitMs=5`，最终返回精确的 false/escalated/cleanupError，合成信号顺序为 SIGTERM、SIGKILL。独立 500ms watchdog 保证旧无最终期限实现不能静默退出冒绿；本次在约 `12.616ms` 返回。
2. 永不 emit exit 的两阶段结束后 `listenerCount('exit')=0`。
3. 正常微任务 emit exit：返回 `hostStopped:true / exitCode:0 / signalCode:null`；只记录 SIGTERM，没有误升级 SIGKILL。
4. 正常微任务退出后 `listenerCount('exit')=0`。

### native cleanup：5 个断言全部通过

1. 注入 helper 的 false 结果，原 cleanup 拒绝为 `ERR_ASSERTION`，消息为“owned host must actually exit before cleanup passes”，证明失败向外重新抛出。
2. 同一失败分支最后写出的内存证据 `hostStopped=false`，且 finally 精确调用一次 `rm('/memory/temp',{recursive:true,force:true})`。
3. 所有 writeFile 均注入拒绝时，仍抛出上述断言失败，没有吞掉错误。
4. 同一写证据失败路径仍调用一次 rm stub。
5. 注入正常退出结果，cleanup 正常 resolve，证据 `hostStopped=true`，finally 精确调用一次同参数 rm stub。

原始输出摘要：

```text
HELPER_ASSERTIONS=4 PASS=4 FAIL=0
NATIVE_FALSE=assertion rethrown; failure evidence=false; finally rm invoked (memory stub)
NATIVE_FALSE_WRITE_FAILURE=assertion rethrown; finally rm invoked (memory stub)
NATIVE_TRUE=resolved; evidence=true; finally rm invoked (memory stub)
NATIVE_ASSERTIONS=5 PASS=5 FAIL=0
SOURCE_UNCHANGED=true; TOTAL_ASSERTIONS=9 PASS=9 FAIL=0; spawn=0 realKill=0 realWrite=0 realRm=0
REAL_EXIT=0
```

上述零写/零 rm 计数指内存复核脚本，不包括随后授权写入本报告。shell 直接保存 node 的退出码并输出 REAL_EXIT，未使用管道尾部退出码。用户提供的修改前红灯 `state=unsettled / exit1` 与修改后 4 断言绿是输入历史，本轮不冒称独立重跑旧实现；本轮独立验证当前源码结果。

## 当前源码指纹与完整性

内存复核前后重新读取同两文件 SHA-256，完全一致：

- [helper](<../../../plugins/omnimux/test-support/comment-native-environment.mjs>)：`sha256:adcc8577c552e1a8aaff58c5bf3b5db27b384abd7a89e09b11c815284a32a241`。
- [native](<../../../plugins/omnimux/src/client/comment-native.e2e.test.js>)：`sha256:6a77c7f20a3c5a2f8fb530d7f92fface3a6a4b06e75bbfdb5ffcd314c6bcf52a`。

只读未暂存 diff 与本次用户描述一致：helper 增加 killWaitMs 与两阶段监听释放；native 增加严格 hostStopped 断言及 rethrow。报告写入后再次核对两源码 hash 一致，指定两文件 `git diff --check` 通过（REAL_EXIT=0）。

## 保留结论与未覆盖

- **native scoped 业务 PASS 继续保留**：[第 2 轮证据与范围](<qa-native-round2.md#L20-L71>) 不被本次内存复核改写。本轮未重跑真实 native E2E，不能声称修改后的完整业务正式运行已重新通过。
- **UI 命名 FAIL / Frontend 继续保留**：原报告记录期望“点击进入图像生成”、实际“点击进入画布”；本次不修改产品字符串、不审核新界面、不重签 design.md 或 SaaS 文案合规，不替代 PM_SIGN_OFF。
- **默认声明 0.18 前置继续保留**：完整原生验收仍须显式指定已验证正式 bridge，记录版本/hash；不默认搜索用户 profile，不宣称干净机器开箱即过。
- **极端回收 Known Issues / 环境工程继续保留**：[原报告:81–85](<qa-native-round2.md#L81-L85>) 的 boundedCommand 超时先 reject、owned child close 与 builder 孙进程/ego taskSpace 完整回收未经证明，本次不测试或扩展。最终 host exit 未观察到时 false 是诚实失败，不保证残留进程已消失。
- **其他覆盖边界不变**：原生多评论/busy/上传异常/切会话等既有覆盖不足仍按原报告保留；不重复 generation、全仓回归、CI、OCR 或产品验收。

**最终路由：KI-N1 最终 deadline 与 native 失败传播单项 Pass / NoOne；完整极端回收仍 Known Issues / 环境工程；UI 命名仍 FAIL / Frontend。没有扩大验收承诺，也没有开启修复循环。**
