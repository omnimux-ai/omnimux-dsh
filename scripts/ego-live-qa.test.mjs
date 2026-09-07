import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { afterEach, test } from 'node:test'
import { captureEgoPng } from './ego-live-qa.mjs'
import { assertStageState, saveProbeScreenshot } from './live-stage-probe.mjs'
import { auth, cleanup, fakeTab, loading, origin, png, ready, request, roots } from './ego-qa-test-helpers.mjs'

afterEach(cleanup)
const unconsumed = item => {
  assert.equal(existsSync(`${item.path}.consumed`), false)
  assert.equal(JSON.parse(readFileSync(item.path, 'utf8')).consumedAt, null)
}

test('expired and stale SHA requests fail before consumption', async () => {
  for (const overrides of [{ expiresAt: new Date(0).toISOString() }, { commitSha: '0'.repeat(40) }]) {
    const item = await request(overrides)
    const result = await item.runner.runPreparedQa(item.path, { tab: fakeTab() })
    assert.equal(result.pass, false); assert.equal(result.failureKind, 'request-invalid'); unconsumed(item)
    assert.equal(existsSync(item.value.reportPath), false)
  }
})

test('preflight authentication failure preserves reusable request and pending canonical report', async () => {
  for (const values of [[auth, { kind: 'response', status: 401 }], [loading, { kind: 'response', status: 200 }, ready, { kind: 'response', status: 403 }]]) {
    const item = await request(); mkdirSync(join(item.root, 'docs/evidence'), { recursive: true })
    writeFileSync(item.value.reportPath, '{"status":"pending"}\n')
    const result = await item.runner.runPreparedQa(item.path, { tab: fakeTab(values), prepareOptions: { readyTimeoutMs: 50, pollIntervalMs: 10 } })
    assert.equal(result.failureKind, 'auth-required'); unconsumed(item)
    assert.deepEqual(JSON.parse(readFileSync(item.value.reportPath, 'utf8')), { status: 'pending' })
  }
})

test('wrong path, incomplete capabilities, and missing task/tab identity fail before consumption', async () => {
  for (const alter of [
    tab => { tab.url = async () => `${origin}/other` }, tab => { delete tab.click },
    tab => { tab.taskSpaceId = null }, tab => { tab.id = '' },
    tab => { tab.assertIdentity = async () => ({ taskSpaceId: 44, tabId: 'other' }) },
    tab => { tab.tool = 'codex-iab' },
  ]) {
    const item = await request(); const tab = fakeTab([ready]); alter(tab)
    const result = await item.runner.runPreparedQa(item.path, { tab })
    assert.equal(result.pass, false); unconsumed(item)
  }
})

test('request replacement and HEAD change during preparation cannot obtain execution rights', async () => {
  for (const kind of ['request', 'head']) {
    const item = await request(); let changed = false
    const tab = fakeTab([ready], { onSend: () => {
      if (changed) return; changed = true
      if (kind === 'request') writeFileSync(item.path, JSON.stringify({ ...item.value, stage: 'publish' }))
      else {
        writeFileSync(join(item.root, 'README'), 'changed\n'); execFileSync('git', ['add', 'README'], { cwd: item.root })
        execFileSync('git', ['-c', 'user.name=QA', '-c', 'user.email=qa@localhost', 'commit', '-qm', 'changed'], { cwd: item.root })
      }
    } })
    const result = await item.runner.runPreparedQa(item.path, { tab })
    assert.match(result.errors.join(';'), kind === 'request' ? /changed during browser preparation/i : /SHA is stale/i)
    unconsumed(item)
  }
})

test('expiry is checked again after page preparation', async () => {
  const item = await request({ expiresAt: new Date(5000).toISOString() })
  const ticks = [2000, 2000, 2000, 2000, 6000]
  const result = await item.runner.runPreparedQa(item.path, { tab: fakeTab([ready]), now: () => ticks.shift() ?? 6000 })
  assert.match(result.errors.join(';'), /expired/i); unconsumed(item)
})

test('concurrent consumers grant probe ownership once and preserve the winner report', async () => {
  const item = await request()
  const [a, b] = await Promise.all([item.runner.runPreparedQa(item.path, { tab: fakeTab([ready]) }), item.runner.runPreparedQa(item.path, { tab: fakeTab([ready]) })])
  assert.equal([a, b].filter(r => r.failureKind === 'qa-failed').length, 1)
  assert.equal([a, b].filter(r => r.failureKind === 'request-invalid').length, 1)
  assert.ok(JSON.parse(readFileSync(item.path, 'utf8')).consumedAt)
  const saved = JSON.parse(readFileSync(item.value.reportPath, 'utf8'))
  assert.equal(saved.failureKind, 'qa-failed'); assert.equal(saved.phase, 'probe'); assert.ok(saved.consumedAt)
})

