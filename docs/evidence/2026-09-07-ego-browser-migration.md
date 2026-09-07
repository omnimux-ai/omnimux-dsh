---
title: ego-browser 迁移实施与验证报告
id: evidence-ego-browser-migration
type: evidence
status: draft
authority: L2
date: 2026-09-07
updated: 2026-09-07
authors: [agent]
subsystem: qa
---

# ego-browser 迁移实施与验证报告

## 结论与交付边界

- **固定基线实现自检 IS_PASS: YES**：唯一 ego 执行路径、严格消费者、认证和失败语义已实现；完整门禁 70/70、消费者回归 11/11、真实隔离 L2 assets 共享探针通过。
- **整体迁移闭环 IS_PASS: NO**：当前 main 并行推进，#702 重构了 CI/流水线消费者；本树尚未整合该新版，独立 QA 和共享用户规范修改尚未执行。不得直接以本树旧版文件覆盖新治理。
- 交付为本机隔离树未提交 diff；无 push、PR、merge、共享 Dev 物化、生产变更或账号任务。未修改官方 DSH、其他仓库源码或共享 `/Users/x/.codex/AGENTS.md`。
- 主理人下一步：固定本地交付快照，整合最新 main 的实际消费者、重跑测试与 L2，再派独立 QA；共享用户规范由主理人另行安排。

## 精确源码身份

| 项 | 值 |
|---|---|
| 仓库 | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh` |
| 实施树 | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-browser-ego-migration` |
| 分支 | `agent/common-browser-ego-migration` |
| base / HEAD | `3054947b58c9438495bea47e143dc8805139f3b1` |
| dirty | 是；未创建提交 |
| 交付时本地 origin/main | `57f63a709a41124b8dcd199ce61fae3b94e74754`，比本树多两个提交 |
| 相关治理提交 | `aecf3de92916812d31252b79ed6310694e20130d`（#702） |
| 实现快照 SHA-256 | `030553b24293aafbfce1677539b4a74c3ee388a64e3435c115d20fce8338a89e` |

快照算法：合并 `git diff --name-only HEAD` 与 `git ls-files --others --exclude-standard`，排除本报告，按路径排序，依次 SHA-256 更新 `path + NUL + 文件原始字节（删除文件为 DELETED）+ NUL`。运行证据与依赖目录为 ignored，不在该快照内。

`git-wt.sh start common browser-ego-migration` 采用项目既有旁目录工作树；未移动运行中的树。该路径与通用 worktree-ops 内聚目录建议不一致，保留给主理人处理，未扩展修改工作树基础设施。

## 实现与保留的不变量

- `live-qa.mjs` / `agent-live-qa.mjs` 保持请求准备入口；CLI pending 为退出码 2，不自动宣称成功。
- `ego-live-qa.mjs` 是唯一正式执行模块，接受公共 ego helpers 适配页，不引入私有 transport、Playwright 或新浏览器框架。
- 原 `runStageProbe` 不改；`captureRuntimeProof` 仅更换 CDP accessor 与提示，指纹解析/唯一注册/前后稳定性算法保持。
- `runId`、SHA、目标 URL、profile、L2 Host PID/启动时间、allocation、task/tab 均绑定；报告前后身份必须一致。
- 页面准备最多两次同源只读认证检查；仅精确认证页且已有 Cookie 有效时允许一次内部同源导航。
- 正式 L2 登录读取当前 Host 最后一条有效 `dsh web:` 链接，先后核验 Host，只在内存执行一次 token→Cookie 交换；token、Cookie、脚本源码不进入证据。
- 准备失败不消费、不覆盖 canonical pending 或赢家报告；正式探针失败保留真实 `consumedAt`。请求排他消费和 task 排他锁均保留。
- 策略、接管、身份、传输或超时异常锁住适配页；迟到 guard 不再调用后续 helper。锁释放失败仍保存已消费失败报告，且不擅自清除新 owner。
- PNG 必须 CRC 解码；旧 `codex-iab`、缺 task/tab、错 Host/allocation、旧运行指纹均被严格消费者拒绝。
- 旧 IAB 执行器和弱 ego shell collector 删除；历史证据不重标。删除前已核对可达 Git 内容和模式，无冗余备份。

## 真实能力与 L2 验收

### 能力探测

- ego task `533`，Dev tab `166BB4EDCEAA4930AFDDBBA3B399EEA2`、L2 tab `92377B4CDDFFA5E25E021748CB152B23` 跨 heredoc 稳定。
- Dev `45120`：CDP `Debugger.scriptParsed`、`Debugger.getScriptSource` 可用；26–27 个 parsed events；PNG 3456×1746，202839 bytes，CRC 解码通过。
- 新适配器 L2 能力探测排空 26 个事件并读取两个同源脚本；正式 L2 登录返回 ready，报告不含 token。
- 证据目录：`.workbuddy/evidence/ego-capability/`，含 `dev-capability.png`、`adapter.json`、`l2-login.json`、`l2-adapter.png`、`runtime-proof.json`。

