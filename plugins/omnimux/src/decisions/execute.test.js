import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeState, buildQuestions, executeJevDecision } from './execute.js'
import { resolveOpenRouterApiKey } from './client.js'

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

test('resolveOpenRouterApiKey resolves key precedence', async () => {
  const fromResolver = await resolveOpenRouterApiKey({
    resolveApiKey: () => 'sk-from-resolver',
    env: { OPENROUTER_API_KEY: 'sk-from-env' },
  })
  assert.equal(fromResolver, 'sk-from-resolver')

  const fromEnv = await resolveOpenRouterApiKey({
    env: { OPENROUTER_API_KEY: 'sk-from-env' },
  })
  assert.equal(fromEnv, 'sk-from-env')

  const fromCred = await resolveOpenRouterApiKey({
    credentials: {
      resolve: async (ref) => (ref === 'OPENROUTER_API_KEY' ? { value: 'sk-from-cred' } : undefined),
    },
  })
  assert.equal(fromCred, 'sk-from-cred')
})

test('executeJevDecision succeeds with mock response', async () => {
  const mockFetcher = async () => ({
    ok: true,
    json: async () => ({
      model: 'typesafe/jev-1.13-20260917',
      answers: {
        decision: {
          type: 'choice',
          choice: 'approve',
          probabilities: { approve: 0.95, reject: 0.05 },
          confidence: 0.9,
        },
      },
      usage: { input_tokens: 120, output_tokens: 10, cost: 0.000005 },
      id: 'gen-test-123',
      provider: 'TypeSafe',
    }),
  })

  const res = await executeJevDecision(
    { fetcher: mockFetcher, env: { OPENROUTER_API_KEY: 'sk-test' } },
    {
      state: 'All test suites passed with 100% code coverage.',
      choices: { approve: 'Approve', reject: 'Reject' },
    },
  )

  assert.equal(res.mode, 'live')
  assert.equal(res.model, 'typesafe/jev-1.13-20260917')
  assert.equal(res.decision, 'approve')
  assert.equal(res.confidence, 0.9)
  assert.equal(res.provider, 'TypeSafe')
})

test('executeJevDecision handles score question correctly', async () => {
  const mockFetcher = async () => ({
    ok: true,
    json: async () => ({
      model: 'typesafe/jev-1.13-20260917',
      answers: {
        score: {
          type: 'score',
          score: 4.5,
          probabilities: { '0': 0.0, '1': 0.0, '2': 0.1, '3': 0.3, '4': 0.6 },
          confidence: 0.8,
        },
      },
      usage: { input_tokens: 150, output_tokens: 15, cost: 0.000006 },
      id: 'gen-test-456',
      provider: 'TypeSafe',
    }),
  })

  const res = await executeJevDecision(
    { fetcher: mockFetcher, env: { OPENROUTER_API_KEY: 'sk-test' } },
    {
      state: 'Quality evaluation',
      score_criteria: ['1', '2', '3', '4', '5'],
    },
  )

  assert.equal(res.score, 4.5)
  assert.equal(res.confidence, 0.8)
})
