/**
 * Local Google Vids channel (Issue #3167).
 *
 * The contract under test is the hub's own client for the loopback vids2api
 * service: the field name it must send (`seconds`, never `duration`), the task
 * id it reads, the artifact URL it composes because the poll body carries none,
 * and — most importantly — that a missing or unreachable service fails loudly
 * instead of falling back to another model.
 *
 * The seam cases at the end run the real SubmitGuard → mapOmnimuxInput →
 * channel path, because the vendor field names the guard produces
 * (`image_with_roles`, `image_urls`, `video_urls`, `aspect_ratio`) are what the
 * caller actually supplies; a direct-call-only test would miss that wiring.
 */
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

import { assertGuardSubmit } from '../catalog/contract/submit-guard/index.js'
import {
  LOCAL_VIDS_API_KEY_ENV,
  LOCAL_VIDS_BASE_URL_ENV,
  LOCAL_VIDS_MODEL_ID,
  buildLocalVidsRequestBody,
  clampLocalVidsSeconds,
  generateLocalVids,
  normalizeLocalVidsAspectRatio,
  normalizeLocalVidsResolution,
  readLocalVidsConfig,
  resolveLocalVidsVideoId,
} from './local-vids.js'
import { mapOmnimuxInput } from './vendors/omnimux.js'

const BASE = 'http://127.0.0.1:8931/v1'

