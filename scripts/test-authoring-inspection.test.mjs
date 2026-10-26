import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectTestAuthoring, inspectTestAuthoringDelta, inspectTestStandardChange, parseOldStandardDeclarations, matchOldStandardDeclarations } from './test-authoring-inspection.mjs'
import './public-plugin-apply.test.mjs'

test('normal complete assertion and literal runner candidates are writable', () => {
  for (const source of [
    "import assert from 'node:assert/strict'; assert.equal(actual, expected)",
    "import test from 'node:test'; test('normal', () => {})",
    "import test from 'node:test'; test('normal', {skip:false,todo:false}, () => {})",
    "import {test as check} from 'vitest'; check('normal', () => {}, 100)",
    "const example = {getBuiltinModule:'text'}; test('https://example.test/.skip', () => {})",
  ]) assert.equal(inspectTestAuthoring(source).allowed, true, source)
})

test('focus options cannot silently filter registered tests', () => {
  for (const key of ['only', "'only'", "['only']"]) {
    assert.equal(inspectTestAuthoring("test('must run', {" + key + ":false}, () => {})").allowed, false, key)
  }
})

test('skip and todo use explicit boolean semantics rather than truthiness', () => {
  for (const key of ['skip', 'todo']) {
    for (const value of ['0', 'null', "''", 'true', '1']) {
      assert.equal(inspectTestAuthoring("test('must run', {" + key + ':' + value + "}, () => {})").allowed, false, key + ':' + value)
    }
    assert.equal(inspectTestAuthoring("test('normal', {" + key + ":false}, () => {})").allowed, true)
  }
})

test('comments strings and quoted selectors cannot change the execution decision', () => {
  for (const source of [
    "test . /* comment */ skip('must run', () => {})",
    "test['skip']('must run', () => {})",
    "test('https://example.test/', {'skip' /* comment */:true}, () => {})",
    "test('normal', {skip // comment\n:true}, () => {})",
  ]) assert.equal(inspectTestAuthoring(source).allowed, false, source)
  assert.equal(inspectTestAuthoring("test('literal skip only todo', () => {})").allowed, true)
})

test('explicit builtin execution accessors cannot masquerade as string examples', () => {
  for (const source of [
    "globalThis['eval']('code')",
    "new globalThis['Function']('code')",
    "(() => {}).constructor('code')()",
    "import vm from 'node:vm'; vm.runInThisContext('code')",
    "process.getBuiltinModule('vm').runInThisContext('code')",
    "const {getBuiltinModule:load}=process; load('vm')",
    "import {getBuiltinModule as load} from 'node:process'; load('vm')",
  ]) assert.equal(inspectTestAuthoring(source).allowed, false, source)
})

test('unknown options and unsupported syntax are honestly refused', () => {
  for (const source of [
    "import test from 'node:test'; test(JSON.parse('{}'), () => {})",
    "import test from 'node:test'; test('name', options, () => {})",
    "const opts={...parsed}; test('name', opts, () => {})",
    "test[key]('name', () => {})",
    "const value: number = 1",
    'test(',
  ]) assert.equal(inspectTestAuthoring(source).allowed, false, source)
})

test('unused safe sibling imports preserve existing use-site risks only in delta inspection', () => {
  const before = "import { values } from './domain.mjs'; consume(...values)"
  const after = "import { values, safeApi } from './domain.mjs'; consume(...values)"
  assert.equal(inspectTestAuthoringDelta(before, after).allowed, true)
  assert.equal(inspectTestAuthoring(after).allowed, false)

  // 测试契约：禁削弱、放行新增。断言指纹与用例名缺失即视为削弱。
  const contractBefore = "import test from 'node:test'; import assert from 'node:assert/strict'; test('keeps contract', () => { assert.equal(actual(), 1) })"
  const contractBase = "import test from 'node:test'; import assert from 'node:assert/strict'; test('keeps contract', () => { assert.equal(actual(), 1) })"
  assert.equal(inspectTestAuthoringDelta(contractBefore, contractBase + "; test('adds coverage', () => { assert.equal(other(), 2) })").allowed, true)
  assert.equal(inspectTestAuthoringDelta(contractBefore, "import test from 'node:test'; import assert from 'node:assert/strict'; test('keeps contract', () => {})").allowed, false)
  assert.equal(inspectTestAuthoringDelta(contractBefore, "import test from 'node:test'; import assert from 'node:assert/strict'; test('keeps contract', () => { assert.equal(actual(), 2) })").allowed, false)
  assert.equal(inspectTestAuthoringDelta(contractBefore, "import test from 'node:test'; import assert from 'node:assert/strict'; test('renamed contract', () => { assert.equal(actual(), 1) })").allowed, false)
})

