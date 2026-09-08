# Issue #786 — 独立局部 guard QA 报告

## 结论与路由

**局部 guard QA：PASS。全门禁放行：未完成，不能据此关闭 #786、合入或激活。**

- 测试合计 **53 项，53 通过，0 失败，0 skip/cancelled/todo**：先完整既有 36 项，再有限独立 17 项。两次测试命令执行，无失败修复循环、无第三次执行。
- Routing Decision：**NoOne（仅 guard 局部范围）**。未发现需要返工的本次源码缺陷。
- 全 gates 仍需工程 138 最终状态及独立综合门禁核验；当前未运行、未放宽、未跳过后声称通过。未赋予 `qa:pass`，未执行 CI、commit、push、PR/Merge Queue、main 更新或 hook 热激活。
- 用户提供的 2026-09-08 19:41 修复授权沿用；本轮不创建授权开关，不将 `non-git-target` 视作跨 workspace 授权。

## 被测身份与读取边界

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/common-non-git-guard-786`。
- 分支：`agent/common-non-git-guard-786-issue-786`。
- 固定 base/HEAD：`59c19cdfb15b20556086c2255f3e43d019d66dd4`，加未提交 guard 两文件；开始和结束 HEAD 一致，没有 fetch/checkout/合并。
- 完整读取 [实现说明](../implementation/issue-786-non-git-guard.md) **84 行**、[源码](../../scripts/guard-worktree.mjs) **454 行**、[既有测试](../../scripts/guard-worktree.test.mjs) **540 行**，并审查两文件相对固定 HEAD 的完整 diff。
- 实现说明的旧 gates 123/128 仅为工程历史记录，不是本轮当前 gates 结果。
- 最后 status 显示 `origin/main [behind 1]`；这是并行环境的 remote-tracking 变化，不改变固定局部目标，不代表已复核最新远端。
- status 中观察到工程 138 的 `live-qa.test.mjs`、`live-stage-contracts.mjs`、`sync-release-policy.test.mjs` 和 `issue-786-gates-alignment.md`；未读取其变化内容、未触碰，也未把这些变化中 gates 当稳定证据。`verify-ci-gates` 同样不在本轮读取/执行范围。

### SHA-256

| 文件 | SHA-256 |
|---|---|
| `scripts/guard-worktree.mjs` | `2830eb4e3eccc1cae845846d3eb73c038927c5cd633172cc3c5f41e33e40ffde` |
| `scripts/guard-worktree.test.mjs` | `6355f8021706d2cb930ae73338e192cbc09fb0226a1ebb4774f055c347762002` |
| `scripts/guard-worktree.qa.test.mjs` | `5ba2b31a3202a63bec1db2201830fe917530773d30517e6218c3e53fc82004ad` |

源码与既有测试在 QA 前后字节指纹一致；本轮仓库产出仅新增本报告与独立测试文件。既有测试自身在 `scripts/.guard-fixture-*` 建立并清理其隔离 fixture，未改原测试或真实仓库内容。

## 执行证据

环境：macOS，UID 501，Node `v25.8.0`，Git `2.50.1 (Apple Git-155)`。无依赖安装、无网络或全 gates 执行。

| 命令（固定工作树 cwd） | exit | 真实结果 |
|---|---:|---|
| `node --test --test-reporter=tap scripts/guard-worktree.test.mjs` | 0 | 36 tests / 6 suites；36 pass；0 fail/skip；6928.86025 ms |
| `node --test --test-reporter=tap scripts/guard-worktree.qa.test.mjs` | 0 | 17 tests / 1 suite；17 pass；0 fail/skip；5201.127292 ms |
| `node --check scripts/guard-worktree.mjs` | 0 | 语法通过 |
| `node --check scripts/guard-worktree.test.mjs` | 0 | 语法通过 |
| `node --check scripts/guard-worktree.qa.test.mjs` | 0 | 语法通过 |
| `git diff --check -- scripts/guard-worktree.mjs scripts/guard-worktree.test.mjs` | 0 | 限定 diff 无空白错误 |
| `git diff --no-index --check -- /dev/null scripts/guard-worktree.qa.test.mjs` | 1 | 无诊断输出；no-index 对新增文件存在差异返回 1，不是测试失败 |
| `git diff --no-index --check -- /dev/null docs/qa/issue-786-non-git-guard.md` | 1 | 无诊断输出；同上 |
| 报告本地 Markdown 链接目标存在性检查（Node） | 0 | 5/5 目标存在；引用章节已在合同原文读取 |

新增文件检查的 shell wrapper 原先把 no-index 的差异 exit 1 误当错误，wrapper 因此 exit 1；核对两条命令均无空白诊断后按真实语义记录，不重跑测试、不改断言、不写成 exit 0。

两次测试通过 Node `spawnSync` 执行上述准确参数并捕获输出，设置独立 HOME/TMPDIR/XDG config/cache；先清除 inherited `GIT_*`，fixture setup 使用 `GIT_CONFIG_NOSYSTEM=1` / `GIT_CONFIG_GLOBAL=/dev/null`。guard 自身按实现清除 `GIT_*` 并强制 C locale，不改生产配置。独立负例仅在自己的假 HOME 写入 malformed `.gitconfig`，不触及真实 HOME、global skill 或被拒写入目标。

本机原始证据根目录（保留）：

`/var/folders/s4/bq231_q12pg5k216kgk882d80000gn/T/guard786-independent-qa-0CstYQ`

- `environment.json`：Node 路径、UID、隔离目录与显式环境覆盖。
- `existing.stdout.tap` / `existing.stderr.txt` / `existing.result.json`：既有套件完整原文、exit 0、signal null、空 stderr。
- `independent.stdout.tap` / `independent.stderr.txt` / `independent.result.json`：独立套件完整原文、exit 0、signal null、空 stderr。
- 独立 TAP 内保存 **17 条实际 guard 子进程的完整 stdin、stdout、stderr、exit、signal、error**；每条执行均为真实 `node scripts/guard-worktree.mjs`，不是仅调用导出函数。17 次均 hook exit 0、signal null、stderr 空，决策从 stdout JSON 断言，未把 exit 0 当 allow。
- 用例 fixture 在 after 中清理，原始 TAP 与环境记录保留；未把 fixture 当作可部署产物。

| 原始输出 | SHA-256 |
|---|---|
| `existing.stdout.tap` | `cd1cd2d7b911ac85d9b686ccc0033c4d069d8a80848c41ee4570ab21ac2ee297` |
| `independent.stdout.tap` | `99bffdeaeb21285db59354cbde48433c223d56fb6e3a78a4087baad8b222e71d` |

### 真实协议摘录

以下为独立用例 1 的实际 stdin（不是执行用户真实 skill 写入）：

```json
{"hook_event_name":"PreToolUse","tool_name":"default_api:write","cwd":"/var/folders/s4/bq231_q12pg5k216kgk882d80000gn/T/guard786-independent-qa-0CstYQ/scratch/guard786-qa-cases-k5I4aD/plain","tool_input":{"file_path":".agents/skills/fixture/scripts/missing/target.py"}}
```

实际 stdout（尾随换行），stderr 空，exit 0：

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}
```