function tempDest() {
  const dir = mkdtempSync(join(tmpdir(), 'local-vids-'))
  return { dir, dest: join(dir, 'out.mp4'), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function guardPlan(prompt = 'a cat') {
  return { prompt, modelId: LOCAL_VIDS_MODEL_ID, operationId: 'text_to_video', byok: true }
}

/** The channel reports failures through the error code, not the (Chinese) message. */
const invalidRequestError = (error) => error?.code === 'omnimux-invalid-request'

test('readLocalVidsConfig reads the explicit opt-in and trims the trailing slash', () => {
  assert.deepEqual(readLocalVidsConfig({}), { baseUrl: '', apiKey: '' })
  assert.deepEqual(
    readLocalVidsConfig({ [LOCAL_VIDS_BASE_URL_ENV]: `${BASE}/`, [LOCAL_VIDS_API_KEY_ENV]: ' k ' }),
    { baseUrl: BASE, apiKey: 'k' },
  )
})

test('clampLocalVidsSeconds mirrors the service range', () => {
  assert.equal(clampLocalVidsSeconds(undefined), 10)
  assert.equal(clampLocalVidsSeconds(1), 4)
  assert.equal(clampLocalVidsSeconds(99), 12)
  assert.equal(clampLocalVidsSeconds(4), 4)
  assert.equal(clampLocalVidsSeconds('abc'), 10)
})

test('an unconfigured channel fails loudly instead of falling back', async () => {
  const { dest, cleanup } = tempDest()
  try {
    await assert.rejects(
      () => generateLocalVids({ route: { modelId: LOCAL_VIDS_MODEL_ID }, guardPlan: guardPlan(), dest, env: {} }),
      (error) => {
        assert.equal(error.code, 'omnimux-unconfigured')
        assert.match(error.message, /OMNIMUX_VIDS2API_BASE_URL/)
        return true
      },
    )
  } finally {
    cleanup()
  }
})

test('submits seconds (not duration) with the bearer key and downloads the composed content URL', async () => {
  const { dest, cleanup } = tempDest()
  const calls = []
  const bytes = Buffer.from('fake-mp4-bytes')
  const fetcher = async (url, init = {}) => {
    calls.push({ url, init })
    if (init.method === 'POST') {
      return new Response(JSON.stringify({ id: 'task-1', status: 'queued', progress: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(bytes, { status: 200, headers: { 'content-type': 'video/mp4' } })
  }
  const poll = async () => ({ id: 'task-1', status: 'completed', progress: 100 })

  try {
    const result = await generateLocalVids({
      route: { modelId: LOCAL_VIDS_MODEL_ID },
      guardPlan: guardPlan('a cat walking'),
      dest,
      env: { [LOCAL_VIDS_BASE_URL_ENV]: BASE, [LOCAL_VIDS_API_KEY_ENV]: 'k' },
      fetcher,
      poll,
    })

    const submit = calls.find((call) => call.init.method === 'POST')
    assert.equal(submit.url, `${BASE}/videos`)
    assert.equal(submit.init.headers.authorization, 'Bearer k')
    const body = JSON.parse(submit.init.body)
    assert.equal(body.prompt, 'a cat walking')
    assert.equal(body.seconds, 10)
    assert.equal('duration' in body, false)

    assert.equal(result.mode, 'live')
    assert.equal(result.taskId, 'task-1')
    assert.equal(result.url, `${BASE}/videos/task-1/content`)
    assert.equal(statSync(dest).size, bytes.length)
    assert.equal(calls.some((call) => call.url === result.url), true)
  } finally {
    cleanup()
  }
})

test('honours the requested duration and clamps it before the request', async () => {
  const { dest, cleanup } = tempDest()
  let sent
  const fetcher = async (url, init = {}) => {
    if (init.method === 'POST') {
      sent = JSON.parse(init.body)
      return new Response(JSON.stringify({ id: 't' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(Buffer.from('x'), { status: 200, headers: { 'content-type': 'video/mp4' } })
  }
  try {
    await generateLocalVids({
      route: { modelId: LOCAL_VIDS_MODEL_ID },
      guardPlan: { ...guardPlan(), duration: 3 },
      dest,
      env: { [LOCAL_VIDS_BASE_URL_ENV]: BASE },
      fetcher,
      poll: async () => ({ status: 'completed' }),
    })
    assert.equal(sent.seconds, 4)
  } finally {
    cleanup()
  }
})

test('an unreachable service surfaces an actionable request failure', async () => {
  const { dest, cleanup } = tempDest()
  const fetcher = async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:8931') }
  try {
    await assert.rejects(
      () => generateLocalVids({
        route: { modelId: LOCAL_VIDS_MODEL_ID },
        guardPlan: guardPlan(),
        dest,
        env: { [LOCAL_VIDS_BASE_URL_ENV]: BASE },
        fetcher,
        poll: async () => ({ status: 'completed' }),
      }),
      (error) => {
        assert.equal(error.code, 'omnimux-request-failed')
        assert.match(error.message, /本机 Google Vids 服务不可达/)
        assert.match(error.message, /已启动/)
        return true
      },
    )
  } finally {
    cleanup()
  }
})

test('a rejected credential names the key it compared', async () => {
  const { dest, cleanup } = tempDest()
  const fetcher = async () => new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
  try {
    await assert.rejects(
      () => generateLocalVids({
        route: { modelId: LOCAL_VIDS_MODEL_ID },
        guardPlan: guardPlan(),
        dest,
        env: { [LOCAL_VIDS_BASE_URL_ENV]: BASE, [LOCAL_VIDS_API_KEY_ENV]: 'wrong' },
        fetcher,
        poll: async () => ({ status: 'completed' }),
      }),
      (error) => {
        assert.equal(error.code, 'omnimux-invalid-request')
        assert.match(error.message, /OMNIMUX_VIDS2API_API_KEY/)
        assert.match(error.message, /unauthorized/)
        return true
      },
    )
  } finally {
    cleanup()
  }
})

test('an empty artifact is a failure, never a success', async () => {
  const { dest, cleanup } = tempDest()
  writeFileSync(dest, '')
  const fetcher = async (url, init = {}) => {
    if (init.method === 'POST') {
      return new Response(JSON.stringify({ id: 't' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(Buffer.alloc(0), { status: 200, headers: { 'content-type': 'video/mp4' } })
  }
  try {
    await assert.rejects(
      () => generateLocalVids({
        route: { modelId: LOCAL_VIDS_MODEL_ID },
        guardPlan: guardPlan(),
        dest,
        env: { [LOCAL_VIDS_BASE_URL_ENV]: BASE },
        fetcher,
        poll: async () => ({ status: 'completed' }),
      }),
      (error) => {
        assert.match(String(error.code), /omnimux-download-failed|omnimux-invalid-response/)
        return true
      },
    )
  } finally {
    cleanup()
  }
})

test('an empty prompt is rejected before any request is made', async () => {
  const { dest, cleanup } = tempDest()
  let called = false
  const fetcher = async () => { called = true; return new Response('{}', { status: 200 }) }
  try {
    await assert.rejects(
      () => generateLocalVids({
        route: { modelId: LOCAL_VIDS_MODEL_ID },
        guardPlan: guardPlan('   '),
        dest,
        env: { [LOCAL_VIDS_BASE_URL_ENV]: BASE },
        fetcher,
        poll: async () => ({ status: 'completed' }),
      }),
      (error) => {
        assert.equal(error.code, 'omnimux-invalid-request')
        return true
      },
    )
    assert.equal(called, false)
  } finally {
    cleanup()
  }
})

test('resolves a prior video id from a bare id or one of this channel\u2019s own URLs', () => {
  const id = '2d028ceb355444e6b2eebca7'
  assert.equal(resolveLocalVidsVideoId(id, BASE).id, id)
  assert.equal(resolveLocalVidsVideoId(`${BASE}/videos/${id}/content`, BASE).id, id)
  assert.equal(resolveLocalVidsVideoId('', BASE).reason, 'missing')
  assert.equal(resolveLocalVidsVideoId('https://cdn.example.com/a.mp4', BASE).reason, 'foreign')
  assert.equal(resolveLocalVidsVideoId('not-an-id', BASE).reason, 'unrecognized')
})

test('resolution and aspect ratio are checked here because the service forwards them unchecked', () => {
  assert.equal(normalizeLocalVidsResolution('1080p'), '1080p')
  assert.equal(normalizeLocalVidsResolution(''), '')
  assert.throws(() => normalizeLocalVidsResolution('__bogus__'), invalidRequestError)
  assert.equal(normalizeLocalVidsAspectRatio('portrait'), 'portrait')
  assert.equal(normalizeLocalVidsAspectRatio('竖屏'), '竖屏')
  assert.throws(() => normalizeLocalVidsAspectRatio('__bogus__'), invalidRequestError)
})

test('each hub operation maps to its service mode, and a missing input fails loudly', () => {
  const base = { seconds: 4, resolution: '', aspectRatio: '', image: '', videoRef: '', baseUrl: BASE }
  const id = '2d028ceb355444e6b2eebca7'

  assert.deepEqual(
    buildLocalVidsRequestBody({ ...base, operationId: 'text_to_video', prompt: 'a cat', seconds: 8, resolution: '1080p', aspectRatio: 'portrait' }),
    { prompt: 'a cat', seconds: 8, resolution: '1080p', aspect_ratio: 'portrait' },
  )

  assert.deepEqual(
    buildLocalVidsRequestBody({ ...base, operationId: 'first_frame', prompt: '', image: 'https://img.example/a.jpg' }),
    { seconds: 4, mode: 'animate', image_url: 'https://img.example/a.jpg' },
  )
  assert.throws(
    () => buildLocalVidsRequestBody({ ...base, operationId: 'first_frame', prompt: '' }),
    invalidRequestError,
  )

  assert.deepEqual(
    buildLocalVidsRequestBody({ ...base, operationId: 'video_extend', prompt: 'go on', seconds: 8, aspectRatio: 'landscape', videoRef: `${BASE}/videos/${id}/content` }),
    { prompt: 'go on', seconds: 8, aspect_ratio: 'landscape', mode: 'extend', video_id: id },
  )
  assert.throws(
    () => buildLocalVidsRequestBody({ ...base, operationId: 'video_extend', prompt: 'go on' }),
    invalidRequestError,
  )

  assert.deepEqual(
    buildLocalVidsRequestBody({ ...base, operationId: 'video_edit', prompt: 'swap', image: 'https://img.example/b.jpg', videoRef: id }),
    { prompt: 'swap', seconds: 4, mode: 'modify', image_url: 'https://img.example/b.jpg', video_id: id },
  )
  assert.throws(
    () => buildLocalVidsRequestBody({ ...base, operationId: 'video_edit', prompt: 'swap', videoRef: id }),
    invalidRequestError,
  )

  // The service coerces an unknown mode to create; the hub must never get there.
  assert.throws(
    () => buildLocalVidsRequestBody({ ...base, operationId: 'document_to_video', prompt: 'x' }),
    invalidRequestError,
  )
})

test('an image-to-video job sends the animate mode and the image URL upstream', async () => {
  const { dest, cleanup } = tempDest()
  const bodies = []
  const fetcher = async (url, init) => {
    if (String(url).endsWith('/videos')) {
      bodies.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ id: 'abc123abc123abc1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('video-bytes', { status: 200, headers: { 'content-type': 'video/mp4' } })
  }
  try {
    await generateLocalVids({
      route: { modelId: LOCAL_VIDS_MODEL_ID },
      guardPlan: { prompt: '', modelId: LOCAL_VIDS_MODEL_ID, operationId: 'first_frame', byok: true },
      payload: { image: 'https://img.example/a.jpg', duration: 4, aspect_ratio: 'portrait' },
      dest,
      env: { [LOCAL_VIDS_BASE_URL_ENV]: BASE },
      fetcher,
      poll: async () => ({ status: 'completed' }),
    })
    assert.deepEqual(bodies[0], {
      seconds: 4,
      mode: 'animate',
      image_url: 'https://img.example/a.jpg',
      aspect_ratio: 'portrait',
    })
  } finally {
    cleanup()
  }
})

/**
 * Drive the seam the way `media/execute.js` wires it: SubmitGuard →
 * mapOmnimuxInput → the channel. The service stays a stub fetcher, so these
 * cases prove the guard-to-channel field mapping instead of restating one
 * function: the guard's vendor payload is the only shape the seam delivers.
 */
function seamRequest(request) {
  const guardPlan = assertGuardSubmit(
    { prompt: '', model: LOCAL_VIDS_MODEL_ID, capability: 'video', seam: 'videoGenerate', ...request },
    { seam: 'videoGenerate', capability: 'video', outputType: 'video' },
  )
  return { guardPlan, payload: mapOmnimuxInput('video', { prompt: guardPlan.prompt, guardPlan }) }
}

/** Record what the channel posts to /videos and answer the way vids2api does. */
function stubService() {
  const bodies = []
  const fetcher = async (url, init = {}) => {
    if (String(url).endsWith('/videos')) {
      bodies.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ id: '2d028ceb355444e6b2eebca7' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('video-bytes', { status: 200, headers: { 'content-type': 'video/mp4' } })
  }
  return { bodies, fetcher }
}

const SEAM_ENV = { [LOCAL_VIDS_BASE_URL_ENV]: BASE }
const completedPoll = async () => ({ status: 'completed' })

test('a first_frame image supplied through the guard reaches the service as image_url', async () => {
  const { dest, cleanup } = tempDest()
  const { bodies, fetcher } = stubService()
  try {
    const { guardPlan, payload } = seamRequest({
      operation: 'first_frame',
      prompt: 'make it move',
      references: [{ type: 'image', role: 'first_frame', pathOrUrl: 'https://img.example/a.jpg' }],
    })
    // The guard, not the caller, names this field; the channel must read it.
    assert.deepEqual(payload.image_with_roles, [{ url: 'https://img.example/a.jpg', role: 'first_frame' }])

    await generateLocalVids({
      route: { modelId: LOCAL_VIDS_MODEL_ID }, guardPlan, payload, dest,
      env: SEAM_ENV, fetcher, poll: completedPoll,
    })

    assert.equal(bodies[0].mode, 'animate')
    assert.equal(bodies[0].image_url, 'https://img.example/a.jpg')
  } finally {
    cleanup()
  }
})

test('a video_edit replacement image and source video supplied through the guard reach the service', async () => {
  const { dest, cleanup } = tempDest()
  const { bodies, fetcher } = stubService()
  const taskId = '2d028ceb355444e6b2eebca7'
  const sourceUrl = `${BASE}/videos/${taskId}/content`
  try {
    const { guardPlan, payload } = seamRequest({
      operation: 'video_edit',
      prompt: 'swap the jacket',
      references: [
        { type: 'video', role: 'source', pathOrUrl: sourceUrl },
        { type: 'image', role: 'reference', pathOrUrl: 'https://img.example/b.jpg' },
      ],
    })
    assert.deepEqual(payload.image_urls, ['https://img.example/b.jpg'])
    assert.deepEqual(payload.video_urls, [sourceUrl])

    await generateLocalVids({
      route: { modelId: LOCAL_VIDS_MODEL_ID }, guardPlan, payload, dest,
      env: SEAM_ENV, fetcher, poll: completedPoll,
    })

    assert.equal(bodies[0].mode, 'modify')
    assert.equal(bodies[0].image_url, 'https://img.example/b.jpg')
    assert.equal(bodies[0].video_id, taskId)
  } finally {
    cleanup()
  }
})

test('resolution and aspect ratio declared for this model survive the guard', async () => {
  const { dest, cleanup } = tempDest()
  const { bodies, fetcher } = stubService()
  try {
    const chosen = seamRequest({
      operation: 'text_to_video', prompt: 'a cat', resolution: '1080p', aspectRatio: 'portrait',
    })
    assert.equal(chosen.payload.resolution, '1080p')
    assert.equal(chosen.payload.aspect_ratio, 'portrait')
    await generateLocalVids({
      route: { modelId: LOCAL_VIDS_MODEL_ID }, guardPlan: chosen.guardPlan, payload: chosen.payload, dest,
      env: SEAM_ENV, fetcher, poll: completedPoll,
    })
    assert.equal(bodies[0].resolution, '1080p')
    assert.equal(bodies[0].aspect_ratio, 'portrait')

    // Declaring them is what stops the guard from dropping them: with no
    // explicit value the declared defaults still reach the service.
    const defaults = seamRequest({ operation: 'text_to_video', prompt: 'a cat' })
    assert.equal(defaults.payload.resolution, '720p')
    assert.equal(defaults.payload.aspect_ratio, 'landscape')
    await generateLocalVids({
      route: { modelId: LOCAL_VIDS_MODEL_ID }, guardPlan: defaults.guardPlan, payload: defaults.payload, dest,
      env: SEAM_ENV, fetcher, poll: completedPoll,
    })
    assert.equal(bodies[1].resolution, '720p')
    assert.equal(bodies[1].aspect_ratio, 'landscape')
  } finally {
    cleanup()
  }
})

test('an undeclared resolution is refused rather than silently dropped', async () => {
  assert.throws(
    () => seamRequest({ operation: 'text_to_video', prompt: 'a cat', resolution: '__bogus__' }),
    (error) => {
      assert.equal(error.code, 'omnimux-invalid-request')
      assert.match(error.message, /resolution/)
      return true
    },
  )

  // The channel keeps its own whitelist for callers that reach it directly.
  const { dest, cleanup } = tempDest()
  let called = false
  const fetcher = async () => { called = true; return new Response('{}', { status: 200 }) }
  try {
    await assert.rejects(
      () => generateLocalVids({
        route: { modelId: LOCAL_VIDS_MODEL_ID },
        guardPlan: guardPlan('a cat'),
        payload: { resolution: '__bogus__' },
        dest,
        env: SEAM_ENV,
        fetcher,
        poll: completedPoll,
      }),
      (error) => {
        assert.equal(error.code, 'omnimux-invalid-request')
        assert.match(error.message, /分辨率/)
        return true
      },
    )
    assert.equal(called, false)
  } finally {
    cleanup()
  }
})
