import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureCss, injectPublishStyles } from './styles.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const composerSrc = readFileSync(join(__dirname, 'Composer/index.jsx'), 'utf8')

/** Minimal document stub so ensureCss can inject once per test. */
function installDocumentStub() {
  /** @type {Map<string, { id: string, textContent: string }>} */
  const byId = new Map()
  /** @type {Array<{ id: string, textContent: string }>} */
  const appended = []
  const head = {
    appendChild(node) {
      appended.push(node)
      if (node.id) byId.set(node.id, node)
      return node
    },
  }
  const documentStub = {
    head,
    getElementById(id) {
      return byId.get(id) || null
    },
    createElement(tag) {
      assert.equal(tag, 'style')
      return { id: '', textContent: '' }
    },
  }
  globalThis.document = documentStub
  return { appended, byId }
}

describe('publish composer type-pick styles (layout regression)', () => {
  /** @type {{ appended: any[], byId: Map<string, any> } | null} */
  let stub = null
  /** @type {unknown} */
  let prevDocument

  beforeEach(() => {
    prevDocument = globalThis.document
    stub = installDocumentStub()
  })

  afterEach(() => {
    if (prevDocument === undefined) delete globalThis.document
    else globalThis.document = prevDocument
    stub = null
  })

  it('injects type-card multi-line layout rules (not 32px Button height)', () => {
    injectPublishStyles()
    assert.equal(stub.appended.length, 1)
    const css = String(stub.appended[0].textContent)
    for (const needle of [
      '.omnimux-publish-type-page',
      '.omnimux-publish-type-pick',
      '.omnimux-publish-type-row',
      '.omnimux-publish-type-card',
      '.omnimux-publish-type-icon',
      '.omnimux-publish-type-name',
      '.omnimux-publish-type-hint',
      'grid-template-columns: repeat(2, minmax(0, 1fr))',
      'min-height: 120px',
      'flex-direction: column',
    ]) {
      assert.match(css, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing CSS: ${needle}`)
    }
    // Must not pin type-card to the 32px control baseline.
    assert.doesNotMatch(css, /\.omnimux-publish-type-card\s*\{[^}]*height:\s*32px/)
  })

  it('injects composer / accounts / form companion rules used after type pick', () => {
    ensureCss()
    const css = String(stub.appended[0].textContent)
    for (const needle of [
      '.omnimux-publish-composer',
      '.omnimux-publish-accounts',
      '.omnimux-publish-form',
      '.omnimux-publish-textarea',
      '.omnimux-publish-thumb',
      '.omnimux-publish-detail-head',
    ]) {
      assert.match(css, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
  })

  it('keeps composer and detail within the positioned stage, below host controls', () => {
    ensureCss()
    const css = String(stub.appended[0].textContent)
    assert.match(css, /\.omnimux-publish-stage\s*\{[^}]*position:\s*relative;/)
    const subscreen = css.match(/\.omnimux-publish-subscreen\s*\{([^}]*)\}/)
    assert.ok(subscreen)
    assert.match(subscreen[1], /position:\s*absolute;/)
    assert.match(subscreen[1], /inset:\s*0;/)
  })

  it('uses defined native tokens for readable account-modal errors', () => {
    ensureCss()
    const css = String(stub.appended[0].textContent)
    const match = css.match(/\.omnimux-publish-accounts-modal-error\s*\{([^}]*)\}/)
    assert.ok(match, 'missing account-modal error style')
    assert.match(match[1], /color:\s*var\(--dsw-alias-label-primary\)/)
    assert.match(match[1], /background:\s*var\(--dsw-alias-interactive-bg-hover-danger\)/)
    assert.match(match[1], /border:\s*1px solid var\(--dsw-alias-state-error-primary\)/)
    assert.doesNotMatch(match[1], /state-error-(text|subtle)(?:\s|,|\))/)
  })

  it('TypeCard consumes a kit action Button rather than a selection role', () => {
    assert.match(composerSrc, /function TypeCard\(/)
    assert.match(composerSrc, /className="omnimux-publish-type-card"/)
    // An action starts the composer; it does not represent a checked choice.
    const match = composerSrc.match(/function TypeCard\([\s\S]*?\n\}/)
    assert.ok(match, 'TypeCard function not found')
    const body = match[0]
    assert.match(body, /<Button[\s\S]*className="omnimux-publish-type-card"/)
    assert.doesNotMatch(body, /selectionType|aria-checked|<SelectableTile/)
    assert.doesNotMatch(body, /<button\b/)
    assert.doesNotMatch(body, /exempt-ui01/)
    assert.doesNotMatch(composerSrc, /exempt-ui01/)
    assert.doesNotMatch(composerSrc, /<button/)
  })
})
