# Spec: 装配观测结构化——skipped 计数可见 + 失败原因机器可读（Issue #3670）

- Issue: #3670（P2，承接 #3655 合入时独立评审的两条非阻断建议）
- 风险级别: R1（`scripts/` + governance manifest + CI 清单）
- 背景: #3655 修好任务私有测试环境后，`observations.skippedInputs` 只有 ≤20 条样本、没有总数，也没有消费者；失败原因只有自由文本 `hint`（子进程 stderr 尾巴），机器无法按原因分类，`verify:app` 报告也只有 `report.hint` 文本。

## 1. 目标与用户结果

- 排查装配时能一眼看到「跳过了多少输入、样本是什么」，并区分正常构建产物与可疑排除。
- 失败能按稳定原因码分类（归档子进程退出/信号/启动失败、缺依赖、非法输入），同时保留人类可读 hint。
- `pnpm verify:app` 失败报告同时给人类文本与结构化 `failure`；成功报告透出 skipped 数量。

## 2. 范围与设计

- `scripts/test-env-bootstrap.mjs`
  - 新增导出 `createSkippedInputTracker(limit = 20)`：`note(rel)` 累加总数并保留 ≤limit 条样本，`snapshot()` 返回 `{ count, sample }`。`copyTree` 用它替代现有 `noteSkipped`；准备观察写入 `observations.skippedInputCount`（总数）与 `observations.skippedInputs`（样本）。
  - 新增 `detailFailure(code, reason, detail, hint)`：在既有 `failure()` 上附加稳定 `reason` 与结构化 `detail`；`safeError` 透传这两个字段，保证经过运行时二次分类后不丢。
  - 归档失败：`reason` 取 `ARCHIVE_COMMAND_SPAWN` / `ARCHIVE_COMMAND_SIGNAL` / `ARCHIVE_COMMAND_EXIT`；`detail = { action, exitStatus, signal, stderrTail }`（截断 1200 字），`hint` 仍给人类。
  - 缺依赖：`reason='DEPENDENCY_REQUIRED'`，`detail={ packages }`。
  - 非法输入：`reason='INPUT_SYMLINK' | 'INPUT_SPECIAL'`，`detail={ path, kind }`。
  - 导出 `archiveCommandFailure` 供回归测试。
- `scripts/worktree-app-qa.mjs`
  - 失败时报告增加 `failure: { code, reason, detail }`（脱敏、截断），`hint` 保留；CLI 打印 `原因: <reason> <hint>`。
  - 成功时若环境观察含 `skippedInputCount`，写入 `report.observations.skippedInputCount`；拿不到就不写，不伪造 0。
- 测试：新增 `scripts/test-env-bootstrap-observability.test.mjs`，覆盖 tracker 的计数/样本边界与三种归档失败的 reason/detail/hint；注册 `scripts/governance-manifest.json` 与 `.github/workflows/quality-gate.yml`。

## 3. 假设

- 现有 `skippedInputs` 无任何消费方（#3655 引入），因此增加 `skippedInputCount` 并在报告中透出不会破坏既有读者；样本数组继续保留 ≤20 条，兼容旧观察形状。
- `reason`/`detail` 是新增字段，`code` 集合不变；`safeError` 与运行时 catch 只要额外透传两个字段即可，不需要改变错误分类逻辑。
- 报告没有严格字段白名单（#3655 已核对 `report.hint` 先例），因此新增 `failure` 字段安全；脱敏沿用 #3655 的关键词黑名单 + 截断。

## 4. 证伪方式

- 若 `skippedInputCount` 与真实跳过数不符：构造 >20 条被跳过条目的端到端/单元用例（tracker 用例 + 干净 worktree 跑一次装配）会显示 count ≠ sample 长度。
- 若失败结构化丢失：在 Python 3.15 下用错误 sha256 触发归档失败，断言 `reason='ARCHIVE_COMMAND_EXIT'`、`detail.exitStatus=3`、`detail.stderrTail` 含 `SHA256 mismatch`；若只有 hint 文本则说明透传没接上。
- 若报告破坏既有契约：`node --test scripts/worktree-app-qa.test.mjs scripts/worktree-app-qa-task.test.mjs` 与证据封套测试会失败。
- 若引入敏感信息：`detail`/`hint` 在命中 token/bearer/api-key/password/secret 时不得写入报告。

## 5. 验收

1. 单元用例覆盖 tracker（count=25/sample=20、limit 边界）与三种归档失败 reason/detail。
2. `node --test scripts/test-env-bootstrap-observability.test.mjs scripts/test-env-bootstrap*.test.mjs`、`node --test scripts/worktree-app-qa*.test.mjs`、`node --test scripts/verify-governance-registry.test.mjs scripts/lib/governance-registry.test.mjs` 全绿。
3. 本地真实触发一次归档失败（错误 sha256）时错误对象含 `reason` 与 `detail`。
4. `git diff` 只落在 `scripts/`、manifest 与 CI 清单。

## 6. 非目标

不改变「候选之外一律跳过」策略，不改归档校验/安装语义，不动 UI 业务代码，不引入新依赖，不把 hint 自由文本当合同字段。

## 7. 新用户基线

只影响仓库内测试装配脚本的观测与错误形状；缺依赖/解释器不兼容时仍显式失败并给修复命令，不静默回退、不伪造通过。

## 8. 文档影响

`docs/contracts/plugin-qa.md` 的行为契约不变（只增加可观测字段），不改合同文档；若后续把 `reason` 枚举写进合同，另行开任务。
