import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_CATALOG, parseCatalogConfig, resolvePricingUrl } from './config.js'

const SITE = 'https://api.omnimux.ai'

test('defaults keep the gateway as the membership source', () => {
  assert.deepEqual(parseCatalogConfig(undefined, SITE), DEFAULT_CATALOG)
  assert.equal(DEFAULT_CATALOG.remote, true)
  assert.equal(DEFAULT_CATALOG.ttlSeconds, 21600)
  assert.equal(DEFAULT_CATALOG.timeoutMs, 5000)
})

test('rejects non-object and invalid scalars', () => {
  assert.throws(() => parseCatalogConfig('nope', SITE), /must be an object/)
  assert.throws(() => parseCatalogConfig([], SITE), /must be an object/)
  assert.throws(() => parseCatalogConfig({ remote: 'yes' }, SITE), /remote must be a boolean/)
  assert.throws(() => parseCatalogConfig({ ttlSeconds: -1 }, SITE), /ttlSeconds/)
  assert.throws(() => parseCatalogConfig({ ttlSeconds: 1.5 }, SITE), /ttlSeconds/)
  assert.throws(() => parseCatalogConfig({ timeoutMs: 0 }, SITE), /timeoutMs/)
})

test('pricing URL must be https and same-host as the site', () => {
  assert.throws(() => parseCatalogConfig({ pricingUrl: 'http://api.omnimux.ai/api/pricing' }, SITE), /https/)
  assert.throws(() => parseCatalogConfig({ pricingUrl: 'not a url' }, SITE), /https/)
  assert.throws(() => parseCatalogConfig({ pricingUrl: 'https://evil.example/api/pricing' }, SITE), /host must match/)
  const parsed = parseCatalogConfig({ pricingUrl: 'https://api.omnimux.ai/api/pricing' }, SITE)
  assert.equal(parsed.pricingUrl, 'https://api.omnimux.ai/api/pricing')
})

test('resolvePricingUrl derives the public endpoint from the site base', () => {
  assert.equal(resolvePricingUrl(DEFAULT_CATALOG, SITE), 'https://api.omnimux.ai/api/pricing')
  assert.equal(resolvePricingUrl(DEFAULT_CATALOG, 'https://api.omnimux.ai/'), 'https://api.omnimux.ai/api/pricing')
  assert.equal(
    resolvePricingUrl({ pricingUrl: 'https://api.omnimux.ai/custom' }, SITE),
    'https://api.omnimux.ai/custom',
  )
})

test('bundledDir is trimmed and optional', () => {
  assert.equal(parseCatalogConfig({}, SITE).bundledDir, '')
  assert.equal(parseCatalogConfig({ bundledDir: '  /tmp/x  ' }, SITE).bundledDir, '/tmp/x')
})
