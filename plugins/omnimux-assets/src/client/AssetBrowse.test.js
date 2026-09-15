import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isDirectoryRef } from './asset-routing.js'

const here = dirname(fileURLToPath(import.meta.url))
const browseJsx = readFileSync(join(here, 'AssetBrowse.jsx'), 'utf8')

describe('AssetBrowse drill-down and sub-media preview contract', () => {
  it('re-exports isDirectoryRef for backward compatibility', () => {
    assert.match(browseJsx, /export\s*\{\s*isDirectoryRef\s*\}/)
    assert.equal(typeof isDirectoryRef, 'function')
    assert.equal(isDirectoryRef({ is_dir: true }), true)
    assert.equal(isDirectoryRef({ kind: 'directory' }), true)
    assert.equal(isDirectoryRef({ is_dir: false }), false)
  })

  it('wires onPreview callback and resolveAssetMediaPreview in AssetBrowse.jsx', () => {
    // 1. Imports resolveAssetMediaPreview and detectMediaKind
    assert.match(browseJsx, /import\s+.*resolveAssetMediaPreview.*from '\.\/asset-routing\.js'/)
    assert.match(browseJsx, /import\s+.*detectMediaKind.*from '\.\/asset-routing\.js'/)

    // 2. AssetBrowse accepts onPreview prop
    assert.match(browseJsx, /export function AssetBrowse\(\{[\s\S]*?onPreview[\s\S]*?\}\)/)

    // 3. In entries loop: folder drills down via setStack, media triggers onPreview
    assert.match(browseJsx, /onPreview\(resolveAssetMediaPreview\(entry,\s*\{\s*asset,\s*stack\s*\}\)\)/)

    // 4. In top-level files loop: folder enters stack, media triggers onPreview
    assert.match(browseJsx, /onPreview\(resolveAssetMediaPreview\(file,\s*\{\s*asset\s*\}\)\)/)
  })

  it('implements breadcrumb navigation and back button', () => {
    assert.match(browseJsx, /className="omnimux-assets-crumbs"/)
    assert.match(browseJsx, /\{t\('browse\.back'\)\}/)
    assert.match(browseJsx, /goCrumb\(index\)/)
  })

  it('renders edit icon in the breadcrumb back row and wires onEdit', () => {
    assert.match(browseJsx, /import\s+.*EditIcon.*from '\.\/icons\.jsx'/)
    assert.match(browseJsx, /export function AssetBrowse\(\{[\s\S]*?onEdit[\s\S]*?\}\)/)
    assert.match(browseJsx, /className="omnimux-assets-crumb-edit"/)
    assert.match(browseJsx, /<EditIcon\s+size=\{14\}\s*\/>/)
    assert.match(browseJsx, /onClick=\{onEdit\}/)
  })

  it('drops the media badge for previewable cards and keeps it for the rest', () => {
    // A rendered thumbnail already states its own type, so the badge is built
    // only for folders and unclassified files.
    assert.match(browseJsx, /const badge = kind === 'folder'[\s\S]*?t\('detail\.folder'\)[\s\S]*?t\('detail\.file'\)[\s\S]*?: ''/)
    assert.doesNotMatch(browseJsx, /kind === 'image'\s*\n?\s*\?\s*t\('media\.image'\)/)
    assert.doesNotMatch(browseJsx, /kind === 'video'\s*\n?\s*\?\s*t\('media\.video'\)/)
  })

  it('adds a reveal-in-file-manager control wired to the Host route', () => {
    assert.match(browseJsx, /import\s+.*RevealLocationIcon.*from '\.\/icons\.jsx'/)
    assert.match(browseJsx, /import\s+.*revealAssetEntry.*from '\.\/api\.js'/)
    assert.match(browseJsx, /className="omnimux-assets-reveal"/)
    assert.match(browseJsx, /aria-label=\{t\('browse\.revealLocation'\)\}/)
    assert.match(browseJsx, /revealAssetEntry\(asset\.id,\s*target\.fileId,\s*target\.subPath\)/)
    // The control must not also activate the card's own open/preview action.
    assert.match(browseJsx, /const handleReveal = \(event\) => \{\s*event\.stopPropagation\(\)/)
    // Both card lists (drill-down entries and top-level files) wire it.
    assert.equal((browseJsx.match(/onReveal=\{/g) || []).length, 2)
  })
})

describe('Asset reveal surface', () => {
  const here = dirname(fileURLToPath(import.meta.url))

  it('ships the icon, the API call and the bilingual label', () => {
    const iconsJsx = readFileSync(join(here, 'icons.jsx'), 'utf8')
    const apiJs = readFileSync(join(here, 'api.js'), 'utf8')
    const localesJs = readFileSync(join(here, 'locales.js'), 'utf8')
    assert.match(iconsJsx, /export function RevealLocationIcon/)
    assert.match(apiJs, /export function revealAssetEntry[\s\S]*?'\/omnimux\/assets\/library\/reveal'/)
    assert.match(localesJs, /'browse\.revealLocation': '打开文件位置'/)
    assert.match(localesJs, /'browse\.revealLocation': 'Reveal in Finder'/)
  })

  it('positions the reveal control beside the badge in the card corner', () => {
    const stylesJs = readFileSync(join(here, 'styles.js'), 'utf8')
    assert.match(stylesJs, /\.omnimux-assets-card-corner \{[\s\S]*?position: absolute;[\s\S]*?z-index: 2;/)
    assert.match(stylesJs, /\.omnimux-assets-card-corner \.omnimux-assets-badge \{\s*position: static;/)
    assert.match(stylesJs, /\.omnimux-assets-card-corner \.omnimux-assets-reveal/)
    // Hidden until the card is hovered, and reachable by keyboard without hover.
    assert.match(stylesJs, /\.omnimux-assets-card-corner \.omnimux-assets-reveal:active \{[\s\S]*?opacity: 0;/)
    assert.match(
      stylesJs,
      /\.omnimux-assets-card:hover \.omnimux-assets-card-corner \.omnimux-assets-reveal,\s*\n\.omnimux-assets-card:focus-within \.omnimux-assets-card-corner \.omnimux-assets-reveal,[\s\S]*?opacity: 1;/,
    )
  })
})
