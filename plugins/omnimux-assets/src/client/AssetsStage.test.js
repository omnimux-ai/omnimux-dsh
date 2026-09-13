import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en, zh } from './locales.js'
import { ASSETS_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const stageJsx = readFileSync(join(here, 'AssetsStage.jsx'), 'utf8')
const cloudJsx = readFileSync(join(here, 'CloudAssetsView.jsx'), 'utf8')
const feedJs = readFileSync(join(here, 'use-assets-feed.js'), 'utf8')

/**
 * One top-level function of the stage source, from its declaration to the next
 * top-level declaration.
 * @param {string} source
 * @param {string} name
 * @param {string} nextName
 */
function stageFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `AssetsStage.jsx must declare ${name}`)
  const end = source.indexOf(`function ${nextName}`, start)
  assert.notEqual(end, -1, `${name} must be followed by ${nextName}`)
  return source.slice(start, end)
}

const filterBar = stageFunction(stageJsx, 'AssetsFilterBar', 'AssetsSelectionBar')
const localNav = stageFunction(stageJsx, 'LocalCategoryNav', 'AssetsViewToggle')

describe('Assets toolbar keeps no dropdown filter', () => {
  it('renders the search box and the view toggle, and nothing else', () => {
    assert.doesNotMatch(filterBar, /DropdownSelect/)
    assert.doesNotMatch(filterBar, /sortOptions|typeOptions/)
    assert.match(filterBar, /className="omnimux-assets-search-wrap"/)
    assert.match(filterBar, /<SearchField\b/)
    assert.match(filterBar, /<AssetsViewToggle\b/)
  })

  it('leaves no dropdown component imported or mounted anywhere in the stage', () => {
    assert.doesNotMatch(stageJsx, /DropdownSelect/)
    assert.doesNotMatch(stageJsx, /omnimux-assets-sort-wrap/)
  })

  it('drops the sort-dropdown width rule along with its wrappers', () => {
    assert.doesNotMatch(ASSETS_CSS, /omnimux-assets-sort-wrap/)
  })
})

describe('Local library category row', () => {
  it('leads with the 全部 chip from the dictionary and counts the whole library', () => {
    // The count reads the library, never the query, so the row is built from
    // the feed's full asset list.
    assert.match(localNav, /countAssetsByType\(assets\)/)
    assert.match(localNav, /label: t\('chip\.all'\), total: Array\.isArray\(assets\) \? assets\.length : 0/)
    assert.equal(zh['chip.all'], '全部')
    assert.equal(en['chip.all'], 'All')
  })

  it('appends one chip per asset type, each with its own count', () => {
    assert.match(localNav, /ASSET_TYPE_KEYS\.map\(\(key\) => \(\{ key, label: t\(`type\.\$\{key\}`\), total: counts\[key\] \?\? 0 \}\)\)/)
    assert.match(localNav, /className="omnimux-assets-cloud-count">\{row\.total\}/)
  })

  it('opens on 全部 and switches the filter through the feed setter', () => {
    // '' is the unfiltered type, both in the row and in the feed's own default.
    assert.match(feedJs, /const \[filterType, setFilterType\] = useState\(''\)/)
    assert.match(localNav, /aria-pressed=\{row\.key === filterType \? 'true' : 'false'\}/)
    assert.match(localNav, /onClick=\{\(\) => onTypeChange\(row\.key\)\}/)
    assert.match(stageJsx, /onTypeChange=\{feed\.setFilterType\}/)
  })

  it('labels the row group for assistive tech from the dictionary', () => {
    assert.match(localNav, /role="group" aria-label=\{t\('local\.nav\.label'\)\}/)
    assert.equal(zh['local.nav.label'], '本地素材分类')
    assert.equal(en['local.nav.label'], 'Local asset categories')
  })

  it('mounts exactly once, on the local tab only', () => {
    assert.match(stageJsx, /\{sourceTab === 'local' \? \(/)
    assert.equal(stageJsx.split('<LocalCategoryNav').length - 1, 1)
    // The cloud tab keeps drawing its own row from the catalog manifest.
    assert.match(cloudJsx, /<CloudCategoryNav\b/)
    assert.match(cloudJsx, /className="omnimux-assets-cloud-nav"/)
  })

  it('shares the cloud chip treatment instead of restating it', () => {
    const chip = '.omnimux-assets-local-nav .omnimux-assets-local-nav-row .omnimux-assets-cloud-chip'
    const at = ASSETS_CSS.indexOf(chip)
    assert.notEqual(at, -1, 'the local row must be listed in the shared chip rules')
    const block = ASSETS_CSS.slice(ASSETS_CSS.indexOf('{', at), ASSETS_CSS.indexOf('}', at))
    assert.match(block, /border-radius:\s*999px;/)
    assert.match(block, /padding:\s*0 12px;/)
    assert.notEqual(
      ASSETS_CSS.indexOf(`${chip}[aria-pressed="true"]:hover`),
      -1,
      'the selected chip must stay inked on hover in the local row too',
    )
    assert.match(localNav, /className="omnimux-assets-cloud-chip"/)
    // No brand accent anywhere in the row: the selected pill uses the label ink.
    assert.doesNotMatch(chip, /accent|brand|primary-/)
  })
})
