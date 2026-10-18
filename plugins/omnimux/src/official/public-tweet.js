import { OmnimuxError } from '../media/errors.js'

/**
 * Read X's public embed data without credentials. Only the requested post's own
 * attachments are returned; quoted posts and card previews are separate works.
 * @param {string} id numeric post identity, never a URL or arbitrary host
 * @param {{ fetcher?: typeof fetch, signal?: AbortSignal, timeoutMs?: number }} [options]
 */
export async function fetchPublicTweet(id, options = {}) {
  if (!/^\d+$/.test(id)) throw new OmnimuxError('omnimux-invalid-request', 'invalid tweet id')
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 8000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  signal.throwIfAborted()
  try {
    const response = await (options.fetcher ?? fetch)(
      `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=0`,
      { signal, redirect: 'error', headers: { accept: 'application/json' } },
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    signal.throwIfAborted()
    if (String(data?.id_str || '') !== id) throw new Error('public post unavailable')
    const details = Array.isArray(data.mediaDetails) ? data.mediaDetails : []
    const videos = details.filter((item) => item?.type === 'video' || item?.type === 'animated_gif')
    if (videos.some((item) => !item.video_info?.variants?.some((variant) => variant.content_type === 'video/mp4' && /^https:\/\//.test(variant.url || '')))) {
      throw new Error('public video has no downloadable variant')
    }
    if (details.some((item) => item?.type === 'photo' && !/^https:\/\//.test(item.media_url_https || ''))) {
      throw new Error('public photo has no download address')
    }
    if (!details.length && !String(data.text || '').trim()) throw new Error('public post has no content')
    const images = details.filter((item) => item?.type === 'photo').map((item) => item.media_url_https).filter(Boolean)
    return {
      ...data,
      media: { video: videos },
      images,
      cover_url: videos[0]?.media_url_https || images[0] || '',
      duration: videos[0]?.video_info?.duration_millis != null ? videos[0].video_info.duration_millis / 1000 : undefined,
    }
  } catch (cause) {
    if (options.signal?.aborted) options.signal.throwIfAborted()
    throw new OmnimuxError('omnimux-request-failed', '推特公开素材暂时无法读取', { cause })
  }
}