test('default namespace and literal named bindings ignore unused safe siblings at use sites', () => {
  for (const [before, after] of [
    ["import values from './domain.mjs'; consume(...values)", "import values, { safeApi } from './domain.mjs'; consume(...values)"],
    ["import * as values from './domain.mjs'; consume(...values)", "import safeApi, * as values from './domain.mjs'; consume(...values)"],
    ["import { 'values' as values } from './domain.mjs'; consume(...values)", "import { 'values' as values, safeApi } from './domain.mjs'; consume(...values)"],
  ]) {
    assert.equal(inspectTestAuthoringDelta(before, after).allowed, true, after)
    assert.equal(inspectTestAuthoring(after).allowed, false, after)
  }
})

test('supported import attributes preserve siblings but retain value raw and key identity', () => {
  const before = "import { values } from './domain.mjs' with { type: 'json' }; consume(...values)"
  const after = "import { values, safeApi } from './domain.mjs' with { type: 'json' }; consume(...values)"
  assert.equal(inspectTestAuthoringDelta(before, after).allowed, true)
  for (const changed of [
    "import { values } from './domain.mjs' with { type: 'text' }; consume(...values)",
    'import { values } from \'./domain.mjs\' with { type: "json" }; consume(...values)',
    "import { values } from './domain.mjs' with { format: 'json' }; consume(...values)",
    "import { values } from './domain.mjs'; consume(...values)",
    "import { values } from './domain.mjs' assert { type: 'json' }; consume(...values)",
  ]) assert.equal(inspectTestAuthoringDelta(before, changed).allowed, false, changed)
})

test('source literal imported local and binding kind changes still change existing risks', () => {
  const before = "import { values } from './domain.mjs'; consume(...values)"
  for (const after of [
    "import { values } from './other.mjs'; consume(...values)",
    'import { values } from "./domain.mjs"; consume(...values)',
    "import { otherValues as values } from './domain.mjs'; consume(...values)",
    "import { values as renamed } from './domain.mjs'; consume(...renamed)",
    "import values from './domain.mjs'; consume(...values)",
    "import * as values from './domain.mjs'; consume(...values)",
    "import { 'values' as values } from './domain.mjs'; consume(...values)",
  ]) assert.equal(inspectTestAuthoringDelta(before, after).allowed, false, after)
  const literalBefore = "import { 'values' as values } from './domain.mjs'; consume(...values)"
  assert.equal(inspectTestAuthoringDelta(literalBefore, "import { 'otherValues' as values } from './domain.mjs'; consume(...values)").allowed, false)
  assert.equal(inspectTestAuthoringDelta("import values from './domain.mjs'; consume(...values)", "import * as values from './domain.mjs'; consume(...values)").allowed, false)
})

test('unused known execution imports new call-position spreads and unsupported candidates remain denied', () => {
  const before = "import { values } from './domain.mjs'; consume(...values)"
  for (const after of [
    "import { values, eval as extraExecution } from './domain.mjs'; consume(...values)",
    "import { values, constructor as extraExecution } from './domain.mjs'; consume(...values)",
    "import { values } from './domain.mjs'; import vm from 'node:vm'; consume(...values)",
    "import { values } from './domain.mjs'; import worker from 'node:worker_threads'; consume(...values)",
    "import { values } from './domain.mjs'; consume(...values); consume(...extra)",
    "import { values } from './domain.mjs'; consume(...values); const typed: number = 1",
    "import { values } from './domain.mjs'; consume(...values); test(",
    "import type { values } from './domain.mjs'; consume(...values)",
  ]) assert.equal(inspectTestAuthoringDelta(before, after).allowed, false, after)
})

