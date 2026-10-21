/**
 * Generic work-page fallback: og / twitter meta, JSON-LD, inline media and DOM.
 *
 * Used when the host has no dedicated extractor, and as the second chance for a
 * dedicated one that found no structured payload (spec J2). It only reads what
 * the page already rendered: no fetch, no injected script.
 *
 * @module
 */

import type { CapturedMedia, CapturedPost, CapturedStats, CapturePlatform } from './types.ts'
import {
  absoluteHttpUrl,
  contentShapeOf,
  domImages,
  domVideos,
  firstNonEmpty,
  isoFromDate,
  jsonLdNodes,
  metaContent,
  numberField,
  positiveInt,
  recordOf,
  stringField,
  textOf,
  titleFromText,
  uniqueMedia,
  videoPoster,
} from './helpers.ts'

const TITLE_META = ['meta[property="og:title"]', 'meta[name="twitter:title"]']
const DESCRIPTION_META = [
  'meta[property="og:description"]',
  'meta[name="description"]',
  'meta[name="twitter:description"]',
]
const IMAGE_META = [
  'meta[property="og:image:secure_url"]',
  'meta[property="og:image"]',
  'meta[name="twitter:image"]',
  'meta[name="twitter:image:src"]',
]
const AUTHOR_META = ['meta[name="author"]', 'meta[property="article:author"]', 'meta[name="twitter:creator"]']

/** JSON-LD types that describe a work rather than the site around it. */
const WORK_TYPE_RE = /(article|videoobject|imageobject|socialmediaposting|newsarticle|blogposting|discussionforumposting)/i

/** The first JSON-LD node that describes a work. */
function workNode(doc: Document): Record<string, unknown> | null {
  const nodes = jsonLdNodes(doc)
  for (const node of nodes) {
    const raw = node['@type']
    const type = Array.isArray(raw) ? raw.join(' ') : typeof raw === 'string' ? raw : ''
    if (WORK_TYPE_RE.test(type)) return node
  }
  return nodes[0] ?? null
}

/** Author name from JSON-LD's string / object / list forms. */
function jsonLdAuthorName(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  const record = recordOf(value)
  if (record !== null) return stringField(record, ['name', 'alternateName'])
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = jsonLdAuthorName(item)
      if (name !== '') return name
    }
  }
  return ''
}

/** Image address from JSON-LD's string / object / list forms. */
function jsonLdImageUrl(value: unknown, base: string): string {
  if (typeof value === 'string') return absoluteHttpUrl(value, base) ?? ''
  const record = recordOf(value)
  if (record !== null) return absoluteHttpUrl(stringField(record, ['url', 'contentUrl']), base) ?? ''
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = jsonLdImageUrl(item, base)
      if (url !== '') return url
    }
  }
  return ''
}

/** Video addresses JSON-LD declares for the work. */
function jsonLdVideos(node: Record<string, unknown> | null, base: string): CapturedMedia[] {
  if (node === null) return []
  const media: CapturedMedia[] = []
  for (const key of ['contentUrl', 'embedUrl']) {
    const url = absoluteHttpUrl(stringField(node, [key]), base)
    if (url !== null) media.push({ type: 'video', url })
  }
  return media
}

/** Interaction counters from JSON-LD `interactionStatistic`. */
function jsonLdStats(node: Record<string, unknown> | null): CapturedStats | undefined {
  if (node === null) return undefined
  const stats: CapturedStats = {}
  for (const entry of Array.isArray(node['interactionStatistic']) ? node['interactionStatistic'] : []) {
    const record = recordOf(entry)
    if (record === null) continue
    const interaction = record['interactionType']
    const interactionRecord = recordOf(interaction)
    const label = firstNonEmpty(
      typeof interaction === 'string' ? interaction : '',
      stringField(interactionRecord, ['@type']),
    ).toLowerCase()
    const count = positiveInt(record['userInteractionCount'])
    if (count === undefined) continue
    if (label.includes('like')) stats.likes ??= count
    else if (label.includes('comment') || label.includes('reply')) stats.comments ??= count
    else if (label.includes('view') || label.includes('watch')) stats.views ??= count
    else if (label.includes('share')) stats.shares ??= count
  }
  const direct = numberField(node, ['commentCount'])
  if (direct !== undefined) stats.comments ??= direct
  return Object.keys(stats).length > 0 ? stats : undefined
}

/** Description paragraphs from the article body, as a last-resort content source. */
function bodyText(doc: Document): string {
  const paragraphs = Array.from(doc.querySelectorAll('article p, main p, [role="main"] p'))
  return paragraphs
    .map((paragraph) => textOf(paragraph))
    .filter((text) => text.length > 0)
    .slice(0, 8)
    .join('\n')
    .slice(0, 2000)
}

/** The part of the page that holds the work rather than site chrome. */
function workRoot(doc: Document): ParentNode {
  return doc.querySelector('article, main, [role="main"]') ?? doc.body ?? doc
}

/**
 * Captures any work page from meta, JSON-LD and rendered media.
 *
 * @param doc the page document
 * @param href the page address
 * @param platform the platform to report; `web` for an unclassified page
 * @returns the capture, or `null` when the page shows neither title nor media
 */
export function extractGeneric(
  doc: Document,
  href: string,
  platform: CapturePlatform = 'web',
): CapturedPost | null {
  if (href.trim() === '') return null
  const node = workNode(doc)
  const root = workRoot(doc)
  const media = uniqueMedia([
    ...domVideos(root, href),
    ...jsonLdVideos(node, href),
    ...domImages(root, href),
  ])
  const coverUrl = firstNonEmpty(
    metaContent(doc, IMAGE_META),
    jsonLdImageUrl(node?.['image'] ?? node?.['thumbnailUrl'], href),
    videoPoster(root, href),
    media.find((item) => item.type === 'image')?.url ?? '',
  )
  const content = firstNonEmpty(
    metaContent(doc, DESCRIPTION_META),
    stringField(node, ['description', 'abstract']),
    bodyText(doc),
  )
  const title = titleFromText(firstNonEmpty(
    metaContent(doc, TITLE_META),
    stringField(node, ['headline', 'name']),
    textOf(doc.querySelector('h1')),
    doc.title,
  ))
  if (title === '' && media.length === 0 && coverUrl === '') return null
  const authorName = firstNonEmpty(
    jsonLdAuthorName(node?.['author']),
    metaContent(doc, AUTHOR_META),
  ).replace(/^@/, '')
  const stats = jsonLdStats(node)
  const postedAt = isoFromDate(
    stringField(node, ['datePublished', 'dateCreated', 'uploadDate'])
    || metaContent(doc, ['meta[property="article:published_time"]', 'meta[name="date"]']),
  )
  return {
    platform,
    source_url: href,
    title,
    content,
    content_shape: contentShapeOf(media),
    author: { name: authorName, handle: '' },
    media,
    ...(stats === undefined ? {} : { stats }),
    ...(postedAt === undefined ? {} : { posted_at: postedAt }),
    ...(coverUrl === '' ? {} : { cover_url: coverUrl }),
  }
}
