import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runStyleDomProbe } from '../../../../../../scripts/test-fixtures/style-dom-probe.mjs'

const source = readFileSync(new URL('./InspirationPicker.jsx', import.meta.url), 'utf8')
const start = source.indexOf('const CSS = `') + 'const CSS = `'.length
const styles = source.slice(start, source.indexOf('`', start))

const portrait = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="100%" height="100%" fill="#285a9a"/></svg>')
const landscape = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#9a5a28"/></svg>')

const html = `
<div style="width:1040px;padding:24px;background:#3a3a3a">
  <div class="omx-inspiration-pick__grid">
    <article class="omx-inspiration-pick-card" data-selected="false" id="portrait" tabindex="0">
      <div class="omx-inspiration-pick-card__thumb" data-ratio="ready">
        <span class="omx-inspiration-pick-card__check" data-selected="false"></span>
        <img class="omx-inspiration-pick-card__img" src="${portrait}" alt="">
      </div>
      <div class="omx-inspiration-pick-card__title">竖版封面作品</div>
    </article>
    <article class="omx-inspiration-pick-card" data-selected="false" id="landscape">
      <div class="omx-inspiration-pick-card__thumb" data-ratio="ready">
        <span class="omx-inspiration-pick-card__check" data-selected="false"></span>
        <img class="omx-inspiration-pick-card__img" src="${landscape}" alt="">
      </div>
      <div class="omx-inspiration-pick-card__title">横版封面作品</div>
    </article>
    <article class="omx-inspiration-pick-card" data-selected="true" id="empty">
      <div class="omx-inspiration-pick-card__thumb" data-ratio="ready">
        <span class="omx-inspiration-pick-card__check" data-selected="true"></span>
        <div class="omx-inspiration-pick-card__placeholder"><span>没</span></div>
        <span class="omx-inspiration-pick-card__already">已在会话中</span>
      </div>
      <div class="omx-inspiration-pick-card__title">没有封面的作品</div>
    </article>
  </div>
</div>`

function measure() {
  const read = (id) => {
    const card = document.getElementById(id)
    const thumb = card.querySelector('.omx-inspiration-pick-card__thumb')
    const box = thumb.getBoundingClientRect()
    const check = card.querySelector('.omx-inspiration-pick-card__check')
    return {
      badge: Boolean(card.querySelector('.omx-inspiration-pick-card__badge')),
      width: Math.round(box.width),
      height: Math.round(box.height),
      check: getComputedStyle(check).display,
    }
  }
  const portrait = read('portrait')
  document.getElementById('portrait').focus()
  const focused = read('portrait')
  return { portrait, landscape: read('landscape'), empty: read('empty'), focused }
}

test('灵感选择卡片按封面比例显示，勾选框只在悬停或已选时出现', () => {
  const result = runStyleDomProbe({
    name: 'inspiration-picker-card',
    styles,
    html,
    measure,
  })
  assert.equal(result.portrait.badge, false)
  assert.equal(result.landscape.badge, false)
  assert.equal(result.empty.badge, false)
  assert.ok(result.portrait.height > result.portrait.width, '竖版封面应高于宽度')
  assert.ok(result.landscape.width > result.landscape.height, '横版封面应宽于高度')
  assert.equal(result.empty.width, result.empty.height)
  assert.equal(result.portrait.check, 'none')
  assert.equal(result.landscape.check, 'none')
  assert.equal(result.empty.check, 'flex')
  assert.equal(result.focused.check, 'flex')
})