test('pattern-only names do not bind an old dynamic import to new static items', () => {
  const before = "test('read', async () => { const { readFileSync } = await import('node:fs'); readFileSync(path) })"
  const after = "import { readFileSync, statSync, lstatSync, realpathSync } from 'node:fs'; " + before
  assert.equal(inspectTestAuthoringDelta(before, after).allowed, true)
  assert.equal(inspectTestAuthoring(after).allowed, false)
})

test('declarations and noncomputed names are not references in risk bodies or contexts', () => {
  for (const before of [
    "async function read() { const { safeApi: local, nested: [other, ...rest] } = await import('./data.mjs') }",
    "async function read() { const [safeApi = 1, ...rest] = await import('./data.mjs') }",
    "async function read() { const { other: safeApi } = await import('./data.mjs') }",
    "async function read() { const { nested: [safeApi, ...rest] } = await import('./data.mjs') }",
    "function read(safeApi, { nested: [other] }, ...rest) { consume(...values) }",
    "function read(...safeApi) { consume(...values) }",
    "consume((safeApi) => consume(...values))",
    "try { step() } catch (safeApi) { consume(...values) }",
    "consume(function safeApi() { return consume(...values) })",
    "consume(class safeApi extends factory(...values) {})",
    "try { step() } catch ({ safeApi }) { consume(...values) }",
    "consume({ safeApi: factory(...values) })",
    "consume({ safeApi() { return consume(...values) } })",
    "class Example { safeApi = factory(...values) }",
    "consume(object.safeApi, ...values)",
    "safeApi: for (;;) { consume(...values); break safeApi }",
    "import { safeApi as local } from './data.mjs'; consume(...values)",
    "const value = 'safeApi'; consume(...values)",
  ]) {
    const after = "import { safeApi } from './safeApi'; " + before
    assert.equal(inspectTestAuthoringDelta(before, after).allowed, true, before)
    assert.equal(inspectTestAuthoring(after).allowed, false, before)
  }
})

test('shorthand computed and default expressions remain genuine references', () => {
  for (const before of [
    'consume({ safeApi }, ...values)',
    'consume({ [safeApi]: 1 }, ...values)',
    'consume(object[safeApi], ...values)',
    "async function read() { const { [safeApi]: local } = await import('./data.mjs') }",
    "async function read() { const { local = safeApi } = await import('./data.mjs') }",
    "async function read() { const [local = safeApi] = await import('./data.mjs') }",
    'function read(local = safeApi) { consume(...values) }',
    'function read({ local = safeApi }) { consume(...values) }',
    'function read({ [safeApi]: local }) { consume(...values) }',
    'try { step() } catch ({ local = safeApi }) { consume(...values) }',
    'consume({ safeApi = fallback } = input, ...values)',
    'consume({ safeApi }, ...safeApi)',
    'consume(safeApi, ...values)',
  ]) {
    const after = "import { safeApi } from './domain.mjs'; " + before
    assert.equal(inspectTestAuthoringDelta(before, before).allowed, true, before)
    assert.equal(inspectTestAuthoringDelta(before, after).allowed, false, before)
  }
})

test('genuine locally shadowed references remain conservatively associated without scope analysis', () => {
  for (const before of [
    'function read(safeApi) { consume(...safeApi) }',
    'function read() { const safeApi = values; consume(...safeApi) }',
    '{ let safeApi = values; consume(...safeApi) }',
    'function read(safeApi, local = safeApi) { consume(...values) }',
  ]) assert.equal(inspectTestAuthoringDelta(before, "import { safeApi } from './domain.mjs'; " + before).allowed, false, before)
})

test('role filtering preserves context slots and multiset excess while enclosing renames stay allowed', () => {
  // 位置身份不含文本：给包裹函数改名是维护动作，构造与位置结构都没变 → 放行（#3754）。
  assert.equal(inspectTestAuthoringDelta(
    "function first(safeApi) { consume(...values) }",
    "function second(safeApi) { consume(...values) }",
  ).allowed, true)
  // 同一调用位展开挪到另一个参数位——构造没变 → 放行（形状身份，不含位置上下文）。
  assert.equal(inspectTestAuthoringDelta(
    "consume(() => consume(...values), () => 1)",
    "consume(() => 1, () => consume(...values))",
  ).allowed, true)
  for (const [before, after] of [
    ["function read() { consume(...values) }", "function read() { consume(...values) } function readAgain() { consume(...values) }"],
    ["consume(...values)", "consume(...values); consume(...values)"],
    ["consume(...values)", "consume(...values); eval(code)"],
    ["consume(...values)", "import vm from 'node:vm'; consume(...values)"],
  ]) assert.equal(inspectTestAuthoringDelta(before, after).allowed, false, after)
})

