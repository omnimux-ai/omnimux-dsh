import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { assertTestFiles, discoverTestFiles, planHubTestRuns } from '../../scripts/run-tests.mjs'

const pluginRoot = fileURLToPath(new URL('../../', import.meta.url))

function writeFixture(root, relativePath) {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '')
}

describe('Hub test run planning', () => {
  it('runs the guard first and partitions resource files without changing ordinary arguments', () => {
    const files = [
      'src/client/ModelsSettingsCard.e2e.test.js',
      'src/client/provider-config-state.test.js',
      'src/media/test-network-guard.test.js',
      'src/nested/browser.e2e.test.mjs',
      'src/nested/browser.e2e.test.ts',
      'src/ordinary.test.js',
      'src/ordinary.test.mjs',
      'src/ordinary.test.ts',
    ]

    assert.deepEqual(planHubTestRuns(files), [
      { files: ['src/media/test-network-guard.test.js'], args: [] },
      { files: ['src/ordinary.test.js', 'src/ordinary.test.mjs', 'src/ordinary.test.ts'], args: [] },
      {
        files: [
          'src/client/ModelsSettingsCard.e2e.test.js',
          'src/client/provider-config-state.test.js',
          'src/nested/browser.e2e.test.mjs',
          'src/nested/browser.e2e.test.ts',
        ],
        args: ['--test-concurrency=1'],
      },
    ])
  })

  it('rejects an empty plan and a plan without the mandatory guard', () => {
    assert.throws(() => planHubTestRuns([]), /No Hub test files matched the source test globs/)
    assert.throws(
      () => planHubTestRuns(['src/ordinary.test.js']),
      /Missing required network guard test: src\/media\/test-network-guard\.test\.js/,
    )
  })

  it('omits empty phases instead of asking Node to discover unrelated tests', () => {
    const guard = 'src/media/test-network-guard.test.js'
    assert.deepEqual(planHubTestRuns([guard]), [{ files: [guard], args: [] }])
    assert.deepEqual(planHubTestRuns([guard, 'src/ordinary.test.js']), [
      { files: [guard], args: [] },
      { files: ['src/ordinary.test.js'], args: [] },
    ])
    assert.deepEqual(planHubTestRuns([guard, 'src/browser.e2e.test.mjs']), [
      { files: [guard], args: [] },
      { files: ['src/browser.e2e.test.mjs'], args: ['--test-concurrency=1'] },
    ])
  })

  it('schedules every current collected file once and puts known Chrome owners in the resource phase', () => {
    const files = discoverTestFiles(pluginRoot)
    const original = files.slice()
    const groups = planHubTestRuns(files)
    const planned = groups.flatMap((group) => group.files)
    const resource = groups.find((group) => group.args.includes('--test-concurrency=1'))

    assert.ok(files.length > 0)
    assert.deepEqual(groups[0], { files: ['src/media/test-network-guard.test.js'], args: [] })
    assert.deepEqual(files, original, 'planning must not mutate the collected input')
    assert.equal(planned.length, files.length)
    assert.equal(new Set(planned).size, files.length, 'phases must not overlap')
    assert.deepEqual(planned.slice().sort(), files)
    assert.ok(resource, 'the current collected suite has resource tests')
    for (const owner of [
      'src/client/ModelsSettingsCard.e2e.test.js',
      'src/client/components/inspiration-picker/picker-card.e2e.test.js',
      'src/client/page-header-safe-inset.e2e.test.js',
      'src/client/provider-config-state.test.js',
    ]) {
      assert.ok(files.includes(owner), `known Chrome owner must remain collected: ${owner}`)
      assert.ok(resource.files.includes(owner), `known Chrome owner must run with the resource budget: ${owner}`)
    }
    assert.ok(!planned.includes('tests/e2e/cli-auth-update-panel.e2e.test.js'))
  })
})

describe('Hub test discovery', () => {
  it('includes every current source test and the previously omitted contracts', () => {
    const files = discoverTestFiles(pluginRoot)

    assert.ok(files.length > 0)
    assert.ok(files.includes('src/client/workbench-context.test.js'))
    assert.ok(files.includes('src/client/events-client.test.js'))
    assert.ok(files.includes('src/client/composer-envelope.test.js'))
    assert.ok(files.includes('src/client/conversation-collapse.test.js'))
    assert.ok(files.includes('src/events/hub-event-bus.test.js'))
  })

  it('excludes fixture, vendor, and generated directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'omnimux-test-discovery-'))
    try {
      writeFixture(root, 'src/real.test.js')
      writeFixture(root, 'src/nested/real.test.ts')
      writeFixture(root, 'src/fixtures/ignored.test.js')
      writeFixture(root, 'src/vendor/ignored.test.js')
      writeFixture(root, 'src/build/ignored.test.js')
      writeFixture(root, 'src/dist/ignored.test.js')
      writeFixture(root, 'lib/generated.test.js')

      assert.deepEqual(discoverTestFiles(root), [
        'src/nested/real.test.ts',
        'src/real.test.js',
      ])
    } finally {
      const target = realpathSync(root)
      assert.equal(dirname(target), realpathSync(tmpdir()))
      assert.match(basename(target), /^omnimux-(empty-)?test-discovery-/)
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('rejects an empty discovery result', () => {
    const root = mkdtempSync(join(tmpdir(), 'omnimux-empty-test-discovery-'))
    try {
      assert.throws(
        () => assertTestFiles(discoverTestFiles(root)),
        /No Hub test files matched the source test globs/,
      )
    } finally {
      const target = realpathSync(root)
      assert.equal(dirname(target), realpathSync(tmpdir()))
      assert.match(basename(target), /^omnimux-(empty-)?test-discovery-/)
      rmSync(target, { recursive: true, force: true })
    }
  })
})
