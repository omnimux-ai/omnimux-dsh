import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  accountsAvatarDir,
  createAccountAvatarStore,
  inspectAvatarUrl,
  isBlockedAvatarHost,
  sniffAvatarBytes,
} from './account-avatar.js'

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
)
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex')
const GIF = Buffer.from('47494638396101000100800000000000ffffff2c000000000100010000020144003b', 'hex')
const WEBP = Buffer.from('524946461800000057454250565038200c0000000000000000000000', 'hex')
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8')

function fakeResponse(body, { status = 200, headers = {} } = {}) {
  return {
    status,
    headers: {
      get(name) {
        const key = String(name).toLowerCase()
        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === key) return v
        }
        return null
      },
    },
    async arrayBuffer() {
      return body
    },
  }
}

describe('inspectAvatarUrl / SSRF', () => {
  it('accepts https public hosts and rejects everything else', () => {
    assert.equal(inspectAvatarUrl('https://cdn.tiktok.com/a.png').ok, true)
    assert.equal(inspectAvatarUrl('http://cdn.tiktok.com/a.png').ok, false)
    assert.equal(inspectAvatarUrl('data:image/png;base64,abc').ok, false)
    assert.equal(inspectAvatarUrl('https://127.0.0.1/a.png').reason, 'ssrf')
    assert.equal(inspectAvatarUrl('https://localhost/a.png').reason, 'ssrf')
    assert.equal(inspectAvatarUrl('https://10.0.0.8/a.png').reason, 'ssrf')
    assert.equal(inspectAvatarUrl('https://192.168.1.9/a.png').reason, 'ssrf')
    assert.equal(inspectAvatarUrl('https://172.16.0.1/a.png').reason, 'ssrf')
    assert.equal(inspectAvatarUrl('https://169.254.169.254/latest/meta').reason, 'ssrf')
    assert.equal(inspectAvatarUrl('https://host.local/a.png').reason, 'ssrf')
    assert.equal(isBlockedAvatarHost('::1'), true)
    assert.equal(isBlockedAvatarHost('cdn.example'), false)
  })
})

describe('sniffAvatarBytes', () => {
  it('accepts PNG/JPEG/GIF/WebP and rejects SVG/xml/html/short buffers', () => {
    assert.deepEqual(sniffAvatarBytes(PNG), { mimeType: 'image/png', ext: 'png' })
    assert.deepEqual(sniffAvatarBytes(JPEG), { mimeType: 'image/jpeg', ext: 'jpg' })
    assert.deepEqual(sniffAvatarBytes(GIF), { mimeType: 'image/gif', ext: 'gif' })
    assert.deepEqual(sniffAvatarBytes(WEBP), { mimeType: 'image/webp', ext: 'webp' })
    assert.equal(sniffAvatarBytes(SVG), null)
    assert.equal(sniffAvatarBytes(Buffer.from('<?xml version="1.0"?><svg/>', 'utf8')), null)
    assert.equal(sniffAvatarBytes(Buffer.from('<html><body>x</body></html>', 'utf8')), null)
    assert.equal(sniffAvatarBytes(Buffer.from('not-an-image')), null)
  })
})

