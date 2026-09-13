import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HUB_CSS } from './styles.js'

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

describe('Hub focus ring guard against double-framed kit fields', () => {
  it('keeps the neutral global :focus-visible ring', () => {
    const body = ruleBody(HUB_CSS, ':focus-visible')
    assert.ok(body !== null, 'global :focus-visible rule must stay present')
    assert.match(body, /outline:\s*1px solid var\(--dsw-alias-border-l3\)\s*!important/)
    assert.match(body, /outline-offset:\s*1px/)
  })

  it('exempts native inputs that live inside kit composite controls drawing their own ring', () => {
    const selectors = [
      '[class*="InputField-control"] input:focus',
      '[class*="InputField-control"] input:focus-visible',
      '[class*="SearchField-root"] input:focus',
      '[class*="SearchField-root"] input:focus-visible',
    ]
    for (const selector of selectors) {
      const body = ruleBody(HUB_CSS, selector)
      assert.ok(body !== null, `missing exemption for ${selector}`)
      assert.match(body, /outline:\s*none\s*!important/, `${selector} must suppress the native outline`)
      assert.match(body, /outline-offset:\s*0\s*!important/, `${selector} must reset outline-offset`)
    }
  })

  it('keeps keyboard focus visible through the kit control frame', () => {
    // The exemption only removes the inner outline; dsh-ui-kit still paints the
    // focus ring on the wrapper via :focus-within (border-color + box-shadow).
    assert.match(HUB_CSS, /--dsw-alias-state-business-tertiary:\s*var\(--dsw-alias-bg-layer-2\)/)
  })
})