test('unrelated literal parent callbacks preserve existing dynamic member risks in delta only', () => {
  const before = "test('first', async () => { data[key] }); test('second', async () => { other[index] })"
  const after = "test('unrelated', async () => {}); " + before
  assert.deepEqual(inspectTestAuthoringDelta(before, after), {
    allowed: true,
    reason: null,
    scope: 'syntax-only; changed test standards still require independent review',
  })
  assert.equal(inspectTestAuthoring(after).allowed, false)
})

test('parent stability uses only source strings without fixture graph or import authority', () => {
  for (const prefix of [
    '',
    "import test from 'node:test'; ",
    "import { safeApi } from './notGraph.mjs'; ",
    "import { apply } from './unknown-source.mjs'; ",
  ]) {
    const body = "test('first', async () => { data[key] }); test('second', async () => { other[index] })"
    const before = prefix + body
    const after = prefix + "test('unrelated', async () => {}); " + body
    assert.equal(inspectTestAuthoringDelta(before, after).allowed, true, prefix)
    assert.equal(inspectTestAuthoring(after).allowed, false, prefix)
  }
  assert.equal(inspectTestAuthoring("import { apply } from './unknown-source.mjs'; apply(ctx)").allowed, false)
})

test('parent domains retain repeated risks and multiset excess denials', () => {
  for (const [before, after] of [
    ["test('first', async () => { data[key] })", "test('first', async () => { data[key] }); test('first', async () => { data[key] })"],
    ["test('first', async () => { data[key] })", "test('first', async () => { data[key]; data[key] })"],
  ]) assert.equal(inspectTestAuthoringDelta(before, after).allowed, false, after)
  // 前面插入的同形空用例不含风险构造，既有构造的数量与形状都没变 → 放行（#3754）。
  assert.equal(inspectTestAuthoringDelta(
    "test('first', async () => { data[key] })",
    "test('first', async () => {}); test('first', async () => { data[key] })",
  ).allowed, true)
})

test('parent domains preserve callback slots literal titles scope and risk bodies', () => {
  // 同一构造只挪位置（参数位、包裹函数、回调参数）——构造没变，放行。
  for (const [before, after] of [
    ["consume('first', async () => { data[key] }, async () => {})", "consume('first', async () => {}, async () => { data[key] })"],
    ["test('first', async () => { data[key] })", "test('first', async () => { async function nested() { data[key] } })"],
    ["test('first', async () => { data[key] })", "test('first', async value => { data[key] })"],
  ]) assert.equal(inspectTestAuthoringDelta(before, after).allowed, true, after)
  // 构造自身变了（别的对象/键、用例名被改、调用方名被改）——仍拒绝。
  for (const [before, after] of [
    ["test('first', async () => { data[key] })", "test('renamed', async () => { data[key] })"],
    ["test('first', async () => { data[key] })", "test('first', async () => { other[index] })"],
    ["test('first', async () => { data[key] })", "check('first', async () => { data[key] })"],
  ]) assert.equal(inspectTestAuthoringDelta(before, after).allowed, false, after)
})

test('same parent block insertion keeps existing risk identities while new constructs deny', () => {
  for (const [before, after] of [
    ["test('first', async () => { { data[key] } })", "test('first', async () => { {} { data[key] } })"],
    ["{ test('first', async () => { data[key] }) }", "{} { test('first', async () => { data[key] }) }"],
    ['class Example { static { data[key] } }', 'class Example { static {} static { data[key] } }'],
  ]) assert.equal(inspectTestAuthoringDelta(before, after).allowed, true, after)
  // 空块不含构造；但**在新块里新增**一处风险构造仍然拒绝。
  assert.equal(inspectTestAuthoringDelta(
    "test('first', async () => { { data[key] } })",
    "test('first', async () => { {} { data[key]; data[key] } })",
  ).allowed, false)
})

