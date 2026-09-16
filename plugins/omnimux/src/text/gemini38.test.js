import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'
import { loadAll, DEFAULT_SPECS_DIR } from '../catalog/contract/index.js'
import { buildModelCatalog } from '../catalog/list.js'
import { executeOmnimuxText } from './execute.js'
import { resolveTextRoute, parseTextConfig } from './catalog.js'

const image = 'data:image/png;base64,iVBORw0KGgoAAAAA'
const video = `data:video/mp4;base64,${Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]).toString('base64')}`
const ref = (type, pathOrUrl) => ({ type, role: 'reference', pathOrUrl })

test('Gemini 3.8 declares multimodal inputs (image, video, audio, document) without inheriting live execution', () => {
  const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false })
  const current = index.get('gemini-3.8-flash')
  const previous = index.get('gemini-3.7-flash')
  assert.equal(current.operations.length, 2)
  const chatOp = current.operations.find((o) => o.id === 'chat')
  const visionOp = current.operations.find((o) => o.id === 'vision_chat')
  assert.equal(chatOp.listed, true)
  assert.equal(visionOp.listed, true)
  assert.equal(visionOp.label, '多模态对话')
  const slots = visionOp.inputs.map((s) => s.slot)
  assert.deepEqual(slots, ['prompt', 'reference_images', 'reference_videos', 'reference_audios', 'reference_documents'])
  assert.equal(current.execution.status, 'none')
  const patch = parse(readFileSync(new URL('../../cordis.patch.yml', import.meta.url), 'utf8'))
  const provider = patch.find((row) => row.id === 'llm-pi-ai').config.providers.omnimux
  const config = (id) => { const { id: _id, name, ...value } = provider.models.find((row) => row.id === id); return value }
  assert.deepEqual(config(current.id), config(previous.id))
  assert.equal(provider.baseURL, 'https://api.omnimux.ai/v1')
  assert.equal(buildModelCatalog({ env: {} }).defaults.text, current.id)
  assert.equal(resolveTextRoute({ model: previous.id }, parseTextConfig(), {}).modelId, previous.id)
})

test('Gemini 3.8 sends every image using the exact model on the OmniMux stream', async () => {
  const sent = []
  const saved = []
  await executeOmnimuxText({ prompt: 'compare', references: [ref('image', image), ref('image', image)], image,
    env: {}, attachments: { async saveImage(value) { saved.push(value); return { attachmentId: `image-${saved.length}` } } },
    llm: { async * stream(value) { sent.push(value); yield { type: 'text-delta', text: 'ok' } } },
  })
  assert.equal(saved.length, 2)
  assert.equal(sent[0].provider, 'omnimux')
  assert.equal(sent[0].model, 'gemini-3.8-flash')
  assert.deepEqual(sent[0].messages[0].content.slice(1).map((part) => part.attachment.attachmentId), ['image-1', 'image-2'])
})

test('Gemini 3.8 video, audio, and document use its own wire id once; unsupported combinations never submit', async () => {
  const sent = []
  const fetcher = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) } }
  const env = { OMNIMUX_BASE_URL: 'https://fixture.invalid/v1', OMNIMUX_API_KEY: 'fixture' }
  await executeOmnimuxText({ prompt: 'describe', operation: 'vision_chat', references: [ref('video', video)], video, env, fetcher })
  assert.equal(sent[0].url, 'https://fixture.invalid/v1/chat/completions')
  assert.equal(sent[0].body.model, 'gemini-3.8-flash')
  assert.equal(sent[0].body.messages[0].content.length, 2)
  assert.equal(sent[0].body.messages[0].content[1].image_url.url, video)

  // 支持 audio
  const audioUri = `data:audio/wav;base64,${Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]).toString('base64')}`
  await executeOmnimuxText({ prompt: 'transcribe', operation: 'vision_chat', references: [ref('audio', audioUri)], env, fetcher })
  assert.equal(sent[1].body.messages[0].content[1].image_url.url, audioUri)

  // 支持 document
  const pdfUri = `data:application/pdf;base64,${Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]).toString('base64')}`
  await executeOmnimuxText({ prompt: 'read pdf', operation: 'vision_chat', references: [ref('document', pdfUri)], env, fetcher })
  assert.equal(sent[2].body.messages[0].content[1].image_url.url, pdfUri)

  for (const references of [[ref('video', video), ref('image', image)], [ref('video', video), ref('video', video)]]) {
    await assert.rejects(executeOmnimuxText({ prompt: 'describe', model: 'gemini-3.8-flash', references, env, fetcher }), { code: 'omnimux-invalid-request' })
  }
  assert.equal(sent.length, 3)
})
