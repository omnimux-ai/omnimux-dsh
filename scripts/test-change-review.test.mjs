import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeTestChanges, isEvaluationPath } from './test-change-review.mjs'

const inventory = changes => analyzeTestChanges({ root: '/repository', baseCommit: 'base', comparisonBase: 'base', candidate: 'candidate', changes })

test('evaluation inventory distinguishes original bytes deletion rename and modes', () => {
  const report = inventory([
    { status: 'M', path: 'tests/raw.dat', before: Buffer.from([255]), after: Buffer.from([254]), beforeMode: '100644', afterMode: '100644' },
    { status: 'D', path: 'tests/old.test.js', before: 'old oracle', beforeMode: '100644' },
    { status: 'R100', path: 'tests/new.test.js', oldPath: 'tests/moved.test.js', before: 'same', after: 'same', beforeMode: '100644', afterMode: '100644' },
    { status: 'M', path: 'tests/executable.test.js', before: 'same', after: 'same', beforeMode: '100644', afterMode: '100755' },
  ])
  assert.equal(report.files.length, 4)
  assert.equal(report.risks.length, 4)
  const raw = report.files.find(file => file.path === 'tests/raw.dat')
  assert.notEqual(raw.before, raw.after)
  assert.equal(report.risks.some(risk => risk.kind === 'evaluation-deleted'), true)
  assert.equal(report.risks.filter(risk => risk.kind === 'evaluation-location-or-mode-changed').length, 2)
})

test('nested manifests and fixture files belong to bounded inventory while ordinary prose does not', () => {
  for (const path of ['plugins/example/extension/package.json', 'pnpm-workspace.yaml', 'plugins/example/agent/test-fixtures.ts', 'scripts/runner.mjs']) assert.equal(isEvaluationPath(path), true, path)
  assert.equal(isEvaluationPath('docs/manual.md'), false)
  assert.match(inventory([]).coverage, /not full dependency coverage or review authorization/)
})

test('invalid paths status scores blobs and modes never become an empty successful inventory', () => {
  for (const change of [
    { status: 'R999', path: 'tests/a', before: 'a', after: 'b', beforeMode: '100644', afterMode: '100644' },
    { status: 'A', path: '../tests/a', after: 'a', afterMode: '100644' },
    { status: 'D', path: 'tests/a' },
    { status: 'A', path: 'tests/a', after: 'a', afterMode: '160000' },
  ]) assert.throws(() => inventory([change]))
})

test('same bytes and mode do not invent changes but copies remain visible', () => {
  const unchanged = inventory([{ status: 'M', path: 'tests/a.test.js', before: 'same', after: 'same', beforeMode: '100644', afterMode: '100644' }])
  assert.equal(unchanged.risks.length, 0)
  const copied = inventory([{ status: 'C100', oldPath: 'tests/a.test.js', path: 'tests/b.test.js', before: 'same', after: 'same', beforeMode: '100644', afterMode: '100644' }])
  assert.equal(copied.risks.length, 1)
  assert.equal(copied.files[0].oldPath, 'tests/a.test.js')
})
