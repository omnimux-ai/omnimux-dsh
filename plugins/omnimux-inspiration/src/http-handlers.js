import { existsSync } from 'node:fs'
import { downloadMedia } from './downloader.js'
import { analyzeInspirationVideo } from './analyzer.js'
import { getCanonicalItemKey, normalizeUrl } from './url-normalizer.js'
import {
  buildTranslatePrompt,
  extractScriptStructure,
  parseDurationSeconds,
  parsePublishedAt,
  parseTranslateJson,
} from './structure-script.js'

/** Module-level singleton — never construct per request. */
export const importLocks = new Set()

const DUPLICATE_ERROR = '该灵感素材已在库中，请勿重复导入'
const HTTP_URL_RE = /^https?:\/\//i
const CAPABILITY = { x: 'tweet', instagram: 'post' }

function capabilityOf(platform) {
  return CAPABILITY[platform] || 'video'
}

function fail(status, error) {
  return { status, body: { error } }
}

function okExisting(existing) {
  const body = { data: existing, existing: true, is_duplicate: true }
  return { status: 200, body }
}

function conflictExisting(existing) {
  const body = { error: DUPLICATE_ERROR, data: existing, is_duplicate: true }
  return { status: 409, body }
}

function duplicateBody(existing, returnExisting) {
  if (returnExisting) return okExisting(existing)
  return conflictExisting(existing)
}

function firstFilled(obj, keys, fallback = '') {
  for (const key of keys) {
    const value = obj[key]
    if (value) return value
  }
  return fallback
}

function firstHttpUrl(values) {
  for (const value of values) {
    if (typeof value === 'string' && HTTP_URL_RE.test(value)) return value
  }
  return ''
}

function parseSocialMeta(data, rawUrl) {
  const videos = Array.isArray(data.videos) ? data.videos[0] : ''
  const author = data.author || { name: data.author_name, handle: data.author_handle }
  const stats = data.stats || {
    likes: data.likes || data.digg_count,
    comments: data.comments || data.comment_count,
    shares: data.shares || data.share_count,
    duration: data.duration || data.video_duration,
  }
  const duration = parseDurationSeconds(data.duration)
    ?? parseDurationSeconds(data.video_duration)
    ?? parseDurationSeconds(stats.duration)
    ?? parseDurationSeconds(stats.video_duration)
  const published_at = parsePublishedAt(data.create_time)
    || parsePublishedAt(data.createTime)
    || parsePublishedAt(data.published_at)
    || parsePublishedAt(data.upload_date)
    || parsePublishedAt(data.created_at)
  return {
    title: firstFilled(data, ['title', 'desc', 'text'], rawUrl),
    text: firstFilled(data, ['text', 'desc', 'content']),
    cover_url: firstFilled(data, ['cover_url', 'cover', 'thumbnail', 'thumbnail_url', 'origin_cover']),
    video_url: firstFilled(data, ['video_url', 'video', 'play_url', 'play', 'download_url'], videos),
    images: Array.isArray(data.images) ? data.images : [],
    author,
    stats,
    duration,
    published_at,
    resolvedUrl: data.url || data.canonical_url,
  }
}

export function handleList({ url, store }) {
  const q = url.searchParams.get('q') || undefined
  const platform = url.searchParams.get('platform') || undefined
  const type = url.searchParams.get('type') || undefined
  const tag = url.searchParams.get('tag') || undefined
  const isFavorite = url.searchParams.get('is_favorite') || undefined
  const sort = url.searchParams.get('sort') || undefined
  const page = parseInt(url.searchParams.get('page') || '1', 10)
  const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10)
  const country = url.searchParams.get('country') || undefined
  const category = url.searchParams.get('category') || undefined
  const duration_min = url.searchParams.get('duration_min') || undefined
  const duration_max = url.searchParams.get('duration_max') || undefined
  const views_min = url.searchParams.get('views_min') || undefined
  const views_max = url.searchParams.get('views_max') || undefined
  const traffic_type = url.searchParams.get('traffic_type') || undefined
  const posted_after = url.searchParams.get('posted_after') || undefined
  const posted_before = url.searchParams.get('posted_before') || undefined
  const result = store.list({
    q,
    platform,
    type,
    tag,
    is_favorite: isFavorite,
    sort,
    page,
    pageSize,
    country,
    category,
    duration_min,
    duration_max,
    views_min,
    views_max,
    traffic_type,
    posted_after,
    posted_before,
  })
  return { status: 200, body: { data: result } }
}

export function handleCreate({ req, store }) {
  const body = req.body || {}
  if (!body.title) return fail(400, 'title is required')
  const created = store.add(body)
  return { status: 201, body: { data: created } }
}

function parseImportBody(ctx) {
  const body = ctx.req.body || {}
  const rawUrl = String(body.url || '').trim()
  return {
    rawUrl,
    platform: body.platform || ctx.detectPlatformFromUrl(rawUrl),
    autoAnalyze: body.auto_analyze !== false,
    customTags: Array.isArray(body.tags) ? body.tags : [],
    force: Boolean(body.force),
    returnExisting: Boolean(body.return_existing),
  }
}

