import test from 'node:test'
import assert from 'node:assert/strict'

import {
  checkManifest,
  classifyPublishState,
  formatResults,
  normalizeRepositoryUrl,
  parseArguments,
  runReleaseCheck,
} from './release-check.mjs'

const MANIFEST = {
  name: 'omnimux',
  version: '0.1.8',
  repository: {
    type: 'git',
    url: 'git+https://github.com/omnimux-ai/omnimux-dsh.git',
    directory: 'plugins/omnimux',
  },
}

const NOT_PUBLISHED = { status: 1, stderr: 'npm error code E404\nnpm error 404 Not Found' }
const PUBLISHED = { status: 0, stdout: '0.1.8\n' }

function makeDeps(overrides = {}) {
  return {
    readFile: () => JSON.stringify(overrides.manifest ?? MANIFEST),
    gitBranch: () => 'main',
    gitStatus: () => '',
    gitRemoteUrl: () => 'https://github.com/omnimux-ai/omnimux-dsh.git',
    verifySource: () => ({ ok: true, problems: [] }),
    npmView: () => overrides.view ?? NOT_PUBLISHED,
    actionlint: () => overrides.lint ?? { status: 'pass', output: '' },
    ...overrides.deps,
  }
}

function runCheck(overrides = {}) {
  return runReleaseCheck({
    packageDir: 'plugins/omnimux',
    repoRoot: '/repo',
    allowPublished: overrides.allowPublished ?? false,
    deps: makeDeps(overrides),
  })
}

const failedIds = result => result.results.filter(item => item.status === 'fail').map(item => item.id)

test('parseArguments defaults to plugins/omnimux and accepts a package name or a path', () => {
  assert.deepEqual(parseArguments([]), { packageDir: 'plugins/omnimux', allowPublished: false })
  assert.deepEqual(parseArguments(['omnimux']), { packageDir: 'plugins/omnimux', allowPublished: false })
  assert.deepEqual(parseArguments(['plugins/omnimux']), { packageDir: 'plugins/omnimux', allowPublished: false })
  assert.deepEqual(parseArguments(['./plugins/omnimux/']), { packageDir: 'plugins/omnimux', allowPublished: false })
  assert.deepEqual(parseArguments(['omnimux', '--allow-published']), { packageDir: 'plugins/omnimux', allowPublished: true })
})

test('parseArguments rejects unknown flags, extra positional arguments and out-of-repo paths', () => {
  assert.throws(() => parseArguments(['--nope']), /未知参数/)
  assert.throws(() => parseArguments(['omnimux', 'other']), /只接受一个包参数/)
  assert.throws(() => parseArguments(['../outside']), /仓库内相对路径/)
  assert.throws(() => parseArguments(['/abs/path']), /仓库内相对路径/)
})

test('normalizeRepositoryUrl folds the forms npm writes into one https url', () => {
  const expected = 'https://github.com/omnimux-ai/omnimux-dsh'
  for (const raw of [
    'git+https://github.com/omnimux-ai/omnimux-dsh.git',
    'https://github.com/omnimux-ai/omnimux-dsh',
    'https://github.com/omnimux-ai/omnimux-dsh/',
    'git@github.com:omnimux-ai/omnimux-dsh.git',
    'ssh://git@github.com/omnimux-ai/omnimux-dsh.git',
    'github:omnimux-ai/omnimux-dsh',
  ]) {
    assert.equal(normalizeRepositoryUrl(raw), expected, raw)
  }
  assert.equal(normalizeRepositoryUrl(undefined), '')
  assert.equal(normalizeRepositoryUrl(''), '')
})

test('checkManifest accepts the shipped manifest shape', () => {
  assert.deepEqual(
    checkManifest({ manifest: MANIFEST, packageDir: 'plugins/omnimux', remoteUrl: 'https://github.com/omnimux-ai/omnimux-dsh.git' }),
    [],
  )
})

test('checkManifest requires repository, git type, matching origin and monorepo directory', () => {
  const withoutRepository = { name: 'omnimux', version: '0.1.8' }
  assert.match(checkManifest({ manifest: withoutRepository, packageDir: 'plugins/omnimux', remoteUrl: 'https://github.com/omnimux-ai/omnimux-dsh.git' })[0], /缺少 repository/)

  const wrongType = { ...MANIFEST, repository: { ...MANIFEST.repository, type: 'svn' } }
  assert.match(checkManifest({ manifest: wrongType, packageDir: 'plugins/omnimux', remoteUrl: 'https://github.com/omnimux-ai/omnimux-dsh.git' })[0], /repository\.type/)

  const wrongUrl = { ...MANIFEST, repository: { ...MANIFEST.repository, url: 'git+https://github.com/other/repo.git' } }
  assert.match(checkManifest({ manifest: wrongUrl, packageDir: 'plugins/omnimux', remoteUrl: 'https://github.com/omnimux-ai/omnimux-dsh.git' })[0], /与 origin 不一致/)

  const wrongDirectory = { ...MANIFEST, repository: { ...MANIFEST.repository, directory: 'plugins/other' } }
  assert.match(checkManifest({ manifest: wrongDirectory, packageDir: 'plugins/omnimux', remoteUrl: 'https://github.com/omnimux-ai/omnimux-dsh.git' })[0], /repository\.directory 与包目录不一致/)

  const emptyDirectory = { ...MANIFEST, repository: { type: 'git', url: MANIFEST.repository.url } }
  assert.match(checkManifest({ manifest: emptyDirectory, packageDir: 'plugins/omnimux', remoteUrl: 'https://github.com/omnimux-ai/omnimux-dsh.git' })[0], /repository\.directory 为空/)
})

