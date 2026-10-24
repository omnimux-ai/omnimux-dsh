# 旧测试标准变更通道（spec 声明 + 门禁放行）

> 工作树：`.worktrees/test-standard-change-channel`（分支 `agent/test-standard-change-channel`，基于 `origin/main`）
> 动机：路线 A+C 修复中 2 条既有断言必须改写，但 `guard-anti-cheat` 写入时硬拒绝、无豁免入口，任务卡死
> 相关条款：`docs/contracts/anti-agent-fake-completion-guard.md:99,146`

## 背景

契约 §146 要求旧断言变更须独立审查，§99 自认「该闭环尚未机械接入」。现状结果是：门禁并没有阻止「标准被改」，只阻止了「由 agent 来改」——人类审阅后会用 `git apply` 落盘同一个变更。摩擦增加，安全未增加。

同时它制造了坏激励：agent 只剩「如实报阻断（任务停在 99%）」与「走门禁覆盖不到的通路（`bash` 未挂该 hook）」两条路，治理在惩罚诚实。

## 用户操作旅程

1. 开发者接到一个必须改写既有断言的修复（例如「旧断言逐字要求缺陷行为」）。
2. 在任务 spec 里新增 `## 旧标准变更` 一节，逐条写明：文件路径、用例名、原断言、为什么必须改、新期望及其真实证据。
3. 正常编辑测试文件。门禁发现断言被移除/改写后，先查 spec 声明；命中则放行，未命中则拒绝并**明确告知需要补哪条声明**。
4. 审查者在 PR 里同时看到三处：spec 声明的理由、diff 里的实际改动、CI `test-change-review` 产出的评估域变更清单。
5. 若 agent 想静默削弱测试：spec 里没有对应声明 → 门禁照旧拒绝，且拒绝信息会点名缺失的用例。

## 期望界面反馈

本变更为脚本与门禁层，无界面。开发者可见的反馈是门禁拒绝信息：

- 未声明时：明确列出「哪个文件、哪个用例需要声明」，并给出 `## 旧标准变更` 的书写格式。
- 已声明时：静默放行（不产生额外文件，避免污染 diff）。

## 变更点

### 1. `scripts/test-authoring-inspection.mjs`

- `collectAssertionFacts(code)` 增加两项返回（**纯新增字段，不改既有字段**）：
  - `caseAssertions`: `Map<用例名, Map<断言指纹, 计数>>`，只归属到最近的具名 `it`/`test`；
  - `unattributedAssertions`: `Map<断言指纹, 计数>`，不落在任何具名用例内的断言。
- 新增 `inspectTestStandardChange(before, after, trustedFacts)`，返回 `{ allowed, reason, scope, changedCases }`。
  - `changedCases` 只包含「断言被削弱或整条用例被删除」的**具名用例**；
  - **不落在具名用例内的断言削弱，仍然硬拒绝且不可声明**（保守：没有可点名的对象就不给通道）。
- `inspectTestAuthoringDelta` 改为投影该函数的 `{ allowed, reason, scope }` 三个字段，**行为与返回形状完全不变**（`scripts/test-authoring-inspection.test.mjs:212` 对返回值做了 `deepEqual`，加字段会破坏既有标准）。
- 新增纯函数 `parseOldStandardDeclarations(sectionText)`：解析 `## 旧标准变更` 正文，提取声明条目。
- 新增纯函数 `matchOldStandardDeclarations({ declarations, filePath, changedCases })`：返回 `{ ok, missing }`。

### 2. 声明格式（严格、可解析）

`## 旧标准变更` 正文中，每条声明一行，格式固定：

```
- `<仓库相对路径>` :: `<用例名>`
```

要求：路径为仓库相对、用例名逐字一致。不匹配的条目视为未声明（保守）。

### 3. `scripts/guard-anti-cheat.mjs`

