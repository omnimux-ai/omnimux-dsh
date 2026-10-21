/**
 * Theme-confirmation modal for the poster hand-off.
 *
 * The modal owns only the decision and the progress display; generation and
 * navigation stay with the caller, so the same dialog can show a failure and
 * offer a retry without knowing how a poster is drawn.
 *
 * @module
 */

import { POSTER_THEMES, POSTER_THEME_ORDER, parsePosterTheme } from './themes.ts'
import type { PosterTheme } from './types.ts'
import './styles.css'

export type PosterModalPhase = 'idle' | 'generating' | 'error'
export type PosterStepState = 'pending' | 'active' | 'done' | 'failed'

export interface PosterModalOptions {
  locale: 'zh' | 'en'
  initialTheme: PosterTheme
  onConfirm: (theme: PosterTheme) => void
  onThemeChange?: (theme: PosterTheme) => void
}

export interface PosterModalHandle {
  readonly element: HTMLElement
  close(): void
  isOpen(): boolean
  setPhase(phase: PosterModalPhase, message?: string): void
  setStep(step: 'poster' | 'opinion', state: PosterStepState, detail?: string): void
  selectedTheme(): PosterTheme
}

export const POSTER_MODAL_HOST_ID = 'omnimux-poster-modal'

const COPY = {
  zh: {
    title: '生成海报',
    description: '选择主题后生成海报与个人观点，并跳到发帖页自动附图、预填正文。发布前由你确认。',
    themesLabel: '主题',
    posterStep: '生成海报',
    opinionStep: '生成观点',
    confirm: '生成并预填',
    cancel: '取消',
    retry: '重试',
    generating: '正在生成…',
    closeLabel: '关闭',
  },
  en: {
    title: 'Create poster',
    description: 'Pick a theme. We generate the poster and a personal opinion, then open the composer with the image attached and the text filled in. You confirm before posting.',
    themesLabel: 'Theme',
    posterStep: 'Poster',
    opinionStep: 'Opinion',
    confirm: 'Generate & prefill',
    cancel: 'Cancel',
    retry: 'Retry',
    generating: 'Generating…',
    closeLabel: 'Close',
  },
} as const

const SVG_CLOSE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'

function themeSwatch(theme: PosterTheme, locale: 'zh' | 'en'): string {
  const tokens = POSTER_THEMES[theme]
  const label = locale === 'zh' ? (theme === 'light' ? '白底海报预览' : '黑底海报预览') : theme === 'light' ? 'White poster preview' : 'Black poster preview'
  return `
    <span class="omnimux-poster-swatch" style="background:${tokens.background}" aria-hidden="true" data-swatch="${theme}">
      <span class="omnimux-poster-swatch-avatar" style="background:${tokens.avatarFallback}"></span>
      <span class="omnimux-poster-swatch-name" style="background:${tokens.foreground}"></span>
      <span class="omnimux-poster-swatch-line" style="background:${tokens.secondary};width:72%"></span>
      <span class="omnimux-poster-swatch-line" style="background:${tokens.secondary};width:86%"></span>
      <span class="omnimux-poster-swatch-line" style="background:${tokens.secondary};width:54%"></span>
      <span class="omnimux-poster-swatch-mark" style="color:${tokens.watermark}">OmniMux</span>
    </span>
    <span class="omnimux-poster-theme-label">${locale === 'zh' ? (theme === 'light' ? '白底' : '黑底') : tokens.labelEn}</span>
    <span class="omnimux-poster-sr-only">${label}</span>
  `
}

