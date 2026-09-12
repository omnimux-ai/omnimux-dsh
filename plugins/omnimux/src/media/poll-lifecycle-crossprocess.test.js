/**
 * Issue #1382 P1/T02 evidence that needs its own process.
 *
 * The hub test suite runs with `scripts/test-network-guard.mjs` preloaded,
 * which replaces `globalThis.fetch` and blocks loopback too. These two claims
 * therefore run in child processes without that preload, talking only to a
 * loopback server this probe starts itself — never to a model API:
 *
 *  1. the composed signal reaches the platform `fetch`, so a provider that
 *     accepts the connection and never answers is bounded (the pre-fix shape is
 *     reproduced alongside: a signal-less `fetch` against the same server is
 *     still pending after the wait, which is why a post-hoc abort check could
 *     never help);
 *  2. a task can be finished by id from a *different* process, i.e. the reason
 *     "unknown task, resubmit" after a restart was a client-side memory limit,
 *     not a hub one.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const PROBE = fileURLToPath(new URL('./fixtures/poll-lifecycle-probe.mjs', import.meta.url))

/**
 * @param {string[]} args
 * @returns {{ok: boolean, [key: string]: unknown}}
 */
function runProbe(args) {
  const result = spawnSync(process.execPath, [PROBE, ...args], {
    encoding: 'utf8',
    timeout: 20_000,
  })
  assert.equal(result.signal, null, `probe ${args[0]} did not finish: ${result.stderr}`)
  assert.notEqual(result.stdout.trim(), '', `probe ${args[0]} printed nothing: ${result.stderr}`)
  return JSON.parse(result.stdout.trim().split('\n').at(-1))
}

test('修复前复现：不带 signal 的 fetch 对挂死 server 永不 settle', () => {
  const probe = runProbe(['raw', '600'])
  assert.equal(probe.settled, false, 'a signal-less fetch must still be pending — that is the defect')
  assert.ok(Number(probe.elapsedMs) >= 600)
})

test('修复后：真实 fetch 在 deadline 内被约束（不再永久挂起）', () => {
  const probe = runProbe(['hang', '1500', '300'])
  assert.equal(probe.ok, true, JSON.stringify(probe))
  assert.equal(probe.code, 'omnimux-task-timeout')
  const elapsed = Number(probe.elapsedMs)
  assert.ok(Number(probe.attempts) >= 1, 'the poll must have issued requests')
  assert.ok(elapsed >= 1200, `the poll should run to its deadline, took ${elapsed}ms`)
  assert.ok(elapsed < 15_000, `the deadline must bound the poll, took ${elapsed}ms`)
})

test('两个独立进程都能按同一个 taskId 复核完成（不依赖内存登记）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-1382-probe-'))
  try {
    const first = join(dir, 'first.mp4')
    const second = join(dir, 'second.mp4')
    const a = runProbe(['finish', 'task-shared', first])
    const b = runProbe(['finish', 'task-shared', second])
    assert.equal(a.ok, true, JSON.stringify(a))
    assert.equal(b.ok, true, JSON.stringify(b))
    assert.notEqual(a.pid, b.pid, 'both finishes must come from different processes')
    assert.equal(a.mode, 'live')
    assert.equal(b.mode, 'live')
    assert.equal(readFileSync(first, 'utf8'), 'mp4-probe-bytes')
    assert.equal(readFileSync(second, 'utf8'), 'mp4-probe-bytes')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
