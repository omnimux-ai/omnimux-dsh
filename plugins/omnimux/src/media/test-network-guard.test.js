import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mountMedia } from './mount.js'
import { executeOmnimuxVideo } from './video.js'
import {
  resetTestNetworkAttempts,
  testNetworkAttempts,
  testNetworkOriginalFetchCalls,
} from '../../scripts/test-network-guard.mjs'

describe('test network guard', () => {
  it('blocks the protocol POST when a mounted tool drops an injected runtime', async () => {
    resetTestNetworkAttempts()
    const tools = []
    let injectedRuntimeCalls = 0
    mountMedia({
      tools: { register(tool) { tools.push(tool) } },
      provide() {},
    }, {
      kind: 'video',
      execute: executeOmnimuxVideo,
      media: {
        defaultProvider: 'omnimux',
        providers: {
          omnimux: {
            protocol: 'openai-media',
            baseUrl: 'https://external.test/v1',
            apiKey: 'test-network-guard-key',
            models: { video: 'seedance-2-5' },
          },
        },
      },
      jsonOut: {},
    })

    await assert.rejects(
      () => tools[0].execute({
        prompt: 'offline guard probe',
        dest: '/tmp/omnimux-network-guard.mp4',
        model: 'seedance-2-5',
        operation: 'text_to_video',
        duration: 4,
        wait: false,
        // Tools deliberately do not accept this test-only field. The test
        // proves that losing it cannot create an external request.
        runtime: { async execute() { injectedRuntimeCalls += 1 } },
      }, {}),
      (error) => error?.message.includes('omnimux test network guard blocked'),
    )
    assert.equal(injectedRuntimeCalls, 0)
    assert.deepEqual(testNetworkAttempts(), [{
      url: 'https://external.test/v1/video/generations',
      method: 'POST',
    }])
    assert.equal(testNetworkOriginalFetchCalls(), 0)
  })

  it('blocks loopback services and a loopback redirect before original fetch', async () => {
    resetTestNetworkAttempts()
    const urls = [
      'http://127.0.0.1:45120/',
      'http://127.0.0.1:6152/',
      'http://localhost:6153/',
      'http://127.0.0.1:45120/redirect?to=https%3A%2F%2Fexternal.test%2Fpayload',
    ]
    for (const url of urls) {
      await assert.rejects(
        () => globalThis.fetch(url),
        (error) => error?.code === 'OMNIMUX_TEST_NETWORK_BLOCKED',
      )
    }
    assert.deepEqual(testNetworkAttempts(), urls.map((url) => ({ url, method: 'GET' })))
    assert.equal(testNetworkOriginalFetchCalls(), 0)
  })
})
