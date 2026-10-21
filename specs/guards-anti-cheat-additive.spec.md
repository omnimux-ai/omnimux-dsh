# 测试契约门禁：禁削弱、放行新增（guards-anti-cheat-additive）

## 目标

把 `guard-anti-cheat` 的 RULE-01 从「只检查新增执行风险」补全为「**禁削弱、放行新增**」：

- **继续拦截**：新增 `skip/only/todo`、动态执行、动态 options 等执行风险（既有 `collectRisks` 规则不变）；
- **新增拦截**：删除或改写已有断言（`assert.*` / `expect(...)` 的指纹消失）、删除或重命名已有测试用例（`test/it/describe` 的名字消失）；
- **继续放行**：新增测试用例、追加断言、新增安全 import（additive 变更）。

## 背景

原 `inspectTestAuthoringDelta` 只比较「风险指纹」的增量：删除断言、把 `assert.equal` 改成 `assert.ok`、改期望值都不会产生新风险，因此**削弱测试实际上是被放行的**；与此同时它又因为新增无关风险而拒绝合法的新增用例。issue #3539 要求把它改成「禁削弱、放行新增」。

## 命令

```bash
node --test scripts/test-authoring-inspection.test.mjs
node --test scripts/guard-anti-cheat.test.mjs
```

## 项目结构

- `scripts/test-authoring-inspection.mjs`：新增 `collectAssertionFacts()`（断言指纹 + 具名用例集合），`inspectTestAuthoringDelta` 在既有风险增量检查之后追加：已有断言指纹缺失 → deny；已有用例名缺失 → deny。
- `scripts/guard-anti-cheat.mjs`：`testDecision` 拒绝文案更新为「禁削弱、放行新增」。
- `scripts/test-authoring-inspection.test.mjs`：在既有 delta 用例内追加断言（不新增用例）。
- `specs/guards-anti-cheat-additive.spec.md`：本规格。

## 代码风格

纯函数、语法级判定，不做语义等价或数据流分析；指纹同样复用 `canonical()` 去掉源码坐标。

```js
for (const [fingerprint, count] of beforeFacts.assertions) {
  if ((afterFacts.assertions.get(fingerprint) || 0) < count) deny('test-assertion-removed-or-rewritten')
}
for (const name of beforeFacts.cases) if (!afterFacts.cases.has(name)) deny('test-case-removed-or-renamed')
```

## 测试策略

在既有 `test-authoring-inspection.test.mjs` 的 delta 用例内追加断言：

1. 纯新增用例 → allow；
2. 删除一个断言 → deny；
3. 改写断言期望值（`assert.equal(x, 1)` → `assert.equal(x, 2)`）→ deny；
4. 删除/重命名用例 → deny；
5. 既有测试（风险增量、import 安全化等）不回归。

## 边界

- 总是：只做语法级削弱检测；不改既有执行风险规则；不删除既有断言。
- 先问：允许「加强断言」（把 `assert.ok` 改成 `assert.equal`）——本次保守拒绝，需以追加断言的方式加强；后续可单独设计。
- 绝不：因为新增用例而误拦；因检测不到某种削弱而声称语义安全。

## 成功标准

1. 上述 allow/deny 矩阵通过；
2. `node --test scripts/test-authoring-inspection.test.mjs` 与 `scripts/guard-anti-cheat.test.mjs` 全绿；
3. 合并后新增测试用例/追加断言不再被 RULE-01 拦截，删除/改写断言仍被拦截。

## 假设

1. 断言与具名用例可以用语法指纹机械识别，足以覆盖 #3539 里列出的主要削弱手法（删断言、降级断言、改用例名）。
2. 保留既有风险增量逻辑可以避免把「新增执行风险」误判为合法新增。
3. 保守地拒绝「加强断言」不会阻塞正常交付：开发者可以追加断言而不是改写旧断言。

## 证伪方式

1. 修复前用 `inspectTestAuthoringDelta` 对比「删断言」前后：应 allow（说明旧规则确实漏掉削弱）；修复后应 deny。若修复前已 deny，说明假设 1 不成立。
2. 修复后「纯新增用例」「追加断言」应 allow；若 deny，说明检测把新增误判成削弱。
3. 修复后「改期望值」「删用例/改名」应 deny；若 allow，说明指纹匹配失效。
4. 合并后真实编辑一个测试文件：追加用例应被放行；删断言应被 RULE-01 拦截。

## 文档影响

仅测试契约门禁的语法级判定与拒绝文案；不改产品行为与用户可见文案。无需更新产品文档。
