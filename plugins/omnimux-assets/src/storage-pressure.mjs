import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, openSync, writeSync, closeSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { AssetsRuntime } from './storage-runtime.js'
import { MigrationService } from './storage-migration.js'

const dir = mkdtempSync(join(tmpdir(), 'assets-storage-pressure-'))
const runtime = new AssetsRuntime(join(dir, 'home'))
const service = new MigrationService(runtime)
const target = join(dir, 'target'); mkdirSync(target)
const samples = { hostPeakRss: process.memoryUsage().rss, helperPeakRss: 0, maxHeartbeatGapMs: 0, maxTimerGapMs: 0, phases: [] }
let timer = null
try {
  await runtime.initialize()
  const source = runtime.config.active.path
  mkdirSync(join(source, 'small'))
  const files = []
  for (let index = 0; index < 10000; index++) {
    const rel = `small/${index}.png`; writeFileSync(join(source, rel), `isolated-${index}`)
    files.push({ id: `f${index}`, relative_path: rel, ownership: 'managed' })
  }
  const size = 1024 * 1024 * 1024 + 1024 * 1024
  const block = Buffer.alloc(1024 * 1024, 0x5a)
  const hash = createHash('sha256')
  const fd = openSync(join(source, 'large.mp4'), 'wx')
  for (let done = 0; done < size; done += block.length) { writeSync(fd, block); hash.update(block) }
  closeSync(fd)
  const expected = hash.digest('hex')
  files.push({ id: 'large', relative_path: 'large.mp4', ownership: 'managed' })
  await runtime.fs.atomicJson(source, 'library.json', { schema: 3, revision: 1, assets: [{ id: 'pressure', name: 'pressure', files }], file_inventory: [] })
  let lastTimer = Date.now(); let lastBeat = Date.now(); let beat = null; let querying = false
  timer = setInterval(() => {
    const now = Date.now(); samples.maxTimerGapMs = Math.max(samples.maxTimerGapMs, now - lastTimer); lastTimer = now
    samples.hostPeakRss = Math.max(samples.hostPeakRss, process.memoryUsage().rss)
    const current = service.task?.progress.heartbeatAt
    if (current && current !== beat) { samples.maxHeartbeatGapMs = Math.max(samples.maxHeartbeatGapMs, now - lastBeat); lastBeat = now; beat = current }
    const phase = service.task?.state
    if (phase && samples.phases.at(-1) !== phase) samples.phases.push(phase)
    if (!querying && runtime.fs.child?.pid) {
      querying = true
      execFile('/bin/ps', ['-o', 'rss=', '-p', String(runtime.fs.child.pid)], (error, stdout) => {
        querying = false
        if (!error) samples.helperPeakRss = Math.max(samples.helperPeakRss, Number(stdout.trim()) * 1024)
      })
    }
  }, 200)
  const started = Date.now()
  await service.preflight(target, 0, 'pressure'); await service.running
  assert.equal(service.task.state, 'awaiting_confirmation', JSON.stringify(service.task.error))
  await service.confirm(service.task.id, { planHash: service.plan.planHash, expectedDecisionRevision: 0, confirm: true }); await service.running
  assert.equal(service.task.state, 'completed', JSON.stringify(service.task.error))
  assert.equal(service.task.progress.completedFiles, 10001)
  assert.equal((await runtime.fs.hash(target, 'large.mp4')).sha256, expected)
  assert.equal((await runtime.fs.hash(source, 'large.mp4')).sha256, expected)
  const ledger = await runtime.fs.readJson(target, 'library.json')
  assert.equal(ledger.assets[0].files.length, 10001)
  console.log(JSON.stringify({ ...samples, durationMs: Date.now() - started, smallFiles: 10000, largeBytes: size,
    sha256: expected, progress: service.task.progress, summary: service.task.summary }, null, 2))
} finally {
  clearInterval(timer); runtime.dispose(); rmSync(dir, { recursive: true, force: true })
}