test('nonadjacent identical parents keep stable identities when a sibling is removed', () => {
  const before = "test('shared', async () => {}); test('middle', async () => {}); test('shared', async () => { data[key] })"
  const after = "test('middle', async () => {}); test('shared', async () => { data[key] })"
  assert.equal(inspectTestAuthoringDelta(before, before).allowed, true)
  assert.equal(inspectTestAuthoringDelta(before, "test('unrelated', async () => {}); " + before).allowed, true)
  // 被删掉的是不含风险的同形兄弟，既有构造本身没动 → 放行（#3754）。
  assert.equal(inspectTestAuthoringDelta(before, after).allowed, true)
  // 既有构造被换成另一处新构造时仍然拒绝。
  assert.equal(inspectTestAuthoringDelta(before, "test('middle', async () => {}); test('shared', async () => { other[index] })").allowed, false)
})

test('for of data changes stay allowed while dynamic case names remain denied', () => {
  const before = "for (const scenario of [{ name: 'first' }]) { test('fixed', async () => { data[key] }) }"
  const after = "for (const scenario of [{ name: 'unrelated' }, { name: 'first' }]) { test('fixed', async () => { data[key] }) }"
  assert.equal(inspectTestAuthoringDelta(before, before).allowed, true)
  // 参数化数据表增删行是维护动作，循环体里的构造没变 → 放行（#3754）。
  assert.equal(inspectTestAuthoringDelta(before, after).allowed, true)
  // 动态用例名仍然拒绝。
  assert.equal(inspectTestAuthoring("for (const scenario of cases) { test(scenario.name, async () => {}) }").allowed, false)
})

test('parent stability never absorbs changed imports options or new execution risks', () => {
  const before = "test('first', async () => { data[key] }); test('second', async () => { other[index] })"
  for (const suffix of [
    "test('new', options, async () => {})",
    "test(scenario.name, async () => {})",
    "new Example(...values)",
    "consume(...values)",
    "import vm from 'node:vm'",
    "import { constructor as create } from './domain.mjs'",
    "eval(code)",
    "test.only('new', async () => {})",
    "test('new', { skip: true }, async () => {})",
    'const typed: number = 1',
  ]) assert.equal(inspectTestAuthoringDelta(before, before + '; ' + suffix).allowed, false, suffix)
  const imported = "import { data } from './domain.mjs'; " + before
  assert.equal(inspectTestAuthoringDelta(imported, "import { data, safeApi } from './domain.mjs'; " + before).allowed, true)
  assert.equal(inspectTestAuthoringDelta(imported, "import { data } from './changed.mjs'; " + before).allowed, false)
})

test('import declaration risk bodies and contexts remain conservative when adding siblings', () => {
  for (const [before, after] of [
    ["import { constructor as create } from './domain.mjs'; create(ctx)", "import { constructor as create, safeApi } from './domain.mjs'; create(ctx)"],
    ["import { runInThisContext } from 'node:vm'; runInThisContext(code)", "import { runInThisContext, safeApi } from 'node:vm'; runInThisContext(code)"],
  ]) {
    // 给「有执行导入的语句」加一个非风险 specifier：构造没变 → 放行；
    // 整句 import 自身就是风险（如 node:vm）且语句变了 → 仍拒绝。
    const expected = before.includes("node:vm") ? false : true
    assert.equal(inspectTestAuthoringDelta(before, before).allowed, true)
    assert.equal(inspectTestAuthoringDelta(before, after).allowed, expected, after)
  }
})

