import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, isConfigured, MATCH_THRESHOLD } from './optimize.js'
import { listTemplates, getTemplate, buildChoiceCriteria, fillTemplate, GENERIC_CRITERIA, FALLBACK_TEMPLATE_ID } from './templates.js'
import { OmnimuxError } from '../media/errors.js'

const ENV = { JEV_API_KEY: 'sk-jev-test' }

function decisionResponse({ choice, probability = 0.9, confidence = 0.85 }) {
  return {
    ok: true,
    json: async () => ({
      model: 'jev-latest',
      answers: {
        decision: {
          type: 'choice',
          choice,
          probabilities: { [choice]: probability, [FALLBACK_TEMPLATE_ID]: 1 - probability },
          confidence,
        },
      },
      usage: { input_tokens: 100, output_tokens: 10 },
    }),
  }
}

test('template asset loads all 21 templates including the generic fallback', () => {
  const templates = listTemplates()
  assert.equal(templates.length, 21)
  assert.ok(getTemplate(FALLBACK_TEMPLATE_ID))
  assert.ok(getTemplate('bugfix-production'))
  assert.equal(getTemplate('missing-id'), undefined)
})

test('buildChoiceCriteria maps every template and locks the generic criteria text', () => {
  const criteria = buildChoiceCriteria()
  assert.equal(Object.keys(criteria).length, 21)
  assert.equal(criteria[FALLBACK_TEMPLATE_ID], GENERIC_CRITERIA)
  assert.equal(
    criteria['bugfix-production'],
    'Bug 修复 · 排查生产环境问题 — 生产环境用户反馈类问题：拉取监控/日志工具中的错误与堆栈，定位根因、修复、补错误处理与回归测试。',
  )
})

test('fillTemplate replaces a {input} slot verbatim', () => {
  const generic = getTemplate(FALLBACK_TEMPLATE_ID)
  const out = fillTemplate(generic, '写清楚一点')
  assert.ok(out.startsWith('写清楚一点'))
  assert.ok(out.includes('要求：'))
  assert.ok(!out.includes('{input}'))
})

test('fillTemplate replaces only the first `[…]` slot and keeps the rest', () => {
  const tpl = getTemplate('bugfix-production')
  const out = fillTemplate(tpl, '登录接口偶尔报 500')
  assert.ok(out.includes('`登录接口偶尔报 500`'))
  // every other `[…]` placeholder stays verbatim for the user to complete
  assert.ok(out.includes('`[Sentry/DataDog/Log monitoring tool]`'))
  assert.equal((out.match(/`\[/g) || []).length, tpl.placeholders.length - 1)
})

test('evaluate routes a matching choice to its template and backfills the draft', async () => {
  let capturedBody = null
  const fetcher = async (url, init) => {
    capturedBody = JSON.parse(init.body)
    return decisionResponse({ choice: 'bugfix-production', probability: 0.92 })
  }

  const res = await evaluate({ fetcher, env: ENV }, '登录接口偶尔报 500')

  assert.equal(capturedBody.model, 'jev-latest')
  assert.deepEqual(capturedBody.state, { user_instruction: '登录接口偶尔报 500' })
  assert.equal(capturedBody.questions.decision.type, 'choice')
  assert.equal(Object.keys(capturedBody.questions.decision.criteria).length, 21)

  assert.equal(res.ok, true)
  assert.equal(res.templateId, 'bugfix-production')
  assert.equal(res.matched, true)
  assert.equal(res.probability, 0.92)
  assert.equal(res.confidence, 0.85)
  assert.ok(res.prompt.includes('`登录接口偶尔报 500`'))
  assert.ok(res.prompt.includes('排查') || res.prompt.includes('生产环境'))
})

test('evaluate routes an explicit generic-optimize choice to the fallback', async () => {
  const fetcher = async () => decisionResponse({ choice: FALLBACK_TEMPLATE_ID, probability: 0.7 })
  const res = await evaluate({ fetcher, env: ENV }, '帮我把这段写得更清楚一点')
  assert.equal(res.matched, false)
  assert.equal(res.templateId, FALLBACK_TEMPLATE_ID)
  assert.ok(res.prompt.startsWith('帮我把这段写得更清楚一点'))
})

test('evaluate falls back when the chosen probability is under the threshold', async () => {
  const fetcher = async () => decisionResponse({ choice: 'review-pr', probability: MATCH_THRESHOLD - 0.01 })
  const res = await evaluate({ fetcher, env: ENV }, '随便写点什么')
  assert.equal(res.matched, false)
  assert.equal(res.templateId, FALLBACK_TEMPLATE_ID)
  assert.equal(res.probability, MATCH_THRESHOLD - 0.01)
})

test('evaluate falls back when the choice is not a known template', async () => {
  const fetcher = async () => decisionResponse({ choice: 'no-such-template', probability: 0.99 })
  const res = await evaluate({ fetcher, env: ENV }, 'x')
  assert.equal(res.matched, false)
  assert.equal(res.templateId, FALLBACK_TEMPLATE_ID)
})

test('evaluate rejects an empty draft without hitting the network', async () => {
  let called = false
  const fetcher = async () => { called = true; return decisionResponse({ choice: 'x' }) }
  await assert.rejects(
    () => evaluate({ fetcher, env: ENV }, '   '),
    (err) => err instanceof OmnimuxError && err.code === 'omnimux-invalid-request',
  )
  assert.equal(called, false)
})

test('isConfigured resolves the key chain without throwing', async () => {
  assert.equal(await isConfigured({ env: ENV }), true)
  assert.equal(await isConfigured({ env: {}, credentialsPath: '/nonexistent/cred.yaml' }), false)
})
