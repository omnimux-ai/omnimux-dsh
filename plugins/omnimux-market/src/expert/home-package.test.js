import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { loadCatalog } from './catalog.js'
import { installItem } from './install.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const CATALOG_ID = 'sk-omx-replicate-carousel'
const pack = join(root, 'catalog/skills/replicate-carousel')
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? files(join(dir, entry.name)).map(path => `${entry.name}/${path}`) : [entry.name]).sort()

test('admitted bundled package installs all resources byte-identically without executing scripts', () => {
  const home = mkdtempSync(join(root, '.home-package-test-'))
  try {
    const catalog = loadCatalog(join(root, 'catalog/index.json'))
    const item = catalog.items.find((row) => row.id === CATALOG_ID)
    assert.ok(item, `${CATALOG_ID} must exist in the catalog`)
    assert.equal(item.source.type, 'bundled')
    assert.ok(files(pack).length > 1, 'fixture pack must contain more than SKILL.md')
    const result = installItem({ catalog, id: CATALOG_ID, home, profileDir: join(home, 'profile'), packageRoot: root })
    assert.equal(result.source, 'bundled')
    const installed = join(home, 'skills/replicate-carousel')
    assert.deepEqual(files(installed), files(pack))
    for (const file of files(pack)) assert.deepEqual(readFileSync(join(installed, file)), readFileSync(join(pack, file)))
    assert.match(readFileSync(join(installed, 'SKILL.md'), 'utf8'), /name:\s*replicate-carousel/)
    assert.equal(installItem({ catalog, id: CATALOG_ID, home, profileDir: join(home, 'profile'), packageRoot: root }).already, true)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('homepage cover is a bundled asset inside the package cover paths', () => {
  const catalog = loadCatalog(join(root, 'catalog/index.json'))
  const item = catalog.items.find((row) => row.id === CATALOG_ID)
  assert.ok(item, `${CATALOG_ID} must exist in the catalog`)
  const asset = item.homeCover?.asset || item.cover?.asset
  assert.ok(typeof asset === 'string' && asset.startsWith('catalog/covers/'), `home cover must be a bundled asset, got ${asset}`)
  const file = resolve(root, asset)
  assert.equal(existsSync(file), true)
  assert.ok(statSync(file).size > 0)
})
