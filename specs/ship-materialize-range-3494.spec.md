# ship 物化范围改用 PR mergeCommit（Issue #3494）

## 目标与成功标准
`worktree.sh ship` 不再假定「本次 PR 的合并提交就是当前 HEAD」，而是用 `gh pr view` 返回的 `mergeCommit.oid` 精确计算该 PR 的改动范围并物化。成功标准：同批多个 PR 合并后，后 ship 较早的 PR 仍能覆盖它自己的插件改动（包括删除文件），不会被 `HEAD~1..HEAD` 漏掉；单测在旧实现上失败、修复后通过；既有 ship/remove 用例全绿。

## 新用户基线
仅开发交付脚本；不进入产品运行时。mergeCommit 缺失或本地不可达时明确失败（die），不静默用错误范围继续物化。

## 计划与项目结构
- `scripts/worktree.sh`：`cmd_ship` 的 `gh pr view` 增加 `mergeCommit` 字段并解析 `mergeCommit.oid`；pull 后用 `merge-base --is-ancestor` 校验该 commit 在远端 main 上；物化范围统一为 `mergeCommit^1..mergeCommit`（squash 与 merge 提交都只含本 PR 增量；`auto_materialize_and_reload` 的 `git log` 增加 `--diff-merges=first-parent` 以覆盖 merge 提交差异）；替换 `auto_materialize_and_reload "HEAD~1" "HEAD"`。
- `scripts/worktree-delivery.test.mjs`：更新 4 处 ship gh stub 为 5 字段；新增「同批两 PR，先 ship 较早 PR」用例（workflow 删除/修改 + 后一个 PR 改 assets），断言物化 workflow、不物化 assets；新增空 mergeCommit 失败用例；新增双父 `--no-ff` 合并用例，断言只物化 PR 分支文件、不含 main 分叉后的其他 PR 文件。
- 不改 `remove` 收尾逻辑（同类假设归 #3308 跟进）。

## 命令
`node --test scripts/worktree-delivery.test.mjs`；`node --test scripts/dev-launch-env.test.mjs`（静态守卫不回归）；`git diff --check`。

## 代码风格
沿用 shell 局部变量、die 失败语义与现有 fixture 测试风格；不引入依赖；失败信息说明「无法确定 mergeCommit / 不在 main 上」。

## 测试策略
新增回归用例复刻真实时序：main 先合入 A（改 workflow），再合入 B（改 assets），本地停在 A 之前；ship A 的 PR 时 gh 返回 mergeCommit=A，断言 sync-to-app 收到 `omnimux-workflow` 且不含 assets。另用 `git merge --no-ff` 构造双父合并，断言 `^1..merge` 只包含 PR 分支改动；并用 MERGED 但 mergeCommit 为空的 stub 断言 ship 非 0 且保留 worktree。

## 假设
ship 的物化范围应取本 PR 合并提交相对第一父提交的增量：`mergeCommit^1..mergeCommit` 对 squash 与 merge 提交都只含该 PR 改动。同批多 PR 合并后 `HEAD~1..HEAD` 只剩最后一个提交，是漏装的根因；双父合并的差异需要 `--diff-merges=first-parent` 才能被 `git log --name-only` 识别。

## 证伪方式
把范围回退为 `HEAD~1..HEAD` 后，「同批两 PR 先 ship 较早 PR」用例必须失败（sync 收到后一个 PR 的 assets 而不是 workflow）；把 `mergeCommit^1` 改成 merge-base 后，双父 `--no-ff` 用例会多物化 main 分叉后的 assets；删掉 `--diff-merges=first-parent` 后双父用例应看不到插件改动。可执行：`node --test scripts/worktree-delivery.test.mjs`，并对上述三处做变异验证。

## 浏览器与 Electron 边界
不涉及 Client/Stage；ship 后仅脚本变更、不物化应用，Dev 不受影响。

## 边界与文档影响
始终：保持 PR 校验、ff-only 同步、失败 die、worktree 清理语义。先问：改 Merge Queue、改 remove 收尾、改物化器。绝不：静默回退到 HEAD~1 范围、强推 main。文档影响：仅任务 spec 与脚本注释。
