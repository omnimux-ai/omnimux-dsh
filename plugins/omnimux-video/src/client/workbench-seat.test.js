import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Issue #3165 seat gate — Vids occupies the official `main` slot.
 *
 * The hub product-stage chrome hides every non-overlay child of the conversation
 * column, and `main` slot panels render exactly there. A `main` slot panel that
 * claims a product stage therefore hides itself, which is how「探索 → Google Vids」
 * produced a blank middle column after #2767 moved Vids off `shell.overlay`.
 * This file pins the seat so the claim cannot come back.
 */
describe('omnimux-video workbench seat (main slot must not claim an overlay product stage)', () => {
  it('sidebar entry selects the host panel and never claims or releases a product stage', () => {
    const source = readFileSync(join(here, 'sidebar-entry.js'), 'utf8')
    assert.match(source, /selectPanel\('omnimux-vids'\)/)
    assert.doesNotMatch(source, /claimProductStage/)
    assert.doesNotMatch(source, /__omnimuxStage/)
    assert.doesNotMatch(source, /stage\.claim\(/)
    assert.doesNotMatch(source, /dsh-product-stage/)
  })

  it('stage component closes by clearing the panel selection only', () => {
    const stage = readFileSync(join(here, 'GoogleVidsStage.jsx'), 'utf8')
    assert.match(stage, /selectPanel\(null\)/)
    assert.doesNotMatch(stage, /claimProductStage/)
    assert.doesNotMatch(stage, /__omnimuxStage/)
    assert.doesNotMatch(stage, /dshProductStage/)
  })

  it('manifest registers the main slot and never a betterSidebar tab', () => {
    const manifest = JSON.parse(readFileSync(join(here, '..', '..', 'dsh.manifest.json'), 'utf8'))
    assert.deepEqual(manifest.capabilities.slots, [
      { target: 'main', componentPath: 'src/client/GoogleVidsStage.jsx' },
    ])
  })

  it('the hub product-stage chrome no longer reserves a vids stage class', () => {
    const hubSource = readFileSync(
      join(here, '..', '..', '..', 'omnimux', 'src', 'client', 'conversation-box.js'),
      'utf8',
    )
    assert.doesNotMatch(hubSource, /'omnimux-vids': 'omnimux-vids-stage'/)
    assert.doesNotMatch(hubSource, /data-dsh-product-stage="omnimux-vids"/)
  })
})
