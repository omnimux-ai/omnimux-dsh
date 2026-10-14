import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectTestAuthoring, inspectTestAuthoringDelta } from './test-authoring-inspection.mjs'
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
  const before = "import { values } from './domain.mjs'; consume([...values])"
  const after = "import { values, safeApi } from './domain.mjs'; consume([...values])"
  assert.equal(inspectTestAuthoringDelta(before, after).allowed, true)
  assert.equal(inspectTestAuthoring(after).allowed, false)
})

test('default namespace and literal named bindings ignore unused safe siblings at use sites', () => {
  for (const [before, after] of [
    ["import values from './domain.mjs'; consume([...values])", "import values, { safeApi } from './domain.mjs'; consume([...values])"],
    ["import * as values from './domain.mjs'; consume([...values])", "import safeApi, * as values from './domain.mjs'; consume([...values])"],
    ["import { 'values' as values } from './domain.mjs'; consume([...values])", "import { 'values' as values, safeApi } from './domain.mjs'; consume([...values])"],
  ]) {
    assert.equal(inspectTestAuthoringDelta(before, after).allowed, true, after)
    assert.equal(inspectTestAuthoring(after).allowed, false, after)
  }
})

test('supported import attributes preserve siblings but retain value raw and key identity', () => {
  const before = "import { values } from './domain.mjs' with { type: 'json' }; consume([...values])"
  const after = "import { values, safeApi } from './domain.mjs' with { type: 'json' }; consume([...values])"
  assert.equal(inspectTestAuthoringDelta(before, after).allowed, true)
  for (const changed of [
    "import { values } from './domain.mjs' with { type: 'text' }; consume([...values])",
    'import { values } from \'./domain.mjs\' with { type: "json" }; consume([...values])',
    "import { values } from './domain.mjs' with { format: 'json' }; consume([...values])",
    "import { values } from './domain.mjs'; consume([...values])",
    "import { values } from './domain.mjs' assert { type: 'json' }; consume([...values])",
  ]) assert.equal(inspectTestAuthoringDelta(before, changed).allowed, false, changed)
})

test('source literal imported local and binding kind changes still change existing risks', () => {
  const before = "import { values } from './domain.mjs'; consume([...values])"
  for (const after of [
    "import { values } from './other.mjs'; consume([...values])",
    'import { values } from "./domain.mjs"; consume([...values])',
    "import { otherValues as values } from './domain.mjs'; consume([...values])",
    "import { values as renamed } from './domain.mjs'; consume([...renamed])",
    "import values from './domain.mjs'; consume([...values])",
    "import * as values from './domain.mjs'; consume([...values])",
    "import { 'values' as values } from './domain.mjs'; consume([...values])",
  ]) assert.equal(inspectTestAuthoringDelta(before, after).allowed, false, after)
  const literalBefore = "import { 'values' as values } from './domain.mjs'; consume([...values])"
  assert.equal(inspectTestAuthoringDelta(literalBefore, "import { 'otherValues' as values } from './domain.mjs'; consume([...values])").allowed, false)
  assert.equal(inspectTestAuthoringDelta("import values from './domain.mjs'; consume([...values])", "import * as values from './domain.mjs'; consume([...values])").allowed, false)
})

