import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withFixtureRepo } from './lib/git-fixture-repo.mjs'
import { verifyTestStandardDeclarations, collectRangeDeclarations } from './verify-test-standard-declarations.mjs'

const TEST_FILE = 'plugins/demo/tests/a.test.mjs'
const SPEC_FILE = 'specs/demo.spec.md'
const BEFORE = "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('keeps contract', () => { assert.equal(actual(), 1) })\n"
const AFTER = "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('keeps contract', () => { assert.equal(actual(), 2) })\n"
const SPEC_HEADER = '# demo\n\n## 假设\n\n这条假设有足够长度以满足最小字数要求。\n\n## 证伪方式\n\n这条证伪方式也有足够长度以满足最小字数要求。\n'

test('未声明的既有断言削弱在本范围内被判定为违规', () => {
  withFixtureRepo(repo => {
    repo.write(TEST_FILE, BEFORE)
    const base = repo.commit('base')
    repo.write(TEST_FILE, AFTER)
    const candidate = repo.commit('weaken without declaration')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.equal(result.candidate, candidate)
    assert.equal(result.violations.length, 1)
    assert.equal(result.violations[0].path, TEST_FILE)
    assert.equal(result.violations[0].reason, 'test-assertion-removed-or-rewritten')
    assert.deepEqual(result.violations[0].missing, ['keeps contract'])
  })
})

test('随本范围提交的逐条声明使削弱通过', () => {
  withFixtureRepo(repo => {
    repo.write(TEST_FILE, BEFORE)
    const base = repo.commit('base')
    repo.write(TEST_FILE, AFTER)
    repo.write(SPEC_FILE, `${SPEC_HEADER}\n## 旧标准变更\n\n- \`${TEST_FILE}\` :: \`keeps contract\`\n  - 理由：该断言逐字要求缺陷行为。\n  - 新期望与证据：改为 2 后实测通过。\n`)
    repo.commit('weaken with declaration')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.deepEqual(result.violations, [])
    assert.equal(result.declarationCount, 1)
  })
})

test('未跟踪的 spec 声明不算数（H1：声明必须进本范围）', () => {
  withFixtureRepo(repo => {
    repo.write(TEST_FILE, BEFORE)
    const base = repo.commit('base')
    repo.write(TEST_FILE, AFTER)
    repo.commit('weaken')
    // 声明只写在工作区、没有提交：旧实现会据此放行，这里必须仍然违规。
    repo.write(SPEC_FILE, `${SPEC_HEADER}\n## 旧标准变更\n\n- \`${TEST_FILE}\` :: \`keeps contract\`\n  - 理由：未提交的声明不应生效。\n`)
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.equal(result.violations.length, 1)
    assert.deepEqual(result.violations[0].missing, ['keeps contract'])
    assert.equal(result.declarationCount, 0)
  })
})

test('放行后删除声明会被本范围校验发现', () => {
  withFixtureRepo(repo => {
    repo.write(TEST_FILE, BEFORE)
    const base = repo.commit('base')
    repo.write(SPEC_FILE, `${SPEC_HEADER}\n## 旧标准变更\n\n- \`${TEST_FILE}\` :: \`keeps contract\`\n  - 理由：临时声明。\n`)
    repo.commit('declare first')
    repo.write(TEST_FILE, AFTER)
    repo.write(SPEC_FILE, '# demo\n\n没有声明了。\n')
    repo.commit('weaken and drop the declaration')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.equal(result.violations.length, 1)
    assert.equal(result.declarationCount, 0)
  })
})

test('只声明一部分时点名缺失用例', () => {
  withFixtureRepo(repo => {
    const twoCases = "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('first', () => { assert.equal(a(), 1) })\ntest('second', () => { assert.equal(b(), 2) })\n"
    const weakened = "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('first', () => { assert.equal(a(), 9) })\ntest('second', () => { assert.equal(b(), 9) })\n"
    repo.write(TEST_FILE, twoCases)
    const base = repo.commit('base')
    repo.write(TEST_FILE, weakened)
    repo.write(SPEC_FILE, `${SPEC_HEADER}\n## 旧标准变更\n\n- \`${TEST_FILE}\` :: \`first\`\n  - 理由：只声明一个。\n`)
    repo.commit('partial declaration')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.equal(result.violations.length, 1)
    assert.deepEqual(result.violations[0].missing, ['second'])
  })
})

test('跳过选项即便有声明也是违规（不可经声明放行）', () => {
  withFixtureRepo(repo => {
    repo.write(TEST_FILE, BEFORE)
    const base = repo.commit('base')
    repo.write(TEST_FILE, BEFORE.replace("test('keeps contract', () =>", "test('keeps contract', { skip: true }, () =>"))
    repo.write(SPEC_FILE, `${SPEC_HEADER}\n## 旧标准变更\n\n- \`${TEST_FILE}\` :: \`keeps contract\`\n  - 理由：不该被放行。\n`)
    repo.commit('skip with declaration')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.equal(result.violations.length, 1)
    assert.equal(result.violations[0].declarable, false)
  })
})

test('新增测试文件只做加法，不算违规', () => {
  withFixtureRepo(repo => {
    repo.write('README.md', 'base\n')
    const base = repo.commit('base')
    repo.write(TEST_FILE, BEFORE)
    repo.commit('add test')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.deepEqual(result.violations, [])
  })
})

test('无法解析的测试文件记为不可评估且不阻断（既有机制盲区）', () => {
  withFixtureRepo(repo => {
    const tsFile = 'plugins/demo/tests/a.test.ts'
    const tsBefore = "import { test, expect } from 'vitest'\ntest('typed', () => {\n  const value: number = 1\n  expect(value).toBe(1)\n})\n"
    repo.write(tsFile, tsBefore)
    const base = repo.commit('base')
    repo.write(tsFile, tsBefore.replace('= 1', '= 2'))
    repo.commit('weaken typed test')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.deepEqual(result.violations, [])
    assert.equal(result.unevaluable.length, 1)
    assert.equal(result.unevaluable[0].reason, 'unsupported-or-incomplete-test-syntax')
  })
})

test('声明收集只看本范围内已提交的 spec', () => {
  assert.deepEqual(collectRangeDeclarations([]), [])
  assert.deepEqual(collectRangeDeclarations([
    { status: 'D', path: SPEC_FILE, after: null },
    { status: 'M', path: TEST_FILE, after: Buffer.from('') },
  ]), [])
})
