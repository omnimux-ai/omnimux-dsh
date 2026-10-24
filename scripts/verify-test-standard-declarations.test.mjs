import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withFixtureRepo, runNodeCli, readRepoFile, REPO_ROOT } from './lib/git-fixture-repo.mjs'
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

// —— R1 第二轮评审发现的绕过：以下用例逐一钉住它们 ——

const TS_FILE = 'plugins/demo/tests/a.test.ts'
const TS_SOURCE = "import { test, expect } from 'vitest'\ntest('typed', () => {\n  const value: number = 1\n  expect(value).toBe(1)\n})\n"

test('把可解析的测试改成解析不过去：违规且不可声明（H3）', () => {
  withFixtureRepo(repo => {
    repo.write(TEST_FILE, BEFORE)
    const base = repo.commit('base')
    // 最小形态的「改成 TS」：加一个类型注解即让 acorn 解析失败。
    repo.write(TEST_FILE, "import test from 'node:test'\ntest('keeps contract', () => {\n  const n: number = 2\n})\n")
    repo.write(SPEC_FILE, `${SPEC_HEADER}\n## 旧标准变更\n\n- \`${TEST_FILE}\` :: \`keeps contract\`\n  - 理由：试图用声明放行。\n`)
    repo.commit('make unparseable, with a declaration')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.equal(result.violations.length, 1)
    assert.equal(result.violations[0].reason, 'evaluation-made-unparseable')
    assert.equal(result.violations[0].declarable, false)
  })
})

test('原本不可解析的文件被改写：要求文件级声明（H3）', () => {
  withFixtureRepo(repo => {
    repo.write(TS_FILE, TS_SOURCE)
    const base = repo.commit('base')
    repo.write(TS_FILE, "import test from 'node:test'\ntest('typed', () => {})\n")
    repo.commit('rewrite an unparseable baseline')
    const flagged = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.equal(flagged.violations.length, 1)
    assert.equal(flagged.violations[0].reason, 'unparseable-baseline-changed')
    assert.deepEqual(flagged.violations[0].missing, ['*'])
    repo.write(SPEC_FILE, `${SPEC_HEADER}\n## 旧标准变更\n\n- \`${TS_FILE}\` :: \`*\`\n  - 理由：原本就解析不了，无法枚举具名用例。\n`)
    repo.commit('declare at file level')
    assert.deepEqual(verifyTestStandardDeclarations({ root: repo.root, base }).violations, [])
  })
})

test('两侧都不可解析时仅报告不阻断（TS 日常改动不受影响）', () => {
  withFixtureRepo(repo => {
    repo.write(TS_FILE, TS_SOURCE)
    const base = repo.commit('base')
    repo.write(TS_FILE, TS_SOURCE.replace('= 1', '= 2'))
    repo.commit('edit a TS test in place')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.deepEqual(result.violations, [])
    assert.equal(result.unevaluable.length, 1)
  })
})

test('把受保护测试改名到非保护位置：按旧路径要求声明（H4）', () => {
  withFixtureRepo(repo => {
    repo.write(TEST_FILE, BEFORE)
    const base = repo.commit('base')
    repo.write(`${TEST_FILE}.bak`, AFTER)
    repo.remove(TEST_FILE)
    repo.commit('move the test out of the protected set')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.equal(result.violations.length, 1)
    assert.equal(result.violations[0].path, TEST_FILE)
    assert.deepEqual(result.violations[0].missing, ['keeps contract'])
  })
})

test('base 上已有的声明不能当本次授权复用（H2）', () => {
  withFixtureRepo(repo => {
    repo.write(TEST_FILE, BEFORE)
    const declared = `${SPEC_HEADER}\n## 旧标准变更\n\n- \`${TEST_FILE}\` :: \`keeps contract\`\n  - 理由：早先某次合法削弱留下的声明。\n`
    repo.write(SPEC_FILE, declared)
    const base = repo.commit('base already carries a declaration')
    repo.write(TEST_FILE, AFTER)
    // 只对 spec 做无关改动，不新增任何声明行。
    repo.write(SPEC_FILE, `${declared}\n（本次只加了一行无关文字）\n`)
    repo.commit('weaken while merely touching the spec')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.equal(result.violations.length, 1)
    assert.equal(result.declarationCount, 0)
  })
})

test('CLI 对未声明削弱退出码为 1（H5：退出逻辑需有自动化覆盖）', () => {
  withFixtureRepo(repo => {
    repo.write(TEST_FILE, BEFORE)
    const base = repo.commit('base')
    repo.write(TEST_FILE, AFTER)
    repo.commit('weaken')
    const cli = `${REPO_ROOT}/scripts/verify-test-standard-declarations.mjs`
    const failed = runNodeCli([cli, repo.root, base])
    assert.equal(failed.status, 1)
    assert.match(failed.stdout, /发现 1 处未声明的既有标准削弱/)
    repo.write(SPEC_FILE, `${SPEC_HEADER}\n## 旧标准变更\n\n- \`${TEST_FILE}\` :: \`keeps contract\`\n  - 理由：本次授权。\n`)
    repo.commit('declare in range')
    assert.equal(runNodeCli([cli, repo.root, base]).status, 0)
  })
})

test('quality-gate 中存在声明校验步骤（H5：元门禁）', () => {
  const workflow = readRepoFile(REPO_ROOT, '.github/workflows/quality-gate.yml')
  assert.ok(workflow, '.github/workflows/quality-gate.yml 必须存在')
  assert.match(workflow, /node scripts\/verify-test-standard-declarations\.mjs/)
  assert.match(workflow, /node --test scripts\/verify-test-standard-declarations\.test\.mjs/)
})

// —— 第三轮评审：F1 误报、F2 口径漂移、F3 元门禁强度 ——

test('新增无法解析的测试文件属于纯加法，不得误报（F1）', () => {
  withFixtureRepo(repo => {
    repo.write('README.md', 'base\n')
    const base = repo.commit('base')
    // 新增 .test.ts 是仓库里的常见动作（origin/main 上已有数十个），必须零违规。
    repo.write(TS_FILE, TS_SOURCE)
    repo.commit('add a TS test')
    assert.deepEqual(verifyTestStandardDeclarations({ root: repo.root, base }).violations, [])
  })
})

test('声明写在 specs/<feature>.md（无 .spec 后缀）同样有效（F2）', () => {
  withFixtureRepo(repo => {
    repo.write(TEST_FILE, BEFORE)
    const base = repo.commit('base')
    repo.write(TEST_FILE, AFTER)
    // `isSpecPath` 认 `specs/*.md`；声明来源必须与 hook 一致，否则出现「hook 认、CI 不认」。
    repo.write('specs/demo.md', `${SPEC_HEADER}\n## 旧标准变更\n\n- \`${TEST_FILE}\` :: \`keeps contract\`\n  - 理由：本次授权。\n`)
    repo.commit('weaken with a declaration in specs/demo.md')
    const result = verifyTestStandardDeclarations({ root: repo.root, base })
    assert.deepEqual(result.violations, [])
    assert.equal(result.declarationCount, 1)
  })
})

test('声明校验步骤必须真的执行该命令，而不是被 echo 或注释掉（F3 加固）', () => {
  const workflow = readRepoFile(REPO_ROOT, '.github/workflows/quality-gate.yml')
  assert.ok(workflow)
  assert.match(workflow, /^\s*node scripts\/verify-test-standard-declarations\.mjs \. "\$QA_BASE"\s*$/m)
  assert.match(workflow, /^\s*node --test scripts\/verify-test-standard-declarations\.test\.mjs\s*$/m)
})
