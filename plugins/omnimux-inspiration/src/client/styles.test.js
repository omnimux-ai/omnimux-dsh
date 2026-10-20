import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { INSPIRATION_CSS } from './styles.js'
import { RIVAL_CSS } from './rival-styles.js'
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

describe('original-post detail layout', () => {
  it('uses two independent reading panes without the obsolete triptych cascade', () => {
    const columns = ruleBody(INSPIRATION_CSS, '.omnimux-post-columns')
    assert.equal(decl(columns, 'display'), 'grid')
    assert.equal(decl(columns, 'grid-template-columns'), 'minmax(0, 1.18fr) minmax(340px, 1fr)')
    assert.equal(decl(ruleBody(INSPIRATION_CSS, '.omnimux-post-source'), 'overflow-y'), 'auto')
    assert.equal(decl(ruleBody(INSPIRATION_CSS, '.omnimux-post-analysis-scroll'), 'overflow-y'), 'auto')
    assert.doesNotMatch(INSPIRATION_CSS, /is-triptych|omnimux-inspiration-workbench-center/)
  })
  it('keeps images uncropped and lets the full-image surface scroll when zoomed', () => {
    assert.match(INSPIRATION_CSS, /object-fit: contain/)
    assert.equal(decl(ruleBody(INSPIRATION_CSS, '.omnimux-post-lightbox-canvas'), 'overflow'), 'auto')
    assert.equal(decl(ruleBody(INSPIRATION_CSS, '.omnimux-post-lightbox-canvas.is-zoomed'), 'display'), 'block')
  })
  it('reuses shared drawers and scope-keyed analysis without exposing static demo results', () => {
    const source = readFileSync(join(here, 'InspirationPostDetail.jsx'), 'utf8')
    assert.match(source, /Drawer, /)
    assert.match(source, /container=\{container\}/)
    assert.match(source, /getTargetAnalysis\(item, target\)/)
    assert.match(source, /getBodyTranslation\(item\)/)
    assert.doesNotMatch(source, /localStorage|demo:true|demo: true/)
  })
})

