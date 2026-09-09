---
title: "文档治理新基线独立 QA"
id: "evidence-docs-governance-aligned-qa-2026-09-09"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-09-09"
updated: "2026-09-09"
authors: ["Edward — independent QA"]
---

# 文档治理新基线独立 QA

## 结论与身份

- **增量审查 PASS；完整验收 NOT PASS / coverage blocker。** 本报告作者不是这 15 个增量文件的实施者。`accepted` 仅表示保存证据，不表示完整门禁或合入放行。
- 目标：独立核对新规范对齐、脚本说明准确性、Alpha 真实 Git fixture 与离线检查，不修改实现，不扩展既有问题调查。
- 固定 base = head：`727e8c9c973ec0527ab2cc820231ae9558743825`。树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-docs-governance-aligned`；分支 `agent/cross-docs-governance-aligned`。实际测试输入为此 HEAD 加下列 15 个未提交作者文件，不是 clean HEAD。
- 执行：2026-09-09 17:07–17:17 Asia/Shanghai；macOS，本机 Node `v25.8.0`，现有 yaml `2.9.0`、acorn `8.15.0` 只读解析。无共享依赖安装、purge、远端、commit、merge、deploy、App 物化或浏览器操作。
- 作者 tracked diff SHA256：`f82402197c04f18212cb535587311828a9597afa3085677f22cd4d79ca53be68`。逐文件 SHA256/POSIX mode 清单：任务内 `deliverables/cross-docs-governance/qa/author-before.json`，自身 SHA256 `0f163783115fc2299415987c69083ef5eda75e5d32d079ed82ac44b85ae2deeb`；15/15 前后未变。报告是唯一新增正式 QA 文档，其他产物均位于 ignored deliverables。
- 读取 `alignment-manifest.md`、`alpha/author-check.md`、`alpha/result.json` 与 `alpha/run.mjs`；作者 12/12 仅用于理解环境，本报告另行执行。旧树 `cross-docs-governance` 的 QA 报告、旧 base `867b192…` 与旧数字**仅属历史，不是新基线证据**；本轮未操作旧树。

## 作者增量路径

1. `.agents/skills/omnimux-repo-workflow/SKILL.md`
2. `docs/README.md`
3. `docs/contracts/README.md`
4. `docs/contracts/docs-governance-standard.md`
5. `docs/contracts/model-capabilities-matrix.md`
6. `docs/contracts/settings-ui.md`
7. `docs/decisions/2026-08-21-gxgen-capability-plugin.md`
8. `docs/decisions/README.md`
9. `docs/implementation/issue-764-audio-waveform.md`
10. `docs/qa/issue-764-audio-waveform-qa.md`
11. `docs/standards/dev-app-cdp-acceptance.md`
12. `scripts/doc-index-gen.mjs`
13. `scripts/doc-lint.mjs`
14. `scripts/omnimux.mjs`
15. `scripts/sync-release-policy.test.mjs`

## 独立执行结果

| 检查 | 实际命令 / 入口 | 结果 |
|---|---|---|
| Alpha 定向 Round 1 | `node --test scripts/sync-release-policy.test.mjs`，由任务内 `qa/run-alpha.mjs` 隔离环境 | exit 0；12 tests、12 pass、0 fail、0 skipped；17:10:19–17:11:15 |
| 严格模型契约 | `node scripts/verify-model-contracts.mjs --strict`，等价 package script，避免 pnpm 自动环境动作 | exit 0；mode=strict、ok=true、admission errors/warnings=0/0；runtime 67、contract 48、missing 19，dispositions unresolved=0；61 listed operations。missing 不是隐去的零缺口，也不是在线生成证据 |
| 安全 gates 子集 | `node --test scripts/impact-matrix.test.mjs scripts/authorization.test.mjs scripts/qa-label.test.mjs scripts/ci-verdict.test.mjs` | exit 0；57 tests、57 pass、0 fail、0 skipped；**不是完整 test:gates** |
| metadata/link/anchor/保护比对 | `node deliverables/cross-docs-governance/qa/static-check.cjs` | exit 0；11 Markdown/skill 元数据、106 相对链接目标、1 实际 anchor；9 保护文件与基线一致；历史正文、Wait/resume 至文末与 #864/L2 索引保留 |
| 四脚本语法 | 对三说明脚本及 Alpha test 分别 `node --check <path>` | 均 exit 0 |
| whitespace | `git diff --check` | exit 0 |
| 新基线/current doclint | 原版 `node scripts/doc-lint.mjs` 分别从最小导出与当前树运行 | 均 exit 1；下节给逐 diagnostic 差异，不包装成 lint PASS |

Alpha 的 HOME/TMPDIR/XDG cache/data/config/npm cache/pnpm store/home 均在当前任务 `qa/` 下；只复用当前树 `alpha/corepack` 的 pnpm 11.7.0 缓存，网络/auto-pin 关闭，清除继承 GIT_/OMNIMUX_，Git global/system 配置禁用。合成 fixture 可安装其本地依赖，未向真实 Dev/Prod 写入。safe gates 使用同一任务 HOME/TMPDIR 与禁用全局 Git 配置；gh 调用只进入测试 fake/injected seam。

原始日志和回执：`deliverables/cross-docs-governance/qa/alpha.log`、`alpha-result.json`、`models.log`、`gates-subset.log`、`static.json`、`doclint-base.log`、`doclint-current.log`、`doclint-comparison.json`。这些 ignored 产物保留在任务树供本地复核，未 force-add，不声称自动进入提交。

## Doclint 新基线逐 diagnostic 对比

使用 `qa/doclint-compare.mjs` 从固定 Git 对象导出 docs 全部 660 个文件及 lint 所需最小脚本/引用文件集合；合计 721 文件、33,383,235 bytes。无整仓复制、依赖复制、真实文件替换或 reset；原 lint 未改行为、未执行索引生成。所有当前/基线 diagnostic 按完整文本和重复数量比较，数组完整保存在 JSON。

- 最小导出原始运行：**419 errors / 32 warnings**，exit 1。
- 当前真实树原始运行：**412 errors / 32 warnings**，exit 1。
- 新增 diagnostic：**0**；warning 集合不变。
- 原始减少 7 条中有 **4 条位置伪差异**：未变文件 `docs/specs/2026-09-08-skill-workshop/prd.md` 的 `../../../../../tmp/skill-workshop-demo.html`（3 链）和 `../../../../../.workbuddy/skill-workshop-prd.md`（1 链）。固定 SHA 与当前该文档逐字一致；当前位置只读 `existsSync` 为真，最小导出移位后为假。未复制这些仓外文件、未改外部目录、未改 lint 或 mock 文件系统。它们不能算本次修复。
- 在同一外部链接位置事实下，基线可比诊断数为 **415 errors / 32 warnings**（分析归一值，不伪称原始运行值）；本增量实际消除 **3 errors**：两个 issue-764 文档缺 Frontmatter，以及 CDP 参考文档非法 `type: standard`。
- 当前 412 errors/32 warnings 仍为已存在的全仓债务，本轮不扩大整改；没有引用旧 867 基线统计。

## 审查要点

1. **规范**：合入前相关自动化/静态与独立评审，无独立 pre-merge runtime；合入后 runtime 适用才 materialize main 到 Dev。pure docs/process/scripts 不物化。SOP、#864、L2 ADR superseded 边界保留；QA 历史报告未知 SHA/dirty/退出码不以本次身份回填。
2. **模型**：对照 `plugins/omnimux/src/catalog/contract/status.js` 的 normalize/materialize/profile/listed 实现，五项准入以 implementation ready 而非历史 execution.live 为前提；profile 自身 live、operation/output/seam/slotRoles 要求保留，model/op defaults 描述一致。未调用真实模型 API。
3. **Settings**：Accounts/Inspiration `:library` IDs 在当前源码存在；一级页使用 Workbench Tabs，Settings 排序不外推到 Tabs；secret 域边界不变。仅静态事实，不声称 UI runtime 验收。
4. **三说明脚本**：逐 hunk 人工审查并用 Acorn AST/token 比对；doclint/index 排除 console 输出后 AST 相同，omnimux 除帮助 template 文案外 token 相同。目录扫描、退出码、写入行为均未改。doc:index 仍覆盖七子目录索引，因此未在真实树运行。
5. **Alpha**：真实 Git init/main/clean/HEAD=origin/main/realpath 断言；alias 与 mixed 保留上游 ROOT/plugins、sync-main.sh 与初始化时序；dirty/feature/ahead 负例分别断言 exit 1、相应诊断和 HOME 空目录。功能 fakeGitPath 用例不作为真实 guard 证据，mixed 下游捕获也不等于真实安装验收。
6. **生产保护**：sync-main.sh、sync-stable.sh、sync-to-app.sh、sync-fixtures.test.mjs 与固定 base 一致；未改 guard 或任何 skip/ceiling。

## 未覆盖项、路由和下一 owner

- **完整验收 NOT PASS / coverage blocker**：按任务已给定的新基线事实，guard 的 ceiling 17/17 不覆盖真实 nonGit；生产 guard 未修改。本轮没有重复该调查，也未运行 full gates 来制造假绿。Alpha 三个真实 Git 负例不是 nonGit 覆盖替代。
- full `pnpm test:gates` 未执行：其聚合包含 guard、sync 安装与其他广泛子套件；限定选择上述安全子集，避免共享物化/费用副作用，不修改 skip 或扩大边界。required CI/Merge Queue 未执行、无远端授权。
- App/ego/CDP/Dev/Prod runtime 为本次纯文档/说明/fixture 变更不适用；不是 PASS。没有 pre-merge runtime。
- 新增缺陷：未发现。增量 Routing Decision：**NoOne**。既有 coverage blocker 的后续 owner：主理人安排独立的 gate/Backend owner 在另行授权范围修正真实 nonGit 覆盖，再进行完整验收；本轮不改它。
- 文档影响：新增本报告记录新基线独立证据和限制；作者 15 文件全部保留。当前本地 QA 成果可交付，但**不具完整验收/合入放行结论**。

## 2026-09-09 18:02–18:06 补充独立复核：最新 main、完整 gates 执行边界

**结论仍为 NOT PASS / coverage 与执行边界阻塞，不可据此合入。** 用户已授权主理人提交/PR/合并收尾，但不准绕检查、外部 nonGit 写入仍拒绝；本 QA 仅追加报告及 ignored 本地证据，不执行 staging/commit/push/远端写入。

### 最新 base 集成清单

- 实际读取任务 HEAD `727e8c9c973ec0527ab2cc820231ae9558743825`，已 fetch 的 `origin/main` 为 `ad4906d0777acffc7c7606687f8d0cac1d4825bc`；未自行 fetch/移动 ref。目标仍是 HEAD + 15 个作者 dirty 文件，不是最新 main 的集成树。
- upstream 相对固定 base 改变 128 个路径，与 15 个作者路径交集仅 **2 个**。对两个文件执行 `git merge-file -p <local> <base> <latest>`；三个输入与输出仅存 ignored `.log` 文件，没有写 Git 对象/index 或作者文件。两个退出码均 0，**无文本冲突**，不等于已 rebase 或集成测试通过。
- `docs/contracts/README.md`：保留最新 main 新增的 `workflow-app-boundary.md`、`ai-app-ui-spec.md` 两个索引行，同时保留本地治理/Settings 摘要调整。三方合并输出 SHA256 `983ef9ebba17672e96b90bd31b39e5410295424fa17e033b1577113f9d8f87b0`。
- `scripts/sync-release-policy.test.mjs`：最新 main 为 Alpha 名单断言增加 `omnimux-forms`；本地修改真实 Git fixture 与三个拒绝用例。必须保留双方变化，不能以本地整文件覆盖 main。三方合并输出 SHA256 `c776564f29c8035836281fe27ee7baf58736aeafc05d4e6ee190463a59e8c0b1`。
- 另有**语义耦合**：最新 main 修改 `plugins/omnimux/src/plugin-lifecycle.json` 和 `docs/contracts/alpha-release.md`；旧树 Alpha 12/12 不证明新名单上的集成测试通过。主理人完成集成后需验证 Alpha 定向测试。
- `package.json`、`.github/workflows/`、`scripts/guard-worktree.mjs`、`scripts/guard-worktree.qa.test.mjs`、`sync-main.sh`、`sync-stable.sh`、`sync-to-app.sh` 在固定 base 至最新 main 间无变化（`git diff --quiet` exit 0）。
- 证据：`deliverables/cross-docs-governance/qa/integration-review.log`、`integration-0-merged.log`、`integration-1-merged.log`。

### 完整 test:gates：未启动，不能声明完整运行或通过

读取 package.json 第 50 行全部 14 个顶层测试入口，并追踪 `verify-ci-gates.test.mjs` 的嵌套入口后，发现仅配置任务 TMPDIR/HOME 仍存在确定的越界写入：

1. `ego-live-qa.test.mjs` → `ego-qa-test-helpers.mjs` → `ego-live-qa.mjs:55` → `ego-task-lock.mjs:5–18`。锁路径硬编码 `/tmp/omnimux-ego-<uid>/<sha256(taskId)>`，明确不遵从 TMPDIR；会 mkdir/write owner.json，释放时 unlink/rmdir。测试 `ego-live-qa.test.mjs:116–129` 还硬编码同一路径覆盖 owner.json 并递归删除锁目录。因此原样完整入口不能限制在当前任务 ignored 范围；本轮未运行此链、未修改锁路径、未 mock FS 或 skip 用例。
2. 嵌套 `simulate-multi-agent-lifecycle.test.mjs:53–67` 在当前真实 `scripts/.lifecycle-fixture-<pid>` 创建 Git fixture，亦不随 TMPDIR，超出本轮只允许 QA 报告与 ignored logs 的写范围。即使最终 finally 清理，也不是零写入。
3. `sync-repeat-install.test.mjs` 本身使用 TMPDIR 下的独立 HOME/profile/store、离线本地依赖及 fake Git，非真实 Dev；这并不能消除聚合中上述其他子进程写入。现有任务内 pnpm 缓存可复用，但缺依赖不是本轮完整入口的首要阻塞。

因此没有发出 `pnpm test:gates` 或其完整等价 `node --test ...`，完整 tests/pass/fail 数为 **N/A（安全预审阻止启动）**，不能写成 0 fail、部分通过或完整失败运行。未新建复杂环境，不部署、不触碰真实 Dev/Prod、不 purge，不建议用户已拒绝的外部临时目录。审查发现确定越界后未继续穷尽所有嵌套动作；这是一项充分阻塞，不声称其余子链全部安全。

### ceiling 假覆盖的当前实证

- 新执行一次原版 `node --test scripts/guard-worktree.qa.test.mjs`；HOME/XDG_CONFIG_HOME 在现有任务 `qa/home`，TMPDIR 指向现有 ignored `qa`（不含临时豁免目录段），清除继承 GIT_/OMNIMUX_，不改源码。结果 **exit 0，17 tests / 17 pass / 0 fail / 0 skipped**。原始完整输出：`deliverables/cross-docs-governance/qa/guard-ceiling-recheck.log`。这是定向复核，不是完整 gates。
- 同一个任务内 plain/home 路径：带 `GIT_CEILING_DIRECTORIES=<qa>` 的 Git discovery 为 exit 128 + 精确 not-a-git-repository；去掉 ceiling 则 exit 0，发现本任务 linked worktree。生产 `guard-worktree.mjs:183–198` 会清除所有 `GIT_`，测试 fixture 的 ceiling 不能穿透到生产 discovery。
- 对同类 `.agents/skills/fixture/scripts/missing/target.py` 调用原版导出的 `decideWrite`，实际得到 `allow / reason=worktree-isolated`，走 `325–343` 的早返回，未到 `gitFileState` 的 `non-git-target` 分支。该调用仅分类，不实际写入目标。
- 因此当前 **17/17 仍不是“真实 nonGit 已覆盖”**。这不是仅凭历史报告的猜测；本轮对当前源码与当前树复核成立。`hasNoGitMetadata` 还会向上看到本树 `.git`，单靠 ceiling 不可能提供真实无 Git 祖先状态。真实仓外 nonGit 测试未执行，授权边界不变。

### CI / 合入 / draft 状态

- 仓内当前唯一 workflow `.github/workflows/quality-gate.yml` 监听 PR/main/merge_group；job 名称 `Static L0 QA & Tests`，先清理旧 qa:pass，再执行 diff-aware QA、回归、严格模型契约及其他任务，最终由 `ci-verdict.mjs` 聚合投影标签。该 YAML 不直接运行完整 `test:gates`，CI 绿色不能补足本地完整门禁义务或 nonGit 覆盖。
- 未查询/验证 GitHub 实时分支保护 required-check 名单、PR head 的运行结果或 Merge Queue 状态；YAML 中的 job 名不是实时保护规则完整性证明。不得自打 qa:pass、放宽 required 或以本报告替代 required CI。
- **当前不可合入。** 新证据没有解除既有 NOT PASS，另确认完整入口的授权执行阻塞。可由已获授权的主理人保存提交并创建明确标注 NOT PASS/阻塞的 draft PR；draft 是保存/评审状态，不是 QA 放行，也不能因自动 CI 绿灯转为可合入。QA 未执行任何提交或远端动作。
- 下一 owner：主理人保留两个三方合并结果与最新 Alpha 名单，完成实际集成；gate/Backend owner 在另行明确的源码修改范围内解决测试隔离与真实 nonGit 验证问题。当前 QA 不改测试/生产 guard，不扩展外部写权限。之后按最终集成 head 完成必要完整 gates、定向 Alpha、required CI、独立验收及 Merge Queue。
- 本轮 `git diff --check` exit 0；作者 tracked diff SHA256 仍为 `f82402197c04f18212cb535587311828a9597afa3085677f22cd4d79ca53be68`，与原报告一致。原报告既有 12/12 Alpha、57/57 子集、模型 strict、doclint 412 errors/32 warnings 仅保留原运行身份，本轮不伪称重跑或最新 main 结果。Routing Decision：**Known Issues / gate Backend owner**。
