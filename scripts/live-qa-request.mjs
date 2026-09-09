import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { allowedAddress, isInside } from './live-browser-utils.mjs'

export const moduleRoot = fileURLToPath(new URL('..', import.meta.url))

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

export function validateRequest(requestPath, request, now) {
  assert.equal(request.version, 1, 'Unsupported QA request version')
  assert.ok(!request.consumedAt, 'Prepared QA request was already consumed')
  assert.ok(Date.parse(request.expiresAt) > now, 'Prepared QA request expired; run verify:live again')
  const root = request.root || moduleRoot
  assert.equal(realpathSync(root), realpathSync(moduleRoot), 'Prepared QA request belongs to another worktree')
  assert.ok(isInside(join(root, '.workbuddy', 'evidence', 'live-qa'), resolve(request.evidenceDir)), 'Prepared QA evidence directory is outside this worktree')
  assert.equal(resolve(request.reportPath), resolve(root, 'docs/evidence/live-qa-report.json'), 'Prepared QA report path is outside this worktree')
  assert.ok(allowedAddress(request.url, request.target), 'Prepared QA target is not an allowed local Dev origin')
  assert.equal(request.profile, 'omnimux-dev', 'Prepared QA profile must be omnimux-dev')
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), request.commitSha, 'Prepared QA request SHA is stale')
  assert.ok(existsSync(requestPath), 'Prepared QA request does not exist')
  return root
}

export function consumeRequest(requestPath, expected, now = Date.now()) {
  const lockPath = `${requestPath}.consumed`
  let fd
  let committed = false
  try {
    try { fd = openSync(lockPath, 'wx', 0o600) } catch { throw new Error('Prepared QA request was already consumed') }
    const current = JSON.parse(readFileSync(requestPath, 'utf8'))
    if (!isDeepStrictEqual(current, expected)) throw new Error('Prepared QA request changed during browser preparation')
    assert.equal(current.version, 1, 'Unsupported QA request version')
    assert.ok(!current.consumedAt, 'Prepared QA request was already consumed')
    assert.ok(Date.parse(current.expiresAt) > now, 'Prepared QA request expired; run verify:live again')
    current.consumedAt = new Date(now).toISOString()
    writeJson(requestPath, current)
    committed = true
    return current
  } finally {
    if (fd !== undefined) closeSync(fd)
    if (fd !== undefined && !committed) {
      try { unlinkSync(lockPath) } catch {}
    }
  }
}
