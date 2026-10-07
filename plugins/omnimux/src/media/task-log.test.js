import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MEDIA_LOG_MAX_FILE_BYTES,
  MEDIA_LOG_MAX_LINE_BYTES,
  appendMediaTaskLog,
  lastMediaLogFailure,
  mediaLogDay,
  mediaLogDir,
  mediaLogFileName,
  mediaLogPath,
  resetMediaLogState,
  serializeMediaLogEntry,
} from './task-log.js'

const FIXED_NOW = new Date('2026-10-07T03:04:05.000Z')

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'media-task-log-'))
  try {
    return await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function readLines(text) {
  return text.split('\n').filter((line) => line.trim() !== '')
}

test('A1 the log lives under the product data root with a dated file name', async () => {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = '/tmp/dsh-home-probe'
  try {
    assert.equal(mediaLogDir(), join('/tmp/dsh-home-probe', 'omnimux', 'media-logs'))
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }

  assert.equal(mediaLogDay(FIXED_NOW), '2026-10-07')
  assert.equal(mediaLogFileName('2026-10-07', 0), 'media-2026-10-07.ndjson')
  assert.equal(mediaLogFileName('2026-10-07', 2), 'media-2026-10-07-2.ndjson')
  assert.ok(mediaLogPath('2026-10-07').endsWith(join('omnimux', 'media-logs', 'media-2026-10-07.ndjson')))
})

test('A2 every line is valid JSON carrying ts, event and taskRef', async () => {
  await withTempDir(async (dir) => {
    resetMediaLogState()
    const ok = await appendMediaTaskLog(
      { event: 'submit.failed', taskRef: 'mtask_abc', capability: 'image', httpStatus: 502 },
      { dir, now: () => FIXED_NOW },
    )
    assert.equal(ok, true)

    const lines = readLines(await readFile(join(dir, 'media-2026-10-07.ndjson'), 'utf8'))
    assert.equal(lines.length, 1)

    const record = JSON.parse(lines[0])
    assert.equal(record.ts, FIXED_NOW.toISOString())
    assert.equal(record.event, 'submit.failed')
    assert.equal(record.taskRef, 'mtask_abc')
    assert.equal(record.httpStatus, 502)
  })
})

test('A3 unknown event names are refused instead of written', async () => {
  await withTempDir(async (dir) => {
    resetMediaLogState()
    assert.equal(await appendMediaTaskLog({ event: 'not-a-real-event' }, { dir, now: () => FIXED_NOW }), false)
    assert.equal(await appendMediaTaskLog({ taskRef: 'mtask_x' }, { dir, now: () => FIXED_NOW }), false)
    await assert.rejects(stat(join(dir, 'media-2026-10-07.ndjson')))
  })
})

test('A4 the day file rotates to a numbered sibling past the size ceiling', async () => {
  await withTempDir(async (dir) => {
    resetMediaLogState()
    const day = mediaLogDay(FIXED_NOW)
    const first = join(dir, mediaLogFileName(day, 0))
    await writeFile(first, 'x'.repeat(MEDIA_LOG_MAX_FILE_BYTES), 'utf8')

    assert.equal(await appendMediaTaskLog({ event: 'poll.timeout', taskRef: 'mtask_r' }, { dir, now: () => FIXED_NOW }), true)

    const rotated = join(dir, mediaLogFileName(day, 1))
    const lines = readLines(await readFile(rotated, 'utf8'))
    assert.equal(lines.length, 1)
    assert.equal(JSON.parse(lines[0]).event, 'poll.timeout')
  })
})

test('A5 a write failure is reported but never thrown', async () => {
  resetMediaLogState()
  const blocked = join(tmpdir(), `media-task-log-blocked-${Date.now()}`)
  await writeFile(blocked, 'not a directory', 'utf8')
  try {
    const ok = await appendMediaTaskLog(
      { event: 'download.failed', taskRef: 'mtask_blocked' },
      { dir: join(blocked, 'nested'), now: () => FIXED_NOW },
    )
    assert.equal(ok, false)
    assert.ok(lastMediaLogFailure() instanceof Error)
  } finally {
    await rm(blocked, { force: true })
  }
})

test('A6 credential-shaped values are redacted before they reach disk', async () => {
  await withTempDir(async (dir) => {
    resetMediaLogState()
    await appendMediaTaskLog(
      {
        event: 'request.failed',
        taskRef: 'mtask_secret',
        message: 'upstream rejected Authorization: Bearer sk-live-abcdef123456',
      },
      { dir, now: () => FIXED_NOW },
    )

    const raw = await readFile(join(dir, 'media-2026-10-07.ndjson'), 'utf8')
    assert.ok(!raw.includes('sk-live-abcdef123456'))
    assert.ok(raw.includes('Bearer ***'))
  })
})

test('A7 concurrent appends keep one record per line', async () => {
  await withTempDir(async (dir) => {
    resetMediaLogState()
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        appendMediaTaskLog({ event: 'poll.unknown-task', taskRef: `mtask_${index}`, attempt: index }, { dir, now: () => FIXED_NOW }),
      ),
    )

    const lines = readLines(await readFile(join(dir, 'media-2026-10-07.ndjson'), 'utf8'))
    assert.equal(lines.length, 25)
    const refs = new Set(lines.map((line) => JSON.parse(line).taskRef))
    assert.equal(refs.size, 25)
  })
})

test('A8 oversized lines are truncated and flagged instead of dropped', () => {
  const long = 'z'.repeat(4000)
  const line = serializeMediaLogEntry(
    {
      event: 'request.failed',
      taskRef: long,
      requestKey: long,
      capability: long,
      model: long,
      channel: long,
      upstreamCode: long,
      message: long,
    },
    FIXED_NOW,
  )
  assert.ok(line)
  assert.ok(Buffer.byteLength(line, 'utf8') <= MEDIA_LOG_MAX_LINE_BYTES)

  const record = JSON.parse(line)
  assert.equal(record.event, 'request.failed')
  assert.equal(record.truncated, true)
})

test('A9 non-whitelisted fields never reach the file', () => {
  const line = serializeMediaLogEntry(
    {
      event: 'submit.failed',
      taskRef: 'mtask_w',
      apiKey: 'sk-should-not-appear',
      credentialRef: 'env:OPENAI_KEY',
      headers: { authorization: 'Bearer nope' },
    },
    FIXED_NOW,
  )
  assert.ok(line)
  const record = JSON.parse(line)
  assert.equal(record.apiKey, undefined)
  assert.equal(record.credentialRef, undefined)
  assert.equal(record.headers, undefined)
  assert.ok(!line.includes('sk-should-not-appear'))
})
