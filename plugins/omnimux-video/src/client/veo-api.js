/**
 * Browser client for `/omnimux-video/api/veo`.
 */

export const VEO_API_PREFIX = '/omnimux-video/api/veo'

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function veoFetch(path, init = {}) {
  const res = await fetch(`${VEO_API_PREFIX}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { ok: res.ok, status: res.status, body }
}

export async function fetchVeoHealth() {
  return veoFetch('/health')
}

/**
 * @param {{ prompt: string, mode?: string, durationSec?: number }} payload
 */
export async function createVeoTask(payload) {
  return veoFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** @param {string} taskId */
export async function fetchVeoTask(taskId) {
  return veoFetch(`/tasks/${encodeURIComponent(taskId)}`)
}
