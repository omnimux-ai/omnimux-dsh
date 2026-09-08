import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadAudioBytes, durationFromAudioBytes, isPublicAudioUrl } from './stt-audio.js'

const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00])
const WAV = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])

for (const url of [
  'https://cdn.example.com/voice.mp3', ' HTTP://cdn.example.com/audio.wav?signature=abc ',
  'https://localhost.example.com/audio.mp3', 'https://127.0.0.1.example.com/audio.mp3',
  'https://8.8.8.8/voice.mp3', 'https://[2606:4700:4700::1111]/voice.mp3',
]) {
  test(`audio URL classifier accepts external HTTP(S): ${url}`, () => {
    assert.equal(isPublicAudioUrl(url), true)
  })
}

for (const value of [
  '', undefined, '/Users/x/Desktop/TK 口播女.mp3', 'data:audio/mpeg;base64,SUQzBAAA',
  'file:///tmp/audio.mp3', 'blob:https://cdn.example.com/id', 'https://', 'ftp://cdn.example/audio.mp3',
  'http://localhost:43120/audio.mp3', 'http://LOCALHOST./audio.mp3', 'http://audio.localhost/audio.mp3',
  'http://127.0.0.1/audio.mp3', 'http://127.42.0.8/audio.mp3', 'http://127.1/audio.mp3',
  'http://2130706433/audio.mp3', 'http://0.0.0.0/audio.mp3', 'http://10.0.0.1/audio.mp3',
  'http://172.16.1.1/audio.mp3', 'http://192.168.1.1/audio.mp3', 'http://169.254.169.254/audio.mp3',
  'http://100.64.0.1/audio.mp3', 'http://[::1]/audio.mp3', 'http://[::]/audio.mp3',
  'http://[::ffff:127.0.0.1]/audio.mp3', 'http://[::ffff:192.168.1.1]/audio.mp3',
  'http://[fd00::1]/audio.mp3', 'http://[fe80::1]/audio.mp3', 'http://nas.local/audio.mp3',
  'http://nas/audio.mp3', 'https://user:password@cdn.example.com/audio.mp3',
]) {
  test(`audio URL classifier excludes local or non-public sources: ${value}`, () => {
    assert.equal(isPublicAudioUrl(value), false)
  })
}

test('audio loader reads absolute files and derives MIME from bytes', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-audio-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'clip.mp3')
  writeFileSync(path, MP3)
  assert.deepEqual(await loadAudioBytes(path), { bytes: MP3, filename: 'clip.mp3', contentType: 'audio/mpeg' })
})

test('audio loader decodes data URIs without reading disk', async () => {
  assert.deepEqual(await loadAudioBytes(`data:audio/wav;base64,${WAV.toString('base64')}`), {
    bytes: WAV, filename: 'audio.wav', contentType: 'audio/wav',
  })
})

for (const value of ['/nonexistent/nope.mp3', '   ', 'data:audio/mpeg;base64,', `data:audio/wav;base64,${MP3.toString('base64')}`]) {
  test(`audio loader rejects invalid source ${value}`, async () => {
    await assert.rejects(() => loadAudioBytes(value), { code: 'omnimux-invalid-request' })
  })
}

test('audio download never forwards credentials to hostname lookalikes or query strings', async () => {
  for (const [url, authenticated] of [
    ['https://api.omnimux.ai/voice.mp3', true], ['https://omnimux.ai/voice.mp3', true],
    ['https://omnimux.ai.attacker.example/voice.mp3', false],
    ['https://notomnimux.ai/voice.mp3', false],
    ['https://cdn.example/voice.mp3?source=omnimux.ai', false],
  ]) {
    await loadAudioBytes(url, {
      apiKey: 'fixture-only',
      fetcher: async (_url, init) => {
        assert.equal(init.headers.authorization, authenticated ? 'Bearer fixture-only' : undefined)
        return new Response(MP3, { headers: { 'content-type': 'audio/mpeg' } })
      },
    })
  }
})

test('audio byte metadata reads PCM WAV duration from byte rate and data length', () => {
  const byteRate = 16000
  const dataSize = byteRate * 2
  const bytes = Buffer.alloc(44 + dataSize)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + dataSize, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(8000, 24)
  bytes.writeUInt32LE(byteRate, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(dataSize, 40)
  assert.equal(durationFromAudioBytes(bytes, 'audio/wav'), 2)
})

test('audio byte metadata sums MPEG frame durations', () => {
  const frameBytes = Math.floor(144 * 128000 / 44100)
  const bytes = Buffer.alloc(frameBytes * 77)
  for (let offset = 0; offset < bytes.length; offset += frameBytes) bytes.set([0xff, 0xfb, 0x90, 0x00], offset)
  assert.ok(Math.abs(durationFromAudioBytes(bytes, 'audio/mpeg') - (77 * 1152 / 44100)) < 1e-9)
})
