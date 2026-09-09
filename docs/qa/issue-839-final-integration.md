# #839 最终 Git 集成工程报告

## 最新基线补充（以本节为最终集成基线）

创建 Draft PR #857 时 main 前进到 `9db9502eaaeba832ae13b04955598ee7618cc830`（#849 业务卡片）。已再次 fetch 并在任务分支无冲突 merge，最终代码集成 HEAD 为 `1e0233cb96acec092bf99bf0475bfe49fee03e89`。下文 e3f71ae6 / 1bd7210c 是第一轮集成及专项测试的精确历史输入。

- 最终 exact base：`9db9502eaaeba832ae13b04955598ee7618cc830`；交付前 ls-remote 再核实未前进。
- 第一轮实测 HEAD 到最新集成 HEAD 的 `scripts/`、package.json、pnpm-lock.yaml、pnpm-workspace.yaml 差异为空，source/recovery 8/8 与 unit 71/71 证据有效复用。
- 因 main 的客户端新增会进入静态扫描，在最新集成 HEAD 再跑 `pnpm test:gates`：**149/149、4 suites、0 fail/skip/cancel/todo、287539.64675ms、exit0**。日志 `.workbuddy/issue-839-integration-latest-gates.log`，SHA256 `7e46d4cde5fae21442038a6001f55e0e53e38344152e05f6373ea56c71018017`。
- 最终报告跟随提交仅更新本节，无生产代码变化；最终交付 head 从 PR 读回并在回执中提供。相对最新 base 的文件清单仍为下文16项，无新增任务冲突。
- PR：https://github.com/omnimux-ai/omnimux-dsh/pull/857 ，Draft，独立最终集成 QA 仍未完成。最终 Git diffcheck PASS；最新 main 不改 workflow，自动部署结论不变。

## 状态与精确修订

工程集成检查 IS_PASS: YES；**独立最终集成 QA 未完成，Draft / 不可 ready、merge 或部署**。第二轮独立 QA Route NoOne 仅适用于原固定工具树，不自动继承为本集成修订的独立通过结论。

- Worktree: `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/common-viewer-managed-upgrade-839`
- Branch: `agent/common-viewer-managed-upgrade-839-issue-839`
- 原固定 HEAD: `867b192ecf6aa35be4e1639db7351a89bea782c7`
- 13 文件任务保存提交: `e1af3e94038ce25eae2f7667dbbc8fdbecafb8f6`
- fetch 后 exact base: `e3f71ae6097c49ed507130d7ece566f73ad78386`
- 最终代码/实测 HEAD: `1bd7210cfabfb64795a7d5d1a396013b528b1488`
- 报告封存提交仅新增本报告及两项历史证据；最终交付 SHA 由 PR head 与交付回执提供，不将提交自身 SHA 写入自身内容。

## 集成与完整文件范围

任务分支 merge origin/main；未本地合入 main、未切换主检出、未 stash/rebase/force-push。唯一冲突文件 `scripts/sync-release-policy.test.mjs` 的三个 hunk 为 helper 定义、alias 调用、mixed-wrapper 调用。复用 main 单一 `initCleanMainRepo` 及系统/global Git config 隔离；保留固定 `pnpm@11.7.0` 与 malformed-registry runner 初始化。相对 main 该文件仅新增这两行。guard 无冲突，保留系统 tmpdir 的真实 Git fixture。

相对 exact base 的 13 项任务代码/合同：

1. `docs/contracts/dev-pipeline.md`
2. `docs/contracts/ops-entry.md`
3. `docs/specs/issue-778-managed-tarball-architecture.md`
4. `scripts/guard-worktree.test.mjs`
5. `scripts/issue-839-independent.qa.test.mjs`
6. `scripts/issue-839-source-verification.test.mjs`
7. `scripts/managed-tarball-archive.py`
8. `scripts/managed-tarball-recovery.test.mjs`
9. `scripts/managed-tarball-transaction.test.mjs`
10. `scripts/managed-tarball.mjs`
11. `scripts/managed-tarball.test.mjs`
12. `scripts/materialize-graph.mjs`
13. `scripts/sync-release-policy.test.mjs`

