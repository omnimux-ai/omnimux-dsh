import assert from 'node:assert/strict'
import { test } from 'node:test'
import path from 'node:path'
import { createProducedRegistry } from '../src/produced-registry.ts'

const SESSION = 'session-1'
const PNG = '/media/out/image.png'
const MP4 = '/media/out/clip.mp4'
const DEST = '/media/out/generated.png'

/** tool/call event the bridge forwards for one model-requested invocation. */
function toolCall(callId: string, name: string) {
  return { type: 'tool/call', seq: 1, time: 1, data: { turn: 1, step: 0, callId, name, arguments: '{}' } }
}

/** tool/result event with a single tool-result block. */
function toolResult(callId: string, options: {
  isError?: boolean
  eventError?: { name: string; code: string }
  meta?: unknown
  texts?: string[]
} = {}) {
  return {
    type: 'tool/result',
    seq: 2,
    time: 2,
    data: {
      turn: 1,
      step: 0,
      message: {
        role: 'user',
        content: [{
          type: 'tool-result',
          toolCallId: callId,
          ...(options.isError === undefined ? {} : { isError: options.isError }),
          content: (options.texts ?? ['done']).map(text => ({ type: 'text', text })),
        }],
      },
      ...(options.eventError === undefined ? {} : { error: options.eventError }),
      ...(options.meta === undefined ? {} : { meta: options.meta }),
    },
  }
}

/** A well-formed DisplayValue meta block for display_file. */
function meta(displayPath: string, overrides: Record<string, unknown> = {}) {
  return { path: displayPath, kind: 'image', mediaType: 'image/png', bytes: 10, inContext: false, ...overrides }
}

test('registers a DisplayValue meta path and serves it normalized', () => {
  const registry = createProducedRegistry()
  registry.observeEvent(SESSION, toolResult('c1', { meta: meta(PNG) }))
  assert.equal(registry.lookup(SESSION, PNG), path.resolve(path.normalize(PNG)))
  // The same file spelled differently resolves to the same grant.
  assert.ok(registry.lookup(SESSION, '/media/out/../out/image.png') !== undefined)
  assert.equal(registry.lookup(SESSION, '/media/other/image.png'), undefined)
  assert.equal(registry.lookup('other-session', PNG), undefined)
})

test('rejects meta that is not a DisplayValue', () => {
  const registry = createProducedRegistry()
  for (const bad of [
    meta(PNG, { kind: 'weird' }),
    meta(PNG, { mediaType: '' }),
    meta(PNG, { bytes: -1 }),
    meta(PNG, { inContext: 'no' }),
    meta(''),
    { path: PNG },
    'string',
    42,
  ]) {
    registry.observeEvent(SESSION, toolResult('c1', { meta: bad }))
  }
  assert.equal(registry.lookup(SESSION, PNG), undefined)
})

test('registers <path> envelopes carried in result text blocks', () => {
  const registry = createProducedRegistry()
  registry.observeEvent(SESSION, toolResult('c1', {
    texts: [`<path>${PNG}</path>\n<type>image</type>\n<media>image/png</media>`],
  }))
  assert.ok(registry.lookup(SESSION, PNG) !== undefined)
  // Non-absolute envelope payloads are ignored.
  registry.observeEvent(SESSION, toolResult('c2', { texts: ['<path>relative/out.png</path>'] }))
  assert.equal(registry.lookup(SESSION, 'relative/out.png'), undefined)
})

