import test from 'node:test'
import assert from 'node:assert/strict'
import { archiveCommandFailure, createSkippedInputTracker } from './test-env-bootstrap.mjs'

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
