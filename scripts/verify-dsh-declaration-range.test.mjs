/**
 * `scripts/verify-dsh-declaration-range.mjs` 的回归测试（#3737）。
 *
 * 覆盖四种扫描面（inject / esbuild external / 依赖声明 / 源码导入）与可选的底座清单差集，
 * 并确认真实仓库当前为通过状态。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { collectFailures } from './verify-dsh-declaration-range.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REMOVED = '@deepseek-ai/dsh-client-runtime'

/** 造一个最小的“仓库”骨架；peer 与 inject 都合法，用来验证各扫描面能单独触发失败。 */
function fixture({ inject = [], devDependencies = {}, source = null, external = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-decl-'))
  const plugin = join(root, 'plugins', 'demo-plugin')
  mkdirSync(join(plugin, 'src'), { recursive: true })
  mkdirSync(join(plugin, 'scripts'), { recursive: true })
  writeFileSync(join(plugin, 'package.json'), JSON.stringify({
    name: '@omnimux/demo-plugin',
    peerDependencies: { '@deepseek-ai/dsh-base': '>=0.1.5-rc.3 <0.3.0-0 || >=0.2.1-rc.3 <0.3.0-0' },
    devDependencies,
    dsh: { client: { inject, platform: 'web' } },
  }, null, 2))
  writeFileSync(join(plugin, 'scripts', 'build-client.mjs'),
    `export default { external: ['react'${external ? `, '${external}'` : ''}] }\n`)
  if (source) writeFileSync(join(plugin, 'src', 'index.ts'), source)
  return root
}

function withFixture(options, body) {
  const root = fixture(options)
  try {
    return body(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('干净骨架不报失败', () => {
  withFixture({ inject: ['@deepseek-ai/dsh-client-ui-locale'] }, (root) => {
    const result = collectFailures(root)
    assert.deepEqual(result.failures, [])
    assert.equal(result.peersChecked, 1)
    assert.equal(result.injectChecked, 1)
  })
})

test('inject 指向已删包时失败', () => {
  withFixture({ inject: [REMOVED] }, (root) => {
    const { failures } = collectFailures(root)
    assert.equal(failures.length, 1)
    assert.match(failures[0], /dsh\.client\.inject 仍指向/)
  })
})

test('devDependency 指向已删包时失败（#3737 补齐的扫描面）', () => {
  withFixture({ devDependencies: { [REMOVED]: '0.1.1-rc.2' } }, (root) => {
    const { failures } = collectFailures(root)
    assert.equal(failures.length, 1)
    assert.match(failures[0], /devDependencies 仍指向/)
  })
})

test('源码类型导入指向已删包时失败（viewer 漏过去的那一类）', () => {
  withFixture({ source: `import type { ToolCallBlock } from '${REMOVED}/client'\n` }, (root) => {
    const { failures } = collectFailures(root)
    assert.equal(failures.length, 1)
    assert.match(failures[0], /源码仍引用/)
  })
})

test('esbuild external 指向已删包时失败', () => {
  withFixture({ external: REMOVED }, (root) => {
    const { failures } = collectFailures(root)
    assert.equal(failures.length, 1)
    assert.match(failures[0], /esbuild external 仍包含/)
  })
})

test('底座清单缺该引用名时失败；设置清单后生效', () => {
  withFixture({ inject: ['@deepseek-ai/dsh-client-ui-locale'] }, (root) => {
    const manifestPath = join(root, 'manifest.json')
    writeFileSync(manifestPath, JSON.stringify({ modules: [{ name: '@deepseek-ai/dsh-client-ui-chat' }] }))
    const missing = collectFailures(root, { manifestPath })
    assert.equal(missing.manifestStatus, 'checked')
    assert.equal(missing.failures.length, 1)
    assert.match(missing.failures[0], /不在底座清单/)

    writeFileSync(manifestPath, JSON.stringify({ modules: [{ name: '@deepseek-ai/dsh-client-ui-locale' }] }))
    const ok = collectFailures(root, { manifestPath })
    assert.deepEqual(ok.failures, [])
    assert.deepEqual(ok.manifestMissing, [])

    const skipped = collectFailures(root, { manifestPath: join(root, 'absent.json') })
    assert.equal(skipped.manifestStatus, 'missing')
    assert.deepEqual(skipped.failures, [])
  })
})

test('真实仓库当前通过（无已删包残留、peer 容纳新宿主）', () => {
  const result = collectFailures(repoRoot)
  assert.deepEqual(result.failures, [])
  assert.ok(result.injectChecked > 10)
})
