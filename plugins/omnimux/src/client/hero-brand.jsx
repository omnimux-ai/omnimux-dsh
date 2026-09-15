import { useEffect, useState } from 'react'
import { configFromWindow } from '../brand/overlay.js'
import { DEFAULT_CONFIG } from '../brand/defaults.js'
import { useOmnimuxAuth } from './use-omnimux-auth.js'

/**
 * Empty-session hero brand-mark slot.
 * Renders the top-left welcome header in split mode or standard mark in hero phase.
 */
export const HERO_BRAND_SLOT = 'conversation.hero.brand.mark'
export const HERO_BRAND_PRIORITY = -10
export const HERO_BRAND_ID = 'omnimux-hero-brand-mark'

export function resolveHeroLogoSvg(win) {
  const cfg = configFromWindow(win)
  return cfg.logoSvg || DEFAULT_CONFIG.logoSvg
}

/**
 * 迎宾问候与品牌组件（带用户打招呼与标语）。
 */
export function HeroBrandWelcome({ size = 34, className, win = typeof window !== 'undefined' ? window : undefined }) {
  const auth = useOmnimuxAuth({ verifyOnMount: false })
  const [isSplit, setIsSplit] = useState(false)

  const profile = auth?.state?.profile
  const displayName = profile?.display_name || profile?.username || '创作者'
  const greeting = `你好，${displayName}`

  useEffect(() => {
    if (!win || !win.document) return
    const checkSplit = () => {
      const panel = win.document.querySelector('[data-sidebar-right-panel]')
      const isOpen = panel && panel.hasAttribute('data-sidebar-right-open')
      const isFullscreen = panel && panel.getAttribute('data-sidebar-right-panel') === 'fullscreen'
      setIsSplit(Boolean(isOpen && !isFullscreen))
    }
    checkSplit()
    const observer = new MutationObserver(checkSplit)
    observer.observe(win.document.documentElement, {
      attributes: true,
      attributeFilter: ['data-sidebar-right-panel', 'data-sidebar-right-open', 'data-omnimux-conversation-collapsed'],
      subtree: true,
    })
    return () => observer.disconnect()
  }, [win])

  const logoSvg = resolveHeroLogoSvg(win)

  return (
    <div className={`omnimux-welcome-hero ${isSplit ? 'is-split' : 'is-centered'} ${className || ''}`.trim()}>
      <div
        className="omnimux-welcome-logo"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: logoSvg }}
      />
      <div className="omnimux-welcome-meta">
        <h1 className="omnimux-welcome-title">{greeting}</h1>
        <p className="omnimux-welcome-subtitle">属于你的AI社媒运营团队</p>
      </div>
    </div>
  )
}
