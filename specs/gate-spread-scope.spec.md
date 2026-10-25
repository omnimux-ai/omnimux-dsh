# 门禁口径收窄：只有**调用位展开**才算执行风险（SpreadElement）

## 问题

`scripts/test-authoring-inspection.mjs` 的 `collectRisks` 把**任意** `SpreadElement` 归入
`dynamic-test-execution-needs-review`：

```js
if (node.type === 'SpreadElement' || node.type === 'ImportExpression' || node.type === 'WithStatement') risk('dynamic-test-execution-needs-review')
```

该原因**不在** `DECLARABLE_TEST_STANDARD_REASONS`（只有
`test-assertion-removed-or-rewritten` / `test-case-removed-or-renamed`），因此不可经
`## 旧标准变更` 声明放行——是硬拒。后果：测试里写 `[...arr]` / `{ ...obj }` 这种纯数据拷贝
会被判成执行风险，本仓已因此四次无谓拦住合法改动（P1b 一次、侧边栏豁免相关三次），每次返工一轮。
`specs/gate-preexisting-risk.spec.md` 的假设 4 已如实记录这个规则集缺陷，并把修复留给独立决策。

判定原则：**数组/对象展开是数据拷贝，不是执行**；真正需要拦的是**调用位展开**
（`f(...args)`、`new C(...args)`），因为它可以把任意实参传给任意被调用者。

本任务只改**规则集**这一处，不改风险身份口径（#3754 已修）、不改 `DECLARABLE_TEST_STANDARD_REASONS`。

## 假设

- 假设 1：`SpreadElement` 在 ESTree/acorn 里只可能出现在四处父节点：`ArrayExpression.elements`、
  `ObjectExpression.properties`、`CallExpression.arguments`、`NewExpression.arguments`。因此
  「是否调用位」可以用 **AST 父节点类型 + 是否位于 `parent.arguments`** 精确判定，不需要文本匹配。
- 假设 2：收窄只影响「非调用位展开」这一类风险：`[...arr]`、`{ ...obj }`、函数参数默认值位置的展开
  不再产生风险；`ImportExpression`、`eval`/`Function` 标识符、`require`、`WithStatement`、
  skip/focus 选择器、动态成员访问、公共绑定逃逸、解析失败字面兜底的行为完全不变。
- 假设 3：`scripts/test-authoring-inspection.test.mjs` 里以 `consume([...values])` 之类为夹具的用例
  依赖「展开=风险」。改夹具时必须保持覆盖强度不下降：每个原本验证「该位置的展开被拦」的用例改为
  验证「该位置的**调用位**展开被拦」，并为同样的结构位置补齐「数组/对象展开放行」的对侧。
- 假设 4：`scripts/guard-anti-cheat.test.mjs` 没有以展开为夹具的用例（只有断言/用例名类夹具），
  因此它只需要**新增**一条「调用位展开的原因不可声明」用例，不需要改写既有断言。
- 假设 5（新用户基线）：本改动是仓库内门禁脚本的判定规则，不涉及产品运行时路径、模型路由、
  本地状态或用户可见界面；新用户装机后跑 `pnpm test:gates` 不依赖任何开发机私有状态。缺依赖时
  脚本按 `acorn` 缺失直接报错（不静默放行），不新增默认路径。

## 证伪方式

- 证伪假设 1：用 acorn 遍历全仓受保护测试文件，枚举每个 `SpreadElement` 的实际父节点类型；
  若出现 `ArrayExpression`/`ObjectExpression`/`CallExpression`/`NewExpression` 之外的父类型，
  或出现「父节点是调用但不在 `arguments` 里」的形态 → 父节点判定不充分，实现要改。
- 证伪假设 2：对同一批真实文件分别用 `origin/main` 版实现与新版实现求风险集合，
  若两者的差集**不等于**「非调用位 SpreadElement 集合」，或 `ImportExpression`/`eval`/`require`/
  `WithStatement`/skip/focus/动态成员/公共绑定/解析失败任一条的判定发生翻转 → 收窄越界。
- 证伪假设 3：改完实现后 `node --test scripts/test-authoring-inspection.test.mjs
  scripts/guard-anti-cheat.test.mjs` 若仍有断言锁定旧口径（`[...arr]` 必须被拒）→ 夹具漏改。
