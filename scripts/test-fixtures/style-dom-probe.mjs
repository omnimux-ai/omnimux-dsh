import assert from 'node:assert/strict'
import { closeSync, fstatSync, lstatSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { findChromePath } from '../worktree-web-qa.mjs'

/**
 * Render one owner-local style fixture in an ephemeral incognito browser
 * session and return the computed geometry selected by `measure`.
 */
export function runStyleDomProbe({ name, styles, html, measure }) {
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
    const page = join(dir, 'probe.html')
    const source = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>pending</title>
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
    output = spawnSync(findChromePath(), [
      '--headless=new',
      '--incognito',
      `--user-data-dir=${join(dir, 'profile')}`,
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1600,800',
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
    const match = /<title>RESULT:(.*?)<\/title>/s.exec(stdout)
    assert.ok(match, `页面未回传测量结果: ${stdout.slice(0, 300)}`)
    result = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
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
      measurementPresent: /<title>RESULT:(.*?)<\/title>/s.test(stdout),
    }
    failure.diagnostic = diagnostic
    failure.message += `\nChrome probe diagnostic: ${JSON.stringify(diagnostic)}`
    throw failure
  }
  return result
}