test('standard-change inspection names the weakened cases without changing the delta shape', () => {
  const before = "test('keeps contract', () => { assert.equal(actual(), 1) }); test('stays put', () => { assert.equal(other(), 2) })"

  // 用例仍在、断言被改写：只点名被改写的那个用例。
  const weakened = "test('keeps contract', () => { assert.equal(actual(), 2) }); test('stays put', () => { assert.equal(other(), 2) })"
  const weakenedResult = inspectTestStandardChange(before, weakened)
  assert.equal(weakenedResult.allowed, false)
  assert.equal(weakenedResult.reason, 'test-assertion-removed-or-rewritten')
  assert.deepEqual(weakenedResult.changedCases, ['keeps contract'])

  // 整条用例被删：原因是用例移除，并点名该用例。
  const removed = "test('stays put', () => { assert.equal(other(), 2) })"
  const removedResult = inspectTestStandardChange(before, removed)
  assert.equal(removedResult.allowed, false)
  assert.equal(removedResult.reason, 'test-case-removed-or-renamed')
  assert.deepEqual(removedResult.changedCases, ['keeps contract'])

  // 纯新增覆盖：无被削弱的用例。
  const additive = before + "; test('adds coverage', () => { assert.equal(extra(), 3) })"
  const additiveResult = inspectTestStandardChange(before, additive)
  assert.equal(additiveResult.allowed, true)
  assert.deepEqual(additiveResult.changedCases, [])

  // 不可点名的断言削弱（不在任何具名 test/it 内）：仍然拒绝，且不给出可声明对象。
  const unnamedBefore = "assert.equal(topLevel(), 1)"
  const unnamedAfter = "assert.equal(topLevel(), 2)"
  const unnamedResult = inspectTestStandardChange(unnamedBefore, unnamedAfter)
  assert.equal(unnamedResult.allowed, false)
  assert.equal(unnamedResult.reason, 'test-assertion-removed-or-rewritten')
  assert.deepEqual(unnamedResult.changedCases, [])

  // 原函数形状不变：只有 allowed / reason / scope 三个字段。
  assert.deepEqual(Object.keys(inspectTestAuthoringDelta(before, weakened)).sort(), ['allowed', 'reason', 'scope'])
})

test('old-standard declarations parse only the strict single-line form', () => {
  const section = [
    '说明文字不构成声明。',
    '- `plugins/demo/tests/a.test.mjs` :: `keeps contract`',
    '* `plugins/demo/tests/b.test.mjs` :: `stays put`',
    '- `plugins/demo/tests/c.test.mjs` :: `no closing backtick',
    '- 缺少路径 :: `only a name`',
  ].join('\n')
  assert.deepEqual(parseOldStandardDeclarations(section), [
    { path: 'plugins/demo/tests/a.test.mjs', caseName: 'keeps contract' },
    { path: 'plugins/demo/tests/b.test.mjs', caseName: 'stays put' },
  ])
  assert.deepEqual(parseOldStandardDeclarations(''), [])
})

test('old-standard declarations must match both path and case name', () => {
  const declarations = [
    { path: 'plugins/demo/tests/a.test.mjs', caseName: 'keeps contract' },
    { path: 'plugins/demo/tests/other.test.mjs', caseName: 'keeps contract' },
  ]
  // 路径与用例名同时命中才算声明；同名但不同文件不算。
  assert.deepEqual(
    matchOldStandardDeclarations({ declarations, filePath: 'plugins/demo/tests/a.test.mjs', changedCases: ['keeps contract'] }),
    { ok: true, missing: [] },
  )
  assert.deepEqual(
    matchOldStandardDeclarations({ declarations, filePath: 'plugins/demo/tests/a.test.mjs', changedCases: ['keeps contract', 'stays put'] }),
    { ok: false, missing: ['stays put'] },
  )
  assert.deepEqual(
    matchOldStandardDeclarations({ declarations, filePath: 'plugins/demo/tests/unknown.test.mjs', changedCases: ['keeps contract'] }),
    { ok: false, missing: ['keeps contract'] },
  )
})

// 口径收窄：数组/对象展开是**数据拷贝**，只有**调用位**展开（`f(...args)` / `new C(...args)`）
// 才是执行风险。判定基于 AST 父节点与 `arguments` 槽位，不做文本匹配。
test('call-position spread stays an execution risk while array and object spread is data copy', () => {
  // ① 调用位展开：硬拒，原因是执行风险，且该原因没有可点名的声明对象（通道打不开）。
  for (const source of [
    'consume(...values)',
    'fn(...args)',
    'new Example(...values)',
    'consume([1], ...values)',
    'consume(...values, 1)',
    'consume(...first, ...second)',
    'new (factory())(...values)',
  ]) {
    const inspection = inspectTestAuthoring(source)
    assert.equal(inspection.allowed, false, source)
    assert.equal(inspection.reason, 'dynamic-test-execution-needs-review', source)
  }
  // 原因不可声明：把同一处调用位展开加进既有用例，声明通道拿不到可点名的用例。
  const spreadAdded = inspectTestStandardChange(
    "test('case', () => {})",
    "test('case', () => { fn(...args) })",
  )
  assert.equal(spreadAdded.allowed, false)
  assert.equal(spreadAdded.reason, 'dynamic-test-execution-needs-review')
  assert.deepEqual(spreadAdded.changedCases, [])

  // ③ 数组/对象展开（既有构造与新增构造）都放行：不是执行风险，也不改变既有标准。
  for (const source of [
    'const copy = [...arr]',
    'const clone = { ...obj }',
    'consume([...arr])',
    'consume({ ...obj })',
    'consume([1, ...arr, 2])',
    'consume({ first: 1, ...obj })',
    'function read(...rest) { return [...rest] }',
    'function read([first, ...rest]) { return { ...rest } }',
    'function read({ first, ...rest }) { return [...rest] }',
    "test('case', () => { assert.deepEqual([...actual], expected) })",
  ]) assert.equal(inspectTestAuthoring(source).allowed, true, source)
  const copyBefore = "test('case', () => { const copy = [...arr]; assert.deepEqual(copy, expected) })"
  const copyAfter = "test('case', () => { const copy = [...arr]; const clone = { ...obj }; assert.deepEqual(copy, expected) })"
  assert.equal(inspectTestAuthoringDelta(copyBefore, copyAfter).allowed, true)
  assert.equal(inspectTestStandardChange(copyBefore, copyAfter).allowed, true)
})

