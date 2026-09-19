/**
 * @file 环境检测 —— OpenCLI 可执行文件与浏览器桥接的就绪探测（60s 缓存）。
 * 不直接 spawn；经注入的 run 触达。
 */

import { HARVEST_TIMEOUT_MS, STATUS_CACHE_TTL_MS } from '../config.js'
import { OPENCLI_BIN } from '../core/envelope.js'

/** @type {{ at: number, value: DoctorReport } | null} */
let cache = null

/**
 * @typedef {{ installed: boolean, version: string | null, bridgeOk: boolean,
 *   bridgeDetail: string | null, checkedAtMs: number }} DoctorReport
 */

/**
 * 探测 OpenCLI 环境。
 * @param {{ nowMs: number }} input
 * @param {{ run: (argv: string[], options: { timeoutMs: number }) =>
 *   Promise<{ stdout: string, stderr: string, code: number }>, force?: boolean }} deps
 * @returns {Promise<DoctorReport>}
 */
export async function detectEnvironment(input, deps) {
  if (!deps?.force && cache && input.nowMs - cache.at < STATUS_CACHE_TTL_MS) return cache.value

  /** @type {DoctorReport} */
  const report = {
    installed: false,
    version: null,
    bridgeOk: false,
    bridgeDetail: null,
    checkedAtMs: input.nowMs,
  }

  try {
    const ver = await deps.run(['--version'], { timeoutMs: 10_000 })
    if (ver.code === 0 && typeof ver.stdout === 'string' && ver.stdout.trim() !== '') {
      report.installed = true
      report.version = ver.stdout.trim()
    }
  } catch {
    report.installed = false
    cache = { at: input.nowMs, value: report }
    return report
  }

  if (!report.installed) {
    cache = { at: input.nowMs, value: report }
    return report
  }

  try {
    const doc = await deps.run(['doctor', '-f', 'json'], { timeoutMs: HARVEST_TIMEOUT_MS })
    const text = typeof doc.stdout === 'string' ? doc.stdout.trim() : ''
    if (doc.code === 0 && text !== '') {
      try {
        const parsed = JSON.parse(text)
        report.bridgeOk = true
        report.bridgeDetail = typeof parsed === 'object' && parsed !== null ? 'ok' : null
      } catch {
        // doctor 输出非 JSON（table 文案）：exit 0 即视为可用
        report.bridgeOk = true
      }
    } else {
      report.bridgeDetail = (typeof doc.stderr === 'string' ? doc.stderr : text).slice(0, 200)
    }
  } catch (err) {
    report.bridgeDetail = err instanceof Error ? err.message.slice(0, 200) : String(err)
  }

  cache = { at: input.nowMs, value: report }
  return report
}

/** 清缓存（测试与手动刷新用）。 */
export function resetDoctorCache() {
  cache = null
}

export { OPENCLI_BIN }