test('two requests cannot operate the same task concurrently and task lock releases on preflight failure', async () => {
  const a = await request(); const b = await request()
  const tab = fakeTab([auth, { kind: 'response', status: 401 }])
  const results = await Promise.all([a.runner.runPreparedQa(a.path, { tab }), b.runner.runPreparedQa(b.path, { tab })])
  assert.ok(results.some(r => r.errors.some(e => e.includes('busy')))); unconsumed(a); unconsumed(b)
  const retry = fakeTab([auth, { kind: 'response', status: 401 }]); retry.taskSpaceId = tab.taskSpaceId
  const result = await a.runner.runPreparedQa(a.path, { tab: retry })
  assert.equal(result.failureKind, 'auth-required'); unconsumed(a)
})

test('invalid secret-bearing requests do not record target credentials', async () => {
  const item = await request({ url: `${origin}/?token=super-secret` })
  const result = await item.runner.runPreparedQa(item.path, { tab: fakeTab() })
  assert.equal(result.failureKind, 'request-invalid'); assert.doesNotMatch(JSON.stringify(result), /super-secret/)
  assert.equal(existsSync(item.value.reportPath), false)
})

test('post-consumption errors redact headers and JSON secrets but record actual consumption', async () => {
  const item = await request(); const tab = fakeTab([ready]); let reads = 0
  tab.url = async () => {
    if (++reads < 3) return `${origin}/`
    throw new Error('transport failed\nAuthorization: Bearer raw-bearer-secret\nCookie: session=raw-cookie-secret; preference=also-secret\npayload={"access_token":"raw-json-secret","message":"keep this assertion"}')
  }
  const result = await item.runner.runPreparedQa(item.path, { tab })
  assert.equal(result.failureKind, 'qa-failed'); assert.ok(result.consumedAt)
  for (const text of [JSON.stringify(result), readFileSync(item.value.reportPath, 'utf8')]) {
    assert.doesNotMatch(text, /raw-bearer-secret|raw-cookie-secret|also-secret|raw-json-secret/)
    assert.match(text, /Authorization: \[redacted\]/); assert.match(text, /Cookie: \[redacted\]/); assert.match(text, /keep this assertion/)
  }
})

test('lock release failure still persists the consumed failure report', async () => {
  const item = await request(); const tab = fakeTab([ready]); let reads = 0
  const dir = join('/tmp', `omnimux-ego-${process.getuid()}`, createHash('sha256').update(String(tab.taskSpaceId)).digest('hex'))
  tab.url = async () => {
    if (++reads < 3) return `${origin}/`
    writeFileSync(join(dir, 'owner.json'), JSON.stringify({ pid: -1, runId: 'replaced-test-owner' }))
    throw new Error('probe failure')
  }
  try {
    const result = await item.runner.runPreparedQa(item.path, { tab })
    assert.equal(result.failureKind, 'task-lock-release'); assert.equal(result.pass, false); assert.ok(result.consumedAt)
    assert.deepEqual(JSON.parse(readFileSync(item.value.reportPath, 'utf8')), result)
    assert.equal(existsSync(join(dir, 'owner.json')), true)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('screenshots must decode as PNG, not JPEG, empty, or header-only bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-png-')); roots.push(dir)
  assert.throws(() => saveProbeScreenshot(new Uint8Array(), join(dir, 'empty.png')), /PNG/i)
  saveProbeScreenshot(new Uint8Array(png), join(dir, 'valid.png')); assert.deepEqual(readFileSync(join(dir, 'valid.png')), png)
  const calls = []
  const capture = data => captureEgoPng({ cdp: { send: async (method, params) => { calls.push([method, params]); return { data: data.toString('base64') } } } })
  assert.deepEqual(await capture(png), png)
  assert.deepEqual(calls[0], ['Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }])
  await assert.rejects(capture(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), /PNG/)
  await assert.rejects(capture(png.subarray(0, 40)), /PNG/)
})

test('Stage state accepts cross-realm arrays but still requires exactly one selected entry', () => {
  const target = { stage: 'assets', selector: '[data-omnimux-assets-entry]', tabId: 'omnimux-assets:library' }
  const selected = vm.runInNewContext(`['${target.selector}']`)
  assert.notEqual(Object.getPrototypeOf(selected), Array.prototype)
  assertStageState({ hasState: true, sessionId: 's1', contextSessionId: 's1', entryCount: 1, panelOpen: true, active: true, activeTab: target.tabId, selected, contentCount: 1, contentLength: 1, loadingOnly: false, visibleErrors: 0 }, target, 's1')
})
