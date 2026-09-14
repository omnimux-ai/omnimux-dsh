/**
 * Static contracts for the strategy form UI polish.
 *
 * Case numbers map 1:1 onto `specs/strategy-form-ui-polish.spec.md` §6.1
 * (A1–A7). This plugin has no React DOM renderer, so the structural contracts
 * are asserted against the shipped source; the matching live-layout evidence
 * (spec §6.2 B1–B9) is captured by the real-browser verify run.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en, zh } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(here, name), 'utf8')

const FIELDS_SOURCE = read('ProductStrategyFields.jsx')
const STYLES_SOURCE = read('styles.js')

/** The declaration block of one exact selector, so prefixes never collide. */
function cssBlock(source, selector) {
  const start = source.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `styles.js has no rule for ${selector}`)
  const end = source.indexOf('}', start)
  assert.notEqual(end, -1, `styles.js rule for ${selector} is unterminated`)
  return source.slice(start, end)
}

/** The per-field object literals inside STRATEGY_SECTIONS. */
function fieldDefinitions() {
  const start = FIELDS_SOURCE.indexOf('export const STRATEGY_SECTIONS = [')
  assert.notEqual(start, -1, 'STRATEGY_SECTIONS is gone')
  const end = FIELDS_SOURCE.indexOf('\n]', start)
  assert.notEqual(end, -1, 'STRATEGY_SECTIONS is unterminated')
  return [...FIELDS_SOURCE.slice(start, end).matchAll(/\{[^{}]*\}/g)].map((m) => m[0])
}