- 对测试文件的 `edit`/`write`，当 delta 结论为 `test-assertion-removed-or-rewritten` 或 `test-case-removed-or-renamed` **且** `changedCases` 非空时：
  1. 用 `guard-quality-loop.mjs` 已导出的 `taskSpecs(root)` / `readSpecSections(text)` 取本任务 spec 的 `## 旧标准变更` 正文（**复用既有判定口径，不引入第二套来源**）；
  2. 该节正文去除空白后须 ≥ 20 字（沿用 `SPEC_SECTION_MIN_CHARS`）；
  3. 用 `matchOldStandardDeclarations` 逐条匹配「本文件 + changedCases」；
  4. 全部命中 → 放行；否则 → 维持拒绝，并在信息中点名缺失的用例。
- 其它拒绝原因（跳过、聚焦、动态执行、公共绑定逃逸等）**一律维持硬拒绝**，不进入本通道。
- **不写任何文件**：审查痕迹由 spec 声明（受版本管理）、diff、以及 CI 已接入的 `scripts/test-change-review.mjs` 评估域清单三处共同承载。原先提案中的 `docs/evidence/test-standard-changes/*.json` 取消——该目录被 git 忽略，写进去既到不了 PR，又会在 hook 里引入副作用。

### 4. 测试

- `scripts/test-authoring-inspection.test.mjs`：**仅追加**新用例（既有断言一字不动），覆盖 `inspectTestStandardChange` 的 `changedCases`、声明解析、声明匹配。
- `scripts/guard-anti-cheat.test.mjs`：**仅追加**新用例，覆盖「已声明放行」与「未声明仍拒绝」两个方向。

### 5. `scripts/guard-anti-cheat.mjs`（入口一致性修复）

同一个门禁有两个入口，但契约不一致：hook 路径 `handle()` 做前后对比，导出的 `evaluateAntiCheat()` 只做纯内容检查，因此后者**根本无法察觉断言被削弱**，会对同一份候选内容给出更宽松的结论。

修复：测试文件且目标已存在时，`evaluateAntiCheat` 改为用 `inspectTestStandardChange(before, code)` 比较磁盘现状；目标不存在时行为不变（新增文件只能做内容检查）。声明通道同时接入该入口。

**「两入口判定一致」的准确范围**（R1 两轮评审均指出，已更正）：一致的是**前后对比与声明判定**这部分。仓库身份校验并不一致——`handle()` 走 `createSourceInspection`，会拒绝路径里的嵌套 `.git` 与符号链接；`evaluateAntiCheat` 用 `repoRootOf(target)` 认领声明来源，不校验嵌套仓库，因此攻击者可在目标上方自建嵌套 `.git` 让它放行（实测：同目标同内容，`evaluateAntiCheat` = allow，`handle()` = deny）。该函数目前**未接入任何 hook 或 CI**（只被测试与合同文档引用），属潜在缺口，本任务未修，留作独立任务；本任务只保证**运行路径上的那个入口**是对的。

对既有样本无影响：`tests/anti-cheat-samples/*` 的 `filePath` 均为合成路径（`tests/unit/*.test.ts` 等），磁盘上不存在，仍走纯内容检查分支。

### 6. 运行环境事实（影响部署方式）

`.dsh/hooks.json` 用相对命令（`node scripts/guard-anti-cheat.mjs`），相对**会话 cwd（主检出）**解析。因此本通道只有在合入 main 后才对 hook 生效；工作树内改动不会被运行中的 hook 使用。这是治理类改动的正常时序，但必须写进交付说明，避免误以为「改完立刻生效」。

## 旧标准变更

**本任务未作废任何既有断言，本范围内也不需要任何声明**（校验器实测 `declarationCount: 0`）。过程如实记录两次遭遇：

1. **追加的一条用例断言错了观察点。** 它假设 `evaluateAntiCheat` 能察觉断言被削弱，但该函数当时只做纯内容检查、没有 `before`，对同一份候选内容会给出比 hook 路径更宽松的结论。门禁正确拦下了我对它的改写（`test-case-removed-or-renamed`）。处置方式是修**产品缺口**而非改**测试**：让 `evaluateAntiCheat` 在目标文件已存在时与磁盘现状比较（变更点 5）。该用例随即以原样合法通过。
2. **后补 CI 校验时又想改掉自己刚建的一条用例**（`未跟踪的 spec 声明不算数（H1：声明必须进本范围）`）。我当时认为它断言错了性质——未跟踪文件会让候选检出变脏，而 CI 校验要求干净检出，于是它抛的是 `candidate-has-uncommitted-changes` 而非违规。我按协议在本 spec 里加了声明，**编辑仍被拒绝**——运行中的 hook 用的是主检出的脚本，本工作树的通道改动要合入 main 才生效（变更点 6）。最终仍选择让实现满足该用例的真实性质：校验器只读已提交范围，本就不需要工作树干净，故显式关闭 `requireClean`（变更点 5）。**该用例最终保持原名与原文，以原样合法通过**——CI 日志里可见此名。

