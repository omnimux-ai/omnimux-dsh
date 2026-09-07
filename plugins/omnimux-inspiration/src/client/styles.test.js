import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { INSPIRATION_CSS } from './styles.js'
import { en, zh } from './locales.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Pull one CSS rule body (inner declarations only) for an exact selector.
 * @param {string} css
 * @param {string} selector
 */
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  assert.ok(match, `missing selector ${selector}`)
  return match[1]
}

/**
 * @param {string} body
 * @param {string} property
 */
function decl(body, property) {
  const match = body.match(new RegExp(`${property}\\s*:\\s*([^;]+);`))
  assert.ok(match, `missing ${property} in ${body}`)
  return match[1].trim()
}

describe('inspiration triptych modal', () => {
  it('balances the desktop triptych while keeping independently scrolling panels', () => {
    const body = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-body')
    assert.match(decl(body, 'display'), /grid/)
    const columns = decl(body, 'grid-template-columns').split(/\s+(?=minmax)/)
    assert.equal(columns.length, 3)
    assert.match(columns[0], /^minmax\(300px, 1\.1fr\)$/)
    assert.match(columns[1], /^minmax\(320px, 1\.15fr\)$/)
    assert.equal(columns[0], columns[2])
    const panel = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-panel')
    assert.equal(decl(panel, 'min-width'), '0')
    assert.equal(decl(panel, 'overflow-y'), 'auto')
    assert.equal(decl(panel, 'overflow-x'), 'hidden')
  })

  it('keeps the footer focused on a stable one-line replication action', () => {
    const section = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    const footer = section.slice(
      section.indexOf('<footer className="omnimux-inspiration-modal-footer">'),
      section.indexOf('</footer>'),
    )
    const footerCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-footer')
    const replicateCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-footer .omnimux-inspiration-modal-replicate')
    assert.match(section, /modal\.deconstruction\.analyze/)
    assert.match(footer, /onReplicate\(data\.safeItem\)/)
    assert.match(footer, /omnimux-inspiration-modal-replicate/)
    assert.doesNotMatch(footer, /footer-meta|footer-stats|data\.publishedAt|data\.createdAt|Object\.keys\(data\.stats\)/)
    assert.equal(decl(footerCss, 'justify-content'), 'flex-end')
    assert.equal(decl(replicateCss, 'height'), '32px')
    assert.equal(decl(replicateCss, 'white-space'), 'nowrap')
    assert.match(INSPIRATION_CSS, /padding: 10px;\s*margin-bottom: 8px/)
  })

  it('provides narrow-screen tabs without horizontal overflow', () => {
    assert.match(INSPIRATION_CSS, /@media \(max-width: 860px\)/)
    assert.match(INSPIRATION_CSS, /modal-mobile-tabs/)
    assert.match(INSPIRATION_CSS, /\.omnimux-inspiration-modal-panel\.is-active/)
  })

  it('fills the video panel width with an uncapped 9:16 preview and compact title-only header', () => {
    const player = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-player-box')
    assert.equal(decl(player, 'width'), '100%')
    assert.equal(decl(player, 'aspect-ratio'), '9 / 16')
    assert.equal(decl(player, 'margin'), '0 0 14px')
    assert.doesNotMatch(player, /max-height/)
    assert.equal(decl(player, 'display'), 'flex')
    const media = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-player-frame,\n.omnimux-inspiration-modal-cover-bg')
    assert.equal(decl(media, 'object-fit'), 'contain')
    const header = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-header')
    const heading = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-heading')
    assert.equal(decl(header, 'height'), '60px')
    assert.equal(decl(header, 'flex-wrap'), 'nowrap')
    assert.equal(decl(heading, 'max-width'), 'min(520px, calc(100% - 40px))')
    assert.match(INSPIRATION_CSS, /modal-copy\.is-icon-only/)
  })

  it('removes platform, favorite, and re-analyze controls from the modal header', () => {
    const section = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    const header = section.slice(
      section.indexOf('<header className="omnimux-inspiration-modal-header">'),
      section.indexOf('</header>'),
    )
    assert.doesNotMatch(header, /modal\.header\.favorite/)
    assert.doesNotMatch(header, /modal\.header\.reanalyze/)
    assert.doesNotMatch(header, /modal-header-meta/)
    assert.doesNotMatch(header, /modal-actions/)
    assert.match(header, /omnimux-inspiration-modal-close/)
  })

  it('supports optional timecode columns and quote blocks without fabricating timestamps', () => {
    const section = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    assert.match(INSPIRATION_CSS, /omnimux-inspiration-modal-script-list\.has-timecode/)
    assert.match(INSPIRATION_CSS, /omnimux-inspiration-modal-dimensions blockquote/)
    assert.match(section, /translateInspiration/)
    assert.match(section, /modal\.script\.translate/)
    assert.doesNotMatch(section, /00:00 hello/)
  })
})

