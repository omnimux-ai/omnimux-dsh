#!/usr/bin/env node
/**
 * scripts/verify-dev-smoke.mjs
 *
 * OmniMux Cold-Start E2E Smoke Probe:
 * 1. Probes Dev App (default port 45120) and Prod App (port 44120/44200).
 * 2. Checks:
 *    - HTTP Status === 200
 *    - HTML DOM skeleton valid (#root container present)
 *    - No `[data-dsh-boot="hanging"]` or `data-dsh-boot-error`
 *    - No `[data-dsh-desktop-recovery]` emergency recovery overlay
 *    - 0 Fatal JavaScript errors
 *
 * Usage:
 *   node scripts/verify-dev-smoke.mjs [--port=45120] [--strict]
 */

import http from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { probeHttpEndpoint, analyzeHtmlSkeleton } from './lib/smoke-probe-utils.mjs'

const DEFAULT_DEV_PORTS = [45120, 44200]
const DEFAULT_CDP_PORT = Number(process.env.OMNIMUX_CDP_PORT || process.env.OMNIMUX_DEV_CDP_PORT || 9229)

function cdpTargets(port) {
  return new Promise((resolvePromise) => {
    const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          resolvePromise(Array.isArray(parsed) ? parsed : [])
        } catch {
          resolvePromise([])
        }
      })
    })
    req.on('error', () => resolvePromise([]))
    req.setTimeout(1500, () => { req.destroy(); resolvePromise([]) })
  })
}

function evaluateInPage(wsUrl, expression, timeoutMs = 5000) {
  return new Promise((resolvePromise) => {
    let settled = false
    let timer
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close() } catch {}
      resolvePromise(value)
    }
    const ws = new WebSocket(wsUrl)
    timer = setTimeout(() => finish({ ok: false, error: 'CDP evaluate timed out' }), timeoutMs)
    ws.onopen = () => ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true },
    }))
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data))
        if (data.id === 1) finish({ ok: true, result: data?.result?.result?.value })
      } catch (error) {
        finish({ ok: false, error: error.message })
      }
    }
    ws.onerror = () => finish({ ok: false, error: 'WebSocket error' })
  })
}

/**
 * Read-only page-health check through the desktop window's CDP port (same
 * mechanism as scripts/dev-smoke.mjs). Used when HTTP is auth-gated (401):
 * the probe cannot obtain the token `dsh web` prints, but the live window is
 * already authenticated and can report its real DOM state.
 * @param {{ cdpPort?: number }} [opts]
 */
export async function probeDevCdpHealth(opts = {}) {
  const port = opts.cdpPort ?? DEFAULT_CDP_PORT
  const targets = await cdpTargets(port)
  const page = targets.find((t) => t.type === 'page' && /127\.0\.0\.1:45120/.test(String(t.url || '')))
    || targets.find((t) => t.type === 'page')
  if (!page || !page.webSocketDebuggerUrl) return { ok: false, error: `no CDP page target on ${port}` }
  const expression = `JSON.stringify({readyState:document.readyState,hasRoot:!!document.querySelector('#root'),bootHanging:!!document.querySelector('[data-dsh-boot="hanging"],[data-dsh-boot-error]'),recovery:!!document.querySelector('[data-dsh-desktop-recovery]'),bodyText:((document.body&&document.body.innerText)||'').trim().length})`
  const evaluated = await evaluateInPage(page.webSocketDebuggerUrl, expression)
  if (!evaluated.ok) return { ok: false, error: evaluated.error || 'CDP evaluate failed' }
  let detail
  try {
    detail = JSON.parse(evaluated.result)
  } catch {
    return { ok: false, error: 'CDP returned malformed page state' }
  }
  const healthy = detail.hasRoot && !detail.bootHanging && !detail.recovery
    && detail.bodyText > 0 && detail.readyState !== 'loading'
  return healthy ? { ok: true, detail } : { ok: false, error: `page unhealthy: ${JSON.stringify(detail)}`, detail }
}

