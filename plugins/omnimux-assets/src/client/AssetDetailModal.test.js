import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const detailJsx = readFileSync(join(here, 'AssetDetail.jsx'), 'utf8')
const stageJsx = readFileSync(join(here, 'AssetsStage.jsx'), 'utf8')

describe('Asset detail sidebar-to-modal refactoring contract', () => {
  it('AssetDetail renders as ModalDialog reusing shared UI kit', () => {
    // 1. Imports ModalDialog and form controls from dsh-ui-kit
    assert.match(detailJsx, /import\s+.*ModalDialog.*from 'dsh-ui-kit'/)
    assert.match(detailJsx, /import\s+.*DropdownSelect.*from 'dsh-ui-kit'/)
    assert.match(detailJsx, /import\s+.*InputField.*from 'dsh-ui-kit'/)
    assert.match(detailJsx, /import\s+.*Button.*from 'dsh-ui-kit'/)

    // 2. Uses ModalDialog as root container with title and size
    assert.match(detailJsx, /<ModalDialog[\s\S]*?title=\{t\('detail\.title'\)\}/)
    assert.match(detailJsx, /size="md"/)
  })

  it('preserves exactly the elements from Figure 2: name, type, description, citation, and save button', () => {
    // 1. Name InputField
    assert.match(detailJsx, /<InputField[\s\S]*?label=\{t\('detail\.name'\)\}/)
    // 2. Type DropdownSelect
    assert.match(detailJsx, /<DropdownSelect[\s\S]*?aria-label=\{t\('detail\.type'\)\}/)
    // 3. Description textarea
    assert.match(detailJsx, /<textarea[\s\S]*?className="omnimux-assets-textarea"/)
    // 4. Citation code
    assert.match(detailJsx, /<code className="omnimux-assets-cite">/)
    // 5. Save Button in footer
    assert.match(detailJsx, /footer=\{[\s\S]*?<Button[\s\S]*?variant="primary"[\s\S]*?\{t\('detail\.save'\)\}/)
  })

  it('completely removes related media file list from asset detail modal', () => {
    assert.doesNotMatch(detailJsx, /<aside\b/)
    assert.doesNotMatch(detailJsx, /TopFileList/)
    assert.doesNotMatch(detailJsx, /FolderBrowse/)
    assert.doesNotMatch(detailJsx, /t\('detail\.files'\)/)
  })

  it('removes persistent sidebar from AssetsBody and wires modal dialog in AssetsDialogs', () => {
    // 1. AssetsBody does not render persistent AssetDetail sidebar
    const bodyFn = stageJsx.slice(
      stageJsx.indexOf('function AssetsBody'),
      stageJsx.indexOf('function AddAssetDialogItem'),
    )
    assert.doesNotMatch(bodyFn, /<AssetDetail/)

    // 2. AssetsDialogs renders AssetDetail modal conditionally
    const dialogsFn = stageJsx.slice(
      stageJsx.indexOf('function AssetsDialogs'),
      stageJsx.indexOf('export function AssetsStage'),
    )
    assert.match(dialogsFn, /detailModalOpen\s*&&\s*feed\.detail/)
    assert.match(dialogsFn, /<AssetDetail[\s\S]*?asset=\{feed\.detail\}/)
  })
})
