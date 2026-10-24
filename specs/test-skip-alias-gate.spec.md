# 旧式跳过/聚焦别名绕过测试门禁：xit / fit / fdescribe / xdescribe

## 背景

`scripts/test-authoring-inspection.mjs` 的 `collectRisks` 只识别三种运行器名（`test` / `it` / `describe`）以及从 `node:test` / `vitest` / `@jest/globals` 导入的名字，并据此检查成员属性是否落在 `blocked`（`skip` / `only` / `todo` 等）里。因此：

| 写法 | 现状 |
| --- | --- |
| `test.skip(...)` / `it.only(...)` / `test.concurrent.skip(...)` | deny（`test-execution-selector-needs-review`） |
| `test.skipIf(true)(...)` | deny（`dynamic-test-options-needs-review`） |
| **`xit(...)` / `fit(...)` / `fdescribe(...)` / `xdescribe(...)`** | **allow** |

`xit` / `xdescribe` 是 jasmine / mocha / jest 的跳过别名，`fit` / `fdescribe` 是聚焦别名——语义与 `test.skip` / `test.only` 完全等价。也就是说「不许跳过或聚焦测试」这条规则存在一个只用改几个字符就能绕过的缺口，而且它在**写入时刻与 CI 两侧同时成立**（两侧共用 `collectRisks`）。

实测（直接调用 `inspectTestAuthoring`）：`xit(...)`、`fit(...)`、`fdescribe(...)`、`xdescribe(...)` 四条全部 `allowed: true`。

## 用户操作旅程

1. 开发者在测试文件里写下 `xit('用例', () => {})` 或 `fit('用例', () => {})` → 期望：写入被拒，并说明「跳过/聚焦选择需要独立审查」。
2. 开发者写 `test.skip(...)` / `it.only(...)` → 期望：行为不变，仍拒绝。
3. 开发者在生产代码里调用一个恰好叫 `fit` 的函数（例如图像适配）→ 期望：不受影响（该文件不是测试文件，门禁不扫描）。
4. 开发者在**测试文件**里调用一个恰好叫 `fit` 的本地辅助函数 → 期望：保守拒绝（与 `it` / `test` 同样属于运行器名，同名即按运行器处理）。

## 变更点

### 1. `scripts/test-authoring-inspection.mjs` — 识别旧式别名

新增 `legacySelectors = new Set(['xit', 'xtest', 'xdescribe', 'xcontext', 'xspecify', 'fit', 'ftest', 'fdescribe'])`，并在 `inspect` 里加两条判定：

- `CallExpression` 且 `callee` 是 `legacySelectors` 里的标识符 → `test-execution-selector-needs-review`；
- `MemberExpression` 且 `object` 是 `legacySelectors` 里的标识符（例如 `xit.each(...)`）→ 同上。

该原因**不可经声明放行**（不在 `DECLARABLE_TEST_STANDARD_REASONS` 内），与 `test.skip` 一致。

### 2. 两侧同时生效

`collectRisks` 被写入时刻的 `guard-anti-cheat.mjs` 与 CI 侧的 `verify-test-standard-declarations.mjs` 共用，所以这一处改动同时堵住两条路径，无需各自修改。

## 假设

- 假设 1：仓库现有测试文件里没有任何旧别名调用，因此新增识别不会让任何既有文件突然被拒。依据：`grep -rlE "^[[:space:]]*(fit|xit|xtest|ftest|fdescribe|xdescribe)[[:space:]]*\("` 在全部 `*.test.*` / `*.spec.ts` 上命中 **0** 个文件。
- 假设 2：`fit` 作为普通函数名在测试文件里出现会误拒。这是**有意的保守**：`it` / `test` 早就是运行器名，同名标识符一律按运行器处理；且仓库里 `fit(` 的命中都在 vendored bundle 的字符串内，不在测试文件里。
- 假设 3：别名集合取**保守超集**。依据：mocha 公布的 globals 含 `xcontext`/`xdescribe`/`xit`/`xspecify`，jasmine 与 jest 含 `fdescribe`/`fit`/`xdescribe`/`xit`，jest 另有 `xtest`；`ftest` 未必存在于任何框架，但它是聚焦别名的常见拼写，宁可多拒一个不存在的名字。反向地，`context`/`specify` 是 describe/it 别名而非跳过/聚焦，不纳入（实测 `context('c', () => {})` 仍放行）。
- 假设 4：`skipIf`/`runIf` 纳入 `blocked` 后，任何 `X.skipIf` 成员访问都被拒，因此「条件恰好是对象字面量」的形态不再绕过。依据：原先 `it.skipIf({a:1})('c', () => {})` 被放行——`{a:1}` 看起来像合法 options 对象，绕过了「参数形状」那条检查。仓库里确有 4 个文件使用 `describe.skipIf(!runnable)`（`plugins/omnimux-browser/tests/e2e/pairing-page.e2e.spec.ts`、`pairing.e2e.spec.ts`、`pairing-approval.e2e.spec.ts`、`media-lit-transition.e2e.spec.ts`），但它们都是 acorn 解析不了的 TS，改动前后都走 `unsupported-or-incomplete-test-syntax` 硬拒，所以**判定不变**（不是「零处使用」）。代价是 `{ skipIf: … }` / `{ runIf: … }` 对象属性与 `obj.skipIf` 纯成员读取也会被判为选择器——与既有的 `{ skip: … }` 属同一条过宽形状；旧/新两版扫过全部受保护测试路径，判定变化数为 0。
- 假设 5：字面兜底只在解析失败时运行，而那时结构化检查不执行，所以两层的缺口清单不能互相替代。依据：纯新增的不可解析文件里，`test['skip'](...)`、`test.concurrent.skip(...)`、`it.skipIf(true)(...)`、`describe.skipIf(!runnable)(...)`、`xit.each([1])(...)` 实测全部放行。合同文档已按此改写，不再用「结构化检查能拒」去论证某项不算缺口。