// ④ 嵌套：`f([...a])` 的展开父节点是数组字面量 → 放行；`f(...a)` 的父节点是调用 → 拒绝。
test('only the call position counts so nested array spread passes while call spread is denied', () => {
  for (const source of [
    'consume([...a])',
    'consume({ ...a })',
    'consume([[...a]])',
    'consume({ key: [...a] })',
    'consume(f([...a]))',
    'new Example([...a])',
    'const opts = { ...a }; consume(opts)',
  ]) assert.equal(inspectTestAuthoring(source).allowed, true, source)
  for (const source of [
    'consume(...a)',
    'consume(f(...a))',
    'new Example(...a)',
    'consume([...a], ...b)',
  ]) {
    const inspection = inspectTestAuthoring(source)
    assert.equal(inspection.allowed, false, source)
    assert.equal(inspection.reason, 'dynamic-test-execution-needs-review', source)
  }
})

// ⑤ 回归护栏：收窄只碰「非调用位展开」，其余风险类别逐条保持原判。
test('non-spread execution risks keep their verdicts after the narrowing', () => {
  for (const [source, reason] of [
    ['const value: number = 1', 'unsupported-or-incomplete-test-syntax'],
    ["test.skip('case', () => {})", 'test-execution-selector-needs-review'],
    ["it.only('case', () => {})", 'test-execution-selector-needs-review'],
    ["xit('case', () => {})", 'test-execution-selector-needs-review'],
    ['eval(code)', 'dynamic-test-execution-needs-review'],
    ["new Function('code')", 'dynamic-test-execution-needs-review'],
    ["require('./x')", 'dynamic-test-execution-needs-review'],
    ['const module_ = import("./x")', 'dynamic-test-execution-needs-review'],
    ['data[key]', 'dynamic-test-member-needs-review'],
  ]) {
    const inspection = inspectTestAuthoring(source)
    assert.equal(inspection.allowed, false, source)
    assert.equal(inspection.reason, reason, source)
  }
})

// 旧式跳过/聚焦别名与 `test.skip` / `test.only` 语义等价，必须同样被识别。
test('legacy skip and focus aliases are rejected like test.skip / test.only', () => {
  const aliasSources = [
    "xit('case', () => {})",
    "xtest('case', () => {})",
    "xdescribe('case', () => {})",
    "fit('case', () => {})",
    "ftest('case', () => {})",
    "fdescribe('case', () => {})",
    "xit.each([1])('case', () => {})",
  ]
  for (const source of aliasSources) {
    const inspection = inspectTestAuthoring(source)
    assert.equal(inspection.allowed, false, `${source} 必须被拒绝`)
    assert.equal(inspection.reason, 'test-execution-selector-needs-review', `${source} 的原因应为选择器审查`)
  }
})

