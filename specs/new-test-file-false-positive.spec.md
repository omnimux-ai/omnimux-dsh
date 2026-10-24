# 新增测试文件的两条误报：写入门禁把纯新增判成「削弱既有标准」

## 背景

`scripts/guard-anti-cheat.mjs` 的测试保护分支对**新增**测试文件有两处误报，都会让正常开发动作被硬拒：

1. **新增 TypeScript 测试文件被拒，且理由自相矛盾**。实测 `write` 到 `scripts/probe-new.test.ts`（内容含类型注解）返回 deny，理由是「禁止删除/改写已有测试用例或断言（**新增用例、追加断言放行**）」——一个全新文件既没删除也没改写任何东西。原因是 acorn 解析不了 TS 注解，`inspectTestAuthoring` 返回 `unsupported-or-incomplete-test-syntax`，而 `testDecision` 把这个原因一律映射成「既有标准」拒绝文案。仓库里这是常见动作（最近 800 个提交新增了 9 个 `.test.ts`，`origin/main` 上共 69 个 `.test.ts(x)`）。
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

- 假设 1：`source` 不是字符串 ⇔ 目标文件在磁盘上不存在。依据：`readExistingSource` 用 `lstatSync` + `readFileSync`，文件缺失、是目录或是符号链接时返回 `null`。可评审点：若将来改成「目录也返回内容」，这条放行会变宽。
- 假设 2：把「整条尾部缺失」按缺失处理不会放松路径安全。依据：`capturePath` 对每个存在的组件仍做 `realpathSync(path) !== path` 与 `lstatSync` 类型检查；缺失组件不参与 `openSync`，且「缺失层之下出现实体」会抛错。
- 假设 3：新增 TS 测试文件里若藏 `test.skip`，本次放宽后写入门禁不会再拦。依据：acorn 无法解析 TS，这是既有语法层盲区（CI 侧同一文件两侧都不可解析时也只报告不阻断）。可评审点：这是**已知取舍**，不是新引入的能力缺口。

## 证伪方式

- 若 `capturePath` 改动后，一个指向仓库外的符号链接目录下的新文件被放行，则假设 2 不成立，必须撤回。
- 若新增 `.test.ts` 在放行后仍能通过后续检查写入，且其中含 `test.skip`，需确认这是既有盲区而非本次放宽的副作用：把内容换成等价的可解析 `.test.mjs`，写入门禁应当**拒绝**。若它也放行，说明放宽范围超出预期。
- 若 `edit` 一个不存在的测试文件被放行，则改动破坏了 `missingAllowed` 语义。
- 若改写既有 `.test.ts` 断言不再被拒绝（在没有声明的情况下），则放宽误伤了既有标准的保护。

## 实测结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 门禁自身测试 | `node --test scripts/guard-anti-cheat.test.mjs` | **29/29 通过**（新增 5 条：两条放行 + 三条不溢出） |
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
| `edit` 不存在的测试文件 | deny | **deny** | deny（不溢出） |
| 改写既有断言（无声明） | deny | **deny** | deny（不溢出） |
| 经仓库外符号链接目录新建 | deny | **deny** | deny（安全假设 2 成立） |

## 新产品基线

无影响：只改门禁脚本，不涉及产品默认值、模型、路径或本地状态。

## 文档影响

`docs/contracts/anti-agent-fake-completion-guard.md` §3.1 已写明「写前防造假检查不扫描 `.md`…可解析的完整 JavaScript 测试候选可经语法检查形成」。本次放宽后需补一句：**纯新增（磁盘上无既有文件）的测试文件，若仅因 acorn 解析不了 TypeScript 注解而无法评估，则放行**；该文件因此不在写前检查范围内，与 CI 侧「两侧都不可解析只报告」的取舍一致。