test('registers a submit tool dest only when its call name is whitelisted and paired', () => {
  const registry = createProducedRegistry()
  const json = JSON.stringify({ ok: true, dest: DEST })
  // Result without a known call name: not registered.
  registry.observeEvent(SESSION, toolResult('orphan', { texts: [json] }))
  assert.equal(registry.lookup(SESSION, DEST), undefined)

  // Paired to a non-whitelisted tool: not registered.
  registry.observeEvent(SESSION, toolCall('c-browser', 'browser_click'))
  registry.observeEvent(SESSION, toolResult('c-browser', { texts: [json] }))
  assert.equal(registry.lookup(SESSION, DEST), undefined)

  // Paired to a whitelisted submit tool: registered.
  registry.observeEvent(SESSION, toolCall('c-submit', 'omnimux_image_submit'))
  registry.observeEvent(SESSION, toolResult('c-submit', { texts: [json] }))
  assert.ok(registry.lookup(SESSION, DEST) !== undefined)

  // mode:'submitted' carries no dest: nothing registered.
  registry.observeEvent(SESSION, toolCall('c-mode', 'omnimux_video_submit'))
  registry.observeEvent(SESSION, toolResult('c-mode', { texts: [JSON.stringify({ mode: 'submitted' })] }))
  assert.equal(registry.lookup(SESSION, '/nowhere.mp4'), undefined)
})

test('skips isError results entirely', () => {
  const registry = createProducedRegistry()
  registry.observeEvent(SESSION, toolResult('c-err', { isError: true, meta: meta(PNG), texts: [`<path>${MP4}</path>`] }))
  assert.equal(registry.lookup(SESSION, PNG), undefined)
  assert.equal(registry.lookup(SESSION, MP4), undefined)
  // The event-level error identity refuses the same way.
  registry.observeEvent(SESSION, toolResult('c-err2', { eventError: { name: 'Error', code: 'x' }, meta: meta(PNG) }))
  assert.equal(registry.lookup(SESSION, PNG), undefined)
})

test('ignores non-tool events and malformed event shapes', () => {
  const registry = createProducedRegistry()
  registry.observeEvent(SESSION, { type: 'user/message', data: { message: { content: [{ type: 'text', text: `<path>${PNG}</path>` }] } } })
  registry.observeEvent(SESSION, null)
  registry.observeEvent(SESSION, 'tool/result')
  registry.observeEvent('', toolResult('c1', { meta: meta(PNG) }))
  assert.equal(registry.lookup(SESSION, PNG), undefined)
})

test('keeps sessions isolated', () => {
  const registry = createProducedRegistry()
  registry.observeEvent('a', toolResult('c1', { meta: meta(PNG) }))
  assert.equal(registry.lookup('b', PNG), undefined)
  assert.ok(registry.lookup('a', PNG) !== undefined)
})

test('backfills from a session.history value including out-of-order call pairing', () => {
  const registry = createProducedRegistry()
  const json = JSON.stringify({ dest: DEST })
  registry.observeHistory(SESSION, {
    events: [
      // Result precedes its call in the page listing order: pairing must
      // still work because the map is collected over the whole history.
      { event: toolResult('hc', { texts: [json] }) },
      { event: toolCall('hc', 'omnimux_video_submit') },
      { event: toolResult('hm', { meta: meta(PNG) }) },
      { event: { type: 'assistant/message', data: {} } },
    ],
    hasMore: false,
  })
  assert.ok(registry.lookup(SESSION, DEST) !== undefined)
  assert.ok(registry.lookup(SESSION, PNG) !== undefined)

  registry.observeHistory('other', { events: 'not-an-array' })
  registry.observeHistory('other', 'not-an-object')
  assert.equal(registry.lookup('other', PNG), undefined)
})

test('forgets a session on drop', () => {
  const registry = createProducedRegistry()
  registry.observeEvent(SESSION, toolResult('c1', { meta: meta(PNG) }))
  assert.ok(registry.lookup(SESSION, PNG) !== undefined)
  registry.drop(SESSION)
  assert.equal(registry.lookup(SESSION, PNG), undefined)
})

test('refuses relative and drive-relative lookups outright', () => {
  const registry = createProducedRegistry()
  registry.observeEvent(SESSION, toolResult('c1', { meta: meta(PNG) }))
  assert.equal(registry.lookup(SESSION, 'media/out/image.png'), undefined)
  assert.equal(registry.lookup(SESSION, ''), undefined)
  assert.equal(registry.lookup(SESSION, undefined as unknown as string), undefined)
})
