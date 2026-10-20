// @ts-nocheck
// @vitest-environment jsdom
/**
 * Composer hand-off: payload validation and expiry, element discovery, image
 * attachment and the opinion fill rules (never overwrite a draft).
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'vitest'
import {
  POSTER_PENDING_TTL_MS,
  attachPosterImage,
  clearPendingPoster,
  dataUrlByteSize,
  fillPosterText,
  findComposerEditor,
  findFileInput,
  isComposePath,
  parsePendingPoster,
  readPendingPoster,
  runComposeHandoff,
  savePendingPoster,
} from '../src/content/twitter-poster/compose.ts'

const PNG = 'data:image/png;base64,AAAA'
let pending

function installChrome() {
  pending = undefined
  globalThis.chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: () => {},
    },
    storage: {
      local: {
        get: async () => ({ omnimux_x_poster_pending: pending }),
        set: async (values) => { pending = values.omnimux_x_poster_pending },
        remove: async () => { pending = undefined },
      },
    },
  }
}

function validPayload(createdAt) {
  return { dataUrl: PNG, text: '我的观点', sourceUrl: 'https://x.com/a/status/1', theme: 'dark', createdAt }
}

function installComposer() {
  document.body.innerHTML = `
    <div id="editor" data-testid="tweetTextarea_0" role="textbox" contenteditable="true"></div>
    <input id="file" type="file" data-testid="fileInput" accept="image/*">
    <input id="other" type="file" accept="application/pdf">
  `
  return document.getElementById('editor')
}

beforeEach(() => {
  installChrome()
  document.body.innerHTML = ''
})

afterEach(() => {
  delete globalThis.chrome
  delete globalThis.DataTransfer
  delete globalThis.ClipboardEvent
  delete globalThis.document.execCommand
  document.body.innerHTML = ''
})

describe('isComposePath', () => {
  it('recognises the composer routes only', () => {
    assert.equal(isComposePath('/compose/post'), true)
    assert.equal(isComposePath('/compose/post/'), true)
    assert.equal(isComposePath('/compose/tweet'), true)
    assert.equal(isComposePath('/home'), false)
    assert.equal(isComposePath('/alice/status/1'), false)
  })
})

describe('pending payload', () => {
  it('accepts a fresh PNG payload', () => {
    const parsed = parsePendingPoster(validPayload(1000), 2000)
    assert.equal(parsed.text, '我的观点')
    assert.equal(parsed.theme, 'dark')
  })

  it('rejects expired, future and malformed payloads', () => {
    assert.equal(parsePendingPoster(validPayload(1000), 1000 + POSTER_PENDING_TTL_MS + 1), null)
    assert.equal(parsePendingPoster(validPayload(200000), 1000), null)
    assert.equal(parsePendingPoster({ dataUrl: 'jpeg-data' }, 1000), null)
    assert.equal(parsePendingPoster(null, 1000), null)
  })

  it('sizes a base64 data URL from its decoded body', () => {
    assert.equal(dataUrlByteSize(PNG), 3)
  })

  it('clears a malformed entry when reading it', async () => {
    pending = { dataUrl: 'not-an-image' }
    const parsed = await readPendingPoster()
    assert.equal(parsed, null)
    assert.equal(pending, undefined)
    await clearPendingPoster()
  })

  it('round-trips a payload through storage', async () => {
    await savePendingPoster(validPayload(1000))
    const parsed = await readPendingPoster(1001)
    assert.equal(parsed.text, '我的观点')
  })
})

describe('composer discovery', () => {
  it('finds the editable composer', () => {
    const editor = installComposer()
    assert.equal(findComposerEditor(document), editor)
  })

  it('prefers the X file input test id over other file inputs', () => {
    installComposer()
    assert.equal(findFileInput(document).id, 'file')
  })
})

describe('attachPosterImage', () => {
  it('writes the PNG into the input and dispatches change', async () => {
    const changed = []
    const input = {
      files: null,
      dispatchEvent: (event) => { changed.push(event.type); return true },
    }
    globalThis.DataTransfer = class {
      files = []
      items = { add: (file) => { this.files.push(file) } }
    }

    const ok = await attachPosterImage(PNG, document, input)
    assert.equal(ok, true)
    assert.equal(input.files.length, 1)
    assert.equal(input.files.at(0).name, 'omnimux-poster.png')
    assert.ok(changed.includes('change'))
  })
})

describe('fillPosterText', () => {
  it('refuses to overwrite an existing draft', async () => {
    const editor = installComposer()
    editor.textContent = '已有内容'
    assert.equal(await fillPosterText('新观点', document, editor), 'occupied')
  })

  it('fills an empty editor through the execCommand fallback', async () => {
    const editor = installComposer()
    globalThis.ClipboardEvent = undefined
    document.execCommand = (_command, _ui, text) => {
      editor.textContent = text
      return true
    }
    assert.equal(await fillPosterText('新的个人观点', document, editor), 'filled')
    assert.equal(editor.textContent, '新的个人观点')
  })

  it('reports a missing editor instead of writing to the page', async () => {
    assert.equal(await fillPosterText('观点', document, null), 'no-editor')
  })
})

describe('runComposeHandoff', () => {
  it('attaches nothing without a file input but still prefills and clears the payload', async () => {
    const editor = installComposer()
    document.getElementById('file')?.remove()
    document.getElementById('other')?.remove()
    document.execCommand = (_command, _ui, text) => {
      editor.textContent = text
      return true
    }
    await savePendingPoster(validPayload(Date.now()))

    const result = await runComposeHandoff({ waitMs: 300, pollMs: 20 })
    assert.equal(result.status, 'done')
    assert.equal(result.attached, false)
    assert.equal(result.filled, 'filled')
    assert.equal(editor.textContent, '我的观点')
    assert.equal(await readPendingPoster(), null)
  })
})
