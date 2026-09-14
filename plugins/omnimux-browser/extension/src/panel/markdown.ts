/**
 * Markdown → sanitized HTML for conversation bubbles.
 *
 * Model and user text is untrusted: the rendered output goes through
 * DOMPurify before touching the DOM, and http(s) links are forced to open in
 * a new tab (the side panel must never navigate away from the chat).
 *
 * @module
 */

import DOMPurify, { type Config } from 'dompurify'
import { marked } from 'marked'

const MARKDOWN_SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [
    'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4',
    'h5', 'h6', 'hr', 'img', 'li', 'ol', 'p', 'pre', 'source', 'strong',
    'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul', 'video',
  ],
  ALLOWED_ATTR: ['align', 'alt', 'controls', 'height', 'href', 'poster', 'src', 'start', 'title', 'width'],
  ALLOWED_URI_REGEXP: /^https?:\/\//i,
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
} satisfies Config

marked.setOptions({
  gfm: true,
  // 聊天式文本：单个换行渲染为 <br>（与 DeepSeek 聊天界面的换行行为一致）。
  breaks: true,
})

/**
 * Reply media is loaded straight from the origin that produced it, so the
 * browser would otherwise leak the panel URL in a `Referer` header. Drop the
 * referrer, defer off-screen work, and keep playback user-initiated.
 */
function hardenReplyMedia(root: DocumentFragment): void {
  for (const image of root.querySelectorAll('img')) {
    keepHttpsUri(image, 'src')
    image.setAttribute('referrerpolicy', 'no-referrer')
    image.setAttribute('loading', 'lazy')
  }
  for (const video of root.querySelectorAll('video')) {
    keepHttpsUri(video, 'src')
    keepHttpsUri(video, 'poster')
    video.setAttribute('controls', '')
    video.setAttribute('referrerpolicy', 'no-referrer')
    video.setAttribute('preload', 'none')
    video.setAttribute('playsinline', '')
  }
  for (const source of root.querySelectorAll('source')) keepHttpsUri(source, 'src')
}

/**
 * Drop a media address that is not plain http(s).
 *
 * `ALLOWED_URI_REGEXP` already rejects these during sanitizing; this is the
 * second line so a future sanitizer option change cannot turn `data:` or
 * `javascript:` into a live load.
 */
function keepHttpsUri(element: Element, attribute: string): void {
  const value = element.getAttribute(attribute)
  if (value !== null && !/^https?:\/\//i.test(value.trim())) element.removeAttribute(attribute)
}

/**
 * Render markdown source to sanitized HTML safe for `innerHTML`.
 *
 * @param source - markdown text (may be empty)
 * @returns sanitized HTML fragment
 */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source ?? '', { async: false }) as string
  const template = document.createElement('template')
  template.innerHTML = DOMPurify.sanitize(html, MARKDOWN_SANITIZE_OPTIONS)
  for (const link of template.content.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href') ?? ''
    if (/^https?:\/\//i.test(href)) {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noreferrer noopener')
    }
  }
  hardenReplyMedia(template.content)
  return template.innerHTML
}
