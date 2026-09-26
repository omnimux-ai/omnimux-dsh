import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeState, buildQuestions, executeJevDecision } from './execute.js'
import { resolveGatewayApiKey, resolveDecisionsBaseUrl, DEFAULT_JEV_MODEL } from './client.js'
import { OmnimuxError } from '../media/errors.js'

test('normalizeState validates required state', () => {
  assert.throws(() => normalizeState(''), /state is required/)
  assert.throws(() => normalizeState(null), /state is required/)
  assert.throws(() => normalizeState(undefined), /state is required/)
  assert.equal(normalizeState('hello world'), 'hello world')
  const obj = { foo: 'bar' }
  assert.deepEqual(normalizeState(obj), obj)
})

test('buildQuestions constructs choice question properly', () => {
  const qDict = buildQuestions({
    choices: { approve: 'Pass review', reject: 'Request changes' },
    instructions: 'Evaluate thoroughly',
  })
  assert.equal(qDict.decision.type, 'choice')
  assert.equal(qDict.decision.instructions, 'Evaluate thoroughly')
  assert.deepEqual(qDict.decision.criteria, { approve: 'Pass review', reject: 'Request changes' })

  const qList = buildQuestions({
    choices: ['A', 'B'],
  })
  assert.equal(qList.decision.type, 'choice')
  assert.deepEqual(qList.decision.criteria, { A: 'A', B: 'B' })
})

test('buildQuestions constructs score question properly', () => {
  const q = buildQuestions({
    score_criteria: ['Poor', 'Fair', 'Good', 'Excellent'],
  })
  assert.equal(q.score.type, 'score')
  assert.deepEqual(q.score.criteria, ['Poor', 'Fair', 'Good', 'Excellent'])
})

test('buildQuestions fails when no questions provided', () => {
  assert.throws(() => buildQuestions({}), /At least one question must be specified/)
})

test('resolveDecisionsBaseUrl formats gateway base properly', () => {
  assert.equal(resolveDecisionsBaseUrl(undefined), 'https://api.omnimux.ai/v1')
  assert.equal(resolveDecisionsBaseUrl(''), 'https://api.omnimux.ai/v1')
  assert.equal(resolveDecisionsBaseUrl('https://custom.gateway/v1'), 'https://custom.gateway/v1')
  assert.equal(resolveDecisionsBaseUrl('https://custom.gateway'), 'https://custom.gateway/v1')
})

test('resolveGatewayApiKey resolves key precedence', async () => {
  const fromResolver = await resolveGatewayApiKey({
    resolveApiKey: () => 'sk-from-resolver',
    env: { OMNIMUX_API_KEY: 'sk-from-env' },
  })
  assert.equal(fromResolver, 'sk-from-resolver')

  const fromEnvKey = await resolveGatewayApiKey({
    env: { OMNIMUX_API_KEY: 'sk-from-env' },
  })
  assert.equal(fromEnvKey, 'sk-from-env')

  const fromEnvToken = await resolveGatewayApiKey({
    env: { OMNIMUX_TOKEN: 'sk-from-token' },
  })
  assert.equal(fromEnvToken, 'sk-from-token')

  const fromCred = await resolveGatewayApiKey({
    credentials: {
      resolve: async (ref) => (ref === 'OMNIMUX_API_KEY' ? { value: 'sk-from-cred' } : undefined),
    },
  })
  assert.equal(fromCred, 'sk-from-cred')

  await assert.rejects(
    () => resolveGatewayApiKey({ env: {}, credentialsPath: '/nonexistent/cred.yaml' }),
    (err) => err instanceof OmnimuxError && err.code === 'omnimux-unconfigured',
  )
})

test('executeJevDecision calls gateway decisions endpoint with default jev model', async () => {
  let capturedUrl = null
  let capturedHeaders = null
  let capturedBody = null

  const mockFetcher = async (url, init) => {
    capturedUrl = url
    capturedHeaders = init.headers
    capturedBody = JSON.parse(init.body)
    return {
      ok: true,
      json: async () => ({
        model: 'jev-1.13.0',
        answers: {
          decision: {
            type: 'choice',
            choice: 'approve',
            probabilities: { approve: 0.95, reject: 0.05 },
            confidence: 0.9,
          },
        },
        usage: { input_tokens: 120, output_tokens: 10 },
        id: 'gen-test-123',
        provider: 'OmniMux',
      }),
    }
  }

  const res = await executeJevDecision(
    { fetcher: mockFetcher, env: { OMNIMUX_API_KEY: 'sk-test-gateway' } },
    {
      state: 'All test suites passed with 100% code coverage.',
      choices: { approve: 'Approve', reject: 'Reject' },
    },
  )

  assert.equal(capturedUrl, 'https://api.omnimux.ai/v1/decisions')
  assert.equal(capturedHeaders['Authorization'], 'Bearer sk-test-gateway')
  assert.equal(capturedHeaders['Accept'], 'application/json')
  assert.equal(capturedBody.model, DEFAULT_JEV_MODEL)
  assert.equal(capturedBody.model, 'jev')
  assert.equal(capturedBody.state, 'All test suites passed with 100% code coverage.')

  assert.equal(res.mode, 'live')
  assert.equal(res.model, 'jev-1.13.0')
  assert.equal(res.decision, 'approve')
  assert.equal(res.confidence, 0.9)
  assert.equal(res.provider, 'OmniMux')
})

test('executeJevDecision handles score question correctly', async () => {
  const mockFetcher = async () => ({
    ok: true,
    json: async () => ({
      model: 'jev-1.13.0',
      answers: {
        score: {
          type: 'score',
          score: 4.5,
          probabilities: { '0': 0.0, '1': 0.0, '2': 0.1, '3': 0.3, '4': 0.6 },
          confidence: 0.8,
        },
      },
      usage: { input_tokens: 150, output_tokens: 15 },
      id: 'gen-test-456',
    }),
  })

  const res = await executeJevDecision(
    { fetcher: mockFetcher, env: { OMNIMUX_API_KEY: 'sk-test' } },
    {
      state: 'Quality evaluation',
      score_criteria: ['1', '2', '3', '4', '5'],
    },
  )

  assert.equal(res.score, 4.5)
  assert.equal(res.confidence, 0.8)
})

test('executeJevDecision handles gateway quota failure with classified error', async () => {
  const mockFetcher = async () => ({
    ok: false,
    status: 402,
    text: async () => JSON.stringify({ error: { message: 'insufficient user quota' } }),
  })

  await assert.rejects(
    () =>
      executeJevDecision(
        { fetcher: mockFetcher, env: { OMNIMUX_API_KEY: 'sk-test' } },
        {
          state: 'Quota check',
          choices: ['A', 'B'],
        },
      ),
    (err) => err instanceof OmnimuxError && err.code === 'quota-exceeded',
  )
})