describe('strategy form · §6.1 A1–A2 field contract', () => {
  it('A1: the hint pseudo-node and its render branches are gone', () => {
    assert.doesNotMatch(FIELDS_SOURCE, /type:\s*'hint'/)
    assert.doesNotMatch(FIELDS_SOURCE, /hintKey/)
    assert.doesNotMatch(FIELDS_SOURCE, /hintNode/)
  })

  it('A2: every field owns a path, a label source, and a control type', () => {
    const defs = fieldDefinitions()
    assert.equal(defs.length, 14, 'the field table shrank or grew without a contract update')
    for (const def of defs) {
      assert.match(def, /path:\s*'/, `field without a path: ${def}`)
      assert.match(def, /labelKey:\s*'/, `field without a label: ${def}`)
      assert.match(def, /type:\s*'(?:input|list|textarea)'/, `field without a control type: ${def}`)
    }
  })

  it('A2: placeholder survives only where it states a format', () => {
    const withPlaceholder = fieldDefinitions().filter((def) => def.includes('placeholderKey:'))
    assert.equal(withPlaceholder.length, 2, 'the placeholder policy changed')
    assert.match(withPlaceholder.join('\n'), /brand_basic_info\.company\.website/)
    assert.match(withPlaceholder.join('\n'), /brand_basic_info\.company\.locale/)
  })

  it('§3.5: the observed data-testid contract is declared in source', () => {
    for (const attr of [
      'data-testid="strategy-field"',
      'data-field-path={field.path}',
      'data-testid="strategy-field-label"',
      'data-testid="strategy-field-sublabel"',
      'data-testid="strategy-angle-card"',
      'data-angle-index={index}',
      'data-testid="strategy-angle-index"',
      'data-testid="strategy-angle-remove"',
    ]) {
      assert.ok(FIELDS_SOURCE.includes(attr), `missing DOM contract: ${attr}`)
    }
  })

  it('A5: the angle remove control is a vector icon with no character exemption', () => {
    assert.match(FIELDS_SOURCE, /data-testid="strategy-angle-remove"[\s\S]{0,200}?<CloseIcon/)
    assert.match(FIELDS_SOURCE, /aria-label=\{t\('strategy\.removeAngle'\)\}/)
    assert.doesNotMatch(FIELDS_SOURCE, /exempt-ui04/, 'character-icon exemptions must be retired')
    assert.doesNotMatch(FIELDS_SOURCE, /[×✕]/, 'no character icon may remain in this file')
    assert.match(FIELDS_SOURCE, /import \{ CloseIcon \} from '\.\/icons\.jsx'/)
  })
})

describe('strategy form · §6.1 A3–A7 styles and locales', () => {
  it('A3: the angle list stacks its cards at a 10px rhythm', () => {
    assert.match(cssBlock(STYLES_SOURCE, '.omnimux-products-angle-list'), /gap:\s*10px/)
  })

  it('A4: the micro-card is an 8px rounded surface one layer above the form', () => {
    const card = cssBlock(STYLES_SOURCE, '.omnimux-products-angle-card')
    assert.match(card, /border-radius:\s*8px/)
    assert.match(card, /background:\s*var\(--dsw-alias-bg-layer-1\)/)
    assert.match(card, /padding:\s*12px/)
  })

  it('A4: the old full-width angle grid is gone', () => {
    assert.doesNotMatch(STYLES_SOURCE, /\.omnimux-products-angle-row/)
    assert.doesNotMatch(FIELDS_SOURCE, /omnimux-products-angle-row/)
    assert.doesNotMatch(FIELDS_SOURCE, /className="omnimux-products-section"[\s\S]{0,80}strategy-angle-card/)
  })

  it('A7: the persistent label mirrors the kit label metrics exactly', () => {
    const label = cssBlock(STYLES_SOURCE, '.omnimux-products-field-label')
    assert.match(label, /font-size:\s*12px/)
    assert.match(label, /line-height:\s*16px/)
    assert.match(label, /font-weight:\s*500/)
    assert.match(label, /color:\s*var\(--dsw-alias-label-secondary\)/)
    const tag = cssBlock(STYLES_SOURCE, '.omnimux-products-field-tag')
    assert.match(tag, /font-size:\s*12px/)
    assert.match(tag, /color:\s*var\(--dsw-alias-label-tertiary\)/)
  })

  it('A7: every strategy style consumes a semantic token, never a raw colour', () => {
    for (const selector of [
      '.omnimux-products-angle-list',
      '.omnimux-products-angle-card',
      '.omnimux-products-angle-head',
      '.omnimux-products-angle-index',
      '.omnimux-products-field-label',
      '.omnimux-products-field-tag',
    ]) {
      const block = cssBlock(STYLES_SOURCE, selector)
      const declarations = block.replace(/^\s*[^{]*\{/, '')
      assert.doesNotMatch(declarations, /#[0-9a-fA-F]{3,8}\b|\brgba?\(/)
    }
  })

  it('A6: zh and en carry identical key sets', () => {
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  })

  it('A6 / §4: the copy refinement list landed on both sides', () => {
    assert.equal(zh['strategy.listHint'], '每行一项')
    assert.equal(en['strategy.listHint'], 'One per line')
    assert.equal(zh['strategy.companyLocale'], '目标语言')
    assert.equal(en['strategy.companyLocale'], 'Target language')
    assert.equal(zh['strategy.productName'], '战略产品名')
    assert.equal(en['strategy.productName'], 'Product name')
    assert.equal(zh['strategy.solutions'], '核心解决方案（含痛点剖析与解决对策）')
    assert.equal(zh['strategy.dos'], '核心沟通要点')
    assert.equal(zh['strategy.donts'], '品牌禁忌红线')
    assert.equal(zh['strategy.angleIndex'], '角度')
    assert.equal(en['strategy.angleIndex'], 'Angle')
    assert.equal(zh['strategy.removeAngle'], '删除该角度')
    assert.equal(en['strategy.removeAngle'], 'Remove angle')
  })

  it('§4: the keys of the retired fields are gone from both dictionaries', () => {
    for (const key of ['strategy.problems', 'strategy.ownableCategory', 'strategy.ownableNot']) {
      assert.equal(key in zh, false, `${key} still in zh`)
      assert.equal(key in en, false, `${key} still in en`)
    }
  })

  it('§9: the ten-angle ceiling and the write path are unchanged', () => {
    assert.match(FIELDS_SOURCE, /if \(next\.content_angles\.length >= 10\) return/)
    assert.match(FIELDS_SOURCE, /next\.content_angles\[index\]\.priority = Number\(value\)/)
    assert.match(FIELDS_SOURCE, /next\.content_angles\.splice\(index, 1\)/)
  })
})
