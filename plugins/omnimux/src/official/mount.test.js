import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseGateConfig } from '../gate/config.js'
import { OmnimuxError } from '../media/errors.js'
import { mountOfficial } from './mount.js'

function registerCapture(gate) {
  const names = []
  /** @type {Record<string, string>} */
  const descriptions = {}
  /** @type {Record<string, object>} */
  const registeredTools = {}
  return {
    names,
    descriptions,
    registeredTools,
    ctx: {
      tools: {
        register(tool) {
          names.push(tool.name)
          descriptions[tool.name] = tool.description
          registeredTools[tool.name] = tool
        },
      },
    },
    deps: {
      hub: { official: { mount: true }, gate: parseGateConfig(gate) },
      identity: { require: async () => ({ id: 'u' }) },
      store: { resolve: async () => 'tok' },
      siteBaseUrl: 'https://omnimux.ai',
      objectParams: (fields) => ({ type: 'object', properties: fields }),
      jsonOut: { type: 'object' },
      rethrow: (error) => {
        throw error
      },
    },
  }
}

describe('official mount', () => {
  it('registered account and publishing tools reject missing source before HTTP', async () => {
    const capture = registerCapture()
    let requests = 0
    capture.deps.fetcher = async () => { requests++; throw new Error('must not access upstream') }
    mountOfficial(capture.ctx, capture.deps)
    for (const name of ['omnimux_accounts_list', 'omnimux_accounts_connect', 'omnimux_accounts_disconnect', 'omnimux_publish_create', 'omnimux_publish_get']) {
      const tool = capture.registeredTools[name]
      assert.deepEqual(tool.parameters.properties.provider.enum, ['tiktok_direct', 'zernio'])
      assert.equal(tool.parameters.properties.provider.required, true)
      await assert.rejects(tool.execute({ id: '1', platform: 'tiktok' }), (error) => error.code === 'invalid-provider')
    }
    assert.equal(requests, 0)
  })
  it('registers official tools by default', () => {
    const capture = registerCapture()
    mountOfficial(capture.ctx, capture.deps)
    assert.ok(capture.names.includes('omnimux_social_data'))
    assert.match(capture.descriptions.omnimux_social_data, /NOT publishing/)
    assert.match(capture.descriptions.omnimux_social_data, /tweet_id/)
    assert.match(capture.descriptions.omnimux_social_data, /media\.video/)
    assert.match(capture.descriptions.omnimux_social_data, /text\/display_text/)
    assert.ok(capture.names.includes('omnimux_accounts_list'))
    assert.ok(capture.names.includes('omnimux_publish_create'))
    assert.ok(capture.names.includes('omnimux_inspiration_list'))
    assert.ok(capture.names.includes('omnimux_analytics_daily_metrics'))
    assert.ok(capture.names.includes('omnimux_analytics_best_time'))
    assert.ok(capture.names.includes('omnimux_analytics_frequency'))
    assert.ok(capture.names.includes('omnimux_analytics_content_decay'))
    assert.ok(capture.names.includes('omnimux_analytics_follower_stats'))
    assert.ok(capture.names.includes('omnimux_analytics_posts'))
    assert.ok(capture.names.includes('omnimux_analytics_sync_external'))
    assert.ok(capture.names.includes('omnimux_analytics_inbox'))
    assert.equal(capture.names.length, 23)
  })

  it('skips official tools when official.mount is false (master switch)', () => {
    const capture = registerCapture()
    mountOfficial(capture.ctx, {
      ...capture.deps,
      hub: { official: { mount: false }, gate: parseGateConfig({ tools: { omnimux_social_data: true } }) },
    })
    assert.equal(capture.names.includes('omnimux_social_data'), false)
    assert.equal(capture.names.length, 0)
  })

  it('skips fine-grained tools when gate.tools.<name> is false', () => {
    const capture = registerCapture({
      tools: {
        omnimux_social_data: false,
        omnimux_analytics_inbox: false,
      },
    })
    mountOfficial(capture.ctx, capture.deps)
    assert.equal(capture.names.includes('omnimux_social_data'), false)
    assert.equal(capture.names.includes('omnimux_analytics_inbox'), false)
    assert.ok(capture.names.includes('omnimux_accounts_list'))
    assert.equal(capture.names.length, 21)
  })

  it('execution-time enforcement throws capability-disabled if gate is disabled', async () => {
    const capture = registerCapture(undefined)
    mountOfficial(capture.ctx, capture.deps)

    const socialTool = capture.registeredTools.omnimux_social_data
    assert.ok(socialTool)

    // Now test a tool with disabled gate
    const disabledCapture = registerCapture({ tools: { omnimux_social_data: false } })
    mountOfficial(disabledCapture.ctx, disabledCapture.deps)
    assert.equal(disabledCapture.registeredTools.omnimux_social_data, undefined)
  })
})
