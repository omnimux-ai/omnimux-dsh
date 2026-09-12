import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickVideoSrc } from './api.js'
import { importLocaleKeys, importPillLabel, importStageKey, importStageLabel, importingIds } from './import-status.js'
import { canAnalyzeInspiration } from './inspiration-preview-data.js'
import { en, zh } from './locales.js'

const here = fileURLToPath(new URL('.', import.meta.url))

/**
 * Gate for the local video source contract.
 *
 * The player used to build `/omnimux/inspiration/local/media/<id>/video.mp4` by
 * hand. No such route exists: `streamLocalMedia` maps
 * `/omnimux/inspiration/local/media/<subpath>` onto `join(mediaDir, subpath)`, so
 * the request was a guaranteed 404 and every local video rendered a blank
 * `<video>`. `media_urls[0]` is what `buildImportRecord` actually writes, and it
 * is the only field the client may turn into a source.
 */
describe('pickVideoSrc — local video source contract', () => {
  it('returns media_urls[0] verbatim for a local record', () => {
    const row = {
      id: 'insp_1',
      type: 'video',
      media_urls: ['/omnimux/inspiration/local/media/videos/video_ab12cd34.mp4'],
      local_paths: { video: '/Users/x/.omnimux/media/videos/video_ab12cd34.mp4' },
    }
    assert.equal(pickVideoSrc(row), '/omnimux/inspiration/local/media/videos/video_ab12cd34.mp4')
  })

  it('passes an absolute http(s) source through', () => {
    const row = { media_urls: ['https://cdn.example.com/clips/a.mp4'] }
    assert.equal(pickVideoSrc(row), 'https://cdn.example.com/clips/a.mp4')
  })

  it('returns an empty string for a record with no media', () => {
    assert.equal(pickVideoSrc({ media_urls: [] }), '')
    assert.equal(pickVideoSrc({}), '')
    assert.equal(pickVideoSrc(null), '')
    assert.equal(pickVideoSrc(undefined), '')
    assert.equal(pickVideoSrc('not-a-row'), '')
  })

  it('never derives a URL from an absolute local_paths.video', () => {
    const row = {
      id: 'insp_2',
      type: 'video',
      media_urls: [],
      local_paths: { video: '/Users/x/.omnimux/media/videos/video_ab12cd34.mp4' },
    }
    assert.equal(pickVideoSrc(row), '')
  })

  it('never derives a URL from local_paths.video when media_urls is absent', () => {
    assert.equal(pickVideoSrc({ local_paths: { video: '/Users/x/media/v.mp4' } }), '')
    // A Windows-style absolute path is just as unusable.
    assert.equal(pickVideoSrc({ local_paths: { video: 'C:\\media\\v.mp4' } }), '')
  })

  it('ignores a non-string or empty first entry', () => {
    assert.equal(pickVideoSrc({ media_urls: [null, '/omnimux/inspiration/local/media/videos/v.mp4'] }), '/omnimux/inspiration/local/media/videos/v.mp4')
    assert.equal(pickVideoSrc({ media_urls: [{ url: 'x' }] }), '')
    assert.equal(pickVideoSrc({ media_urls: ['', 'https://cdn.example.com/a.mp4'] }), 'https://cdn.example.com/a.mp4')
  })
})

/**
 * Media paths must come from `media_urls`, never from an id or a local file path.
 *
 * The pattern is deliberately shape-based rather than a fixed string: a literal
 * needle silently stops matching as soon as the surrounding code is reformatted
 * or a different variable name is used, and the gate then passes for the wrong
 * reason. Anything that interpolates an expression ending in `id` (or `.id`) into
 * a `media/.../<name>.mp4|jpg` path is the broken shape, whatever it is called.
 */
