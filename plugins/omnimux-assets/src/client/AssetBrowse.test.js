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
})
