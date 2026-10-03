# 规格：让 omnimux 测试脚本执行全部 *.test.mjs（Issue #3014）

上游：PR #3003 / #3010 补审报告（Standards 轴发现）。

## 现象

`plugins/omnimux/scripts/run-tests.mjs` 的 TEST_GLOBS 只匹配 `src/**/*.test.js` 与 `src/**/*.test.ts`。
以下 6 个 `.test.mjs` 文件从未被 `pnpm --filter omnimux test` 执行：

- src/media/download-retry.test.mjs
- src/media/task-collect-lifecycle.test.mjs
- src/media/task-store.test.mjs
- src/client/attachments/assistantMessageMediaEnhancer.e2e.test.mjs
- src/client/attachments/promptFenceGenerate.e2e.test.mjs
- src/client/attachments/qa-issue-2661-all-scenarios.test.mjs

按 plugin-qa.md「假绿」条款，这些用例的通过率是虚的——它们没跑过。

## 目标

- `node scripts/run-tests.mjs` 能发现全部测试文件，包括 `.mjs`。
- 发现并执行后，所有 6 个文件在当前代码下全绿；有失败的逐个修或按既有豁免流程标注。
- 不改被测业务逻辑，除非测试揭示的是真缺陷。

## 用户旅程

1. 开发者在 omnimux 插件改代码。
2. `pnpm --filter omnimux test`（或 `node scripts/run-tests.mjs`）执行全部测试。
3. 其中包含这 6 个此前被漏掉的文件，它们的失败能被看见。

## 新用户基线

只依赖仓库已有代码与 node 测试运行器，不依赖外部服务。

## 验收

1. `discoverTestFiles` 返回的列表包含全部 `.test.mjs` 文件。
2. 运行器执行后 6 个文件全绿（或有明确标注的失败原因）。
3. 现有 `.test.js` / `.test.ts` 文件仍全绿，不回归。

## 边界

- 总是：只改测试发现机制与测试文件本身；被测业务逻辑仅在测试证明是缺陷时才动。
- 绝不：为了让测试过而改断言到失去意义；新增与本次无关的测试。
