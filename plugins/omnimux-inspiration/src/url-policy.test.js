import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertDownloadableUrl,
  isDownloadableHttpUrl,
  isPrivateHostname,
  isRedirectStatus,
  resolveRedirectUrl,
  urlHostname,
} from './url-policy.js'

describe('url policy — private and local targets', () => {
  it('refuses loopback, private, link-local, CGNAT and reserved IPv4 hosts', () => {
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
      assert.throws(() => assertDownloadableUrl(url), /拒绝下载/)
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

  it('refuses every non-http(s) scheme, including file://', () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/a.mp4', 'data:video/mp4;base64,AAAA']) {
      assert.equal(isDownloadableHttpUrl(url), false, `${url} must not be downloadable`)
    }
    assert.equal(urlHostname('file:///etc/passwd'), '')
    assert.equal(urlHostname('ftp://example.com/a.mp4'), 'example.com')
    assert.throws(() => assertDownloadableUrl('file:///etc/passwd'), /拒绝下载非 http\(s\) 的媒体地址/)
    assert.throws(() => assertDownloadableUrl('   '), /媒体下载地址为空/)
  })

  it('keeps ordinary public CDN direct links downloadable', () => {
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
      assert.doesNotThrow(() => assertDownloadableUrl(url))
    }
    // `169.254.example.com` is a public DNS name, not the link-local range.
    assert.equal(isPrivateHostname('169.254.example.com'), false)
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
