import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { sendJson } from '../auth/http-routes.js'
import { readOriginHeaders } from '../apps/origin.js'
import { createFormAttachmentService, MAX_FORM_FILE_BYTES } from './form-attachments.js'

export function registerFormAttachmentRoutes(webServer, deps) {
  const service = createFormAttachmentService({ root: join(deps.homeDir, 'omnimux', 'form-attachments'), ...deps })
  return webServer.register({ kind: 'prefix', path: '/omnimux/forms/attachments', async handler(req, res) {
    try {
      const connection = deps.getConnection?.()
      if (!connection?.requestRejection) return sendJson(res, 503, { error: 'auth-unavailable' })
      const rejection = connection.requestRejection(req)
      if (rejection !== undefined) return sendJson(res, rejection, { error: 'unauthorized' })
      const url = new URL(req.url, 'http://localhost')
      if (req.method === 'GET') {
        const { record, path } = await service.resolveFile(url.searchParams.get('workspaceId'), url.searchParams.get('assetId'))
        const bytes = await readFile(path)
        res.writeHead(200, { 'Content-Type': record.mimeType, 'Content-Length': bytes.length,
          'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
        return res.end(bytes)
      }
      const { origin, referer } = readOriginHeaders(req)
      const expected = `${req.socket?.encrypted ? 'https' : 'http'}://${req.headers.host}`
      if (!origin && !referer || new URL(origin || referer).origin !== expected) return sendJson(res, 403, { error: 'not-local' })
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method-not-allowed' })
      const chunks = []; let length = 0
      const isImport = url.pathname.endsWith('/import')
      const limit = isImport ? MAX_FORM_FILE_BYTES : 65536
      for await (const chunk of req) {
        length += chunk.length
        if (length > limit) return sendJson(res, 413, { error: 'file-size-invalid' })
        chunks.push(chunk)
      }
      const bytes = Buffer.concat(chunks)
      if (isImport) return sendJson(res, 200, await service.importFile({
        workspaceId: url.searchParams.get('workspaceId'), name: url.searchParams.get('name'),
        mimeType: String(req.headers['content-type'] || '').split(';')[0], bytes,
      }))
      const body = JSON.parse(bytes.toString('utf8'))
      if (url.pathname.endsWith('/resolve')) return sendJson(res, 200, { files: await service.resolveFiles(body) })
      if (url.pathname.endsWith('/materialize')) return sendJson(res, 200, { files: await service.materialize(body) })
      return sendJson(res, 404, { error: 'not-found' })
    } catch (error) { return sendJson(res, 400, { error: error.code === 'ENOENT' ? 'reference-missing' : error.message }) }
  } })
}
