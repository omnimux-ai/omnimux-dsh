import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HUB_CSS } from './styles.js'

describe('hide-permission-select in composer', () => {
  it('HUB_CSS contains rules to hide the permission preset selector in input bar', () => {
    assert.match(
      HUB_CSS,
      /button\[aria-label\*="访问模式"\]/,
      'HUB_CSS should hide button by aria-label 访问模式',
    )
    assert.match(
      HUB_CSS,
      /button\[aria-label\*="Access mode"\]/,
      'HUB_CSS should hide button by aria-label Access mode',
    )
    assert.match(
      HUB_CSS,
      /\[data-composer-card\]/,
      'HUB_CSS selector should be scoped under data-composer-card',
    )
    assert.match(
      HUB_CSS,
      /display:\s*none\s*!important/,
      'HUB_CSS should use display: none !important',
    )
  })

  it('HUB_CSS contains defensive rules to hide ContextMeter token usage progress ring in composer', () => {
    assert.match(
      HUB_CSS,
      /button\[aria-label\*="上下文已用"\]/,
      'HUB_CSS should hide button by aria-label 上下文已用',
    )
    assert.match(
      HUB_CSS,
      /button\[aria-label\*="context used"\]/,
      'HUB_CSS should hide button by aria-label context used',
    )
    assert.match(
      HUB_CSS,
      /\.JdJrwG_root/,
      'HUB_CSS should include ContextMeter class selector .JdJrwG_root',
    )
  })
})
