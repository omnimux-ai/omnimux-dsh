# Spec: 交付后 worktree 不清理会永久堆积（#3820）

- Issue: #3820
- 风险级别: R2（交付脚本收尾路径；影响所有后续任务的清理行为，可逆）
- base: `origin/main` @ `ce5b4d658`

## 1. 目标与用户故事

维护者视角：每次任务交付后，`.worktrees/<task>` 应被自动清理；现在会永久堆积，需要人工巡检手工清。

用户故事：Agent 跑完 `worktree.sh ship <task> --pr <n>` → 工作树与分支被清掉，且该任务的 spec 证据被保留在固定位置，不因「强制删除」而丢失。

## 2. 根因（实测）

三条规则互相打架：

| # | 事实 | 来源 |
|---|---|---|
| 1 | spec 草稿留在任务 worktree、不进提交 | `AGENTS.md` · Quality Loop |
| 2 | `git worktree remove` 遇未提交文件直接拒绝 | 实测：`fatal: '...' contains modified or untracked files, use --force to delete it` |
| 3 | ship 靠 `git worktree remove "${wt}" 2>/dev/null \|\| rm -rf "${wt}"` 兜底 | `scripts/worktree.sh:589` |

推论：交付时 worktree **必然**因 spec 变脏 → `git worktree remove` 必然失败 → 只有 `rm -rf` 能救；没跑 ship 或兜底未生效就永久留下。

实测抽查（本次清理时）：

| worktree | ahead | behind | 判定 |
|---|---|---|---|
| common-safe-closeout-issue-3308 | 0 | 238 | 无未合并工作，脏文件是旧残留 |
| cross-capability-channel-pairing | 0 | 263 | 同上 |
| workflow-director-isolation-issue-3290 | 0 | 245 | 同上 |

`ahead=0` 证明无未合并提交；`behind=200+` 证明脏改动是旧代码残留。

## 3. 实现设计

1. **ship 删除前归档证据**：新增 `archive_worktree_evidence <wt> <task>`：
   - 收集该 worktree 内 `git status --porcelain -uall` 里 **未跟踪的 `specs/*.md`** 与该 worktree 的 `git diff`（已跟踪改动），写入固定目录 `<repo>/.tmp/worktree-archive/<task>/`。
   - 只归档**本任务**的 spec（`specs/` 下未跟踪项），不整目录复制（避免把仓库全量 specs 复制进去）。
   - 归档失败不阻断删除，但要在输出里明确告警，不静默。
2. **ship 改用 `--force`**：`git worktree remove --force "${wt}"`，失败再 `rm -rf` 兜底。
3. **新增巡检入口** `worktree.sh audit`：
   - 遍历 `.worktrees/*`，对每个取其分支；
   - 仅当 `git branch --merged origin/main` 命中**且** `rev-list --count origin/main..<br>` 为 0（无未合并提交）时，标记为「可清理」；
   - 输出任务名、分支、可执行清理命令；
   - 有未合并提交（ahead>0）的只列信息，标为「保留」。
4. 不改变既有 `remove` / `clean` 语义；`audit` 只读，不自动删除。

## 4. 范围 / 非目标

范围：`scripts/worktree.sh` 的 ship 收尾路径 + 新增 `archive_worktree_evidence` 与 `audit` 子命令 + 对应测试。

非目标：改 git 行为；删除有未合并提交的 worktree；处置现存 22 个 worktree 的归属判断；不动 `remove`/`clean` 既有语义。

## 5. 验收标准（可观察）

- [ ] 对「含未提交 spec」的 worktree 跑 ship，能成功清理，且删除前把该 spec 与已跟踪 diff 归档到 `.tmp/worktree-archive/<task>/`。
- [ ] 归档只含本任务 spec，不含仓库全量 specs（断言归档文件数等于该 worktree 未跟踪 specs 数）。
- [ ] `worktree.sh audit` 列出「已合并且 ahead=0」的 worktree，并**不**把 ahead>0 的列为可清理。
- [ ] `pnpm test:gates` 通过；`scripts/worktree.sh` 相关测试通过。
- [ ] 用一个临时 worktree 真跑一次 ship 验证清理生效。

## 旧标准变更

本任务先按「全脚本不得出现普通 `git worktree remove`」写过一条断言，实测发现另外两处是**故意保守**的设计，据此收窄断言范围：

- `scripts/worktree-cleanup-3820.test.mjs` :: `不再使用无 --force 的普通删除作为主路径`
  - 原断言：`scripts/worktree.sh` 全文不得出现 `git worktree remove "${wt}" 2>/dev/null`。
  - 必须改的理由：`cmd_remove`（约 750 行）有显式 `--discard` 开关，只有人工确认才加 `--force`；`cmd_clean`（约 893 行）遇到脏工作区是**主动 skip 并提示**用 `remove --discard`。这两处是保守语义，全文一刀切会逼它们变得危险。ship 的交付收尾才是「必须删且必然脏」的场景。
  - 新期望证据：用例名改为 `ship 路径不再使用无 --force 的普通删除`，只截取 `cmd_ship` 函数体做断言；同时断言该函数体内存在 `git worktree remove --force "${wt}"`。

## 假设

- 假设 A：`git worktree remove --force` 能删除含未提交文件的 worktree，且不会误删已合并分支之外的东西（分支由后续 `git branch -d/-D` 单独处理）。
- 假设 B：`git branch --merged origin/main` 结合 `rev-list --count origin/main..<br> == 0` 能准确区分「已合并可清」与「有未合并提交须保留」——实测 3 个样例均为 ahead=0 且 --merged 命中。
- 假设 C：把归档写到 `<repo>/.tmp/worktree-archive/` 不违反仓库洁净门禁（`.tmp` 是既定的临时目录白名单）。

## 证伪方式

- 证伪 A：`--force` 后 worktree 目录仍存在，或误删了同分支其它工作 → 停手，改为先 `git stash`/归档再普通 remove，不保留强制删除。
- 证伪 B：发现某分支 `--merged` 命中但 `ahead>0`（或反之）→ 以 `rev-list --count` 为唯一判据，`--merged` 仅作辅助，并在输出里标注依据。
- 证伪 C：`.tmp/` 被洁净门禁拒绝写入 → 改写到 worktree 之外的既有证据目录（如 `.workbuddy/`），并在 spec 更新理由。

## 8. 证据计划

- 单测：`scripts/worktree.sh` 相关的 `node --test scripts/*.test.mjs` 中与 worktree 有关的部分；新增 audit 判定的单元测试。
- 门禁：`pnpm test:gates`。
- 实机：创建一个临时 worktree → 造未提交 spec → 跑 ship 路径（或直接调用归档+force 删除函数）→ 断言目录消失、归档存在。

## 9. 文档影响

`docs/contracts/dev-pipeline.md` 的「刷新与重启」附近或 `AGENTS.md` Delivery 段补一句：ship 会归档 spec 证据到 `.tmp/worktree-archive/<task>/`，并提供 `worktree.sh audit` 巡检入口。若合同已有等价表述则只补 audit 一行。
