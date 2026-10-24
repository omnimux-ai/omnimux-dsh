# 新增测试文件的两条误报：写入门禁把纯新增判成「削弱既有标准」

## 背景

`scripts/guard-anti-cheat.mjs` 的测试保护分支对**新增**测试文件有两处误报，都会让正常开发动作被硬拒：

1. **新增 TypeScript 测试文件被拒，且理由自相矛盾**。实测 `write` 到 `scripts/probe-new.test.ts`（内容含类型注解）返回 deny，理由是「禁止删除/改写已有测试用例或断言（**新增用例、追加断言放行**）」——一个全新文件既没删除也没改写任何东西。原因是 acorn 解析不了 TS 注解，`inspectTestAuthoring` 返回 `unsupported-or-incomplete-test-syntax`，而 `testDecision` 把这个原因一律映射成「既有标准」拒绝文案。仓库里这是常见动作（最近 800 个提交新增了 8 个 `.test.ts`，`origin/main` 上共 69 个 `.test.ts(x)`）。
2. **父目录不存在时新建测试文件被拒**。实测 `write` 到 `plugins/demo/tests/probe.test.mjs`（`plugins/demo/tests/` 不存在）返回 deny，理由 `Cannot inspect canonical test target or source`；同样内容写到已存在的 `scripts/` 下则放行。原因是 `createSourceInspection.capturePath` 只允许**最后一段**缺失，中间任何一段不存在都直接抛错。新建插件测试目录是常规动作。

两条都只是「新增」，不涉及任何既有标准；它们与 CI 侧声明校验已经采用的「无 baseline = 纯加法」口径不一致。

## 用户操作旅程

1. 开发者在任务工作树里新建一个插件测试目录并写 `.test.mjs` → 期望：放行（纯新增）。
2. 开发者在已有目录里新增 `.test.ts` / `.test.tsx` → 期望：放行（纯新增，acorn 解析不了只是语法层盲区）。
3. 开发者**改写**已有测试文件的断言或删除具名用例 → 期望：仍按既有规则拒绝并点名，除非本任务 spec 的 `## 旧标准变更` 逐条声明。
4. 开发者新增一个可解析但含 `{ skip: true }`、聚焦、动态执行、公共绑定逃逸的测试文件 → 期望：仍然拒绝（这些原因与解析能力无关，不受本次放宽影响）。

## 变更点

### 1. `scripts/guard-anti-cheat.mjs` — `capturePath` 允许「整条尾部缺失」

原先只允许最后一段缺失。改为：中间组件**可以缺失**，但一旦出现缺失组件，其后所有组件必须同样缺失；若缺失层之下又出现实体，说明是符号链接、并发创建或路径构造异常，仍然 fail closed 抛错。`edit` 场景（`missingAllowed = false`）行为不变：目标文件缺失照样抛错。

这样 `plugins/demo/tests/probe.test.mjs` 在 `plugins/demo/` 存在、`tests/` 不存在时会被记录为「从 `tests` 起整条缺失」，仍然经过逐级 `realpathSync` 与非常规路径检查，不放松任何安全判定。

### 2. `scripts/guard-anti-cheat.mjs` — 无 baseline 且仅因解析失败时放行

测试分支原先只有 `inspection.allowed` 一条放行路径。新增一条：**目标文件不存在（`source` 不是字符串 = 纯新增）且拒绝原因恰为 `unsupported-or-incomplete-test-syntax`** 时放行。

理由：没有既有标准可削弱；该原因只反映 acorn 的 TS 盲区，不反映任何执行风险。其余原因（`test-execution-option-needs-review`、动态执行、公共绑定逃逸、未验证 import 等）不受影响，仍然拒绝。

这条与 CI 侧 `verify-test-standard-declarations.mjs` 的「`change.before === null` → 纯加法」口径一致，避免同一个动作在写入门禁与 CI 之间结论相反。

## 假设

