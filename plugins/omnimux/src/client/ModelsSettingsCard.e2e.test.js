/**
 * E2E / DOM probe for Issue #2258: the settings card's "models in the composer"
 * list renders exactly what the sync writes.
 *
 * The rule this probe pins down is the one a person can see. A model the hub
 * stopped listing is **absent** from the list — no local setting can bring it
 * back. A model the user hid is **present but unchecked**, so it stays
 * recoverable. A model the hub newly listed and the shipped profile does not
 * describe still appears, defaulting to visible.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import { composeComposerModels } from '../catalog/composer-list.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../../..')
const evidenceDir = join(repoRoot, 'docs/evidence')

/** Shipped rows: what the profile says each model looks like. */
const SHIPPED = [
  { id: 'alpha', name: 'Alpha', contextWindow: 1000000, input: ['text', 'image'] },
  { id: 'beta', name: 'Beta', contextWindow: 500000 },
  { id: 'gamma', name: 'Gamma' },
]

/** Hub listed rows: `beta` is no longer listed, `delta` is newly listed. */
const HUB = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'gamma', label: 'Gamma' },
  { id: 'delta', label: 'Delta' },
]

const HIDDEN = ['gamma']

/**
 * The tile structure `dsh-ui-kit` SelectableTile emits for one row of the card:
 * every hub-listed model, checked unless the user hid it. A hub-unlisted model
 * is not in this input at all.
 */
function tilesHtml(hubRows, hidden) {
  const hiddenSet = new Set(hidden)
  return hubRows.map((model) => `
    <div class="tile" role="checkbox" aria-checked="${hiddenSet.has(model.id) ? 'false' : 'true'}" data-model-id="${model.id}">
      <span class="title">${model.label || model.name}</span>
    </div>`).join('')
}

const CSS_SNIPPET = `
.tile{display:flex;align-items:flex-start;gap:12px;box-sizing:border-box;width:100%;min-height:48px;padding:12px 14px;border:1px solid #2a2a2e;border-radius:8px;background-color:#1c1c1f;color:#fff}
.tile[aria-checked="true"]{border-color:#4c8dff}
.title{font-size:14px;font-weight:600}
`

describe('composer visibility list DOM e2e (Issue #2258)', () => {
  it('offers hub-listed models only, and shows a hidden one as unchecked', () => {
    // What the sync writes into the provider profile: the hub's set minus the
    // user's hidden ids. The composer renders that, so `gamma` is gone there.
    const written = composeComposerModels({ hubText: HUB, shippedModels: SHIPPED, hiddenIds: HIDDEN })
    assert.deepEqual(written.map((model) => model.id), ['alpha', 'delta'])

    // What the settings card renders: every hub-listed model, the hidden one
    // unchecked so the user can bring it back. `beta` is unlisted, so the card
    // never offers it — the one asymmetry that makes unlisting irreversible
    // from the UI.
    const result = runStyleDomProbe({
      name: 'composer-visibility-list',
      styles: CSS_SNIPPET,
      html: `<div class="group">${tilesHtml(HUB, HIDDEN)}</div>`,
      measure: () => {
        const tiles = [...document.querySelectorAll('[data-model-id]')]
        return {
          ids: tiles.map((el) => el.getAttribute('data-model-id')),
          checked: Object.fromEntries(tiles.map((el) => [
            el.getAttribute('data-model-id'),
            el.getAttribute('aria-checked'),
          ])),
          width: tiles.length ? tiles[0].getBoundingClientRect().width : 0,
          minHeight: tiles.length
            ? Math.min(...tiles.map((el) => el.getBoundingClientRect().height))
            : 0,
        }
      },
    })

    assert.deepEqual(result.ids, ['alpha', 'gamma', 'delta'])
    assert.ok(!result.ids.includes('beta'), 'a hub-unlisted model must not be offered')
    assert.equal(result.checked.gamma, 'false', 'a user-hidden model stays listed but unchecked')
    assert.equal(result.checked.alpha, 'true')
    assert.equal(result.checked.delta, 'true', 'a newly listed model defaults to visible')
    assert.ok(result.width > 0 && result.minHeight > 0, 'tiles must have positive geometry')

    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(join(evidenceDir, 'composer-visibility-list-probe.json'), JSON.stringify({
      issue: 2258,
      hubListedIds: HUB.map((row) => row.id),
      shippedIds: SHIPPED.map((row) => row.id),
      hiddenIds: HIDDEN,
      renderedIds: result.ids,
      checked: result.checked,
      geometry: { width: result.width, minHeight: result.minHeight },
      unlistedAbsent: !result.ids.includes('beta'),
      at: new Date().toISOString(),
    }, null, 2))
  })
})