describe('locale dictionaries', () => {
  it('keeps zh/en key sets aligned including the switch aria-label', () => {
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
    assert.ok(zh['view.switch'] && en['view.switch'])
    assert.equal(zh['view.player'], '作品')
    assert.equal(zh['view.deconstruct'], '作品解析')
    // The account-monitor grid put both CTAs on the same card as the library's,
    // so the wording is now the one the prototype fixed for that card: 详情 for
    // the secondary action and 立即复刻 for the primary, in both languages.
    assert.equal(zh['card.cta.try'], '立即复刻')
    assert.equal(zh['card.cta.tryFull'], '立即复刻')
    assert.equal(zh['card.cta.detail'], '详情')
    assert.equal(en['card.cta.try'], 'Replicate now')
    assert.equal(en['card.cta.tryFull'], 'Replicate now')
    assert.equal(en['card.cta.detail'], 'Details')
    assert.equal(zh['card.cta.noSession'], '请先新建或打开一个会话')
    assert.doesNotMatch(zh['card.cta.try'], /加会话/)
    assert.doesNotMatch(en['card.cta.try'], /Add to chat/)
    assert.doesNotMatch(zh['card.cta.addToConversation'], /添加到会话/)
    // 账号筛选的全量态读作维度名，不带计数（design.md §5.1 的触发器文案契约）。
    assert.equal(zh['rivalFilter.all'], '账号')
    assert.equal(en['rivalFilter.all'], 'Accounts')
    assert.doesNotMatch(zh['rivalFilter.all'], /[:(（]/, 'the full-selection label must not be a name:value pair')
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
    // 长写而非 font 简写：简写里的 inherit 不是合法 font-family，整条声明会被浏览器丢弃
    assert.equal(decl(btn, 'font-size'), '12px')
    assert.equal(decl(btn, 'font-weight'), '550')
    assert.equal(decl(btn, 'line-height'), '16px')
    assert.doesNotMatch(btn, /font\s*:/)
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

  it('keeps selected references behind a creation action and preserves existing external handoff', () => {
    const preview = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    const section = readFileSync(join(here, 'InspirationSection.jsx'), 'utf8')
    const detail = readFileSync(join(here, 'InspirationPostDetail.jsx'), 'utf8')
    assert.match(detail, /prepareCreationReferences/)
    assert.match(detail, /onReplicate\?\./)
    assert.match(preview, /onReplicate/)
    assert.doesNotMatch(preview, /添加到会话/)
    assert.doesNotMatch(preview, /MessageSquarePlus/)
    assert.match(section, /onReplicate=\{handleReplicate\}/)
  })
})

describe('preview document typography', () => {
  it('keeps reading typography independent from native background blur', () => {
    assert.doesNotMatch(ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-modal-backdrop'), /blur/)
    assert.equal(decl(ruleBody(INSPIRATION_CSS, '.omnimux-post-body'), 'white-space'), 'pre-wrap')
    assert.match(INSPIRATION_CSS, /omnimux-inspiration-doc-record/)
    assert.match(INSPIRATION_CSS, /overflow-wrap/)
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
    assert.match(sectionSrc, /loadingMore \? <div className="omnimux-inspiration-skeleton omnimux-rival-loadmore"/)
    assert.match(sectionSrc, /key=\{`skel_more_\$\{i\}`\}/)
  })

  it('delegates card sizing to the shared masonry and keeps loading placeholders below it', () => {
    const sectionSrc = readFileSync(join(here, 'InspirationSection.jsx'), 'utf8')
    assert.match(sectionSrc, /<RivalMasonry/)
    const gridCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-grid')
    assert.doesNotMatch(gridCss, /grid-template-columns|display:\s*grid/)
    const sharedGrid = ruleBody(RIVAL_CSS, '.omnimux-rival-masonry')
    assert.equal(decl(sharedGrid, 'position'), 'relative')
    assert.match(sharedGrid, /(?:^|;)\s*height:\s*var\(--rival-feed-height, auto\)/)
    const cardPureCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-card-pure')
    assert.doesNotMatch(cardPureCss, /aspect-ratio|width:/, 'the library must not override shared card geometry')
    const mediaCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-card-pure .omnimux-rival-card-media')
    assert.equal(decl(mediaCss, 'object-fit'), 'contain', 'saved photos must remain fully visible')
  })

  it('keeps text import notices in flow with the same body typography as shared height estimates', () => {
    const body = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-card-state-text')
    assert.equal(decl(body, 'position'), 'relative')
    assert.equal(decl(body, 'padding'), '0')
    assert.equal(decl(body, 'font-size'), '14px')
    assert.equal(decl(body, 'line-height'), '20px')
    assert.equal(decl(body, '-webkit-line-clamp'), '8')
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

describe('账号监控两栏布局（#3432）', () => {
  it('lays the account column beside the timeline content', () => {
    const layout = ruleBody(RIVAL_CSS, '.omnimux-rival-layout')
    assert.match(layout, /display:\s*grid/)
    assert.match(layout, /grid-template-columns:\s*248px minmax\(0,\s*1fr\)/)
    const column = ruleBody(RIVAL_CSS, '.omnimux-rival-accounts')
    assert.equal(decl(column, 'position'), 'sticky')
  })

  it('keeps the toolbar and its three content layers unclipped for its dropdown', () => {
    const toolbarSrc = readFileSync(join(here, 'styles.js'), 'utf8')
    assert.match(
      toolbarSrc,
      /\.omnimux-inspiration-toolbar,[\s\S]*?\[class\*="bar"\][\s\S]*?\[class\*="tools"\][\s\S]*?\[class\*="right"\][\s\S]*?overflow:\s*visible\s*!important;/,
      'the toolbar and its three content layers must stop clipping the platform dropdown',
    )
  })
})

describe('导入成功的气泡提示', () => {
  it('floats at the top of the window instead of taking a row in the content area', () => {
    const css = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-toast')
    assert.equal(decl(css, 'position'), 'fixed')
    assert.equal(decl(css, 'top'), '24px')
    assert.equal(decl(css, 'left'), '50%')
    assert.equal(decl(css, 'transform'), 'translateX(-50%)')
    assert.equal(decl(css, 'z-index'), '99999')
    assert.equal(decl(css, 'pointer-events'), 'none', 'a receipt must not swallow clicks on what it covers')
    assert.match(css, /var\(--dsw-alias-bg-elevated\)/, 'the pill reuses the frosted overlay surface')
    assert.match(css, /backdrop-filter:\s*blur\(16px\)/)

    const iconCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-toast-icon')
    assert.match(iconCss, /var\(--dsw-alias-state-success-primary\)/)
  })
})

describe('灵感预览弹窗分享按钮激活态视觉规范', () => {
  it('分享按钮激活态严禁纯白背景或裸品牌色，必须采用深色微透激活底与高亮边框', () => {
    const activeCss = ruleBody(INSPIRATION_CSS, '.omnimux-inspiration-share-trigger-btn.is-active')
    assert.match(
      decl(activeCss, 'background'),
      /var\(--dsw-alias-interactive-bg-active/,
      '激活态必须采用次级激活背景 token，杜绝单色主题下映射为纯白色块',
    )
    assert.match(
      decl(activeCss, 'border-color'),
      /var\(--dsw-alias-border-l3/,
      '激活态必须保留边框线以呼应弹出浮层',
    )
    assert.match(
      decl(activeCss, 'color'),
      /var\(--dsw-alias-label-primary/,
      '文字必须保持高对比度主文本色',
    )
  })

  it('灵感预览弹窗组件中分享按钮必须挂载 aria-expanded 属性反映浮层开闭状态', () => {
    const modalSrc = readFileSync(join(here, 'InspirationPreviewModal.jsx'), 'utf8')
    assert.match(
      modalSrc,
      /aria-expanded=\{showSharePopover\}/,
      '分享按钮必须声明 aria-expanded 属性',
    )
  })
})

describe('post detail narrow-screen navigation', () => {
  it('keeps both mounted panes selectable at narrow widths', () => {
    assert.equal(decl(ruleBody(INSPIRATION_CSS, '.omnimux-post-mobile-tabs'), 'display'), 'none')
    assert.match(INSPIRATION_CSS, /@media \(max-width: 860px\)[\s\S]*omnimux-post-mobile-tabs \{ display: flex/)
    const mobile = INSPIRATION_CSS.split('@media (max-width: 860px)')[1]
    const tabs = ruleBody(mobile, '.omnimux-post-detail > .omnimux-post-mobile-tabs')
    assert.equal(decl(tabs, 'margin-inline'), '0', 'standalone detail navigation must neutralize shared underline Tabs negative page-alignment margins')
    assert.match(INSPIRATION_CSS, /omnimux-post-source\.is-active/)
    assert.match(INSPIRATION_CSS, /omnimux-post-analysis\.is-active/)
  })
})
