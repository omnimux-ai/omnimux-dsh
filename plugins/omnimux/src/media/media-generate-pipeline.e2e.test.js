import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveExecutionPlan } from './execution-plan.js'

const here = dirname(fileURLToPath(import.meta.url))

test('E2E: 直连生成路由渠道透传与官方多模态自适应契约验证', async () => {
  const httpSource = await readFile(resolve(here, 'direct-http.js'), 'utf8')
  assert.ok(httpSource.includes('body.group') && httpSource.includes('body.channel'))
  assert.ok(httpSource.includes('group: requestedGroup'))

  const official = resolveExecutionPlan({ kind: 'image', req: { model: 'gpt-image-2.5' }, current: {
    runtimeAgentId: 'fixture-agent', runtimeAgentVerified: true,
    scenarioBindings: { text: { channel: 'agent' }, image: { channel: 'official' } },
  } })
  assert.equal(official.isOfficialRequest, true)
  assert.equal(official.finalReq.provider, 'omnimux')
  assert.equal(official.modelId, 'gpt-image-2.5')
  assert.throws(() => resolveExecutionPlan({ kind: 'image', req: { model: 'gpt-image-2.5@byok-custom' }, current: {} }), { code: 'omnimux-unconfigured' })

  const tabSource = await readFile(resolve(here, '../../../omnimux-viewer/src/media-viewer/MediaViewerTab.jsx'), 'utf8')
  assert.ok(tabSource.includes(".filter((item) => item && (item.url || item.status === 'generating'))"))
})
