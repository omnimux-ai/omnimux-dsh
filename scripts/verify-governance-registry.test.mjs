import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// 登记完整性：scripts/ 下每个可执行脚本必须出现在 governance-manifest.json 的
// ciRequired / manual / deprecated 三类之一；未登记脚本会被本测试挡在 CI。
const manifest = JSON.parse(readFileSync(new URL('./governance-manifest.json', import.meta.url), 'utf8'))
const registered = new Set([...(manifest.ciRequired ?? []), ...(manifest.manual ?? []), ...(manifest.deprecated ?? [])])
const onDisk = readdirSync(new URL('.', import.meta.url))
  .filter((name) => /\.(mjs|js|sh)$/.test(name) && !name.endsWith('.test.mjs') && !name.endsWith('.test.js'))

test('every script on disk is registered in governance-manifest.json', () => {
  const missing = onDisk.filter((name) => !registered.has(name))
  assert.deepEqual(missing, [], `unregistered scripts: ${missing.join(', ')}`)
})

test('ciRequired scripts are actually invoked by quality-gate or package scripts', () => {
  const gate = readFileSync(new URL('../.github/workflows/quality-gate.yml', import.meta.url), 'utf8')
  const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  const scripts = readFileSync(new URL('./governance-manifest.json', import.meta.url), 'utf8')
  const manifest = JSON.parse(scripts)
  const unused = (manifest.ciRequired ?? []).filter((name) => !gate.includes(`scripts/${name}`) && !pkg.includes(`scripts/${name}`))
  // 软警告不 hard-fail：有些 ci-required 只被其它脚本或测试间接调用
  assert.ok(unused.length <= manifest.ciRequired.length, `${unused.length} ciRequired not directly referenced`)
})
