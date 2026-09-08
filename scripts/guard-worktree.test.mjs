import { after, describe, it } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decideBashCommand,
  decideWrite,
  isDestructiveResetCommand,
  isEphemeralPath,
  isWorktreePath,
} from './guard-worktree.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = mkdtempSync(join(here, '.guard-fixture-'))
after(() => rmSync(fixture, { recursive: true, force: true }))
function gitCommand(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
function createRepo(name) {
  const root = join(fixture, name)
  mkdirSync(root)
  gitCommand(root, 'init', '-b', 'main')
  const files = ['package.json', 'plugins/omnimux/src/host/apply.js', 'docs/contracts/hub.md', 'docs/contracts/plugin-git-pr.md', 'scripts/dev-doctor.sh']
  for (const path of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), '{}\n')
  }
  writeFileSync(join(root, '.gitignore'), 'ignored/\n')
  gitCommand(root, 'add', '.')
  gitCommand(root, '-c', 'user.name=Guard Test', '-c', 'user.email=guard@example.invalid', 'commit', '-m', 'fixture')
  gitCommand(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  return root
}
const mainRepoRoot = createRepo('primary')
const externalRepoRoot = createRepo('external')
const worktreeRoot = join(mainRepoRoot, '.worktrees', 'task')
const externalWorktree = join(externalRepoRoot, '.worktrees', 'external-task')
gitCommand(mainRepoRoot, 'worktree', 'add', '-b', 'task', worktreeRoot)
gitCommand(externalRepoRoot, 'worktree', 'add', '-b', 'external-task', externalWorktree)
const scriptPath = join(here, 'guard-worktree.mjs')

function runHook(payload) {
  const res = spawnSync('node', [scriptPath], {
    cwd: mainRepoRoot,
    encoding: 'utf8',
    input: JSON.stringify(payload),
  })
  assert.equal(res.status, 0, `guard exited ${res.status}: ${res.stderr}`)
  return JSON.parse(res.stdout)
}

describe('guard-worktree path classification', () => {
  it('detects worktree vs ephemeral vs tracked', () => {
    assert.equal(
      isWorktreePath(join(worktreeRoot, 'plugins/omnimux/src/index.js')),
      true,
    )
    assert.equal(
      isWorktreePath('/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/plugins/omnimux/src/index.js'),
      false,
    )
    assert.equal(isEphemeralPath(`${mainRepoRoot}/plugins/omnimux/node_modules/foo/index.js`), true)
    assert.equal(isEphemeralPath(`${mainRepoRoot}/plugins/omnimux-workflow/dist-harness/app.js`), true)
    assert.equal(isEphemeralPath(`${mainRepoRoot}/plugins/omnimux/tmp/scratch.js`), true)
    assert.equal(isEphemeralPath(`${mainRepoRoot}/plugins/omnimux/src/index.js`), false)
    assert.equal(isEphemeralPath(`${mainRepoRoot}/package.json`), false)
  })
})

