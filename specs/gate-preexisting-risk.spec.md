# 测试声明门禁：既有执行构造不再阻断编辑（#3754）

## 问题

`scripts/verify-test-standard-declarations.mjs` 与 `scripts/guard-anti-cheat.mjs` 共用
`inspectTestStandardChange(before, after)`。它的多重集比较本来就只对**新增**风险构造报错
（「不可新增执行风险」），但风险指纹里塞进了**整条祖先上下文**——用例标题字面量、局部绑定名、
参数化 `for ... of` 数据表、以及同形兄弟的序号。这些内容正是日常维护最容易改动的部分：

| 实测文件（PR #3752 / Issue #3734） | 位置身份里的易变内容 |
| --- | --- |
| `plugins/omnimux/src/catalog/contract/cli.test.js` | 用例标题 `... 83 dispositions resolved` → `... 67 ...` |
| `plugins/omnimux/src/catalog/model-capabilities.test.js` | 用例标题 `处置表 83 行` → `处置表 67 行` |
| `plugins/omnimux/src/catalog/contract/dispositions.test.js` | 用例标题改写 + 局部变量 `trimmed` → `docWithTombstone` |
| `scripts/verify-cross-plugin-model-alignment.test.mjs` | 用例标题改写 |
| `plugins/omnimux/src/catalog/generation-fingerprint.test.js` | 参数化数据表删掉 2 行 |

于是**同一处未改动的构造**（`Object.prototype.hasOwnProperty.call(...)`、`{ ...doc }`、
循环体内的 `test(...)`）在 candidate 里拿到一个「新」指纹，被当成新增风险硬拒，而该原因不可经
`## 旧标准变更` 声明放行。后果：任何触碰这类文件的 PR 必红；全仓多数受保护测试文件事实上被冻结。
#3718 是同一根因的另一形态（用例改名触发 `test-execution-selector-needs-review`）。

本任务只改风险**身份**的口径，不改风险**规则集**。

## 假设

- 假设 1：风险「既有」的判据应当是**构造本身**（原因 + 该构造的规范化节点 + 它引用的 import 绑定）
  加上**结构位置**（祖先节点类型、回调/参数槽位、分支边），而不是位置上的**文本、数据与序号**。
  把 Literal 的值/`raw`、Identifier 的名字、控制流语句的数据字段、同形兄弟的序号从位置身份里剔除后，
  「用例改名 / 局部改名 / 数据表增删行 / 前后插入同形用例」不再产生新指纹。
- 假设 2：删除位置文本不会让**新增**风险漏过：新增构造与既有构造的**节点形状**不同
  （`test.skip(...)` 与 `test(...)`、`eval(...)` 与 `assert.equal(...)`），同形状构造的数量增长
  由多重集计数捕获（同一处复制两份、或新增一处同类构造仍然被拒）。
- 假设 3：`scripts/test-authoring-inspection.test.mjs` 里有 5 条断言锁定的是「构造搬了位置 /
  同形兄弟增删就算新增」的**旧口径**，与本任务要求的「只对新增构造硬拒」直接冲突，必须按
  `## 旧标准变更` 逐条声明后改写。
- 假设 4（不由本任务解决，只如实报告）：`collectRisks` 把**任意** `SpreadElement` 归入
  `dynamic-test-execution-needs-review`。因此**新增**的数组/对象展开（`[...catalog.text, ...]`、
  `{ ...doc, dispositions: [...] }`）仍被硬拒——这是规则集问题，不是身份问题。

## 证伪方式

- 证伪假设 1：两侧只改用例标题、局部绑定名、参数化数据表或同形兄弟数量，而
  `inspectTestStandardChange` 仍返回 `allowed: false` 且原因不在 `DECLARABLE_TEST_STANDARD_REASONS`
  里 → 假设不成立。
- 证伪假设 2：在既有风险构造之外新增一处 `.skip`/`.only`/`eval(`/`[...x]`/`data[key]` 后
  `allowed: true`；或两侧都可解析却因 candidate 解析失败被放行 → 假设不成立。
- 证伪假设 3：改完实现后 `node --test scripts/test-authoring-inspection.test.mjs` 全绿
  （没有任何既有断言锁定旧口径）→ 声明清单多余，应删除。
- 证伪假设 4：在 `.worktrees/catalog-cloud-truth-p1b` 上跑
  `node <本工作树>/scripts/verify-test-standard-declarations.mjs . origin/main` 后
  「不可经声明放行」条目归零 → 假设不成立（说明规则集也要改）。
- 端到端证伪：同一命令下条目数不下降 → 修复无效。

## 旧标准变更

