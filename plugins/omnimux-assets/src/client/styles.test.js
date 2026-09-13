import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ASSETS_CSS } from './styles.js'

/**
 * Regression guard for the AddAssetDialog "两个框" bug: the asset name field
 * grabbed focus on mount, which made the Hub's global
 * `:focus-visible { outline: ... !important }` (plugins/omnimux/src/client/styles.js)
 * beat dsh-ui-kit's `.dshUk-InputField-input { outline: none }`, painting a square
 * outline inside the rounded `.dshUk-InputField-control` frame.
 */

/**
 * Read the declaration block of the rule containing `selector`, including rules
 * whose selector list groups several selectors onto one block.
 * @param {string} css
 * @param {string} selector
 * @returns {string | null}
 */
function ruleBody(css, selector) {
  const index = css.indexOf(selector)
  if (index === -1) return null
  const open = css.indexOf('{', index)
  const close = css.indexOf('}', open)
  if (open === -1 || close === -1) return null
  return css.slice(open + 1, close)
}

describe('Assets form focus-ring defense (no double border)', () => {
  it('forces outline:none !important on every focused field under .omnimux-assets-form', () => {
    const selectors = [
      '.omnimux-assets-form input:focus',
      '.omnimux-assets-form input:focus-visible',
      '.omnimux-assets-form textarea:focus',
      '.omnimux-assets-form textarea:focus-visible',
      '.omnimux-assets-form select:focus',
      '.omnimux-assets-form select:focus-visible',
    ]
    for (const selector of selectors) {
      const body = ruleBody(ASSETS_CSS, selector)
      assert.ok(body !== null, `missing defense rule for ${selector}`)
      assert.match(body, /outline:\s*none\s*!important/, `${selector} must force outline:none !important`)
      assert.match(body, /outline-offset:\s*0\s*!important/, `${selector} must reset outline-offset`)
      assert.match(body, /box-shadow:\s*none\s*!important/, `${selector} must not inherit a focus box-shadow`)
    }
  })

  it('groups the defense under a scoped selector so it outranks the global :focus-visible', () => {
    // `.omnimux-assets-form input:focus-visible` is (0,2,1) vs the global (0,1,0)
    // `:focus-visible`; with !important on both sides the scoped rule wins.
    const scoped = ASSETS_CSS.match(/\.omnimux-assets-form input:focus-visible/)
    assert.ok(scoped, 'the defense must be scoped to .omnimux-assets-form')
  })

  it('strips native border/outline from inputs wrapped by a kit composite control', () => {
    const selectors = [
      '.omnimux-assets-form [class*="InputField-control"] input',
      '.omnimux-assets-form [class*="SearchField-root"] input',
    ]
    for (const selector of selectors) {
      const body = ruleBody(ASSETS_CSS, selector)
      assert.ok(body !== null, `missing kit-control input defense for ${selector}`)
      assert.match(body, /border:\s*none\s*!important/, `${selector} must not paint a second border`)
      assert.match(body, /outline:\s*none\s*!important/, `${selector} must not paint a native outline`)
      assert.match(body, /box-shadow:\s*none\s*!important/, `${selector} must not paint a native focus shadow`)
    }
  })

  it('keeps the rounded control frame as the only visible field border', () => {
    const row = ruleBody(ASSETS_CSS, '.omnimux-assets-name-row')
    assert.ok(row !== null, 'the name row must stay laid out')
    assert.match(ASSETS_CSS, /\.omnimux-assets-name-field \{ flex: 1; min-width: 0; \}/, 'name field keeps flex sizing')
  })
})
