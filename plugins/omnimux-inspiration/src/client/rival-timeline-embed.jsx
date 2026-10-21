/**
 * Render layer of the timeline's official embed (#3542).
 *
 * All DOM/script work lives in `rival-timeline-embed-loader.js`; this file is
 * only the React state machine that mounts the embed lazily and lets the row
 * fall back when the platform cannot render it.
 */

import { useEffect, useRef, useState } from 'react'
import { rivalEmbedAspectRatio } from './rival-embed.js'
import {
  createTimelineEmbed,
  embedTheme,
  embedWidgetLang,
  instagramCardHeight,
  loadTwitterWidgets,
  resetTwitterWidgetsLoader,
  EMBED_TIMEOUT_MS,
  TWITTER_WIDGETS_SRC,
} from './rival-timeline-embed-loader.js'

export {
  createTimelineEmbed,
  embedTheme,
  embedWidgetLang,
  instagramCardHeight,
  loadTwitterWidgets,
  resetTwitterWidgetsLoader,
  EMBED_TIMEOUT_MS,
  TWITTER_WIDGETS_SRC,
}

/**
 * @param {{
 *   target: { platform: string, kind: 'card'|'player', id: string, url: string },
 *   card?: Record<string, any>,
 *   theme?: 'dark'|'light',
 *   lang?: 'zh'|'en',
 *   title?: string,
 *   onState?: (state: 'ready'|'failed') => void,
 * }} props
 */
export function RivalTimelineEmbed(props) {
  const { target, card, theme, lang, title, onState } = props
  const hostRef = useRef(null)
  const [state, setState] = useState('loading')
  const onStateRef = useRef(onState)
  onStateRef.current = onState
  const ratio = rivalEmbedAspectRatio(card)
  const targetKey = target ? `${target.platform}:${target.kind}:${target.id}` : ''

  useEffect(() => {
    if (!target || !hostRef.current) return undefined
    const host = hostRef.current
    // A dependency change (live locale/theme switch) re-runs this effect: an
    // append-only host would stack a second official card under `is-loading`
    // while the row already hides its own content.
    host.replaceChildren()
    let cancelled = false
    let timer = null
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('embed-timeout')), EMBED_TIMEOUT_MS)
      // Node (unit tests) keeps the process alive for a pending timer; a real
      // browser returns a number and has no `unref`.
      if (timer && typeof timer.unref === 'function') timer.unref()
    })
    setState('loading')
    Promise.race([
      createTimelineEmbed(target, host, { theme, lang, title, ratio }),
      timeout,
    ])
      .then((ok) => {
        if (cancelled) return
        setState(ok ? 'ready' : 'failed')
        onStateRef.current?.(ok ? 'ready' : 'failed')
      })
      .catch(() => {
        if (cancelled) return
        setState('failed')
        onStateRef.current?.('failed')
      })
      .finally(() => {
        if (timer) clearTimeout(timer)
      })
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // `targetKey` is the identity that matters: handing a new object with the
    // same URL must not re-create the iframe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, theme, lang, title])

  // Instagram's public embed is a fixed page whose own height depends on the
  // media; size it from the media ratio so the card does not scroll inside.
  useEffect(() => {
    if (state !== 'ready' || target?.platform !== 'instagram') return undefined
    const host = hostRef.current
    const frame = host?.querySelector('iframe')
    if (!host || !frame) return undefined
    const apply = () => {
      frame.style.height = `${instagramCardHeight(host.clientWidth, ratio)}px`
    }
    apply()
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(apply)
    observer.observe(host)
    return () => observer.disconnect()
  }, [state, target?.platform, ratio])

  return (
    <div
      ref={hostRef}
      className={`omnimux-rival-timeline-embed is-${state}${target?.kind === 'card' ? ' is-card' : ' is-player'}${ratio < 1 ? ' is-portrait' : ' is-landscape'}`}
      style={target?.kind === 'player' ? { '--omnimux-rival-embed-ratio': String(ratio) } : undefined}
      data-embed-state={state}
      data-embed-platform={target?.platform || ''}
      aria-busy={state === 'loading' ? 'true' : undefined}
    />
  )
}
