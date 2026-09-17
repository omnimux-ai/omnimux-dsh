import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en, zh } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))
const viewJsx = readFileSync(join(here, 'GenerationsView.jsx'), 'utf8')

describe('Generations Asset Promotion and Cross-Scene Flow (Slice 3)', () => {
  it('contains valid i18n locales for promote and canvas flow', () => {
    assert.equal(zh['generations.promote'], '设为资产')
    assert.equal(en['generations.promote'], 'Save as Asset')
    assert.equal(zh['generations.promoted'], '已是资产')
    assert.equal(en['generations.promoted'], 'Saved as Asset')
    assert.equal(zh['generations.addToCanvas'], '放入画布')
    assert.equal(en['generations.addToCanvas'], 'Add to Canvas')
    assert.equal(zh['generations.addedToCanvas'], '已发送至画布')
    assert.equal(en['generations.addedToCanvas'], 'Added to Canvas')
  })

  it('implements promote to asset calling createAsset API', () => {
    assert.match(viewJsx, /import\s*\{[^}]*createAsset[^}]*\}\s*from\s*'\.\/api\.js'/)
    assert.match(viewJsx, /const handlePromote = useCallback\(async \(artifact\)/)
    assert.match(viewJsx, /setPromotedIds/)
  })

  it('implements add to canvas dispatching omnimux-workflow:add-media event', () => {
    assert.match(viewJsx, /const handleAddToCanvas = useCallback\(\(artifact\)/)
    assert.match(viewJsx, /window\.dispatchEvent\(\s*new CustomEvent\('omnimux-workflow:add-media'/)
    assert.match(viewJsx, /setCanvasAddedIds/)
  })

  it('renders promote and add-to-canvas actions on GenerationCard', () => {
    assert.match(viewJsx, /onPromote\?\.\(artifact\)/)
    assert.match(viewJsx, /onAddToCanvas\?\.\(artifact\)/)
    assert.match(viewJsx, /<PlusIcon \/>/)
    assert.match(viewJsx, /<GridIcon \/>/)
  })
})
