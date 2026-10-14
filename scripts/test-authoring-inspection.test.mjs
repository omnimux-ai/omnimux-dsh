import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectTestAuthoring } from './test-authoring-inspection.mjs'

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
