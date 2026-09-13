import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { STYLES } from './styles.js'
import { zh, en } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))
const modalJsx = readFileSync(join(here, 'ConnectModal.jsx'), 'utf8')
const iconsJsx = readFileSync(join(here, 'icons.jsx'), 'utf8')

describe('ConnectModal UI & Geometry Contract', () => {
  it('consumes PlatformBrandIcon, ArrowRightIcon and ShieldCheckIcon', () => {
    assert.match(modalJsx, /PlatformBrandIcon/)
    assert.match(modalJsx, /ArrowRightIcon/)
    assert.match(modalJsx, /ShieldCheckIcon/)
    assert.doesNotMatch(modalJsx, /PlatformChip/, 'PlatformChip should be replaced by official brand icon')
  })

  it('renders dual-column platform grid and row-oriented cards in styles.js', () => {
    assert.match(STYLES, /\.omnimux-accounts-platform-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/)
    assert.match(STYLES, /\.omnimux-accounts-platform-btn\s*\{[^}]*flex-direction:\s*row;/)
    assert.match(STYLES, /\.omnimux-accounts-brand-icon\s*\{[^}]*width:\s*42px;/)
    assert.match(STYLES, /\.omnimux-accounts-brand-icon\s*\{[^}]*height:\s*42px;/)
    assert.match(STYLES, /\.omnimux-accounts-modal-security\s*\{/)
  })

  it('defines subtitles and platform descriptions across Chinese and English locales', () => {
    assert.ok(zh['connect.subtitle'])
    assert.ok(en['connect.subtitle'])
    assert.ok(zh['connect.securityTip'])
    assert.ok(en['connect.securityTip'])

    const platforms = ['tiktok', 'instagram', 'youtube', 'x', 'facebook']
    for (const p of platforms) {
      assert.ok(zh[`platform.desc.${p}`], `missing zh platform.desc.${p}`)
      assert.ok(en[`platform.desc.${p}`], `missing en platform.desc.${p}`)
    }
  })

  it('exports PlatformBrandIcon, ArrowRightIcon and ShieldCheckIcon in icons.jsx', () => {
    assert.match(iconsJsx, /export function PlatformBrandIcon/)
    assert.match(iconsJsx, /export function ArrowRightIcon/)
    assert.match(iconsJsx, /export function ShieldCheckIcon/)
    assert.match(iconsJsx, /export function PlusIcon/)
  })
})
