import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  DEFAULT_CLOUD_ASSETS_BASE_URL,
  LOCAL_CLOUD_BASE_URL,
  LOCAL_CLOUD_ROUTE,
  cloudManifestUrl,
  cloudPageUrl,
  configuredCloudBaseUrl,
  createCloudSource,
  normalizeCloudBaseUrl,
  resolveCloudBase,
  setCloudSource,
} from './cloud-source.js'
import { cloudManifest, cloudPage, cloudSearch } from './api.js'

const GATEWAY = 'https://gateway.test/cloud-assets-catalog'

/** Replace global fetch with a recorder; returns the called URLs and a restore. */
function stubFetch(body = { ok: true }) {
  const calls = []
  const previous = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => body,
    }
  }
  return { calls, restore: () => { globalThis.fetch = previous } }
}

afterEach(() => { setCloudSource(null) })

describe('normalizeCloudBaseUrl', () => {
  it('treats an unset or empty value as the local Host', () => {
    assert.equal(normalizeCloudBaseUrl(undefined), LOCAL_CLOUD_BASE_URL)
    assert.equal(normalizeCloudBaseUrl(null), LOCAL_CLOUD_BASE_URL)
    assert.equal(normalizeCloudBaseUrl(''), LOCAL_CLOUD_BASE_URL)
    assert.equal(normalizeCloudBaseUrl('   '), LOCAL_CLOUD_BASE_URL)
  })

  it('accepts the local aliases, including the Host route prefix itself', () => {
    for (const value of ['local', 'off', 'host', 'none', 'LOCAL', 'Off', LOCAL_CLOUD_ROUTE]) {
      assert.equal(normalizeCloudBaseUrl(value), LOCAL_CLOUD_BASE_URL, value)
    }
  })

  it('strips trailing slashes from a gateway URL', () => {
    assert.equal(normalizeCloudBaseUrl(`${GATEWAY}/`), GATEWAY)
    assert.equal(normalizeCloudBaseUrl(`  ${GATEWAY}///  `), GATEWAY)
  })

  it('keeps an unrecognized value as given so the probe can reject it', () => {
    assert.equal(normalizeCloudBaseUrl('gateway.test'), 'gateway.test')
  })
})

describe('cloudManifestUrl / cloudPageUrl', () => {
  it('builds Host routes for the local sentinel', () => {
    assert.equal(cloudManifestUrl(LOCAL_CLOUD_BASE_URL), `${LOCAL_CLOUD_ROUTE}/manifest.json`)
    assert.equal(cloudPageUrl(LOCAL_CLOUD_BASE_URL, 'audio', 0), `${LOCAL_CLOUD_ROUTE}/audio/page-0000.json`)
  })

  it('builds gateway paths otherwise', () => {
    assert.equal(cloudManifestUrl(GATEWAY), `${GATEWAY}/manifest.json`)
    assert.equal(cloudPageUrl(GATEWAY, 'character/digital-human', 12), `${GATEWAY}/character/digital-human/page-0012.json`)
  })

  it('encodes each scope segment separately so the slashes survive', () => {
    assert.equal(cloudPageUrl(GATEWAY, 'style/生图 预设', 1), `${GATEWAY}/style/%E7%94%9F%E5%9B%BE%20%E9%A2%84%E8%AE%BE/page-0001.json`)
  })
})

describe('configuredCloudBaseUrl', () => {
  it('defaults to the production gateway when nothing is configured', () => {
    assert.equal(DEFAULT_CLOUD_ASSETS_BASE_URL, 'https://omnimux.ai/cloud-assets-catalog')
    assert.equal(configuredCloudBaseUrl({}), DEFAULT_CLOUD_ASSETS_BASE_URL)
  })

  it('lets the runtime global override the build default', () => {
    assert.equal(configuredCloudBaseUrl({ __OMNIMUX_CLOUD_ASSETS_BASE_URL__: `${GATEWAY}/` }), GATEWAY)
    assert.equal(configuredCloudBaseUrl({ __OMNIMUX_CLOUD_ASSETS_BASE_URL__: 'local' }), LOCAL_CLOUD_BASE_URL)
  })

  it('ignores a blank runtime global instead of pinning local by accident', () => {
    assert.equal(configuredCloudBaseUrl({ __OMNIMUX_CLOUD_ASSETS_BASE_URL__: '  ' }), DEFAULT_CLOUD_ASSETS_BASE_URL)
  })
})

