import { test } from 'node:test'
import { strictEqual, ok } from 'node:assert'
import { createServer } from 'node:http'
import {
  probeHttpEndpoint,
  analyzeHtmlSkeleton,
} from './lib/smoke-probe-utils.mjs'
import { runSmokeCheck } from './verify-dev-smoke.mjs'

test('analyzeHtmlSkeleton identifies healthy HTML skeleton', () => {
  const healthyHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head><title>OmniMux</title></head>
      <body>
        <div id="root"></div>
        <script src="/src/main.tsx"></script>
      </body>
    </html>
  `
  const result = analyzeHtmlSkeleton(healthyHtml)
  strictEqual(result.valid, true)
  strictEqual(result.hasRootContainer, true)
  strictEqual(result.hasBootHanging, false)
  strictEqual(result.hasRecoveryOverlay, false)
  strictEqual(result.issues.length, 0)
})

test('analyzeHtmlSkeleton catches boot hanging marker', () => {
  const hangingHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <div id="root" data-dsh-boot="hanging">Loading...</div>
      </body>
    </html>
  `
  const result = analyzeHtmlSkeleton(hangingHtml)
  strictEqual(result.valid, false)
  strictEqual(result.hasBootHanging, true)
  ok(result.issues.some(i => i.includes('boot hanging')))
})

test('analyzeHtmlSkeleton catches recovery overlay', () => {
  const recoveryHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <div id="root"></div>
        <div data-dsh-desktop-recovery="true" class="dsh-recovery-overlay">
          Desktop failed to boot. Safe mode active.
        </div>
      </body>
    </html>
  `
  const result = analyzeHtmlSkeleton(recoveryHtml)
  strictEqual(result.valid, false)
  strictEqual(result.hasRecoveryOverlay, true)
  ok(result.issues.some(i => i.includes('Recovery overlay')))
})

test('analyzeHtmlSkeleton catches fatal unhandled runtime errors in HTML', () => {
  const crashHtml = `
    <!DOCTYPE html>
    <html>
      <body>
        <pre>Uncaught TypeError: Cannot read property 'slots' of undefined</pre>
      </body>
    </html>
  `
  const result = analyzeHtmlSkeleton(crashHtml)
  strictEqual(result.valid, false)
  ok(result.fatalErrors.length >= 1)
})

test('runSmokeCheck end-to-end against mock HTTP server', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/healthy') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<!DOCTYPE html><html><body><div id="root"></div></body></html>')
    } else if (req.url === '/broken') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<!DOCTYPE html><html><body><div id="root" data-dsh-boot="hanging"></div></body></html>')
    } else if (req.url === '/auth') {
      res.writeHead(401, { 'Content-Type': 'text/plain' })
      res.end('dsh web authentication required; reopen the URL printed by dsh web.')
    } else {
      res.writeHead(500)
      res.end('Internal Server Error')
    }
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = address.port

  try {
    // 1. Healthy endpoint check
    const healthyRes = await runSmokeCheck(`http://127.0.0.1:${port}/healthy`, { strict: true })
    strictEqual(healthyRes.success, true)
    strictEqual(healthyRes.skipped, false)

    // 2. Broken endpoint check
    const brokenRes = await runSmokeCheck(`http://127.0.0.1:${port}/broken`, { strict: true })
    strictEqual(brokenRes.success, false)

    // 3. 500 endpoint check
    const error500Res = await runSmokeCheck(`http://127.0.0.1:${port}/error`, { strict: true })
    strictEqual(error500Res.success, false)

    // 4. Unreachable endpoint non-strict check (should skip, not fail)
    const unreachableRes = await runSmokeCheck('http://127.0.0.1:59999', { strict: false })
    strictEqual(unreachableRes.skipped, true)
    strictEqual(unreachableRes.success, true)

    // 5. Auth-gated HTTP (401) falls back to CDP page health instead of failing.
    const authOkRes = await runSmokeCheck(`http://127.0.0.1:${port}/auth`, {
      strict: true,
      cdpProbe: async () => ({ ok: true, detail: { hasRoot: true } }),
    })
    strictEqual(authOkRes.success, true)
    strictEqual(authOkRes.via, 'cdp')

    // 6. A failing CDP probe must not turn the 401 into a silent pass.
    const authFailRes = await runSmokeCheck(`http://127.0.0.1:${port}/auth`, {
      strict: true,
      cdpProbe: async () => ({ ok: false, error: 'cdp target missing' }),
    })
    strictEqual(authFailRes.success, false)
  } finally {
    server.close()
  }
})