describe('legacy inspiration modal segmented switch', () => {
  it('keeps mobile tabs native and accessible', () => {
    const section = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    assert.match(section, /modal-mobile-tabs[\s\S]*role="tablist"/)
    assert.match(section, /role="tab"/)
    assert.match(section, /<button\s+type="button"/)
  })

  it('keeps the track at 32px with overflow clipping so the inner pill cannot burst', () => {
    const body = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-switch-group')
    assert.equal(decl(body, 'display'), 'inline-flex')
    assert.equal(decl(body, 'height'), '32px')
    assert.equal(decl(body, 'overflow'), 'hidden')
    assert.equal(decl(body, 'border-radius'), '9999px')
    assert.equal(decl(body, 'padding'), '1px')
  })

  it('locks inner tabs to the 28px compact variant inside the track', () => {
    const body = ruleBody(
      INSPIRATION_CSS,
      '.omnimux-inspiration-switch-group > .omnimux-inspiration-switch-btn',
    )
    assert.equal(decl(body, 'height'), '28px')
    assert.equal(decl(body, 'min-height'), '28px')
    assert.equal(decl(body, 'max-height'), '28px')
    assert.equal(decl(body, 'border-radius'), '9999px')
    assert.equal(decl(body, 'border'), 'none')
    assert.equal(decl(body, 'transform'), 'none')
  })

  it('does not use the illegal 26px height that used to overflow the capsule', () => {
    const body = ruleBody(
      INSPIRATION_CSS,
      '.omnimux-inspiration-switch-group > .omnimux-inspiration-switch-btn',
    )
    assert.notEqual(decl(body, 'height'), '26px')
  })

  it.skip('legacy segmented switch was replaced by triptych mobile tabs', () => {
    const section = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    const switchBlock = section.slice(
      section.indexOf('omnimux-inspiration-preview-switch'),
      section.indexOf('omnimux-inspiration-preview-player'),
    )
    assert.match(switchBlock, /role="tablist"/)
    assert.match(switchBlock, /role="tab"/)
    assert.match(switchBlock, /<button\s+type="button"/)
    assert.doesNotMatch(switchBlock, /<Button[\s\S]*omnimux-inspiration-switch-btn/)
  })

  it.skip('legacy switch glyph contract was replaced by triptych mobile tabs', () => {
    const section = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    const switchBlock = section.slice(
      section.indexOf('omnimux-inspiration-preview-switch'),
      section.indexOf('omnimux-inspiration-preview-player'),
    )
    assert.doesNotMatch(switchBlock, /polyline points="2 17"/)
    assert.doesNotMatch(switchBlock, /polygon points="12 2/)
    assert.doesNotMatch(switchBlock, /strokeWidth="2"/)
    assert.doesNotMatch(switchBlock, /width="13"/)
    assert.match(switchBlock, /width="16"/)
    assert.match(switchBlock, /d="M2 5 8 2\.2 14 5"/)
    const svgRule = ruleBody(
      INSPIRATION_CSS,
      '.omnimux-inspiration-switch-group > .omnimux-inspiration-switch-btn svg',
    )
    assert.equal(decl(svgRule, 'width'), '16px')
    assert.equal(decl(svgRule, 'height'), '16px')
  })
})

describe('locale dictionaries', () => {
  it('keeps zh/en key sets aligned including the switch aria-label', () => {
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
    assert.ok(zh['view.switch'] && en['view.switch'])
    assert.equal(zh['view.player'], '作品')
    assert.equal(zh['view.deconstruct'], '作品解析')
    assert.equal(zh['card.cta.try'], '一键复刻')
    assert.equal(zh['card.cta.tryFull'], '一键复刻')
    assert.equal(zh['card.cta.detail'], '查看')
    assert.equal(en['card.cta.try'], 'Replicate')
    assert.equal(en['card.cta.tryFull'], 'One-click replicate')
    assert.equal(zh['card.cta.noSession'], '请先新建或打开一个会话')
    assert.doesNotMatch(zh['card.cta.try'], /加会话/)
    assert.doesNotMatch(en['card.cta.try'], /Add to chat/)
    assert.doesNotMatch(zh['card.cta.addToConversation'], /添加到会话/)
  })
})

describe('hover overlay CTA', () => {
  it('lets the CTA row receive pointer events and uses 28px / pill geometry', () => {
    const row = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-overlay-cta')
    assert.equal(decl(row, 'pointer-events'), 'auto')
    assert.equal(decl(row, 'width'), '100%')
    assert.equal(decl(row, 'gap'), '6px')
    assert.equal(decl(row, 'flex-wrap'), 'nowrap')
    const btn = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-overlay-cta-btn')
    assert.equal(decl(btn, 'flex'), '1 1 0')
    assert.equal(decl(btn, 'height'), '28px')
    assert.equal(decl(btn, 'padding'), '0 6px')
    assert.equal(decl(btn, 'border-radius'), '9999px')
    assert.equal(decl(btn, 'font'), '550 12px/16px inherit')
    assert.doesNotMatch(INSPIRATION_CSS, /👁|💬/)
  })

  it('locks CoverCard to onReplicate only with replicate SVG and tryFull aria', () => {
    const cover = readFileSync(join(here, 'InspirationCoverCard.jsx'), 'utf8')
    assert.doesNotMatch(cover, /omnimux:add-to-conversation/)
    assert.doesNotMatch(cover, /clipboard/)
    assert.doesNotMatch(cover, /加会话/)
    assert.doesNotMatch(cover, /添加到会话/)
    assert.match(cover, /ICON_REPLICATE/)
    assert.match(cover, /t\('card\.cta\.tryFull'\)/)
    assert.match(cover, /t\('card\.cta\.try'\)/)
    assert.match(cover, /<rect x="8" y="8"/)
  })
})

describe('one-click replicate source isolation', () => {
  const files = [
    'replicate-to-chat.js',
    'InspirationCoverCard.jsx',
    'InspirationPreviewModal.jsx',
    'use-inspiration-feed.js',
    'InspirationSection.jsx',
  ]

  it('forbids startReplicationProject / waitForWorkflowGlobal / workflow import / runNewProject', () => {
    for (const name of files) {
      const src = readFileSync(join(here, name), 'utf8')
      assert.doesNotMatch(src, /startReplicationProject/, name)
      assert.doesNotMatch(src, /waitForWorkflowGlobal/, name)
      assert.doesNotMatch(src, /omnimux-workflow/, name)
      assert.doesNotMatch(src, /runNewProject/, name)
    }
  })

  it('forbids this-CTA clipboard.writeText on CoverCard / Preview / orchestrator', () => {
    for (const name of ['replicate-to-chat.js', 'InspirationCoverCard.jsx', 'InspirationPreviewModal.jsx']) {
      const src = readFileSync(join(here, name), 'utf8')
      assert.doesNotMatch(src, /clipboard\.writeText/, name)
    }
  })

  it('keeps Preview primary CTA on card.cta.try and does not fallback 添加到会话', () => {
    const preview = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    const section = readFileSync(join(here, 'InspirationSection.jsx'), 'utf8')
    assert.match(preview, /t\('card\.cta\.try'\)/)
    assert.match(preview, /onReplicate/)
    assert.doesNotMatch(preview, /添加到会话/)
    assert.doesNotMatch(preview, /MessageSquarePlus/)
    assert.match(section, /onReplicate=\{handleReplicate\}/)
  })
})
