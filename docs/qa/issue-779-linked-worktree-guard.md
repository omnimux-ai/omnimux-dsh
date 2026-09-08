# Issue #779 — 独立 QA 报告

## 结论

- Routing Decision: **NoOne**。本次范围内未发现需 Engineer 修复的源码缺陷；候选脚本可进入主理人后续交付/生效验证，不代表 hook 已生效或 Issue 已关闭。
- 独立定向测试：**30 total / 30 passed / 0 failed / 0 skipped**，第一轮通过，无第二轮测试必要。
- 覆盖率：未运行行覆盖率统计，不虚报百分比；下列行为矩阵均有实测或明确标明的静态证据。
- QA 仅新增 `scripts/guard-worktree.test.mjs` 三项边界测试及本报告；未改源码、lifecycle 测试、hook 配置、主树、sidebar、App、安全配置，未 push/merge/创建 PR。

## 审查面与证据身份

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/linked-worktree-guard-779`
- Base 与 HEAD：`580234923268673562cacb5cd01aebdb780339e1`；target 为此 HEAD 上的未提交 diff（非远端 PR）。按固定本地范围审查，未 fetch/切分支。
- 分支：`agent/common-linked-worktree-guard-issue-779`。
- 完整读取工程报告 [implementation](../implementation/issue-779-linked-worktree-guard.md) 全部 60 行；读取三个改动文件、完整源码 diff，以及 gates 的调用入口。
- 原生 Node：`/Users/x/.nvm/versions/node/v25.8.0/bin/node`，v25.8.0。
- QA 后 SHA256：
  - `scripts/guard-worktree.mjs`: `3fceb97f2dae3dbe0e5dc219fe92d009d617136c3d36da844b93fb8504d99c80`
  - `scripts/guard-worktree.test.mjs`: `606724752b335168086a8dd3d56069773b408b1b29c89e2201083c3d579a212d`
  - `scripts/simulate-multi-agent-lifecycle.test.mjs`: `5f45d53ba8516e3bc632572659f2909ca389de42549b2ec5e767132c93264e9b`

## 边界结果

| 行为 | 结果与证据 |
| --- | --- |
| 同仓/外仓真实 linked worktree，tracked 与深层新文件 | allow；真实 Git fixture，非路径名字模拟 |
| 主 checkout 在 main、非 main、detached | tracked 与受保护新源码 deny；后两种仅切换 disposable fixture，不切真实主树 |
| detached linked worktree、带空格目录、旧命名真实 worktree | allow，分支/名字不是豁免条件 |
| 假名目录、复制 gitfile、缺失 registry 指针、假 .git | 不获得 worktree 豁免，受保护目标 deny |
| linked tree 内真实 nested primary repo / malformed nested .git | QA 新增回归通过；nested 主仓 tracked、新源码 deny，malformed marker 不继承外层豁免 |
| symlink 别名指向 worktree | allow |
| 文件/目录 symlink 回同仓或外仓 primary、新文件逃逸、dangling link | deny；canonical target 在临时/忽略豁免之前判定 |
| Git 不存在、exit 42、exit 128 | linked exemption 不成立，受保护目标 deny |
| 环境 Git 重定向 | 原有 GIT_DIR/WORK_TREE 测试通过；QA 新增 COMMON_DIR、INDEX_FILE、CEILING_DIRECTORIES、非法 CONFIG_COUNT 组合，主树 deny / 外仓 linked allow |
| ephemeral / gitignored / 非保护草稿 | 既有 allow 契约保留，未全局关闭保护 |
| bash 破坏性命令与未推送提交 | destructive pattern 与真实本地 fixture 的 deny JSON 通过；提交和文件保留 |
| PreToolUse 协议 | 输出 JSON permissionDecision、hookEventName 测试通过；不是依靠进程 exit code 阻断 |

实现使用 canonical target、gitDir/commonDir 区分、gitfile/backlink 双向验证及精确 NUL registry 条目；没有新增依赖/配置系统。嵌套 marker 检查有针对 Git 忽略损坏 marker 的回归价值，不建议再扩展为通用文件系统沙箱。bash 差异仅明确保留环境参数；原有识别规则、上游错误处理与命令执行边界未扩大。

## 真实 sidebar 只读验证

Git 查询命令（每条 exit 0）：

```sh
git -C /Users/x/Desktop/Project/dsh-plugin/personal/dsh-better-sidebar/.worktrees/issue-1-html-preview rev-parse HEAD
git -C /Users/x/Desktop/Project/dsh-plugin/personal/dsh-better-sidebar/.worktrees/issue-1-html-preview rev-parse --absolute-git-dir
git -C /Users/x/Desktop/Project/dsh-plugin/personal/dsh-better-sidebar/.worktrees/issue-1-html-preview rev-parse --path-format=absolute --git-common-dir
git -C /Users/x/Desktop/Project/dsh-plugin/personal/dsh-better-sidebar/.worktrees/issue-1-html-preview worktree list --porcelain
```

- HEAD：`6fbfeedc0189e95a1c4d3908d3a58c784c5b7f15`；registry branch `fix/issue-1-html-preview`。
- gitDir：sidebar `.git/worktrees/issue-1-html-preview`；commonDir：sidebar `.git`。
- 以 OmniMux main 为 session cwd，调用候选 `decideWrite({ toolName: 'write', cwd, filePath })`：
  - sidebar linked `src/html-preview-resource.ts` → allow / worktree-isolated；**该文件目前不存在**。
  - sidebar linked `package.json`、`src/qa-nonexistent/deep.ts` → allow / worktree-isolated。
  - sidebar primary `package.json`、OmniMux primary `package.json` → deny / tracked-file。
  - OmniMux primary `scripts/qa-nonexistent/deep.mjs` → deny / untracked-protected-scope。
- 六项断言和 `isWorktreePath` 断言的只读 Node heredoc 探针 exit 0。未真正调用 write/edit，未创建 sidebar 目标。
- sidebar package.json 前后 SHA256 相同：`710fa384c7692d2edddb62341bc49d3dca14ec0ab4d9dd9585e4e9b80411e9bc`；目标文件前后均不存在。

## 测试命令与退出状态

本轮定向命令，exit 0，4.13 秒：

```sh
PATH=/Users/x/.nvm/versions/node/v25.8.0/bin:$PATH /Users/x/.nvm/versions/node/v25.8.0/bin/node --test scripts/guard-worktree.test.mjs scripts/simulate-multi-agent-lifecycle.test.mjs
```

完整 gates：**复用工程报告 128/128、exit 0、223 秒的证据，不声称本轮重跑**。已核实 package.json:48 的原命令完全相同，verify-ci-gates.test.mjs:122–137 将 guard/lifecycle 作为嵌套测试调用。QA 没有修改任何生产实现或其余 gate，新增的 guard 测试已独立通过，因此不重复整套耗时 gates：

```sh
node --test scripts/impact-matrix.test.mjs scripts/authorization.test.mjs scripts/qa-label.test.mjs scripts/ci-verdict.test.mjs scripts/verify-ci-gates.test.mjs scripts/live-qa.test.mjs scripts/ego-browser-page.test.mjs scripts/live-page-preparation.test.mjs scripts/ego-live-qa.test.mjs scripts/live-runtime-proof.test.mjs
```

历史 pnpm 自动 bootstrap 的 workspace relative ui-kit 依赖失败和 Electron/corepack 路径失败保留为环境限制；本轮未重复这些失败入口。完整 gates 的原始 TAP 未在交接报告中附带，本轮只核验命令/集成调用关系并复用工程记录，非独立全量执行证明。

其他检查：`git diff --check` exit 0；`git status --short --branch -uall`、`git rev-parse HEAD`、`git worktree list --porcelain`、SHA256 查询均成功。主树复查仍是相同十个 Market/Hub 脏路径；QA 从未写入它们，不以该状态快照宣称他人并行内容未变。

非源码失败与处理：
- 初始组合环境探测 exit 1：最后的 `command -v node22` 无此别名；native node 路径与版本已核实，无需安装或 bootstrap。
- 第一次只读 sidebar 探针 exit 1 / ENOENT：错误假设修复目标已存在并试读 hash；修正为检查存在状态及既有 package.json hash 后，探针 exit 0。属于 QA 探针修正，不是 guard 回归失败。

## 生效前验证建议与保留限制

下一动作归主理人/获授权交付 Agent：
1. 绑定最终合入 SHA 与候选源码 hash，遵循既有 PR/required checks/Merge Queue，勿复制覆盖有十个他人脏文件的主 checkout；本次没有交付权限扩展。
2. 生效时核实实际 hook command 指向的新脚本和可用 native runtime/Git；不关闭全局保护，不改变安全配置来取得通过结果。
3. 在获授权隔离上下文触发无害 hook 验证，检查 `/dsh-hooks/recent` 回执：status=0、正确会话/PreToolUse、明确 permissionDecision。验证同仓/外仓 linked allow、主 checkout protected deny；不要用真实主树写入作探针。bash 使用 disposable fixture 验证未推送提交 deny。
4. 真实目标 `html-preview-resource.ts` 的 allow 只是分类验证，不证明 sidebar 功能正确；其 UI/浏览器验收属于 sidebar Issue，不在此处冒报。

保留限制：PreToolUse 不是原子文件系统隔离，检查后的路径/metadata 竞态不覆盖；既有临时/gitignore/草稿豁免、bash 缺失 upstream 时的处理、hook runner timeout/fail-open 未改；未验证已激活 runner 或 Electron 实际调用链。建议仅保留这些清晰边界，不新增超范围复杂机制。