test('legacy alias detection does not change the existing selector verdicts', () => {
  for (const source of [
    "test.skip('case', () => {})",
    "it.only('case', () => {})",
    "test.concurrent.skip('case', () => {})",
    "describe.only('case', () => {})",
  ]) {
    assert.equal(inspectTestAuthoring(source).reason, 'test-execution-selector-needs-review', `${source} 的判定不应变化`)
  }
  // 普通用例与普通成员调用不受影响。
  assert.equal(inspectTestAuthoring("test('case', () => {})").allowed, true)
  assert.equal(inspectTestAuthoring("describe('group', () => {})").allowed, true)
  assert.equal(inspectTestAuthoring("import assert from 'node:assert/strict'\nassert.equal(a, b)").allowed, true)
})

test('legacy aliases are non-declarable, so the old-standard channel cannot open them', () => {
  const inspection = inspectTestStandardChange("xit('case', () => { assert.equal(a, 1) })", "xit('case', () => { assert.equal(a, 2) })")
  assert.equal(inspection.allowed, false)
  assert.notEqual(inspection.reason, 'test-assertion-removed-or-rewritten')
})

// 独立复核指出：mocha 的 xcontext / xspecify 与 xdescribe / xit 是同一族别名；
// 另外 `it.skipIf(条件)` 的「条件恰好是对象字面量」形态原先能绕过。
test('mocha BDD aliases and skipIf-with-object condition are rejected too', () => {
  for (const source of ["xcontext('case', () => {})", "xspecify('case', () => {})"]) {
    const inspection = inspectTestAuthoring(source)
    assert.equal(inspection.allowed, false, `${source} 必须被拒绝`)
    assert.equal(inspection.reason, 'test-execution-selector-needs-review', `${source} 的原因应为选择器审查`)
  }
  // 条件不是回调而是对象字面量时，不能因为「看起来像 options」就放行。
  for (const source of ["it.skipIf({a:1})('case', () => {})", "test.runIf({a:1})('case', () => {})"]) {
    assert.equal(inspectTestAuthoring(source).allowed, false, `${source} 必须被拒绝`)
  }
  // mocha 的 `context` 是 describe 别名而非跳过/聚焦，不应被拒。
  assert.equal(inspectTestAuthoring("context('case', () => {})").allowed, true)
})

// #3754：既有且**未改动**的执行构造不再阻断编辑；新增构造与解析失败仍然硬拒。
test('pre-existing execution constructs stop blocking while new constructs and parse failures stay denied', () => {
  const keepsContract = table => `for (const [label, mutate] of ${table}) { test('keeps contract', () => { assert.equal(Object.prototype.hasOwnProperty.call(value, 'id'), false) }) }`

  // ① 两侧都含同一处 `.call(` 执行构造，本编辑只改了参数化数据表（祖先位置的数据）→ 放行。
  // 旧口径下这条会因为 ForOfStatement 的数据表进入位置身份而报不可声明的选择器原因。
  const tableBefore = keepsContract("[['a', () => {}]]")
  const tableAfter = keepsContract("[['a', () => {}], ['b', () => {}]]")
  assert.equal(inspectTestStandardChange(tableBefore, tableAfter).allowed, true)

  // 用例改名同样不再触发不可声明的选择器原因，而是打开 `## 旧标准变更` 声明通道并点名用例。
  const renamed = inspectTestStandardChange(
    "test('keeps contract', () => { assert.equal(Object.prototype.hasOwnProperty.call(value, 'id'), false) })",
    "test('keeps contract renamed', () => { assert.equal(Object.prototype.hasOwnProperty.call(value, 'id'), false) })",
  )
  assert.equal(renamed.allowed, false)
  assert.equal(renamed.reason, 'test-case-removed-or-renamed')
  assert.deepEqual(renamed.changedCases, ['keeps contract'])

  // ② 新增一处 `.skip`：硬拒，原因不可经声明放行。
  const skipped = inspectTestStandardChange(tableBefore, tableBefore + "test.skip('adds', () => {})")
  assert.equal(skipped.allowed, false)
  assert.equal(skipped.reason, 'test-execution-selector-needs-review')
  assert.deepEqual(skipped.changedCases, [])

  // ③ candidate 解析失败：读不出结构化结构就无法比较，绝对拒绝。
  const broken = inspectTestStandardChange("test('keeps contract', () => {})", "test('keeps contract', () => { const v: number = 1 })")
  assert.equal(broken.allowed, false)
  assert.equal(broken.reason, 'unsupported-or-incomplete-test-syntax')
  assert.deepEqual(broken.changedCases, [])
})