两次都落在「修产品缺口、不改测试」，所以本范围内既没有作废既有断言，也没有消耗任何声明。这比「用自己的通道给自己开绿灯」更有说服力。

## 实测结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| CI 声明校验（真实范围） | `node scripts/verify-test-standard-declarations.mjs . origin/main` | 退出码 0；`declarationCount: 0`，无违规 |
| 声明校验测试 | `node --test scripts/verify-test-standard-declarations.test.mjs` | **9/9 通过** |
| 通道端到端（真实 `handle()`） | 有声明 → allow；撤声明 → deny 并点名缺失用例 | **符合预期** |
| 门禁自身测试 | `node --test scripts/guard-anti-cheat.test.mjs` | **24/24 通过** |
| 语法层评估测试 | `node --test scripts/test-authoring-inspection.test.mjs` | 全绿（含既有 `deepEqual` 契约用例） |
| 评估域清单 | `node --test scripts/test-change-review.test.mjs` | **4/4 通过**（抽取 `readEvaluationChanges` 后行为不变） |
| 治理登记 | `node --test scripts/verify-governance-registry.test.mjs` | **4/4 通过** |
| 门禁套件 | `pnpm test:gates` | 455 / 443 通过 / **12 失败，与基线失败集合逐条同名**（用例数 446 → 455 即本次新增的 9 条） |

端到端验证方式：向本任务 spec 临时加入 `## 旧标准变更` 声明，用一条削弱该用例断言的编辑调用 `handle()`——有声明时 `allow`，撤销声明后 `deny` 且信息点名缺失用例；spec 事后还原。这条同时证明 root 传递正确：声明是从**被改文件所属的工作树**读到的，而不是门禁自己的检出根（主检出），否则通道在仓库强制的 worktree 工作流下完全失效。

`pnpm test:gates` 的 12 个失败全部为既有环境/内容问题，与本改动无关：9 个直接报 `EVIDENCE_FIXTURE_ENV_REQUIRED`（缺测试环境前置），1 个是 agent 预设内容违规，2 个源于 `plugins/omnimux-forms/assets` 在 git 中无跟踪文件。改动前后失败集合完全相同，用例数 +3 即本任务在 `test-authoring-inspection.test.mjs` 追加的 3 条。

### 更正：门禁自身测试的 CI 覆盖

本节先前写「`scripts/guard-anti-cheat.test.mjs` 没有被任何 package.json 脚本引用，因此回归测试从不运行」，并据此把它加入 `test:gates`。**该表述是错的**：`origin/main:.github/workflows/quality-gate.yml:109` 已经运行 `node --test scripts/guard-anti-cheat.test.mjs`，该文件本来就在 CI 跑。相应地 `package.json` 的改动已撤回——它无害但多余，且会让 diff 与事实不符。

## 独立评审结论（R1，合入前）

评审对 HEAD `df6023435` 出具「**需修改，不建议按当前形态合入**」。匹配逻辑经 108 组差分模糊测试**未发现严格性回退**（无「不声明即放行」路径；路径/用例名精确匹配；其它拒绝原因不进入通道；符号链接与嵌套仓库 fail-closed）。但**授权来源不成立**：

