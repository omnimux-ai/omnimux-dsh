import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveMediaBytes, isLocalMediaSource, uploadMediaToGateway } from './gateway-upload.js'
test('remote URL representations cannot select local bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'upload-boundary-'))
  try {
    const file = join(dir, 'image.png'); writeFileSync(file, 'fixture')
    for (const prefix of ['https://example.invalid', 'HTTPS://example.invalid', '//example.invalid', 'http://localhost.evil', 'http://localhost@example.invalid']) {
      const url = `${prefix}/api/local-file?path=${encodeURIComponent(file)}`
      assert.equal(isLocalMediaSource(url), false)
      assert.equal(await uploadMediaToGateway(url, { fetcher() { throw Error('must not upload') } }), url)
      await assert.rejects(resolveMediaBytes(url), { code: 'omnimux-invalid-request' })
    }
    for (const host of ['http://localhost', 'http://127.1', 'http://[::1]']) {
      assert.equal((await resolveMediaBytes(`${host}/api/local-file?path=${encodeURIComponent(file)}`)).buffer.toString(), 'fixture')
      await assert.rejects(resolveMediaBytes(`${host}/api/local-file-extra?path=${encodeURIComponent(file)}`))
      await assert.rejects(resolveMediaBytes(`${host}/anything?marker=api/local-file&path=${encodeURIComponent(file)}`))
    }
    assert.equal((await resolveMediaBytes(file)).buffer.toString(), 'fixture')
    await assert.rejects(resolveMediaBytes('file://foreign-host/tmp/a'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