const FORBIDDEN_MEDIA_URL = /media\/\$\{[^}]*\bid\b[^}]*\}\/[^'"`]*\.(?:mp4|jpg|jpeg|png)/

/**
 * Client sources that can render or hand off a media URL. Kept explicit so the
 * scan cannot silently pass because it walked an empty directory.
 */
const MEDIA_SOURCE_FILES = [
  'api.js',
  'InspirationCoverCard.jsx',
  'InspirationPreviewModal.jsx',
  'InspirationSection.jsx',
  'feed-helpers.js',
  'inspiration-preview-data.js',
  'use-inspiration-feed.js',
  'replicate-to-chat.js',
  'composer-inject.js',
]

function scanForbiddenMediaUrls() {
  const offenders = []
  for (const name of MEDIA_SOURCE_FILES) {
    const source = readFileSync(join(here, name), 'utf8')
    if (FORBIDDEN_MEDIA_URL.test(source)) offenders.push(name)
  }
  return offenders
}

describe('local media URL shape regression lock', () => {
  it('scans the files that actually exist', () => {
    // Without this, a renamed file would make the scan below vacuous.
    const present = new Set(readdirSync(here))
    for (const name of MEDIA_SOURCE_FILES) {
      assert.ok(present.has(name), `the scan list must not reference the missing file ${name}`)
    }
  })

  it('detects the removed per-id template shape', () => {
    // Proves the pattern bites, so a clean scan below means something.
    const broken = 'const u = `/omnimux/inspiration/local/media/${encodeURIComponent(item.id)}/video.mp4`'
    assert.ok(FORBIDDEN_MEDIA_URL.test(broken), 'the guard pattern must match the exact bug it exists for')
  })

  it('no client module builds a media URL from an item id', () => {
    const offenders = scanForbiddenMediaUrls()
    assert.deepEqual(
      offenders,
      [],
      `these modules interpolate an item id into a media path no route serves: ${offenders.join(', ')}`,
    )
  })

  it('no client module reads local_paths.video as a url source', () => {
    // `local_paths.video` is an absolute filesystem path; feeding it to a URL
    // builder produces `/omnimux/inspiration/media//Users/…`.
    const offenders = []
    for (const name of MEDIA_SOURCE_FILES) {
      const source = readFileSync(join(here, name), 'utf8')
      if (/hostMediaSrc\([^)]*local_paths/.test(source)) offenders.push(name)
    }
    assert.deepEqual(offenders, [], `these modules build a URL from a local file path: ${offenders.join(', ')}`)
  })
})

describe('import status locale mapping', () => {
  it('maps every import stage to a locale key', () => {
    assert.equal(importStageKey('resolving'), 'add.status.resolving')
    assert.equal(importStageKey('downloading'), 'add.status.downloading')
    assert.equal(importStageKey('analyzing'), 'add.status.analyzing')
    assert.equal(importStageKey('persisting'), 'add.status.persisting')
  })

  it('falls back instead of rendering nothing for an unknown stage', () => {
    assert.equal(importStageKey(''), 'add.status.resolving')
    assert.equal(importStageKey(null), 'add.status.resolving')
    assert.equal(importStageKey('something-new'), 'add.status.resolving')
  })

  it('has every stage key in both locales', () => {
    for (const key of importLocaleKeys()) {
      assert.equal(typeof zh[key], 'string', `zh is missing ${key}`)
      assert.equal(typeof en[key], 'string', `en is missing ${key}`)
      assert.ok(zh[key].length > 0, `zh.${key} must not be empty`)
      assert.ok(en[key].length > 0, `en.${key} must not be empty`)
    }
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  })

  it('renders no pill for a settled row and a staged pill for a running one', () => {
    const t = (key) => zh[key] || key
    assert.equal(importPillLabel({ import_status: 'ready' }, t), '')
    assert.equal(importPillLabel({}, t), '')
    assert.equal(importPillLabel({ import_status: 'degraded' }, t), '')
    assert.equal(importPillLabel({ import_status: 'importing', import_stage: 'analyzing' }, t), zh['add.status.analyzing'])
    assert.equal(importPillLabel({ import_status: 'failed' }, t), zh['add.status.failed'])
  })

  it('renders the stage label only while a row is importing', () => {
    const t = (key) => zh[key] || key
    assert.equal(importStageLabel({ import_status: 'importing', import_stage: 'downloading' }, t), zh['add.status.downloading'])
    assert.equal(importStageLabel({ import_status: 'ready' }, t), '')
  })

  it('collects exactly the ids still importing', () => {
    const items = [
      { id: 'a', import_status: 'importing' },
      { id: 'b', import_status: 'ready' },
      { id: 'c', import_status: 'failed' },
      { id: 'd', import_status: 'importing', import_stage: 'analyzing' },
      { id: 'e' },
    ]
    assert.deepEqual(importingIds(items), ['a', 'd'])
    assert.deepEqual(importingIds(null), [])
  })
})

describe('canAnalyzeInspiration — background import branch', () => {
  it('refuses a video row whose import is still running', () => {
    const row = { type: 'video', source_url: 'https://x.com/a/status/1', import_status: 'importing' }
    assert.equal(canAnalyzeInspiration(row), false)
  })

  it('allows a video row once the import settled', () => {
    const row = { type: 'video', source_url: 'https://x.com/a/status/1', import_status: 'ready' }
    assert.equal(canAnalyzeInspiration(row), true)
  })

  it('still refuses a non-video row and still allows a legacy video row', () => {
    assert.equal(canAnalyzeInspiration({ type: 'link', source_url: 'https://x.com/a/status/1' }), false)
    assert.equal(canAnalyzeInspiration({ type: 'video', local_paths: { video: '/tmp/v.mp4' } }), true)
  })
})