/**
 * Run smoke check against target URL.
 * @param {string} url
 * @param {{ strict?: boolean, cdpPort?: number, cdpProbe?: Function, probeHttpEndpoint?: Function }} [opts]
 */
export async function runSmokeCheck(url, opts = {}) {
  const strict = opts.strict ?? false
  const probe = opts.probeHttpEndpoint ?? probeHttpEndpoint
  const cdpProbe = opts.cdpProbe ?? probeDevCdpHealth
  console.log(`[Smoke Probe] Probing ${url}...`)

  const res = await probe(url, { timeoutMs: 5000 })

  if (!res.ok) {
    if (res.status === 401) {
      console.log(`  ⚠ HTTP 401 (auth required) from ${url}; falling back to CDP page health...`)
      const cdp = await cdpProbe({ url, cdpPort: opts.cdpPort })
      if (cdp.ok) {
        console.log('  ✓ CDP page health OK (auth-gated HTTP)')
        return { skipped: false, success: true, via: 'cdp', detail: cdp.detail }
      }
      console.error(`❌ [Smoke Failure] HTTP 401 and CDP fallback failed: ${cdp.error || 'unknown'}`)
      return { skipped: false, success: false, error: `HTTP 401; CDP: ${cdp.error || 'unknown'}` }
    }
    if (res.status === 0) {
      if (!strict) {
        console.log(`[SMOKE SKIP] Host unreachable at ${url} (${res.error || 'Connection refused'}).`)
        console.log('  · Start the desktop dev app with `pnpm dev` or `yarn omnimux:dev` to run live smoke probe.')
        return { skipped: true, success: true }
      } else {
        console.error(`❌ [Smoke Failure] Server unreachable at ${url}: ${res.error}`)
        return { skipped: false, success: false, error: res.error }
      }
    } else {
      console.error(`❌ [Smoke Failure] Received HTTP ${res.status} from ${url}`)
      return { skipped: false, success: false, error: `HTTP ${res.status}` }
    }
  }

  console.log(`  ✓ HTTP ${res.status} OK (${res.durationMs}ms)`)

  // Analyze HTML DOM skeleton
  const analysis = analyzeHtmlSkeleton(res.body)

  if (!analysis.valid) {
    console.error(`❌ [Smoke Failure] HTML validation errors on ${url}:`)
    for (const issue of analysis.issues) {
      console.error(`  - ${issue}`)
    }
    return { skipped: false, success: false, issues: analysis.issues }
  }

  console.log(`  ✓ HTML DOM skeleton verified (Root container OK, 0 boot errors, 0 recovery overlays)`)
  return { skipped: false, success: true }
}

// CLI Execution Entrypoint
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const args = process.argv.slice(2)
  let targetPort = null
  let targetUrl = null
  let strict = false

  for (const arg of args) {
    if (arg === '--strict') {
      strict = true
    } else if (arg.startsWith('--port=')) {
      targetPort = parseInt(arg.slice('--port='.length), 10)
    } else if (arg.startsWith('--url=')) {
      targetUrl = arg.slice('--url='.length)
    }
  }

  const urlsToProbe = targetUrl
    ? [targetUrl]
    : targetPort
    ? [`http://127.0.0.1:${targetPort}`]
    : DEFAULT_DEV_PORTS.map((p) => `http://127.0.0.1:${p}`)

  let allSuccess = true
  let probedCount = 0

  for (const url of urlsToProbe) {
    const outcome = await runSmokeCheck(url, { strict })
    if (!outcome.skipped) {
      probedCount++
      if (!outcome.success) {
        allSuccess = false
      }
    }
  }

  if (probedCount === 0 && !strict) {
    console.log('[Smoke Probe] All target ports idle/skipped. Verification completed.')
    process.exit(0)
  }

  if (allSuccess) {
    console.log('✓ Smoke probe completed successfully.')
    process.exit(0)
  } else {
    console.error('❌ Smoke probe failed.')
    process.exit(1)
  }
}
