import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { en, zh } from './locales.js'
import {
  LOGIN_GATE_COPY_KEYS,
  LOGIN_GATE_FEATURE_KEYS,
  describeLoginGate,
  runLoginGateIntent,
} from './login-gate-view.js'
import { HUB_CSS } from './styles.js'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'LoginGate.jsx'), 'utf8')
const styles = readFileSync(join(here, 'styles.js'), 'utf8')
const locales = readFileSync(join(here, 'locales.js'), 'utf8')

const LOCKED_ZH = {
  'auth.gate.brandTitle': 'OmniMux Studio',
  'auth.gate.headline': 'OmniMux 全面接入商业 Agent 矩阵',
  'auth.gate.subdeck': '最强多模态创作引擎 + 顶尖社媒运营专家团队',
  'auth.gate.feature1': '理解、拆解并全自动执行多平台商业内容生产',
  'auth.gate.feature2': '专业工作流画布与 Skill，释放十倍出片生产力',
  'auth.gate.feature3': '从一个创意灵感开始，OmniMux 陪你全链路出海落地',
  'auth.gate.cta': '立即登录',
  'auth.gate.waitingDeviceCode': '已在新窗口打开授权页，请输入设备码：',
  'auth.gate.tag': 'Studio Suite',
}

describe('LoginGate copy lock (locales)', () => {
  it('ships the locked 商业出海与出片 zh strings', () => {
    for (const [key, value] of Object.entries(LOCKED_ZH)) {
      assert.equal(zh[key], value, key)
    }
  })

  it('keeps zh/en key parity for every auth.gate.* slot', () => {
    const zhKeys = Object.keys(zh).filter((key) => key.startsWith('auth.gate.')).sort()
    const enKeys = Object.keys(en).filter((key) => key.startsWith('auth.gate.')).sort()
    assert.deepEqual(enKeys, zhKeys)
    for (const key of Object.keys(LOGIN_GATE_COPY_KEYS).map((k) => LOGIN_GATE_COPY_KEYS[k])) {
      assert.equal(typeof zh[key], 'string')
      assert.equal(typeof en[key], 'string')
      assert.notEqual(en[key], '')
    }
  })

  it('does not leak discarded exploration copy into production locales', () => {
    assert.doesNotMatch(locales, /AI Agent 矩阵/)
    assert.doesNotMatch(locales, /生成管线/)
    assert.doesNotMatch(locales, /MiniMax Design/)
    assert.doesNotMatch(locales, /AI 创作中枢/)
  })
})

describe('describeLoginGate phases', () => {
  it('returns null-render snapshot when closed or missing', () => {
    assert.equal(describeLoginGate(null).visible, false)
    assert.equal(describeLoginGate({ phase: 'closed' }).visible, false)
    assert.equal(describeLoginGate({ phase: 'closed' }).intent, null)
  })

  it('prompt shows CTA, hides device-code polling', () => {
    const view = describeLoginGate({ phase: 'prompt' })
    assert.equal(view.visible, true)
    assert.equal(view.showHero, true)
    assert.equal(view.showCta, true)
    assert.equal(view.showWaiting, false)
    assert.equal(view.showRetry, false)
    assert.equal(view.intent, 'begin')
  })

  it('checking is an internal lock: hidden, no waiting spinner', () => {
    const view = describeLoginGate({ phase: 'checking' })
    assert.equal(view.visible, false)
    assert.equal(view.showWaiting, false)
    assert.equal(view.showCta, false)
    assert.equal(view.showHero, false)
    assert.equal(view.showRetry, false)
    assert.equal(view.intent, null)
  })

  it('starting shows the waiting spinner without a retry CTA', () => {
    const view = describeLoginGate({ phase: 'starting' })
    assert.equal(view.visible, true)
    assert.equal(view.showWaiting, true)
    assert.equal(view.showCta, false)
    assert.equal(view.showRetry, false)
  })

  it('waiting surfaces the device code and open-url intent', () => {
    const view = describeLoginGate({
      phase: 'waiting',
      user_code: 'OMX-4242',
      verification_url: 'https://verify.example/dev',
    })
    assert.equal(view.showWaiting, true)
    assert.equal(view.showCta, false)
    assert.equal(view.userCode, 'OMX-4242')
    assert.equal(view.verificationUrl, 'https://verify.example/dev')
    assert.equal(view.intent, 'open-url')
  })

  it('exposes the reopen copy key for the waiting-state recovery link', () => {
    assert.equal(LOGIN_GATE_COPY_KEYS.reopen, 'auth.gate.reopen')
    assert.equal(zh['auth.gate.reopen'], '重新打开授权页')
    assert.equal(en['auth.gate.reopen'], 'Reopen authorization page')
  })

  it('denied/expired/error expose retry CTA and error slot', () => {
    for (const phase of ['denied', 'expired', 'error']) {
      const view = describeLoginGate({ phase })
      assert.equal(view.showCta, true)
      assert.equal(view.showRetry, true)
      assert.equal(view.showError, true)
      assert.equal(view.intent, 'retry')
    }
  })
})