describe('account avatar store', () => {
  it('starts empty and treats a missing or corrupt index as empty', () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-av-empty-'))
    try {
      const store = createAccountAvatarStore({ home })
      assert.equal(store.has('a'), false)
      assert.equal(store.get('a'), null)
      assert.equal(store.localUrlFor('acc-1'), '/omnimux/accounts/acc-1/avatar')
      assert.equal(store.localUrlFor('a/b'), '/omnimux/accounts/a%2Fb/avatar')
      mkdirSync(store.dir, { recursive: true, mode: 0o700 })
      writeFileSync(store.path, 'not-json', { mode: 0o600 })
      assert.equal(store.has('a'), false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('puts a legal PNG and writes 0700/0600 files', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-av-png-'))
    try {
      const store = createAccountAvatarStore({
        home,
        now: () => '2026-08-25T12:00:00.000Z',
        fetcher: async () => fakeResponse(PNG, { headers: { 'content-type': 'image/png' } }),
      })
      const result = await store.putFromUrl('acc-1', 'https://cdn.example/a.png')
      assert.equal(result.ok, true)
      assert.equal(store.has('acc-1'), true)
      const hit = store.get('acc-1')
      assert.ok(hit)
      assert.equal(hit.mimeType, 'image/png')
      assert.equal(hit.ext, 'png')
      assert.deepEqual(hit.buffer, PNG)
      assert.equal(statSync(store.dir).mode & 0o777, 0o700)
      assert.equal(statSync(store.path).mode & 0o777, 0o600)
      const index = JSON.parse(readFileSync(store.path, 'utf8'))
      assert.equal(index['acc-1'].content_type, 'image/png')
      assert.equal(index['acc-1'].source_url, 'https://cdn.example/a.png')
      assert.equal(index['acc-1'].fetched_at, '2026-08-25T12:00:00.000Z')
      assert.equal(statSync(join(store.dir, index['acc-1'].file)).mode & 0o777, 0o600)
      assert.match(index['acc-1'].file, /^[0-9a-f]{64}\.png$/)
      assert.doesNotMatch(index['acc-1'].file, /acc-1/)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('puts JPEG, WebP and GIF', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-av-kinds-'))
    try {
      /** @type {Record<string, Buffer>} */
      const bodies = {
        'https://cdn.example/a.jpg': JPEG,
        'https://cdn.example/a.webp': WEBP,
        'https://cdn.example/a.gif': GIF,
      }
      const store = createAccountAvatarStore({
        home,
        fetcher: async (url) => fakeResponse(bodies[url]),
      })
      assert.equal((await store.putFromUrl('j', 'https://cdn.example/a.jpg')).ok, true)
      assert.equal(store.get('j')?.mimeType, 'image/jpeg')
      assert.equal((await store.putFromUrl('w', 'https://cdn.example/a.webp')).ok, true)
      assert.equal(store.get('w')?.ext, 'webp')
      assert.equal((await store.putFromUrl('g', 'https://cdn.example/a.gif')).ok, true)
      assert.equal(store.get('g')?.mimeType, 'image/gif')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('rejects SVG, xml, html, http, private hosts and oversize bodies without writing', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-av-rej-'))
    try {
      /** @type {string[]} */
      const seen = []
      const store = createAccountAvatarStore({
        home,
        config: { maxBytes: 64 },
        fetcher: async (url) => {
          seen.push(String(url))
          if (String(url).includes('svg')) return fakeResponse(SVG, { headers: { 'content-type': 'image/svg+xml' } })
          if (String(url).includes('xml')) {
            return fakeResponse(Buffer.from('<?xml version="1.0"?><svg/>'), { headers: { 'content-type': 'image/png' } })
          }
          if (String(url).includes('big')) {
            return fakeResponse(Buffer.concat([PNG, Buffer.alloc(80)]), { headers: { 'content-length': '200' } })
          }
          return fakeResponse(PNG)
        },
      })
      assert.equal((await store.putFromUrl('s', 'https://cdn.example/a.svg')).ok, false)
      assert.equal((await store.putFromUrl('x', 'https://cdn.example/a.xml')).ok, false)
      assert.equal((await store.putFromUrl('h', 'http://cdn.example/a.png')).ok, false)
      assert.equal((await store.putFromUrl('p', 'https://127.0.0.1/a.png')).ok, false)
      assert.equal((await store.putFromUrl('b', 'https://cdn.example/big.png')).ok, false)
      assert.equal(store.has('s'), false)
      assert.equal(store.has('x'), false)
      assert.equal(store.has('h'), false)
      assert.equal(store.has('p'), false)
      assert.equal(store.has('b'), false)
      assert.deepEqual(seen, [
        'https://cdn.example/a.svg',
        'https://cdn.example/a.xml',
        'https://cdn.example/big.png',
      ])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('skips a refetch when source_url is unchanged and refetches when it changes', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-av-src-'))
    try {
      let calls = 0
      const store = createAccountAvatarStore({
        home,
        fetcher: async () => {
          calls += 1
          return fakeResponse(PNG)
        },
      })
      assert.equal((await store.putFromUrl('a', 'https://cdn.example/one.png')).ok, true)
      assert.equal((await store.putFromUrl('a', 'https://cdn.example/one.png')).ok, true)
      assert.equal(calls, 1)
      assert.equal((await store.putFromUrl('a', 'https://cdn.example/two.png')).ok, true)
      assert.equal(calls, 2)
      assert.equal(store.sourceUrl('a'), 'https://cdn.example/two.png')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('remove deletes only the named raster and index row', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-av-rm-'))
    try {
      const store = createAccountAvatarStore({
        home,
        fetcher: async () => fakeResponse(PNG),
      })
      await store.putFromUrl('a', 'https://cdn.example/a.png')
      await store.putFromUrl('b', 'https://cdn.example/b.png')
      await store.putFromUrl('c', 'https://cdn.example/c.png')
      const fileA = JSON.parse(readFileSync(store.path, 'utf8')).a.file
      store.remove('a')
      assert.equal(store.has('a'), false)
      assert.throws(() => statSync(join(store.dir, fileA)))
      assert.equal(store.has('b'), true)
      assert.equal(store.has('c'), true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('does not fetch when disabled', async () => {
    const home = mkdtempSync(join(tmpdir(), 'omnimux-acct-av-off-'))
    try {
      let calls = 0
      const store = createAccountAvatarStore({
        home,
        config: { enabled: false },
        fetcher: async () => {
          calls += 1
          return fakeResponse(PNG)
        },
      })
      assert.equal((await store.putFromUrl('a', 'https://cdn.example/a.png')).reason, 'disabled')
      assert.equal(calls, 0)
      assert.equal(store.has('a'), false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