### 共享 Stage 验收

| 项 | 最后完整 Stage run |
|---|---|
| runId | `0a4438f9-b028-426d-b1e7-dbc6104e78b9` |
| URL / Stage | `http://127.0.0.1:44201/` / `assets` |
| profile | `omnimux-dev-browser-ego-migration` |
| profileDir | `/Users/x/.dsh-dev/tasks/browser-ego-migration/profiles/omnimux-dev-browser-ego-migration` |
| linked plugin | `omnimux-assets`，唯一在研 link |
| Host | PID `60081`，启动 `Mon Sep 7 14:58:11 2026`，port `44201` |
| task / tab | `533` / `92377B4CDDFFA5E25E021748CB152B23`，前后相同 |
| consumedAt | `2026-09-07T07:37:43.431Z` |
| 断言 | 6/6：active content/selection、幂等打开、chat 清选、恢复、原会话恢复、原工作台恢复 |
| runtimeProof | hub 唯一 normalized registration；assets 唯一 raw registration；前后稳定 |
| PNG | 3808×1826，155573 bytes，CRC 解码通过 |
| PNG SHA-256 | `976341f7bb50c9b02ff1225fe804b160a0ec7e343be0021b2f99770dd2f0f6db` |

完整报告、已消费请求和 PNG 位于 `.workbuddy/evidence/live-qa/0a4438f9-b028-426d-b1e7-dbc6104e78b9/`；canonical 摘要为 `docs/evidence/live-qa-report.json`。先前 run `a8688bf2-f78a-41d9-a71d-7a4226d08bf2` 也通过，单独保留，未复用旧证据充当新 run。

实际 UI 使用页内目录选择器绑定本任务 worktree，创建空白 QA 会话；未发送消息、触发媒体生成或账号动作。最终 Stage run 之后仅增加迟到 guard 停止检查及两项回归；新增 guard 已在真实 L2 身份/认证 ready 检查和 70 项门禁中执行，未声称再次完成全 Stage run。

独立最终 heredoc `completeTaskSpace(533, { keep: false })` 返回 `done: true`，浏览器任务已关闭。L2 Host/profile 与未合并 worktree 为独立 QA 保留；主理人复验完后通过既有 dev 生命周期入口停止，不手动杀其他任务进程。

## 检查、退出码与失败记录

最终 required 命令（保持门禁本体，不 skip）：

```sh
PATH=/Users/x/.nvm/versions/node/v25.8.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin \
COREPACK_HOME=/Users/x/.cache/node/corepack COREPACK_DEFAULT_TO_LATEST=0 \
pnpm_config_verify_deps_before_run=false corepack pnpm test:gates
```

| 命令/检查 | 结果 |
|---|---|
| 上述 `pnpm test:gates` | exit 0；70 pass / 0 fail / 0 skip；`test-gates-hardened.log` |
| `node --test scripts/auto-pipeline.test.mjs` | exit 0；11 pass / 0 fail / 0 skip；`consumer-tests-final.log` |
| `node --test scripts/live-qa.test.mjs`（链接后） | exit 0；11/11；`live-qa-tests-linked.log` |
| `node scripts/agent-live-qa.mjs assets --target=l2 --url=http://127.0.0.1:44201/` | exit 2，准备请求；符合合同，不是失败或 PASS |
| ego heredoc 内 `runPreparedQa` | 命令 exit 0；两次返回 completed/pass true；六项断言全通过 |
| 实际 run 经 `validateBrowserEvidence` 重验 | exit 0；pass true / errors=[] |
| 真实 PNG `assertPng` 与 SHA-256 | exit 0 |
| `git diff --check` | exit 0 |
| 18 个新增/修改 mjs 的 `node --check` | exit 0；新增模块均小于 300 行 |
| 变更 Markdown 相对链接检查 | exit 0；最终 116 个、0 断链 |

失败记录均保留于 `.workbuddy/evidence/ego-capability/`，没有删除红灯后只展示绿灯：

