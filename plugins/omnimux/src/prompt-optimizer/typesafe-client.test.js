import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { postSystemOne, resolveJevApiKey, JEV_MODEL, SYSTEMONE_ENDPOINT } from './typesafe-client.js'
import { OmnimuxError } from '../media/errors.js'

test('resolveJevApiKey resolves env first, then credentials service, then the yaml file', async () => {
  const fromEnv = await resolveJevApiKey({ env: { JEV_API_KEY: 'sk-from-env' } })
  assert.equal(fromEnv, 'sk-from-env')

  const fromCred = await resolveJevApiKey({
    env: {},
    credentials: { resolve: async (ref) => (ref === 'JEV_API_KEY' ? { value: 'sk-from-cred' } : undefined) },
  })
  assert.equal(fromCred, 'sk-from-cred')

  const dir = mkdtempSync(join(tmpdir(), 'jev-cred-'))
  try {
    const credPath = join(dir, '.credentials.yaml')
    writeFileSync(credPath, 'version: 1\nrefs:\n  JEV_API_KEY: "sk-from-yaml"\n')
    const fromYaml = await resolveJevApiKey({ env: {}, credentialsPath: credPath })
    assert.equal(fromYaml, 'sk-from-yaml')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveJevApiKey throws omnimux-unconfigured when no tier has a key', async () => {
  await assert.rejects(
    () => resolveJevApiKey({ env: {}, credentialsPath: '/nonexistent/cred.yaml' }),
    (err) =>
      err instanceof OmnimuxError
      && err.code === 'omnimux-unconfigured'
      && err.message === 'set JEV_API_KEY to use prompt optimizer',
  )
})

test('postSystemOne posts to the TypeSafe systemone endpoint with jev-latest and Bearer auth', async () => {
  let capturedUrl = null
  let capturedInit = null
  const fetcher = async (url, init) => {
    capturedUrl = url
    capturedInit = init
    return { ok: true, json: async () => ({ model: 'jev-latest', answers: {} }) }
  }

  const signal = AbortSignal.timeout(5000)
  await postSystemOne(
    { fetcher, env: { JEV_API_KEY: 'sk-jev-test' } },
    { state: { user_instruction: 'hi' }, questions: { decision: { type: 'choice', criteria: { a: 'A' } } } },
    { signal },
  )

  assert.equal(capturedUrl, SYSTEMONE_ENDPOINT)
  assert.equal(capturedUrl, 'https://api.typesafe.ai/v1/systemone')
  assert.equal(capturedInit.method, 'POST')
  assert.equal(capturedInit.headers['Authorization'], 'Bearer sk-jev-test')
  assert.equal(capturedInit.headers['Content-Type'], 'application/json')
  assert.equal(capturedInit.signal, signal)
  const body = JSON.parse(capturedInit.body)
  assert.equal(body.model, JEV_MODEL)
  assert.equal(body.model, 'jev-latest')
  assert.deepEqual(body.state, { user_instruction: 'hi' })
})

test('postSystemOne surfaces non-2xx as omnimux-upstream-error with the status', async () => {
  const fetcher = async () => ({
    ok: false,
    status: 429,
    text: async () => JSON.stringify({ error: { message: 'rate limited' } }),
  })

  await assert.rejects(
    () => postSystemOne({ fetcher, env: { JEV_API_KEY: 'sk-jev' } }, { state: {}, questions: {} }),
    (err) =>
      err instanceof OmnimuxError
      && err.code === 'omnimux-upstream-error'
      && err.status === 429
      && err.message === 'rate limited',
  )
})

test('postSystemOne throws omnimux-unconfigured before any fetch when the key is missing', async () => {
  let called = false
  const fetcher = async () => { called = true }
  await assert.rejects(
    () => postSystemOne(
      { fetcher, env: {}, credentialsPath: '/nonexistent/cred.yaml' },
      { state: {}, questions: {} },
    ),
    (err) => err instanceof OmnimuxError && err.code === 'omnimux-unconfigured',
  )
  assert.equal(called, false)
})
