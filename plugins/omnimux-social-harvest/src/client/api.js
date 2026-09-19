/**
 * @file 客户端 → 插件 HTTP 桥（同源、Host 连接鉴权由服务端守卫）。
 */

const PREFIX = '/api/omnimux/social-harvest'

async function request(path, opts = {}) {
  const response = await fetch(`${PREFIX}${path}`, {
    method: opts.method ?? 'GET',
    headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  let json = {}
  try {
    json = await response.json()
  } catch {
    json = { error: `HTTP ${String(response.status)}` }
  }
  return { ok: response.ok && json?.ok !== false, status: response.status, body: json }
}

export function fetchStatus() {
  return request('/status')
}

/** @param {boolean} enabled */
export function saveEnabled(enabled) {
  return request('/config', { method: 'PUT', body: { enabled: enabled === true } })
}

/**
 * 执行一条已登记命令。
 * @param {{ site: string, command: string, args?: Record<string, unknown> }} input
 */
export function runCommand(input) {
  return request('/run', { method: 'POST', body: input })
}
