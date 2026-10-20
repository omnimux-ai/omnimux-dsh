/**
 * Composer hand-off for the poster: store the artifact, navigate, then attach
 * the image and fill the opinion once X's compose page renders.
 *
 * The payload crosses a full document navigation, so it cannot be a blob URL,
 * an in-memory object, or extension-page state: it is a short-lived entry in
 * `chrome.storage.local` that the compose page claims exactly once.
 *
 * Nothing here submits. The user reviews the composer and presses Post.
 *
 * @module
 */

import type { PendingPosterPayload, PosterTheme } from './types.ts'
import { parsePosterTheme } from './themes.ts'

export const POSTER_PENDING_KEY = 'omnimux_x_poster_pending'
export const POSTER_THEME_KEY = 'omnimux_x_poster_theme'
export const POSTER_PENDING_TTL_MS = 10 * 60_000
/** A PNG larger than this is refused before storage; local storage is not a CDN. */
export const POSTER_PENDING_MAX_BYTES = 8 * 1024 * 1024

/** Routes that render X's composer (legacy `/compose/tweet` included). */
export function isComposePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return (
    path === '/compose/post' ||
    path === '/compose/tweet' ||
    path === '/intent/post' ||
    path === '/intent/tweet'
  )
}

/** Validates a stored value; returns `null` for malformed or expired entries. */
export function parsePendingPoster(value: unknown, now = Date.now()): PendingPosterPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<PendingPosterPayload>
  if (typeof candidate.dataUrl !== 'string' || !candidate.dataUrl.startsWith('data:image/png;base64,')) {
    return null
  }
  const createdAt = Number(candidate.createdAt)
  if (!Number.isFinite(createdAt) || now - createdAt > POSTER_PENDING_TTL_MS || createdAt > now + 60_000) {
    return null
  }
  return {
    dataUrl: candidate.dataUrl,
    text: typeof candidate.text === 'string' ? candidate.text : '',
    sourceUrl: typeof candidate.sourceUrl === 'string' ? candidate.sourceUrl : '',
    theme: parsePosterTheme(candidate.theme),
    createdAt,
  }
}

/** Approximate decoded size of a base64 data URL. */
export function dataUrlByteSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const body = dataUrl.slice(comma + 1)
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.floor((body.length * 3) / 4) - padding
}

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
  remove(key: string): Promise<void>
}

function storage(): StorageArea | null {
  if (typeof chrome === 'undefined' || chrome.storage?.local === undefined) return null
  const local = chrome.storage.local
  return {
    get: (key) => Promise.resolve(local.get(key)) as Promise<Record<string, unknown>>,
    set: (values) => Promise.resolve(local.set(values)),
    remove: (key) => Promise.resolve(local.remove(key)),
  }
}

/** Persists the payload for the compose page. */
export async function savePendingPoster(payload: PendingPosterPayload): Promise<void> {
  const area = storage()
  if (area === null) throw new Error('扩展存储不可用')
  if (dataUrlByteSize(payload.dataUrl) > POSTER_PENDING_MAX_BYTES) throw new Error('海报过大')
  await area.set({ [POSTER_PENDING_KEY]: payload })
}

/** Reads the payload without claiming it. */
export async function readPendingPoster(now = Date.now()): Promise<PendingPosterPayload | null> {
  const area = storage()
  if (area === null) return null
  const stored = await area.get(POSTER_PENDING_KEY)
  const parsed = parsePendingPoster(stored?.[POSTER_PENDING_KEY], now)
  if (parsed === null) {
    await clearPendingPoster()
    return null
  }
  return parsed
}

/** Removes the payload so it cannot be applied twice. */
export async function clearPendingPoster(): Promise<void> {
  await storage()?.remove(POSTER_PENDING_KEY)
}

/** Reads the last theme choice; the modal opens on it. */
export async function readPosterTheme(): Promise<PosterTheme> {
  const area = storage()
  if (area === null) return parsePosterTheme(undefined)
  const stored = await area.get(POSTER_THEME_KEY)
  return parsePosterTheme(stored?.[POSTER_THEME_KEY])
}

/** Saves the theme choice; a failed write must not block generation. */
export async function savePosterTheme(theme: PosterTheme): Promise<void> {
  await storage()?.set({ [POSTER_THEME_KEY]: theme })
}

