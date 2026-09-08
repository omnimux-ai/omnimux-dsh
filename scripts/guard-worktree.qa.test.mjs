import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./guard-worktree.mjs', import.meta.url))
const root = mkdtempSync(join(tmpdir(), 'guard786-qa-cases-'))
after(() => rmSync(root, { recursive: true, force: true }))
const home = join(root, 'home')
const nonGit = join(root, 'plain')
const external = join(root, 'external-primary')
for (const path of [home, nonGit, external]) mkdirSync(path)
const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: home, LC_ALL: 'C', LANGUAGE: 'C' }
for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key]
// Fixture setup alone suppresses ambient Git configuration. No commit is needed.
const setupEnv = { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
function git(...args) {
  const result = spawnSync('git', args, { cwd: external, env: setupEnv, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}
git('init', '-b', 'main')
writeFileSync(join(external, 'tracked.txt'), 'isolated tracked fixture\n')
git('add', 'tracked.txt')
const notGit = 'fatal: not a git repository (or any of the parent directories): .git'
const discovery = spawnSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: nonGit, env, encoding: 'utf8',
})
assert.equal(discovery.status, 128)
assert.equal(discovery.stdout, '')
assert.equal(discovery.stderr.trim(), notGit)
// /tmp is an existing ephemeral exemption; require a non-exempt fixture path.
assert.equal(root.split('/').some(part => ['tmp', 'temp', '.tmp', '.cache'].includes(part)), false)

function hook(t, filePath, expected, overrides = {}, cwd = nonGit) {
  const payload = {
    hook_event_name: 'PreToolUse', tool_name: 'default_api:write', cwd,
    tool_input: { file_path: filePath },
  }
  const stdin = JSON.stringify(payload)
  const result = spawnSync(process.execPath, [script], {
    cwd: nonGit, env: { ...env, ...overrides }, input: stdin, encoding: 'utf8', timeout: 5000,
  })
  t.diagnostic(JSON.stringify({
    script, stdin, stdout: result.stdout, stderr: result.stderr,
    exit: result.status, signal: result.signal, error: result.error?.message ?? null,
  }))
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0)
  assert.equal(result.signal, null)
  assert.equal(result.stderr, '')
  const output = JSON.parse(result.stdout).hookSpecificOutput
  assert.equal(output.hookEventName, 'PreToolUse')
  assert.equal(output.permissionDecision, expected)
  return output
}

function fakeGit(name, body) {
  const bin = join(root, name)
  mkdirSync(bin)
  writeFileSync(join(bin, 'git'), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return { PATH: bin }
}

function expectReadError(output) {
  assert.match(output.permissionDecisionReason, /OmniMux 仓库 Hook.*Git 状态读取失败/)
  assert.doesNotMatch(output.permissionDecisionReason, /Git Tracked|DSH 核心/)
}

const pollution = {
  GIT_DIR: join(external, '.git'), GIT_WORK_TREE: external,
  GIT_COMMON_DIR: join(root, 'absent-common'), GIT_INDEX_FILE: join(root, 'absent-index'),
  GIT_CEILING_DIRECTORIES: nonGit, GIT_DISCOVERY_ACROSS_FILESYSTEM: '0',
  GIT_CONFIG_COUNT: 'not-a-number', GIT_CONFIG_PARAMETERS: 'invalid',
  GIT_CONFIG_SYSTEM: join(root, 'absent-config'),
  LANG: 'fr_FR.UTF-8', LANGUAGE: 'fr', LC_ALL: 'fr_FR.UTF-8',
}

describe('independent #786 non-Git guard QA', () => {
  it('allows a real non-Git protected-looking target with missing parents', t => {
    hook(t, '.agents/skills/fixture/scripts/missing/target.py', 'allow')
  })

  it('canonicalizes a repository alias into a real non-Git directory', t => {
    const alias = join(external, 'plain-alias')
    symlinkSync(nonGit, alias, 'dir')
    hook(t, join(alias, 'docs/missing/new.md'), 'allow', {}, external)
  })

  it('denies an external tracked file from a non-Git cwd', t => {
    const output = hook(t, join(external, 'tracked.txt'), 'deny')
    assert.match(output.permissionDecisionReason, /Git Tracked/)
  })

  it('denies realpath escapes from non-Git into tracked primary files', t => {
    const alias = join(nonGit, 'tracked-alias')
    symlinkSync(join(external, 'tracked.txt'), alias)
    assert.match(hook(t, alias, 'deny').permissionDecisionReason, /Git Tracked/)
  })

  it('ignores repository redirection and caller locale for real non-Git targets', t => {
    hook(t, 'scripts/new/tool.mjs', 'allow', pollution)
  })

  it('does not hide external tracked files under discovery and index pollution', t => {
    assert.match(hook(t, join(external, 'tracked.txt'), 'deny', pollution).permissionDecisionReason, /Git Tracked/)
  })

  const errors = [
    ['nonempty-stdout', `printf 'unexpected\\n'; printf '%s\\n' '${notGit}' >&2; exit 128`],
    ['wrong-exit', `printf '%s\\n' '${notGit}' >&2; exit 1`],
    ['signal-exit', `printf '%s\\n' '${notGit}' >&2; kill -TERM $$`],
    ['diagnostic-suffix', `printf '%s\\n' '${notGit} unexpected suffix' >&2; exit 128`],
    ['mixed-stderr', `printf '%s\\n' '${notGit}' 'fatal: Permission denied' >&2; exit 128`],
    ['localized-stderr', "printf 'fatal: kein Git-Repository\\n' >&2; exit 128"],
    ['empty-success', 'exit 0'],
  ]
  for (const [name, body] of errors) {
    it(`fails closed for ${name}, not non-Git discovery`, t => {
      const override = fakeGit(name, name === 'empty-success'
        ? 'case "$1" in rev-parse) exit 0;; *) exit 128;; esac'
        : body)
      expectReadError(hook(t, 'docs/new.md', 'deny', override))
    })
  }

  for (const kind of ['directory', 'file', 'dangling-link']) {
    it(`rejects exact non-Git diagnostics when an ancestor has a .git ${kind}`, t => {
      const ancestor = join(root, `marker-${kind}`)
      const nested = join(ancestor, 'several/levels/down')
      mkdirSync(nested, { recursive: true })
      const marker = join(ancestor, '.git')
      if (kind === 'directory') mkdirSync(marker)
      if (kind === 'file') writeFileSync(marker, 'gitdir: absent\n')
      if (kind === 'dangling-link') symlinkSync(join(root, 'absent-marker'), marker)
      const override = fakeGit(`bin-${kind}`, `printf '%s\\n' '${notGit}' >&2; exit 128`)
      expectReadError(hook(t, join(nested, 'docs/new.md'), 'deny', override))
    })
  }

  it('fails closed for malformed HOME Git config without mutating real user config', t => {
    const badHome = join(root, 'bad-home')
    mkdirSync(badHome)
    writeFileSync(join(badHome, '.gitconfig'), '[broken section\n')
    expectReadError(hook(t, join(external, 'tracked.txt'), 'deny', {
      HOME: badHome, XDG_CONFIG_HOME: badHome,
    }))
  })
})
