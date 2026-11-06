import test from 'node:test'
import assert from 'node:assert/strict'
import { agentPresetPatchText, archiveCommandFailure, createSkippedInputTracker, isSupportedHubUiKitSpec, safeError } from './test-env-bootstrap.mjs'
import { sanitizeFailureReport, sanitizeFailureText } from './worktree-app-qa.mjs'

test('skipped input tracker keeps a bounded sample and the true total', () => {
  const tracker = createSkippedInputTracker(3)
  for (const name of ['a.js', 'b.js', 'c.js', 'd.js', 'e.js']) tracker.note(name)
  assert.deepEqual(tracker.snapshot(), { count: 5, sample: ['a.js', 'b.js', 'c.js'] })
})

test('skipped input tracker defaults to 20 samples and counts an untouched tracker as zero', () => {
  assert.deepEqual(createSkippedInputTracker().snapshot(), { count: 0, sample: [] })
  const tracker = createSkippedInputTracker()
  for (let index = 0; index < 25; index += 1) tracker.note(`file-${index}.js`)
  const snapshot = tracker.snapshot()
  assert.equal(snapshot.count, 25)
  assert.equal(snapshot.sample.length, 20)
  assert.equal(snapshot.sample[0], 'file-0.js')
  assert.equal(snapshot.sample[19], 'file-19.js')
})

test('preparation pack accepts the published dsh-ui-kit range and the legacy in-repo file spec', () => {
  for (const spec of ['^0.1.0', '~0.1.0', '0.1.0', '^0.1.0-rc.1', 'file:../../packages/dsh-ui-kit']) {
    assert.equal(isSupportedHubUiKitSpec(spec), true, `${spec} must stay packable from a bare directory`)
  }
})

test('preparation pack still rejects dsh-ui-kit specs it cannot resolve without a workspace', () => {
  for (const spec of [undefined, null, '', 'workspace:^', 'workspace:*', 'file:../elsewhere', 'catalog:default', '^0.1']) {
    assert.equal(isSupportedHubUiKitSpec(spec), false, `${String(spec)} must not be accepted`)
  }
})

test('archive failure carries a stable exit reason and structured detail', () => {
  const error = archiveCommandFailure('PREPARE_ARCHIVE_INSPECTION_FAILED', '检查',
    { status: 3, signal: null, stdout: '', stderr: '{"error": "SHA256 mismatch"}\n' })
  assert.equal(error.code, 'TEST_ENV_PREPARE_ARCHIVE_INSPECTION_FAILED')
  assert.equal(error.reason, 'ARCHIVE_COMMAND_EXIT')
  assert.equal(error.detail.action, '检查')
  assert.equal(error.detail.exitStatus, 3)
  assert.equal(error.detail.signal, null)
  assert.match(error.detail.stderrTail, /SHA256 mismatch/)
  assert.match(error.hint, /status=3/)
})

test('archive failure distinguishes signals and spawn failures', () => {
  const killed = archiveCommandFailure('PREPARE_ARCHIVE_EXTRACTION_FAILED', '解包',
    { status: null, signal: 'SIGKILL', stdout: '', stderr: '' })
  assert.equal(killed.reason, 'ARCHIVE_COMMAND_SIGNAL')
  assert.equal(killed.detail.signal, 'SIGKILL')
  assert.equal(killed.detail.exitStatus, null)
  const spawned = archiveCommandFailure('PREPARE_ARCHIVE_EXTRACTION_FAILED', '解包',
    { status: null, signal: null, stdout: '', stderr: '', error: new Error('spawn python3 ENOENT') })
  assert.equal(spawned.reason, 'ARCHIVE_COMMAND_SPAWN')
  assert.match(spawned.detail.stderrTail, /ENOENT/)
})

test('archive failure detail and hint stay bounded', () => {
  const error = archiveCommandFailure('PREPARE_ARCHIVE_INSPECTION_FAILED', '检查',
    { status: 1, signal: null, stdout: '', stderr: 'x'.repeat(4000) })
  assert.equal(error.detail.stderrTail.length, 1200)
  assert.ok(error.hint.length <= 1600)
})

test('safeError keeps reason and detail through runtime reclassification', () => {
  const original = archiveCommandFailure('PREPARE_ARCHIVE_EXTRACTION_FAILED', '解包',
    { status: 2, signal: null, stdout: '', stderr: 'tar: broken pipe' })
  const classified = safeError(original, 'PREPARE_FAILED')
  assert.equal(classified.code, 'TEST_ENV_PREPARE_ARCHIVE_EXTRACTION_FAILED')
  assert.equal(classified.reason, 'ARCHIVE_COMMAND_EXIT')
  assert.equal(classified.detail.exitStatus, 2)
  assert.match(classified.detail.stderrTail, /broken pipe/)
  assert.equal(safeError(new Error('unrelated'), 'PREPARE_FAILED').code, 'TEST_ENV_PREPARE_FAILED')
})

