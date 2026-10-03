# #3043 超时命令实际进程反例

核验对象：test-support/comment-native-environment.mjs 的 boundedCommand，使用本任务直接 spawn 的 Node 子进程，无用户应用操作。

## 红

子进程安装 SIGTERM 空处理并用 interval 保持存活。deadlineMs=150、killGraceMs=100。旧实现 153ms 即 reject，未等关闭或升级宽限期；assert elapsed>=240 失败，原始 exit=1。

## 绿

修订后 timeout 标记 timedOut，SIGTERM 后等待 close；宽限期过后只 SIGKILL 本次 owned child，再有最终等待期限。close 清全部 timer；超时 exit0 也必须 reject；终止等待失败错误脱敏。

实际执行三场景退出 0：
- 忽略 SIGTERM 的 owned Node：await rejects，返回耗时>=240ms，表示未提前返回。
- 正常 Node stdout=ok：实际成功 resolve。
- 收到 SIGTERM 自行 exit0 的 Node：由于已超时仍 rejects，不冒称通过。

这些是实际 owned child 验证，不将其推演成孙进程/浏览器任务空间任意异常的完整回收证明；该覆盖边界继续保留。原 stopOwnedHost 的最终期限单项 QA 见 qa-cleanup-deadline.md。
