import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const scriptPath = join(here, 'sync-to-app.sh')
const resolverPath = join(here, 'resolve-omnimux-profile.sh')
const source = readFileSync(scriptPath, 'utf8')

describe('sync-to-app.sh unmerged bypass whitelist', () => {
  let testRoot
  let repoRoot

  const setupRepo = () => {
    const runId = Math.random().toString(36).substring(2, 9)
    testRoot = join(tmpdir(), `omnimux-sync-bypass-${runId}`)
    repoRoot = join(testRoot, 'repo')
    mkdirSync(join(repoRoot, 'scripts'), { recursive: true })
    execSync(`git init -b main "${repoRoot}"`, { stdio: 'ignore' })
    execSync(`git -C "${repoRoot}" config user.name "Test Agent"`, { stdio: 'ignore' })
    execSync(`git -C "${repoRoot}" config user.email "agent@omnimux.test"`, { stdio: 'ignore' })
    // 非 main 分支，触发对齐门禁
    execSync(`git -C "${repoRoot}" checkout -b agent/feature-bypass`, { stdio: 'ignore' })
    copyFileSync(scriptPath, join(repoRoot, 'scripts', 'sync-to-app.sh'))
    copyFileSync(resolverPath, join(repoRoot, 'scripts', 'resolve-omnimux-profile.sh'))
    for (const name of ['managed-tarball-archive.py', 'plugin-lifecycle.mjs']) copyFileSync(join(here, name), join(repoRoot, 'scripts', name))
    mkdirSync(join(repoRoot, 'plugins/omnimux/src'), { recursive: true })
    copyFileSync(join(here, '../plugins/omnimux/src/plugin-lifecycle.json'), join(repoRoot, 'plugins/omnimux/src/plugin-lifecycle.json'))
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'omnimux-dsh', private: true }))
    execSync(`git -C "${repoRoot}" add .`, { stdio: 'ignore' })
    execSync(`git -C "${repoRoot}" commit -m "chore: test repo"`, { stdio: 'ignore' })
  }

  const cleanup = () => {
    if (testRoot && existsSync(testRoot)) {
      try { rmSync(testRoot, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }

  const run = (env) => {
    try {
      execSync(`bash "${join(repoRoot, 'scripts', 'sync-to-app.sh')}" --skip-build`, {
        cwd: repoRoot, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'],
      })
      return { ok: true, out: '' }
    } catch (err) {
      return { ok: false, out: `${err.stdout || ''}${err.stderr || ''}` }
    }
  }

  it('rejects the legacy boolean bypass without a whitelist target', () => {
    setupRepo()
    try {
      const r = run({ OMNIMUX_ALLOW_UNMERGED_MATERIALIZE: '1' })
      assert.equal(r.ok, false, 'must reject legacy boolean bypass')
      assert.ok(r.out.includes('已废弃'), `expected deprecation message, got: ${r.out}`)
    } finally {
      cleanup()
    }
  })

  it('rejects an unmerged target outside ~/.dsh-dev/tasks (e.g. public dev)', () => {
    setupRepo()
    try {
      const r = run({ OMNIMUX_ALLOW_UNMERGED_TARGET: `${process.env.HOME}/.omnimux-dev` })
      assert.equal(r.ok, false, 'must reject public dev target')
      assert.ok(r.out.includes('必须以'), `expected tasks-prefix error, got: ${r.out}`)
    } finally {
      cleanup()
    }
  })

  it('rejects an unmerged target that does not cover every sync target', () => {
    setupRepo()
    try {
      const r = run({
        OMNIMUX_ALLOW_UNMERGED_TARGET: `${process.env.HOME}/.dsh-dev/tasks/foo`,
        OMNIMUX_SYNC_TARGETS: `${process.env.HOME}/.omnimux-dev`,
      })
      assert.equal(r.ok, false, 'must reject targets outside the whitelist prefix')
      assert.ok(r.out.includes('不在允许前缀'), `expected whitelist mismatch, got: ${r.out}`)
    } finally {
      cleanup()
    }
  })

  it('embeds the L2 whitelist logic in source', () => {
    assert.ok(source.includes('OMNIMUX_ALLOW_UNMERGED_TARGET'), 'whitelist env var must exist')
    assert.ok(source.includes('$HOME/.dsh-dev/tasks'), 'must anchor to the L2 tasks dir')
    assert.ok(source.includes('已废弃'), 'legacy boolean must be deprecated')
  })
})
