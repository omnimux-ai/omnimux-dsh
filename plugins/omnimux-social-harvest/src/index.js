/**
 * @file omnimux-social-harvest 宿主入口 —— 装配层。
 *
 * 职责：装配默认 run（spawn opencli）、注册 6 个 Agent 工具、
 * 经 webServer seam 暴露客户端 HTTP（状态查询 / 命令执行 / 配置读写）。
 * 边界：不调中枢 HTTP、不持密钥、不读 settings.yaml；存储只写自有目录。
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { stateDir } from './config.js'
import { toHarvestError } from './core/errors.js'
import { detectEnvironment, resetDoctorCache } from './collect/doctor.js'
import { executeHarvest, executeSiteLogin } from './collect/harvest.js'
import { SITES, getCommand, registryView } from './collect/registry.js'
import { createDefaultRun } from './run.js'
import { loadConfig, saveConfig } from './store.js'
import { checkGates, registerHarvestTools } from './tools.js'

export const name = 'omnimux-social-harvest'
export const inject = ['tools', 'webServer']

const PREFIX = '/api/omnimux/social-harvest'

/** 读 JSON body（上限 64KB，防滥用）。 */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024) throw new Error('body too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/**
 * 把一次采集结果落盘到 reports/（证据与复用），返回相对路径。
 * @param {object} envelope
 * @param {number} nowMs
 */
async function persistReport(envelope, nowMs) {
  const dir = path.join(stateDir(), 'reports')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${nowMs}-${envelope.site}-${envelope.command}.json`)
  await writeFile(file, JSON.stringify(envelope, null, 2), 'utf8')
  return file
}

export function apply(ctx) {
  const run = createDefaultRun()

  if (ctx.tools?.register) {
    registerHarvestTools(ctx, { run })
  }

  const webServer = ctx.webServer ?? ctx.get?.('webServer')
  if (!webServer || typeof webServer.register !== 'function') return

  webServer.register({
    kind: 'prefix',
    path: PREFIX,
    async handler(req, res) {
      const send = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(body))
      }
      try {
        const connection = ctx.get?.('connection') ?? ctx.connection
        if (typeof connection?.requestRejection !== 'function') {
          return send(503, { error: 'Host connection authentication is unavailable' })
        }
        const rejection = connection.requestRejection(req)
        if (rejection !== undefined) return send(rejection, { error: 'Host connection authentication refused the request' })

        const url = new URL(req.url, 'http://localhost')
        const path_ = url.pathname

        // 写操作要求同源
        if (req.method === 'POST' || req.method === 'PUT') {
          const origin = req.headers.origin
          if (req.headers['sec-fetch-site'] === 'cross-site' || !origin || new URL(origin).host !== req.headers.host) {
            return send(403, { error: 'Same-origin request required' })
          }
        }

        if (req.method === 'GET' && path_ === `${PREFIX}/status`) {
          const config = await loadConfig()
          const env = await detectEnvironment({ nowMs: Date.now() }, { run })
          return send(200, {
            ok: true,
            enabled: config.enabled,
            env,
            sites: registryView(),
          })
        }

        if (req.method === 'GET' && path_ === `${PREFIX}/config`) {
          return send(200, { ok: true, ...(await loadConfig()) })
        }

        if (req.method === 'PUT' && path_ === `${PREFIX}/config`) {
          const body = await readJsonBody(req)
          const next = await saveConfig({ enabled: body?.enabled === true })
          resetDoctorCache()
          return send(200, { ok: true, ...next })
        }

        if (req.method === 'POST' && path_ === `${PREFIX}/run`) {
          const body = await readJsonBody(req)
          const siteId = typeof body?.site === 'string' ? body.site : ''
          const commandId = typeof body?.command === 'string' ? body.command : ''
          const args = typeof body?.args === 'object' && body.args !== null ? body.args : {}

          const gate = await checkGates({ run, nowMs: Date.now() })
          if (gate) {
            return send(402, { ok: false, error: { code: gate.code, message: gate.message, hint: gate.hint, retryable: gate.retryable } })
          }
          const found = getCommand(siteId, commandId)
          if (!found) {
            return send(400, { ok: false, error: { code: 'ARG_INVALID', message: '未登记的命令', hint: '命令必须在注册表白名单内' } })
          }
          if (found.command.loginCmd) {
            const result = await executeSiteLogin({ siteId, nowMs: Date.now() }, { run })
            return send(200, { ok: true, site: siteId, command: commandId, items: result.items, fetchedAtMs: result.fetchedAtMs })
          }
          const result = await executeHarvest(
            { siteId, commandId, args, nowMs: Date.now() },
            { run },
          )
          const reportPath = await persistReport(result, Date.now())
          return send(200, { ...result, reportPath })
        }

        return send(404, { error: 'Not found' })
      } catch (err) {
        const e = toHarvestError(err)
        const status = e.code === 'ARG_INVALID' ? 400 : e.code === 'HARVEST_AUTH' ? 401 : 502
        return send(status, {
          ok: false,
          error: { code: e.code, message: e.message, hint: e.hint, retryable: e.retryable },
        })
      }
    },
  })
}

export default { name, inject, apply }
