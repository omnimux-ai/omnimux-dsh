# 规格契约补齐（Issue #3507）

## 目标与成功标准
为主仓新门禁（PR #3492）补齐本会话近期四个任务规格的 `## 假设` / `## 证伪方式` 两节，使 `guard-quality-loop` 的 `inspectSpecContract(taskSpecs(worktree))` 返回 `ok: true`。成功标准：四份 spec 均含两节且正文 ≥20 字；自检输出 `ok: true`；不改任何源码、catch、日志或验证证据。

## 新用户基线
仅仓库协作文档，不进入产品运行时；不影响 Dev/Prod 行为。

## 计划与项目结构
- `specs/final-hardening-3470.spec.md`：补 env/取消识别的根因假设与变异证伪方式。
- `specs/launch-hardening-3478.spec.md`：补进程识别/有界退出/拉起核实的假设与变异证伪方式。
- `specs/picker-diagnostics-3479.spec.md`：补 stdout 可诊断、日志隔离的设计假设与变异证伪方式。
- `specs/ship-materialize-range-3494.spec.md`：补 `mergeCommit^1..mergeCommit` 与 `--diff-merges=first-parent` 的范围假设与变异证伪方式。
- 不改门禁脚本、hooks、产品源码或测试。

## 命令
自检：`node --input-type=module -e "const m = await import('file:///Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/scripts/guard-quality-loop.mjs'); console.log(m.inspectSpecContract(m.taskSpecs(process.cwd())))"`；`git diff --check`。

## 代码风格
Markdown 二级标题严格使用 `## 假设` / `## 证伪方式`；正文写实际任务内容，不写模板废话。

## 测试策略
用门禁自身导出的 `taskSpecs`/`inspectSpecContract` 对 worktree 实际改动集自检；四份 spec 全部进入 `checked` 且 `missing` 为空即通过。变异验证：删掉任一份的两节之一后自检必须返回 `ok: false`。

## 假设
新门禁只检查「本任务改动集里的 specs/*.md」，并且只验证两节存在且正文 ≥20 字，不判语义；本会话已交付任务的规格仍在 main 上，补两节不会改变历史行为，只会让这些 spec 在后续 rebase/复用/被改动集包含时满足契约。

## 证伪方式
若自检 `checked` 少于四份 spec（说明改动集未包含全部文件），或任一份删掉 `## 假设`/`## 证伪方式` 后自检仍返回 `ok: true`（说明门禁未生效），则假设被证伪。可执行：`node --input-type=module -e "…inspectSpecContract(taskSpecs(process.cwd()))"`，并对单份 spec 做删除变异后重跑，期望 `ok: false` 且 `missing` 指向该节。

## 浏览器与 Electron 边界
不涉及 Client/Stage/Electron；无真实应用操作。

## 边界与文档影响
始终：只改本会话产出的 spec，不碰他人 worktree/spec。先问：修改门禁实现或 hooks。绝不：伪造验证证据、用空话凑字数、改源码过门禁。
