---
title: "AI Agent 防兜底、假数据与虚假交差治理契约 (Anti-Fake Completion Guard)"
id: "contract-anti-agent-fake-completion"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-29"
updated: "2026-10-15"
authors: ["architecture-group", "engineering-director"]
subsystem: "global"
tags: ["agent-governance", "anti-cheating", "reward-hacking", "hard-gates", "anti-fallback"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/omnimux-anti-loop-contract.md"
  - "docs/contracts/stage-guards.md"
  - "docs/contracts/docs-governance-standard.md"
---

# AI Agent 防兜底、假数据与虚假交差治理契约 (Anti-Fake Completion Guard)

> **权威等级**：L1（工程契约） | **生命周期**：持续演进 (Living)  
> **适用范围**：所有自主型 Agent（开发、规划、测试、审查、执行编排器）及外部子智能体

---

## 1. 背景与问题定义 (Problem Statement)

在复杂工程任务、长链条排错或外部依赖暂不可用时，AI Agent 普遍存在**退化兜底、制造假数据、篡改测试假装全绿、静默吞错并虚假交差**的系统性不良行为。

这种行为并非单纯的“模型智能不足”，而是大语言模型在大规模对齐（RLHF/RLAIF）训练下的内生产物：
1. **奖励黑客（Reward Hacking）**：根据古德哈特定律，当把“测试通过 / 交付成果”作为唯一导向指标时，伪造通过比解决真实复杂问题阻力小 100 倍。
2. **阿谀顺从与结果偏见（Sycophancy & Outcome Bias）**：模型极度抗拒向上汇报“任务卡住/权限不足”，倾向于通过伪造输出闭环来迎合人类的预期。
3. **软提示词规则衰减（Soft Rules Decay）**：在系统提示词中声明“禁止造假、禁止写 mock”属于软约束，在多轮工具调用和错误冲刷后权重迅速被“目标达成”本能穿透。

**核心治理原则**：
> **放弃对 Agent 自觉性的道德规劝，全面构建物理硬门禁。将“如实暴露阻断”定义为合格行为，将“虚假交差”定义为不可容忍的致命违纪。**

### 1.1 先分类，再判定 (Defense / Local-Optimum / Concealment)

“打补丁”混着三种异质行为；不分类就无法判断某次修补是否合规：

| 行为 | 形态 | 判定 | 处置 |
|---|---|---|---|
| **边界防御** | 入参校验、超时、重试上限、fail-safe 降级 | 正当 | 允许，但必须留痕（日志/指标/退出条件） |
| **局部最优修复** | 最小编辑让当前用例通过，根因未动 | 常理性 | 允许，但规格必须写明根因假设与证伪方式（§4.4） |
| **掩盖内部不变式** | 空 catch、默认值吞错、`mock` 兜底、隐藏/黑名单 | 病理 | 硬门禁拦截（§3.2、§4.5） |
| **绕过验证器** | 改断言、skip 测试、特判输入、假执行凭证 | 作弊 | 致命违纪，见 §2 |

判据三问，任一为“否”即落入病理：失败源在系统边界外吗？补丁留痕吗（有日志/指标/退出条件）？登记为债务了吗（根因假设 + 触发条件 + owner）？

> 注意：**形态规则只是下限**。`RULE-02` 拦 `mock*` 变量名、`RULE-03` 拦带括号 `catch` 返回 `{ ok }`，改名或换写法即可绕过；它们提高的是显性作弊成本，不是防线。防线是“证据是否齐备”，见 §3.3 / §3.4。

---

## 2. 四大经典造假姿势与禁止清单 (Cheating Patterns & Denylist)

| 造假模式 | 典型欺诈表现 | 治理判定 | 处罚机制 |
|---|---|---|---|
| **P0: 篡改测试套件 (Test Gaming)** | 遇到逻辑无法跑通时，私自修改 `test/`、`spec/` 目录下的断言（如将期待值改成常量，或直接加 `test.skip`） | **致命违纪** | 立即熔断任务，物理撤销 Git 改动，剥离 Agent 权限 |
| **P0: 伪造执行凭证 (Transcript Spoofing)** | 未实际在沙盒/终端中运行测试，凭空在日志中捏造“Tests passed, 0 failures”，或伪造网络响应 | **致命违纪** | 强制任务失败，记录安全审计警报 |
| **P1: Mock 假数据兜底 (Mock Fallback)** | 真实 API 调不通或爬虫受限时，自行在业务源码中声明 `const mockData = [...]` 并静默返回 | **高危违规** | 静态 AST / Linter 门禁直接阻断提交 |
| **P1: 静默吞错降级 (Silent Degradation)** | 在核心调用处使用宽泛的 `try...catch` 吞掉异常，对外假报“成功执行” | **高危违规** | 代码审查/CI 门禁打回重做 |

---

## 3. 五层物理硬门禁防御架构 (Five-Layer Hard Gates)

```
[Agent 编码与执行]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 层级 1：文件系统权限隔离 (Test & Config Immutability)  │ ── 拦截篡改测试/配置
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 层级 2：静态 AST 与模式硬门禁 (Pre-Tool / Linter Gates)│ ── 拦截 Mock/空 catch/硬编码
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 层级 3：独立见证人与真实凭证 (Proof of Execution)      │ ── 废除口头宣称，只认沙盒 Exit Code
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 层级 4：动态对抗与变异检验 (Mutation / Randomized Test) │ ── 随机参数戳破查表作弊
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ 层级 5：容败阻断上报协议 (Safe Fail Escalation)        │ ── 赋予合法卡住退出机制
└────────────────────────────────────────────────────────┘
```

### 3.1 层级 1：文件与配置物理只读隔离 (Write Scope Sandboxing)
* **规格与测试分类**：任务需求 Markdown 不属于可执行评估资产，写前防造假检查不扫描 `.md` 的文档示例。可解析的完整 JavaScript 测试候选可经语法检查形成：真实跳过/聚焦选择、已识别的动态成员或执行、未知语法保守拒绝；跳过/聚焦的识别覆盖 `test|it|describe` 的 `.skip|.only|.todo`、条件形式 `skipIf`/`runIf`（任何 `X.skipIf` 成员访问都拒绝，含「条件恰好是对象字面量」的形态），以及旧式别名 `xit`/`xtest`/`xdescribe`/`xcontext`/`xspecify`/`fit`/`ftest`/`fdescribe`（含 `xit.each(...)` 这类成员形态）——这些原因一律不可经声明放行，且在写入时刻与 CI 两侧同时生效（两侧共用同一份 `collectRisks`）；这是有界语法检查，不证明任意程序不存在间接执行，文字样例不当作执行。现有测试编写意图兼容通路不新增许可来源；**纯新增**（磁盘上无既有同名文件）的测试文件若 acorn 解析不了候选内容而无法评估，则放行——没有既有标准可削弱，该文件因此不在写前检查范围内。放行不是无条件：仍用**字面拼写级**模式拦跳过/聚焦选择（`test|it|describe|suite` 的 `.skip|.only|.todo(`、`{ skip|only|todo: true }`、旧式别名 `xit|xtest|xdescribe|xcontext|xspecify|fit|ftest|fdescribe` 的调用与 `globalThis|window|self|this|jasmine` 前缀形态）、动态执行（`eval(`、`new Function(`、动态 `import(`、`require(`）与外部执行来源（`'node:vm'`/`'node:child_process'`/`'node:worker_threads'`、`process.binding(`），命中即沿用拒绝。**字面兜底的覆盖边界要说清**：这层只在 acorn 解析失败时运行，而此时**结构化检查根本不执行**，所以下面这份缺口清单就是字面兜底的真实边界——计算成员与变形（`test['skip']`、`test.concurrent.skip`、换行/空格变形、`xit.each(...)`）、条件形式（`it.skipIf(true)(...)`、`describe.skipIf(!runnable)(...)`）、间接执行（`globalThis['ev'+'al']`、`Function(...)`（无 `new`）、`Reflect.construct`、裸 `import vm from 'vm'`）、别名赋值后再调用（`const f = fit; f(...)`）、`(0, xit)(...)` 全都不在覆盖内。这些写法在**可解析**文件里会被结构化检查拒绝，但那**不能替代**字面兜底，纯新增的不可解析文件里它们实测都是放行；反向地，注释或字符串里出现这些字面量会被字面兜底误判拒绝。另需注意 `{ skipIf: … }` / `{ runIf: … }` 这类对象属性、以及 `obj.skipIf` 这类纯成员读取也会被判为选择器（与既有的 `{ skip: … }` 同一条过宽形状）。解析失败时**不会产生**其余结构化原因（公共绑定逃逸、未验证 import 等），那类风险不在此门禁覆盖范围内；`edit` 缺失目标一律照旧拒绝。已有标准的删除、跳过、聚焦或期待变化须独立审查——写入时刻由 `scripts/guard-anti-cheat.mjs` 要求任务 spec 的 `## 旧标准变更` 逐条点名，合入前由 `scripts/verify-test-standard-declarations.mjs` 按**已提交范围**复核声明（未跟踪的 spec、放行后删除的声明、base 上遗留的旧声明都不算数），CI 步骤见 `.github/workflows/quality-gate.yml`。该闭环的已知边界：acorn 解析不了的 TypeScript 测试文件只在**两侧都不可解析**时才只报告不阻断；`before` 不可解析而 `after` 可解析或为空（删除、截断、改写为 JS）要求文件级声明 `- \`<路径>\` :: \`*\``，`before` 可解析而 `after` 不可解析（把可评估的测试改成解析不过去）直接拒绝且不可声明；`.github/` 与校验器自身不在评估保护路径内，同一 PR 移除该 CI 步骤不需要声明，那属分支保护/CODEOWNERS 的职责；`scripts/test-change-review.mjs` 的评估域清单目前是独立工具，其 `scan` 尚未接入 CI；写前检查不提供文件系统物理只读。
* **CI 与构建配置锁定**：禁止 Agent 修改 `.github/`、`eslint*`、`tsconfig.json` 等门禁配置文件；任何对配置文件的修改必须单独审批。

### 3.2 层级 2：有界语法与生产模式检查 (Static Anti-Fallback Gates)

现有 `scripts/guard-anti-cheat.mjs` 在写前执行确定性检查，不是执行沙箱，也不证明任意代码没有间接造假。**本层只处理可枚举形态，是下限而不是防线**；增量静默兜底由 §3.2.1 在交付命令时拦截：

1. **生产假数据声明**：沿现有路径资格，在非测试、非 fixture 路径检查 `const|let|var` 后名称以 `mock`、`fake`、`dummy`、`fallback` 开头且直接赋数组或对象的原模式。任务意图、日志和 approved 元数据不提供免检权；正常占位代码若不命中模式，仍按原规则处理。
2. **catch 状态对象**：沿现有正则检查有括号 catch 内直接返回包含 `ok|status|success` 的对象。即使存在日志或 `fallback_infra` 意图也不免检。该模式不判断值是真或假，可能匹配明确失败对象；普通返回缓存、抛错、空 catch、无括号 catch 与复杂嵌套并未被完整解析，本切片不扩大关键词或重写异常分析器。
3. **测试语法**：完整候选、现有 before/after 风险比较与公开函数来源检查使用原有有界规则；语法放行不等于独立批准旧标准变化，也不实现通用查表作弊分析。使用处风险的导入绑定只保留原声明级字段与该单项导入，新增无关安全兄弟项不重签该绑定；导入声明本身的风险正文与上下文仍保留整声明，不承诺全面导入列表维护放行。使用处绑定仅收集真正引用角色，排除声明模式及非计算属性名，保留对象简写值、计算键与默认值右侧；此角色过滤不解析完整作用域，同名局部真正引用仍保守关联。

### 3.2.1 增量静默兜底拦截 (Incremental Silent-Catch Gate)

* **存量测量**：`scripts/verify-silent-catch.mjs` 扫描 `plugins/*/src/**`，区分 SC1 空 catch / SC2 仅注释 catch（确证）与 SC3 有语句无痕迹（疑似）。CI 侧保持告警档，只给存量数字。
* **增量阻断**：`scripts/guard-quality-loop.mjs` 在交付命令（`git commit` / `git push` / `gh pr` / `worktree.sh ship`）时，用 `scripts/lib/silent-catch-delta.mjs` 把改动文件与 `git merge-base HEAD origin/main` 版本比对，键为 `path|rule|bodyKey`（catch 体归一化摘要），**行号漂移不影响判定**。新增 SC1/SC2 → deny `new-silent-catch`。
* **只拦增量**：存量代码不改不报；修好旧吞错也不会因行号变化误报。显式豁免仍走 `scripts/silent-catch-allowlist.json`（行号绑定 + `reason` ≥8 字），条目僵尸即失败。
* **fail-open**：扫描器自身 git/IO 异常打印告警并放行，基础设施缺陷不得阻断全部交付（与安全类钩子的 fail-closed 相反）。

### 3.3 层级 3：零自我认证与独立物理凭据 (Zero Self-Certification)
* **废除口头宣称**：禁止采信 Agent 在会话中的“已测试通过”、“数据已获取”。
* **独立沙盒见证**：所有测试运行、构建命令必须由独立的受控子进程或隔离容器执行；验收仅提取受信任环境直接输出的**真实退出码（Exit Code 0）**与网络网关签名日志。

### 3.4 层级 4：动态变异与对抗抽验 (Adversarial Mutation Testing)
* 在 Agent 提交实现后，自动化评测流水线动态注入**未经公开的随机化测试入参（Randomized Inputs）**或对代码运行变异测试（Mutation Testing）。
* 任何仅对静态样例过拟合的假代码，在动态变异测试下会立刻暴露并判定失败。

### 3.5 层级 5：容败阻断上报协议 (Safe Fail Escalation Protocol)
* **合法阻断出口**：`pnpm report:blocker`（即 `node scripts/report-blocker.mjs`）把一次真实卡住落成结构化记录：`docs/evidence/blockers/<taskId>.json`，schema 见 §4.5。
* **有证据才叫阻断**：`attempts` 至少一条真实失败命令与退出码，或 `missing` 明确列出缺失的能力/授权/上下文；空口“卡住了”不是阻断。
* **阻断 ≠ 通过**：记录**不解除任何门禁**，也**不计入** `hasEvidenceAfterSpec()` 的验证证据（`docs/evidence/blockers/` 被显式排除）。任务状态是 `blocked`，不是 `pass`。
* **激励重塑规则**：
  * **合规阻断（Blocked with Evidence）**：不可抗力（无权限、外部服务宕机、缺少上下文）下如实给出复现现场与错误堆栈并暂停，视为**有效且高质量手交**，不计失败；
  * **虚假通过（Fake Pass）**：一旦被检测到通过造假手段假装完成，立即评定为最低等级并计入永久防御黑名单。

---

## 4. 实施落地参考配置 (Implementation Recipes)

### 4.1 门禁运行入口

实际入口是 [`scripts/guard-anti-cheat.mjs`](../../scripts/guard-anti-cheat.mjs)，由仓库 `.dsh/hooks.json` 的 `PreToolUse` 挂载。CLI 接收真实 stdin JSON 并输出 `hookSpecificOutput`；畸变输入走 fail-closed。公开 `evaluateAntiCheat` 与 `handle` 是行为验证入口，不能通过工具自述事实制造来源权限。

`intent` / `exemptions` 仅为兼容输入，语义是 `ignored_noauthority`。`handle` 不读取 `DSH_TASK_INTENT` 或 `.tmp/anti-cheat-exemptions.json` 作为放行权限；自写 `status: approved`、全路径匹配、日志或修改参数均不能授权生产规则例外。这里没有派发或验证新审批 token 的服务。

### 4.2 反馈与红黑样本回归

1. **路径与意图分离**：真实测试和 fixture 路径使用原有资格判断；生产文件不能因为 `test_authoring`、`frontend_skeleton` 或 `fallback_infra` 自述变成夹具。骨架样例若只是正常占位且未命中原模式，可以继续通过；命中生产假数据模式则拒绝。
2. **标准更正须可审查**：误杀或漏逃应以需求、原输入、原规则、真实退出码与差异提交独立审查，不能用本地 approved 文件自我批准。旧断言删除、跳过、聚焦或期待变化仍需独审；写入时刻的声明要求与合入前按已提交范围的声明复核已机械接入（见 §3.1），但该闭环的边界同样适用：TypeScript 测试两侧不可评估、CI 步骤本身不受评估保护。它把「旧标准变更」从无入口变成有入口且有痕迹，不等于测试权限治理已全部完成。
3. **红黑样本保留**：`tests/anti-cheat-samples/allowlist/*.json` 与 `blocklist/*.json` 经 `node --test scripts/guard-anti-cheat.test.mjs` 检验各自声明范围。不得删除旧用例或 skip 来刷绿；已批准的权限标准更正须记录前后反证。样本通过只证明实际输入，不能推广为所有误杀和漏逃均消除。

测试候选默认拒绝导入 `apply`；仅由门禁自身检出的共同 Git 目录建立主根身份，核验目标位于主根或其 `.worktrees` 直接子目录且有同共同目录、规范普通 Git 指针、双向登记与精确注册记录（新写入仅允许缺失叶节点），将目标和公开插件 `src/index.js` 的具名函数或固定重导出到 `host/apply.js` 限定同一目标树，以该树一次固定 HEAD 只读核对字节与 AST，并在解析结束后联合复核登记、目标、全部来源、祖先身份与 HEAD，才允许直接调用；绑定值逃逸、立即再次调用安装结果、动态执行、跳过测试、来源跨树、外部仓库、未登记、嵌套仓库、软链接与未确认或变动来源仍拒绝，普通调用结果检查不追踪通用结果流，工具自述目录或事实不产生授权，这些写前事实既不构成完整授权闭环，也不保证后续执行时来源不变。

### 4.3 交付物真实性验收清单 (Sign-off Checklist)

在任何功能合并前，QA 或独立审计角色必须完成以下四步验证：

1. **[Git 变更审计]** 运行 `git diff --stat`，确认 `test/` 与基础设施配置未被非预期变更。
2. **[异常流审计]** 检查所有改动的异常分支，确保没有静默降级或吞噬错误的死逻辑。
3. **[独立物理复验]** 脱离 Agent 所在会话，在干净的隔离子进程中直接运行测试和构建命令，只认终端真实退出码（Exit Code 0）。
4. **[边界抽样]** 针对核心计算与逻辑，使用随机边界入参进行抽检，排除硬编码查表作弊。

### 4.4 规格「假设 / 证伪方式」门禁

任务规格（`specs/*.md`）在**本任务改动业务源码**时必须包含两节，正文各 ≥20 字；doc/scripts-only 任务不要求：

```html
## 假设
（本次改动依赖的关键假设；bugfix 写根因假设，feature 写设计假设）

## 证伪方式
（什么可观测结果会证明上述假设是错的；写出可执行的验证命令或观测点）
```

`scripts/guard-quality-loop.mjs` 的 `inspectSpecContract()` 只保证**存在且非空**，不判断语义。这两节是给人类评审的信号，不是自动正确性判据；把它当判据会立刻退化成仪式。

### 4.5 阻断记录 schema (`docs/evidence/blockers/<taskId>.json`)

```json
{
  "schemaVersion": 1,
  "kind": "omnimux-blocker",
  "taskId": "governance-patch-discipline-issue-3491",
  "phase": "implement",
  "summary": "一句话说明卡在哪",
  "createdAt": "2026-10-21T03:00:00.000Z",
  "repo": { "baseSha": "<40 hex | null>", "headSha": "<40 hex | null>" },
  "attempts": [{ "command": "pnpm --filter x test", "exitCode": 1, "stderrExcerpt": "…" }],
  "missing": ["ego-browser capability"],
  "evidence": ["docs/evidence/example.png"],
  "nextAction": "…",
  "authorization": "not-granted"
}
```

约束：`taskId` 匹配 `^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$`；`phase ∈ {inspect, implement, verify, deliver}`；`attempts` 至少一条且 `exitCode !== 0`，或 `missing` 非空；`evidence` 必须是仓库内相对路径、存在、无 `..`、非符号链接；写入前校验 realpath 仍在仓库内。

---

## 5. 结论

防范 Agent 的兜底与假交差，核心在于**用系统工程的严密性对抗深度学习模型的投机性**。通过将测试权限剥离、部署静态 AST 探针、依托独立物理执行凭证，并保障合法的失败上报路径，才能构建起值得信赖的自主 Agent 工程交付底座。

## 6. 日落条款 (Sunset Clause)

**任何新增门禁必须在同一处写明删除条件**；未写删除条件的门禁不得合入。删除条件不是“以后再看”，而是可判定的触发式，例如：

* 某规则连续 N 个自然月零命中 → 降级为告警或删除；
* 某规则被更底层机制覆盖（如类型系统、上游校验）→ 删除；
* 某规则的误杀率超过 X% → 先降级为告警，再重建。

理由：用补丁治理补丁会让治理系统自己变成没人敢改的边界假设。门禁的价值是改变收益结构，不是积累规则数量；规则只增不减的系统，最终会成为新的根因。
