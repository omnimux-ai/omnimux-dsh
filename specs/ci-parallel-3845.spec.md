# specs/ci-parallel-3845.spec.md — Issue #3845

## 背景

实测 merge_group run 40513342576：`Static L0 QA & Tests` 单 job 约 11 分钟，其中 `Plugin unit suites (all packages)` 串行跑 25 个包约 6 分 50 秒（omnimux 126s、inspiration 95s、workflow 60s、market 43s），浏览器扩展 vitest 50s。每次合并还要跑 3 遍（PR、merge_group、push main），push main 校验的是 merge_group 已校验过的同一棵树。

## 方案

- `.github/workflows/quality-gate.yml` 拆成并行 job：
  - `gates`：原有全部静态门禁、回归、契约、加载与几何检查（内容不删）。
  - `plugin-tests`：矩阵 4 分片（`hub` / `inspiration` / `workflow-market` / `rest`），每片跑 `run-workspace-tests.mjs` 的一个分片；浏览器扩展 vitest 归入 `rest` 分片。
  - `full-scan`：仅 merge_group 执行原 push main 上的全仓密钥与扩展出站扫描。
  - `static-and-tests`（名称仍为 required check `Static L0 QA & Tests`）：`needs` 以上全部、`if: always()`；任一必需 job 非 success（full-scan 仅在非 merge_group 时允许 skipped）即失败，并运行 `ci-verdict.mjs` 聚合标签。
- 移除 `push: main` 触发。
- `scripts/run-workspace-tests.mjs` 增分片：`--shard <name>` 或环境变量 `OMNIMUX_TEST_SHARD`（CI 的 run 行保持静态，供治理注册表证明可达）。分片表显式列包，`rest` 收所有未列包；未知分片名、或列出但不存在的包直接失败。
- `scripts/run-workspace-tests.test.mjs` 断言：分片两两不相交、并集等于全部工作区包、工作流矩阵恰好等于分片表键集。

## 新用户基线

纯 CI/脚本改动，不进入产品路径，不依赖任何开发机状态；本地不传分片时行为与现状一致（全量串行）。

## 假设

把串行的插件测试拆到 4 台并行 runner 上、静态门禁另起一台，墙钟时间取决于最慢的一台（约 3–4 分钟加安装开销），整体从约 11 分钟降到 5 分钟以内，同时每个工作区包仍恰好执行一次。

## 证伪方式

PR 与 merge_group 的 CI 运行中：任一分片日志缺包或某包被执行两次、`N/N package(s) passed` 总数之和不等于 25、聚合 job 在任一上游失败时仍为绿色、或 required check 墙钟时间未低于 6 分钟，即证伪。本地用 `--shard` 逐片运行并对比包名并集也可证伪。

## 旧标准变更

- `scripts/style-dom-probe.test.mjs` :: `quality gate retains existing verdict and uploads only explicit failure receipt paths`
  - 理由：该用例把「插件测试步骤、证据上传与 verdict 都位于 `static-and-tests` 单 job、run 行为全量命令」写死；本任务把它们拆到 `plugin-tests` 矩阵与聚合 job，原断言逐字要求旧结构。
  - 新期望与证据：改为断言回归行仍跑该测试、`plugin-tests` 步骤不 continue-on-error 且 run 行带分片环境、各 job 上传路径显式、聚合 job 的 verdict 仍 `always()` 且 `--ci-status "$CI_STATUS"` 来自 needs 结果；覆盖不少于原断言。

## 验收

- [ ] `node --test scripts/run-workspace-tests.test.mjs scripts/style-dom-probe.test.mjs scripts/ci-verdict.test.mjs scripts/verify-test-standard-declarations.test.mjs scripts/verify-governance-registry.test.mjs` 绿。
- [ ] 本地 `node scripts/run-workspace-tests.mjs --shard rest` 可运行且包集合正确。
- [ ] PR CI 与 merge_group 中 `Static L0 QA & Tests` 绿，墙钟时间 < 6 分钟。
- [ ] 合并后把 ruleset 的 `strict_required_status_checks_policy` 关闭（Merge Queue 已保证与最新 main 同测）。

## 非目标

不删任何检查项；不做按改动筛选插件测试；不改各包测试内容与判定口径。
