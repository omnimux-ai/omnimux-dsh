import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en, zh } from './locales.js'
import { INSPIRATION_CSS } from './styles.js'
import {
  AUTO_ANALYZE_STORAGE_KEY,
  readAutoAnalyzePreference,
  writeAutoAnalyzePreference,
} from './import-dialog-prefs.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * @param {string} css
 * @param {string} selector
 */
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  assert.ok(match, `missing selector ${selector}`)
  return match[1]
}

/**
 * @param {string} body
 * @param {string} property
 */
function decl(body, property) {
  const match = body.match(new RegExp(`${property}\\s*:\\s*([^;]+);`))
  assert.ok(match, `missing ${property} in ${body}`)
  return match[1].trim()
}

describe('auto-analyze localStorage preference', () => {
  /** @type {Map<string, string>} */
  let store
  /** @type {Storage | undefined} */
  let previous

  beforeEach(() => {
    store = new Map()
    previous = globalThis.localStorage
    globalThis.localStorage = {
      getItem(key) {
        return store.has(key) ? store.get(key) : null
      },
      setItem(key, value) {
        store.set(String(key), String(value))
      },
      removeItem(key) {
        store.delete(String(key))
      },
      clear() {
        store.clear()
      },
      key() {
        return null
      },
      get length() {
        return store.size
      },
    }
  })

  afterEach(() => {
    if (previous === undefined) {
      delete globalThis.localStorage
    } else {
      globalThis.localStorage = previous
    }
  })

  it('defaults to true when storage is empty', () => {
    assert.equal(readAutoAnalyzePreference(), true)
  })

  it('reads true / false from storage', () => {
    writeAutoAnalyzePreference(false)
    assert.equal(store.get(AUTO_ANALYZE_STORAGE_KEY), 'false')
    assert.equal(readAutoAnalyzePreference(), false)

    writeAutoAnalyzePreference(true)
    assert.equal(store.get(AUTO_ANALYZE_STORAGE_KEY), 'true')
    assert.equal(readAutoAnalyzePreference(), true)
  })

  it('treats "1" as true for legacy values', () => {
    store.set(AUTO_ANALYZE_STORAGE_KEY, '1')
    assert.equal(readAutoAnalyzePreference(), true)
  })

  it('defaults to true when localStorage throws', () => {
    globalThis.localStorage = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
      removeItem() {},
      clear() {},
      key() {
        return null
      },
      get length() {
        return 0
      },
    }
    assert.equal(readAutoAnalyzePreference(), true)
    assert.doesNotThrow(() => { writeAutoAnalyzePreference(false) })
  })
})

describe('import dialog UX locales', () => {
  it('keeps zh/en keys aligned and updates submit / tags toggle copy', () => {
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
    assert.equal(zh['add.submit'], '导入')
    assert.equal(en['add.submit'], 'Import')
    assert.equal(zh['add.tagsToggle'], '+ 添加自定义标签')
    assert.equal(en['add.tagsToggle'], '+ Add custom tags')
    // The label rides the submit button while the POST is in flight, and the
    // dialog closes itself as soon as the background job answers 202 — so it must
    // describe the import, never ask the user to dismiss a dialog that is already
    // closing.
    assert.equal(zh['add.importing'], '导入中…')
    assert.equal(en['add.importing'], 'Importing…')
  })
})

describe('import dialog UX styles', () => {
  it('ships collapsible tags toggle at 32px height with 8px radius', () => {
    const body = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-tags-toggle')
    assert.equal(decl(body, 'min-height'), '32px')
    assert.equal(decl(body, 'border-radius'), '8px')
  })

  it('ships role=switch track geometry matching accounts (36x20 + 16px knob)', () => {
    assert.match(INSPIRATION_CSS, /\.omnimux-inspiration-switch[\s\S]*?width:\s*36px/)
    assert.match(INSPIRATION_CSS, /\.omnimux-inspiration-switch[\s\S]*?height:\s*20px/)
    assert.match(INSPIRATION_CSS, /\.omnimux-inspiration-switch[\s\S]*?border-radius:\s*999px/)

    const knob = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-switch-knob')
    assert.equal(decl(knob, 'width'), '16px')
    assert.equal(decl(knob, 'height'), '16px')
  })
})

describe('import dialog source contracts', () => {
  it('inline dialog uses CollapsibleTagsField + AutoAnalyzeSwitch and no native checkbox', () => {
    for (const file of ['InspirationInlineImportDialog.jsx']) {
      const source = readFileSync(join(here, file), 'utf8')
      assert.match(source, /CollapsibleTagsField/)
      assert.match(source, /AutoAnalyzeSwitch/)
      assert.match(source, /readAutoAnalyzePreference/)
      assert.doesNotMatch(source, /type="checkbox"/)
      assert.doesNotMatch(source, /omnimux-inspiration-check/)
    }
  })

  it('CollapsibleTagsField starts collapsed and toggles aria-expanded', () => {
    const source = readFileSync(join(here, 'import-dialog-controls.jsx'), 'utf8')
    assert.match(source, /useState\(false\)/)
    assert.match(source, /aria-expanded=\{expanded\}/)
    assert.match(source, /setExpanded\(\(prev\) => !prev\)/)
    assert.match(source, /expanded \? \(/)
  })

  it('AutoAnalyzeSwitch exposes role=switch and aria-checked', () => {
    const source = readFileSync(join(here, 'import-dialog-controls.jsx'), 'utf8')
    assert.match(source, /role="switch"/)
    assert.match(source, /aria-checked=\{String\(checked\)\}/)
    assert.match(source, /writeAutoAnalyzePreference/)
  })

  it('persists preference under the required localStorage key', () => {
    const source = readFileSync(join(here, 'import-dialog-prefs.js'), 'utf8')
    assert.match(source, /omnimux_inspiration_auto_analyze/)
    assert.match(source, /localStorage\?\.setItem\(AUTO_ANALYZE_STORAGE_KEY/)
    assert.match(source, /localStorage\?\.getItem\(AUTO_ANALYZE_STORAGE_KEY\)/)
  })
})
