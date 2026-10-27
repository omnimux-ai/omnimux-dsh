/**
 * `scripts/verify-profile-dependency-snapshots.mjs` 的回归测试（Issue #3761）。
 *
 * 覆盖：干净 profile、owned/非 owned 的版本号依赖、快照目录缺失、快照缺 package.json、
 * 悬空插件清单条目、App 自带宿主包放行、node_modules 已安装条目放行、scope 路径、
 * 拿不到 owned 清单时的显式跳过、profile 缺失/非法。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { inspectProfile, MANAGED_SNAPSHOT_DIRECTORY, readSupportIdentity } from './verify-profile-dependency-snapshots.mjs'

/**
 * 造一个 profile 骨架。
 * @param {{ dependencies?: Record<string, string>, bundles?: string[], snapshots?: string[], snapshotWithoutManifest?: string[], raw?: string }} options
 */
function profile(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'profile-deps-'))
  if (options.raw !== undefined) {
    writeFileSync(join(root, 'package.json'), options.raw)
    return root
  }
  const dependencies = options.dependencies ?? { 'omnimux-demo': `file:${MANAGED_SNAPSHOT_DIRECTORY}/omnimux-demo` }
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'omnimux-profile',
    dependencies,
    dsh: { profile: { bundles: options.bundles ?? ['@deepseek-ai/dsh-base', 'omnimux-demo'] } },
  }, null, 2))
  for (const name of options.snapshots ?? ['omnimux-demo']) {
    const dir = join(root, MANAGED_SNAPSHOT_DIRECTORY, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
  }
  for (const name of options.snapshotWithoutManifest ?? []) {
    mkdirSync(join(root, MANAGED_SNAPSHOT_DIRECTORY, name), { recursive: true })
  }
  return root
}

function withProfile(options, body) {
  const root = profile(options)
  try {
    return body(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const OWNED = ['omnimux-demo']

test('干净 profile 通过（owned 依赖指向存在的受管快照）', () => {
  withProfile({}, (root) => {
    const result = inspectProfile(root, { ownedPackages: OWNED })
    assert.deepEqual(result.failures, [])
    assert.deepEqual(result.warnings, [])
    assert.equal(result.dependenciesChecked, 1)
    assert.equal(result.bundlesChecked, 2)
    assert.equal(result.ownedStatus, 'checked')
  })
})

test('owned 依赖仍是版本号时硬失败（宿主启动会拒绝的那一类）', () => {
  withProfile({ dependencies: { sharp: '0.35.5' }, snapshots: [], bundles: ['@deepseek-ai/dsh-base'] }, (root) => {
    const result = inspectProfile(root, { ownedPackages: ['sharp'] })
    assert.equal(result.failures.length, 1)
    assert.match(result.failures[0], /owned 依赖 sharp 未指向受管快照/)
  })
})

test('非 owned 依赖仍是版本号时只警告，不失败', () => {
  withProfile({ dependencies: { sharp: '0.35.5' }, snapshots: [], bundles: ['@deepseek-ai/dsh-base'] }, (root) => {
    const result = inspectProfile(root, { ownedPackages: OWNED })
    assert.deepEqual(result.failures, [])
    assert.equal(result.warnings.length, 1)
    assert.match(result.warnings[0], /依赖 sharp 仍是/)
  })
})

test('受管快照目录不存在时失败', () => {
  withProfile({
    dependencies: { 'omnimux-demo': `file:${MANAGED_SNAPSHOT_DIRECTORY}/omnimux-demo` },
    snapshots: [],
    bundles: ['omnimux-demo'],
  }, (root) => {
    const result = inspectProfile(root, { ownedPackages: OWNED })
    assert.equal(result.failures.length, 1)
    assert.match(result.failures[0], /受管快照目录不存在/)
  })
})

test('受管快照缺少 package.json 时失败（pnpm pack 会报 NO_IMPORTER_MANIFEST）', () => {
  withProfile({ snapshotWithoutManifest: ['omnimux-demo'], snapshots: [], bundles: [] }, (root) => {
    const result = inspectProfile(root, { ownedPackages: OWNED })
    assert.equal(result.failures.length, 1)
    assert.match(result.failures[0], /缺少 package\.json/)
  })
})

test('插件清单条目没有任何来源时只警告（命名同步会保留未点名 bundle）', () => {
  withProfile({ dependencies: {}, snapshots: [], bundles: ['@dsh-external/dsh-translator'] }, (root) => {
    const result = inspectProfile(root, { ownedPackages: [] })
    assert.deepEqual(result.failures, [])
    assert.equal(result.warnings.length, 1)
    assert.match(result.warnings[0], /没有任何来源/)
  })
})

test('App 自带宿主包允许出现在插件清单里', () => {
  withProfile({ dependencies: {}, snapshots: [], bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] }, (root) => {
    assert.deepEqual(inspectProfile(root, { ownedPackages: [] }).failures, [])
  })
})

test('node_modules 里已安装的非宿主条目允许', () => {
  withProfile({ dependencies: {}, snapshots: [], bundles: ['dsh-better-sidebar'] }, (root) => {
    mkdirSync(join(root, 'node_modules', 'dsh-better-sidebar'), { recursive: true })
    assert.deepEqual(inspectProfile(root, { ownedPackages: [] }).failures, [])
  })
})

test('带 scope 的依赖走同样的受管快照路径', () => {
  withProfile({
    dependencies: { '@dsh-external/dsh-translator': `file:${MANAGED_SNAPSHOT_DIRECTORY}/@dsh-external/dsh-translator` },
    snapshots: ['@dsh-external/dsh-translator'],
    bundles: ['@dsh-external/dsh-translator'],
  }, (root) => {
    assert.deepEqual(inspectProfile(root, { ownedPackages: ['@dsh-external/dsh-translator'] }).failures, [])
  })
})

test('拿不到 owned 清单时显式标记跳过，版本号依赖只警告', () => {
  withProfile({ dependencies: { sharp: '0.35.5' }, snapshots: [], bundles: [] }, (root) => {
    const result = inspectProfile(root)
    assert.equal(result.ownedStatus, 'skipped')
    assert.deepEqual(result.failures, [])
    assert.equal(result.warnings.length, 1)
  })
})

test('profile 缺失或非法 JSON 时指名报错，不静默通过', () => {
  const missing = inspectProfile(join(tmpdir(), 'profile-deps-absent-directory'))
  assert.equal(missing.failures.length, 1)
  assert.match(missing.failures[0], /缺少 package\.json/)

  withProfile({ raw: '{ not json' }, (root) => {
    const invalid = inspectProfile(root)
    assert.equal(invalid.failures.length, 1)
    assert.match(invalid.failures[0], /不是合法 JSON/)
  })
})
/* ------------------------------------------- 支持包版本漂移（Issue #3835） */

const SUPPORT_NAME = 'dsh-better-sidebar'
const SUPPORT_IDENTITY = { name: SUPPORT_NAME, version: '0.28.1' }

/** 造一个装了支持包的 profile：受管快照与 node_modules 各自写一份 package.json。 */
function supportProfile({ snapshotVersion, installedVersion }) {
  const root = mkdtempSync(join(tmpdir(), 'profile-support-'))
  const dependencies = Object.fromEntries([[SUPPORT_NAME, `file:${MANAGED_SNAPSHOT_DIRECTORY}/${SUPPORT_NAME}`]])
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'omnimux-profile',
    dependencies,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', SUPPORT_NAME] } },
  }, null, 2))
  const entries = [
    [join(root, MANAGED_SNAPSHOT_DIRECTORY, SUPPORT_NAME), snapshotVersion],
    [join(root, 'node_modules', SUPPORT_NAME), installedVersion],
  ]
  for (const [directory, version] of entries) {
    if (version === undefined) continue
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: SUPPORT_NAME, version }))
  }
  return root
}