1. 首次 L2 start exit 1：Host 未在 20s 监听，脱敏诊断为未构建 assets client bundle；构建本任务 assets 后通过正式入口重试 exit 0。构建 task hub 仅供严格磁盘/运行注册比对，无 client 源改动。
2. worktree 依赖初始不足、共享 node_modules 链指向另一已清理工作树：仅在本任务链接已有固定版本依赖和各插件 node_modules。无新包安装、无主仓依赖修改。
3. 初次 DSH `pnpm test:gates` wrapper 运行出现依赖缺失并长时间运行，保存日志后终止 `bash-42`；状态 killed，不算通过。
4. 原生 Corepack 首轮 exit 1（59/68）：当时缺 React 链、PATH 未带 `/usr/sbin/lsof`，既有 Alpha 夹具在临时 HOME 触发 Corepack 查 latest 遇 `ECONNRESET`。
5. 使用已有依赖、完整 PATH 和固定现有 Corepack cache 后完整门禁先 68/68 exit 0；补充迟到 guard/锁释放回归后最终 70/70 exit 0。未改 Alpha 夹具、未忽略依赖、未修改相关 gate 断言。

本任务没有产品 UI/client、模型或 Electron 行为变更；不发模型调用，不以 Electron 替代 Web，也不要求额外 Electron 运行验收。独立 QA 尚未执行，最终 main 集成后的 required checks 尚未执行。

## 完整文件清单

新增：

- `scripts/ego-browser-page.mjs`
- `scripts/ego-browser-page.test.mjs`
- `scripts/ego-live-qa.mjs`
- `scripts/ego-live-qa.test.mjs`
- `scripts/ego-qa-test-helpers.mjs`
- `scripts/live-browser-utils.mjs`
- `scripts/live-page-preparation.mjs`
- `scripts/live-page-preparation.test.mjs`
- `scripts/live-qa-request.mjs`
- `docs/specs/2026-09-07-ego-browser-qa.md`
- `docs/evidence/2026-09-07-ego-browser-migration.md`（本报告）

修改脚本/入口：

- `scripts/auto-pipeline.mjs`
- `scripts/auto-pipeline.test.mjs`
- `scripts/auto-qa-gate.mjs`
- `scripts/ci-verdict.mjs`
- `scripts/live-qa-validation.mjs`
- `scripts/live-qa.mjs`
- `scripts/live-qa.test.mjs`
- `scripts/live-runtime-proof.mjs`
- `scripts/live-runtime-proof.test.mjs`
- `package.json`
- `.github/workflows/quality-gate.yml`

修改规范（仅浏览器义务、入口和历史 superseded 标记）：

- `AGENTS.md`
- `.agents/skills/omnimux-repo-workflow/SKILL.md`
- `.agents/skills/omnimux-rc-upgrade/SKILL.md`
- `docs/contracts/plugin-qa.md`
- `docs/contracts/agent-issue-lifecycle.md`
- `docs/contracts/generation-node-policy.md`
- `docs/contracts/node-input-submission.md`
- `docs/design/2026-09-issue-504-shelf-unify.md`
- `docs/references/omnimux-gemini-3.8-contract-gap.md`
- `docs/specs/2026-09-05-builtin-browser-qa.md`
- `docs/specs/2026-09-05-plugin-suite-refactor-plan.md`
- `docs/specs/2026-09-05-workbench-panel-containing-block.md`
- `docs/specs/2026-09-06-composer-single-click.md`
- `docs/specs/2026-09-06-node-input-submission-prd.md`
- `docs/specs/2026-09-06-workspace-directory-browser.md`
- `docs/specs/README.md`

删除（可从 base 恢复精确内容和模式）：

- `scripts/codex-browser-qa.mjs`
- `scripts/codex-browser-qa.test.mjs`
- `scripts/ego-browser-qa.sh`
- `scripts/ego-browser-qa.test.mjs`

## 相对契约偏差与后续责任

1. **新基线整合未完成**：实际重叠 `.github/workflows/quality-gate.yml`、`package.json`、`scripts/auto-pipeline.mjs`、`scripts/ci-verdict.mjs`。#702 还新增拆分入口与标签/impact 治理，不能只 cherry-pick 旧提示词；由主理人安排适配最新实际执行链。
2. **未提交 diff 而非固定 PR 提交**：本报告明确 HEAD、dirty 与内容快照；正式集成/提交后须更新 L2 绑定并重新生成证据，不能沿用此 run 作为新 SHA 的验收。
3. **独立 QA 未执行**：本报告是实施者自检，不授予 `qa:pass` 或合入权限。
4. **共享规范未修改**：全局 `/Users/x/.codex/AGENTS.md` 的 Codex IAB 行仍待主理人授权流程中的后续 worker 处理；本仓规范已迁移。
5. **资源保留**：L2 44201/profile、空白任务会话、任务 worktree 和 ignored 证据保留以便复验；ego task 533 已完成并关闭。未合并源码不得物化共享 Dev。