describe('runLoginGateIntent callbacks', () => {
  it('prompt CTA fires begin()', () => {
    const calls = []
    const fired = runLoginGateIntent(describeLoginGate({ phase: 'prompt' }), {
      begin: () => { calls.push('begin') },
      retry: () => { calls.push('retry') },
      openUrl: (url) => { calls.push(url) },
    })
    assert.equal(fired, 'begin')
    assert.deepEqual(calls, ['begin'])
  })

  it('failed CTA fires retry()', () => {
    const calls = []
    const fired = runLoginGateIntent(describeLoginGate({ phase: 'expired' }), {
      begin: () => { calls.push('begin') },
      retry: () => { calls.push('retry') },
      openUrl: (url) => { calls.push(url) },
    })
    assert.equal(fired, 'retry')
    assert.deepEqual(calls, ['retry'])
  })

  it('waiting with a verification_url opens the system browser', () => {
    const calls = []
    const fired = runLoginGateIntent(describeLoginGate({
      phase: 'waiting',
      verification_url: 'https://verify.example/dev',
    }), {
      begin: () => { calls.push('begin') },
      retry: () => { calls.push('retry') },
      openUrl: (url) => { calls.push(url) },
    })
    assert.equal(fired, 'open-url')
    assert.deepEqual(calls, ['https://verify.example/dev'])
  })

  it('closed snapshot is a no-op', () => {
    const fired = runLoginGateIntent(describeLoginGate({ phase: 'closed' }), {
      begin: () => { throw new Error('must not begin') },
      retry: () => { throw new Error('must not retry') },
      openUrl: () => { throw new Error('must not open') },
    })
    assert.equal(fired, 'noop')
  })
})

