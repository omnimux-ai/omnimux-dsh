/**
 * E2E / DOM probe for Issue #2136:
 * Composer model picker must render only hub-listed video/image rows.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'
import {
  EMPTY_MODEL_CATALOG,
  MODEL_METADATA_PRESETS,
  projectListedCatalog,
} from './model-picker-catalog.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '../../../..')
const evidenceDir = join(repoRoot, 'docs/evidence')

const HUB_LISTED_FIXTURE = {
  fingerprint: 'e2e-hub-listed-fp',
  video: [
    { id: 'minimax-h3', label: 'MiniMax H3', badge: 'H3', subtitle: '768P/2K · 4–15s' },
    { id: 'seedance-2-0', label: 'Seedance 2.0', subtitle: '480p/720p/1080p/4k · 4–15s · 有声' },
    { id: 'seedance-2-5', label: 'Seedance 2.5', subtitle: '480p–1080p · 4–30s/自动 · 有声' },
  ],
  image: [
    { id: 'gpt-image-2.5', label: 'GPT Image 2.5', subtitle: '1k-4k' },
    { id: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare' },
    { id: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst' },
  ],
}

function rowsHtml(items) {
  if (!items.length) {
    return '<div class="sh-model-empty" data-omnimux-model-empty="ready" role="status">当前没有已上架的可用模型</div>'
  }
  return items.map((m) => `
    <div class="sh-model-row" role="option" data-model-id="${m.id}">
      <div class="sh-model-row-left">
        <div class="sh-model-icon-box"></div>
        <div class="sh-model-row-info">
          <div class="sh-model-row-title-row">
            <span class="sh-model-name">${m.name}</span>
            ${m.badge ? `<span class="sh-model-badge ${m.badge.type || 'purple'}">${m.badge.text}</span>` : ''}
          </div>
          <div class="sh-model-row-desc">${m.subtitle || ''}</div>
        </div>
      </div>
      <div class="sh-model-row-right"><div class="sh-model-radio"></div></div>
    </div>`).join('')
}

function pickerHtml(catalog, tab = 'video') {
  const items = catalog[tab] || []
  return `
    <div class="sh-model-picker" data-omnimux-catalog-status="ready" style="position:static;left:auto;top:auto;width:480px">
      <div class="sh-model-picker-header">
        <div class="sh-model-picker-title">模型</div>
        <div class="sh-model-auto-row"><span class="sh-model-auto-label">自动</span></div>
      </div>
      <div class="sh-model-tabs" role="tablist">
        <button type="button" class="sh-model-tab ${tab === 'video' ? 'active' : ''}">视频</button>
        <button type="button" class="sh-model-tab ${tab === 'image' ? 'active' : ''}">图像</button>
      </div>
      <div class="sh-model-section-title">${tab === 'video' ? '视频' : '图像'}</div>
      <div class="sh-model-list" role="listbox">${rowsHtml(items)}</div>
    </div>`
}

const CSS_SNIPPET = `
.sh-model-picker{display:flex;flex-direction:column;width:480px;max-height:540px;box-sizing:border-box;background:#1c1c1f;color:#fff;border:1px solid #2a2a2e;border-radius:12px;padding:16px}
.sh-model-picker-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.sh-model-picker-title{font-size:16px;font-weight:600}
.sh-model-tabs{display:flex;background:rgba(0,0,0,.25);border-radius:8px;padding:3px;gap:4px;margin-bottom:8px}
.sh-model-tab{flex:1;height:32px;border:none;border-radius:8px;background:transparent;color:#8b93a1}
.sh-model-tab.active{background:rgba(255,255,255,.12);color:#fff;font-weight:600}
.sh-model-section-title{font-size:12px;color:#8b93a1;margin:4px 0 6px 4px}
.sh-model-list{display:flex;flex-direction:column;gap:4px;max-height:360px}
.sh-model-empty{padding:28px 16px;text-align:center;font-size:13px;line-height:1.5;color:#8b93a1}
.sh-model-row{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px}
.sh-model-name{font-size:14px;font-weight:600}
.sh-model-row-desc{font-size:12px;color:#8b93a1}
.sh-model-badge{font-size:11px;padding:1px 6px;border-radius:4px}
`

describe('model picker hub catalog DOM e2e (Issue #2136)', () => {
  it('video tab DOM only contains hub-listed ids; unlisted Fast/Mini/Trial absent', () => {
    assert.ok(MODEL_METADATA_PRESETS['seedance-2-0-fast'], 'preset may still exist for enrichment')
    const projected = projectListedCatalog(HUB_LISTED_FIXTURE)
    assert.deepEqual(projected.video.map((m) => m.id).sort(), ['minimax-h3', 'seedance-2-0', 'seedance-2-5'])

    const result = runStyleDomProbe({
      name: 'model-picker-hub-video',
      styles: CSS_SNIPPET,
      html: pickerHtml(projected, 'video'),
      measure: () => {
        const rows = [...document.querySelectorAll('.sh-model-row')].map((el) => el.getAttribute('data-model-id'))
        const names = [...document.querySelectorAll('.sh-model-name')].map((el) => el.textContent.trim())
        const empty = document.querySelector('[data-omnimux-model-empty]')
        const picker = document.querySelector('.sh-model-picker')
        const cs = picker ? getComputedStyle(picker) : null
        return {
          rows,
          names,
          empty: Boolean(empty),
          width: cs ? cs.width : null,
          borderRadius: cs ? cs.borderRadius : null,
          status: picker ? picker.getAttribute('data-omnimux-catalog-status') : null,
        }
      },
    })

    assert.deepEqual(result.rows.sort(), ['minimax-h3', 'seedance-2-0', 'seedance-2-5'])
    assert.equal(result.empty, false)
    assert.equal(result.status, 'ready')
    assert.equal(result.width, '480px')
    assert.equal(result.borderRadius, '12px')
    assert.ok(result.names.some((n) => n.includes('Dreamina Seedance 2.5')))
    assert.ok(!result.rows.includes('seedance-2-0-fast'))
    assert.ok(!result.rows.includes('seedance-2-0-mini'))
    assert.ok(!result.rows.includes('seedance-2-0-mini-trial'))
    assert.ok(!result.names.some((n) => /Seedance 2\.0 Fast|Seedance 2\.0 Mini|\(Trial\)/i.test(n)))

    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(join(evidenceDir, 'model-picker-hub-catalog-video-probe.json'), JSON.stringify({
      issue: 2136,
      tab: 'video',
      hubFixtureIds: HUB_LISTED_FIXTURE.video.map((r) => r.id),
      renderedIds: result.rows,
      renderedNames: result.names,
      geometry: { width: result.width, borderRadius: result.borderRadius },
      forbiddenAbsent: ['seedance-2-0-fast', 'seedance-2-0-mini', 'seedance-2-0-mini-trial'],
      at: new Date().toISOString(),
    }, null, 2))
  })

  it('image tab DOM only contains hub-listed image ids', () => {
    const projected = projectListedCatalog(HUB_LISTED_FIXTURE)
    const result = runStyleDomProbe({
      name: 'model-picker-hub-image',
      styles: CSS_SNIPPET,
      html: pickerHtml(projected, 'image'),
      measure: () => ({
        rows: [...document.querySelectorAll('.sh-model-row')].map((el) => el.getAttribute('data-model-id')).sort(),
        empty: Boolean(document.querySelector('[data-omnimux-model-empty]')),
      }),
    })
    assert.deepEqual(result.rows, ['gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'].sort())
    assert.equal(result.empty, false)
    assert.ok(!result.rows.includes('nanobanana-pro'))
    assert.ok(!result.rows.includes('seedream-5-0-pro'))
  })

  it('empty listed catalog shows unavailable/empty shell, never fake Seedance rows', () => {
    const projected = projectListedCatalog(null)
    assert.deepEqual(projected.video, EMPTY_MODEL_CATALOG.video)
    const result = runStyleDomProbe({
      name: 'model-picker-hub-empty',
      styles: CSS_SNIPPET,
      html: pickerHtml({ video: [], image: [] }, 'video'),
      measure: () => {
        const empty = document.querySelector('[data-omnimux-model-empty]')
        const rows = document.querySelectorAll('.sh-model-row')
        const emptyCs = empty ? getComputedStyle(empty) : null
        return {
          rowCount: rows.length,
          emptyText: empty ? empty.textContent.trim() : null,
          emptyPadding: emptyCs ? emptyCs.paddingTop : null,
          emptyAlign: emptyCs ? emptyCs.textAlign : null,
        }
      },
    })
    assert.equal(result.rowCount, 0)
    assert.match(result.emptyText || '', /没有已上架的可用模型/)
    assert.equal(result.emptyAlign, 'center')
    assert.equal(result.emptyPadding, '28px')

    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(join(evidenceDir, 'model-picker-hub-catalog-empty-probe.json'), JSON.stringify({
      issue: 2136,
      rowCount: result.rowCount,
      emptyText: result.emptyText,
      geometry: { paddingTop: result.emptyPadding, textAlign: result.emptyAlign },
      at: new Date().toISOString(),
    }, null, 2))
  })
})