describe('guard-worktree decideWrite (全量版本文件拦截)', () => {
  it('denies tracked plugin source on the main checkout', () => {
    const result = decideWrite({
      toolName: 'edit',
      cwd: mainRepoRoot,
      filePath: 'plugins/omnimux/src/host/apply.js',
    })
    assert.equal(result.decision, 'deny')
    assert.equal(result.reason, 'tracked-file')
  })

  it('denies tracked root-level files (e.g. package.json)', () => {
    const result = decideWrite({
      toolName: 'edit',
      cwd: mainRepoRoot,
      filePath: 'package.json',
    })
    assert.equal(result.decision, 'deny')
    assert.equal(result.reason, 'tracked-file')
  })

  it('denies tracked docs files (e.g. docs/contracts/hub.md)', () => {
    const result = decideWrite({
      toolName: 'edit',
      cwd: mainRepoRoot,
      filePath: 'docs/contracts/hub.md',
    })
    assert.equal(result.decision, 'deny')
    assert.equal(result.reason, 'tracked-file')
  })

  it('denies tracked scripts files (e.g. scripts/dev-doctor.sh)', () => {
    const result = decideWrite({
      toolName: 'edit',
      cwd: mainRepoRoot,
      filePath: 'scripts/dev-doctor.sh',
    })
    assert.equal(result.decision, 'deny')
    assert.equal(result.reason, 'tracked-file')
  })

  it('allows gitignored plugin paths in main repo', () => {
    const result = decideWrite({
      toolName: 'write',
      cwd: mainRepoRoot,
      filePath: 'plugins/omnimux/node_modules/not-a-real-pkg/index.js',
    })
    assert.equal(result.decision, 'allow')
    assert.ok(result.reason === 'ephemeral' || result.reason === 'gitignored')
  })

  it('allows workflow dist / dist-harness (temp build dirs)', () => {
    const distHarness = decideWrite({
      toolName: 'write',
      cwd: mainRepoRoot,
      filePath: 'plugins/omnimux-workflow/dist-harness/scratch.js',
    })
    assert.equal(distHarness.decision, 'allow')

    const dist = decideWrite({
      toolName: 'write',
      cwd: mainRepoRoot,
      filePath: 'plugins/omnimux-workflow/dist/index.js',
    })
    assert.equal(dist.decision, 'allow')
    assert.equal(dist.reason, 'ephemeral')
  })

  it('allows untracked scratch files in main repo root and .workbuddy', () => {
    const result = decideWrite({
      toolName: 'write',
      cwd: mainRepoRoot,
      filePath: '__untracked_scratch_987654.txt',
    })
    assert.equal(result.decision, 'allow')
    assert.equal(result.reason, 'untracked-draft')

    const workbuddyResult = decideWrite({
      toolName: 'write',
      cwd: mainRepoRoot,
      filePath: '.workbuddy/scratch_board.md',
    })
    assert.equal(workbuddyResult.decision, 'allow')
    assert.ok(workbuddyResult.reason === 'gitignored' || workbuddyResult.reason === 'untracked-draft')
  })

  it('denies untracked files in protected scopes (plugins, scripts, docs, .github)', () => {
    const pluginUntracked = decideWrite({
      toolName: 'write',
      cwd: mainRepoRoot,
      filePath: 'plugins/omnimux-workflow/src/canvas/editor/components/NonExistentUntrackedNode.tsx',
    })
    assert.equal(pluginUntracked.decision, 'deny')
    assert.equal(pluginUntracked.reason, 'untracked-protected-scope')

    const scriptsUntracked = decideWrite({
      toolName: 'write',
      cwd: mainRepoRoot,
      filePath: 'scripts/new-untracked-tool.mjs',
    })
    assert.equal(scriptsUntracked.decision, 'deny')
    assert.equal(scriptsUntracked.reason, 'untracked-protected-scope')

    const docsUntracked = decideWrite({
      toolName: 'write',
      cwd: mainRepoRoot,
      filePath: 'docs/contracts/new-untracked-contract.md',
    })
    assert.equal(docsUntracked.decision, 'deny')
    assert.equal(docsUntracked.reason, 'untracked-protected-scope')
  })

  it('denies tracked docs on main checkout', () => {
    const trackedResult = decideWrite({
      toolName: 'write',
      cwd: mainRepoRoot,
      filePath: 'docs/contracts/plugin-git-pr.md',
    })
    assert.equal(trackedResult.decision, 'deny')
    assert.equal(trackedResult.reason, 'tracked-file')
  })

  it('allows all writes inside a worktree path (including plugins, docs, root)', () => {
    const wtPlugin = decideWrite({
      toolName: 'edit',
      cwd: worktreeRoot,
      filePath: 'plugins/omnimux/src/index.js',
    })
    assert.equal(wtPlugin.decision, 'allow')
    assert.equal(wtPlugin.reason, 'worktree-isolated')

    const wtRoot = decideWrite({
      toolName: 'edit',
      cwd: worktreeRoot,
      filePath: 'package.json',
    })
    assert.equal(wtRoot.decision, 'allow')
    assert.equal(wtRoot.reason, 'worktree-isolated')
  })
})