test('failure report keeps the stderr tail, redacts secrets and drops unsupported nesting', () => {
  const longTail = `${'a'.repeat(1300)}SHA256 mismatch`
  const report = sanitizeFailureReport('TEST_ENV_PREPARE_ARCHIVE_INSPECTION_FAILED', 'ARCHIVE_COMMAND_EXIT', {
    action: '检查',
    exitStatus: 3,
    stderrTail: longTail,
    nested: { token: 'secret-value' },
    packages: ['packages/dsh-ui-kit', 'plugins/omnimux', 'plugins/omnimux-workflow'],
  })
  assert.equal(report.code, 'TEST_ENV_PREPARE_ARCHIVE_INSPECTION_FAILED')
  assert.equal(report.reason, 'ARCHIVE_COMMAND_EXIT')
  assert.equal(report.detail.exitStatus, 3)
  assert.match(report.detail.stderrTail, /SHA256 mismatch$/)
  assert.equal(report.detail.nested, null)
  assert.deepEqual(report.detail.packages, ['packages/dsh-ui-kit', 'plugins/omnimux', 'plugins/omnimux-workflow'])
  assert.equal(sanitizeFailureText('Authorization: Bearer abc'), '[redacted]')
  assert.equal(sanitizeFailureReport('TEST_ENV_RUNTIME_EXIT', null, null).detail, null)
})

test('redaction decides on the full value so tail truncation cannot strip the keyword', () => {
  const value = `Authorization: Bearer sk-live-ABCDEF1234567890 ${'z'.repeat(1170)}`
  assert.equal(sanitizeFailureText(value, { tail: true, limit: 1200 }), '[redacted]')
  assert.equal(sanitizeFailureReport('TEST_ENV_RUNTIME_EXIT', 'RUNTIME_EXIT', { stderrTail: value }).detail.stderrTail, '[redacted]')
})

test('preset 声明失败必须响亮抛出，不能退化成空串（静默降级回归）', () => {
  const layout = { appRoot: '/fake/App/Contents/Resources/app', layout: 'app' };
  // 预设目录不存在
  assert.throws(() => agentPresetPatchText(layout, { hasShippedPresetRoot: () => false }),
    { code: 'TEST_ENV_PRESET_ROOT_MISSING' });
  // 合成过程抛错
  assert.throws(() => agentPresetPatchText(layout, {
    hasShippedPresetRoot: () => true,
    createRequire: () => ({ resolve: () => '/x' }),
    composeAgentPresetRows: () => { throw new Error('boom'); },
  }), { code: 'TEST_ENV_PRESET_COMPOSE_FAILED' });
  // 合成结果为空
  assert.throws(() => agentPresetPatchText(layout, {
    hasShippedPresetRoot: () => true,
    createRequire: () => ({ resolve: () => '/x' }),
    composeAgentPresetRows: () => ({ rows: [] }),
  }), { code: 'TEST_ENV_PRESET_ROWS_EMPTY' });
  // 正常路径返回片段
  const text = agentPresetPatchText(layout, {
    hasShippedPresetRoot: () => true,
    createRequire: () => ({ resolve: () => '/x' }),
    composeAgentPresetRows: () => ({ rows: [{ id: 'omnimux-preset-x', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'x', plugins: [{ name: 'omnimux' }] } }] }),
    stringifyStructuredFile: () => '- insert: []\n',
  });
  assert.match(text, /dsh-agent-preset|insert/);
})

test('归档布局下读不到 asar 目录表时响亮失败，不回落到 Node resolver', () => {
  const layout = { layout: 'app.asar', appRoot: '/App/Contents/Resources/app.asar' };
  assert.throws(() => agentPresetPatchText(layout, {
    hasShippedPresetRoot: () => true,
    readAsarTree: () => { throw new Error('bad header'); },
    createRequire: () => ({ resolve: () => { throw new Error('nope'); } }),
    composeAgentPresetRows: () => ({ rows: [{ id: 'x', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'x', plugins: [{ name: 'omnimux' }] } }] }),
    stringifyStructuredFile: () => '- insert: []\n',
  }), { code: 'TEST_ENV_PRESET_COMPOSE_FAILED' });
})

test('归档布局下用目录表判定插件行，不把 @ 包行剪空', () => {
  const layout = { layout: 'app.asar', appRoot: '/App/Contents/Resources/app.asar' };
  const seen = [];
  agentPresetPatchText(layout, {
    hasShippedPresetRoot: () => true,
    readAsarTree: () => ({ files: { node_modules: { files: { '@deepseek-ai': { files: { dsh: { files: { 'package.json': { size: 1 } } } } } } } } }),
    createRequire: () => ({ resolve: () => { throw new Error('Node resolver 读不到归档内包'); } }),
    composeAgentPresetRows: ({ resolvable }) => {
      seen.push(resolvable('@deepseek-ai/dsh'), resolvable('@deepseek-ai/nope'));
      return { rows: [{ id: 'x', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'x', plugins: [{ name: 'omnimux' }] } }] };
    },
    stringifyStructuredFile: () => '- insert: []\n',
  });
  assert.deepEqual(seen, [true, false]);
})
