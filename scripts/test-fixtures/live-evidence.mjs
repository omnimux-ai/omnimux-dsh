import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { PNG } from 'pngjs'

export function tinyPng() {
  return PNG.sync.write({ width: 1, height: 1, data: Buffer.from([0, 0, 0, 255]) })
}

/** Synthetic receipts for offline validator tests, never real ego-browser acceptance evidence. */
export function liveEvidence(root, evidenceDir) {
  const target = { stage: 'assets', tabId: 'omnimux-assets:library' }
  const now = new Date().toISOString()
  const request = {
    root, runId: 'run-1', commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    target: 'l2', profile: 'omnimux-dev-qa', url: 'http://127.0.0.1:44201/', stage: 'assets', targets: [target],
    evidenceDir, allocation: null, createdAt: new Date(Date.now() - 2_000).toISOString(), consumedAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
  const bundle = plugin => ({
    plugin, bundlePath: `plugins/${plugin}/client.js`, bundleBytes: 1,
    bundleSha256: 'b'.repeat(64), bundleRegistrationSha256: 'c'.repeat(64), bundleCodeSha256: 'd'.repeat(64),
    loadedScriptUrl: `http://127.0.0.1:44201/plugins/${plugin}/client.js`, loadedScriptSha256: 'e'.repeat(64),
    loadedScriptCodeSha256: 'f'.repeat(64), loadedRegistrationSha256: 'c'.repeat(64),
    loadedRegistrationCodeSha256: 'd'.repeat(64), match: 'raw-registration', matchingRegistrationCount: 1,
  })
  const assertions = ['active-content-selection', 'idempotent-open', 'chat-clears-selection', 'restore']
    .map(suffix => ({ name: `assets:${suffix}`, pass: true }))
    .concat([{ name: 'initial-session-restored', pass: true }, { name: 'initial-workbench-restored', pass: true }])
  const proof = { requestedOrigin: 'http://127.0.0.1:44201', target: 'l2', allocation: null, bundles: [bundle('omnimux'), bundle('omnimux-assets')] }
  const report = {
    ...request, pass: true, status: 'completed', tool: 'ego-browser', tabId: 'ego-tab-1', taskSpaceId: 77,
    browserIdentity: { before: { taskSpaceId: 77, tabId: 'ego-tab-1' }, after: { taskSpaceId: 77, tabId: 'ego-tab-1' } },
    actualUrl: request.url,
    completedAt: now, runtimeProof: { before: proof, after: structuredClone(proof) },
    screenshots: [join(evidenceDir, 'assets.png')], probe: { targets: [target], assertions, screenshots: [join(evidenceDir, 'assets.png')] },
  }
  return { request, report }
}
