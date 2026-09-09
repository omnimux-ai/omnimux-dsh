import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDraftStore, DraftError } from './store.js'
export const name = 'omnimux-forms'
export const inject = ['webServer']
const PREFIX = '/api/omnimux/forms'
export function apply(ctx) {
  if (!process.env.DSH_HOME) throw new Error('omnimux-forms requires explicit DSH_HOME')
  const store = createDraftStore(join(process.env.DSH_HOME, 'omnimux', 'forms'))
  const examples = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/examples')
  const webServer = ctx.webServer ?? ctx.get?.('webServer')
  const dispose = webServer.register({ kind: 'prefix', path: PREFIX, async handler(req, res) {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)) }
    try {
      const url = new URL(req.url, 'http://localhost')
      if (req.method === 'GET' && url.pathname.startsWith(`${PREFIX}/examples/`)) {
        const filename = url.pathname.slice(`${PREFIX}/examples/`.length)
        if (!/^[a-z0-9-]+\.(mp4|webm|png|jpg)$/.test(filename)) return send(404, { error: 'Not found' })
        const path = join(examples, filename)
        let info; try { info = await stat(path) } catch { return send(404, { error: 'Not found' }) }
        const type = filename.endsWith('.mp4') ? 'video/mp4' : filename.endsWith('.webm') ? 'video/webm' : filename.endsWith('.png') ? 'image/png' : 'image/jpeg'
        const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
        const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1
        if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end() }
        res.writeHead(range ? 206 : 200, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}) })
        const stream = createReadStream(path, { start, end }); stream.on('error', () => res.destroy()); stream.pipe(res); return
      }
      if (url.pathname !== `${PREFIX}/draft`) return send(404, { error: 'Not found' })
      if (req.method === 'GET') return send(200, await store.get(Object.fromEntries(url.searchParams)))
      if (req.method !== 'PUT') return send(405, { error: 'Method not allowed' })
      const origin = req.headers.origin
      if (req.headers['sec-fetch-site'] === 'cross-site' || !origin || new URL(origin).host !== req.headers.host) return send(403, { error: 'Same-origin request required' })
      if (!String(req.headers['content-type']).startsWith('application/json')) return send(415, { error: 'JSON required' })
      const chunks = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > 150_000) throw new DraftError('Draft too large', 413); chunks.push(chunk) }
      let input; try { input = JSON.parse(Buffer.concat(chunks).toString()) } catch { throw new DraftError('Invalid JSON') }
      return send(200, await store.put(input))
    } catch (error) { send(error instanceof DraftError ? error.status : 500, { error: error instanceof DraftError ? error.message : '无法读取或保存表单草稿' }) }
  } })
  ctx.effect?.(() => dispose, 'omnimux-forms: HTTP')
}
