import { detectPlatformFromUrl, getCanonicalItemKey, normalizeUrl } from './url-normalizer.js'
import { isPublicHttpUrl } from './url-policy.js'

const SHAPES = new Set(['text', 'photo', 'gallery', 'video', 'quote', 'repost', 'thread', 'article', 'poll', 'link'])
const text = (value) => typeof value === 'string' ? value.trim() : ''
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

/** Browser snapshots never grant access to local paths or credential-bearing URLs. */
export function publicCaptureUrl(value) {
  const url = text(value)
  if (!isPublicHttpUrl(url)) return ''
  const parsed = new URL(url)
  return parsed.username || parsed.password ? '' : url
}

/** Compare a complete source identity, never a search substring or an embedded URL. */
export function sameCaptureSource(left, right) {
  if (!publicCaptureUrl(left) || !publicCaptureUrl(right)) return false
  const leftPlatform = detectPlatformFromUrl(left)
  const rightPlatform = detectPlatformFromUrl(right)
  if (leftPlatform !== rightPlatform) return false
  const a = getCanonicalItemKey(left)
  const b = getCanonicalItemKey(right)
  if (leftPlatform === 'x' && (!/^x:tweet:\d+$/.test(a.key) || !/^x:tweet:\d+$/.test(b.key))) return false
  if (a.platform === leftPlatform && b.platform === rightPlatform && a.key === b.key) return true
  return normalizeUrl(left) === normalizeUrl(right)
}

function authorOf(value) {
  const author = object(value)
  return {
    ...(typeof author.name === 'string' ? { name: author.name } : {}),
    ...(typeof author.handle === 'string' ? { handle: author.handle } : {}),
    ...(publicCaptureUrl(author.avatar) ? { avatar: publicCaptureUrl(author.avatar) } : {}),
    ...(typeof author.verified === 'boolean' ? { verified: author.verified } : {}),
  }
}

function statsOf(value) {
  const stats = object(value)
  return Object.fromEntries(['likes', 'comments', 'shares', 'views'].filter((key) => typeof stats[key] === 'number'
    && Number.isFinite(stats[key]) && stats[key] >= 0).map((key) => [key, stats[key]]))
}

/** Strict field whitelist: a page cannot inject paths, analysis or arbitrary row fields. */
export function normalizeCapture(value, targetUrl) {
  if (value === undefined || value === null) return undefined
  const raw = object(value)
  if (!sameCaptureSource(raw.url, targetUrl)) throw new Error('网页采集内容与当前原帖不一致，请重新采集')
  const capture = { url: publicCaptureUrl(raw.url) }
  for (const key of ['title', 'text']) if (typeof raw[key] === 'string') capture[key] = raw[key]
  if (SHAPES.has(raw.shape)) capture.shape = raw.shape
  if (raw.author !== undefined) capture.author = authorOf(raw.author)
  if (raw.stats !== undefined) capture.stats = statsOf(raw.stats)
  if (typeof raw.posted_at === 'string' && Number.isFinite(Date.parse(raw.posted_at))) capture.posted_at = raw.posted_at
  if (publicCaptureUrl(raw.cover_url)) capture.cover_url = publicCaptureUrl(raw.cover_url)
  if (raw.quoted !== undefined) {
    const quoted = object(raw.quoted)
    capture.quoted = { author: authorOf(quoted.author), text: typeof quoted.text === 'string' ? quoted.text : '',
      ...(publicCaptureUrl(quoted.coverUrl) ? { coverUrl: publicCaptureUrl(quoted.coverUrl) } : {}) }
  }
  if (raw.poll !== undefined) {
    const poll = object(raw.poll)
    capture.poll = {
      options: (Array.isArray(poll.options) ? poll.options : []).filter((option) => typeof option?.label === 'string').map((option) => ({
        label: option.label, ...(typeof option.pct === 'number' && Number.isFinite(option.pct) ? { pct: option.pct } : {}),
      })),
      ...(typeof poll.votes === 'number' && Number.isFinite(poll.votes) && poll.votes >= 0 ? { votes: poll.votes } : {}),
      ...(typeof poll.closesAt === 'string' ? { closesAt: poll.closesAt } : {}),
    }
  }
  if (raw.media_items !== undefined) {
    if (!Array.isArray(raw.media_items)) throw new Error('网页采集素材格式无效，请重新采集')
    capture.media_items = raw.media_items.map((item) => {
      if (!item || !['image', 'video'].includes(item.type) || typeof item.url !== 'string') throw new Error('网页采集素材格式无效，请重新采集')
      return { type: item.type, url: publicCaptureUrl(item.url),
        ...(text(item.source_id) ? { source_id: text(item.source_id) } : {}),
        ...(publicCaptureUrl(item.poster_url) ? { poster_url: publicCaptureUrl(item.poster_url) } : {}) }
    })
  }
  return capture
}

