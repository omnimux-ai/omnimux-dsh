import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readRegistry, listPluginDirs, verifyLicenseConsistency } from './verify-license-consistency.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** 造一个最小仓库：根 LICENSE、registry、N 个插件包。 */
function fixture({ packages, rootLicense = 'ROOT LICENSE TEXT\n' }) {
  const root = mkdtempSync(join(tmpdir(), 'lic-'))
  writeFileSync(join(root, 'LICENSE'), rootLicense)
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, 'plugins'))
  writeFileSync(join(root, 'scripts', 'license-registry.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    rootLicense: 'LICENSE',
    packages,
  }))
  for (const [name, spec] of Object.entries(packages)) {
    const dir = join(root, 'plugins', name)
    mkdirSync(dir, { recursive: true })
    const pkg = { name, version: '0.0.0', license: spec.pkgLicense, files: spec.files }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
    for (const [file, content] of Object.entries(spec.files_on_disk || {})) {
      writeFileSync(join(dir, file), content)
    }
  }
  return root
}

const originalEntry = (license = 'SEE LICENSE IN LICENSE') => ({ class: 'original', license, upstream: [] })

test('通过：原创包 LICENSE 与根许可逐字节相同', () => {
  const root = fixture({
    packages: { 'p-one': { ...originalEntry(), pkgLicense: 'SEE LICENSE IN LICENSE', files: ['src', 'LICENSE'], files_on_disk: { LICENSE: 'ROOT LICENSE TEXT\n' } } },
  })
  const result = verifyLicenseConsistency(root)
  assert.deepEqual(result.errors, [])
  assert.equal(result.audited, 1)
  rmSync(root, { recursive: true, force: true })
})

test('失败：license 字段与 registry 不一致（Issue #3817 原始症状）', () => {
  const root = fixture({
    packages: { 'p-one': { ...originalEntry(), pkgLicense: 'MIT', files: ['src', 'LICENSE'], files_on_disk: { LICENSE: 'ROOT LICENSE TEXT\n' } } },
  })
  const { errors } = verifyLicenseConsistency(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /license 字段为 "MIT"/)
  rmSync(root, { recursive: true, force: true })
})

test('失败：包根缺少 LICENSE', () => {
  const root = fixture({
    packages: { 'p-one': { ...originalEntry(), pkgLicense: 'SEE LICENSE IN LICENSE', files: ['src', 'LICENSE'], files_on_disk: {} } },
  })
  const { errors } = verifyLicenseConsistency(root)
  assert.ok(errors.some(e => /包根缺少 LICENSE/.test(e)))
  rmSync(root, { recursive: true, force: true })
})

test('失败：files 未包含 LICENSE', () => {
  const root = fixture({
    packages: { 'p-one': { ...originalEntry(), pkgLicense: 'SEE LICENSE IN LICENSE', files: ['src'], files_on_disk: { LICENSE: 'ROOT LICENSE TEXT\n' } } },
  })
  const { errors } = verifyLicenseConsistency(root)
  assert.ok(errors.some(e => /files 白名单未显式包含 "LICENSE"/.test(e)))
  rmSync(root, { recursive: true, force: true })
})

test('失败：原创包 LICENSE 被改成别的内容', () => {
  const root = fixture({
    packages: { 'p-one': { ...originalEntry(), pkgLicense: 'SEE LICENSE IN LICENSE', files: ['src', 'LICENSE'], files_on_disk: { LICENSE: 'MIT License\n' } } },
  })
  const { errors } = verifyLicenseConsistency(root)
  assert.ok(errors.some(e => /与根 LICENSE 不一致/.test(e)))
  rmSync(root, { recursive: true, force: true })
})

test('失败：未登记的插件目录', () => {
  const root = fixture({
    packages: { 'p-one': { ...originalEntry(), pkgLicense: 'SEE LICENSE IN LICENSE', files: ['src', 'LICENSE'], files_on_disk: { LICENSE: 'ROOT LICENSE TEXT\n' } } },
  })
  mkdirSync(join(root, 'plugins', 'p-ghost'))
  writeFileSync(join(root, 'plugins', 'p-ghost', 'package.json'), '{"name":"p-ghost","license":"MIT"}')
  const { errors } = verifyLicenseConsistency(root)
  assert.ok(errors.some(e => /p-ghost.*未在 scripts\/license-registry\.json 登记/.test(e)))
  rmSync(root, { recursive: true, force: true })
})