## 证伪方式

- 若 `xit` / `fit` / `fdescribe` / `xdescribe` 中任何一条仍 `allowed: true`，则改动未生效。
- 若 `test.skip` / `it.only` / `test.concurrent.skip` / `skipIf` 的判定发生变化，则改动溢出。
- 若生产代码（非测试文件）里的 `fit(...)` 调用被拒，则作用域溢出——门禁只应扫描测试路径。
- 若可解析的测试文件里 `xit(...)` 被拒但**不可解析**（TS）的测试文件里 `xit(...)` 被放行，则说明只堵了一条路径。

## 实测结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 语法层评估测试 | `node --test scripts/test-authoring-inspection.test.mjs` | **51/51 通过**（47 → 51，新增 4 条：别名识别、不溢出、不可声明、mocha 别名与 skipIf 对象条件） |
| 门禁自身测试 | `node --test scripts/guard-anti-cheat.test.mjs` | **35/35 通过**（32 → 35，新增 3 条：纯新增路径的别名兜底、成员调用不误伤、注释/字符串里带括号别名会被拒） |
| 声明校验测试 | `node --test scripts/verify-test-standard-declarations.test.mjs` | **19/19 通过**（未改动） |
| 门禁套件 | `pnpm test:gates` | 469 / 457 通过；**12 条失败与改动前逐条同名**（既有环境/内容问题） |

逐条实测（`inspectTestAuthoring`）：

| 写法 | 改动前 | 改动后 |
| --- | --- | --- |
| `xit(...)` / `xtest(...)` / `xdescribe(...)` | allow | **deny** |
| `xcontext(...)` / `xspecify(...)`（复核补充） | allow | **deny** |
| `fit(...)` / `ftest(...)` / `fdescribe(...)` | allow | **deny** |
| `xit.each([1])(...)` | allow | **deny** |
| `it.skipIf({a:1})(...)` / `test.runIf({a:1})(...)`（复核补充） | allow | **deny** |
| `test.skip(...)` / `it.only(...)` / `test.concurrent.skip(...)` / `describe.only(...)` | deny | deny（不变） |
| 普通 `test(...)` / `describe(...)` / 纯 `assert` | allow | allow（不变） |
| 测试文件里的本地函数 `fit(3)` | allow | **deny**（保守，见假设 2） |

端到端：写入时刻把既有测试的 `test('keeps', ...)` 改写为 `xit('keeps', ...)` → `handle()` 返回 **deny**。

纯新增的**不可解析**文件（走字面兜底）：

| 内容 | 改动前 | 改动后 |
| --- | --- | --- |
| `xit(...)` / `xcontext(...)` / `globalThis.xit(...)` | allow | **deny**（复核补充） |
| `test.skip(...)` | deny | deny（不变） |
| 普通 `test(...)` / `obj.fit(3)` | allow | allow（不变，成员调用不误伤） |

## 新产品基线

无影响：只改测试评估脚本，不涉及产品默认值、模型、路径或本地状态。

## 文档影响

`docs/contracts/anti-agent-fake-completion-guard.md` §3.1 写的是「真实跳过/聚焦选择…保守拒绝」。本次把「真实」的范围补全到旧式别名，需在该句后补一句：跳过/聚焦的识别覆盖 `test|it|describe` 的 `.skip|.only|.todo`、条件形式 `skipIf`/`runIf`，以及旧式别名 `xit`/`xtest`/`xdescribe`/`fit`/`ftest`/`fdescribe`；这些原因一律不可经声明放行。
