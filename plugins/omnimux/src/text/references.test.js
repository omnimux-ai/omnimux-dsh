import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { executeOmnimuxText } from './execute.js'
import { normalizeTextReferences } from './references.js'
import { mountTextComplete } from './mount.js'
import { parseTextConfig } from './catalog.js'

const first = 'data:image/png;base64,iVBORw0KGgoAAAAA'
const second = 'data:image/png;base64,iVBORw0KGgoAAAAB'
const video = `data:video/mp4;base64,${Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]).toString('base64')}`
const ref = (pathOrUrl, type = 'image') => ({ type, pathOrUrl, role: 'reference' })

function fixture() {
  const saved = []
  const calls = []
  return {
    saved, calls,
    attachments: { async saveImage(image) { saved.push(image); return { attachmentId: `image-${saved.length}` } } },
    llm: { async * stream(options) { calls.push(options); yield { type: 'text-delta', text: 'done' } } },
  }
}

describe('ordered text references', () => {
  it('preserves canonical duplicates and roles while deduplicating legacy aliases', () => {
    const canonical = [{ ...ref(first), targetSlot: 'reference_images' }, ref(second), ref(first)]
    assert.deepEqual(normalizeTextReferences({ references: canonical, image: first }), canonical)
    assert.deepEqual(normalizeTextReferences({ references: [ref(video, 'video')], video }), [ref(video, 'video')])
    const audio = { ...ref('/clip.wav', 'audio'), role: 'reference' }
    assert.deepEqual(normalizeTextReferences({ references: [audio], audioTrack: { pathOrUrl: '/clip.wav' } }), [audio])
  })

  it('rejects malformed references and legacy fields instead of dropping media', () => {
    for (const input of [
      { references: {} }, { references: [null] }, { references: [ref('')] },
      { references: [ref('/clip', 'document')] }, { image: 2 }, { audioTrack: {} },
    ]) assert.throws(() => normalizeTextReferences(input), { code: 'omnimux-invalid-request' })
  })

  it('sends every image in order, with no duplicate legacy image', async () => {
    const deps = fixture()
    await executeOmnimuxText({ prompt: 'compare', model: 'claude-opus-4-6', operation: 'vision_chat', references: [ref(second), ref(first)], image: second, ...deps })
    assert.equal(deps.saved.length, 2)
    assert.deepEqual([...deps.saved[0].data], [...Buffer.from(second.split(',')[1], 'base64')])
    assert.deepEqual(deps.calls[0].messages[0].content.slice(1).map((part) => part.attachment.attachmentId), ['image-1', 'image-2'])
  })

  it('validates all references before writing attachments or starting the provider', async () => {
    for (const references of [
      Array.from({ length: 11 }, () => ref(first)),
      [ref(first), { ...ref(second), role: 'last_frame' }],
      [ref(first), { ...ref(second), targetSlot: 'not_a_slot' }],
      [ref(first), ref('/audio.wav', 'audio')],
    ]) {
      const deps = fixture()
      await assert.rejects(() => executeOmnimuxText({ prompt: 'compare', model: 'claude-opus-4-6', operation: 'vision_chat', references, ...deps }), { code: 'omnimux-invalid-request' })
      assert.equal(deps.saved.length, 0)
      assert.equal(deps.calls.length, 0)
    }
  })

  it('rejects legacy audio and multiple videos before provider submission', async () => {
    let calls = 0
    for (const media of [{ audioTrack: { pathOrUrl: '/audio.wav' } }, { audio: '/audio.wav' }, { references: [ref(video, 'video'), ref(video, 'video')] }]) {
      await assert.rejects(() => executeOmnimuxText({ prompt: 'describe', model: 'gemini-3.7-flash', operation: 'vision_chat', ...media, fetcher: async () => { calls++; throw new Error('must not call') } }), { code: 'omnimux-invalid-request' })
    }
    assert.equal(calls, 0)
  })

  it('forwards the canonical video once through the existing gateway mapper', async () => {
    let body
    await executeOmnimuxText({
      prompt: 'describe', references: [ref(video, 'video')], video, operation: 'vision_chat',
      env: { OMNIMUX_API_KEY: 'fixture', OMNIMUX_BASE_URL: 'https://fixture.invalid/v1' },
      fetcher: async (_url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ choices: [{ message: { content: 'done' } }] }) } },
    })
    assert.equal(body.messages[0].content.length, 2)
    assert.equal(body.messages[0].content[1].image_url.url, video)
  })

  it('the tool forwards references and operation to the same guard as the seam', async () => {
    const deps = fixture()
    let tool
    let seam
    mountTextComplete({ tools: { register(value) { tool = value } }, provide(_name, value) { seam = value }, get(name) { return deps[name] } }, { text: parseTextConfig() }, {}, (error) => { throw error })
    const input = { prompt: 'compare', model: 'claude-opus-4-6', operation: 'vision_chat', references: [ref(first), ref(second)], reason: 'user requested comparison' }
    assert.ok(tool.parameters.properties.references)
    await tool.execute(input, {})
    await seam.execute(input)
    assert.equal(deps.saved.length, 4)
    await assert.rejects(() => tool.execute({ ...input, operation: 'chat' }, {}), { code: 'omnimux-invalid-request' })
    assert.equal(deps.calls.length, 2)
  })
})
