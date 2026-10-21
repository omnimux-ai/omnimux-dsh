// @vitest-environment jsdom
/**
 * The extension talks to models through the local OmniMux/DSH service only.
 *
 * This guards the boundary statically: neither the manifest's extension-page
 * network policy nor any background source may name a model vendor endpoint,
 * carry an embedded bearer credential, or drop the local channel that makes the
 * feature work. Reading the sources keeps the check deterministic and prevents
 * "delete the feature to make the guard green".
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRIDGE_COMPLETE_TEXT_METHOD } from 'omnimux-browser/src/protocol.ts'
import {
  buildDownloadFilename,
  filenameFromUrl,
  sanitizeDownloadFilename,
  startMediaDownload,
  type DownloadOptions,
  type MediaDownloadDeps,
} from '../src/background/media-download.ts'
import {
  createXVariantLookup,
  isValidTweetId,
  syndicationToken,
  tweetResultUrl,
} from '../src/background/x-video-variants.ts'
import { vi } from 'vitest'

const EXTENSION_ROOT = join(import.meta.dirname, '..')

/** Hosts the extension page is allowed to reach: loopback plus the existing source. */
const ALLOWED_CONNECT_HOSTS = new Set([
  'ws://127.0.0.1:*',
  'http://127.0.0.1:*',
  'https://raw.githubusercontent.com',
])

/** Model vendor endpoints that must never appear in shipped extension source. */
const VENDOR_ENDPOINTS = [
  'api.deepseek.com',
  'api.apikey.fun',
  'api.openai.com',
  'api.anthropic.com',
  'api.moonshot.cn',
]

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) found.push(path)
  }
  return found
}

function connectSources(): string[] {
  const manifest = JSON.parse(readFileSync(join(EXTENSION_ROOT, 'manifest.json'), 'utf8')) as {
    content_security_policy?: { extension_pages?: string }
  }
  const policy = manifest.content_security_policy?.extension_pages ?? ''
  const directive = policy.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('connect-src'))
  return directive === undefined ? [] : directive.split(/\s+/).slice(1)
}

