import assert from 'node:assert/strict'
import { closeSync, existsSync, fstatSync, lstatSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { findChromePath } from '../worktree-web-qa.mjs'

/** Runs inside the documented Ego Node runtime, not inside the test process. */
async function runEgoFixture(input) {
  const { pathToFileURL } = await import('node:url')
  const task = await taskSpace(input.spaceId)
  const page = task.page(input.pageLabel)
  const assertIdentity = () => {
    if (task.ownership !== 'agent' || task.spaceId !== input.spaceId || page.spaceId !== input.spaceId || page.label !== input.pageLabel) {
      throw new Error('Ego fixture lost its agent-owned space or page')
    }
  }
  assertIdentity()
  await page.info()
  const targetId = page.targetId
  if (!targetId) throw new Error('Ego fixture page has no target identity')
  const url = pathToFileURL(input.file).href
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: input.viewportHeight, deviceScaleFactor: 1, mobile: false })
  await page.goto(url)
  await page.waitForFunction(({ token, waitForCompletion }) => {
    if (document.querySelector('meta[name="omnimux-style-probe"]')?.content !== token || !document.title.startsWith('RESULT:')) return false
    if (!waitForCompletion) return true
    try {
      const value = JSON.parse(document.title.slice('RESULT:'.length))
      return value.done === true || (value.done === false && typeof value.error === 'string')
    } catch { return true }
  }, { token: input.token, waitForCompletion: input.waitForCompletion }, { timeout: 20000 })
  assertIdentity()
  const observed = await page.evaluate(() => ({
    title: document.title, url: location.href,
    fixtureToken: document.querySelector('meta[name="omnimux-style-probe"]')?.content,
  }))
  if (observed.url !== url || observed.fixtureToken !== input.token || page.targetId !== targetId) {
    throw new Error('Ego fixture navigation or target identity changed')
  }
  if (input.screenshot) await page.screenshot({ path: input.screenshot })
  const receipt = { token: input.token, name: input.name, spaceId: task.spaceId, pageLabel: page.label, ownership: task.ownership,
    targetId, afterTargetId: page.targetId, fixtureToken: observed.fixtureToken, title: observed.title, screenshot: input.screenshot, sourceTransport: 'file' }
  assertIdentity()
  await page.goto('about:blank')
  if (await page.url() !== 'about:blank') throw new Error('Ego fixture page cleanup failed')
  receipt.pageNeutralized = true
  console.log('__OMNIMUX_STYLE_PROBE__' + JSON.stringify(receipt))
}

/**
 * Render an owned fixture using the explicitly selected transport. Ego reuses
 * a coordinator-owned page; this helper never creates or ends its TaskSpace.
 */
