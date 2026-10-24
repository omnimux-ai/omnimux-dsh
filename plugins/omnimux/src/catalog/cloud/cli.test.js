import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseArgs, runCatalogDiff } from './cli.js'

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url))
const BASELINE_DIR = join(FIXTURES, 'baseline')
const PRICING_FILE = join(FIXTURES, 'pricing-anonymous.json')

const temporaryDirectories = []
function temporaryDirectory() {
  const dir = mkdtempSync(join(tmpdir(), 'omnimux-cloud-cli-'))
  temporaryDirectories.push(dir)
  return dir
}
after(() => {
  for (const dir of temporaryDirectories) rmSync(dir, { recursive: true, force: true })
})

/** A captured hub projection: one listed model the baseline retires, one live model. */
function writeHubCatalog() {
  const dir = temporaryDirectory()
  const path = join(dir, 'hub-catalog.json')
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 1,
      models: [
        {
          id: 'retired-model-1',
          listed: true,
          listedOperations: ['chat_completion'],
          channelGroups: [
            { id: 'standard', wireGroup: 'default', enabled: true, pricing: { billingMode: 'per_task', pointsEstimate: 1 } },
          ],
        },
        {
          id: 'alpha-video-1',
          listed: true,
          listedOperations: ['text_to_video'],
          channelGroups: [
            { id: 'standard', wireGroup: 'default', enabled: true, pricing: { billingMode: 'per_second', pointsEstimate: 25 } },
          ],
        },
      ],
      text: [],
      image: [],
      video: [],
      audio: [],
    }),
  )
  return path
}

async function run(argv) {
  const chunks = []
  const result = await runCatalogDiff({ argv, hubRoot: FIXTURES, write: (text) => chunks.push(text) })
  return { exitCode: result.exitCode, output: result.output, chunks }
}

describe('parseArgs', () => {
  it('collects flags and rejects malformed input', () => {
    assert.deepEqual(parseArgs(['--gateway', '/tmp/x', '--json']), { gateway: '/tmp/x', json: true })
    assert.throws(() => parseArgs(['--gateway']), /missing value/)
    assert.throws(() => parseArgs(['stray']), /unexpected argument/)
  })
})

describe('runCatalogDiff', () => {
  it('prints usage and exits 2 without a gateway input', async () => {
    const { exitCode, output } = await run([])
    assert.equal(exitCode, 2)
    assert.match(output, /usage: node plugins\/omnimux\/scripts\/catalog-diff\.mjs/)
  })

  it('renders the drift report for a baseline directory and a replayed hub catalog', async () => {
    const hubCatalogPath = writeHubCatalog()
    const { exitCode, output } = await run(['--gateway', BASELINE_DIR, '--hub-catalog', hubCatalogPath])
    assert.equal(exitCode, 0)
    assert.match(output, /# 网关目录 vs 中枢目录 差异报告/)
    assert.match(output, /- 快照来源：channel-baseline/)
    assert.match(output, /## 中枢上架但网关不可达（调用必然失败）/)
    assert.match(output, /- retired-model-1/)
    assert.match(output, /## 网关在售但中枢未上架/)
    assert.match(output, /- shared-model-1/)
    assert.match(output, /## 快照覆盖限制/)
    assert.match(output, /channel-baseline lacks per-model contract/)
  })

  it('emits a structured document with --json', async () => {
    const hubCatalogPath = writeHubCatalog()
    const { exitCode, output } = await run(['--gateway', BASELINE_DIR, '--hub-catalog', hubCatalogPath, '--json'])
    assert.equal(exitCode, 0)
    const document = JSON.parse(output)
    assert.equal(document.kind, 'omnimux-gateway-catalog-diff')
    assert.equal(document.gateway.source, 'channel-baseline')
    assert.match(document.gateway.digest, /^[0-9a-f]{64}$/)
    assert.equal(document.summary.unreachable, 1)
    assert.deepEqual(document.unreachable, [{ id: 'retired-model-1', listedOperations: ['chat_completion'] }])
    assert.equal(document.summary.hubListed, 2)
  })

  it('accepts a /api/pricing payload as the gateway input', async () => {
    const hubCatalogPath = writeHubCatalog()
    const { exitCode, output } = await run(['--gateway', PRICING_FILE, '--hub-catalog', hubCatalogPath, '--json'])
    assert.equal(exitCode, 0)
    const document = JSON.parse(output)
    assert.equal(document.gateway.source, 'pricing')
    assert.equal(document.summary.gatewayModels, 2)
  })

  it('writes the report to --out instead of stdout', async () => {
    const hubCatalogPath = writeHubCatalog()
    const outPath = join(temporaryDirectory(), 'report.md')
    const { exitCode, chunks } = await run(['--gateway', BASELINE_DIR, '--hub-catalog', hubCatalogPath, '--out', outPath])
    assert.equal(exitCode, 0)
    assert.deepEqual(chunks, [])
    assert.match(readFileSync(outPath, 'utf8'), /# 网关目录 vs 中枢目录 差异报告/)
  })

  it('fails with exit 1 when the gateway input cannot be read', async () => {
    const { exitCode, output } = await run(['--gateway', join(FIXTURES, 'does-not-exist.json')])
    assert.equal(exitCode, 1)
    assert.match(output, /gateway snapshot unavailable \(gateway-input-unreadable\)/)
  })

  it('fails with exit 1 when the gateway document is not a recognized shape', async () => {
    const dir = temporaryDirectory()
    const path = join(dir, 'unknown.json')
    writeFileSync(path, JSON.stringify({ nothing: true }))
    const { exitCode, output } = await run(['--gateway', path])
    assert.equal(exitCode, 1)
    assert.match(output, /gateway-input-unrecognized/)
  })
})

describe('runCatalogDiff error handling', () => {
  it('rejects an unknown flag instead of ignoring it', async () => {
    const { exitCode, output } = await run(['--gateway', BASELINE_DIR, '--wat', 'x'])
    assert.equal(exitCode, 2)
    assert.match(output, /unknown flag: --wat/)
  })

  it('reports an unreadable --hub-catalog without a stack trace', async () => {
    const { exitCode, output } = await run(['--gateway', BASELINE_DIR, '--hub-catalog', join(FIXTURES, 'missing.json')])
    assert.equal(exitCode, 1)
    assert.match(output, /hub catalog unreadable/)
  })

  it('reports an unwritable --out without a stack trace', async () => {
    const hubCatalogPath = writeHubCatalog()
    const outPath = join(temporaryDirectory(), 'no-such-directory', 'report.md')
    const { exitCode, output } = await run(['--gateway', BASELINE_DIR, '--hub-catalog', hubCatalogPath, '--out', outPath])
    assert.equal(exitCode, 1)
    assert.match(output, /cannot write --out/)
  })
})
