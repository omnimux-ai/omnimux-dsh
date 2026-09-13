// @vitest-environment jsdom
/**
 * Local inspiration library: de-duplication by media address, the newest-first
 * cap, and graceful recovery from a store that throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MEDIA_INSPIRATION_KEY,
  MEDIA_INSPIRATION_LIMIT,
  appendMediaInspiration,
  readMediaInspiration,
} from '../src/background/media-library.ts'
import type { HoveredMedia } from '../src/content/media-hover/types.ts'

function media(src: string, id = `image:${src}`): HoveredMedia {
  return {
    id,
    type: 'image',
    src,
    previewSrc: src,
    pageUrl: 'https://page.example.com/',
    pageTitle: '示例页面',
    width: 400,
    height: 300,
    naturalWidth: 800,
    naturalHeight: 600,
    alt: '',
    capturedAt: 1_700_000_000_000,
  }
}

/** Minimal in-memory chrome.storage.local stand-in. */
function stubStorage(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial))
  const set = vi.fn(async (patch: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(patch)) data.set(key, value)
  })
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: data.get(key) })),
        set,
      },
    },
  })
  return { data, set }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('reading the library', () => {
  it('returns an empty list when nothing was stored', async () => {
    stubStorage()
    expect(await readMediaInspiration()).toEqual([])
  })

  it('drops entries that do not match the record shape', async () => {
    stubStorage({ [MEDIA_INSPIRATION_KEY]: [{ src: 'https://x/1.png' }, { nope: true }, null] })
    const records = await readMediaInspiration()
    expect(records).toHaveLength(0)
  })

  it('survives a storage backend that throws', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => { throw new Error('quota') }), set: vi.fn() } },
    })
    expect(await readMediaInspiration()).toEqual([])
  })
})

describe('appending a record', () => {
  it('stores the newest record first', async () => {
    const { data } = stubStorage()
    const first = await appendMediaInspiration(media('https://cdn/a.png', 'a'), 1_000)
    await appendMediaInspiration(media('https://cdn/b.png', 'b'), 2_000)

    expect(first.ok).toBe(true)
    const stored = data.get(MEDIA_INSPIRATION_KEY) as Array<{ id: string; savedAt: number }>
    expect(stored.map((record) => record.id)).toEqual(['b', 'a'])
    expect(stored[0]?.savedAt).toBe(2_000)
  })

  it('de-duplicates by media address, so one image keeps one slot', async () => {
    const { data, set } = stubStorage()
    await appendMediaInspiration(media('https://cdn/a.png', 'a'), 1_000)
    set.mockClear()

    const result = await appendMediaInspiration(media('https://cdn/a.png', 'a-again'), 2_000)

    expect(result.duplicate).toBe(true)
    // Nothing was written, but the media is genuinely in the library.
    expect(result.ok).toBe(true)
    expect(result.total).toBe(1)
    expect(set).not.toHaveBeenCalled()
    expect((data.get(MEDIA_INSPIRATION_KEY) as unknown[]).length).toBe(1)
  })

  it('evicts the oldest record once the cap is exceeded', async () => {
    const seeded = Array.from({ length: MEDIA_INSPIRATION_LIMIT }, (_unused, index) => ({
      ...media(`https://cdn/${index}.png`, `id-${index}`),
      savedAt: index,
    }))
    const { data } = stubStorage({ [MEDIA_INSPIRATION_KEY]: seeded })

    const result = await appendMediaInspiration(media('https://cdn/newest.png', 'newest'), 9_999)

    expect(result.evicted).toBe(1)
    expect(result.total).toBe(MEDIA_INSPIRATION_LIMIT)
    const stored = data.get(MEDIA_INSPIRATION_KEY) as Array<{ id: string }>
    expect(stored).toHaveLength(MEDIA_INSPIRATION_LIMIT)
    expect(stored[0]?.id).toBe('newest')
    expect(stored.some((record) => record.id === `id-${MEDIA_INSPIRATION_LIMIT - 1}`)).toBe(false)
  })

  it('reports a failed write instead of pretending the record landed', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => { throw new Error('quota') }) } },
    })
    const result = await appendMediaInspiration(media('https://cdn/a.png', 'a'), 1_000)
    expect(result.total).toBe(0)
    expect(result.duplicate).toBe(false)
    // The caller paints the saved mark from this flag alone.
    expect(result.ok).toBe(false)
  })
})
