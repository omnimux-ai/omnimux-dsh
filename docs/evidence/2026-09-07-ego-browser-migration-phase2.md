---
title: ego-browser 迁移第二阶段实施与验证报告
id: evidence-ego-browser-migration-phase2
type: evidence
status: draft
authority: L2
date: 2026-09-07
updated: 2026-09-07
authors: [agent]
subsystem: qa
---

# ego-browser 迁移第二阶段实施与验证报告

## 结论与边界

- **第二阶段实现自检 IS_PASS: YES**：旧 diff 已冻结为可达恢复提交；最新 fetch 基线已整合；本任务 worktree 已内聚；新 SHA 的完整本地门禁、CI 消费者与真实 L2 共享探针通过。
- **整体规范切换尚未闭环**：独立最终 QA 由主理人另派；全局 `/Users/x/.codex/AGENTS.md` 未写。本报告不授予 `qa:pass`、合入或生产权限。
- 仅本地提交，无 push、远端 Issue/PR/标签写入、merge、共享 Dev 物化或生产操作。未改官方 DSH、他人工作树、桌面壳或 `git-wt.sh` / `worktree.sh` / `dev-env.sh`。
- [第一阶段报告](2026-09-07-ego-browser-migration.md)和旧运行文件保留原义；旧 run 不作为新 SHA 证据。

## 精确 Git 身份

| 项 | 值 |
|---|---|
| 仓库 | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh` |
| 当前任务树 | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/browser-ego-migration` |
| 分支 | `agent/common-browser-ego-migration` |
| 原始基线 | `3054947b58c9438495bea47e143dc8805139f3b1` |
| 42 文件恢复提交 | `f3ec4c48f68300a96b43707e7b5905c250a51626` |
| 可达恢复分支 | `recovery/browser-ego-migration-phase1` |
| 2026-09-07 15:50 fetch 的 origin/main | `57f63a709a41124b8dcd199ce61fae3b94e74754` |
| 新治理提交 | `aecf3de92916812d31252b79ed6310694e20130d`（#702） |
| 集成实现提交 | `f9f0588a813233cdcdfc033fd4c7e123b3d9b7a4` |
| 实现 run 准备时 dirty | `false` |

本报告另以文档提交交付，避免改写已验证实现。最终交付 HEAD 必须以 `git rev-parse HEAD` 和本地 `.workbuddy/evidence/ego-phase2/final-delivery.json` 精确核对；该索引在报告提交后生成，记录最终 SHA 专属新请求、run、Host、PNG 与检查结果。若索引缺失或 SHA 不一致，最终 HEAD 的浏览器验收仍未完成；不得把实现提交 run 冒充报告提交 run。报告收尾不改运行代码，因此实现提交的静态/单测证据可复用，但浏览器 SHA 身份重新绑定并完整重跑。

## 冲突处理与保留治理

| 表面 | 整合结果 |
|---|---|
| `auto-pipeline.mjs` | 保留 #702 的 194 行模块化编排；仅修正 L3 浏览器文案，不恢复单体 |
| `auto-pipeline-qa.mjs` | 移植 ego `expectedBrowserEvidence`、`runBrowserQa` 和静态 gate 诊断；追加直接模块回归 |
| `ci-verdict.mjs` | 保留 `resolveImpact`、实际 diff 一致性、前序 CI 失败、严格 L0 布尔值、失败标签清理与 `syncQaPassLabel`；只迁移浏览器维度、工具和请求名 |
| `impact-matrix.mjs` | UI 匹配表达式和必需性不变；活跃维度统一为 `dimensions.browser`，拒绝仅有旧 `dimensions.iab` 的输入 |
| CI / package scripts | 保留 impact-matrix、authorization、qa-label、ci-verdict 全部新测试；删除退役执行器命令并追加 ego 及拆分消费者测试 |
| 新公共 fixture | 按 #702 的独立 fixture 结构补齐 ego task/tab、before/after 身份，不恢复旧测试内重复实现 |
| 活跃文档 | ego、API 优先、Electron 补充及失败边界一致；旧规范标 superseded，历史证据不重标 |

相对 fetch 基线字节不变的关键文件：`authorization.mjs` / `.test.mjs`、`qa-label.mjs` / `.test.mjs`、`auto-pipeline-{github,metadata,runtime,worktree}.mjs`、`live-stage-probe.mjs`、三个 worktree/L2 生命周期脚本。`git diff --exit-code` exit 0；新 required evidence、动态撤销、风险升级、准入与运行时授权分离未回退。

认证预检失败不消费；正式执行失败保留 `consumedAt`；并发败者不覆盖赢家；token 与脚本源不落证据；task/tab/Host 变动失败；缺能力 BLOCKED；无 IAB 回退。以上边界由完整门禁和消费者拒绝测试覆盖。

## Worktree 与 L2 路径收敛

