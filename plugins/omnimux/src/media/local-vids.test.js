/**
 * Local Google Vids channel (Issue #3167).
 *
 * The contract under test is the hub's own client for the loopback vids2api
 * service: the field name it must send (`seconds`, never `duration`), the task
 * id it reads, the artifact URL it composes because the poll body carries none,
 * and — most importantly — that a missing or unreachable service fails loudly
 * instead of falling back to another model.
 */
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LOCAL_VIDS_API_KEY_ENV,
  LOCAL_VIDS_BASE_URL_ENV,
  LOCAL_VIDS_MODEL_ID,
  clampLocalVidsSeconds,
  generateLocalVids,
  readLocalVidsConfig,
} from './local-vids.js'

const BASE = 'http://127.0.0.1:8931/v1'

function tempDest() {
  const dir = mkdtempSync(join(tmpdir(), 'local-vids-'))
  return { dir, dest: join(dir, 'out.mp4'), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function guardPlan(prompt = 'a cat') {
  return { prompt, modelId: LOCAL_VIDS_MODEL_ID, operationId: 'text_to_video', byok: true }
}

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
