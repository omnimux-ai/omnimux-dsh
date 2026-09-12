import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertDownloadableUrl,
  assertPublicResolvedHost,
  isDownloadableHttpUrl,
  isPrivateAddress,
  isPrivateHostname,
  isPublicHttpUrl,
  isRedirectStatus,
  resolveRedirectUrl,
  urlHostname,
} from './url-policy.js'

/**
 * Offline stub for `dns.lookup(host, { all: true })`.
 *
 * The whole suite stays off the network: nothing here resolves a real name, and
 * the table below is the only source of answers. `asked` records every query so a
 * test can prove the resolver was actually consulted (and with which options).
 * @param {Record<string, Array<{ address: string, family: number }>>} table
 * @returns {{ resolver: Function, asked: string[] }}
 */
function stubResolver(table) {
  const asked = []
  return {
    asked,
    resolver: async (hostname, options) => {
      asked.push(`${hostname}${options && options.all ? ' (all)' : ''}`)
      const answers = table[hostname]
      if (!answers) {
        const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`)
        err.code = 'ENOTFOUND'
        throw err
      }
      return answers
    },
  }
}

describe('url policy — private and local targets', () => {
  it('refuses loopback, private, link-local, CGNAT and reserved IPv4 hosts', async () => {
    const blocked = [
      'http://127.0.0.1:45120/omnimux/inspiration/local/items',
      'http://127.1.2.3/x.mp4',
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'http://10.0.0.8/video.mp4',
      'http://172.16.5.4/video.mp4',
      'http://172.31.255.254/video.mp4',
      'http://192.168.1.20/video.mp4',
      'http://100.64.0.1/video.mp4',
      'http://0.0.0.0/video.mp4',
      'http://224.0.0.1/video.mp4',
      'http://255.255.255.255/video.mp4',
    ]
    for (const url of blocked) {
      assert.equal(isDownloadableHttpUrl(url), false, `${url} must not be downloadable`)
      await assert.rejects(() => assertDownloadableUrl(url), /拒绝下载/)
    }
  })

  it('refuses IPv6 literals, mDNS and internal-only suffixes', () => {
    const blocked = [
      'http://[::1]/video.mp4',
      'http://[fe80::1]/video.mp4',
      'http://[fd00::1]/video.mp4',
      'http://localhost/video.mp4',
      'http://printer.local/video.mp4',
      'http://metadata.google.internal/video.mp4',
      'http://box.home.arpa/video.mp4',
    ]
    for (const url of blocked) {
      assert.equal(isDownloadableHttpUrl(url), false, `${url} must not be downloadable`)
    }
    assert.equal(isPrivateHostname('[::1]'), true)
    assert.equal(isPrivateHostname(''), true)
  })

  it('refuses every non-http(s) scheme, including file://', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/a.mp4', 'data:video/mp4;base64,AAAA']) {
      assert.equal(isDownloadableHttpUrl(url), false, `${url} must not be downloadable`)
    }
    assert.equal(urlHostname('file:///etc/passwd'), '')
    assert.equal(urlHostname('ftp://example.com/a.mp4'), 'example.com')
    await assert.rejects(() => assertDownloadableUrl('file:///etc/passwd'), /拒绝下载非 http\(s\) 的媒体地址/)
    await assert.rejects(() => assertDownloadableUrl('   '), /媒体下载地址为空/)
  })

  it('keeps ordinary public CDN direct links downloadable', async () => {
    const allowed = [
      'https://video.twimg.com/amplify_video/1/vid/1280x720/high.mp4',
      'https://rr1---sn-x.googlevideo.com/videoplayback?itag=18',
      'https://scontent.cdninstagram.com/v/t16/abc.mp4?efg=1',
      'https://v16-webapp.tiktokcdn.com/video.mp4',
      'https://cdn.example.com/a.webm',
      'http://169.254.example.com/video.mp4',
    ]
    for (const url of allowed) {
      assert.equal(isDownloadableHttpUrl(url), true, `${url} must stay downloadable`)
    }
    // `169.254.example.com` is a public DNS name, not the link-local range.
    assert.equal(isPrivateHostname('169.254.example.com'), false)
    // `instance-data` names the metadata service directly, so the literal layer
    // already refuses it; the resolve layer covers the indirect names.
    assert.equal(isPrivateHostname('instance-data'), true)
  })
})

describe('url policy — redirect handling', () => {
  it('identifies redirect statuses', () => {
    for (const status of [301, 302, 303, 307, 308]) assert.equal(isRedirectStatus(status), true)
    for (const status of [200, 204, 304, 400, 500]) assert.equal(isRedirectStatus(status), false)
  })

  it('resolves relative and absolute Location headers', () => {
    assert.equal(
      resolveRedirectUrl('/b.mp4', 'https://cdn.example.com/a/one.mp4'),
      'https://cdn.example.com/b.mp4',
    )
    assert.equal(
      resolveRedirectUrl('https://other.example.com/c.mp4', 'https://cdn.example.com/a.mp4'),
      'https://other.example.com/c.mp4',
    )
    assert.equal(resolveRedirectUrl('', 'https://cdn.example.com/a.mp4'), '')
    assert.equal(resolveRedirectUrl(undefined, 'https://cdn.example.com/a.mp4'), '')
  })
})

describe('url policy — literal private targets are refused without any resolver', () => {
  it('refuses a literal private or metadata host without consulting a resolver', async () => {
    const { resolver, asked } = stubResolver({})
    const blocked = [
      'http://127.0.0.1:45120/x.mp4',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/x.mp4',
      'http://[::1]/x.mp4',
    ]

    for (const url of blocked) {
      await assert.rejects(() => assertDownloadableUrl(url, { resolver }), /拒绝下载/)
    }
    assert.deepEqual(asked, [], 'a literal private host must be refused before any lookup')
  })
})

describe('url policy — resolved address must be public (P2-B regression)', () => {
  it('refuses a public-looking name that resolves into the machine or the private network', async () => {
    const cases = [
      ['localtest.me', '127.0.0.1'],
      ['127.0.0.1.nip.io', '127.0.0.1'],
      ['spoofed.attacker.example', '169.254.169.254'],
      ['rebind.example', '10.1.2.3'],
      ['rebind-v6.example', '::1'],
      ['unique-local.example', 'fc00::1'],
      ['link-local-v6.example', 'fe80::1'],
      ['unspecified.example', '0.0.0.0'],
      ['cgnat.example', '100.64.0.1'],
    ]

    for (const [host, address] of cases) {
      const { resolver, asked } = stubResolver({ [host]: [{ address, family: address.includes(':') ? 6 : 4 }] })
      const url = `http://${host}/x.mp4`

      // The literal check cannot see this: the name itself is a public DNS name.
      assert.equal(isDownloadableHttpUrl(url), true, `${host} passes the literal layer`)
      assert.equal(isPublicHttpUrl(url), true, `${host} passes the literal layer`)

      await assert.rejects(
        () => assertDownloadableUrl(url, { resolver }),
        /拒绝下载本机\/内网地址/,
        `${host} → ${address} must be refused`,
      )
      assert.deepEqual(asked, [`${host} (all)`], 'the resolver must be asked for every answer')
    }
  })

  it('refuses a name whose answer set mixes public and private addresses', async () => {
    const { resolver } = stubResolver({
      'half-public.example': [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    })

    await assert.rejects(
      () => assertDownloadableUrl('https://half-public.example/x.mp4', { resolver }),
      /拒绝下载本机\/内网地址 \(half-public\.example → 127\.0\.0\.1\)/,
      'one private answer is enough to refuse the host',
    )
  })

  it('keeps ordinary public CDN hosts downloadable', async () => {
    const table = {
      'rr1---sn-x.googlevideo.com': [{ address: '142.250.72.14', family: 4 }],
      'scontent.cdninstagram.com': [{ address: '157.240.253.63', family: 4 }],
      'v16-webapp.tiktokcdn.com': [{ address: '23.62.17.9', family: 4 }],
      'v6.example.com': [{ address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }],
    }
    const { resolver } = stubResolver(table)

    for (const host of Object.keys(table)) {
      await assert.doesNotReject(
        () => assertDownloadableUrl(`https://${host}/stream.mp4`, { resolver }),
        `${host} must stay downloadable`,
      )
      await assert.doesNotReject(() => assertPublicResolvedHost(host, { resolver }))
    }
  })

  it('fails closed when the host does not resolve at all', async () => {
    const { resolver } = stubResolver({})

    await assert.rejects(
      () => assertDownloadableUrl('https://nowhere.example/x.mp4', { resolver }),
      /拒绝下载无法解析的主机 \(nowhere\.example\): ENOTFOUND/,
    )
    await assert.rejects(
      () => assertPublicResolvedHost('nowhere.example', { resolver }),
      /拒绝下载无法解析的主机/,
    )
  })

  it('fails closed on an empty answer set', async () => {
    const { resolver } = stubResolver({ 'empty.example': [] })

    await assert.rejects(
      () => assertPublicResolvedHost('empty.example', { resolver }),
      /解析结果为空/,
    )
  })

  it('classifies addresses independently of the URL layer', () => {
    for (const address of ['127.0.0.1', '169.254.169.254', '10.0.0.1', '172.16.0.1', '192.168.0.1', '0.0.0.0', '100.64.0.1', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1']) {
      assert.equal(isPrivateAddress(address), true, `${address} must classify as non-public`)
    }
    for (const address of ['93.184.216.34', '142.250.72.14', '2606:2800:220:1:248:1893:25c8:1946', '2001:4860:4860::8888']) {
      assert.equal(isPrivateAddress(address), false, `${address} must classify as public`)
    }
    assert.equal(isPrivateAddress(''), true)
    assert.equal(isPrivateAddress(undefined), true)
  })
})