test('unused known execution imports new spreads and unsupported candidates remain denied', () => {
  const before = "import { values } from './domain.mjs'; consume([...values])"
  for (const after of [
    "import { values, eval as extraExecution } from './domain.mjs'; consume([...values])",
    "import { values, constructor as extraExecution } from './domain.mjs'; consume([...values])",
    "import { values } from './domain.mjs'; import vm from 'node:vm'; consume([...values])",
    "import { values } from './domain.mjs'; import worker from 'node:worker_threads'; consume([...values])",
    "import { values } from './domain.mjs'; consume([...values]); consume([...extra])",
    "import { values } from './domain.mjs'; consume([...values]); const typed: number = 1",
    "import { values } from './domain.mjs'; consume([...values]); test(",
    "import type { values } from './domain.mjs'; consume([...values])",
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
    "function read(safeApi, { nested: [other] }, ...rest) { consume([...values]) }",
    "function read(...safeApi) { consume([...values]) }",
    "consume((safeApi) => [...values])",
    "try { step() } catch (safeApi) { consume([...values]) }",
    "consume(function safeApi() { return [...values] })",
    "consume(class safeApi extends factory([...values]) {})",
    "try { step() } catch ({ safeApi }) { consume([...values]) }",
    "consume({ safeApi: [...values] })",
    "consume({ safeApi() { return [...values] } })",
    "class Example { safeApi = [...values] }",
    "consume(object.safeApi, [...values])",
    "safeApi: for (;;) { consume([...values]); break safeApi }",
    "import { safeApi as local } from './data.mjs'; consume([...values])",
    "const value = 'safeApi'; consume([...values])",
  ]) {
    const after = "import { safeApi } from './safeApi'; " + before
    assert.equal(inspectTestAuthoringDelta(before, after).allowed, true, before)
    assert.equal(inspectTestAuthoring(after).allowed, false, before)
  }
})

test('shorthand computed and default expressions remain genuine references', () => {
  for (const before of [
    'consume({ safeApi }, [...values])',
    'consume({ [safeApi]: 1 }, [...values])',
    'consume(object[safeApi], [...values])',
    "async function read() { const { [safeApi]: local } = await import('./data.mjs') }",
    "async function read() { const { local = safeApi } = await import('./data.mjs') }",
    "async function read() { const [local = safeApi] = await import('./data.mjs') }",
    'function read(local = safeApi) { consume([...values]) }',
    'function read({ local = safeApi }) { consume([...values]) }',
    'function read({ [safeApi]: local }) { consume([...values]) }',
    'try { step() } catch ({ local = safeApi }) { consume([...values]) }',
    'consume({ safeApi = fallback } = input, [...values])',
    'consume({ safeApi }, [...safeApi])',
    'consume(safeApi, [...values])',
  ]) {
    const after = "import { safeApi } from './domain.mjs'; " + before
    assert.equal(inspectTestAuthoringDelta(before, before).allowed, true, before)
    assert.equal(inspectTestAuthoringDelta(before, after).allowed, false, before)
  }
})

test('genuine locally shadowed references remain conservatively associated without scope analysis', () => {
  for (const before of [
    'function read(safeApi) { consume([...safeApi]) }',
    'function read() { const safeApi = values; consume([...safeApi]) }',
    '{ let safeApi = values; consume([...safeApi]) }',
    'function read(safeApi, local = safeApi) { consume([...values]) }',
  ]) assert.equal(inspectTestAuthoringDelta(before, "import { safeApi } from './domain.mjs'; " + before).allowed, false, before)
})

test('role filtering preserves context slots occurrences risk multiplicity and new execution denials', () => {
  for (const [before, after] of [
    ["function first(safeApi) { consume([...values]) }", "function second(safeApi) { consume([...values]) }"],
    ["consume(() => [...values], () => 1)", "consume(() => 1, () => [...values])"],
    ["function read() { consume([...values]) }", "function read() { consume([...values]) } function readAgain() { consume([...values]) }"],
    ["consume([...values])", "consume([...values]); consume([...values])"],
    ["consume([...values])", "consume([...values]); eval(code)"],
    ["consume([...values])", "import vm from 'node:vm'; consume([...values])"],
  ]) assert.equal(inspectTestAuthoringDelta(before, after).allowed, false, after)
})

test('import declaration risk bodies and contexts remain conservative when adding siblings', () => {
  for (const [before, after] of [
    ["import { constructor as create } from './domain.mjs'; create(ctx)", "import { constructor as create, safeApi } from './domain.mjs'; create(ctx)"],
    ["import { runInThisContext } from 'node:vm'; runInThisContext(code)", "import { runInThisContext, safeApi } from 'node:vm'; runInThisContext(code)"],
  ]) {
    assert.equal(inspectTestAuthoringDelta(before, before).allowed, true)
    assert.equal(inspectTestAuthoringDelta(before, after).allowed, false, after)
  }
})