/** Quality ladders and X image-size aliases name the same asset. */
export function mediaSourceIdentity(item) {
  const raw = publicCaptureUrl(item?.source_url || item?.url)
  if (!raw) return ''
  const url = new URL(raw)
  if (/(^|\.)twimg\.com$/i.test(url.hostname)) {
    const video = url.pathname.match(/^\/(amplify_video|ext_tw_video|tweet_video)\/([^/]+)/)
    if (item.type === 'video' && video) return `video:${video[1]}:${video[2]}`
    if (item.type === 'image') return `image:${url.hostname}${url.pathname.replace(/:\w+$/, '').replace(/\.(jpe?g|png|webp|gif)$/i, '')}`
  }
  return `${item.type}:${raw}`
}

export function mediaSourceId(item) {
  return text(item?.source_id) || (item?.type === 'video' && publicCaptureUrl(item.poster_url)
    ? `poster:${mediaSourceIdentity({ type: 'image', url: item.poster_url })}` : mediaSourceIdentity(item))
}

export function sameMediaSource(left, right) {
  if (left?.type !== right?.type) return false
  const a = mediaSourceId(left)
  const b = mediaSourceId(right)
  const explicit = (value) => value && !/^(?:poster|image|video):/.test(value)
  if (explicit(a) && explicit(b) && a !== b) return false
  const poster = (item) => publicCaptureUrl(item?.poster_url) ? mediaSourceIdentity({ type: 'image', url: item.poster_url }) : ''
  return Boolean((a && a === b) || (mediaSourceIdentity(left) && mediaSourceIdentity(left) === mediaSourceIdentity(right))
    || (poster(left) && poster(left) === poster(right)) || (poster(right) && a === `poster:${poster(right)}`)
    || (poster(left) && b === `poster:${poster(left)}`))
}

/** Primary parser owns filled fields; capture fills gaps and one-level webpage details. */
export function mergeCapturedMeta(meta, capture) {
  const next = { ...meta }
  const slots = (meta.media_slots || meta.media_items || []).map((item) => ({ ...item }))
  for (const item of capture?.media_items || []) {
    const index = slots.findIndex((slot) => sameMediaSource(slot, item))
    if (index < 0) slots.push({ ...item })
    else slots[index] = { ...item, ...slots[index], url: slots[index].url || item.url,
      source_id: slots[index].source_id || item.source_id, poster_url: slots[index].poster_url || item.poster_url }
  }
  if (slots.length === 0 && ['video', 'photo', 'gallery'].includes(capture?.shape)) {
    slots.push({ type: capture.shape === 'video' ? 'video' : 'image', url: '' })
  }
  next.media_slots = slots
  next.media_items = slots.filter((item) => item.url)
  for (const key of ['title', 'text', 'cover_url']) next[key] ||= capture?.[key] || ''
  const filled = (value) => Object.fromEntries(Object.entries(value || {}).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''))
  next.author = { ...(capture?.author || {}), ...filled(meta.author) }
  next.stats = { ...(capture?.stats || {}), ...filled(meta.stats) }
  next.published_at ||= capture?.posted_at || ''
  next.shape = capture?.shape
  next.quoted = meta.quoted ?? capture?.quoted
  next.poll = meta.poll ?? capture?.poll
  next.video_url = slots.find((item) => item.type === 'video' && item.url)?.url || ''
  next.images = slots.filter((item) => item.type === 'image' && item.url).map((item) => item.url)
  next.unavailable_media = slots.some((item) => !item.url)
  next.has_metadata = Boolean(next.title || next.text || next.cover_url || slots.length)
  return next
}
