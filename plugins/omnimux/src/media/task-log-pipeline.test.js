import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { executeOmnimuxMedia } from './execute.js'
import { flushMediaTaskLog, resetMediaLogState } from './task-log.js'

/**
 * Issue #3232: the task log exists so a failed generation leaves a trace the
 * user's own machine can be read back from. A unit test of the writer cannot
 * show that — it only proves the writer works. These drive the real execution
 * path against a failing upstream and then read the file.
 */
async function withIsolatedHome(run) {
  const home = mkdtempSync(join(tmpdir(), 'media-task-log-pipeline-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  resetMediaLogState()
  try {
    await run(home)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    resetMediaLogState()
    rmSync(home, { recursive: true, force: true })
  }
}

function mediaConfig(protocol = 'openai-media') {
  return {
    defaultProvider: 'custom',
    providers: {
      custom: {
        protocol,
        baseUrl: 'https://custom.invalid/v1',
        apiKey: 'vendor-fixture',
        models: { image: 'vendor-image' },
      },
    },
  }
}

function readRecords(home) {
  const dir = join(home, 'omnimux', 'media-logs')
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ndjson'))
    .flatMap((name) =>
      readFileSync(join(dir, name), 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line)),
    )
}

test('3232: a rejected submit leaves a diagnosable record under $DSH_HOME', async () => {
  await withIsolatedHome(async (home) => {
    await assert.rejects(() =>
      executeOmnimuxMedia('image', {
        model: 'vendor-image',
        prompt: 'pipeline probe',
        dest: join(home, 'out.png'),
        media: mediaConfig(),
        env: {},
        fetcher: async () =>
          new Response(JSON.stringify({ error: { message: 'upstream boom 500' } }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }),
      }),
    )

    await flushMediaTaskLog()
    const records = readRecords(home)
    assert.equal(records.length, 1)

    const record = records[0]
    assert.equal(record.event, 'submit.failed')
    assert.match(record.taskRef, /^mtask_/)
    assert.equal(record.capability, 'image')
    assert.equal(record.model, 'vendor-image')
    assert.equal(record.upstreamCode, 'ADAPTER_FAILED')
    assert.match(record.message, /upstream boom 500/)

    // The request carried a channel credential; none of it may reach the file.
    const raw = JSON.stringify(records)
    assert.ok(!raw.includes('vendor-fixture'))
    assert.ok(!raw.includes('Bearer '))
  })
})

/**
 * Known boundary, recorded so it is not mistaken for coverage: a lane that
 * answers the submit synchronously never fires the accepted callback, so a
 * successful generation writes nothing. Only failures are recorded today.
 */
test('3232: a synchronously completed submit writes nothing (known boundary)', async () => {
  await withIsolatedHome(async (home) => {
    const result = await executeOmnimuxMedia('image', {
      model: 'vendor-image',
      prompt: 'pipeline probe ok',
      dest: join(home, 'out.png'),
      media: mediaConfig(),
      env: {},
      fetcher: async () =>
        new Response(JSON.stringify({ status: 'completed', data: [{ b64_json: 'cG5n' }] }), {
          headers: { 'content-type': 'application/json' },
        }),
    })

    assert.equal(result.mode, 'live')
    await flushMediaTaskLog()
    assert.throws(() => readRecords(home), { code: 'ENOENT' })
  })
})
