/**
 * Copy one cloud catalog row into the local library, then announce it.
 *
 * Both entry points into a save — the card's hover control and the preview
 * modal's footer — go through here, so the request, the announcement and the
 * error shape are written once. The library call is injectable so the sequence
 * can be tested without a Host.
 */
import { cloudSaveToLocal } from './api.js'
import { notifyAssetsChanged } from './assets-events.js'

/**
 * @param {any} asset a row-shaped object: `{ id, name }` is all that is read
 * @param {{
 *   request?: (id: string, options?: { name?: string }) => Promise<any>,
 *   window?: any,
 *   CustomEvent?: any,
 * }} [io]
 * @returns {Promise<{ ok: boolean, error?: string, status?: number, asset?: any }>}
 */
export async function saveCloudAssetToLocal(asset, io = {}) {
  const id = String(asset?.id ?? '')
  if (id === '') return { ok: false, error: 'no-asset' }
  const request = io.request || cloudSaveToLocal
  const result = await request(id, { name: asset?.name })
  if (!result || result.ok !== true) {
    const body = result?.body
    return {
      ok: false,
      status: result?.status,
      error: String(body?.message || body?.error || 'save-failed'),
    }
  }
  // The library on the Host already grew; this is the window-level half that
  // makes the local feed re-read it right away.
  notifyAssetsChanged(io)
  return { ok: true, asset: result.body?.asset ?? null }
}