describe('the extension network boundary', () => {
  it('allows only loopback and the existing source in the extension page policy', () => {
    const sources = connectSources()
    expect(sources.length).toBeGreaterThan(0)
    for (const source of sources) {
      expect(ALLOWED_CONNECT_HOSTS.has(source), `unexpected connect-src entry: ${source}`).toBe(true)
    }
  })

  it('names no model vendor endpoint anywhere in the extension source', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(EXTENSION_ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8')
      for (const endpoint of VENDOR_ENDPOINTS) {
        if (text.includes(endpoint)) offenders.push(`${file.slice(EXTENSION_ROOT.length + 1)} → ${endpoint}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('embeds no credential constant in the extension source', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(join(EXTENSION_ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8')
      // A bearer credential smuggled through atob, or a raw sk- secret.
      if (/atob\(\s*['"][A-Za-z0-9+/=]{24,}/.test(text)) offenders.push(`${file.slice(EXTENSION_ROOT.length + 1)} → atob credential`)
      if (/['"]sk-[A-Za-z0-9-]{16,}['"]/.test(text)) offenders.push(`${file.slice(EXTENSION_ROOT.length + 1)} → inline secret`)
    }
    expect(offenders).toEqual([])
  })

  it('routes text completion through the local bridge and nowhere else', () => {
    // #1991: the copilot completion is one bridge RPC to the local host; the
    // former HTTP endpoint and its session.prompt fallback are gone.
    const background = readFileSync(join(EXTENSION_ROOT, 'src/background/index.ts'), 'utf8')
    expect(BRIDGE_COMPLETE_TEXT_METHOD).toBe('bridge.completeText')
    expect(background).toContain('gatewayRpc(BRIDGE_COMPLETE_TEXT_METHOD, { prompt: userMessage, system: systemPrompt })')
    expect(background).not.toContain('/omnimux/text/complete')
  })

  it('has no credential material in a built bundle when one is present', () => {
    const bundle = join(EXTENSION_ROOT, 'dist/background.js')
    if (!existsSync(bundle)) return
    const text = readFileSync(bundle, 'utf8')
    for (const endpoint of VENDOR_ENDPOINTS) {
      expect(text.includes(endpoint), `built bundle names ${endpoint}`).toBe(false)
    }
  })
})

/**
 * Media download channel: filename derivation and start contract.
 *
 * The worker must only hand the browser a real http(s) address, must always
 * pass the fixed save options, and must report a started download only for a
 * positive integer id. The filename is generated here so query strings never
 * become names and CJK / Windows-illegal / over-long basenames still land as
 * real files.
 */
function downloadDeps(download: (options: DownloadOptions) => Promise<unknown>): MediaDownloadDeps {
  return { download } as unknown as MediaDownloadDeps
}

describe('the media download channel', () => {
  it('keeps CJK names and replaces Windows-illegal characters', () => {
    expect(sanitizeDownloadFilename('视频 截图.PNG', 'fallback.png')).toBe('视频 截图.PNG')
    expect(sanitizeDownloadFilename('a/b\\c:d*e?f"g<h>i|j.mp4', 'fallback.mp4'))
      .toBe('a-b-c-d-e-f-g-h-i-j.mp4')
  })

  it('drops control characters and trims edge spaces and dots', () => {
    expect(sanitizeDownloadFilename('clip\u0000\u001f.mp4', 'fallback.mp4')).toBe('clip.mp4')
    expect(sanitizeDownloadFilename(' .trim me. ', 'fallback')).toBe('trim me')
    expect(sanitizeDownloadFilename('name.', 'fallback')).toBe('name')
  })

  it('bounds a long name to 120 characters and keeps the extension', () => {
    const long = sanitizeDownloadFilename(`${'x'.repeat(300)}.mp4`, 'fallback.mp4')
    expect(long.length).toBe(120)
    expect(long.endsWith('.mp4')).toBe(true)
    expect(sanitizeDownloadFilename('中'.repeat(300), 'fallback.png').length).toBe(120)
  })

  it('falls back when the requested name cleans away to nothing', () => {
    expect(sanitizeDownloadFilename('', 'fallback.mp4')).toBe('fallback.mp4')
    expect(sanitizeDownloadFilename('   ', 'fallback.mp4')).toBe('fallback.mp4')
    expect(sanitizeDownloadFilename('...', 'fallback.mp4')).toBe('fallback.mp4')
    expect(sanitizeDownloadFilename('', '')).toBe('download')
  })

  it('reads the basename from the path and never from the query string', () => {
    expect(filenameFromUrl('https://cdn.example.com/media/photo.PNG?format=jpg&name=large', 'media'))
      .toBe('photo.PNG')
    expect(filenameFromUrl('https://cdn.example.com/path/%E8%A7%86%E9%A2%91.mp4?token=SECRET', 'media'))
      .toBe('视频.mp4')
    const withQuery = filenameFromUrl('https://x.test/download?file=a.mp4', 'media')
    expect(withQuery).toBe('download')
    expect(withQuery.includes('a.mp4')).toBe(false)
  })

  it('decodes path segments and keeps separators out of the name', () => {
    const decoded = filenameFromUrl('https://cdn.example.com/a%2Fb.mp4', 'media')
    expect(decoded).toBe('a-b.mp4')
    expect(decoded.includes('/')).toBe(false)
  })

  it('survives a malformed percent escape in the basename', () => {
    expect(filenameFromUrl('https://cdn.example.com/%E4%B8%AD%ZZ.png', 'media').endsWith('.png')).toBe(true)
  })

  it('completes a basename without extension from the fallback', () => {
    expect(filenameFromUrl('https://cdn.example.com/media/ABC123?format=jpg', 'video.mp4')).toBe('ABC123.mp4')
    expect(filenameFromUrl('https://cdn.example.com/media/ABC123', 'media')).toBe('ABC123')
    expect(filenameFromUrl('https://cdn.example.com/', 'video.mp4')).toBe('video.mp4')
    expect(filenameFromUrl('not a url', 'fallback.jpg')).toBe('fallback.jpg')
  })

  it('prefers a sanitized requested name over the URL basename', () => {
    expect(buildDownloadFilename({
      url: 'https://cdn.example.com/clip.mp4',
      filename: 'My Clip: 1080p?.mp4',
      type: 'video',
    })).toBe('My Clip- 1080p-.mp4')
    expect(buildDownloadFilename({ url: 'https://cdn.example.com/a.png', filename: 'cover.png' }))
      .toBe('cover.png')
  })

  it('derives a name from the URL when none is requested', () => {
    expect(buildDownloadFilename({ url: 'https://cdn.example.com/media/clip.mp4', type: 'video' }))
      .toBe('clip.mp4')
    expect(buildDownloadFilename({
      url: 'https://pbs.twimg.com/media/ABC?format=jpg&name=large',
      type: 'image',
    })).toBe('ABC.jpg')
  })

  it('completes the extension by media type', () => {
    expect(buildDownloadFilename({ url: 'https://cdn.example.com/media/ABC', filename: 'clip', type: 'video' }))
      .toBe('clip.mp4')
    expect(buildDownloadFilename({ url: 'https://cdn.example.com/media/ABC', filename: 'clip', type: 'image' }))
      .toBe('clip.jpg')
    expect(buildDownloadFilename({ url: 'https://cdn.example.com/media/ABC', filename: 'clip' }))
      .toBe('clip.jpg')
    expect(buildDownloadFilename({ url: 'https://cdn.example.com/clip.jpeg', type: 'image' }))
      .toBe('clip.jpeg')
  })

  it('keeps a long requested name inside the 120-character budget', () => {
    const name = buildDownloadFilename({
      url: 'https://cdn.example.com/clip.mp4',
      filename: `${'z'.repeat(300)}.mp4`,
      type: 'video',
    })
    expect(name.length).toBe(120)
    expect(name.endsWith('.mp4')).toBe(true)
  })

  it('starts a download with the fixed save options and reports the id', async () => {
    const download = vi.fn(async () => 42)
    const result = await startMediaDownload({
      url: 'https://video.twimg.com/amplify_video/1/vid/avc1/1920x1080/clip.mp4?tag=12',
      filename: 'x-1-1920x1080.mp4',
      type: 'video',
    }, downloadDeps(download))
    expect(result).toEqual({ ok: true, downloadId: 42, filename: 'x-1-1920x1080.mp4' })
    expect(download).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledWith({
      url: 'https://video.twimg.com/amplify_video/1/vid/avc1/1920x1080/clip.mp4?tag=12',
      filename: 'x-1-1920x1080.mp4',
      saveAs: false,
      conflictAction: 'uniquify',
    })
  })

  it('builds the saved name itself when the request carries none', async () => {
    const download = vi.fn(async () => 7)
    const result = await startMediaDownload({
      url: 'https://pbs.twimg.com/media/ABC?format=jpg&name=large',
      type: 'image',
    }, downloadDeps(download))
    expect(result).toEqual({ ok: true, downloadId: 7, filename: 'ABC.jpg' })
    expect(download).toHaveBeenCalledWith({
      url: 'https://pbs.twimg.com/media/ABC?format=jpg&name=large',
      filename: 'ABC.jpg',
      saveAs: false,
      conflictAction: 'uniquify',
    })
  })

  it('sanitizes the requested name before handing it to the browser', async () => {
    const download = vi.fn(async () => 9)
    const result = await startMediaDownload({
      url: 'https://cdn.example.com/media/clip.mp4',
      filename: 'a/b:c?.mp4',
      pageUrl: 'https://x.test/status/1',
      pageTitle: 'A page',
      type: 'video',
    }, downloadDeps(download))
    expect(result).toEqual({ ok: true, downloadId: 9, filename: 'a-b-c-.mp4' })
    expect(download).toHaveBeenCalledWith({
      url: 'https://cdn.example.com/media/clip.mp4',
      filename: 'a-b-c-.mp4',
      saveAs: false,
      conflictAction: 'uniquify',
    })
  })

  it('maps a rejected download call to download-failed', async () => {
    const failed = downloadDeps(async () => { throw new Error('download refused') })
    await expect(startMediaDownload({ url: 'https://cdn.example.com/clip.mp4' }, failed))
      .resolves.toEqual({ ok: false, code: 'download-failed' })
    const syncThrow = downloadDeps(() => { throw new Error('sync refusal') })
    await expect(startMediaDownload({ url: 'https://cdn.example.com/clip.mp4' }, syncThrow))
      .resolves.toEqual({ ok: false, code: 'download-failed' })
  })

  it('maps a non-positive, fractional, or non-numeric download id to download-failed', async () => {
    const ids: unknown[] = [0, -1, 1.5, Number.NaN, '8', null, undefined]
    for (const id of ids) {
      const download = vi.fn(async () => id)
      const result = await startMediaDownload(
        { url: 'https://cdn.example.com/clip.mp4', type: 'video' },
        downloadDeps(download),
      )
      expect(result).toEqual({ ok: false, code: 'download-failed' })
    }
  })

  it('refuses non-downloadable URLs before touching the browser', async () => {
    const download = vi.fn(async () => 1)
    const deps = downloadDeps(download)
    const invalidUrls: unknown[] = [
      'blob:https://x.test/9f8e',
      'data:video/mp4;base64,AAAA',
      '/relative/clip.mp4',
      'ftp://cdn.example.com/clip.mp4',
      'not a url',
      '',
      null,
      42,
    ]
    for (const url of invalidUrls) {
      const result = await startMediaDownload({ url }, deps)
      expect(result).toEqual({ ok: false, code: 'invalid-url' })
    }
    expect(download).toHaveBeenCalledTimes(0)
  })

  it('refuses a payload that is not a request object', async () => {
    const download = vi.fn(async () => 1)
    const deps = downloadDeps(download)
    const invalidRequests: unknown[] = [null, undefined, 'https://cdn.example.com/clip.mp4', 42, [], true]
    for (const request of invalidRequests) {
      const result = await startMediaDownload(request, deps)
      expect(result).toEqual({ ok: false, code: 'invalid-request' })
    }
    expect(download).toHaveBeenCalledTimes(0)
  })
})

/**
 * X video variant lookup: public token, request shape, failure mapping and the
 * one-success cache.
 *
 * `cdn.syndication.twimg.com` answers CORS only for `platform.twitter.com`, so
 * the content script can never read it and the worker owns the lookup. These
 * cases pin the token derived for the real post from #3581
 * (`x.com/UnitreeRobotics/status/2112819774573179175`), the credential-free
 * request, and the rule that a transient failure is never remembered.
 */
describe('the X video variant lookup', () => {
  const TWEET_ID = '2112819774573179175'
  const TOKEN = '54dmabwaqt9'
  const RESULT = { mediaDetails: [] as unknown[] }

  function response(body: unknown, ok = true): Response {
    return { ok, json: async () => body } as unknown as Response
  }

  function lookupWith(fetch: ReturnType<typeof vi.fn>, now?: () => number) {
    return createXVariantLookup(
      { fetch: fetch as unknown as typeof globalThis.fetch, ...(now === undefined ? {} : { now }) },
    )
  }

  it('derives the public syndication token from the post id', () => {
    expect(syndicationToken(TWEET_ID)).toBe(TOKEN)
  })

  it('builds the tweet-result URL with id, token and language', () => {
    expect(tweetResultUrl(TWEET_ID)).toBe(
      `https://cdn.syndication.twimg.com/tweet-result?id=${TWEET_ID}&token=${TOKEN}&lang=en`,
    )
    expect(tweetResultUrl(TWEET_ID, 'zh')).toContain(`id=${TWEET_ID}`)
    expect(tweetResultUrl(TWEET_ID, 'zh')).toContain(TOKEN)
    expect(tweetResultUrl(TWEET_ID, 'zh')).toContain('lang=zh')
  })

  it('admits only numeric post ids', () => {
    expect(isValidTweetId(TWEET_ID)).toBe(true)
    const invalid: unknown[] = [
      undefined,
      null,
      '',
      'abc',
      '1234',
      '12345678901234567890123456',
      2112819774573179175,
      true,
    ]
    for (const value of invalid) {
      expect(isValidTweetId(value), `accepted ${String(value)}`).toBe(false)
    }
  })

  it('answers invalid-request without fetching for a malformed post id', async () => {
    const fetch = vi.fn()
    const lookup = lookupWith(fetch)
    await expect(lookup('not-a-post')).resolves.toEqual({ ok: false, error: { code: 'invalid-request' } })
    await expect(lookup(undefined)).resolves.toEqual({ ok: false, error: { code: 'invalid-request' } })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requests the public payload once, without credentials', async () => {
    const fetch = vi.fn(async () => response(RESULT))
    const lookup = lookupWith(fetch)
    await expect(lookup(TWEET_ID)).resolves.toEqual({ ok: true, result: RESULT })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      `https://cdn.syndication.twimg.com/tweet-result?id=${TWEET_ID}&token=${TOKEN}&lang=en`,
      expect.objectContaining({ credentials: 'omit', headers: { accept: 'application/json' } }),
    )
  })

  it('reports fetch-failed for a non-200 response, a thrown request or bad JSON', async () => {
    const nonOk = lookupWith(vi.fn(async () => response(RESULT, false)))
    await expect(nonOk(TWEET_ID)).resolves.toEqual({ ok: false, error: { code: 'fetch-failed' } })

    const thrown = lookupWith(vi.fn(async () => { throw new Error('offline') }))
    await expect(thrown(TWEET_ID)).resolves.toEqual({ ok: false, error: { code: 'fetch-failed' } })

    const badJson = lookupWith(vi.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('bad json') },
    } as unknown as Response)))
    await expect(badJson(TWEET_ID)).resolves.toEqual({ ok: false, error: { code: 'fetch-failed' } })
  })

  it('caches one successful payload for the TTL and refetches after it', async () => {
    let now = 1_000
    const fetch = vi.fn(async () => response(RESULT))
    const lookup = lookupWith(fetch, () => now)

    await expect(lookup(TWEET_ID)).resolves.toEqual({ ok: true, result: RESULT })
    await expect(lookup(TWEET_ID)).resolves.toEqual({ ok: true, result: RESULT })
    expect(fetch).toHaveBeenCalledTimes(1)

    now += 60_000
    await lookup(TWEET_ID)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('never caches a failed lookup', async () => {
    const fetch = vi.fn(async () => response(RESULT, false))
    const lookup = lookupWith(fetch)
    await lookup(TWEET_ID)
    await lookup(TWEET_ID)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('evicts the oldest post once the cache limit is reached', async () => {
    const fetch = vi.fn(async () => response(RESULT))
    const lookup = createXVariantLookup(
      { fetch: fetch as unknown as typeof globalThis.fetch },
      { cacheLimit: 2 },
    )
    await lookup('11111')
    await lookup('22222')
    await lookup('33333')
    // `11111` fell out of the bounded cache, so asking for it fetches again.
    await lookup('11111')
    expect(fetch).toHaveBeenCalledTimes(4)
  })
})
