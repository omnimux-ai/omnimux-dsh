/**
 * scripts/report-blocker.test.mjs
 * 合法阻断出口的行为测试：记录必须「有证据」才成立，且不授予任何授权。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  BLOCKER_DIR,
  buildBlocker,
  inspectEvidencePath,
  main,
  parseArgs,
  validateBlocker,
} from './report-blocker.mjs'

function makeRepo(name) {
  const root = mkdtempSync(join(tmpdir(), `report-blocker-${name}-`))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'omnimux-dsh' }))
  mkdirSync(join(root, 'docs/evidence'), { recursive: true })
  return root
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true })
}

function capture() {
  let text = ''
  return { write: (chunk) => { text += chunk }, text: () => text }
}

function baseRecord(overrides) {
  const record = {
    schemaVersion: 1,
    kind: 'omnimux-blocker',
    taskId: 'demo-task-1',
    phase: 'implement',
    summary: '外部依赖不可用，无法继续验证',
    createdAt: new Date().toISOString(),
    repo: { baseSha: null, headSha: null },
    attempts: [{ command: 'pnpm --filter demo test', exitCode: 1 }],
    missing: [],
    evidence: [],
    nextAction: '恢复网络后重跑门禁',
    authorization: 'not-granted',
  }
  return Object.assign(record, overrides || {})
}

test.describe('report-blocker', () => {
  test('写入合法阻断记录，并明确「阻断 ≠ 通过」', () => {
    const root = makeRepo('ok')
    const stdout = capture()
    const stderr = capture()
    try {
      writeFileSync(join(root, 'docs/evidence/shot.png'), 'png-bytes')
      const exitCode = main([
        '--task', 'demo-task-1',
        '--phase', 'implement',
        '--summary', '外部依赖不可用，无法继续验证',
        '--next', '恢复网络后重跑门禁',
        '--command', 'pnpm --filter demo test',
        '--exit-code', '1',
        '--evidence', 'docs/evidence/shot.png',
      ], { cwd: root, stdout, stderr })
      assert.equal(exitCode, 0, stderr.text())
      const file = join(root, BLOCKER_DIR, 'demo-task-1.json')
      assert.ok(existsSync(file), '阻断记录应落盘')
      const record = JSON.parse(readFileSync(file, 'utf8'))
      assert.equal(record.kind, 'omnimux-blocker')
      assert.equal(record.authorization, 'not-granted')
      assert.equal(record.attempts[0].exitCode, 1)
      assert.deepEqual(record.evidence, ['docs/evidence/shot.png'])
      assert.match(stdout.text(), /阻断 ≠ 通过/)
    } finally {
      cleanup(root)
    }
  })

  test('没有失败尝试也没有 missing → 拒绝写入', () => {
    const root = makeRepo('empty')
    const stdout = capture()
    const stderr = capture()
    try {
      const exitCode = main([
        '--task', 'demo-task-2',
        '--phase', 'verify',
        '--summary', '任务卡住了，做不下去',
        '--next', '等通知',
      ], { cwd: root, stdout, stderr })
      assert.equal(exitCode, 2)
      assert.equal(existsSync(join(root, BLOCKER_DIR, 'demo-task-2.json')), false)
      assert.match(stderr.text(), /空口/)
    } finally {
      cleanup(root)
    }
  })

  test('证据路径不允许穿越、绝对路径与符号链接', () => {
    const root = makeRepo('paths')
    try {
      writeFileSync(join(root, 'docs/evidence/real.png'), 'x')
      symlinkSync(join(root, 'docs/evidence/real.png'), join(root, 'docs/evidence/link.png'))
      assert.match(inspectEvidencePath(root, '../escape.png'), /非法片段/)
      assert.match(inspectEvidencePath(root, '/etc/passwd'), /仓库相对路径/)
      assert.match(inspectEvidencePath(root, 'docs/evidence/link.png'), /符号链接/)
      assert.equal(inspectEvidencePath(root, 'docs/evidence/real.png'), null)
    } finally {
      cleanup(root)
    }
  })

  test('validateBlocker 拒绝非法 taskId / phase / authorization', () => {
    const root = makeRepo('invalid')
    try {
      const badTask = validateBlocker(baseRecord({ taskId: '../etc' }), { root })
      assert.equal(badTask.ok, false)
      assert.ok(badTask.errors.some((error) => error.includes('taskId')))
      const badPhase = validateBlocker(baseRecord({ phase: 'shipping' }), { root })
      assert.equal(badPhase.ok, false)
      const badAuth = validateBlocker(baseRecord({ authorization: 'granted' }), { root })
      assert.equal(badAuth.ok, false)
      const ok = validateBlocker(baseRecord(), { root })
      assert.equal(ok.ok, true, ok.errors.join('; '))
    } finally {
      cleanup(root)
    }
  })

  test('--json 输入同样要过校验', () => {
    const root = makeRepo('json')
    try {
      const file = join(root, 'record.json')
      writeFileSync(file, JSON.stringify({ schemaVersion: 1, kind: 'omnimux-blocker', taskId: 'x' }))
      const exitCode = main(['--json', file], { cwd: root, stdout: capture(), stderr: capture() })
      assert.equal(exitCode, 2)
    } finally {
      cleanup(root)
    }
  })

  test('parseArgs 拒绝未知参数与缺失参数值', () => {
    assert.throws(() => parseArgs(['--nope']), /未知参数/)
    assert.throws(() => parseArgs(['--task']), /缺少参数值/)
    const parsed = parseArgs(['--task', 't', '--missing', 'ego-browser'])
    assert.equal(parsed.task, 't')
    assert.deepEqual(parsed.missing, ['ego-browser'])
  })

  test('buildBlocker 把 missing 项作为合法阻断依据', () => {
    const record = buildBlocker({
      taskId: 'demo-task-3',
      phase: 'deliver',
      summary: '缺少 ego-browser 能力，无法做真实浏览器验收',
      nextAction: '安装 ego 后重跑验收',
      missing: ['ego-browser capability'],
      root: null,
      now: new Date('2026-10-21T00:00:00.000Z'),
    })
    assert.equal(record.attempts.length, 0)
    assert.deepEqual(record.missing, ['ego-browser capability'])
    assert.equal(validateBlocker(record).ok, true)
  })
})