1. 只读核对 `git-wt.sh`：start/dev 的旁目录硬编码，无目标路径参数。现有 `worktree.sh` 已有 `.worktrees` 定位，但其 dev shortcut 不生成 `.l2-dev.env`；不扩改基础设施。
2. 核对无 submodule/gitlink、无任务树锁、无其他写入者；主仓有他人未跟踪 `tmp/`，保持不动。42 个任务路径逐一匹配后本地提交并保留恢复分支。
3. 旧 Host PID `60081`、watch `60175` 经 `bash scripts/dev-env.sh stop browser-ego-migration` 正常停止。立即检查曾看见优雅退出中的 PID，未提前搬树；后续只读确认两 PID 消失、44201 无监听后才执行 `git worktree move`。
4. 仅移动本任务旧旁目录至当前 `.worktrees/browser-ego-migration`。搬迁前后 14 个旧 run 证据文件 SHA-256 全部一致；依赖链接无断链。Git HEAD/分支/干净状态不变。
5. 通过已有 `bash scripts/dev-env.sh start browser-ego-migration omnimux-assets --source=<当前任务树>` 重绑同名 L2。既有 profile 与数据保留，端口仍 44201；唯一在研 link 指向本树 assets。旧 Host 日志在覆盖前已脱敏存档。
6. `.l2-dev.env` 是 ignored 验收元数据，按 start 实际输出、当前提交、真实 link/监听核验更新；这不是手工 profile 部署。`dev-env.sh --source` 支持安全重绑，不受旧 git-wt 查找限制。生命周期本身不自动刷新该绑定元数据是现有工具限制，未新增第二套部署系统。

生命周期证据：`.workbuddy/evidence/ego-phase2/{before-move.json,previous-host-redacted.log,l2-stop.log,l2-start.log,after-move-runtime.json}`。

## 新实现 SHA 的真实 L2 证据

| 项 | 值 |
|---|---|
| run | `eb47e131-869c-4a79-8b26-28e6118f7be9` |
| SHA | `f9f0588a813233cdcdfc033fd4c7e123b3d9b7a4`，准备时 clean |
| URL / Stage | `http://127.0.0.1:44201/` / `assets` |
| profile | `omnimux-dev-browser-ego-migration` |
| profileDir | `/Users/x/.dsh-dev/tasks/browser-ego-migration/profiles/omnimux-dev-browser-ego-migration` |
| Host | PID `97824`；`Mon Sep 7 16:02:47 2026`；watch `97938` |
| ego | task `534`；Tab `8DED063D65CFABE52BD62A1722A62DDE` |
| consumedAt / completedAt | `2026-09-07T08:08:12.171Z` / `2026-09-07T08:08:21.749Z` |
| 六项 | active content/selection、幂等打开、chat 清选、恢复、原会话恢复、原工作台恢复：全 pass |
| runtimeProof | before/after 稳定；hub 唯一 normalized registration；assets 唯一 raw registration |
| PNG | 3456×1746；161113 bytes；CRC 解码通过 |
| PNG SHA-256 | `292c7824789dad94bdcf3f657ed5dca6e4eb01e7540e41005787fc171d6012dd` |

完整请求/报告/PNG 在 `.workbuddy/evidence/live-qa/eb47e131-869c-4a79-8b26-28e6118f7be9/`；摘要与三个消费者复验在 `.workbuddy/evidence/ego-phase2/implementation-verification.json`。`ci-verdict` 复验显式要求浏览器维度，仅调用纯评估函数，不写标签；该输入是消费者测试上下文，不声称本任务改了产品 UI。

旧 task 533 经 list 确认不存在，才新建 task 534。使用正式 L2 token→Cookie 单次导航；新树经页内选择器绑定并创建新空白 QA 会话，未发送模型消息、生成媒体或账号动作。每个正式 run 使用新请求和新截图。最终 HEAD 追加运行后，再用独立最终 heredoc 关闭 task 534；关闭结果和 L2 保留状态由 final-delivery 索引与最终回复确认。

## 命令、退出码与证据

执行环境固定现有 Node/Corepack 与完整系统 PATH；无新依赖安装、无门禁 skip：

```sh
export PATH=/Users/x/.nvm/versions/node/v25.8.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
export COREPACK_HOME=/Users/x/.cache/node/corepack COREPACK_DEFAULT_TO_LATEST=0
export pnpm_config_verify_deps_before_run=false
corepack pnpm test:gates
corepack pnpm test:ci
```

