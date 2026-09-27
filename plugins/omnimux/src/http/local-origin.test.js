import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertLocalWrite, readOriginHeaders } from './local-origin.js'

describe('assertLocalWrite', () => {
  it('allows same-machine origin and missing origin', () => {
    assert.doesNotThrow(() => assertLocalWrite({}))
    assert.doesNotThrow(() => assertLocalWrite({ origin: 'http://127.0.0.1:8787' }))
    assert.doesNotThrow(() => assertLocalWrite({ origin: 'http://localhost:63805' }))
  })

  it('allows IPv6 loopback origins', () => {
    assert.doesNotThrow(() => assertLocalWrite({ origin: 'http://[::1]:3000' }))
  })

  it('allows any loopback port and scheme', () => {
    assert.doesNotThrow(() => assertLocalWrite({ origin: 'https://127.0.0.1' }))
    assert.doesNotThrow(() => assertLocalWrite({ origin: 'https://localhost' }))
    assert.doesNotThrow(() => assertLocalWrite({ origin: 'http://[::1]' }))
  })

  it('refuses a foreign site origin', () => {
    assert.throws(() => assertLocalWrite({ origin: 'https://evil.example' }), /cross-origin/)
    assert.throws(() => assertLocalWrite({ origin: 'https://localhost.evil.example' }), /cross-origin/)
    assert.throws(() => assertLocalWrite({ origin: 'http://127.0.0.1.evil.example' }), /cross-origin/)
  })

  it('refuses a non-loopback IP literal', () => {
    assert.throws(() => assertLocalWrite({ origin: 'http://192.168.1.10:8080' }), /cross-origin/)
    assert.throws(() => assertLocalWrite({ origin: 'http://[2001:db8::1]' }), /cross-origin/)
  })

  it('refuses cross-site sec-fetch-site even without origin', () => {
    assert.throws(() => assertLocalWrite({ secFetchSite: 'cross-site' }), /cross-origin/)
    assert.throws(() => assertLocalWrite({ secFetchSite: 'Cross-Site' }), /cross-origin/)
  })

  it('refuses cross-site sec-fetch-site before checking a local origin', () => {
    assert.throws(
      () => assertLocalWrite({ secFetchSite: 'cross-site', origin: 'http://localhost:1234' }),
      /cross-origin/,
    )
  })

  it('tolerates other sec-fetch-site values', () => {
    assert.doesNotThrow(() => assertLocalWrite({ secFetchSite: 'same-origin' }))
    assert.doesNotThrow(() => assertLocalWrite({ secFetchSite: 'same-site' }))
    assert.doesNotThrow(() => assertLocalWrite({ secFetchSite: 'none' }))
  })

  it('refuses a malformed origin URL', () => {
    assert.throws(() => assertLocalWrite({ origin: 'not a url' }), /cross-origin/)
    assert.throws(() => assertLocalWrite({ origin: 'localhost:1234' }), /cross-origin/)
    assert.throws(() => assertLocalWrite({ origin: 'http://' }), /cross-origin/)
  })

  it('accepts an origin whose URL scheme is non-http as long as hostname parsing holds existing semantics', () => {
    // Preserves existing behavior: only the hostname whitelist matters, scheme is not checked.
    assert.doesNotThrow(() => assertLocalWrite({ origin: 'ftp://localhost/' }))
  })

  it('falls back to referer when origin is missing', () => {
    assert.doesNotThrow(() => assertLocalWrite({ referer: 'http://localhost:8080/some/page' }))
    assert.doesNotThrow(() => assertLocalWrite({ referer: 'http://127.0.0.1:8787/path?q=1' }))
    assert.throws(() => assertLocalWrite({ referer: 'https://evil.example/page' }), /cross-origin/)
  })

  it('ignores a malformed referer when origin is missing', () => {
    assert.doesNotThrow(() => assertLocalWrite({ referer: 'not a url' }))
    assert.doesNotThrow(() => assertLocalWrite({ referer: '' }))
  })

  it('prefers origin over referer', () => {
    // A good referer must not rescue a bad origin: origin is consulted first when truthy.
    assert.throws(
      () => assertLocalWrite({ origin: 'https://evil.example', referer: 'http://localhost:1' }),
      /cross-origin/,
    )
    // A bad referer must not sink a good origin.
    assert.doesNotThrow(() =>
      assertLocalWrite({ origin: 'http://localhost:1', referer: 'not a url' }),
    )
  })
})