test('失败：registry 有死条目', () => {
  const root = fixture({
    packages: {
      'p-one': { ...originalEntry(), pkgLicense: 'SEE LICENSE IN LICENSE', files: ['src', 'LICENSE'], files_on_disk: { LICENSE: 'ROOT LICENSE TEXT\n' } },
      'p-gone': { ...originalEntry(), pkgLicense: 'SEE LICENSE IN LICENSE', files: ['LICENSE'], files_on_disk: {} },
    },
  })
  // fixture 为每条登记都建了目录；这里删掉，模拟「registry 有、磁盘没有」的死条目
  rmSync(join(root, 'plugins', 'p-gone'), { recursive: true, force: true })
  const { errors } = verifyLicenseConsistency(root)
  assert.ok(errors.some(e => /p-gone.*不存在/.test(e)))
  rmSync(root, { recursive: true, force: true })
})

test('失败：vendor 包缺少上游原文或未声明路径范围', () => {
  const vendorEntry = {
    class: 'vendor',
    license: 'SEE LICENSE IN LICENSE',
    upstream: [{
      project: 'up', repo: 'https://example.invalid/up', commit: 'abc123', license: 'MIT',
      copyright: 'Copyright (c) 2026 Upstream', noticeFile: 'LICENSE.upstream.txt', textFile: 'LICENSE.upstream.txt',
      paths: ['src/vendored/'],
    }],
  }
  const root = fixture({
    packages: { 'p-vendor': { ...vendorEntry, pkgLicense: 'SEE LICENSE IN LICENSE', files: ['src', 'LICENSE'], files_on_disk: { LICENSE: 'ROOT LICENSE TEXT\n' } } },
  })
  const { errors } = verifyLicenseConsistency(root)
  assert.ok(errors.some(e => /缺少上游许可原文/.test(e)))
  assert.ok(errors.some(e => /未声明上游代码路径范围 "src\/vendored\/"/.test(e)))
  rmSync(root, { recursive: true, force: true })
})

test('通过：vendor 包完整声明', () => {
  const license = 'Scope\n\n  - src/vendored/\n\nROOT LICENSE TEXT\n'
  const root = fixture({
    packages: {
      'p-vendor': {
        class: 'vendor',
        license: 'SEE LICENSE IN LICENSE',
        upstream: [{
          project: 'up', repo: 'https://example.invalid/up', commit: 'abc123', license: 'MIT',
          copyright: 'Copyright (c) 2026 Upstream', noticeFile: 'LICENSE.upstream.txt', textFile: 'LICENSE.upstream.txt',
          paths: ['src/vendored/'],
        }],
        pkgLicense: 'SEE LICENSE IN LICENSE',
        files: ['src', 'LICENSE'],
        files_on_disk: {
          LICENSE: license,
          'LICENSE.upstream.txt': 'MIT License\n\nCopyright (c) 2026 Upstream\n',
        },
      },
    },
  })
  const result = verifyLicenseConsistency(root)
  assert.deepEqual(result.errors, [])
  assert.equal(result.counts.vendor, 1)
  rmSync(root, { recursive: true, force: true })
})

test('警告：上游基线 commit 未记录', () => {
  const root = fixture({
    packages: {
      'p-fork': {
        class: 'fork',
        license: 'MIT',
        upstream: [{
          project: 'up', repo: 'https://example.invalid/up', commit: null, license: 'MIT',
          copyright: 'Copyright (c) 2026 Upstream', noticeFile: 'LICENSE', textFile: 'LICENSE',
        }],
        pkgLicense: 'MIT',
        files: ['LICENSE'],
        files_on_disk: { LICENSE: 'MIT License\n\nCopyright (c) 2026 Upstream\n' },
      },
    },
  })
  const { errors, warnings } = verifyLicenseConsistency(root)
  assert.deepEqual(errors, [])
  assert.ok(warnings.some(w => /上游基线 commit 未记录/.test(w)))
  rmSync(root, { recursive: true, force: true })
})

test('真实仓库：22 个插件全部登记且通过', () => {
  const registry = readRegistry(repoRoot)
  const onDisk = listPluginDirs(repoRoot)
  assert.equal(onDisk.length, 22)
  assert.deepEqual(Object.keys(registry.packages).sort(), onDisk)
  const result = verifyLicenseConsistency(repoRoot)
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.counts, { original: 17, fork: 3, vendor: 2 })
})

test('真实仓库：fork 类保持 MIT，原创类不残留 MIT', () => {
  const registry = readRegistry(repoRoot)
  const forks = Object.entries(registry.packages).filter(([, v]) => v.class === 'fork').map(([k]) => k).sort()
  assert.deepEqual(forks, ['omnimux-browser', 'omnimux-market', 'omnimux-viewer'])
  for (const [name, entry] of Object.entries(registry.packages)) {
    if (entry.class === 'fork') assert.equal(entry.license, 'MIT', name + ' 必须保持上游 MIT')
    else assert.notEqual(entry.license, 'MIT', name + ' 不得声明 MIT')
  }
})