export async function handleImportUrl(ctx) {
  const parsed = parseImportBody(ctx)
  if (!parsed.rawUrl) return fail(400, 'url is required')
  const existing = ctx.store.findByUrl(parsed.rawUrl)
  if (existing && !parsed.force) return duplicateBody(existing, parsed.returnExisting)
  return withImportLock(parsed.rawUrl, () => runImport({ ...ctx, ...parsed }))
}

async function withImportLock(rawUrl, work) {
  const canonicalKey = getCanonicalItemKey(rawUrl).key || normalizeUrl(rawUrl) || rawUrl
  if (importLocks.has(canonicalKey)) {
    return fail(429, '该灵感正在解析导入中，请勿重复提交')
  }
  importLocks.add(canonicalKey)
  try {
    return await work()
  } finally {
    importLocks.delete(canonicalKey)
  }
}

async function runImport(args) {
  if (!args.socialFetcher) {
    return fail(500, '未注入 OmniMux 社媒解析能力 (socialFetcher 未就绪)')
  }
  const social = await fetchSocialMeta(args)
  if (social.error) return social.error
  const dup = checkResolvedDuplicate(args, social.meta)
  if (dup) return dup
  return persistImportedVideo(args, social.meta)
}

async function persistImportedVideo(args, meta) {
  const rawVideoUrl = meta.video_url
  if (!rawVideoUrl || !HTTP_URL_RE.test(rawVideoUrl)) {
    return fail(422, '社媒解析未提取到有效无水印视频直链，无法完成视频下载入库')
  }
  const media = await downloadImportMedia(args, meta, rawVideoUrl)
  if (media.error) return media.error
  const deconstruction = await maybeAnalyze(args, media, meta)
  const record = args.store.add(buildImportRecord(args, meta, media, deconstruction))
  return { status: 200, body: { data: record } }
}

async function maybeAnalyze(args, media, meta) {
  if (!args.autoAnalyze || !media.localVideoPath) return null
  const analysisResult = await analyzeInspirationVideo({
    videoPath: media.localVideoPath,
    title: meta.title,
    content: meta.text,
    tags: args.customTags,
    platform: args.platform,
    videoAnalyzeTool: args.videoAnalyzeTool,
  })
  return analysisResult.deconstruction
}

function buildImportRecord(args, meta, media, deconstruction) {
  const coverName = media.localCoverPath ? media.localCoverPath.split('/').pop() : ''
  const videoName = media.localVideoPath.split('/').pop()
  const cover_url = coverName
    ? `/omnimux/inspiration/local/media/covers/${coverName}`
    : meta.cover_url
  return {
    title: meta.title,
    content: meta.text,
    type: 'video',
    source_platform: args.platform,
    source_url: args.rawUrl,
    cover_url,
    media_urls: [`/omnimux/inspiration/local/media/videos/${videoName}`],
    local_paths: media.localPaths,
    tags: args.customTags,
    author: meta.author,
    stats: meta.stats,
    duration: meta.duration,
    published_at: meta.published_at,
    deconstruction,
  }
}

async function fetchSocialMeta(args) {
  try {
    const fetched = await args.socialFetcher({
      platform: args.platform,
      capability: capabilityOf(args.platform),
      url: args.rawUrl,
    })
    if (!fetched || !fetched.data) {
      return { error: fail(502, 'OmniMux 社媒解析接口未返回有效数据，请检查链接或网络') }
    }
    return { meta: parseSocialMeta(fetched.data, args.rawUrl) }
  } catch (fetchErr) {
    const message = `OmniMux 社媒解析调用失败: ${args.formatErrorMessage(fetchErr)}`
    return { error: fail(502, message) }
  }
}

function checkResolvedDuplicate(args, meta) {
  const resolvedUrl = meta.resolvedUrl
  if (!resolvedUrl || resolvedUrl === args.rawUrl || args.force) return null
  const secondExisting = args.store.findByUrl(resolvedUrl)
  if (!secondExisting) return null
  return duplicateBody(secondExisting, args.returnExisting)
}

async function downloadImportMedia(args, meta, rawVideoUrl) {
  const localPaths = {}
  let localVideoPath = ''
  let localCoverPath = ''
  try {
    localVideoPath = await downloadMedia(rawVideoUrl, args.paths.videosDir, {
      prefix: 'video_',
      fetcher: args.fetcher,
    })
    localPaths.video = localVideoPath
  } catch (downErr) {
    const message = `视频素材下载落盘失败: ${args.formatErrorMessage(downErr)}`
    return { error: fail(502, message) }
  }
  localCoverPath = await downloadCoverBestEffort(args, meta, localPaths)
  return { localPaths, localVideoPath, localCoverPath }
}

async function downloadCoverBestEffort(args, meta, localPaths) {
  if (!meta.cover_url || !HTTP_URL_RE.test(meta.cover_url)) return ''
  try {
    const saved = await downloadMedia(meta.cover_url, args.paths.coversDir, {
      prefix: 'cover_',
      fetcher: args.fetcher,
    })
    localPaths.cover = saved
    return saved
  } catch {
    return ''
  }
}

