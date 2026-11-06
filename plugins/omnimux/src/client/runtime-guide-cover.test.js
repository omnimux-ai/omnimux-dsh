import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HUB_CSS } from './styles.js'

/** Extract one top-level rule body by its exact selector. */
function ruleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = HUB_CSS.match(new RegExp(`(?:^|\\n)${escaped} \\{([\\s\\S]*?)\\n\\}`))
  return match ? match[1] : ''
}

describe('first-run runtime guide cover', () => {
  it('paints the deep-sea poster instead of a flat gradient placeholder', () => {
    const art = ruleBody('.omnimux-runtime-guide-art')
    assert.match(art, /images\.unsplash\.com/, 'must keep the photo layer')
    assert.match(art, /data:image\/svg\+xml/, 'must keep the offline sea fallback')
    assert.match(art, /position:\s*relative/)
    assert.match(art, /overflow:\s*hidden/)
  })

  it('keeps the jellyfish as its own layer above the photo', () => {
    const jellyfish = ruleBody('.omnimux-runtime-guide-art::before')
    assert.match(jellyfish, /data:image\/svg\+xml/, 'must reuse the locked jellyfish artwork')
    assert.match(jellyfish, /background-size:\s*contain/)
  })
})