| 检查 | 实际结果 | 本地证据（ego-phase2/ 下） |
|---|---|---|
| `pnpm test:gates` | exit 0；125 pass，0 fail/skip | `test-gates.log` |
| `pnpm test:ci` | exit 0；75 pass，0 fail/skip | `test-ci.log` |
| repair/import inspiration 相关 CI 回归 | exit 0；24 pass，0 fail/skip | `related-regressions.log` |
| diff-aware `auto-qa-gate`，base=精确 fetch SHA | exit 0；24 源文件，五维全 pass | `auto-qa-report.json` / `auto-qa.log` |
| `ci-verdict --files-from-git --ci-status success --dry-run --json` | exit 0；实际非 UI diff 为 browser not-applicable，无远端写入 | `ci-verdict-dry-run.json` |
| 24 个变更 mjs `node --check`、120 个相对链接 | exit 0；0 断链 | `static-checks.json` |
| `git diff --check`、关键治理不变核验 | exit 0 | 本报告与终检 |
| `agent-live-qa.mjs assets --target=l2 --url=...` | exit 2；pending，符合合同，不是 PASS | `prepare-live-qa.log` |
| ego heredoc `runPreparedQa` | exit 0；completed/pass true；6/6 | 对应 run 目录 |
| auto gate / split pipeline QA / CI browser-required 纯消费者 | exit 0；三个均接受新 run | `implementation-verification.json` |
| 实际 Host token 未出现在第二阶段证据与该 run | exit 0；19 文件检查 | `secret-scan.json` |

已知非通过记录：变基首轮因五文件冲突 exit 1，全部按新治理解冲突后 rebase continue exit 0；L2 stop 后立即 PID 检查 exit 1，属尚在退出，确认真正退出后迁移；请求准备 exit 2 属合同 pending。未隐藏失败、无删除红灯记录。最终文档提交只复核文档；最终 HEAD 的新 run 与消费者验证必须另有索引，不复用旧 run。

## 文件清单（相对 fetch 基线，共 50）

新增（13）：

- `docs/evidence/2026-09-07-ego-browser-migration.md`
- `docs/evidence/2026-09-07-ego-browser-migration-phase2.md`
- `docs/specs/2026-09-07-ego-browser-qa.md`
- `scripts/auto-pipeline-qa.test.mjs`
- `scripts/ego-browser-page.mjs`
- `scripts/ego-browser-page.test.mjs`
- `scripts/ego-live-qa.mjs`
- `scripts/ego-live-qa.test.mjs`
- `scripts/ego-qa-test-helpers.mjs`
- `scripts/live-browser-utils.mjs`
- `scripts/live-page-preparation.mjs`
- `scripts/live-page-preparation.test.mjs`
- `scripts/live-qa-request.mjs`

修改（33）：

- `.agents/skills/omnimux-rc-upgrade/SKILL.md`
- `.agents/skills/omnimux-repo-workflow/SKILL.md`
- `.github/workflows/quality-gate.yml`
- `AGENTS.md`（仍为 80 行，仅浏览器验收义务；MVP/Product 边界不变）
- `docs/contracts/agent-issue-lifecycle.md`
- `docs/contracts/generation-node-policy.md`
- `docs/contracts/node-input-submission.md`
- `docs/contracts/plugin-git-pr.md`
- `docs/contracts/plugin-qa.md`
- `docs/design/2026-09-issue-504-shelf-unify.md`
- `docs/references/omnimux-gemini-3.8-contract-gap.md`
- `docs/specs/2026-09-05-builtin-browser-qa.md`
- `docs/specs/2026-09-05-plugin-suite-refactor-plan.md`
- `docs/specs/2026-09-05-workbench-panel-containing-block.md`
- `docs/specs/2026-09-06-composer-single-click.md`
- `docs/specs/2026-09-06-node-input-submission-prd.md`
- `docs/specs/2026-09-06-workspace-directory-browser.md`
- `docs/specs/README.md`
- `package.json`
- `scripts/auto-pipeline-qa.mjs`
- `scripts/auto-pipeline.mjs`
- `scripts/auto-pipeline.test.mjs`
- `scripts/auto-qa-gate.mjs`
- `scripts/ci-verdict.mjs`
- `scripts/ci-verdict.test.mjs`
- `scripts/impact-matrix.mjs`
- `scripts/impact-matrix.test.mjs`
- `scripts/live-qa-validation.mjs`
- `scripts/live-qa.mjs`
- `scripts/live-qa.test.mjs`
- `scripts/live-runtime-proof.mjs`
- `scripts/live-runtime-proof.test.mjs`
- `scripts/test-fixtures/live-evidence.mjs`

删除（4，原内容/模式可从原基线恢复）：

- `scripts/codex-browser-qa.mjs`
- `scripts/codex-browser-qa.test.mjs`
- `scripts/ego-browser-qa.sh`
- `scripts/ego-browser-qa.test.mjs`

## 未完成项与责任

- 主理人：派独立 QA 检查当前树、精确 final-delivery SHA 与同 run 证据；通过后另行安排全局 AGENTS 一条规范切换。实施者不自行放行或写 `qa:pass`。
- 本任务没有产品 Client、模型、Electron-only 行为更改；不要求额外模型调用或 Electron 实测。没有执行远端 GitHub Actions，也没有共享 Dev/生产验收；不得将本地 `test:ci` 写成远端 CI 绿灯。
- 未合并任务树、恢复分支、旧/新证据与 L2 profile/Host 保留给独立 QA；ego task 验收后关闭。不得调用 ship/clean 去合并或销毁未合入现场。
- 本报告验证面是本次精确 fetch 的 base→本地 target；之后的远端新提交不自动纳入已验证范围。
