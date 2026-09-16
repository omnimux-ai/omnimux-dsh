import { requestRejection } from './request-authorization.js'
import { createVideoStreamUrl } from './stream-capability.js'
import { getMimeType } from './stream.js'

/** Only an authenticated, same-origin selection may mint a local streaming capability. */
export function createVideoAuthorizationHandler(getConnection) {
  return async (req, res) => {
    const respond = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    const rejection = requestRejection(req, getConnection)
    if (rejection !== undefined) return respond(rejection, { error: 'Local media authorization required' })
    if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' })
    try {
      let body = ''
      for await (const chunk of req) {
        body += chunk
        if (Buffer.byteLength(body) > 16 * 1024) return respond(413, { error: 'Selection too large' })
      }
      const { path } = JSON.parse(body)
      if (typeof path !== 'string' || !path || path.includes('\0') || !/^(video|audio)\//.test(getMimeType(path))) {
        return respond(400, { error: 'Select a supported video or audio file' })
      }
      return respond(200, { streamUrl: createVideoStreamUrl(path) })
    } catch {
      return respond(400, { error: 'Selected media unavailable' })
    }
  }
}
