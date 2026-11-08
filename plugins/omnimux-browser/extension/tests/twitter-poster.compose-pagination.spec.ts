// @ts-nocheck
// @vitest-environment jsdom
/**
 * Multi-page payload and attachment contract for the paginated X poster.
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'vitest'
import {
  POSTER_PENDING_MAX_BYTES,
  attachPosterImages,
  parsePendingPoster,
  readPendingPoster,
  savePendingPoster,
} from '../src/content/twitter-poster/compose.ts'

const PNG = 'data:image/png;base64,AAAA'
const PNG2 = 'data:image/png;base64,BBBB'
let stored

function installChrome() {
  stored = undefined
  globalThis.chrome = {
    runtime: { lastError: undefined, sendMessage: () => {} },
    storage: {
      local: {
        get: async () => ({ omnimux_x_poster_pending: stored }),
        set: async (values) => { stored = values.omnimux_x_poster_pending },
        remove: async () => { stored = undefined },
      },
    },
  }
}

function payload(createdAt = Date.now()) {
  return {
    dataUrls: [PNG, PNG2],
    dataUrl: PNG,
    text: '',
    sourceUrl: 'https://x.com/lifesinger/status/1',
    theme: 'light',
    createdAt,
  }
}

beforeEach(() => {
  installChrome()
  document.body.innerHTML = ''
})

afterEach(() => {
  delete globalThis.chrome
  delete globalThis.DataTransfer
  delete globalThis.ClipboardEvent
})

describe('multi-page pending payload', () => {
  it('accepts an ordered dataUrls array and keeps the first as dataUrl', () => {
    const parsed = parsePendingPoster(payload(1000), 2000)
    assert.equal(parsed.dataUrls.length, 2)
    assert.equal(parsed.dataUrl, PNG)
    assert.equal(parsed.dataUrls[1], PNG2)
  })

  it('normalizes a legacy single dataUrl payload into dataUrls', () => {
    const parsed = parsePendingPoster(
      { dataUrl: PNG, text: '', sourceUrl: '', theme: 'dark', createdAt: 1000 },
      2000,
    )
    assert.deepEqual(parsed.dataUrls, [PNG])
    assert.equal(parsed.dataUrl, PNG)
  })

  it('round-trips all pages through chrome storage', async () => {
    await savePendingPoster(payload(1000))
    const parsed = await readPendingPoster(1001)
    assert.deepEqual(parsed.dataUrls, [PNG, PNG2])
    assert.equal(stored.dataUrl, undefined)
    assert.equal(stored.dataUrls.length, 2)
  })
})

describe('attachPosterImages', () => {
  it('adds every page to the composer input in order', async () => {
    const input = {
      files: null,
      events: [],
      dispatchEvent(event) { this.events.push(event.type); return true },
    }
    globalThis.DataTransfer = class {
      files = []
      items = { add: (file) => { this.files.push(file) } }
    }
    const count = await attachPosterImages([PNG, 'bad-image', PNG2], document, input)
    assert.equal(count, 2)
    assert.equal(input.files.length, 2)
    assert.deepEqual(Array.from(input.files, (file) => file.name), ['omnimux-poster-1.png', 'omnimux-poster-2.png'])
    assert.equal(input.events.includes('change'), true)
  })
})

describe('payload size guard', () => {
  it('rejects a payload above the local storage budget', async () => {
    const base64Length = Math.ceil((POSTER_PENDING_MAX_BYTES + 1) * 4 / 3)
    const huge = `data:image/png;base64,${'A'.repeat(base64Length)}`
    let caught = null
    try {
      await savePendingPoster({ ...payload(1000), dataUrls: [huge] })
    } catch (error) {
      caught = error
    }
    assert.equal(caught?.message, '海报过大')
  })
})
