import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { saveCloudAssetToLocal } from './cloud-save.js'
import { ASSETS_CHANGED_EVENT } from './assets-events.js'

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type
    this.detail = init.detail
  }
}

function fakeWindow() {
  const dispatched = []
  return {
    dispatched,
    dispatchEvent(event) {
      dispatched.push(event)
      return true
    },
  }
}

describe('saveCloudAssetToLocal', () => {
  it('posts the row id and the row name to the library', async () => {
    const calls = []
    const win = fakeWindow()
    const result = await saveCloudAssetToLocal(
      { id: 'audio-voice-bbb', name: '林潇 2.0' },
      {
        window: win,
        CustomEvent: FakeCustomEvent,
        request: async (id, options) => {
          calls.push({ id, options })
          return { ok: true, status: 200, body: { asset: { id: 'local-1' } } }
        },
      },
    )

    assert.deepEqual(calls, [{ id: 'audio-voice-bbb', options: { name: '林潇 2.0' } }])
    assert.equal(result.ok, true)
    assert.equal(result.asset.id, 'local-1')
  })

  it('announces the new local asset on the window so the local feed refreshes', async () => {
    const win = fakeWindow()
    await saveCloudAssetToLocal(
      { id: 'character-abc', name: 'Luna' },
      { window: win, CustomEvent: FakeCustomEvent, request: async () => ({ ok: true, body: {} }) },
    )
    assert.equal(win.dispatched.length, 1)
    assert.equal(win.dispatched[0].type, ASSETS_CHANGED_EVENT)
  })

  it('does not announce anything when the copy failed', async () => {
    const win = fakeWindow()
    const result = await saveCloudAssetToLocal(
      { id: 'character-abc', name: 'Luna' },
      {
        window: win,
        CustomEvent: FakeCustomEvent,
        request: async () => ({ ok: false, status: 409, body: { error: 'name-conflict', message: '名称已存在' } }),
      },
    )
    assert.equal(result.ok, false)
    assert.equal(result.status, 409)
    assert.equal(result.error, '名称已存在')
    assert.equal(win.dispatched.length, 0)
  })

  it('surfaces the error code when the Host sends no human message', async () => {
    const result = await saveCloudAssetToLocal(
      { id: 'x', name: 'x' },
      {
        window: fakeWindow(),
        CustomEvent: FakeCustomEvent,
        request: async () => ({ ok: false, status: 500, body: { error: 'library-unavailable' } }),
      },
    )
    assert.equal(result.ok, false)
    assert.equal(result.error, 'library-unavailable')
  })

  it('refuses a row with no id without calling the Host', async () => {
    let called = 0
    const result = await saveCloudAssetToLocal(
      { name: 'no id' },
      { window: fakeWindow(), request: async () => { called += 1; return { ok: true, body: {} } } },
    )
    assert.equal(result.ok, false)
    assert.equal(result.error, 'no-asset')
    assert.equal(called, 0)
  })
})