另新增 3 项证据：本报告、`docs/qa/issue-839-qa-round2.md`、`docs/qa/issue-839-repair-integrity.json`。生产脚本和所有原测试（除已说明 Alpha fixture）与第二轮 hash 一致；原 POSIX modes 保持，两个 QA tests 本地仍为 0600，Git 按非执行文件记录 100644。三份合同接入 main 的已合 baseline 文档，任务增补保留。完整 diff 已统一核对，无额外生产行为或边界放宽。

## 本岗实际验证

复用任务私有 `.workbuddy/qa-env/env.sh`，Node 25.8.0、固定 Corepack pnpm 11.7.0、私有 HOME/XDG/cache，网络禁用；TMPDIR 使用 `realpath(getconf DARWIN_USER_TEMP_DIR)`，不改 symlink gate，不安装或修改共享依赖。

| 检查 | 实际结果 | 原始证据 |
| --- | --- | --- |
| `node --test --test-name-pattern='839 final source\|QA839' scripts/issue-839-source-verification.test.mjs scripts/issue-839-independent.qa.test.mjs` | 8/8，0 fail/skip/cancel/todo，199856.067458ms，exit0 | `.workbuddy/issue-839-integration-source.log` |
| `pnpm test:managed-tarball:unit` | 71/71，0 fail/skip/cancel/todo，52022.579459ms，exit0 | `.workbuddy/issue-839-integration-unit.log` |
| `pnpm test:gates` | 149/149、4 suites，0 fail/skip/cancel/todo，216613.142875ms，exit0 | `.workbuddy/issue-839-integration-gates.log` |
| `git diff origin/main --check` / staged diffcheck | exit0 | 本岗 Git 输出 |
| Node syntax：managed-tarball / materialize-graph / sync-release-policy；Python archive AST | PASS | 本岗工具输出 |

149 为外层 tests，包含 Alpha 和 guard 子进程聚合，不虚报穷尽叶子数。专项包括 source bytes/mode/type/extra/missing 漂移拒绝并显式恢复、真实 after-rename-2/8 SIGKILL 后移除归档的公开恢复、COMMITTED recover 不退版。旧约20分钟174全套未重跑：本次生产代码未较已独立复核树改变，依用户要求只补集成相关验证；不把历史174计入本轮。无真实 Dev/Prod、Host/L2、#765 ego 验收声明，无覆盖率声明。全部三个后台测试 job 已收集 exit0。

日志 SHA256：
- source: `b3c3f9a9e5a71c954a45cce8ab9669c223069e3fce12cf1eb111e723693fdda7`
- unit: `9059f50d463314d337209f6a0118c2f4e7a4230498199e7c2e0e110126e9296f`
- gates: `a851ebb51e431b8e75e48a34b123b71c83fbcf58d6858e87e48c0dfac6cc9e15`

原报告和 integrity 清单保留在 `.workbuddy/evidence/`，另逐字节复制到上述规范 docs 路径，未删除原证据：
- round2 SHA256: `3dd08f2d98e10fb72e1df6973ed676cc7c79a71b9655817fddbe737c24bf9335`
- integrity SHA256: `57adf1b49c3486d24987c5bbbfe5be13a2c7dfd63a09ac49892b6795985ffa57`

## 自动化、风险与授权

本次按用户最新明确授权交付 **R1 工具分支和 Draft PR**，不执行实际破坏性回滚。Issue #839 旧正文的 risk-tier R0 / implementer 禁止 push 是历史阶段记录，未改写或降低其标签（当前无 labels）。真实升级/回滚按届时精确目标和独立验收核对，本文不扩展权限。

读取当前仓库全部 tracked workflow 与 GitHub active workflow：仅 `Quality Gate & Auto QA`，监听 PR/main push/merge_group，执行 CI、证据上传和 QA 标签聚合；未见部署、发布、App 重启或 profile 物化步骤。GitHub repository hooks API 返回 0；未配置自定义 core.hooksPath/push override。普通任务 branch push 本身不命中 main push 事件，建 Draft 会启动 PR CI。未审计仓库外不可见组织级集成；不能据此声称整个组织无自动化。发现范围内无新增自动部署风险。

Agent 不自行写 `qa:pass`，不 ready、auto-approve、merge/MQ，不运行 Dev/Prod/官方/fork 操作、不再委派。工具合入后由主理人安排正式 viewer 升级与 #765 真实 L2；现阶段仅提供实际最终 revision 给独立集成 QA。GitHub CI 及 required-check 完整覆盖应绑定最终 PR head 另行读取，本文不提前宣称远端通过。