describe('LoginGate.jsx 1:1 structure', () => {
  it('portals onto document.body and returns null when closed', () => {
    assert.match(source, /createPortal/)
    assert.match(source, /from 'react-dom'/)
    assert.match(source, /document\.body/)
    assert.match(source, /if \(!view\.visible\) return null/)
    assert.match(source, /gate\.phase === 'closed'|phase === 'closed'|view\.visible/)
  })

  it('closes on Escape and on backdrop click', () => {
    assert.match(source, /event\.key === 'Escape'/)
    assert.match(source, /window\.addEventListener\('keydown'/)
    assert.match(source, /onClick=\{\(\) => \{ cancel\(\) \}\}/)
    assert.match(source, /event\.stopPropagation\(\)/)
  })

  it('renders the official octopus logo via parseLogoSvg', () => {
    assert.match(source, /data-omnimux-login-gate-logo/)
    assert.match(source, /parseLogoSvg\(resolveHeroLogoSvg\(\)\)/)
    assert.match(source, /className="omnimux-login-gate-brand-logo"/)
    assert.match(source, /dangerouslySetInnerHTML/)
  })

  it('wires CTA through begin/retry and locked copy keys', () => {
    assert.match(source, /runLoginGateIntent\(view, \{ begin, retry, openUrl: openVerificationUrl \}\)/)
    assert.match(source, /t\(COPY\.cta\)/)
    assert.match(source, /t\(COPY\.headline\)/)
    assert.match(source, /t\(COPY\.waitingDeviceCode\)/)
    assert.match(source, /LOGIN_GATE_FEATURE_KEYS\.map/)
    assert.equal(LOGIN_GATE_FEATURE_KEYS.length, 3)
    assert.deepEqual(LOGIN_GATE_FEATURE_KEYS, [
      'auth.gate.feature1',
      'auth.gate.feature2',
      'auth.gate.feature3',
    ])
  })

  it('waiting state offers a reopen-authorization control', () => {
    assert.match(source, /omnimux-login-gate-reopen/)
    assert.match(source, /window\.open\(gate\.verification_url, '_blank', 'noopener,noreferrer'\)/)
    assert.match(source, /t\(COPY\.reopen\)/)
    assert.match(source, /omnimux-login-gate-hero-jellyfish/)
    assert.match(source, /omnimux-login-gate-hero-title/)
  })

  it('renders the locked Unsplash ocean poster as hero media + jellyfish img', () => {
    assert.match(source, /className="omnimux-login-gate-hero-media"/)
    assert.match(
      source,
      /className="omnimux-login-gate-hero-jellyfish"/,
    )
    assert.match(
      source,
      /src="https:\/\/images\.unsplash\.com\/photo-1544551763-46a013bb70d5\?auto=format&fit=crop&w=600&q=80"/,
    )
    assert.match(source, /alt="Ocean Aesthetic"/)
    assert.match(source, /className="omnimux-login-gate-hero-scrim"/)
  })

  it('does not use kit ModalDialog chrome (custom 820×520 poster)', () => {
    assert.doesNotMatch(source, /ModalDialog/)
    assert.match(source, /from 'dsh-ui-kit'/)
    assert.doesNotMatch(source, /<button\b/)
  })
})

describe('HUB_CSS login-gate 1:1 tokens', () => {
  it('scopes the 820×520 dialog, 348/472 split, z-index 1100', () => {
    assert.match(styles, /\.omnimux-login-gate-backdrop/)
    assert.match(styles, /z-index:\s*1100/)
    assert.match(styles, /backdrop-filter:\s*blur/)
    assert.match(styles, /\.omnimux-login-gate-dialog/)
    assert.match(styles, /width:\s*820px/)
    assert.match(styles, /height:\s*520px/)
    assert.match(styles, /border-radius:\s*20px/)
    assert.match(styles, /--dsw-alias-surface-raised/)
    assert.match(styles, /\.omnimux-login-gate-hero/)
    assert.match(styles, /width:\s*348px/)
    assert.match(styles, /\.omnimux-login-gate-content/)
    assert.match(styles, /width:\s*472px/)
  })

  it('locks the violet dashed logo frame and cube bullets', () => {
    assert.match(styles, /\.omnimux-login-gate-brand-logo/)
    assert.match(styles, /#7961f2/)
    assert.doesNotMatch(styles, /#C6F14F/)
    assert.doesNotMatch(styles, /#C8F135/)
    assert.match(styles, /inset:\s*-3px/)
    assert.match(styles, /1px dashed/)
    assert.match(styles, /\.omnimux-login-gate-bullet/)
    assert.match(styles, /width:\s*6px/)
    assert.match(styles, /height:\s*6px/)
    assert.match(styles, /\.omnimux-login-gate-cta/)
    assert.match(styles, /height:\s*40px/)
    assert.match(styles, /font-size:\s*70px/)
    assert.match(styles, /mix-blend-mode:\s*overlay/)
  })

  it('locks the solid-white CTA tokens so theme hover cannot invert contrast', () => {
    assert.match(styles, /--login-gate-cta-bg:\s*#ffffff/)
    assert.match(styles, /--login-gate-cta-text:\s*#09090b/)
    assert.match(styles, /--login-gate-cta-hover:\s*#f4f4f5/)
    assert.match(styles, /--login-gate-cta-active:\s*#e4e4e7/)
    assert.match(styles, /background:\s*var\(--login-gate-cta-bg,\s*#ffffff\)\s*!important/)
    assert.match(styles, /color:\s*var\(--login-gate-cta-text,\s*#09090b\)\s*!important/)
    assert.match(
      styles,
      /\.omnimux-login-gate-cta:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\) \{[\s\S]*?background:\s*var\(--login-gate-cta-hover,\s*#f4f4f5\)\s*!important/,
    )
    assert.match(
      styles,
      /\.omnimux-login-gate-cta:hover:not\(:disabled\):not\(\[aria-disabled="true"\]\) \{[\s\S]*?color:\s*var\(--login-gate-cta-text,\s*#09090b\)\s*!important/,
    )
    assert.match(
      styles,
      /\.omnimux-login-gate-cta:active:not\(:disabled\):not\(\[aria-disabled="true"\]\) \{[\s\S]*?background:\s*var\(--login-gate-cta-active,\s*#e4e4e7\)\s*!important/,
    )
    assert.doesNotMatch(
      styles,
      /\.omnimux-login-gate-cta:hover[\s\S]{0,280}--dsw-alias-interactive-bg-hover/,
    )
    assert.doesNotMatch(
      styles,
      /\.omnimux-login-gate-cta:hover[\s\S]{0,280}--dsw-alias-bg-base/,
    )
  })

  it('keeps the waiting reopen link readable in both themes', () => {
    assert.match(styles, /\.omnimux-login-gate-reopen \{[\s\S]*?color:\s*var\(--dsw-alias-label-secondary,\s*#d4d4d8\)\s*!important/)
    assert.match(styles, /\.omnimux-login-gate-reopen:hover \{[\s\S]*?color:\s*var\(--dsw-alias-label-primary,\s*#ffffff\)\s*!important/)
  })

  it('embeds deep-sea media, box-sizing, and font fallbacks so the poster is not a purple fog', () => {
    assert.match(styles, /box-sizing:\s*border-box/)
    assert.match(styles, /\.omnimux-login-gate-hero-media/)
    assert.match(
      styles,
      /url\('https:\/\/images\.unsplash\.com\/photo-1544551763-46a013bb70d5\?auto=format&fit=crop&w=800&q=80'\)/,
    )
    assert.match(styles, /radial-gradient\(circle at 50% 25%, color-mix\(in srgb, var\(--dsw-alias-label-primary, #fff\) 25%, transparent\) 0%, color-mix\(in srgb, var\(--dsw-alias-label-primary, #fff\) 14%, transparent\) 30%, color-mix\(in srgb, var\(--dsw-alias-label-primary, #fff\) 5%, transparent\) 55%, transparent 75%\)/)
    assert.match(styles, /data:image\/svg\+xml/)
    assert.match(styles, /\.omnimux-login-gate-hero-jellyfish/)
    assert.match(styles, /object-fit:\s*cover/)
    assert.match(styles, /mask-image:\s*radial-gradient\(ellipse at 50% 54%, black 20%, transparent 68%\)/)
    assert.match(styles, /\.omnimux-login-gate-hero-title/)
    assert.match(styles, /padding:\s*32px 30px 36px/)
    assert.match(styles, /'Cinzel', 'Playfair Display', 'Didot', 'Songti SC', 'STSong', Georgia, serif/)
    assert.match(styles, /'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif/)
    assert.match(styles, /\.omnimux-login-gate-reopen/)
  })

  it('closes both offline SVG data-uri templates with a quoted url()', () => {
    assert.match(styles, /const LOGIN_GATE_SEA_SVG = '<svg[\s\S]+?<\/svg>'/)
    assert.match(styles, /const LOGIN_GATE_JELLY_SVG = '<svg[\s\S]+?<\/svg>'/)
    assert.match(styles, /const LOGIN_GATE_SEA_URI = `url\("data:image\/svg\+xml,\$\{encodeURIComponent\(LOGIN_GATE_SEA_SVG\)}"\)`/)
    assert.match(styles, /const LOGIN_GATE_JELLY_URI = `url\("data:image\/svg\+xml,\$\{encodeURIComponent\(LOGIN_GATE_JELLY_SVG\)}"\)`/)
    assert.doesNotMatch(styles, /encodeURIComponent\(`[\s\S]+?<\/svg>`\)\}\)`/)
  })
})

describe('HUB_CSS real stylesheet parse', () => {
  /** @type {JSDOM | undefined} */
  let dom

  afterEach(() => {
    dom?.window.close()
    dom = undefined
  })

  function loadSheet() {
    dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
    const style = dom.window.document.createElement('style')
    style.setAttribute('id', 'omnimux-hub-styles')
    style.textContent = HUB_CSS
    dom.window.document.head.appendChild(style)
    const sheet = style.sheet
    assert.ok(sheet, 'injected <style> must expose a CSSStyleSheet')
    assert.ok(sheet.cssRules.length > 0, 'HUB_CSS must parse into real CSS rules')
    return sheet
  }

  function ruleFor(sheet, selector) {
    const rules = [...sheet.cssRules]
    const exact = rules.find((rule) => (rule.selectorText || '') === selector)
    if (exact) return exact
    const grouped = rules.find((rule) => {
      const parts = (rule.selectorText || '').split(',').map((part) => part.trim())
      return parts.includes(selector)
    })
    assert.ok(grouped, `missing CSS rule for ${selector}`)
    return grouped
  }

  function firstQuotedDataUri(backgroundImage) {
    const match = backgroundImage.match(/url\("data:image\/svg\+xml,[^"]+"\)/)
    assert.ok(match, `background-image must contain a fully quoted data-uri: ${backgroundImage.slice(0, 120)}`)
    return match[0]
  }

  it('parses .omnimux-login-gate-hero-media with the locked Unsplash ocean url and SVG fallback', () => {
    const sheet = loadSheet()
    const rule = ruleFor(sheet, '.omnimux-login-gate-hero-media')
    const backgroundImage = rule.style.getPropertyValue('background-image')
    assert.match(backgroundImage, /radial-gradient\(circle at 50% 25%/)
    assert.match(
      backgroundImage,
      /url\(["']?https:\/\/images\.unsplash\.com\/photo-1544551763-46a013bb70d5\?auto=format&fit=crop&w=800&q=80["']?\)/,
    )
    const dataUri = firstQuotedDataUri(backgroundImage)
    assert.ok(dataUri.startsWith('url("data:image/svg+xml,'))
    assert.ok(dataUri.endsWith('")'))
    assert.match(dataUri, /%3Csvg/)
    assert.match(dataUri, /%3C%2Fsvg%3E/)
    assert.ok(dataUri.length > 800, `encoded sea svg looks truncated: ${dataUri.length}`)
    assert.equal(rule.style.getPropertyValue('background-size'), 'cover')
    assert.equal(rule.style.getPropertyValue('background-position'), 'center 25%')
    assert.equal(rule.style.getPropertyValue('mix-blend-mode'), 'overlay')
    assert.equal(rule.style.getPropertyValue('opacity'), '0.92')
  })

  it('parses .omnimux-login-gate-hero-jellyfish with prototype geometry and SVG fallback', () => {
    const sheet = loadSheet()
    const rule = ruleFor(sheet, '.omnimux-login-gate-hero-jellyfish')
    const backgroundImage = rule.style.getPropertyValue('background-image')
    assert.match(backgroundImage, /url\("data:image\/svg\+xml,/)
    const dataUri = firstQuotedDataUri(backgroundImage)
    assert.ok(dataUri.endsWith('")'))
    assert.match(dataUri, /%3Csvg/)
    assert.match(dataUri, /%3C%2Fsvg%3E/)
    assert.equal(rule.style.getPropertyValue('width'), '280px')
    assert.equal(rule.style.getPropertyValue('height'), '280px')
    assert.equal(rule.style.getPropertyValue('object-fit'), 'cover')
    assert.equal(rule.style.getPropertyValue('object-position'), 'center')
    assert.equal(rule.style.getPropertyValue('opacity'), '0.92')
    assert.match(rule.style.getPropertyValue('mask-image') || rule.style.getPropertyValue('-webkit-mask-image'), /(?:ellipse )?at 50% 54%/)
    assert.ok(dataUri.length > 400, `encoded jellyfish svg looks truncated: ${dataUri.length}`)
  })

  it('keeps .omnimux-login-gate-hero-title font-size 70px untruncated', () => {
    const sheet = loadSheet()
    const rule = ruleFor(sheet, '.omnimux-login-gate-hero-title')
    assert.equal(rule.style.getPropertyValue('font-size'), '70px')
  })

  it('keeps .omnimux-login-gate-brand-logo at 32×32 untruncated', () => {
    const sheet = loadSheet()
    const rule = ruleFor(sheet, '.omnimux-login-gate-brand-logo')
    assert.equal(rule.style.getPropertyValue('width'), '32px')
    assert.equal(rule.style.getPropertyValue('height'), '32px')
  })

  it('keeps .omnimux-login-gate-dialog at 820×520 untruncated', () => {
    const sheet = loadSheet()
    const rule = ruleFor(sheet, '.omnimux-login-gate-dialog')
    assert.equal(rule.style.getPropertyValue('width'), '820px')
    assert.equal(rule.style.getPropertyValue('height'), '520px')
  })

  it('parses dialog-scoped solid-white CTA tokens independent of host theme', () => {
    const sheet = loadSheet()
    const dialog = ruleFor(sheet, '.omnimux-login-gate-dialog')
    assert.equal(dialog.style.getPropertyValue('--login-gate-cta-bg'), '#ffffff')
    assert.equal(dialog.style.getPropertyValue('--login-gate-cta-text'), '#09090b')
    assert.equal(dialog.style.getPropertyValue('--login-gate-cta-hover'), '#f4f4f5')
    assert.equal(dialog.style.getPropertyValue('--login-gate-cta-active'), '#e4e4e7')
  })

  it('parses .omnimux-login-gate-cta as a solid white button with dark text', () => {
    const sheet = loadSheet()
    const rule = ruleFor(sheet, '.omnimux-login-gate-cta')
    assert.equal(rule.style.getPropertyValue('display'), 'inline-flex')
    assert.equal(rule.style.getPropertyValue('height'), '40px')
    assert.equal(rule.style.getPropertyValue('padding'), '0px 28px')
    assert.equal(rule.style.getPropertyValue('font-size'), '14.5px')
    assert.equal(rule.style.getPropertyValue('font-weight'), '700')
    assert.equal(rule.style.getPropertyValue('border-radius'), '8px')
    assert.equal(rule.style.getPropertyValue('border-style') || rule.style.borderStyle, 'none')
    assert.equal(rule.style.getPropertyValue('background'), 'var(--login-gate-cta-bg, #ffffff)')
    assert.equal(rule.style.getPropertyValue('color'), 'var(--login-gate-cta-text, #09090b)')
    assert.equal(rule.style.getPropertyValue('box-shadow'), '0 4px 14px rgba(255, 255, 255, 0.15)')
    assert.equal(rule.style.getPropertyValue('cursor'), 'pointer')
    assert.doesNotMatch(rule.style.getPropertyValue('background'), /interactive-bg-hover/)
    assert.doesNotMatch(rule.style.getPropertyValue('color'), /bg-base/)
  })

  it('parses CTA hover as zinc-100 white, never ghost interactive-bg-hover', () => {
    const sheet = loadSheet()
    const rule = ruleFor(sheet, '.omnimux-login-gate-cta:hover:not(:disabled):not([aria-disabled="true"])')
    assert.equal(rule.style.getPropertyValue('background'), 'var(--login-gate-cta-hover, #f4f4f5)')
    assert.equal(rule.style.getPropertyValue('color'), 'var(--login-gate-cta-text, #09090b)')
    assert.equal(rule.style.getPropertyValue('transform'), 'translateY(-1px)')
    assert.equal(rule.style.getPropertyValue('box-shadow'), '0 6px 20px rgba(255, 255, 255, 0.25)')
    assert.doesNotMatch(rule.cssText, /--dsw-alias-interactive-bg-hover/)
    assert.doesNotMatch(rule.cssText, /--dsw-alias-bg-base/)
  })

  it('parses CTA active as zinc-200 white with dark text retained', () => {
    const sheet = loadSheet()
    const rule = ruleFor(sheet, '.omnimux-login-gate-cta:active:not(:disabled):not([aria-disabled="true"])')
    assert.equal(rule.style.getPropertyValue('background'), 'var(--login-gate-cta-active, #e4e4e7)')
    assert.equal(rule.style.getPropertyValue('color'), 'var(--login-gate-cta-text, #09090b)')
    assert.equal(rule.style.getPropertyValue('transform'), 'translateY(0)')
    assert.equal(rule.style.getPropertyValue('box-shadow'), '0 2px 8px rgba(255, 255, 255, 0.15)')
  })

  it('parses reopen hover as primary label, not a ghost-button fill', () => {
    const sheet = loadSheet()
    const rest = ruleFor(sheet, '.omnimux-login-gate-reopen')
    const hover = ruleFor(sheet, '.omnimux-login-gate-reopen:hover')
    assert.equal(rest.style.getPropertyValue('color'), 'var(--dsw-alias-label-secondary, #d4d4d8)')
    assert.equal(hover.style.getPropertyValue('color'), 'var(--dsw-alias-label-primary, #ffffff)')
    assert.doesNotMatch(hover.cssText, /interactive-bg-hover/)
  })
})
