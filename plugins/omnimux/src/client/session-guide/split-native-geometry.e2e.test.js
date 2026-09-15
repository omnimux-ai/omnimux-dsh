import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GUIDE_CSS } from './styles.js'

describe('session-guide split native geometry preservation', () => {
  it('resets starter-host composer padding-bottom and margins in split-compact and rightbar modes', () => {
    // 1. Verify split compact removes padding-bottom from starter-host seat
    assert.match(
      GUIDE_CSS,
      /html\[data-omnimux-split-compact\]\s*\[data-omnimux-starter-host\]\s*\[data-composer-seat\][\s\S]*?padding-bottom:\s*0\s*!important/,
      'split compact must clear padding-bottom on seat'
    )

    // 2. Verify composerStack is 100% full width and zero side margins in split compact
    assert.match(
      GUIDE_CSS,
      /html\[data-omnimux-split-compact\]\s*\[data-omnimux-starter-host\]\s*\[class\*="composerStack"\][\s\S]*?width:\s*100%\s*!important/,
      'composerStack must be 100% width'
    )
    assert.match(
      GUIDE_CSS,
      /html\[data-omnimux-split-compact\]\s*\[data-omnimux-starter-host\]\s*\[class\*="composerStack"\][\s\S]*?margin-inline:\s*0\s*!important/,
      'composerStack must clear margin-inline'
    )

    // 3. Verify composerHero padding-bottom is cleared in split compact
    assert.match(
      GUIDE_CSS,
      /html\[data-omnimux-split-compact\]\s*\[data-omnimux-starter-host\]\s*\[class\*="composerHero"\][\s\S]*?padding-bottom:\s*0\s*!important/,
      'composerHero must clear padding-bottom to avoid extra lift'
    )

    // 4. Verify composerCard and heroWorkspaceRow max-width is cleared in split compact
    assert.match(
      GUIDE_CSS,
      /html\[data-omnimux-split-compact\]\s*\[data-omnimux-starter-host\]\s*\[data-composer-card\][\s\S]*?width:\s*100%\s*!important/,
      'composerCard must expand to 100% width'
    )
    assert.match(
      GUIDE_CSS,
      /html\[data-omnimux-split-compact\]\s*\[data-omnimux-starter-host\]\s*\[data-composer-card\][\s\S]*?margin-inline:\s*0\s*!important/,
      'composerCard must clear margin-inline'
    )
  })
})