- **H1（高，已由我复核）** 声明可放在**未跟踪**的 `specs/*.md` 里——`taskSpecs` 走 `git status -uall` 会读到它，而它**不在** `origin/main...HEAD` 的 PR diff 里。于是「改测试 → 写未跟踪声明放行 → 删声明 → 提交测试」全程无声明进入 PR。复核：`specs/zz-probe.spec.md` 出现在 `git status`、不在 `git diff origin/main...HEAD`。本仓 AGENTS.md 明确 spec 未跟踪是常态，所以这不是边缘情形。
- **M1（中）** `evaluateAntiCheat` 会被攻击者自建的嵌套 `.git` 当作声明来源而放行；同一目标经 `handle()` 会 deny。变更点 5 宣称的「两入口判定一致」因此不成立（该函数目前未接入 hook/CI，属潜在缺口）。
- **L1/L2/L3/L5** 「≥20 非空白字符」几乎不设防；同名用例一条声明覆盖全部；声明不绑定某次编辑或提交；新增测试**没有**覆盖 `handle()` + 真读磁盘 spec 的放行路径。

**结论：本 PR 在修复 H1 之前不得合入。** 写入时刻的门禁天然只能提供早期反馈；真正闭环需要 CI 侧按 commit range 复核声明。

### H1 的闭环（已实现）

按「补 CI 侧校验」落地，写入时刻的门禁保留为早期反馈：

- 新增 `scripts/verify-test-standard-declarations.mjs`：对**本提交范围**内被削弱的既有测试用例，要求**同一范围**的 spec 里有逐条声明；否则退出码 1 并点名缺失用例。
- 声明只从**已提交**内容读取（`readEvaluationChanges` 的 blob），未跟踪的 `specs/*.md` 与事后删除的声明都不算数。判定口径与 hook 共用 `isProtectedTestPath` / `inspectTestStandardChange` / `parseOldStandardDeclarations` / `matchOldStandardDeclarations`，避免两处漂移。
- `scripts/test-change-review.mjs` 抽出 `readEvaluationChanges(root, base, { requireClean })`：`scan` 保持「候选必须干净」的既有契约；声明校验只读已提交范围，因此显式关闭该要求（HEAD 身份仍前后各校验一次），否则本地脏检出无法预览结论。
- 接线：`.github/workflows/quality-gate.yml` 新增步骤，用仓库既有的 `QA_BASE`（PR base / merge_group base / push before / origin/main）作为范围基线；`fetch-depth: 0` 已满足历史需求。
- 新增 `scripts/lib/git-fixture-repo.mjs`（临时 git 仓库夹具，登记为 `ciRequired`）：测试文件受评估契约保护，不允许新增 `node:child_process` 之类高风险导入，故夹具单独成模块。

### 第二轮评审后的收紧

第一版 CI 校验把 H1 关上了，但自身有两条零声明通道，第二轮评审逐条实测出来，现已修复：

- **H3「把测试改到解析不过去」**：原先解析失败一律记为 `unevaluable` 且不阻断。现按两侧分流——`before` 可解析而 `after` 不可解析 = **销毁可评估性**，直接违规且**不可声明**（否则这就是一条免声明通道）；`before` 不可解析而 `after` 可解析或为空 = 无法枚举用例，改要求**文件级声明** `- \`<路径>\` :: \`*\``；两侧都不可解析仍仅报告不阻断（否则 254 个 TS 测试文件的日常改动都会挂 PR）。
- **H4「改名出保护集」**：原先只判新路径，`plugins/demo/src/a.test.mjs → ….bak` 这类改名整条被跳过。现保护判定同时看新旧路径，且**声明点名的始终是原本受保护的那个文件**（改名时旧路径才是契约来处）。
- **H2「声明跨 PR 复用」**：原先只要求「范围内 spec 有改动」且候选内容里有匹配声明，于是 base 上遗留的旧声明 + 给 spec 加个空行即可放行，diff 里看不到任何新声明。现只统计 **after 相对 before 新增**的声明行。
- **H5「校验器与 CI 步骤可被同一 PR 改写」**：补上元门禁断言——CLI 对未声明削弱必须退出码 1、对已声明必须 0；`quality-gate.yml` 中必须存在该步骤。
- **L1**：可声明原因集合收敛为 `guard-anti-cheat.mjs` 单一导出 `DECLARABLE_TEST_STANDARD_REASONS`，CI 侧不再另写一份。

### 已知盲区（显式报告，不阻断）

