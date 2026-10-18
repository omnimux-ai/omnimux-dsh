import { inspirationRequest, invalidateInspirationCache } from './api.js'

/** Write only collection metadata; preserve the server's one-use undo receipt. */
export async function writeCollection(path, body, method = 'POST') {
  const result = await inspirationRequest(`/omnimux/inspiration/local/collections${path}`, { method, body })
  if (!result.ok) throw new Error(result.body?.error || `HTTP ${result.status}`)
  invalidateInspirationCache()
  return result.body
}
