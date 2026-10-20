/**
 * X poster surface: one trigger per tweet, a theme modal, local rendering, and
 * the composer hand-off that attaches the image and prefills the opinion.
 *
 * The feature never posts. Its last step leaves a normal X composer on screen
 * with the poster attached and the text filled in; publishing stays a human
 * click, which is why the trigger says "prefill" rather than "post".
 *
 * @module
 */

import { extractTweetCapture } from '../twitter-capture/extractor.ts'
import { FEATURE_FLAG, readFlag, readFlagSync, subscribeFlag } from '../../feature-flags.ts'
import { generateOpinion, type PosterLocale } from './opinion.ts'
import { openPosterModal, type PosterModalHandle } from './modal.ts'
import { renderPoster } from './render.ts'
import { DEFAULT_POSTER_THEME } from './themes.ts'
import {
  isComposePath,
  readPendingPoster,
  readPosterTheme,
  runComposeHandoff,
  savePendingPoster,
  savePosterTheme,
} from './compose.ts'
import type { PosterTheme, TweetPosterSource } from './types.ts'
import './styles.css'

const ROW_ATTR = 'data-omnimux-poster-row'
const ARTICLE_ATTR = 'data-omnimux-poster'
const TOAST_ID = 'omnimux-poster-toast'

const COPY = {
  zh: {
    trigger: '生成海报',
    triggerTitle: '生成海报并预填观点',
    noTweet: '没有读取到这篇帖子的正文',
    posterFailed: '海报生成失败，请重试',
    posterTooLarge: '海报过大，请重试',
    navigating: '即将跳转发帖页…',
    attached: '海报已附加，观点已预填，请确认后发布',
    attachedNoOpinion: '海报已附加；观点未生成，请手动补充',
    attachedNoOpinionManual: '海报已附加；未能预填观点，请手动补充',
    attachFailed: '未能自动附图，请手动添加',
    occupied: '输入框已有内容，未覆盖',
    noComposer: '请先登录 X，再打开发帖页',
    genericFail: '操作失败，请重试',
  },
  en: {
    trigger: 'Create poster',
    triggerTitle: 'Create a poster and prefill a post',
    noTweet: 'Could not read this post',
    posterFailed: 'Poster generation failed, please retry',
    posterTooLarge: 'Poster is too large, please retry',
    navigating: 'Opening the composer…',
    attached: 'Poster attached and opinion prefilled — review, then post',
    attachedNoOpinion: 'Poster attached; opinion was empty, please add it',
    attachedNoOpinionManual: 'Poster attached; opinion could not be prefilled',
    attachFailed: 'Could not attach the image automatically',
    occupied: 'Composer already has text; left it untouched',
    noComposer: 'Sign in to X, then open the composer',
    genericFail: 'Something went wrong, please retry',
  },
} as const

const SVG_POSTER =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5"/><circle cx="9" cy="8.5" r="1.6"/><path d="M8 14h8M8 17.5h5"/></svg>'

/** Page language decides the trigger and modal copy; X chrome is the signal. */
export function detectPosterLocale(): PosterLocale {
  const htmlLang = (document.documentElement.lang || '').toLowerCase()
  if (htmlLang.startsWith('zh')) return 'zh'
  if (htmlLang.startsWith('en')) return 'en'
  const uiLanguage = (() => {
    try {
      return chrome.i18n?.getUILanguage?.() ?? ''
    } catch {
      return ''
    }
  })()
  const language = (uiLanguage || navigator.language || '').toLowerCase()
  return language.startsWith('zh') ? 'zh' : 'en'
}

function showPosterToast(message: string): void {
  document.getElementById(TOAST_ID)?.remove()
  const toast = document.createElement('div')
  toast.id = TOAST_ID
  toast.className = 'omnimux-poster-toast'
  toast.setAttribute('role', 'status')
  toast.setAttribute('aria-live', 'polite')
  toast.textContent = message
  document.documentElement.appendChild(toast)
  window.setTimeout(() => toast.remove(), 4200)
}

interface AvatarResponse {
  ok?: unknown
  dataUrl?: unknown
}

