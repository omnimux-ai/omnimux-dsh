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

/**
 * 上传一张本地图片到插件自己的媒体目录，返回本机服务可抓取的地址（Issue #3186）。
 *
 * 浏览器内的 `blob:` 地址插件外无法抓取，因此选图后先把字节交给插件 HTTP 服务，
 * 请求体里携带服务端返回的地址；本地缩略图预览仍用 object URL。
 *
 * @param {Blob} file
 */
export async function uploadVeoImage(file) {
  const res = await fetch(`${VEO_API_PREFIX}/uploads`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { ok: res.ok, status: res.status, body }
}
