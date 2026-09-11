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

  it('fills the video panel width with a 9:16 preview, floating actions, and compact title-only header', () => {
    const videoPanel = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-video-panel')
    assert.equal(decl(videoPanel, 'display'), 'flex')
    assert.equal(decl(videoPanel, 'flex-direction'), 'column')
    assert.equal(decl(videoPanel, 'align-items'), 'center')
    assert.equal(decl(videoPanel, 'justify-content'), 'center')
    assert.equal(decl(videoPanel, 'padding'), '12px')
    assert.equal(decl(videoPanel, 'height'), '100%')

    const player = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-player-box')
    assert.equal(decl(player, 'width'), '100%')
    assert.equal(decl(player, 'height'), '100%')
    assert.equal(decl(player, 'max-height'), '100%')
    assert.equal(decl(player, 'aspect-ratio'), '9 / 16')
    assert.equal(decl(player, 'margin'), '0')
    assert.equal(decl(player, 'display'), 'flex')

    const actions = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-player-actions')
    assert.equal(decl(actions, 'position'), 'absolute')
    assert.equal(decl(actions, 'top'), '10px')
    assert.equal(decl(actions, 'right'), '10px')
    assert.equal(decl(actions, 'z-index'), '20')
    assert.equal(decl(actions, 'display'), 'flex')
    assert.equal(decl(actions, 'gap'), '6px')
    assert.equal(decl(actions, 'opacity'), '0')
    assert.equal(decl(actions, 'pointer-events'), 'none')

    const actionsHover = ruleBody(
      INSPIRATION_CSS,
      '.omnimux-inspiration-modal-player-box:hover .omnimux-inspiration-player-actions,\n.omnimux-inspiration-modal-player-box:focus-within .omnimux-inspiration-player-actions',
    )
    assert.equal(decl(actionsHover, 'opacity'), '1')
    assert.equal(decl(actionsHover, 'pointer-events'), 'auto')

    const actionCopy = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-player-actions .omnimux-inspiration-modal-copy')
    assert.equal(decl(actionCopy, 'width'), '32px')
    assert.equal(decl(actionCopy, 'height'), '32px')
    assert.equal(decl(actionCopy, 'border-radius'), '6px')
    assert.equal(decl(actionCopy, 'color'), 'var(--dsw-alias-label-primary, #ffffff)')

    const media = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-player-frame,\n.omnimux-inspiration-modal-cover-bg')
    assert.equal(decl(media, 'object-fit'), 'contain')
    const header = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-header')
    const heading = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-heading')
    const headingTitle = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-heading h2')
    const headingCopy = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-heading .omnimux-inspiration-modal-copy')
    assert.equal(decl(header, 'height'), '60px')
    assert.equal(decl(header, 'flex-wrap'), 'nowrap')
    assert.equal(decl(heading, 'max-width'), 'min(520px, calc(100% - 40px))')
    assert.equal(decl(heading, 'flex'), '0 1 auto')
    assert.equal(decl(headingTitle, 'flex'), '0 1 auto')
    assert.equal(decl(headingTitle, 'text-overflow'), 'ellipsis')
    assert.equal(decl(headingCopy, 'flex-shrink'), '0')
    assert.match(INSPIRATION_CSS, /modal-copy\.is-icon-only/)
  })

  it('removes video panel heading and metadata list, adding floating action controls on player', () => {
    const section = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    assert.doesNotMatch(section, /modal\.panel\.video/)
    assert.doesNotMatch(section, /omnimux-inspiration-modal-meta-list/)
    assert.doesNotMatch(section, /omnimux-inspiration-stats-grid/)
    assert.match(section, /omnimux-inspiration-player-actions/)
    assert.match(section, /omnimux-inspiration-player-open-link/)
    assert.match(section, /modal\.meta\.visitLink/)
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
    assert.match(section, /omnimux-inspiration-modal-close/)
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
  it('keeps mobile tabs accessible and powered by dsh-ui-kit Tabs', () => {
    const section = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    assert.match(section, /modal-mobile-tabs/)
    assert.match(section, /<Tabs[\s\S]*items=\{mobileTabs\}/)
    assert.doesNotMatch(section, new RegExp('exempt-' + 'ui01'))
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

describe('preview modal doc style and glass removal', () => {
  it('removes glass blur effect from modal backdrop and gives container solid background', () => {
    const backdrop = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-backdrop')
    assert.equal(decl(backdrop, 'backdrop-filter'), 'none')
    const container = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-container')
    assert.match(decl(container, 'background'), /#121212|#131313|var\(--dsw-alias-bg-module-platform/)
  })

  it('updates copy button labels to 复制 for both script and deconstruction', () => {
    assert.equal(zh['modal.script.copy'], '复制')
    assert.equal(zh['modal.deconstruction.copy'], '复制')
    assert.equal(en['modal.script.copy'], 'Copy')
    assert.equal(en['modal.deconstruction.copy'], 'Copy')
  })

  it('removes breakdown badge from deconstruction panel and renders document layout without accordion fold', () => {
    const preview = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    assert.doesNotMatch(preview, /omnimux-inspiration-status-badge/)
    assert.doesNotMatch(preview, /omnimux-inspiration-modal-fold/)
    assert.doesNotMatch(preview, /omnimux-inspiration-modal-chevron/)
    assert.match(preview, /omnimux-inspiration-deconstruct-heading/)
    assert.match(preview, /ICON_CLAPPERBOARD/)
    assert.match(preview, /omnimux-inspiration-doc-section/)
    assert.match(preview, /omnimux-inspiration-doc-title/)
    assert.match(preview, /omnimux-inspiration-doc-quote/)
    assert.match(preview, /omnimux-inspiration-doc-analysis/)
  })

  it('eliminates scroll jitter by decoupling heading from scroll container and containing overscroll', () => {
    const preview = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    assert.match(preview, /omnimux-inspiration-modal-deconstruction-body/)
    assert.match(preview, /onWheel=\{\(e\) => e\.stopPropagation\(\)\}/)

    const panelCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-panel')
    assert.equal(decl(panelCss, 'overscroll-behavior'), 'contain')
    assert.equal(decl(panelCss, 'scrollbar-gutter'), 'stable')

    const deconPanelCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-deconstruction-panel')
    assert.equal(decl(deconPanelCss, 'display'), 'flex')
    assert.equal(decl(deconPanelCss, 'flex-direction'), 'column')

    const deconHeadingCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-deconstruct-heading')
    assert.doesNotMatch(deconHeadingCss, /position:\s*sticky/)

    const deconBodyCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-deconstruction-body')
    assert.equal(decl(deconBodyCss, 'overflow-y'), 'auto')
    assert.equal(decl(deconBodyCss, 'overscroll-behavior'), 'contain')
    assert.equal(decl(deconBodyCss, 'scrollbar-gutter'), 'stable')
  })

  it('establishes clear 3-level visual hierarchy: title (15px) -> item (14px) -> description (13px)', () => {
    const preview = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    assert.match(preview, /omnimux-inspiration-doc-title-bar/)
    assert.match(preview, /omnimux-inspiration-doc-item-title/)
    assert.match(preview, /omnimux-inspiration-doc-item-indicator/)
    assert.match(preview, /omnimux-inspiration-doc-desc-block/)
    assert.match(preview, /omnimux-inspiration-doc-desc/)

    const titleCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-doc-title')
    assert.equal(decl(titleCss, 'font-size'), '15px')
    assert.equal(decl(titleCss, 'font-weight'), '600')

    const itemCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-doc-item-title')
    assert.equal(decl(itemCss, 'font-size'), '14px')
    assert.equal(decl(itemCss, 'font-weight'), '600')

    const descCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-doc-desc')
    assert.equal(decl(descCss, 'font-size'), '13px')
    assert.equal(decl(descCss, 'font-weight'), '400')

    const descBlockCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-doc-desc-block')
    assert.match(decl(descBlockCss, 'padding-left'), /12px|14px/)
  })

  it('removes raw markdown button from deconstruction panel', () => {
    const preview = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    assert.doesNotMatch(preview, /modal\.deconstruction\.showRaw/)
    assert.doesNotMatch(preview, /omnimux-inspiration-modal-raw/)
    assert.doesNotMatch(preview, /setShowRaw/)
  })
})

describe('card reveal shimmer and batch loading UX', () => {
  it('implements card-level shimmer layer and progressive reveal styles', () => {
    const cardSrc = readFileSync(join(here, 'InspirationCoverCard.jsx'), 'utf8')
    assert.match(cardSrc, /omnimux-inspiration-card-shimmer/)
    assert.match(cardSrc, /is-hidden/)
    assert.match(cardSrc, /is-loaded/)

    const shimmerCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-card-shimmer')
    assert.equal(decl(shimmerCss, 'aspect-ratio'), '9 / 16')
    assert.equal(decl(shimmerCss, 'position'), 'absolute')

    const shimmerHiddenCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-card-shimmer.is-hidden')
    assert.equal(decl(shimmerHiddenCss, 'opacity'), '0')

    const coverLoadedCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-cover-img.is-loaded')
    assert.equal(decl(coverLoadedCss, 'opacity'), '1')
  })

  it('renders batch skeleton cards on loadMore instead of plain text spinner', () => {
    const sectionSrc = readFileSync(join(here, 'InspirationSection.jsx'), 'utf8')
    assert.doesNotMatch(sectionSrc, /omnimux-inspiration-scroll-loader/)
    assert.match(sectionSrc, /loadingMore \? Array\.from\(\{ length: 10 \}\)/)
    assert.match(sectionSrc, /key=\{`skel_more_\$\{i\}`\}/)
  })

  it('configures self-adaptive 5-column grid layout for cards and skeleton', () => {
    const gridCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-grid')
    assert.equal(decl(gridCss, 'grid-template-columns'), 'repeat(5, minmax(0, 1fr))')
    assert.equal(decl(gridCss, 'display'), 'grid')

    const skelCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-skeleton')
    assert.equal(decl(skelCss, 'grid-template-columns'), 'repeat(5, minmax(0, 1fr))')

    const cardPureCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-card-pure')
    assert.equal(decl(cardPureCss, 'width'), '100%')
    assert.equal(decl(cardPureCss, 'aspect-ratio'), '9 / 16')
  })

  it('exports preloadBatchCovers and preloadCover for concurrent media readiness with timeout fallback', async () => {
    const { preloadCover, preloadBatchCovers } = await import('./feed-helpers.js')
    assert.equal(typeof preloadCover, 'function')
    assert.equal(typeof preloadBatchCovers, 'function')

    // Empty or non-browser fallback should resolve cleanly
    await assert.doesNotReject(() => preloadBatchCovers([], 100))
    await assert.doesNotReject(() => preloadCover(''))
  })
})