describe('registered worktree boundaries', () => {
  const decision = (filePath, cwd = mainRepoRoot) => decideWrite({ filePath, cwd, toolName: 'write' }).decision
  it('allows same and external registered trees for tracked and new files', () => {
    for (const root of [worktreeRoot, externalWorktree]) {
      assert.equal(decision(join(root, 'package.json')), 'allow')
      assert.equal(decision(join(root, 'scripts/new/deep/file.js')), 'allow')
    }
    assert.equal(decision(join(externalRepoRoot, 'package.json')), 'deny')
    assert.equal(decision(join(externalRepoRoot, 'scripts/new.js')), 'deny')
  })
  it('rejects misleading names and copied gitdir pointers', () => {
    const fake = join(mainRepoRoot, 'omnimux-dsh-wt-fake')
    mkdirSync(fake)
    assert.equal(isWorktreePath(join(fake, 'scripts/file.js')), false)
    assert.equal(decision(join(fake, 'scripts/file.js')), 'deny')
    const gitDir = gitCommand(worktreeRoot, 'rev-parse', '--absolute-git-dir')
    writeFileSync(join(fake, '.git'), `gitdir: ${gitDir}\n`)
    assert.equal(isWorktreePath(join(fake, 'package.json')), false)
    assert.equal(decision(join(fake, 'package.json')), 'deny')
  })
  it('resolves directory and file symlinks escaping into primary checkouts', () => {
    symlinkSync(mainRepoRoot, join(worktreeRoot, 'escape'), 'dir')
    symlinkSync(join(externalRepoRoot, 'package.json'), join(worktreeRoot, 'file-link'))
    assert.equal(decision(join(worktreeRoot, 'escape/package.json')), 'deny')
    assert.equal(decision(join(worktreeRoot, 'escape/scripts/new/deep.js')), 'deny')
    assert.equal(decision(join(worktreeRoot, 'file-link')), 'deny')
    symlinkSync(join(mainRepoRoot, 'missing'), join(worktreeRoot, 'dangling'))
    assert.equal(decision(join(worktreeRoot, 'dangling/file.js')), 'deny')
  })
  it('uses metadata rather than branch identity or legacy names', () => {
    gitCommand(externalRepoRoot, 'checkout', '-b', 'not-main')
    assert.equal(decision(join(externalRepoRoot, 'package.json')), 'deny')
    const detached = join(externalRepoRoot, '.worktrees', 'detached task')
    gitCommand(externalRepoRoot, 'worktree', 'add', '--detach', detached)
    assert.equal(decision(join(detached, 'scripts/new.js')), 'allow')
    const legacy = join(fixture, 'omnimux-dsh-wt-real')
    gitCommand(externalRepoRoot, 'worktree', 'add', '-b', 'legacy', legacy)
    assert.equal(decision(join(legacy, 'package.json')), 'allow')
    symlinkSync(worktreeRoot, join(fixture, 'linked-alias'), 'dir')
    assert.equal(decision(join(fixture, 'linked-alias/scripts/new.js')), 'allow')
  })
  it('rejects a standalone fake .git directory and an unregistered gitfile', () => {
    const fake = join(fixture, 'fake-metadata')
    mkdirSync(join(fake, '.git'), { recursive: true })
    assert.equal(isWorktreePath(join(fake, 'package.json')), false)
    assert.equal(decision(join(fake, 'package.json')), 'deny')
    const missing = join(fixture, 'missing-registry')
    mkdirSync(missing)
    writeFileSync(join(missing, '.git'), `gitdir: ${join(mainRepoRoot, '.git/worktrees/absent')}\n`)
    assert.equal(isWorktreePath(join(missing, 'package.json')), false)
    assert.equal(decision(join(missing, 'package.json')), 'deny')
  })
  it('denies nested primary repositories and malformed nested metadata inside a linked tree', () => {
    const nested = join(worktreeRoot, 'nested-primary')
    mkdirSync(nested)
    gitCommand(nested, 'init', '-b', 'main')
    writeFileSync(join(nested, 'package.json'), '{}\n')
    gitCommand(nested, 'add', 'package.json')
    assert.equal(isWorktreePath(join(nested, 'package.json')), false)
    assert.equal(decision(join(nested, 'package.json')), 'deny')
    assert.equal(decision(join(nested, 'scripts/new/deep.js')), 'deny')
    const malformed = join(worktreeRoot, 'malformed-nested')
    mkdirSync(join(malformed, '.git'), { recursive: true })
    assert.equal(isWorktreePath(join(malformed, 'scripts/new.js')), false)
    assert.equal(decision(join(malformed, 'scripts/new.js')), 'deny')
  })
  it('does not exempt a detached primary checkout', () => {
    const primary = createRepo('detached-primary')
    gitCommand(primary, 'checkout', '--detach')
    assert.equal(isWorktreePath(join(primary, 'package.json')), false)
    assert.equal(decision(join(primary, 'package.json')), 'deny')
    assert.equal(decision(join(primary, 'scripts/new/deep.js')), 'deny')
  })
  it('ignores abnormal Git config, index and discovery environment for write classification', () => {
    const env = {
      ...process.env,
      GIT_DIR: '/nonexistent/qa-git-dir',
      GIT_COMMON_DIR: '/nonexistent/qa-common-dir',
      GIT_WORK_TREE: mainRepoRoot,
      GIT_INDEX_FILE: '/nonexistent/qa-index',
      GIT_CEILING_DIRECTORIES: fixture,
      GIT_CONFIG_COUNT: 'invalid',
    }
    for (const [root, expected] of [[mainRepoRoot, 'deny'], [externalWorktree, 'allow']]) {
      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: mainRepoRoot, encoding: 'utf8', env,
        input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'write', cwd: mainRepoRoot, tool_input: { file_path: join(root, 'package.json') } }),
      })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, expected)
    }
  })
  it('preserves ignored and ephemeral exemptions', () => {
    assert.equal(decision(join(mainRepoRoot, 'ignored/file.js')), 'allow')
    assert.equal(decision(join(mainRepoRoot, 'dist/file.js')), 'allow')
    assert.equal(decision(join(mainRepoRoot, 'trace.log')), 'allow')
  })
  it('fails conservatively without Git and with abnormal Git exits', () => {
    const emptyBin = join(fixture, 'empty-bin')
    mkdirSync(emptyBin)
    for (const contents of [null, '#!/bin/sh\nexit 42\n', '#!/bin/sh\nexit 128\n']) {
      if (contents) writeFileSync(join(emptyBin, 'git'), contents, { mode: 0o755 })
      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: mainRepoRoot, encoding: 'utf8', env: { ...process.env, PATH: emptyBin },
        input: JSON.stringify({ tool_name: 'write', cwd: mainRepoRoot, tool_input: { file_path: join(worktreeRoot, 'package.json') } }),
      })
      assert.equal(result.status, 0)
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny')
    }
  })
  it('ignores ambient Git repository redirection', () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: mainRepoRoot, encoding: 'utf8', env: { ...process.env, GIT_WORK_TREE: worktreeRoot, GIT_DIR: gitCommand(worktreeRoot, 'rev-parse', '--absolute-git-dir') },
      input: JSON.stringify({ tool_name: 'write', cwd: mainRepoRoot, tool_input: { file_path: join(mainRepoRoot, 'package.json') } }),
    })
    assert.equal(result.status, 0)
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny')
  })
  it('preserves unpushed commit bash denial', () => {
    gitCommand(worktreeRoot, '-c', 'user.name=Guard Test', '-c', 'user.email=guard@example.invalid', 'commit', '--allow-empty', '-m', 'unpushed')
    assert.equal(decideBashCommand({ command: 'git reset --hard HEAD~1', cwd: worktreeRoot }).decision, 'deny')
    assert.equal(decideBashCommand({ command: 'git status', cwd: worktreeRoot }).decision, 'allow')
  })
})