- 假设 1：`source` 不是字符串 ⇔ 目标文件在磁盘上不存在。依据：受保护分支的 `source` 来自 `createSourceInspection().readTarget()`（`readExistingSource` 只服务另一条 `evaluateWithInspection` 路径）。实测：目标是目录、符号链接、悬空符号链接、FIFO 或 `chmod 000` 时都是**抛错拒绝**，不会返回非字符串，所以这条放行不会在这些形态上被触发。
- 假设 2：把「整条尾部缺失」按缺失处理不会放松路径安全。依据：`capturePath` 对每个存在的组件仍做 `realpathSync(path) !== path` 与 `lstatSync` 类型检查；缺失组件不参与 `openSync`，且「缺失层之下出现实体」会抛错——该检查是 load-bearing 的（删掉后同场景会放行，已用 IO seam 差分验证）。
- 假设 3：解析失败就等于放弃结构化检查，因此放行必须配字面模式兜底。依据：acorn 无法解析候选内容时，跳过/聚焦、动态执行、公共绑定逃逸、未验证 import 这些**结构化原因根本不会产生**。已用字面模式覆盖前两类（`test|it|describe|suite` 的 `skip|only|todo`、`eval`、`new Function`、`require`、动态 `import`、`node:vm|child_process|worker_threads`、`process.binding`），并按「调用形态」匹配以避免误伤正常用例名与注释。**残余取舍**：公共绑定逃逸与未验证 import 在解析失败时仍不被覆盖——这与既有 TS 盲区同源，显式记录而非声称已覆盖。

## 证伪方式

- 若 `capturePath` 改动后，一个指向仓库外的符号链接目录下的新文件被放行，则假设 2 不成立，必须撤回。
- 若新增 `.test.ts` 在放行后仍能通过后续检查写入，且其中含 `test.skip`，需确认这是既有盲区而非本次放宽的副作用：把内容换成等价的可解析 `.test.mjs`，写入门禁应当**拒绝**。若它也放行，说明放宽范围超出预期。
- 若 `edit` 一个不存在的测试文件被放行，则改动破坏了 `missingAllowed` 语义。
- 若改写既有 `.test.ts` 断言不再被拒绝（在没有声明的情况下），则放宽误伤了既有标准的保护。

## 实测结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 门禁自身测试 | `node --test scripts/guard-anti-cheat.test.mjs` | **32/32 通过**（新增 8 条：两条放行 + 三条不溢出 + 三条字面模式兜底） |
| 语法层评估测试 | `node --test scripts/test-authoring-inspection.test.mjs` | **47/47 通过**（未改动） |
| 门禁套件 | `pnpm test:gates` | 465 / 453 通过；**12 条失败与改动前逐条同名**（既有环境/内容问题） |

实测判定（`handle()` 直接调用）：

| 场景 | 改动前 | 改动后 | 期望 |
| --- | --- | --- | --- |
| 新增 `.test.ts`（父目录存在） | deny（理由自相矛盾） | allow | allow |
| 新增 `.test.tsx` | deny | allow | allow |
| 新增 `.test.mjs`（父目录不存在） | deny（`Cannot inspect…`） | allow | allow |
| 新增 `.test.ts`（父目录不存在） | deny | allow | allow |
| 新增 `.test.mjs` 含 `test.skip` | deny | **deny** | deny（不溢出） |
| 新增 `.test.ts` 含 `test.skip` / `test.only` / `eval` / `node:vm` / 动态 `import` | deny | **deny** | deny（字面模式兜底，见假设 3） |
| 新增 `.test.ts` 用例名含 `skips` / 注释含 `skip` | deny | **allow** | allow（只匹配调用形态，不误伤） |
| `edit` 不存在的测试文件 | deny | **deny** | deny（不溢出） |
| 改写既有断言（无声明） | deny | **deny** | deny（不溢出） |
| 经仓库外符号链接目录新建 | deny | **deny** | deny（安全假设 2 成立） |

## 新产品基线

无影响：只改门禁脚本，不涉及产品默认值、模型、路径或本地状态。

## 文档影响

`docs/contracts/anti-agent-fake-completion-guard.md` §3.1 已写明「写前防造假检查不扫描 `.md`…可解析的完整 JavaScript 测试候选可经语法检查形成」。本次放宽后需补一句：**纯新增（磁盘上无既有文件）的测试文件，若 acorn 解析不了候选内容而无法评估，则放行**（不是「仅因 TypeScript 注解」——任何解析失败都走这条，实测 `.mjs` 里的类型注解、纯语法错误、`.test.js` 里的 JSX 与装饰器同样命中），并说明放行仍配字面模式兜底、且解析失败时不会产生其余结构化原因。
