import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HUB_CSS, LOGIN_GATE_JELLY_URI, LOGIN_GATE_SEA_URI } from './styles.js'

/** Extract one top-level rule body by its exact selector. */
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = HUB_CSS.match(new RegExp(`(?:^|\\n)${escaped} \\{([\\s\\S]*?)\\n\\}`))
  return match ? match[1] : ''
}

describe('first-run runtime guide cover', () => {
  it('paints the locked deep-sea poster instead of a flat gradient placeholder', () => {
    const art = ruleBody('.omnimux-runtime-guide-art')
    assert.match(art, /images\.unsplash\.com/, 'must keep the photo layer')
    assert.ok(art.includes(LOGIN_GATE_SEA_URI), 'must reuse the exact locked sea artwork')
    assert.match(art, /background-size:\s*cover/)
    assert.match(art, /background-position:\s*center, center 30%, center/)
    assert.match(art, /position:\s*relative/)
    assert.match(art, /overflow:\s*hidden/)
  })

  it('keeps the jellyfish as its own masked layer above the photo', () => {
    const jellyfish = ruleBody('.omnimux-runtime-guide-art::before')
    assert.ok(jellyfish.includes(LOGIN_GATE_JELLY_URI), 'must reuse the exact locked jellyfish artwork')
    assert.match(jellyfish, /background-size:\s*contain/)
    assert.match(jellyfish, /top:\s*-2%/)
    assert.match(jellyfish, /mask-image:\s*radial-gradient/)
    assert.match(jellyfish, /-webkit-mask-image:\s*radial-gradient/)
  })

  it('keeps the poster tint and vignette overlay', () => {
    const tint = ruleBody('.omnimux-runtime-guide-art::after')
    assert.match(tint, /linear-gradient\(160deg/, 'purple poster tint')
    assert.match(tint, /linear-gradient\(180deg/, 'top/bottom vignette')
    assert.match(tint, /inset:\s*0/)
  })
})