/** Fetches the avatar through the extension worker to keep the canvas untainted. */
function fetchAvatarDataUrl(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (url === '') {
      resolve('')
      return
    }
    // The avatar is decoration; a slow image host must not hold the composer
    // navigation hostage.
    const timer = setTimeout(() => resolve(''), 8000)
    try {
      chrome.runtime.sendMessage({ type: 'DSH_FETCH_IMAGE_DATA_URL', url }, (response: AvatarResponse | undefined) => {
        clearTimeout(timer)
        if (chrome.runtime.lastError) {
          resolve('')
          return
        }
        resolve(response?.ok === true && typeof response.dataUrl === 'string' ? response.dataUrl : '')
      })
    } catch {
      clearTimeout(timer)
      resolve('')
    }
  })
}

function sourceFromArticle(article: HTMLElement): TweetPosterSource | null {
  const capture = extractTweetCapture(article)
  if (capture === null || capture.text.trim() === '') return null
  return {
    name: capture.author.name,
    handle: capture.author.handle,
    avatar: capture.author.avatar,
    verified: capture.author.verified,
    text: capture.text,
    url: capture.url,
  }
}

function findActionBar(article: HTMLElement): HTMLElement | null {
  const groups = Array.from(article.querySelectorAll<HTMLElement>('div[role="group"]'))
  return (
    groups.find(
      (group) =>
        group.closest('article') === article &&
        group.querySelector('[data-testid="reply"]') !== null,
    ) ?? null
  )
}

interface PosterController {
  start(): void
  stop(): void
}