/** Opens the theme modal. The caller owns generation and closing. */
export function openPosterModal(options: PosterModalOptions): PosterModalHandle {
  const copy = COPY[options.locale]
  let selected = parsePosterTheme(options.initialTheme)
  let phase: PosterModalPhase = 'idle'

  document.getElementById(POSTER_MODAL_HOST_ID)?.remove()

  const host = document.createElement('div')
  host.id = POSTER_MODAL_HOST_ID
  host.className = 'omnimux-poster-root'
  host.innerHTML = `
    <div class="omnimux-poster-backdrop" data-role="backdrop">
      <section class="omnimux-poster-dialog" role="dialog" aria-modal="true" aria-labelledby="omnimux-poster-title">
        <header class="omnimux-poster-head">
          <div>
            <div class="omnimux-poster-eyebrow">OmniMux</div>
            <h2 class="omnimux-poster-title" id="omnimux-poster-title">${copy.title}</h2>
            <p class="omnimux-poster-description">${copy.description}</p>
          </div>
          <button type="button" class="omnimux-poster-icon-button" data-action="close" aria-label="${copy.closeLabel}">${SVG_CLOSE}</button>
        </header>
        <div class="omnimux-poster-themes" role="radiogroup" aria-label="${copy.themesLabel}">
          ${POSTER_THEME_ORDER.map(
            (theme) => `
            <button type="button" class="omnimux-poster-theme" role="radio" aria-checked="false" data-theme="${theme}">
              ${themeSwatch(theme, options.locale)}
            </button>`,
          ).join('')}
        </div>
        <div class="omnimux-poster-steps" data-role="steps" hidden>
          <div class="omnimux-poster-step" data-step="poster" data-state="pending">
            <span class="omnimux-poster-step-dot" aria-hidden="true"></span>
            <span class="omnimux-poster-step-label">${copy.posterStep}</span>
            <span class="omnimux-poster-step-state" data-role="state"></span>
          </div>
          <div class="omnimux-poster-step" data-step="opinion" data-state="pending">
            <span class="omnimux-poster-step-dot" aria-hidden="true"></span>
            <span class="omnimux-poster-step-label">${copy.opinionStep}</span>
            <span class="omnimux-poster-step-state" data-role="state"></span>
          </div>
        </div>
        <div class="omnimux-poster-error" data-role="error" hidden></div>
        <footer class="omnimux-poster-actions">
          <button type="button" class="omnimux-poster-button" data-action="cancel">${copy.cancel}</button>
          <button type="button" class="omnimux-poster-button omnimux-poster-button--primary" data-action="confirm">${copy.confirm}</button>
        </footer>
      </section>
    </div>
  `
  document.documentElement.appendChild(host)

  const steps = host.querySelector<HTMLElement>('[data-role="steps"]')
  const errorBox = host.querySelector<HTMLElement>('[data-role="error"]')
  const confirmButton = host.querySelector<HTMLButtonElement>('[data-action="confirm"]')
  const cancelButton = host.querySelector<HTMLButtonElement>('[data-action="cancel"]')
  const themeButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('.omnimux-poster-theme'))
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null

  function paintSelection(): void {
    for (const button of themeButtons) {
      const active = button.dataset.theme === selected
      button.setAttribute('aria-checked', active ? 'true' : 'false')
      button.classList.toggle('omnimux-poster-theme--selected', active)
    }
  }

  function paintPhase(): void {
    host.dataset.phase = phase
    if (steps !== null) steps.hidden = phase === 'idle'
    if (errorBox !== null) errorBox.hidden = phase !== 'error'
    if (confirmButton !== null) {
      confirmButton.disabled = phase === 'generating'
      confirmButton.textContent = phase === 'error' ? copy.retry : phase === 'generating' ? copy.generating : copy.confirm
    }
    if (cancelButton !== null) cancelButton.disabled = phase === 'generating'
    for (const button of themeButtons) button.disabled = phase !== 'idle'
  }

  function close(): void {
    if (!host.isConnected) return
    document.removeEventListener('keydown', onKeyDown, true)
    host.remove()
    previousFocus?.focus?.()
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    if (phase === 'generating') return
    event.preventDefault()
    event.stopPropagation()
    close()
  }

  function onBackdrop(event: Event): void {
    if (event.target !== event.currentTarget) return
    if (phase === 'generating') return
    close()
  }

  host.querySelector('[data-role="backdrop"]')?.addEventListener('click', onBackdrop)
  host.querySelector('[data-action="close"]')?.addEventListener('click', () => {
    if (phase !== 'generating') close()
  })
  cancelButton?.addEventListener('click', () => {
    if (phase !== 'generating') close()
  })
  confirmButton?.addEventListener('click', () => {
    if (phase === 'generating') return
    phase = 'generating'
    paintPhase()
    options.onConfirm(selected)
  })
  for (const button of themeButtons) {
    button.addEventListener('click', () => {
      if (phase !== 'idle') return
      selected = parsePosterTheme(button.dataset.theme)
      paintSelection()
      options.onThemeChange?.(selected)
    })
  }

  document.addEventListener('keydown', onKeyDown, true)
  paintSelection()
  paintPhase()
  // Focus the selected theme, not the confirm button: focusing the bottom of a
  // dialog taller than the viewport scrolls the title out of sight.
  const initial = themeButtons.find((button) => button.dataset.theme === selected)
  initial?.focus({ preventScroll: true })

  return {
    element: host,
    close,
    isOpen: () => host.isConnected,
    selectedTheme: () => selected,
    setPhase(next, message) {
      phase = next
      if (errorBox !== null) errorBox.textContent = message ?? ''
      paintPhase()
    },
    setStep(step, state, detail) {
      const row = host.querySelector<HTMLElement>(`[data-step="${step}"]`)
      if (row === null) return
      row.dataset.state = state
      const label = row.querySelector<HTMLElement>('[data-role="state"]')
      if (label !== null) {
        const reason = typeof detail === 'string' ? detail.trim() : ''
        label.textContent =
          state === 'done'
            ? options.locale === 'en'
              ? 'Done'
              : '完成'
            : state === 'failed'
              ? reason !== ''
                ? reason.slice(0, 80)
                : options.locale === 'en'
                  ? 'Failed'
                  : '失败'
              : ''
        label.title = reason
      }
    },
  }
}
