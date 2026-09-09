# Issue #873：sync-to-app 源身份适配工程报告

## 状态与身份

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/873；关联 #861 / 已合 PR #865。
- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/common-sync-source-873`
- 分支：`agent/common-sync-source-873-issue-873`
- fetched base：`f167598747c7296a1b71a571e80babcf88032094`
- 当前 HEAD：`f167598747c7296a1b71a571e80babcf88032094`；本阶段交付为该 HEAD 上的本地未提交 diff，不是新 commit。
- 本地实现完成、专项通过、供独立 QA；整体 IS_PASS: NO（完整 gates 未通过），不得据此合并或物化。
- 未 push、未建 PR、未 merge、未运行真实 Dev/Prod/官方 profile 同步。未委派。主检出两处他人 workflow dirty 保留，未 stash/reset。

## 最小实现

普通 `sync-to-app.sh` 在构建及目标写入前读取来源树 dirty，执行明确 refspec 的 fetch，再比较完整 commit SHA；接受干净 main、命名分支或 detached linked worktree，只要 HEAD 等于本次 fetched origin/main。拒绝非 Git、状态读取失败、staged/unstaged/untracked、冲突索引、remote 缺失、fetch 失败、远端 main 缺失，以及 ahead/behind/divergent tip。删除原先不可达的布尔旁路分支及旧旁路提示，没有增加新旁路。

共享入口审查：`resolve-omnimux-profile.sh` 只负责 profile/目标解析；普通 `sync-stable.sh` 不含重复 branch/main 身份校验，因此无需新增相互矛盾的二次校验（build 会产生文件）。managed 参数在 wrapper 前置分流，经 `managed-tarball.mjs` 的独立 clean-main/MQ 合同；本次明确不改该 viewer/纳管例外、不改其授权与目标守卫。现有 L2 显式目标前缀规则原样保留。没有创建新共享框架。

## 文件

1. `scripts/sync-to-app.sh`：普通源身份校验。
2. `scripts/sync-source-identity.test.mjs`：12 个真实临时 Git fixture 测试（bare origin + primary + linked worktree；下游 materializer 仅为无写入 marker stub）。覆盖成功与失败路径，失败必须未到达下游。
3. `scripts/sync-plugin-scope.test.mjs`：原非 Git synthetic fixtures 初始化真实本地 origin，保留 kit/preset/installer 哨兵与故障断言。
4. `scripts/sync-release-policy.test.mjs`：原手造 tracking ref 改为真实 bare origin。
5. `scripts/simulate-multi-agent-lifecycle.test.mjs`：同步旧 ahead-only 静态断言到 fetch+exact identity；行为保障来自新 Git fixture，不只靠 regex。
6. `docs/contracts/dev-pipeline.md`：普通同步源身份、dirty 隔离及例外不扩权。
7. 本报告：任务工程证据，不是门禁放行记录。

## 验证记录（退出码为实际命令结果）

| 命令/范围 | 结果 | 退出码 |
|---|---|---:|
| 初次 `node --test scripts/sync-source-identity.test.mjs scripts/sync-bypass.test.mjs` | 13/14；stub 未设 executable 导致成功路径 Permission denied，已修 fixture mode | 1 |
| 修正 fixture mode 后同命令 | 14/14 | 0 |
| 最终 `node --test scripts/sync-source-identity.test.mjs scripts/sync-bypass.test.mjs scripts/simulate-multi-agent-lifecycle.test.mjs` | 19/19（identity12 + bypass4 + lifecycle3） | 0 |
| `node --test scripts/sync-plugin-scope.test.mjs` | 最终 10/10 | 0 |
| `node --test scripts/sync-release-policy.test.mjs` | 最终 9/9 | 0 |
| 首次相邻三套 `sync-release-policy + sync-targets + sync-plugin-scope` | 30/42；12 失败来自上述旧 fixture 假设，scope/release 已分别复验；target matrix 23/23 通过 | 1 |
| `pnpm test:gates` | pnpm 自动依赖安装先失败：缺少仓内解析出的 `personal/dsh-ui-kit`；子安装退出254，外层退出1，未进入测试 | 1 |
| `npm_config_verify_deps_before_run=false pnpm test:gates` | 配置未阻止本机自动安装，同样 ENOENT；没有补建/改写 kit | 1 |
| 从 package.json 逐项原样执行 `node --test` gates 清单 | 149 项、124 pass、25 fail；约403秒，无取消 | 1 |
| `node --test --test-name-pattern='simulate-multi-agent-lifecycle incident' scripts/verify-ci-gates.test.mjs` | 修正静态断言后的 wrapper 定向复验 1/1 | 0 |
| `bash -n scripts/sync-to-app.sh` | 语法通过 | 0 |
| `git diff --check` | 通过 | 0 |
| dev-pipeline Markdown 本地链接 exists 检查 | missing=[] | 0 |

完整 gates 的25失败中，1项是其子进程在旧静态断言修正前已执行的 lifecycle，后续原 wrapper 定向复验通过；其余24项：14个 pngjs fixture 解析缺依赖，3个 live QA 缺 Chakra/kit/esbuild，4个 repeat-install 在临时 HOME 下找不到离线 Corepack pnpm 11.7.0，1个 Stage 缺 Chakra，2个 package-files 缺 assets cpython 两平台运行包及 forms assets/examples。未把这些结果宣称为基线已证明无关：没有在另一个全新固定基线环境重跑完整 gates，独立 QA 须复核。

全局 diff 审查：本次产品执行代码仅改一个身份函数；目标解析、Alpha过滤、kit路径、快照/锁/安装、官方与 managed 例外均未修改。上述未通过的环境验收阻止整体 IS_PASS:YES，但不隐去已通过专项。

## QA 最小执行入口

```bash
cd /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/common-sync-source-873
git rev-parse HEAD
git diff --check
bash -n scripts/sync-to-app.sh
node --test scripts/sync-source-identity.test.mjs scripts/sync-bypass.test.mjs scripts/sync-plugin-scope.test.mjs scripts/simulate-multi-agent-lifecycle.test.mjs
node --test scripts/sync-release-policy.test.mjs
pnpm test:gates
```

QA 应检查当前未提交 diff（含新测试），不要直接调用此未合 wrapper 写公共 Dev。主理人独立 QA 转交后再推进 PR/MQ；未来物化须再次 fetch 并选择精确匹配的干净来源，协调共享目标使用状态。当前任务树保留供审阅，不清理其他任务树。
