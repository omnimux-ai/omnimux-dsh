import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { stat } from 'node:fs/promises'
import { SignatureV4 } from '@smithy/signature-v4'
import { Sha256 } from '@aws-crypto/sha256-js'
import { resolveMediaDescriptor } from '../media/gateway-upload.js'
import { parseReferenceStorageConfig, storageConfigError } from './config.js'
import { requestPublicStorage } from './public-http.js'

const MAX_REFERENCE_BYTES = 200 * 1024 * 1024
const EXTENSIONS = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' })
async function digestStream(stream, signal, limit) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of stream) {
    signal?.throwIfAborted()
    bytes += chunk.byteLength
    if (bytes > limit) throw storageConfigError('参考素材超出上传大小限制')
    hash.update(chunk)
  }
  signal?.throwIfAborted()
  return { bytes, digest: hash.digest('hex') }
}
async function cancelResponse(response) { await response.body?.cancel() }
/** Upload a local reference copy, then independently verify the entire anonymous response. */
export async function uploadReferenceMedia(source, options) {
  const config = parseReferenceStorageConfig(options.config)
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(600000)]) : AbortSignal.timeout(600000)
  signal.throwIfAborted()
  if (!config.enabled || !options.accessKeyId || !options.secretAccessKey) throw storageConfigError('参考素材云存储未完整配置')
  const request = options.request || requestPublicStorage
  const descriptor = await resolveMediaDescriptor(source, { signal, fetcher: options.localFetcher })
  const ext = EXTENSIONS[descriptor.mimeType]
  if (!ext || descriptor.size <= 0 || descriptor.size > MAX_REFERENCE_BYTES) throw storageConfigError('参考素材格式或大小不受支持')
  const original = await digestStream(Readable.fromWeb(descriptor.createStream()), signal, MAX_REFERENCE_BYTES)
  if (original.bytes !== descriptor.size) throw storageConfigError('参考素材在准备过程中发生变化')
  if (descriptor.filePath) {
    const current = await stat(descriptor.filePath)
    if (current.size !== descriptor.stat.size || current.mtimeMs !== descriptor.stat.mtimeMs || current.ino !== descriptor.stat.ino) throw storageConfigError('参考素材在准备过程中发生变化')
  }
  const key = `omnimux/references/${original.digest}.${ext}`
  const endpoint = new URL(`${config.endpoint}/${config.bucket}/${key}`)
  const publicUrl = `${config.publicBaseUrl}/${key}`
  const signer = new SignatureV4({ credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }, region: config.region, service: 's3', sha256: Sha256, uriEscapePath: false })
  const signed = await signer.sign({ method: 'PUT', protocol: endpoint.protocol, hostname: endpoint.hostname, port: endpoint.port ? Number(endpoint.port) : undefined, path: endpoint.pathname, headers: { host: endpoint.host, 'content-type': descriptor.mimeType, 'content-length': String(original.bytes), 'x-amz-content-sha256': original.digest } })
  const uploadHash = createHash('sha256')
  let uploadedBytes = 0
  async function* body() {
    for await (const chunk of Readable.fromWeb(descriptor.createStream())) {
      signal.throwIfAborted()
      uploadedBytes += chunk.byteLength
      if (uploadedBytes > original.bytes) throw storageConfigError('参考素材在上传过程中发生变化')
      uploadHash.update(chunk)
      yield chunk
    }
  }
  const uploaded = await request(endpoint.href, { method: 'PUT', headers: signed.headers, body: body(), signal })
  await cancelResponse(uploaded)
  if (uploaded.status < 200 || uploaded.status >= 300) throw storageConfigError('参考素材上传失败，请检查存储权限')
  if (uploadedBytes !== original.bytes || uploadHash.digest('hex') !== original.digest) throw storageConfigError('参考素材在上传过程中发生变化')
  const verified = await request(publicUrl, { method: 'GET', headers: { accept: descriptor.mimeType }, signal })
  if (verified.status !== 200 || (verified.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== descriptor.mimeType) {
    await cancelResponse(verified)
    throw storageConfigError('素材已上传，但公开地址无法读取正确素材')
  }
  if (!verified.body) throw storageConfigError('公开地址未返回素材内容')
  const actual = await digestStream(Readable.fromWeb(verified.body), signal, original.bytes)
  if (actual.bytes !== original.bytes || actual.digest !== original.digest) throw storageConfigError('公开地址未返回上传的素材内容')
  return publicUrl
}