test('checkManifest rejects a missing name or a non-semver version', () => {
  const problems = checkManifest({
    manifest: { version: 'latest', repository: MANIFEST.repository },
    packageDir: 'plugins/omnimux',
    remoteUrl: 'https://github.com/omnimux-ai/omnimux-dsh.git',
  })
  assert.ok(problems.some(problem => /缺少 name/.test(problem)))
  assert.ok(problems.some(problem => /不是合法 semver/.test(problem)))
})

test('classifyPublishState separates published, missing and unknown registry answers', () => {
  assert.equal(classifyPublishState({ name: 'omnimux', version: '0.1.8', view: PUBLISHED }).state, 'published')
  assert.equal(classifyPublishState({ name: 'omnimux', version: '0.1.8', view: NOT_PUBLISHED }).state, 'missing')
  assert.equal(classifyPublishState({ name: 'omnimux', version: '0.1.8', view: { status: 1, stderr: 'E500 internal error' } }).state, 'unknown')
  assert.equal(classifyPublishState({ name: 'omnimux', version: '0.1.8', view: { status: null, errorCode: 'ENOENT' } }).state, 'unknown')
})

test('runReleaseCheck passes when the tree is clean, metadata matches and the version is unpublished', () => {
  const result = runCheck()
  assert.equal(result.ok, true)
  assert.deepEqual(failedIds(result), [])
  assert.deepEqual(result.results.filter(item => item.status === 'pass').map(item => item.id), ['tree', 'manifest', 'source', 'npm', 'actionlint'])
  assert.deepEqual(result.results.find(item => item.id === 'branch'), { id: 'branch', status: 'info', message: '当前分支：main' })
})

test('runReleaseCheck fails on uncommitted tracked files', () => {
  const result = runCheck({ deps: { gitStatus: () => ' M plugins/omnimux/package.json\n' } })
  assert.equal(result.ok, false)
  assert.deepEqual(failedIds(result), ['tree'])
  assert.match(result.results.find(item => item.id === 'tree').message, /未提交改动/)
})

test('runReleaseCheck fails when verify-publish-source reports a problem', () => {
  const result = runCheck({ deps: { verifySource: () => ({ ok: false, problems: ['version 0.1.8 is not committed'] }) } })
  assert.equal(result.ok, false)
  assert.deepEqual(failedIds(result), ['source'])
  assert.equal(result.results.find(item => item.id === 'source').message, 'version 0.1.8 is not committed')
})

test('an already published version fails by default and only warns with --allow-published', () => {
  const strict = runCheck({ view: PUBLISHED })
  assert.equal(strict.ok, false)
  assert.deepEqual(failedIds(strict), ['npm'])
  assert.match(strict.results.find(item => item.id === 'npm').message, /不能重复发布/)

  const lenient = runCheck({ view: PUBLISHED, allowPublished: true })
  assert.equal(lenient.ok, true)
  assert.equal(lenient.results.find(item => item.id === 'npm').status, 'skip')
})

test('an unknown npm answer fails instead of passing silently', () => {
  const result = runCheck({ view: { status: 1, stderr: 'npm error network request failed' } })
  assert.equal(result.ok, false)
  assert.deepEqual(failedIds(result), ['npm'])
  assert.match(result.results.find(item => item.id === 'npm').message, /无法确认 npm 发布状态/)
})

test('a missing manifest file is reported as a failure', () => {
  const result = runCheck({
    deps: {
      readFile: () => {
        throw new Error('ENOENT: no such file')
      },
    },
  })
  assert.equal(result.ok, false)
  assert.ok(failedIds(result).includes('manifest'))
  assert.match(result.results.find(item => item.id === 'manifest').message, /无法读取 plugins\/omnimux\/package\.json/)
})

test('actionlint is reported as skipped when unavailable and as a failure when it reports errors', () => {
  const skipped = runCheck({ lint: { status: 'skip' } })
  assert.equal(skipped.ok, true)
  assert.equal(skipped.results.find(item => item.id === 'actionlint').status, 'skip')

  const failing = runCheck({ lint: { status: 'fail', output: 'workflow.yml:3:1: unexpected key' } })
  assert.equal(failing.ok, false)
  assert.deepEqual(failedIds(failing), ['actionlint'])
  assert.match(failing.results.find(item => item.id === 'actionlint').message, /unexpected key/)
})

test('formatResults renders one pass/fail/skip line per check', () => {
  const lines = formatResults([
    { status: 'pass', message: 'ok' },
    { status: 'fail', message: 'broken' },
    { status: 'skip', message: 'skipped' },
    { status: 'info', message: 'note' },
  ]).split('\n')
  assert.deepEqual(lines, ['✓ ok', '✗ broken', '- skipped', 'ℹ note'])
})