- 证伪假设 4：`grep -n '\.\.\.' scripts/guard-anti-cheat.test.mjs` 若出现夹具形态的展开 → 假设不成立。
- 端到端证伪（真实反例，放宽型 §3.4.1）：在 `/tmp` 的仓库副本里**提交**一次真实改动，
  ① 给受保护测试文件加 `const copy = [...arr]` → `node scripts/verify-test-standard-declarations.mjs
  . origin/main` 必须 exit 0（放行）；② 改成 `fn(...args)` → 必须 exit 1 且原因不可声明；
  ③ 范围外仍红：`test.skip(...)`、`eval(...)`、`data[key]`、解析失败仍 exit 1。

## 旧标准变更

本节声明门禁自身测试里依赖「展开=风险」旧口径的断言改写（受保护路径
`scripts/test-authoring-inspection.test.mjs`）。逐条给出原断言、必须改的理由与新期望。

> 注：夹具只把 `consume([...values])` 换成 `consume(...values)`（同一结构位置上的**调用位**展开），
> 断言文字尽量逐字保持，使覆盖强度不下降——原来验「该位置的展开产生风险」的用例，
> 现在验「该位置的调用位展开产生风险」；「数组/对象展开放行」的对侧由新增用例统一覆盖。

- `scripts/test-authoring-inspection.test.mjs` :: `source literal imported local and binding kind changes still change existing risks`
  - 原断言：`inspectTestAuthoringDelta(literalBefore, "…consume([...values])").allowed === false`（第 115 行）
    与 `inspectTestAuthoringDelta("import values …consume([...values])", "import * as values …consume([...values])").allowed === false`（第 116 行）。
  - 理由：这两条断言把夹具字符串**内联**在断言参数里，收窄后 `[...values]` 两侧都不再产生风险，
    比较退化为「无风险 vs 无风险」→ 放行，断言不再成立；夹具必须换成调用位展开才能继续验证
    「import 来源/绑定种类变化会改变既有风险身份」。
  - 新期望：两条夹具改为 `consume(...values)`；断言结果仍为 `false`（来源、字面导入名、
    绑定种类变化仍改变风险身份）。断言文字随之改动，故逐条声明。
- `scripts/test-authoring-inspection.test.mjs` :: `unused known execution imports new spreads and unsupported candidates remain denied`
  - 原断言：`before` 为 `…consume([...values])`，对 8 个 after 变体 `inspectTestAuthoringDelta(...).allowed === false`；
    其中一条变体用 `consume([...values]); consume([...extra])` 表达「新增一处展开风险」。
  - 理由：收窄后数组展开不产生风险，整组比较退化为无风险 → 放行，断言不再成立。
  - 新期望：夹具改为 `consume(...values)` / `consume(...extra)`（调用位展开），断言仍为 `false`；
    用例名同步改为 `unused known execution imports new call-position spreads and unsupported candidates remain denied`
    （旧名「new spreads」在收窄后已不准确）。改名与断言改动逐条声明。
- `scripts/test-authoring-inspection.test.mjs` :: `role filtering preserves context slots and multiset excess while enclosing renames stay allowed`
  - 原断言：第 200-203 行把 `function first(safeApi) { consume([...values]) }` 改名为 `function second(...)`
    后 `allowed === true`；第 205 行用 `consume(() => [...values], () => 1)` ↔ `consume(() => 1, () => [...values])`
    验证「风险搬槽位 = 新增」。
  - 理由：夹具里的 `[...values]` 在收窄后不产生风险，「改名放行」这条会退化成「两侧都无风险」
    （仍然放行，但不再证明身份稳定）；「搬槽位 = 新增」这条会退化成放行，断言不再成立。
  - 新期望：夹具改为 `consume(...values)` 与 `consume(() => consume(...values), () => 1)` /
    `consume(() => 1, () => consume(...values))`；前者仍放行（改名是文本改动），后者仍拒绝
    （同一构造搬到不同回调槽位 = 新构造）。断言文字改动，逐条声明。

## 证伪实验记录