export function runStyleDomProbe({ name, styles, html, measure, viewportHeight = 800, waitForCompletion = false }) {
  assert.match(name, /^[a-z0-9_-]+$/i, 'Chrome probe name must contain only letters, digits, underscores or hyphens')
  const root = realpathSync(tmpdir())
  const prefix = `omnimux-${name}-`
  const dir = mkdtempSync(join(root, prefix))
  let directory
  const descriptors = []
  let output
  let stdout = ''
  let stderr = ''
  let result
  let failure
  let egoState
  let egoLock
  const transport = process.env.OMNIMUX_STYLE_PROBE_TRANSPORT || 'chrome'
  const token = randomUUID()
  let evidenceDir

  function readOutput(path, created, limit, tailOnly = false) {
    assert.equal(realpathSync(path), path, 'Chrome output must remain in its owned directory')
    const fd = openSync(path, 'r')
    descriptors.push(fd)
    const file = fstatSync(fd)
    const current = lstatSync(path)
    for (const proof of [file, current]) {
      assert.ok(proof.isFile(), 'Chrome output must be a regular file')
      assert.equal(proof.nlink, 1, 'Chrome output must have exactly one link')
      assert.equal(proof.dev, created.dev, 'Chrome output device changed')
      assert.equal(proof.ino, created.ino, 'Chrome output identity changed')
      assert.equal(proof.uid, directory.uid, 'Chrome output owner changed')
    }
    assert.ok(Number.isSafeInteger(file.size) && file.size >= 0, 'Chrome output size must be bounded')
    if (!tailOnly) assert.ok(file.size <= limit, `Chrome stdout exceeds ${limit} bytes`)
    const size = Math.min(file.size, limit)
    const bytes = Buffer.alloc(size)
    const start = tailOnly ? file.size - size : 0
    let offset = 0
    while (offset < size) {
      const count = readSync(fd, bytes, offset, size - offset, start + offset)
      assert.ok(count > 0, 'Chrome output became shorter while reading its snapshot')
      offset += count
    }
    return bytes.toString('utf8')
  }

  try {
    directory = lstatSync(dir)
    assert.ok(directory.isDirectory(), 'Chrome fixture must remain a directory')
    assert.ok(['chrome', 'ego'].includes(transport), 'Unknown style probe transport')
    assert.ok(Number.isSafeInteger(viewportHeight) && viewportHeight > 0 && viewportHeight <= 10000, 'Invalid probe viewport height')
    let spaceId
    if (transport === 'ego') {
      const selected = process.env.OMNIMUX_EGO_SPACE_ID || ''
      assert.match(selected, /^[1-9]\d*$/, 'Ego requires an explicit numeric space ID')
      spaceId = Number(selected)
      assert.ok(Number.isSafeInteger(spaceId), 'Ego space ID must be a safe integer')
      const statePath = process.env.OMNIMUX_EGO_PROBE_STATE_DIR
      assert.ok(statePath, 'Ego requires a private run state directory')
      const path = realpathSync(statePath)
      const proof = lstatSync(path)
      assert.ok(proof.isDirectory() && proof.uid === directory.uid, 'Ego state directory must be owned by this user')
      egoState = { path, proof }
      assert.equal(existsSync(join(path, 'blocked.json')), false, 'Ego run is blocked after a previous transport failure')
      const lockPath = join(path, 'active.lock')
      assert.equal(existsSync(lockPath), false, 'Ego page is already held by another probe')
      const fd = openSync(lockPath, 'wx', 0o600)
      egoLock = { path: lockPath, fd, proof: fstatSync(fd) }
      writeFileSync(fd, token)
      if (process.env.OMNIMUX_EGO_PROBE_EVIDENCE_DIR) {
        evidenceDir = realpathSync(process.env.OMNIMUX_EGO_PROBE_EVIDENCE_DIR)
        assert.ok(lstatSync(evidenceDir).isDirectory(), 'Ego evidence path must be an existing directory')
      }
    }
    const page = join(dir, 'probe.html')
    const source = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>pending</title>
<meta name="omnimux-style-probe" content="${token}">
<style>* { box-sizing: border-box; margin: 0; padding: 0; } body { width: 1600px; background: #111; color: #fff; }</style>
<style>${styles}</style></head><body>${html}
<script>document.title = 'RESULT:' + JSON.stringify((${measure.toString()})());</script>
</body></html>`
    writeFileSync(page, source)
    const stdoutPath = join(dir, 'stdout')
    const stderrPath = join(dir, 'stderr')
    const stdoutFd = openSync(stdoutPath, 'wx', 0o600)
    descriptors.push(stdoutFd)
    const stdoutFile = fstatSync(stdoutFd)
    const stderrFd = openSync(stderrPath, 'wx', 0o600)
    descriptors.push(stderrFd)
    const stderrFile = fstatSync(stderrFd)
    for (const file of [stdoutFile, stderrFile]) {
      assert.ok(file.isFile(), 'Chrome output must be a regular file')
      assert.equal(file.nlink, 1, 'Chrome output must have exactly one link')
      assert.equal(file.uid, directory.uid, 'Chrome output must belong to the directory owner')
    }
    const egoInput = transport === 'ego' ? { file: page, name, token, spaceId, pageLabel: 'p1', viewportHeight, waitForCompletion,
      ...(evidenceDir ? { screenshot: join(evidenceDir, `${name}-${token}.png`) } : {}) } : null
    const egoScript = join(dir, 'ego-probe.mjs')
    if (transport === 'ego') writeFileSync(egoScript,
      `const input = ${JSON.stringify(egoInput)}\nconst runEgoProbe = ${runEgoFixture.toString()}\nawait runEgoProbe(input)\n`, { flag: 'wx', mode: 0o600 })
    output = transport === 'ego' ? spawnSync('ego-browser', ['nodejs', '-e', `await import(${JSON.stringify(pathToFileURL(egoScript).href)})`], {
      encoding: 'utf8', timeout: 30000, stdio: ['ignore', stdoutFd, stderrFd],
    }) : spawnSync(findChromePath(), [
      '--headless=new',
      '--incognito',
      `--user-data-dir=${join(dir, 'profile')}`,
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=1600,${viewportHeight}`,
      '--virtual-time-budget=1500',
      '--dump-dom',
      `file://${page}`,
    ], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', stdoutFd, stderrFd] })
    try {
      stderr = readOutput(stderrPath, stderrFile, 8192, true)
      stdout = readOutput(stdoutPath, stdoutFile, 8 * 1024 * 1024)
    } catch (error) {
      if (output.error) {
        output.error.outputError = error
        throw output.error
      }
      throw error
    }
    if (output.error) throw output.error
    assert.equal(output.status, 0, stderr.slice(-2048) || `Chrome exited with ${output.status}`)
    assert.equal(output.signal, null, `Chrome terminated by ${output.signal}`)
    if (transport === 'ego') {
      const marker = '__OMNIMUX_STYLE_PROBE__'
      const records = [...stdout.split(/\r?\n/), ...stderr.split(/\r?\n/)].filter(line => line.startsWith(marker))
      assert.equal(records.length, 1, 'Ego must return exactly one fixture receipt')
      const receipt = JSON.parse(records[0].slice(marker.length))
      assert.equal(receipt.token, token, 'Ego receipt token mismatch')
      assert.equal(receipt.name, name, 'Ego fixture name mismatch')
      assert.equal(receipt.spaceId, spaceId, 'Ego receipt space mismatch')
      assert.equal(receipt.pageLabel, 'p1', 'Ego receipt page mismatch')
      assert.equal(receipt.ownership, 'agent', 'Ego control is no longer agent-owned')
      assert.ok(typeof receipt.targetId === 'string' && receipt.targetId, 'Ego receipt needs a target identity')
      assert.equal(receipt.afterTargetId, receipt.targetId, 'Ego target changed during measurement')
      assert.equal(receipt.fixtureToken, token, 'Ego returned a stale fixture')
      assert.equal(receipt.sourceTransport, 'file', 'Ego fixture source transport mismatch')
      assert.equal(receipt.pageNeutralized, true, 'Ego fixture page cleanup failed')
      assert.ok(typeof receipt.title === 'string' && receipt.title.startsWith('RESULT:'), 'Ego result title is missing')
      result = JSON.parse(receipt.title.slice('RESULT:'.length))
      if (waitForCompletion) assert.ok(result.done === true || (result.done === false && typeof result.error === 'string'), 'Ego async fixture has not completed')
      if (evidenceDir) writeFileSync(join(evidenceDir, `${name}-${token}.json`), JSON.stringify({ ...receipt, result }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    } else {
      const match = /<title>RESULT:(.*?)<\/title>/s.exec(stdout)
      assert.ok(match, `页面未回传测量结果: ${stdout.slice(0, 300)}`)
      result = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
    }
  } catch (error) {
    failure = error
  } finally {
    const cleanupErrors = []
    for (const fd of descriptors.reverse()) {
      try { closeSync(fd) } catch (error) { cleanupErrors.push(error) }
    }
    try {
      assert.ok(directory, 'Chrome fixture identity unavailable; owned directory retained')
      assert.equal(dirname(dir), root, 'Chrome cleanup must stay within the canonical temporary directory')
      assert.ok(basename(dir).startsWith(prefix), 'Chrome cleanup must match its owned directory prefix')
      assert.equal(realpathSync(dir), dir, 'Chrome cleanup directory must remain canonical')
      const current = lstatSync(dir)
      assert.ok(current.isDirectory(), 'Chrome cleanup target must remain a directory')
      assert.equal(current.dev, directory.dev, 'Chrome cleanup directory device changed')
      assert.equal(current.ino, directory.ino, 'Chrome cleanup directory identity changed')
      rmSync(dir, { recursive: true, force: true })
    } catch (error) { cleanupErrors.push(error) }
    if (cleanupErrors.length) {
      failure ||= cleanupErrors[0]
      failure.cleanupErrors = cleanupErrors
    }
    if (egoLock) {
      try {
        assert.equal(realpathSync(egoState.path), egoState.path, 'Ego state directory changed')
        const state = lstatSync(egoState.path)
        assert.equal(state.dev, egoState.proof.dev)
        assert.equal(state.ino, egoState.proof.ino)
        const lock = lstatSync(egoLock.path)
        assert.ok(lock.isFile() && lock.nlink === 1, 'Ego lock must remain a regular owned file')
        assert.equal(lock.dev, egoLock.proof.dev)
        assert.equal(lock.ino, egoLock.proof.ino)
        closeSync(egoLock.fd)
        egoLock.fd = undefined
        unlinkSync(egoLock.path)
      } catch (error) {
        failure ||= error
      }
      if (failure) {
        try { writeFileSync(join(egoState.path, 'blocked.json'), JSON.stringify({ name, code: failure.code || 'probe-failed' }) + '\n', { flag: 'wx', mode: 0o600 }) }
        catch (error) { failure.blockedReceiptError = error }
      }
      if (egoLock.fd !== undefined) {
        try { closeSync(egoLock.fd) } catch (error) { failure ||= error }
      }
    }
  }
  if (failure) {
    /** @type {{ name: string, timeoutMs: number, status: number | null, signal: string | null, stdoutTail: string, stderrTail: string, measurementPresent: boolean }} */
    const diagnostic = {
      name,
      timeoutMs: 30000,
      status: output?.status ?? null,
      signal: output?.signal ?? null,
      stdoutTail: stdout.slice(-2048),
      stderrTail: stderr.slice(-2048),
      measurementPresent: transport === 'ego' ? (stdout + stderr).includes('__OMNIMUX_STYLE_PROBE__') : /<title>RESULT:(.*?)<\/title>/s.test(stdout),
    }
    failure.diagnostic = diagnostic
    failure.message += `\n${transport === 'ego' ? 'Ego' : 'Chrome'} probe diagnostic: ${JSON.stringify(diagnostic)}`
    throw failure
  }
  return result
}
