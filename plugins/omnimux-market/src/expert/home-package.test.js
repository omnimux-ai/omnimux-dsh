import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { loadCatalog } from './catalog.js'
import { installItem } from './install.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const pack = join(root, 'catalog/skills/bggg-data-amazon')
const blob = path => {
  const data = readFileSync(path)
  return createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex')
}
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? files(join(dir, entry.name)).map(path => `${entry.name}/${path}`) : [entry.name]).sort()

test('admitted bundled package installs all resources and both MIT notices without executing scripts', () => {
  const home = mkdtempSync(join(root, '.home-package-test-'))
  try {
    const catalog = loadCatalog(join(root, 'catalog/index.json'))
    const result = installItem({ catalog, id: 'sk-bggg-data-amazon', home, profileDir: join(home, 'profile'), packageRoot: root })
    assert.equal(result.source, 'bundled')
    const installed = join(home, 'skills/bggg-data-amazon')
    assert.deepEqual(files(installed), files(pack))
    for (const file of files(pack)) assert.deepEqual(readFileSync(join(installed, file)), readFileSync(join(pack, file)))
    assert.equal(blob(join(installed, 'LICENSE')), 'f7f6f5e831eaae0afea9565f47c5eaa66545c7fc')
    assert.equal(blob(join(installed, 'references/upstream_LICENSE')), '14fac913ccf80234b1848540089a3bbcb6e5283d')
    assert.equal(blob(join(installed, 'scripts/run_batch.py')), '7e9cf600c6483ca5fabfd691186675d9c2269538')
    assert.equal(blob(join(installed, 'scripts/amazon_review_scraper.py')), 'eae733b3b6ae1e80d36fcdcfdd750df29364d568')
    assert.equal(blob(join(installed, 'scripts/normalize_reviews.py')), '5f944be655b565e8d81c995f9f27f4c6cda05bf4')
    const text = readFileSync(join(installed, 'SKILL.md'), 'utf8')
    assert.match(text, /Python 3\.10\+/)
    assert.match(text, /python3 "\$SKILL_ROOT\/scripts\/run_batch\.py"/)
    assert.match(text, /python3 "\$SKILL_ROOT\/scripts\/normalize_reviews\.py"/)
    assert.match(readFileSync(join(installed, 'scripts/run_batch.py'), 'utf8'), /Path\(__file__\)\.with_name\("amazon_review_scraper\.py"\)/)
    assert.equal(installItem({ catalog, id: 'sk-bggg-data-amazon', home, profileDir: join(home, 'profile'), packageRoot: root }).already, true)
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('homepage cover is a bundled 1280 by 720 PNG outside the old cover paths', () => {
  const catalog = loadCatalog(join(root, 'catalog/index.json'))
  assert.equal(catalog.items.filter(item => item.id === 'sk-bggg-data-amazon').length, 1)
  const png = readFileSync(resolve(root, 'catalog/covers/home/bggg-data-amazon.png'))
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), 1280)
  assert.equal(png.readUInt32BE(20), 720)
})
