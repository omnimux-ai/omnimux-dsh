import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  PRODUCT_STAGE_CHROME,
  STAGE_CSS_CLASS_MAP,
  claimProductStage,
  ensureProductStageChrome,
  releaseProductStage,
} from './conversation-box.js'

describe('Stage Mutual Exclusion & Host Chrome Rules', () => {
  /** @type {JSDOM | undefined} */
  let dom
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    HTMLStyleElement: globalThis.HTMLStyleElement,
    Element: globalThis.Element,
    CustomEvent: globalThis.CustomEvent,
  }

  afterEach(() => {
    dom?.window.close()
    dom = undefined
    globalThis.window = previous.window
    globalThis.document = previous.document
    globalThis.HTMLElement = previous.HTMLElement
    globalThis.HTMLStyleElement = previous.HTMLStyleElement
    globalThis.Element = previous.Element
    globalThis.CustomEvent = previous.CustomEvent
  })

  function setup() {
    dom = new JSDOM(`<!doctype html><html><head></head><body>
      <div data-slot="shell.overlay">
        <div class="omnimux-accounts-stage" data-visible="false">Accounts</div>
        <div class="omnimux-analytics-stage" data-visible="false">Analytics</div>
        <div class="omnimux-inspiration-stage" data-visible="false">Inspiration</div>
        <div class="omnimux-assets-stage" data-visible="false">Assets</div>
        <div class="omnimux-products-stage" data-visible="false">Products</div>
        <div class="omnimux-workflow-stage" data-visible="false">Workflow</div>
        <div class="omnimux-publish-stage" data-visible="false">Publish</div>
        <div class="omnimux-clip-stage" data-visible="false">Clip</div>
        <div class="omnimux-apps-stage" data-visible="false">Apps</div>
      </div>
    </body></html>`, { url: 'http://localhost' })
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.HTMLElement = dom.window.HTMLElement
    globalThis.HTMLStyleElement = dom.window.HTMLStyleElement
    globalThis.Element = dom.window.Element
    globalThis.CustomEvent = dom.window.CustomEvent
  }

  it('declares all known first-level product stage classes in STAGE_CSS_CLASS_MAP', () => {
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-accounts'], 'omnimux-accounts-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-assets'], 'omnimux-assets-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-analytics'], 'omnimux-analytics-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-products'], 'omnimux-products-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-inspiration'], 'omnimux-inspiration-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-workflow'], 'omnimux-workflow-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-publish'], 'omnimux-publish-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-clip'], 'omnimux-clip-stage')
    assert.equal(STAGE_CSS_CLASS_MAP['omnimux-apps'], 'omnimux-apps-stage')
    assert.equal(Object.keys(STAGE_CSS_CLASS_MAP).length, 9)
  })

  it('injects host-level mutual exclusion CSS for each stage', () => {
    for (const [id, className] of Object.entries(STAGE_CSS_CLASS_MAP)) {
      const expectedRule = `html[data-dsh-product-stage="${id}"] [data-slot="shell.overlay"] > [class*="-stage"]:not(.${className})`
      assert.ok(
        PRODUCT_STAGE_CHROME.includes(expectedRule),
        `PRODUCT_STAGE_CHROME must contain sibling-scoped mutual exclusion rule for ${id} targeting ${className}`,
      )
    }
  })

  it('scopes mutual exclusion to sibling stage roots, not descendants', () => {
    setup()
    ensureProductStageChrome()

    const chrome = document.getElementById('dsh-product-stage-chrome')?.textContent ?? ''
    assert.match(
      chrome,
      /\[data-slot="shell\.overlay"\] > \[class\*="-stage"\]:not\(\.omnimux-accounts-stage\)/,
      'the active-stage rule must select sibling roots through the overlay slot',
    )
    assert.doesNotMatch(
      chrome,
      /html\[data-dsh-product-stage="omnimux-accounts"\]\s+\[class\*="-stage"\]\s*:not\(\.omnimux-accounts-stage\)/,
      'a descendant-wide selector hides stage headers and bodies inside the active page',
    )
  })

  it('keeps BEM internals and vendored -stage fragments visible when no stage is active', () => {
    setup()
    ensureProductStageChrome()

    const chrome = document.getElementById('dsh-product-stage-chrome')?.textContent ?? ''
    assert.match(
      chrome,
      /html:not\(\[data-dsh-product-stage\]\) \[data-slot="shell\.overlay"\] > \[class\$="-stage"\]\{display:none/,
      'the idle rule must hide only overlay direct children ending in -stage (workbench *-stage roots must stay visible; #344)',
    )
    assert.doesNotMatch(
      chrome,
      /html:not\(\[data-dsh-product-stage\]\) \[class\$="-stage"\]\{display:none/,
      'a document-wide idle rule blanks workbench Tab panels whose roots also end in -stage (#344)',
    )
    assert.doesNotMatch(
      chrome,
      /html:not\(\[data-dsh-product-stage\]\) \[class\*="-stage"\]\{display:none/,
      'a fragment-wide idle rule would hide BEM internals and the vendored OpenReel studio classes (e.g. bg-stage-bg) opened from the canvas tab (#84)',
    )
  })

  it('updates html dataset when claiming and releasing product stage', () => {
    setup()
    ensureProductStageChrome()

    claimProductStage('omnimux-analytics')
    assert.equal(document.documentElement.dataset.dshProductStage, 'omnimux-analytics')

    claimProductStage('omnimux-inspiration')
    assert.equal(document.documentElement.dataset.dshProductStage, 'omnimux-inspiration')

    releaseProductStage('omnimux-inspiration')
    assert.equal(document.documentElement.dataset.dshProductStage, undefined)
  })

  it('never hides better-sidebar or panel-host when omnimux-apps stage is active', () => {
    setup()
    ensureProductStageChrome()

    const chrome = document.getElementById('dsh-product-stage-chrome')?.textContent ?? ''
    assert.match(
      chrome,
      /html\[data-dsh-product-stage\]:not\(\[data-dsh-product-stage="omnimux-apps"\]\)\s+\[data-dsh-better-sidebar\]/,
      'better-sidebar must never be hidden when omnimux-apps is active (apps live in workbench tabs)',
    )
    assert.match(
      chrome,
      /html\[data-dsh-product-stage\]:not\(\[data-dsh-product-stage="omnimux-apps"\]\)\s+\[data-dsh-panel-host\]/,
      'panel-host must never be hidden when omnimux-apps is active (apps live in workbench tabs)',
    )
  })
})
