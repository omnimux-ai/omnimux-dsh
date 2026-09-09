import { test } from 'node:test'
import { strictEqual, ok } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gitBlobHash } from './verify-bilingual-docs.mjs'
import { walkAgentNoteTree } from './lib/agent-note-tree.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

const nestedTestEnv = { ...process.env, ELECTRON_NO_ASAR: '1' }
delete nestedTestEnv.NODE_TEST_CONTEXT

test('gitBlobHash computes accurate SHA-1 blob hashes', () => {
  const content = Buffer.from('# Test Document\n')
  const hash = gitBlobHash(content)
  strictEqual(typeof hash, 'string')
  strictEqual(hash.length, 40)
})

test('walkAgentNoteTree discovers valid agent notes and checks structure', () => {
  const { notes, errors } = walkAgentNoteTree(repoRoot)
  strictEqual(errors.length, 0, `walk errors: ${errors.join(', ')}`)
  ok(notes.length >= 1, 'should find at least 1 agent note')
  const note = notes[0]
  strictEqual(note.lifecycle, 'implemented')
  strictEqual(note.class, 'architecture')
})

test('verify-agent-note-format runs successfully on codebase', () => {
  const res = spawnSync('node', [resolve(here, 'verify-agent-note-format.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  strictEqual(res.status, 0, `format script failed: ${res.stderr}`)
})

test('verify-bilingual-docs passes on codebase', () => {
  const res = spawnSync('node', [resolve(here, 'verify-bilingual-docs.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  strictEqual(res.status, 0, `bilingual pairing failed: ${res.stderr}`)
})

test('verify-archived-agent-notes passes on codebase', () => {
  const res = spawnSync('node', [resolve(here, 'verify-archived-agent-notes.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  strictEqual(res.status, 0, `archived verification failed: ${res.stderr}`)
})

test('verify-plugin-boundaries passes on codebase', () => {
  const res = spawnSync('node', [resolve(here, 'verify-plugin-boundaries.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  strictEqual(res.status, 0, `boundary verification failed: ${res.stderr}`)
})

test('verify-plugin-inject-contract passes on codebase', () => {
  const res = spawnSync('node', [resolve(here, 'verify-plugin-inject-contract.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  strictEqual(res.status, 0, `inject-contract verification failed: ${res.stderr}`)
})

test('verify-stage-contracts passes on all first-level Stage and StageStore files', () => {
  const res = spawnSync('node', [resolve(here, 'verify-stage-contracts.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  strictEqual(res.status, 0, `stage contract verification failed: ${res.stderr}`)
})

test('verify-slot-contracts passes static scan on all plugin client files', () => {
  const res = spawnSync('node', [resolve(here, 'verify-slot-contracts.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  strictEqual(res.status, 0, `slot contract verification failed: ${res.stderr}\n${res.stdout}`)
})

test('slot-contracts unit tests pass', () => {
  const res = spawnSync('node', ['--test', resolve(here, 'verify-slot-contracts.test.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: nestedTestEnv,
  })
  strictEqual(res.status, 0, `slot-contracts unit tests failed: ${res.stderr}\n${res.stdout}`)
})

test('asar integrity engine and presets patcher unit tests pass', () => {
  const res = spawnSync('node', ['--test', resolve(here, 'patch-asar-agent-presets.test.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: nestedTestEnv,
  })
  strictEqual(res.status, 0, `asar integrity tests failed: ${res.stderr}\n${res.stdout}`)
})

test('smoke probe utils and cold-start verifier unit tests pass', () => {
  const res = spawnSync('node', ['--test', resolve(here, 'verify-dev-smoke.test.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: nestedTestEnv,
  })
  strictEqual(res.status, 0, `smoke probe tests failed: ${res.stderr}\n${res.stdout}`)
})

test('verify-plugin-agent-tools passes 4-dimension audit on all 12 plugins', () => {
  const res = spawnSync('node', [resolve(here, 'verify-plugin-agent-tools.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  strictEqual(res.status, 0, `agent tools verification failed: ${res.stderr}\n${res.stdout}`)
})

test('guard-worktree PreToolUse contract and unit tests pass', () => {
  const res = spawnSync('node', ['--test', resolve(here, 'guard-worktree.test.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: nestedTestEnv,
  })
  strictEqual(res.status, 0, `guard-worktree tests failed: ${res.stderr}\n${res.stdout}`)
})

test('simulate-multi-agent-lifecycle incident tests pass', () => {
  const res = spawnSync('node', ['--test', resolve(here, 'simulate-multi-agent-lifecycle.test.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: nestedTestEnv,
  })
  strictEqual(res.status, 0, `lifecycle simulation failed: ${res.stderr}\n${res.stdout}`)
})

test('agent presets splice and persona routing stay valid', () => {
  const res = spawnSync('node', ['--test', resolve(here, 'verify-agent-presets.test.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: nestedTestEnv,
  })
  strictEqual(res.status, 0, `agent-presets verification failed: ${res.stderr}\n${res.stdout}`)
})

test('git-wt finish never locally merges or force-pushes main', () => {
  const res = spawnSync('node', ['--test', resolve(here, 'git-wt.test.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: nestedTestEnv,
  })
  strictEqual(res.status, 0, `git-wt tests failed: ${res.stderr}\n${res.stdout}`)
})

test('verify-package-files passes on all plugins', () => {
  const res = spawnSync('node', [resolve(here, 'verify-package-files.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  strictEqual(res.status, 0, `package-files verification failed: ${res.stderr}\n${res.stdout}`)
})

test('verify-package-files unit tests pass', () => {
  const res = spawnSync('node', ['--test', resolve(here, 'verify-package-files.test.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: nestedTestEnv,
  })
  strictEqual(res.status, 0, `package-files unit tests failed: ${res.stderr}\n${res.stdout}`)
})

test('static CI and post-merge Dev handoff regressions pass', () => {
  const res = spawnSync('node', ['--test', resolve(here, 'auto-pipeline.test.mjs'), resolve(here, 'auto-pipeline-qa.test.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: nestedTestEnv,
  })
  strictEqual(res.status, 0, `pipeline handoff tests failed: ${res.stderr}\n${res.stdout}`)
})

test('sync-to-app and sync-stable target selection matrix passes', () => {
  const res = spawnSync('node', ['--test', resolve(here, 'sync-targets.test.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: nestedTestEnv,
  })
  strictEqual(res.status, 0, `sync-targets tests failed: ${res.stderr}\n${res.stdout}`)
})

test('Alpha release materialization policy passes', () => {
  const res = spawnSync('node', ['--test', resolve(here, 'sync-release-policy.test.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: nestedTestEnv,
  })
  strictEqual(res.status, 0, `Alpha release policy tests failed: ${res.stderr}\n${res.stdout}`)
})