放宽型（缩小命中范围）——按 [anti-agent-fake-completion-guard §3.4.1](../docs/contracts/anti-agent-fake-completion-guard.md#341-新增或修改的守卫必须能被证伪-a-guard-only-guards-if-the-regression-fails-it)：
① 造出被豁免场景确认变绿；② 确认豁免范围之外仍红；③ 记录收窄前后的真实输出。实验装置：
`/tmp/gate-probe/`（`old-impl.mjs` = `git show origin/main:scripts/test-authoring-inspection.mjs`
逐字节副本，仅追加 `export { collectRisks }`；`new-impl.mjs` 同法取自本工作树），
`/tmp/gate-e2e/`（`git clone --shared` 的仓库副本，提交在里面造，仓库零改动）。

**① 被豁免场景：收窄前红 → 收窄后绿（全仓真实文件，2030 个受保护测试文件）**

| 变异（追加到真实测试文件） | 收窄前拒绝 | 收窄后拒绝 | 翻绿 |
| --- | --- | --- | --- |
| `const omnimuxProbeArrayCopy = [...arr]` | 2030 | 221（全为解析失败） | **1809** |
| `const omnimuxProbeObjectCopy = { ...obj }` | 2030 | 221（全为解析失败） | **1809** |

**② 范围外仍红（同一批 2030 个真实文件、同一命令）**

| 变异 | 收窄前拒绝 | 收窄后拒绝 | 翻绿 | 反向新增拒绝 |
| --- | --- | --- | --- | --- |
| `fn(...args)` | 2030 | 2030 | 0 | 0 |
| `new Ctor(...args)` | 2030 | 2030 | 0 | 0 |
| `test.skip('added', () => {})` | 2030 | 2030 | 0 | 0 |
| `eval(code)` | 2030 | 2030 | 0 | 0 |
| `data[key]` | 2030 | 2030 | 0 | 0 |
| `const m = import('./x')` | 2030 | 2030 | 0 | 0 |
| `const typed: number = 1` | 2030 | 2030 | 0 | 0 |

**③ 只窄在这一处（风险多重集差集；1809 个可解析受保护测试文件中 641 个含非调用位展开）**

- 旧实现风险 − 新实现风险 = **3020** 条；新实现风险 − 旧实现风险 = **0** 条。
- 3020 条全部 `reason === 'dynamic-test-execution-needs-review'` 且锚点是 `SpreadElement`
  （`diffReasonViolations = []`）；独立 acorn 遍历统计的非调用位 `SpreadElement` 数量同为 **3020**，
  调用位 `SpreadElement`（例如 `packages/generation-capabilities/test/assignment.test.mjs` 的 1 处）
  一条都没被移除。反向差集为空 → 没有任何新增风险、也没有任何其它原因被顺手放行。

**④ 真实端到端反例（`/tmp/gate-e2e`，真提交、真命令）**

在真实测试文件 `plugins/omnimux/src/catalog/list.test.js` 末尾追加一行后提交，跑
`node scripts/verify-test-standard-declarations.mjs . origin/main`：

| 提交内容 | 退出码 | 输出 |
| --- | --- | --- |
| 新规则 + 本 spec 的 3 条声明 | **0** | `✅ 没有被削弱的既有测试用例缺少声明。` |
| 同上，追加 `const omnimuxProbeCopy = [...arr]` | **0** | 放行（数组展开不再是执行风险） |
| 同上，追加 `const omnimuxProbeClone = { ...obj }` | **0** | 放行 |
| 追加 `fn(...args)` | **1** | `[M] …（dynamic-test-execution-needs-review）该原因不可经声明放行，必须撤回改动。` |
| 追加 `new Ctor(...args)` | **1** | 同上 |
| 追加 `test.skip('probe', () => {})` | **1** | `（test-execution-selector-needs-review）` |
| 追加 `eval(code)` | **1** | `（dynamic-test-execution-needs-review）` |
| 追加 `data[key]` | **1** | `（dynamic-test-member-needs-review）` |
| 追加 `const typed: number = 1` | **1** | `（evaluation-made-unparseable）` |
| **把规则换回 `origin/main` 版**，保留 `[...arr]` 那一行 | **1** | `[M] …（dynamic-test-execution-needs-review）` → 证明同一次编辑在收窄前确实是红的 |

副本已删除（`rm -rf /tmp/gate-probe /tmp/gate-e2e`），仓库工作树零改动。
本仓内直接跑 `node scripts/verify-test-standard-declarations.mjs . origin/main` 因**改动未提交**、
该命令只读已提交范围而看不到 diff（输出 `范围内新增声明条目：0`，exit 0）——这是该命令的既有边界，
真实结论以副本实验为准。

## 验收

1. `node --test scripts/test-authoring-inspection.test.mjs scripts/guard-anti-cheat.test.mjs`
   → **99 tests / 99 pass / 0 fail**（基线 95，本任务新增 4 条：`test-authoring-inspection` +3、
   `guard-anti-cheat` +1）。
2. `node scripts/verify-test-standard-declarations.mjs . origin/main` → **exit 0**
   （工作区未提交时只见已提交范围，输出 `范围内新增声明条目：0`）；真实范围由 `/tmp` 副本实验补足：
   带本 spec 的 3 条声明 → exit 0，`范围内新增声明条目：3`。
3. 两侧新用例（`test-authoring-inspection.test.mjs` 3 条 + `guard-anti-cheat.test.mjs` 1 条）：
   ①`f(...args)` / `new C(...args)` 硬拒且 `changedCases` 为空、`decideOldStandardDeclaration` 返回
   `null`（声明通道打不开）；②`[...arr]` / `{ ...obj }` 放行（既有构造与新增构造都放行，
   `inspectTestStandardChange` 也放行）；③嵌套 `f([...a])` 放行、`f(...a)` 拒绝；
   ④解析失败、skip/focus（含 `xit`）、`eval`/`new Function`、`require`、动态 `import`、动态成员仍硬拒。
4. `pnpm test:gates` → **exit 0**，第一批 `489 tests / 489 pass / 0 fail`（基线 486 + 本任务新增 3 条，
   `guard-anti-cheat.test.mjs` 不在该批次，见 `.github/workflows/quality-gate.yml:110` 单独跑），
   第二批 `18 tests / 18 pass / 0 fail`。`pnpm check:boundaries` → exit 0
   （`4510 source file(s) … verified`）。
5. 真实文件差异：全仓 2030 个受保护测试文件（1809 可解析 / 221 解析失败）中，
   「旧风险 − 新风险」= **3020** 条且**全部**是非调用位 `SpreadElement`，
   「新风险 − 旧风险」= **0** 条 —— 只窄在这一处，无任何其它原因翻转。
6. 合同措辞：`grep -rn '调用位|SpreadElement|任意展开' docs/ .agents/` 无命中，
   `docs/contracts/anti-agent-fake-completion-guard.md` §3.1 只写「已识别的动态成员或执行」，
   没有「任意展开」这类明文口径，故**无需改合同**；规则集真源在脚本与规格。

## 环境备注

- 工作树 HEAD = `dfc4e58e0`（创建时基于 `origin/main`）；本次会话中远端跟踪引用
  `origin/main` 前移到 `bb1cf79d`（主检出 `main` 的合并提交 #3781），因此 `git status` 显示
  `[behind 1]`。本任务未做 fetch / rebase / merge，也没有 commit / push。
- 工作树内 `pnpm install` 由 `pnpm check:boundaries` 自动触发，只产生被忽略的构建产物
  （`node_modules/`、`plugins/*/lib/`），`git status --short -uall` 仍只有 3 个改动脚本 + 1 个新 spec。

## 不做

- 不改风险身份口径（`canonical` / `structural` / `projectContexts` / 同形兄弟计数），#3754 已定。
- 不放松其它风险类别：`ImportExpression`、`WithStatement`、`eval`/`Function` 标识符、`require`、
  skip/focus（含旧式别名）、动态成员、公共绑定逃逸、解析失败字面兜底一律照旧。
- 不扩大 `DECLARABLE_TEST_STANDARD_REASONS`；不给调用位展开开声明通道。
- 不改 `specs/gate-preexisting-risk.spec.md`（#3754 的历史记录，其假设 4 由本任务解决）。
- 不 `git commit`/`push`；`/tmp` 副本仅作证伪证据，用完删除。
