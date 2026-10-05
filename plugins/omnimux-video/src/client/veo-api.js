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
 * 原样转发请求体：四模式规范化请求
 * （`{ operation, mode, prompt, seconds, resolution, aspect_ratio, image_url?, video_id? }`）
 * 由 `buildVidsRequest` 产出，客户端不再做字段改名或裁剪。
 * @param {object} request
 */
export async function createVeoTask(request) {
  return veoFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

/** @param {string} taskId */
export async function fetchVeoTask(taskId) {
  return veoFetch(`/tasks/${encodeURIComponent(taskId)}`)
}