test('受管快照被打回旧版本时硬失败，并指名包名、期望版本、实际版本与路径（#3835 真机缺陷）', () => {
  const root = supportProfile({ snapshotVersion: '0.19.1', installedVersion: '0.28.1' })
  try {
    const result = inspectProfile(root, { ownedPackages: [], supportIdentity: SUPPORT_IDENTITY })
    assert.equal(result.failures.length, 1, result.failures.join('\n'))
    assert.match(result.failures[0], /受管快照 dsh-better-sidebar 版本漂移/)
    assert.match(result.failures[0], /期望 0\.28\.1/)
    assert.match(result.failures[0], /实际 0\.19\.1/)
    assert.match(result.failures[0], /\.materialize-snapshots\/plugins\/dsh-better-sidebar/)
    assert.equal(result.supportChecked, 2, '快照与 node_modules 两处都要核对')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('node_modules 已被旧版本覆盖时同样硬失败', () => {
  const root = supportProfile({ snapshotVersion: '0.28.1', installedVersion: '0.28.0' })
  try {
    const result = inspectProfile(root, { ownedPackages: [], supportIdentity: SUPPORT_IDENTITY })
    assert.equal(result.failures.length, 1, result.failures.join('\n'))
    assert.match(result.failures[0], /已安装 dsh-better-sidebar 版本漂移/)
    assert.match(result.failures[0], /实际 0\.28\.0/)
    assert.match(result.failures[0], /node_modules\/dsh-better-sidebar/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('快照与 node_modules 都与身份声明一致时通过', () => {
  const root = supportProfile({ snapshotVersion: '0.28.1', installedVersion: '0.28.1' })
  try {
    const result = inspectProfile(root, { ownedPackages: [], supportIdentity: SUPPORT_IDENTITY })
    assert.deepEqual(result.failures, [])
    assert.equal(result.supportChecked, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('没有安装支持包的 profile 不因身份文件而失败', () => {
  withProfile({ dependencies: {}, snapshots: [], bundles: ['@deepseek-ai/dsh-base'] }, (root) => {
    const result = inspectProfile(root, { ownedPackages: [], supportIdentity: SUPPORT_IDENTITY })
    assert.deepEqual(result.failures, [])
    assert.equal(result.supportChecked, 0)
  })
})

test('身份声明不可读时指名失败，不静默放行', () => {
  const root = supportProfile({ snapshotVersion: '0.28.1', installedVersion: '0.28.1' })
  try {
    const result = inspectProfile(root, { ownedPackages: [], supportIdentity: null })
    assert.equal(result.failures.length, 1, result.failures.join('\n'))
    assert.match(result.failures[0], /支持包身份声明不可读/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('真身份文件可读，且版本是精确 semver（单一真源不得缺声明）', () => {
  const identity = readSupportIdentity()
  assert.ok(identity, 'scripts/sidebar-support-identity.json 必须可读')
  assert.equal(identity.name, SUPPORT_NAME)
  assert.match(identity.version, /^\d+\.\d+\.\d+$/)
  assert.equal(readSupportIdentity(join(tmpdir(), 'absent-identity.json')), null)
})
