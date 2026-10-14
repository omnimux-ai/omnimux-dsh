import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'
import ipaddr from 'ipaddr.js'
import { storageConfigError } from './config.js'

export function isPublicAddress(address) {
  try {
    const parsed = ipaddr.process(address)
    return parsed.range() === 'unicast'
  } catch { return false }
}
async function cancelableLookup(hostname, resolver, signal) {
  if (!signal) return resolver(hostname, { all: true, verbatim: true })
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve().then(() => resolver(hostname, { all: true, verbatim: true })).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** Resolve all addresses and pin one validated address to the actual TLS connection. No redirects or proxy inheritance. */
export async function requestPublicStorage(urlString, init = {}, resolver = lookup) {
  const url = new URL(urlString)
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !hostname) throw storageConfigError('素材地址不安全')
  init.signal?.throwIfAborted()
  const answers = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await cancelableLookup(hostname, resolver, init.signal)
  if (!answers.length || answers.some(answer => !isPublicAddress(answer.address))) throw storageConfigError('存储地址不能指向本机、内网或保留地址')
  init.signal?.throwIfAborted()
  const selected = answers[0]
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: init.method || 'GET', headers: init.headers, signal: init.signal,
      lookup: (_host, options, callback) => options.all ? callback(null, [selected]) : callback(null, selected.address, selected.family),
    }, response => {
      try {
        const headers = new Headers()
        for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
        const status = response.statusCode || 500
        const empty = [204, 205, 304].includes(status)
        if (empty) response.resume()
        resolve(new Response(empty ? null : Readable.toWeb(response), { status, headers }))
      } catch (error) {
        response.destroy()
        reject(storageConfigError('存储响应格式无效'))
      }
    })
    req.on('error', reject)
    if (init.body) {
      const stream = Readable.from(init.body)
      stream.on('error', error => req.destroy(error))
      req.on('close', () => stream.destroy())
      stream.pipe(req)
    } else req.end()
  })
}