function isVisibleTextarea(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/** Finds the composer's editable area on the compose route. */
export function findComposerEditor(doc: Document = document): HTMLElement | null {
  const selectors = [
    'div[data-testid^="tweetTextarea_"][role="textbox"][contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    '[contenteditable="true"][data-testid^="tweetTextarea"]',
  ]
  for (const selector of selectors) {
    const found = Array.from(doc.querySelectorAll<HTMLElement>(selector)).find(
      (element) => element.isConnected && isVisibleTextarea(element),
    )
    if (found !== undefined) return found
  }
  return null
}

/** Finds the composer's image input, preferring X's stable test id. */
export function findFileInput(doc: Document = document): HTMLInputElement | null {
  const preferred = doc.querySelector<HTMLInputElement>('input[type="file"][data-testid="fileInput"]')
  if (preferred !== null) return preferred
  const candidates = Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter(
    (input) => (input.accept || '').includes('image') || (input.accept || '').includes('*/*'),
  )
  const dialog = doc.querySelector('[role="dialog"]')
  if (dialog !== null) {
    const inside = candidates.find((input) => dialog.contains(input))
    if (inside !== undefined) return inside
  }
  return candidates[0] ?? null
}

function dataUrlToFile(dataUrl: string, fileName: string): File | null {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  try {
    const binary = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new File([bytes], fileName, { type: 'image/png' })
  } catch {
    return null
  }
}

/**
 * Attaches the PNG to the composer's file input.
 *
 * X reads the input's `files` and listens for `change`; a synthetic drag is
 * both more fragile and more invasive. Returns `false` when the page structure
 * did not offer an input we could write to.
 */
export async function attachPosterImage(
  dataUrl: string,
  doc: Document = document,
  input: HTMLInputElement | null = findFileInput(doc),
): Promise<boolean> {
  if (input === null) return false
  const file = dataUrlToFile(dataUrl, 'omnimux-poster.png')
  if (file === null) return false

  try {
    const transfer = new DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  } catch {
    return false
  }
}

export type FillResult = 'filled' | 'occupied' | 'no-editor' | 'failed'

function selectAll(editor: HTMLElement): void {
  const range = document.createRange()
  range.selectNodeContents(editor)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/**
 * Fills the opinion into the composer without touching an existing draft.
 *
 * X's editor is a Draft.js surface: a synthetic paste is the one write path the
 * editor itself handles, so it is tried first and `execCommand` is the fallback.
 */
export async function fillPosterText(
  text: string,
  doc: Document = document,
  editor: HTMLElement | null = findComposerEditor(doc),
): Promise<FillResult> {
  if (text.trim() === '') return 'failed'
  if (editor === null) return 'no-editor'
  if ((editor.textContent || '').trim() !== '') return 'occupied'

  try {
    editor.focus()
    selectAll(editor)
    // Draft.js learns the selection from an async selectionchange event.
    await new Promise((resolve) => setTimeout(resolve, 80))

    let handled = false
    if (typeof ClipboardEvent !== 'undefined' && typeof DataTransfer !== 'undefined') {
      const transfer = new DataTransfer()
      transfer.setData('text/plain', text)
      const paste = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clipboardData: transfer,
      })
      handled = !editor.dispatchEvent(paste)
    }

    if (!handled && typeof document.execCommand === 'function') {
      document.execCommand('insertText', false, text)
    }

    // Draft.js may accept the paste and commit the text on its next tick.
    if (handled) await new Promise((resolve) => setTimeout(resolve, 80))

    if ((editor.textContent || '').includes(text.slice(0, Math.min(10, text.length)))) return 'filled'
    if ((editor.textContent || '').trim() !== '') return 'filled'
    return 'failed'
  } catch {
    return 'failed'
  }
}

export interface HandoffOptions {
  doc?: Document
  /** How long to wait for the composer to render after navigation. */
  waitMs?: number
  pollMs?: number
}

export type HandoffStatus = 'none' | 'done' | 'occupied' | 'no-editor'

export interface HandoffResult {
  status: HandoffStatus
  attached: boolean
  filled: FillResult
  payload: PendingPosterPayload | null
}

async function waitFor<T>(probe: () => T | null, waitMs: number, pollMs: number): Promise<T | null> {
  const deadline = Date.now() + waitMs
  for (;;) {
    const value = probe()
    if (value !== null) return value
    if (Date.now() >= deadline) return null
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

/**
 * Claims a pending payload on the compose page, attaches and prefills it.
 *
 * The payload is cleared only after the attempt, so a reload within the TTL can
 * still recover it; a successful run leaves nothing behind.
 */
export async function runComposeHandoff(options: HandoffOptions = {}): Promise<HandoffResult> {
  const doc = options.doc ?? document
  const waitMs = options.waitMs ?? 15_000
  const pollMs = options.pollMs ?? 250

  const payload = await readPendingPoster()
  if (payload === null) return { status: 'none', attached: false, filled: 'failed', payload: null }

  const editor = await waitFor(() => findComposerEditor(doc), waitMs, pollMs)
  if (editor === null) return { status: 'no-editor', attached: false, filled: 'no-editor', payload }

  const attached = await attachPosterImage(payload.dataUrl, doc)
  if (attached) {
    // Give X a moment to start the upload before the text lands beside it.
    await new Promise((resolve) => setTimeout(resolve, 600))
  }
  const filled = payload.text === '' ? 'failed' : await fillPosterText(payload.text, doc, editor)

  await clearPendingPoster()

  return {
    status: filled === 'occupied' ? 'occupied' : 'done',
    attached,
    filled,
    payload,
  }
}
