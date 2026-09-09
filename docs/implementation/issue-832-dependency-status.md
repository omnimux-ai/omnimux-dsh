# Issue #832 — viewer 依赖续验

核验时间：2026-09-09 10:37–10:40 Asia/Shanghai。

## 结论

**依赖未变化；未刷新、未重启。#832 离线 QA 654/654 的既有结论保留，L2 / ego-browser / verify:live 仍 BLOCKED，不能放行。**

调查固定 head `37211b40f0978a9deb101b7143c5e21974b41079`，base `867b192ecf6aa35be4e1639db7351a89bea782c7`。本次仅补报告并保存既有未提交 QA 报告，不改业务源码；后续文档提交不改变此源码身份。

## 当前实物证据

- 正式 seed：`/Users/x/.omnimux-dev/profiles/omnimux`。
- 任务 profile：`/Users/x/.dsh-dev/tasks/skill-header-832/profiles/omnimux-dev-skill-header-832`。
- 两者 manifest 均声明 `@crosery/dsh-viewer: file:.materialize-snapshots/plugins/@crosery/dsh-viewer`；snapshot 与 installed 均 `0.1.0`。两份 snapshot 的全部 27 文件逐一 SHA256 相等；四处入口的以下三文件哈希全部相同。

| 文件 | SHA256 |
|---|---|
| viewer package.json | `e84a7b50cb13e63ec39cef7cc5d132e3e922bdf6405a246723e02c067d0d4df7` |
| viewer lib/index.js | `e9f78cef7245fed9b634d670879d039bfac6c6bab50748940fabb344b9bca65a` |
| viewer lib/client.js | `ef581017c94a3fdee31d20742201c2886458b69218f6c315b95b18be1ef7c548` |
| 实际 settings lib/index.js | `bb4bee8b1772c59b52c5b89fc5464a09a5ef6f23dfbcaa93b1b84c53ae8a43ec` |

viewer `lib/index.js:3` 仍静态导入 `installSettingsSection, settingsNamespace`。由本任务 viewer 入口 `createRequire().resolve()` 解析 settings 到 `/Users/x/Desktop/Project/Github/deepseek-harness/packages/settings/settings/lib/index.js`；其610行仅导出 `SettingsConflictError, SettingsProvider, default, redactSecrets`。官方 clone HEAD 为 `dd6322d604e00eec1ba5e0c8541159906a21094a`，未修改或切换。

只读 journal 摘要确认 Dev 唯一观察到的 COMMITTED 事务 `18dd9c91-5389-4370-9c3e-281d6a2a96bd`，目标 viewer `0.1.0`，原归档 SHA256 `7786848ddbabca4cc2dc05dc0bdb3d2cdef99b16b2fd195764a542c30d6a4907`。这是旧包纳管证明，不是兼容证明；本次没有重新审计整图或原归档。

## #765 交付状态与证据层级

1. [#765 公开 Issue](https://github.com/omnimux-ai/omnimux-dsh/issues/765) 当前 OPEN；updatedAt `2026-09-08T06:45:34Z`，最后评论声明依赖 #778，未交付兼容制品。
2. [#778 公开 Issue](https://github.com/omnimux-ai/omnimux-dsh/issues/778) 当前 CLOSED；updatedAt `2026-09-08T17:18:50Z`。已读全部公开评论，最后状态仍是等待正式修复/真实 seed 证据；关闭本身不代表当前 viewer 兼容。
3. 只读本 repo 中 #765 的 `.worktrees/cross-page-dividers-765/.workbuddy/evidence/issue-765-runtime-compat.md`（98行）及 `issue-765-upgrade-path.md`（173行）。前者确认原生 alpha.3 缺 legacy exports；shipping rc.1 的导出来自 fork patch，不能据此升级 pin 或切 App。
4. 升级报告记载候选 `@crosery/dsh-viewer@0.1.1-omnimux.765.1`，archive SHA256 `555346d3469bd7e11b9453f8beaa0c09de28d695dd6ed2cddbdc875952264a31`，release source commit `ccfc0a7c6cfa692aa737f48d9e8c97c41db82950`，来源 `https://github.com/Crosery/dsh-viewer.git` 的本地发行。**这些是报告转述，不是本轮包 QA，也不是正式纳管事实。** 本轮未读取/复制外部 viewer 工作树或候选包。
5. 报告明确单包升级仍为 proposal；当前正式主树与本 #832 树的 `scripts/dev-env.sh`、`scripts/managed-tarball.mjs` 字节一致，未发现该能力已进入正式入口。

## 刷新已有任务：具体入口及限制

- `scripts/dev-env.sh:684–693`：已有 node_modules 跳过 seed 克隆；重复 start 无效。
- `scripts/dev-env.sh:344–349`：仅删除 node_modules 也无效，clone 遇到既有 profile 会拒绝覆盖。
- `scripts/dev-env.sh:782–885`：restart-host 仅重启 Host，不重建依赖。
- `scripts/dev-env.sh:925–947`：正式 `rm <task>` 删除**整个任务子根，含数据、凭据/settings**；之后 `start` 才可重新从受管 seed 克隆。它是破坏性重建，不是保数据刷新；本轮不执行，不将凭据继承授权解释为删除数据授权。
- `scripts/managed-tarball.mjs:337–339,365`：现有纳管要求 installed 完整 payload/version 等于输入，且既有 source 不同即拒绝；不能拿新包直接纳管到已有任务或 Dev。命名目录 sync 不等于精确受管 tarball 升级，亦不能从其他任务借包。

正式入口文件 SHA256：

- dev-env.sh：`d355d93b4151bde9cb2684c4c729104ee2e2bfd42ae583c24cb78f378f5891db`
- managed-tarball.mjs：`6140b0653d2db2bc8a0b01d254807b7f7dc241f2ce68018dd41a038415befa9a`

## 最小接续办法

1. **依赖 owner** 先交付同 pin 兼容包的精确 QA/归档身份，再由其现有授权流程正式纳管并提供 seed/source/installed/lock/receipt 证据。#832 不接管工具扩展、不写共享 seed，不要求 viewer 上游 merge 或关 Issue 作为额外门槛。
2. 正式 seed 就绪后，若需要保留当前任务数据，必须使用届时已交付且覆盖任务私有根的受管转换入口；目前无此入口。最小无删除替代是为同一 #832 建新的私有 L2 名称（例如 `skill-header-832-refresh`），仍只链接本树 market，旧任务根保留；这是新环境重建，不声称刷新了旧 profile。执行前核对名称未占用、正式 seed 兼容与现有授权覆盖。
3. 新私有根的现成条件式命令：在本树执行 `OMNIMUX_PLUGINS_DIR="$PWD/plugins" bash scripts/dev-env.sh start skill-header-832-refresh omnimux-market`。**本轮未执行**。沿用用户明确授权的开发凭据/settings继承，不读取秘密内容、不模型/付费调用。
4. 若必须保持原任务名，则需先确认数据可丢弃或完成最小受管恢复点，并取得删除任务根的明确范围，才可用正式 rm → start；不可手删目录或把回滚备份做成新的旁路 seed。
5. 启动后再绑定真实 COMMIT/SOURCE/PROFILE/PID/PORT，运行同次 ego-browser + verify:live。当前无法进入这一步。

没有联系成员，没有操作其他任务、进程或外部 repo；没有 push/merge、官方/共享 seed 修改、viewer移除或pin升级。未重复离线全套测试；文档执行 `git diff --check`。本会话无原生定时唤醒工具，未建立后台轮询；依赖等待回传主理人统一承接。
