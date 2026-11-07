/**
 * E2E: 发布资产卡片布局改进（Issue #3961）P0~P1 契约。
 * 覆盖：漏渲染的 exempt 注释清除、Emoji/符号图标清除、封面缩略图+兜底、去重复类型字样、等高。
 * 行为级选图断言见 src/client/card-thumbnail.test.js；真实浏览器断言见 worktree-web-qa 的 publish-cards 场景。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const clientDir = join(here, '../../src/client')
const read = (p) => readFileSync(join(clientDir, p), 'utf8')
const assetCard = read('views/AssetCard.jsx')
const recordsTable = read('views/RecordsTable.jsx')
const styles = read('styles.js')
const icons = read('icons/cards.js')

// 与门禁 scripts/scan-ui-gates.mjs 的 UI04 同口径：Extended_Pictographic + 符号字符集。
const PICTO = /\p{Extended_Pictographic}/u
const SYMBOL_ICON = new RegExp('[' + String.fromCodePoint(0xd7, 0x2715, 0x2191, 0x2193, 0x2197, 0x2198, 0x25b6, 0x23f8, 0x23f9, 0x2713, 0x2714) + ']')
const OLD_IMAGE_TEXT = String.fromCodePoint(0x1f5bc) // 🖼
const OLD_VIDEO_EMOJI = String.fromCodePoint(0x1f3ac) // 🎬
const OLD_MUSIC_EMOJI = String.fromCodePoint(0x1f3b5) // 🎵

describe('publish asset card layout E2E (Issue #3961)', () => {
  it('no exempt-ui04 marker leaks into card source and no emoji icons remain', () => {
    for (const [name, src] of [
      ['AssetCard.jsx', assetCard],
      ['RecordsTable.jsx', recordsTable],
    ]) {
      assert.doesNotMatch(src, /exempt-ui04/, `${name} 仍残留会漏渲染的 exempt-ui04 注释`)
      assert.doesNotMatch(src, PICTO, `${name} 仍使用 Emoji 充当图标`)
      assert.doesNotMatch(src, SYMBOL_ICON, `${name} 仍使用符号字符充当图标`)
    }
  })

  it('cover renders media thumbnail with vector-type fallback and no duplicated type text', () => {
    assert.match(assetCard, /pickThumbnailId\(record\)/)
    assert.match(assetCard, /mediaContentUrl\(thumbId\)/)
    assert.match(assetCard, /omnimux-publish-card-thumb-img/)
    assert.match(assetCard, /onError=\{\(\) => setThumbFailed\(true\)\}/)
    assert.match(assetCard, /<IconVideoType size=\{28\}/)
    assert.match(assetCard, /<IconImageType size=\{28\}/)
    assert.equal(assetCard.includes(OLD_IMAGE_TEXT), false)
    assert.equal(assetCard.includes(OLD_VIDEO_EMOJI), false)
    assert.match(icons, /export function IconImageType/)
    assert.match(icons, /export function IconVideoType/)
    assert.match(icons, /export function IconTikTokMusic/)
  })

  it('tiktok platform badge uses vector music icon instead of emoji in both views', () => {
    assert.match(assetCard, /<IconTikTokMusic size=\{12\}/)
    assert.match(recordsTable, /<IconTikTokMusic size=\{12\}/)
    assert.equal(assetCard.includes(OLD_MUSIC_EMOJI), false)
    assert.equal(recordsTable.includes(OLD_MUSIC_EMOJI), false)
  })

  it('cards are equal height: title reserves two lines and thumbnails cover the 112px box', () => {
    assert.match(styles, /\.omnimux-publish-card-thumb-img \{[^}]*object-fit: cover/s)
    assert.match(styles, /\.omnimux-publish-card-title \{[^}]*min-height: 2\.8em/s)
    assert.match(styles, /\.omnimux-publish-asset-card \{[^}]*height: 100%/s)
  })
})
