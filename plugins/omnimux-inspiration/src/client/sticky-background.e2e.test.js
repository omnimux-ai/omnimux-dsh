import test from 'node:test'
import assert from 'node:assert/strict'
import { INSPIRATION_CSS } from './styles.js'
import { runStyleDomProbe } from '../../../../scripts/test-fixtures/style-dom-probe.mjs'

test('sticky navigation keeps an opaque default and honors both theme layers', () => {
  const result = runStyleDomProbe({
    name: 'inspiration-sticky-background-3328',
    styles: INSPIRATION_CSS,
    html: '<div id="scroll" style="height:160px;overflow:auto;position:relative"><div id="sticky" class="omx-stage-sticky" style="height:48px">Navigation</div><div style="height:600px;background:rgb(236,36,88)">Content</div></div>',
    measure: () => {
      const bar = document.getElementById('sticky')
      const scroll = document.getElementById('scroll')
      const fallback = getComputedStyle(bar).backgroundColor
      scroll.scrollTop = 120
      const pinned = Math.abs(bar.getBoundingClientRect().top - scroll.getBoundingClientRect().top) < 1
      document.documentElement.style.setProperty('--dsw-bg', 'rgb(48,52,59)')
      const legacy = getComputedStyle(bar).backgroundColor
      document.documentElement.style.setProperty('--dsw-alias-bg-base', 'rgb(244,243,241)')
      const alias = getComputedStyle(bar).backgroundColor
      return { fallback, legacy, alias, pinned, position: getComputedStyle(bar).position, zIndex: getComputedStyle(bar).zIndex }
    },
  })
  assert.equal(result.fallback, 'rgb(17, 18, 21)')
  assert.equal(result.legacy, 'rgb(48, 52, 59)')
  assert.equal(result.alias, 'rgb(244, 243, 241)')
  assert.equal(result.pinned, true)
  assert.equal(result.position, 'sticky')
  assert.equal(result.zIndex, '20')
})