acorn 解析不了 TypeScript 注解，因此 `.test.ts` / `.spec.ts` 一律得到 `unsupported-or-incomplete-test-syntax`。实测仓库有 **254 个** TS 测试文件，抽样 3 个全部无法解析；hook 同样处理不了它们——这是既有机制的限制，不是本次引入。校验器把这类文件计入 `unevaluable` 并在输出中列出，**不因此判失败**，否则任何触碰其中之一的 PR 都会挂。关闭它需要 TS 感知的解析器，属独立任务。

## 假设

1. **写入时刻无法判断正当性，但可以判断「是否被点名」。** 因此通道不试图判断理由成立与否，只要求变更对象被显式点名；理由是否成立交给审查者。这是本方案与原门禁的核心分歧，也是它能同时保住「不静默」与「不卡死」的原因。
2. **具名用例是可点名的稳定单位。** 用例名由 `it`/`test` 的字面量首参给出，在 diff 中可见、在 spec 中可引用；而断言指纹是人读不懂的哈希，不适合作为声明对象。
3. **只放开两类拒绝原因不会削弱原门禁的主要防线。** 原门禁还拦「跳过/聚焦/动态执行/公共绑定逃逸/危险导入」等，这些与「旧标准更正」无关，保持硬拒绝即可。
4. **既有测试标准本身不可改写。** `test-authoring-inspection.test.mjs:212` 对返回值做 `deepEqual`，因此必须新增函数而不是给原函数加字段；这也是本次实现形状的直接约束。
5. **`docs/evidence/` 被 git 忽略。** 实测该目录下文件不出现在 `git status`，所以审查记录不能落在那里，否则 PR 里看不到。
6. **spec 判定口径可复用。** `guard-quality-loop.mjs` 已导出 `taskSpecs`/`readSpecSections`/`SPEC_SECTION_MIN_CHARS`，直接复用可避免第二套「什么算任务规格」的判定。

## 证伪方式

1. **原函数形状未被破坏**：`node --test scripts/test-authoring-inspection.test.mjs` 必须全绿，特别是 `:212` 的 `deepEqual` 用例。若该用例失败，说明我给 `inspectTestAuthoringDelta` 加了字段，假设 4 被证伪。
2. **`changedCases` 能点名**：对 `before = "test('c', () => { assert.equal(a(), 1) })"` 与 `after = "test('c', () => { assert.equal(a(), 2) })"`，`inspectTestStandardChange(before, after).changedCases` 必须含 `'c'`；对纯新增用例的场景必须为空。任一不符即变更点 1 被证伪。
3. **未声明仍然拒绝（反向）**：无 `## 旧标准变更` 声明时，削弱既有断言必须仍被 `deny`。若被放行，说明通道变成了绕过门禁的后门，方案的根本目标被证伪。
4. **已声明才放行（正向）**：spec 中逐条声明「文件 + 用例名」后，同一编辑必须放行。若仍被拒，说明匹配口径过严，方案不可用。
5. **点名不全仍拒绝**：`changedCases` 有 2 个用例而只声明 1 个时，必须拒绝并点名缺失的那个。若放行，说明匹配未逐条校验。
6. **不产生额外文件**：放行后 `git status` 不得新增未被开发者写入的文件。若出现 `docs/evidence/test-standard-changes/*`，说明变更点 3 的「不写文件」未生效。
7. **治理测试通过**：`node --test scripts/verify-governance-registry.test.mjs` 必须 4/4（本次不新增脚本文件，预期无需登记）；`pnpm test:gates` 相对基线的失败集合不得扩大。

## 新产品基线

不涉及产品路径、模型路由或本地状态。门禁改动只在开发期生效，不进入运行时，不影响新用户安装后的任何行为。

## 文档影响

- 需在 `docs/contracts/anti-agent-fake-completion-guard.md` 补一句：旧标准变更的机械通道已接入，声明格式与适用范围（§146/§99 的现状描述随之更新）。
- 本方案不改变 §146 的实质要求（仍须独立审查），只是把「写入时硬拒绝」换成「写入时要求点名 + 审查时判断理由」。