describe('createCloudSource', () => {
  it('resolves to the gateway when the manifest probe succeeds', async () => {
    const source = createCloudSource({ baseUrl: GATEWAY, probe: async () => true })
    assert.equal(await source.resolve(), GATEWAY)
  })

  it('falls back to the local Host when the probe fails or throws', async () => {
    const denied = createCloudSource({ baseUrl: GATEWAY, probe: async () => false })
    assert.equal(await denied.resolve(), LOCAL_CLOUD_BASE_URL)
    const broken = createCloudSource({ baseUrl: GATEWAY, probe: async () => { throw new Error('offline') } })
    assert.equal(await broken.resolve(), LOCAL_CLOUD_BASE_URL)
  })

  it('probes once per session, and again only when forced', async () => {
    let calls = 0
    const source = createCloudSource({ baseUrl: GATEWAY, probe: async () => { calls += 1; return true } })
    await source.resolve()
    await source.resolve()
    assert.equal(calls, 1)
    await source.resolve({ force: true })
    assert.equal(calls, 2)
  })

  it('never probes when the base is pinned to the local Host', async () => {
    let calls = 0
    const source = createCloudSource({ baseUrl: LOCAL_CLOUD_BASE_URL, probe: async () => { calls += 1; return true } })
    assert.equal(await source.resolve(), LOCAL_CLOUD_BASE_URL)
    assert.equal(calls, 0)
  })
})

describe('cloud API source wiring', () => {
  it('reads the manifest and pages from the Host when the base is local', async () => {
    const fetch = stubFetch()
    try {
      setCloudSource(createCloudSource({ baseUrl: LOCAL_CLOUD_BASE_URL }))
      await cloudManifest()
      await cloudPage('audio', 2)
      assert.deepEqual(fetch.calls, [
        `${LOCAL_CLOUD_ROUTE}/manifest.json`,
        `${LOCAL_CLOUD_ROUTE}/audio/page-0002.json`,
      ])
    } finally {
      fetch.restore()
    }
  })

  it('reads them from the resolved gateway when one answers', async () => {
    const fetch = stubFetch()
    try {
      setCloudSource(createCloudSource({ baseUrl: GATEWAY, probe: async () => true }))
      await cloudManifest()
      await cloudPage('character/digital-human', 1)
      assert.deepEqual(fetch.calls, [
        `${GATEWAY}/manifest.json`,
        `${GATEWAY}/character/digital-human/page-0001.json`,
      ])
    } finally {
      fetch.restore()
    }
  })

  it('keeps search on the Host even when the pages come from the gateway', async () => {
    const fetch = stubFetch()
    try {
      setCloudSource(createCloudSource({ baseUrl: GATEWAY, probe: async () => true }))
      await cloudSearch({ q: '卧室', category: 'scene' })
      assert.equal(fetch.calls.length, 1)
      assert.ok(fetch.calls[0].startsWith(`${LOCAL_CLOUD_ROUTE}/search?`), fetch.calls[0])
      assert.ok(fetch.calls[0].includes('q=%E5%8D%A7%E5%AE%A4'), fetch.calls[0])
      assert.ok(fetch.calls[0].includes('category=scene'), fetch.calls[0])
    } finally {
      fetch.restore()
    }
  })

  it('re-probes the gateway on a forced refresh', async () => {
    let calls = 0
    try {
      setCloudSource(createCloudSource({ baseUrl: GATEWAY, probe: async () => { calls += 1; return false } }))
      assert.equal(await resolveCloudBase(), LOCAL_CLOUD_BASE_URL)
      assert.equal(calls, 1)
      await resolveCloudBase({ force: true })
      assert.equal(calls, 2)
    } finally {
      setCloudSource(null)
    }
  })
})
