import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectGovernance } from './lib/governance-registry.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const sources = new Map()
const workflows = new Map()
function collect(directory, output, pattern) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.worktrees', '.git'].includes(item.name)) continue
    const path = join(directory, item.name)
    if (item.isSymbolicLink()) throw new Error('Governance source links are unsupported')
    if (item.isDirectory()) collect(path, output, pattern)
    else if (item.isFile() && pattern.test(item.name)) output.set(relative(root, path).split(sep).join('/'), readFileSync(path, 'utf8'))
  }
}
collect(join(root, 'scripts'), sources, /\.(?:mjs|js|sh|py)$/)
collect(join(root, '.github/workflows'), workflows, /\.ya?ml$/)
const manifest = JSON.parse(readFileSync(join(root, 'scripts/governance-manifest.json'), 'utf8'))
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
function readExternalSource(path) {
  const absolute = resolve(root, path)
  if (!absolute.startsWith(resolve(root) + sep)) throw new Error('Governance source leaves repository')
  try {
    let current = dirname(absolute)
    while (current !== resolve(root)) {
      const stat = lstatSync(current)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Noncanonical governance source directory')
      current = dirname(current)
    }
    const stat = lstatSync(absolute)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Nonregular governance source')
    return readFileSync(absolute, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
    throw error
  }
}
let result = inspectGovernance(manifest, sources, packageJson, workflows)
for (let round = 0; round < 64; round++) {
  let added = 0
  for (const item of result.unknowns) {
    if (item.code !== 'target-not-supplied' || sources.has(item.target)) continue
    const path = item.target
    if (typeof path !== 'string' || !/^(?:plugins|packages)\//.test(path) || path.split('/').some(part => ['..', '.', 'node_modules', '.worktrees', 'lib', 'dist', 'build'].includes(part))) continue
    const content = readExternalSource(path)
    if (content === null) continue
    sources.set(path, content)
    added++
  }
  if (!added) break
  result = inspectGovernance(manifest, sources, packageJson, workflows)
  if (round === 63) throw new Error('Governance source closure limit exceeded')
}

test('every real script including tests Python and nested helpers has an exact registered category', () => {
  assert.deepEqual(result.diagnostics.filter(item => ['inventory-unregistered', 'registry-ghost', 'registry-duplicate', 'registry-cross-category', 'registry-path-unsafe', 'manifest-version', 'category-shape'].includes(item.code)), [])
  assert.equal(result.reachability.inventory.length > 0, true)
})

test('registered categories match actual workflow roots and bounded static dependencies', () => {
  assert.deepEqual(result.diagnostics, [])
  assert.equal(Object.keys(result.reachability.classification).length, result.reachability.inventory.length)
  for (const [path, classification] of Object.entries(result.reachability.classification)) {
    assert.equal(classification.registered, classification.expected, path)
  }
  const reasons = new Map()
  for (const item of result.unknowns) reasons.set(item.code, (reasons.get(item.code) || 0) + 1)
  console.log('Governance unknown edges remain unproven:', Object.fromEntries(reasons))
})

test('missing optional external sources remain unknown without interrupting inventory checks', () => {
  assert.equal(readExternalSource('plugins/governance-missing-source-fixture/not-present.mjs'), null)
  assert.equal(readExternalSource('plugins/omnimux/package.json/not-present.mjs'), null)
  const sample = inspectGovernance({ version: 2, ciRequired: ['entry.mjs'], localRequired: [], manual: [], deprecated: [] }, { 'scripts/entry.mjs': "import '../plugins/governance-missing-source-fixture/not-present.mjs';" }, { scripts: {} }, { '.github/workflows/example.yml': { jobs: { check: { steps: [{ run: 'node scripts/entry.mjs' }] } } } })
  assert.deepEqual(sample.diagnostics, [])
  assert.equal(sample.unknowns.some(item => item.code === 'target-not-supplied'), true)
})

test('missing real helpers and ghost entries fail rather than becoming empty successful checks', () => {
  const empty = { version: 2, ciRequired: [], localRequired: [], manual: [], deprecated: [] }
  const missing = inspectGovernance(empty, { 'scripts/lib/real.mjs': 'export const value = 1;' }, { scripts: {} }, {})
  assert.equal(missing.diagnostics.some(item => item.code === 'inventory-unregistered'), true)
  const ghost = inspectGovernance({ version: 2, ciRequired: [], localRequired: [], manual: ['ghost.py'], deprecated: [] }, {}, { scripts: {} }, {})
  assert.equal(ghost.diagnostics.some(item => item.code === 'registry-ghost'), true)
})