本节声明**门禁自身测试**里锁定旧身份口径的断言改写（受保护路径
`scripts/test-authoring-inspection.test.mjs`）。逐条给出原断言、必须改的理由与新期望。

- `scripts/test-authoring-inspection.test.mjs` :: `role filtering preserves context slots occurrences risk multiplicity and new execution denials`
  - 原断言：`function first(safeApi) { consume([...values]) }` 改成 `function second(safeApi) {...}` 必须拒绝。
  - 理由：包裹函数改名是文本改动，不是新增风险构造；构造与位置结构都没变。
  - 新期望：改名放行；回调槽位互换、同形构造计数超出、新增 `eval`/`node:vm` 仍拒绝（用例名同步改为
    `role filtering preserves context slots and multiset excess while enclosing renames stay allowed`）。
- `scripts/test-authoring-inspection.test.mjs` :: `parent domains retain repeated risks and multiset excess denials`
  - 原断言：`test('first', () => { data[key] })` 前面插入一个同形空用例后必须拒绝。
  - 理由：插入的空用例不含风险构造，既有构造的数量与形状都没变。
  - 新期望：该条放行；同一处复制两份、同一用例内出现两次 `data[key]` 仍拒绝（用例名不变）。
- `scripts/test-authoring-inspection.test.mjs` :: `same parent block insertion and ancestor occurrences retain old identities`
  - 原断言：在风险构造前后插入空块 / 静态块必须拒绝。
  - 理由：空块不含构造，既有构造的祖先类型链、槽位与分支边都没变。
  - 新期望：插入空块放行；在新块里**新增**一处风险构造仍拒绝（用例名改为
    `same parent block insertion keeps existing risk identities while new constructs deny`）。
- `scripts/test-authoring-inspection.test.mjs` :: `nonadjacent identical parents keep active callback occurrence beyond zero`
  - 原断言：删掉前面一个同形 `test('shared', ...)` 后必须拒绝。
  - 理由：删除的是不含风险的同形兄弟，既有构造本身没动。
  - 新期望：删除同形兄弟放行；把既有构造改成另一处新构造仍拒绝（用例名改为
    `nonadjacent identical parents keep stable identities when a sibling is removed`）。
- `scripts/test-authoring-inspection.test.mjs` :: `for of data stays in the full parent context instead of being evaluated`
  - 原断言：改动 `for (const scenario of [...])` 的数据表内容必须拒绝。
  - 理由：参数化数据表增删行是最常见的维护动作（PR #3752 的 generation-fingerprint.test.js 正是如此），
    数据不是构造，也不是位置结构。
  - 新期望：数据表内容变化放行；`test(scenario.name, ...)` 这类动态用例名仍拒绝（用例名改为
    `for of data changes stay allowed while dynamic case names remain denied`）。

## 验收

1. `.worktrees/catalog-cloud-truth-p1b` 上跑
   `node <本工作树>/scripts/verify-test-standard-declarations.mjs . origin/main`：
   修复前 7 处「不可经声明放行」→ 修复后 **0 处**，36 条声明仍被正常识别。
   路径拆解（实测）：身份口径缺陷占 4 处（cli.test.js、model-capabilities.test.js、
   generation-fingerprint.test.js、verify-cross-plugin-model-alignment.test.mjs），
   由本修复消除；规则集问题占 3 处（dispositions.test.js、list.test.js、
   verify-pricing-points-integrity.test.mjs），是 P1b **真的新增**了 `SpreadElement`，
   已在 P1b 侧改为非展开写法（`Array.prototype.concat` / `Object.assign`），
   因此不需要动规则集。`SpreadElement` 是否算执行风险仍是独立决策（假设 4）。
2. 本工作树内 `node --test scripts/test-authoring-inspection.test.mjs scripts/guard-anti-cheat.test.mjs` 全绿。
3. `pnpm test:gates` 通过（与本任务无关的慢项单独说明）。
4. 新增用例覆盖三个反例：①两侧都含既有 `.call(` 且未新增 → 放行；②head 新增一处 `.skip` → 硬拒；
   ③head 解析失败 → 硬拒。
5. `DECLARABLE_TEST_STANDARD_REASONS` 不变：跳过/聚焦、动态执行、公共绑定逃逸、解析失败仍不可声明。

## 不做

- 不放松风险规则集（`blocked` / `execution` / 旧式别名 / `SpreadElement` / `ImportExpression` /
  `WithStatement` / 解析失败字面兜底一律保持）；`SpreadElement` 是否属于「执行风险」是独立的规则决策，
  见假设 4。
- 不给新增风险开声明通道。
- 不动 `scripts/guard-anti-cheat.mjs` 的路径/仓库身份判定与 `DECLARABLE_TEST_STANDARD_REASONS`。
