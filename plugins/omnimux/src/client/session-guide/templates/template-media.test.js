import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTemplateVideoUrl } from './template-media.js'

test('only HTTPS domain video paths are admitted', () => {
  for (const extension of ['mp4', 'WEBM', 'mov']) {
    const url = `https://cdn.example.com/preview.${extension}?v=1`
    assert.equal(resolveTemplateVideoUrl({ previewVideoUrl: url }), url)
  }
  for (const value of [null, {}, { previewVideoUrl: 1 }, { previewVideoUrl: 'bad' },
    { previewVideoUrl: 'https://cdn.example.com/a.mp4', previewMediaType: 'image' }]) {
    assert.equal(resolveTemplateVideoUrl(value), '')
  }
  for (const url of ['http://cdn.example.com/a.mp4', 'file:///a.mp4', 'https://user:secret@cdn.example.com/a.mp4',
    'https://cdn.example.com/a.png', 'https://cdn.example.com/a.mp4.png', 'https://cdn.example.com/a?file=a.mp4']) {
    assert.equal(resolveTemplateVideoUrl({ previewVideoUrl: url }), '', url)
  }
})

test('normalizes loopback variants and rejects IP literals and local domains', () => {
  assert.equal(new URL('https://[0:0:0:0:0:0:0:1]/a.mp4').hostname, '[::1]')
  assert.equal(new URL('https://[::ffff:127.0.0.1]/a.mp4').hostname, '[::ffff:7f00:1]')
  for (const host of ['localhost', 'localhost.', 'a.localhost', 'a.localhost.', 'a.local', 'a.local.',
    '127.0.0.1', '127.1', '2130706433', '0x7f000001', '10.0.0.1', '192.168.1.2',
    '[::1]', '[0:0:0:0:0:0:0:1]', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[::]', '[fe80::1]', '[fd00::1]']) {
    assert.equal(resolveTemplateVideoUrl({ previewVideoUrl: `https://${host}/a.mp4` }), '', host)
  }
})
