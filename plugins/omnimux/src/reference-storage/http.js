import { readJsonBody, sendJson } from '../auth/http-routes.js'
import { requestRejection } from '../host/request-authorization.js'
import { readReferenceStorage, saveReferenceStorage } from './config.js'

/** Private same-origin settings face. Values cross into credentials only, never out. */
export function registerReferenceStorageRoutes(server, deps) {
  return server.register({ kind: 'exact', path: '/omnimux/reference-storage/config', async handler(req, res) {
    const method = (req.method || 'GET').toUpperCase()
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const rejected = requestRejection(req, deps.getConnection)
    if (rejected !== undefined) return sendJson(res, rejected, { error: '访问未获授权', code: 'request-denied' })
    if (!['GET', 'PUT'].includes(method)) return sendJson(res, 405, { error: '不支持此操作', code: 'method-not-allowed' })
    try {
      const services = { settings: deps.getSettings?.(), credentials: deps.getCredentials?.() }
      if (method === 'GET') return sendJson(res, 200, await readReferenceStorage(services))
      const body = await readJsonBody(req, 32768)
      return sendJson(res, 200, await saveReferenceStorage(services, body))
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'reference-storage-save-failed'
      const status = code === 'SETTINGS_CONFLICT' ? 409 : code === 'request_too_large' ? 413 : code === 'reference-storage-invalid' ? 400 : 503
      const message = status === 409 ? '设置已被更新，请刷新后重试'
        : status === 400 ? '请检查存储地址、存储空间和访问凭据'
        : status === 413 ? '配置内容过大'
        : '存储设置未能确认保存，请刷新后重试'
      return sendJson(res, status, { error: message, code })
    }
  } })
}