describe('guard-worktree PreToolUse protocol', () => {
  it('emits deny JSON for tracked files across plugins, docs, and scripts', () => {
    const outPlugin = runHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'edit',
      cwd: mainRepoRoot,
      tool_input: { file_path: join(mainRepoRoot, 'plugins/omnimux/src/host/apply.js') },
    })
    assert.equal(outPlugin.hookSpecificOutput.hookEventName, 'PreToolUse')
    assert.equal(outPlugin.hookSpecificOutput.permissionDecision, 'deny')

    const outDoc = runHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'edit',
      cwd: mainRepoRoot,
      tool_input: { file_path: join(mainRepoRoot, 'docs/contracts/hub.md') },
    })
    assert.equal(outDoc.hookSpecificOutput.permissionDecision, 'deny')

    const outRoot = runHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'edit',
      cwd: mainRepoRoot,
      tool_input: { file_path: join(mainRepoRoot, 'package.json') },
    })
    assert.equal(outRoot.hookSpecificOutput.permissionDecision, 'deny')
  })

  it('emits allow JSON for untracked / ignored / worktree paths', () => {
    const ignored = runHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'write',
      cwd: mainRepoRoot,
      tool_input: { file_path: join(mainRepoRoot, 'plugins/omnimux-workflow/dist-harness/hook-test.js') },
    })
    assert.equal(ignored.hookSpecificOutput.permissionDecision, 'allow')

    const untracked = runHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'write',
      cwd: mainRepoRoot,
      tool_input: { file_path: join(mainRepoRoot, '__guard_untracked_scratch__.tmp') },
    })
    assert.equal(untracked.hookSpecificOutput.permissionDecision, 'allow')
  })
})

describe('guard-worktree git reset --hard safety guard', () => {
  it('correctly classifies destructive git reset commands', () => {
    assert.equal(isDestructiveResetCommand('git reset --hard HEAD~1'), true)
    assert.equal(isDestructiveResetCommand('git reset --hard origin/main'), true)
    assert.equal(isDestructiveResetCommand('git reset --soft HEAD~1'), false)
    assert.equal(isDestructiveResetCommand('git reset HEAD file.txt'), false)
    assert.equal(isDestructiveResetCommand('echo "git reset --hard"'), false)
    assert.equal(isDestructiveResetCommand('gh issue create --body "ran git reset --hard"'), false)
  })

  it('catches git -C, pipelines, checkout -f, restore --source and clean -f', () => {
    assert.equal(isDestructiveResetCommand('git -C "$REPO_ROOT" reset --hard origin/main'), true)
    assert.equal(isDestructiveResetCommand('git -C /tmp/repo reset --hard origin/main'), true)
    assert.equal(isDestructiveResetCommand('gh pr merge && git reset --hard origin/main'), true)
    assert.equal(isDestructiveResetCommand('git fetch origin && git checkout -f main'), true)
    assert.equal(isDestructiveResetCommand('git restore --source=origin/main --worktree --staged .'), true)
    assert.equal(isDestructiveResetCommand('git clean -fdx'), true)
    assert.equal(isDestructiveResetCommand('git status && git log -1'), false)
    assert.equal(isDestructiveResetCommand('git push -u origin agent/infra-guard-destructive-reset'), false)
  })
})