独立用例 7 输入相同隔离 cwd、`file_path=docs/new.md`；PATH 内假 Git 返回 exact notgit stderr + **非空 stdout**，真实 guard stdout（尾随换行），stderr 空，exit 0：

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"🚫【OmniMux 仓库 Hook】Git 状态读取失败，无法确认目标的版本管理状态；保守拒绝写入。请检查 Git 可用性、仓库元数据与读取权限，不要绕过门禁。"}}
```

## 覆盖与边界审查

既有 36 项全量保留并通过，包含 main tracked、受保护新文件、合法 linked worktree、外部主仓、复制/未注册/畸形 gitdir、目录/文件/dangling symlink、损坏 index、真实 chmod(0) 路径与元数据读取失败、Git 缺失、异常退出、dubious ownership、mixed diagnostics、失败 ls-files、环境污染及 destructive reset 原有行为。

独立新增 17 项：

| 项数 | 独立行为 |
|---:|---|
| 2 | 真实 non-Git 受保护外观/缺失父目录；Git 目录中的链接 canonicalize 到真实 non-Git |
| 2 | non-Git cwd 的外部 tracked 文件；non-Git 文件链接真实指向 primary tracked，均 deny |
| 2 | GIT_DIR/COMMON_DIR/WORK_TREE/INDEX/CEILING/DISCOVERY/CONFIG 与非 C caller locale 污染下，真实 non-Git allow、真实 tracked deny |
| 7 | 非空 stdout、错误 exit 1、Git SIGTERM、诊断后缀、混合 stderr、本地化诊断、空成功 root，均准确 git-read-error deny |
| 3 | exact notgit 诊断但多级祖先有 `.git` directory/file/dangling-link，均 deny |
| 1 | 私有 HOME 的真实 malformed Git config，准确读取错误 deny |

结合源码确认：仅在 discovery 成功启动、exit 128、trim 后 stdout 为空、trim 后 stderr 精确匹配 C-locale notgit、canonical 祖先全无 `.git` 且无非 ENOENT 元数据读取失败时识别 non-Git。其他错误不冒充 tracked；boolean `isGitTracked` 仍对读取失败返回 true。现存 ephemeral / ignored / registered-worktree 优先豁免保持原样，因此不把“所有路径遇到 Git 错误一律 deny”作为超出本次修复范围的新承诺。

覆盖率：未运行行/分支覆盖率工具，不声称百分比或覆盖所有公开 API。上述为本次变更及关键回归的行为证据，不是通用安全证明。未新增威胁模型、授权机制或旁路配置。

## 适用矩阵与剩余责任

依据 [plugin-qa 适用矩阵](../contracts/plugin-qa.md#适用矩阵) 和 [Git/PR 证据与合入条件](../contracts/plugin-git-pr.md#证据与合入条件)：

| 层 | 判定 | 理由/下一责任 |
|---|---|---|
| 纯脚本逻辑与错误路径 | PASS（局部） | Node/Git/文件系统实进程；53/53 |
| L2 | N/A，不是 PASS | 未改变 Host/插件或其运行依赖；本次不启动 profile |
| ego-browser | N/A，不是 PASS | 无 Client/Stage/sidebar/UI 变化 |
| Electron | N/A，不是 PASS | 无壳层、平台门控、原生行为变化 |
| 全 `test:gates` / 138 对齐 | 未验证，不能放行 | 工程 138 完成最终变更/报告后，由主理人安排独立综合门禁核验 |
| GitHub required CI / PR / Merge Queue | 未执行 | 主理人后续按真实最终整合版本及授权核验 |
| main/实际会话 hook 激活 | 未执行 | 禁止复制候选覆盖 main；仅可在合法合入后按正常流程验证实际归属会话 |
| 跨 workspace/global skill 实写 | 未执行、无新授权 | non-Git 分类 allow 不等于写权限；未尝试或重试此前拒绝目标 |

局部委派已完成。整体 #786 仍不可关闭；本报告不承接 #778 备份修复/事务/运行时验收，也不把 138 的进行中工作写成完成。