export async function handleAnalyze(ctx) {
  const item = ctx.store.get(ctx.id)
  if (!item) return fail(404, 'not found')
  const videoPath = await resolveAnalyzeVideo({ ...ctx, item })
  if (videoPath.error) return videoPath.error
  if (!videoPath.path || !existsSync(videoPath.path)) {
    return fail(422, '未找到本地视频文件，请重新导入以完成视频下载与解析')
  }
  return persistAnalysis(ctx, item, videoPath.path)
}

async function persistAnalysis(ctx, item, videoPath) {
  const analysisResult = await analyzeInspirationVideo({
    videoPath,
    title: item.title,
    content: item.content,
    tags: item.tags,
    platform: item.source_platform,
    videoAnalyzeTool: ctx.videoAnalyzeTool,
  })
  if (!analysisResult.deconstruction) {
    return fail(500, analysisResult.error || 'AI 视频拆解失败，请确保大模型视觉分析服务可用')
  }
  const markdown = analysisResult.deconstruction.markdown || analysisResult.deconstruction.raw_markdown || ''
  let structure = { segments: [], sections: [] }
  try {
    structure = await extractScriptStructure(ctx.textComplete, {
      content: item.content || '',
      markdown,
    })
  } catch {
    structure = { segments: [], sections: [] }
  }
  const deconstruction = {
    ...analysisResult.deconstruction,
    analyzed_at: new Date().toISOString(),
    segments: structure.segments,
    sections: structure.sections,
  }
  const updated = ctx.store.update(ctx.id, {
    deconstruction,
    local_paths: item.local_paths,
  })
  return { status: 200, body: { data: updated } }
}

export async function handleTranslate(ctx) {
  const item = ctx.store.get(ctx.id)
  if (!item) return fail(404, 'not found')
  const lang = String(ctx.req.body?.lang || ctx.req.body?.target || 'zh').trim() || 'zh'
  const analysis = item.deconstruction && typeof item.deconstruction === 'object' ? item.deconstruction : {}
  const segments = Array.isArray(analysis.segments) ? analysis.segments : []
  const source = segments.length
    ? segments.map((row) => row.text).filter(Boolean).join('\n')
    : (item.content || '')
  if (!source.trim()) return fail(422, '暂无脚本文案可翻译')
  if (!ctx.textComplete || typeof ctx.textComplete.execute !== 'function') {
    return fail(503, '文本翻译能力未就绪')
  }
  try {
    const result = await ctx.textComplete.execute({
      reason: 'inspiration-script-translate',
      prompt: buildTranslatePrompt({
        lang,
        source,
        segmentIds: segments.map((row) => row.id),
      }),
      maxTokens: 1800,
    })
    const parsed = parseTranslateJson(result?.text || result, source)
    const updated = ctx.store.update(ctx.id, {
      script_translation: {
        lang,
        text: parsed.text,
        segments: parsed.segments,
      },
    })
    return { status: 200, body: { data: updated } }
  } catch (error) {
    return fail(502, error instanceof Error ? error.message : String(error))
  }
}

async function resolveAnalyzeVideo(args) {
  const existing = args.item.local_paths?.video
  if (existing) return { path: existing }
  if (!args.item.source_url || !args.socialFetcher) return { path: existing }
  return downloadAnalyzeVideo(args)
}

function videoUrlFromFetched(fetched) {
  const data = fetched && fetched.data ? fetched.data : {}
  return firstHttpUrl([data.video_url, data.video, data.play_url, data.play])
}

async function downloadAnalyzeVideo(args) {
  try {
    const platform = args.item.source_platform || args.detectPlatformFromUrl(args.item.source_url)
    const fetched = await args.socialFetcher({
      platform,
      capability: capabilityOf(platform),
      url: args.item.source_url,
    })
    const vUrl = videoUrlFromFetched(fetched)
    if (!vUrl) return { path: args.item.local_paths?.video }
    const videoPath = await downloadMedia(vUrl, args.paths.videosDir, {
      prefix: 'video_',
      fetcher: args.fetcher,
    })
    args.item.local_paths = { ...(args.item.local_paths || {}), video: videoPath }
    return { path: videoPath }
  } catch (downErr) {
    const message = downErr instanceof Error ? downErr.message : String(downErr)
    return { error: fail(502, `重新下载视频失败: ${message}`) }
  }
}

export async function handleBatchDelete({ req, store }) {
  const body = req.body || {}
  const ids = Array.isArray(body.ids) ? body.ids : []
  if (ids.length === 0) return fail(400, 'ids array is required')
  const result = await store.deleteBatch(ids)
  return { status: 200, body: { data: result } }
}

export function handleGetItem({ id, store }) {
  const item = store.get(id)
  if (!item) return fail(404, 'not found')
  return { status: 200, body: { data: item } }
}

export function handlePatchItem({ id, req, store }) {
  const body = req.body || {}
  const updated = store.update(id, body)
  return { status: 200, body: { data: updated } }
}

export async function handleDeleteItem({ id, store }) {
  const removed = await store.delete(id)
  return { status: 200, body: { data: removed } }
}
