# #837 交付排阻复核

## 结论

2026-09-09 11:07 +08:00：**L2 恢复仍 BLOCKED；正式兼容 seed 未更新，不重试旧依赖。** 工程不代替独立 QA 验收。固定 base `867b192ecf6aa35be4e1639db7351a89bea782c7`，复核起点 HEAD `11f8655858feb57373fa7649dc9b7cce07deca24`；本地提交后的准确 SHA 由交接回复提供。

本轮只读检查外部依赖；仅本任务 QA 测试及报告进入本地提交。未 fetch/push/merge、Dev 物化、官方/kit/viewer 修改、禁用 viewer、手拷包或启动第二次 L2。

## 本轮核实证据

- 已读 `QA-REPORT.md`、`REWORK-REPORT.md`、`QA-REVERIFY-REPORT.md`。后者 supersedes 前报告的 E1 和包测试失败：现有日志确为 **354 tests / 354 pass / 0 fail**，Stage **10 / sidebar 8 PASS**。本轮复核现有日志，不声称重新运行测试；QA 测试修正与报告原文保留。
- Dev seed：`/Users/x/.omnimux-dev/profiles/omnimux`；`.materialize-transactions/` 当前只有 `18dd9c91-5389-4370-9c3e-281d6a2a96bd/journal.json`，phase=`COMMITTED`，请求 `@crosery/dsh-viewer@0.1.0`，tgz SHA-256=`7786848ddbabca4cc2dc05dc0bdb3d2cdef99b16b2fd195764a542c30d6a4907`。纳管成功不等于运行兼容。
- seed 与本任务 `.materialize-snapshots/plugins/@crosery/dsh-viewer/lib/index.js` 实算 SHA-256 均为 `e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a`，与 QA 前次相同；第3行仍静态导入 `installSettingsSection, settingsNamespace`。
- 以 `/Users/x/Desktop/Project/Github/deepseek-harness/apps/cli/package.json` 为 createRequire 锚点解析 settings，真实路径 `/Users/x/Desktop/Project/Github/deepseek-harness/packages/settings/settings/lib/index.js`；只读动态导入得到导出 `[SettingsConflictError, SettingsProvider, default, redactSecrets]`。两个 viewer 所需导出均缺失，未启动 Host 来重复确认必然失败。
- 本任务 profile `host.log:6–10` 仍为 `does not provide an export named 'installSettingsSection'`；PID 98774 已退出、44201 无监听、本树 `.l2-dev.env` 不存在。
- 原 verify:live run `65223c6d-35af-4542-b588-8e279740344d` 是前检失败，不是 runtimeProof；没有新增浏览器验收证据。
- 主树当前 HEAD `93a36e19e59fb8b7b7ee0ad32e08f46efe12f137`，只读观察到两个并发脏文件：`plugins/omnimux-workflow/src/canvas/nodes/definitions/videoCompositionStatus.ts` 与同目录 `videoCompositionStatus.test.mjs`。没有 stash/reset/checkout 或修改这些文件。
- 主树与任务树 `scripts/dev-env.sh` SHA-256 均为 `d355d93b4151bde9cb2684c4c729104ee2e2bfd42ae583c24cb78f378f5891db`。当前正式入口未新增无损依赖 refresh：684–691行仅在无 node_modules 时 seed clone；已有不完整 profile 也拒绝覆盖。`restart-host` 不刷新依赖。

## 依赖与解除条件

只读 GitHub API：[#765](https://github.com/omnimux-ai/omnimux-dsh/issues/765) OPEN，updatedAt `2026-09-08T06:45:34Z`；[Crosery/dsh-viewer#3](https://github.com/Crosery/dsh-viewer/issues/3) OPEN，updatedAt `2026-09-09T02:01:51Z`。#765 为相关受阻协调任务；viewer#3 是直接兼容依赖。Issue 关闭本身不是解除证据。

依赖负责人须提供与现行正式 Host 兼容的 viewer **正式纳管/seed payload 身份变化及 receipt**，可重定位锁/source 一致、无非终态事务，并证明真实 loader 能加载该 viewer。不得借用 fork patch 的 settings 导出证明原生 Host 兼容，不在 #837 修外仓或另索授权。

## 下一步正式入口（条件满足后，当前未执行）

先重新读取 live journal、seed hash、Host 导出及本任务状态。兼容种子确实变化后，不能直接 start/restart-host 复用旧 node_modules。现有生命周期是任务环境 `rm` 后重新 `start`，其中 rm 会删除整个任务 home（含数据），不是无损刷新。执行前须核实仅失败初始化残留、保存需要的任务证据，并确认 stale PID 未复用；如存在需保留数据，先按恢复点合同处理，不能盲删。

在本任务 worktree 执行：

```sh
bash scripts/dev-env.sh rm assets-settings-tooltip-837
bash scripts/dev-env.sh start assets-settings-tooltip-837 omnimux-assets --source=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/assets-settings-tooltip-837
```

已有任务初始化授权继续有效；以上仅恢复本任务 L2，不授权外仓或 Dev 写入。成功后读取新端口/Host PID/profile/SOURCE/准确 SHA 绑定，再交独立 QA 用 ego-browser + 正式 verify:live 完成 `QA-REVERIFY-REPORT.md` 未执行八组合及交互矩阵。不能承诺重建仍分配44201。

当前无后台进程/子任务或可用原生调度工具，未创建唤醒；本轮回传主理人接续依赖协调，不承诺自动重试。完整验收、合入与交付未完成。
