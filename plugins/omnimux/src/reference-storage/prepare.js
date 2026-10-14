import { isLocalMediaSource } from '../media/gateway-upload.js'
import { mediaFromMagic } from '../text/image.js'
import { parseReferenceStorageConfig, credentialRefs, storageConfigError } from './config.js'
import { uploadReferenceMedia } from './upload.js'
import { requestPublicStorage } from './public-http.js'

const MAX_REMOTE_BYTES = 200 * 1024 * 1024
/** Anonymous existing references are not mirrored, but must return actual bounded media. */
export async function verifyRemoteReference(url, { signal, request = requestPublicStorage } = {}) {
  const timeout = AbortSignal.timeout(120000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  combined.throwIfAborted()
  const response = await request(url, { method: 'GET', headers: { accept: 'image/*, video/*, audio/*' }, signal: combined })
  const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (response.status !== 200 || !/^(image|video|audio)\//.test(mime) || mime === 'image/svg+xml' || !response.body) {
    await response.body?.cancel()
    throw storageConfigError('参考素材链接不能匿名读取有效媒体')
  }
  let bytes = 0
  let prefix = Buffer.alloc(0)
  for await (const chunk of response.body) {
    combined.throwIfAborted()
    bytes += chunk.byteLength
    if (bytes > MAX_REMOTE_BYTES) throw storageConfigError('参考素材超出大小限制')
    if (prefix.byteLength < 512) prefix = Buffer.concat([prefix, Buffer.from(chunk).subarray(0, 512 - prefix.byteLength)])
  }
  const text = prefix.toString('utf8').trimStart().toLowerCase()
  if (!bytes || text.startsWith('<') || /^image\//.test(mime) && !mediaFromMagic(prefix)) throw storageConfigError('参考素材链接未返回正确媒体')
}
/** One operation-scoped preparation, shared only for duplicate sources within this payload. */
export async function prepareReferencePayload(payload, options) {
  const config = parseReferenceStorageConfig(options.config)
  if (!config.enabled) return payload
  const prepared = new Map()
  let pair = null
  async function prepare(source) {
    if (typeof source !== 'string' || !source.trim()) return source
    if (prepared.has(source)) return prepared.get(source)
    const result = (async () => {
      options.signal?.throwIfAborted()
      if (!isLocalMediaSource(source)) {
        await (options.verifyRemote || verifyRemoteReference)(source, { signal: options.signal, request: options.request })
        return source
      }
      if (!pair) {
        if (!config.credentialId || typeof options.credentials?.resolve !== 'function') throw storageConfigError('请先配置参考素材云存储的访问凭据')
        const refs = credentialRefs(config.credentialId)
        const access = await options.credentials.resolve(refs.accessKeyId)
        const secret = await options.credentials.resolve(refs.secretAccessKey)
        if (!access?.value || !secret?.value) throw storageConfigError('参考素材云存储访问凭据不可用')
        pair = { accessKeyId: access.value, secretAccessKey: secret.value }
      }
      return (options.upload || uploadReferenceMedia)(source, Object.assign({}, pair, { config, signal: options.signal, request: options.request, localFetcher: options.localFetcher }))
    })()
    prepared.set(source, result)
    return result
  }
  const result = Object.assign({}, payload)
  for (const key of ['image', 'image_tail', 'file_url']) if (typeof result[key] === 'string') result[key] = await prepare(result[key])
  for (const key of ['images', 'image_urls', 'video_urls', 'audio_urls']) {
    if (!Array.isArray(result[key])) continue
    const values = []
    for (const source of result[key]) values.push(await prepare(source))
    result[key] = values
  }
  for (const key of ['references', 'reference_images', 'image_with_roles']) {
    if (!Array.isArray(result[key])) continue
    const rows = []
    for (const row of result[key]) {
      if (!row || typeof row !== 'object') { rows.push(row); continue }
      const updated = Object.assign({}, row)
      if (typeof updated.pathOrUrl === 'string') updated.pathOrUrl = await prepare(updated.pathOrUrl)
      if (typeof updated.url === 'string') updated.url = await prepare(updated.url)
      rows.push(updated)
    }
    result[key] = rows
  }
  if (result.audioTrack && typeof result.audioTrack === 'object') {
    result.audioTrack = Object.assign({}, result.audioTrack)
    if (typeof result.audioTrack.pathOrUrl === 'string') result.audioTrack.pathOrUrl = await prepare(result.audioTrack.pathOrUrl)
    if (typeof result.audioTrack.url === 'string') result.audioTrack.url = await prepare(result.audioTrack.url)
  }
  return result
}