describe('readOriginHeaders', () => {
  it('returns empty strings for a missing request or headers', () => {
    assert.deepEqual(readOriginHeaders(undefined), { origin: '', referer: '', secFetchSite: '' })
    assert.deepEqual(readOriginHeaders({}), { origin: '', referer: '', secFetchSite: '' })
    assert.deepEqual(readOriginHeaders({ headers: {} }), { origin: '', referer: '', secFetchSite: '' })
  })

  it('reads lowercase node-style headers', () => {
    const headers = readOriginHeaders({
      headers: {
        origin: 'http://localhost:1',
        referer: 'http://localhost:1/page',
        'sec-fetch-site': 'same-origin',
      },
    })
    assert.deepEqual(headers, {
      origin: 'http://localhost:1',
      referer: 'http://localhost:1/page',
      secFetchSite: 'same-origin',
    })
  })

  it('reads capitalized headers', () => {
    const headers = readOriginHeaders({
      headers: {
        Origin: 'http://127.0.0.1:9',
        Referer: 'http://127.0.0.1:9/x',
        'Sec-Fetch-Site': 'none',
      },
    })
    assert.deepEqual(headers, {
      origin: 'http://127.0.0.1:9',
      referer: 'http://127.0.0.1:9/x',
      secFetchSite: 'none',
    })
  })

  it('prefers the lowercase key when both cases are present', () => {
    // get('origin') resolves headers['origin'] before the 'Origin' fallback.
    const headers = readOriginHeaders({
      headers: { Origin: 'https://a.example', origin: 'https://b.example' },
    })
    assert.equal(headers.origin, 'https://b.example')
  })

  it('takes the first element of array header values', () => {
    const headers = readOriginHeaders({
      headers: {
        origin: ['http://localhost:2', 'https://evil.example'],
        'sec-fetch-site': ['cross-site', 'same-origin'],
      },
    })
    assert.equal(headers.origin, 'http://localhost:2')
    assert.equal(headers.secFetchSite, 'cross-site')
  })
})

describe('local write admission fixture parity', () => {
  // Fixed header fixtures: the migrated primitive must produce identical
  // allow/refuse outcomes to the contract the Apps routes relied on.
  const fixtures = [
    { name: 'no headers', req: { headers: {} }, allowed: true },
    {
      name: 'browser same-origin write',
      req: { headers: { origin: 'http://localhost:43120', 'sec-fetch-site': 'same-origin' } },
      allowed: true,
    },
    {
      name: 'ipv4 loopback',
      req: { headers: { origin: 'http://127.0.0.1:43120' } },
      allowed: true,
    },
    {
      name: 'ipv6 loopback',
      req: { headers: { origin: 'http://[::1]:43120' } },
      allowed: true,
    },
    {
      name: 'cross-site marker only',
      req: { headers: { 'sec-fetch-site': 'cross-site' } },
      allowed: false,
    },
    {
      name: 'foreign origin',
      req: { headers: { origin: 'https://attacker.example' } },
      allowed: false,
    },
    {
      name: 'foreign referer fallback',
      req: { headers: { referer: 'https://attacker.example/p' } },
      allowed: false,
    },
    {
      name: 'local referer fallback',
      req: { headers: { referer: 'http://localhost:43120/p' } },
      allowed: true,
    },
    {
      name: 'non-web scheme origin parses but fails the hostname whitelist',
      req: { headers: { origin: 'javascript:alert(1)' } },
      allowed: false, // parses with empty hostname → refused, preserved existing semantics
    },
    {
      name: 'array headers first-wins',
      req: { headers: { origin: ['http://localhost:1', 'https://evil.example'] } },
      allowed: true,
    },
  ]

  for (const { name, req, allowed } of fixtures) {
    it(`fixture: ${name}`, () => {
      const headers = readOriginHeaders(req)
      if (allowed) {
        assert.doesNotThrow(() => assertLocalWrite(headers))
      } else {
        assert.throws(() => assertLocalWrite(headers), /cross-origin/)
      }
    })
  }
})