function createController(): PosterController {
  let observer: MutationObserver | null = null
  let scanTimer: number | null = null
  let running = false
  let modal: PosterModalHandle | null = null
  let theme: PosterTheme = DEFAULT_POSTER_THEME
  const rows = new WeakMap<HTMLElement, HTMLElement>()

  function locale(): PosterLocale {
    return detectPosterLocale()
  }

  function mountRow(article: HTMLElement): void {
    if (!article.querySelector('a[href*="/status/"]')) return
    const existing = rows.get(article)
    if (existing?.isConnected === true) return

    const actionBar = findActionBar(article)
    if (actionBar === null) return

    const copy = COPY[locale()]
    const row = document.createElement('div')
    row.className = 'omnimux-poster-row'
    row.setAttribute(ROW_ATTR, '1')
    row.innerHTML = `<button type="button" class="omnimux-poster-trigger" title="${copy.triggerTitle}" aria-haspopup="dialog">${SVG_POSTER}<span>${copy.trigger}</span></button>`

    row.querySelector('button')?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void openForArticle(article)
    })

    actionBar.insertAdjacentElement('afterend', row)
    rows.set(article, row)
    article.setAttribute(ARTICLE_ATTR, '1')

    // A previous row can survive in a re-rendered container; keep exactly one.
    for (const stale of Array.from(article.querySelectorAll<HTMLElement>(`[${ROW_ATTR}="1"]`))) {
      if (stale !== row && stale.closest('article') === article) stale.remove()
    }
  }

  function scan(): void {
    for (const article of Array.from(document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'))) {
      // Only the outermost article of a quote/repost owns a row.
      if (article.parentElement?.closest('article') !== null) continue
      mountRow(article)
    }
  }

  function scheduleScan(): void {
    if (scanTimer !== null) window.clearTimeout(scanTimer)
    scanTimer = window.setTimeout(() => {
      scanTimer = null
      scan()
    }, 150)
  }

  async function openForArticle(article: HTMLElement): Promise<void> {
    const source = sourceFromArticle(article)
    if (source === null) {
      showPosterToast(COPY[locale()].noTweet)
      return
    }
    if (modal?.isOpen() === true) return

    theme = await readPosterTheme().catch(() => DEFAULT_POSTER_THEME)
    modal = openPosterModal({
      locale: locale(),
      initialTheme: theme,
      onThemeChange: (next) => {
        theme = next
      },
      onConfirm: (next) => {
        theme = next
        void generateAndHandOff(source, next, modal)
      },
    })
  }

  async function generateAndHandOff(
    source: TweetPosterSource,
    selectedTheme: PosterTheme,
    handle: PosterModalHandle | null,
  ): Promise<void> {
    if (handle === null) return
    handle.setPhase('generating')
    handle.setStep('poster', 'active')
    handle.setStep('opinion', 'active')

    const localeCode = locale()
    const copy = COPY[localeCode]
    void savePosterTheme(selectedTheme)

    const avatarPromise = fetchAvatarDataUrl(source.avatar)
    const posterPromise = avatarPromise.then((avatarDataUrl) =>
      renderPoster(
        avatarDataUrl === '' ? source : { ...source, avatarDataUrl },
        selectedTheme,
      ),
    )
    const opinionPromise = generateOpinion({
      text: source.text,
      author: source.handle,
      locale: localeCode,
    })

    let poster: Awaited<typeof posterPromise> | null = null
    try {
      poster = await posterPromise
    } catch {
      poster = null
    }
    if (poster === null) {
      handle.setStep('poster', 'failed')
      handle.setPhase('error', copy.posterFailed)
      return
    }
    handle.setStep('poster', 'done')

    const opinion = await opinionPromise.catch(() => '')
    handle.setStep('opinion', opinion === '' ? 'failed' : 'done')

    try {
      await savePendingPoster({
        dataUrl: poster.dataUrl,
        text: opinion,
        sourceUrl: source.url,
        theme: selectedTheme,
        createdAt: Date.now(),
      })
    } catch {
      handle.setStep('poster', 'failed')
      handle.setPhase('error', copy.posterTooLarge)
      return
    }

    // The navigation is the confirmation: keep the modal up until it happens.
    showPosterToast(copy.navigating)
    window.location.assign('https://x.com/compose/post')
  }

  async function consumePendingOnCompose(): Promise<void> {
    if (!isComposePath(window.location.pathname)) return
    const pending = await readPendingPoster().catch(() => null)
    if (pending === null) return

    const copy = COPY[locale()]
    const result = await runComposeHandoff()
    if (result.status === 'no-editor') {
      showPosterToast(copy.noComposer)
      return
    }
    if (result.status === 'none') return
    if (result.status === 'occupied') {
      showPosterToast(copy.occupied)
      return
    }
    if (result.filled === 'occupied') {
      showPosterToast(copy.occupied)
    } else if (!result.attached) {
      showPosterToast(copy.attachFailed)
    } else if ((result.payload?.text ?? '') === '') {
      showPosterToast(copy.attachedNoOpinion)
    } else {
      showPosterToast(copy.attached)
    }
  }

  return {
    start() {
      if (running) return
      running = true
      scan()
      observer = new MutationObserver(scheduleScan)
      observer.observe(document.body, { childList: true, subtree: true })
      window.addEventListener('popstate', scheduleScan)
      void consumePendingOnCompose()
    },
    stop() {
      running = false
      observer?.disconnect()
      observer = null
      if (scanTimer !== null) {
        window.clearTimeout(scanTimer)
        scanTimer = null
      }
      window.removeEventListener('popstate', scheduleScan)
      for (const row of Array.from(document.querySelectorAll<HTMLElement>(`[${ROW_ATTR}="1"]`))) row.remove()
      for (const article of Array.from(document.querySelectorAll<HTMLElement>(`[${ARTICLE_ATTR}]`))) {
        article.removeAttribute(ARTICLE_ATTR)
      }
      modal?.close()
      modal = null
    },
  }
}

/** Mounts the poster surface on X when the feature switch is on. */
export function initTwitterPoster(): void {
  const host = window.location.hostname
  if (host !== 'x.com' && host !== 'twitter.com' && !host.endsWith('.x.com') && !host.endsWith('.twitter.com')) {
    return
  }

  const controller = createController()
  let enabled = readFlagSync(FEATURE_FLAG.poster)

  function apply(next: boolean): void {
    enabled = next
    if (next) controller.start()
    else controller.stop()
  }

  if (enabled) controller.start()

  void readFlag(FEATURE_FLAG.poster).then((next) => {
    if (next !== enabled) apply(next)
  })
  subscribeFlag(FEATURE_FLAG.poster, (next) => {
    if (next !== enabled) apply(next)
  })
}
