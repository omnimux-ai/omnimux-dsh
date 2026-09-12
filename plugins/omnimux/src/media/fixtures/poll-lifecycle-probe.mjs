/**
 * Child-process probe for the Issue #1382 poll-lifecycle evidence.
 *
 * Two things cannot be shown inside the hub test suite, because
 * `scripts/test-network-guard.mjs` replaces `globalThis.fetch` for every test
 * file and blocks loopback as well:
 *
 *  1. that the composed signal really reaches the platform `fetch`, so a
 *     provider that never answers is bounded (measured before the fix: the
 *     request hung forever);
 *  2. that finishing a task by id works from a *different process*, i.e. the
 *     hub keeps no in-memory task registry that a restart would lose.
 *
 * This probe only ever talks to a loopback server it starts itself; no model
 * API is contacted (docs/contracts/model-api-authority.md).
 *
 * Usage (stdout is one JSON line):
 *   node fixtures/poll-lifecycle-probe.mjs hang <deadlineMs> <requestTimeoutMs>
 *   node fixtures/poll-lifecycle-probe.mjs raw <waitMs>
 *   node fixtures/poll-lifecycle-probe.mjs finish <taskId> <dest>
 */
import { createServer } from 'node:http'
import { pollOpenAiMediaTask } from '../protocols/openai-media.js'
import { finishMediaTask } from '../execute.js'

const [mode, ...args] = process.argv.slice(2)

/**
 * Print the probe result and exit.
 *
 * The exit is explicit because the interesting states are ones where the event
 * loop is still held open — a pending request against a server that never
 * answers would otherwise keep this process alive forever, which is precisely
 * the defect being measured.
 *
 * @param {unknown} value
 * @param {number} [exitCode]
 */
function emit(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`, () => process.exit(exitCode))
}

async function runHang(deadlineMs, requestTimeoutMs) {
  // A server that accepts the connection and then never writes a response: the
  // exact shape a hung provider has, and the one a post-hoc abort check misses.
  const server = createServer(() => {})
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = /** @type {{ port: number }} */ (server.address())
  let attempts = 0
  const started = Date.now()
  try {
    await pollOpenAiMediaTask({
      fetcher: async (url, init) => {
        attempts += 1
        return fetch(url, init)
      },
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: 'fixture',
      taskId: 'task-hang',
      capability: 'video',
      deadlineMs,
      requestTimeoutMs,
      pollIntervalMs: 10,
      retryBudgetMs: 300,
    })
    emit({ ok: false, reason: 'poll returned without a terminal status' })
  } catch (error) {
    emit({
      ok: true,
      code: /** @type {{ code?: string }} */ (error)?.code ?? null,
      name: /** @type {{ name?: string }} */ (error)?.name ?? null,
      attempts,
      elapsedMs: Date.now() - started,
    })
  } finally {
    server.close()
  }
}

/**
 * Reproduce the pre-fix shape directly: a platform `fetch` with no signal
 * against the hanging server. `settled: false` is the defect — the request is
 * still pending after `waitMs`, so any check that runs after `fetch` returns
 * (such as a post-hoc `throwIfAborted`) can never run at all.
 */
async function runRaw(waitMs) {
  const server = createServer(() => {})
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = /** @type {{ port: number }} */ (server.address())
  const started = Date.now()
  let settled = false
  const pending = fetch(`http://127.0.0.1:${port}/video/generations/task-raw`)
    .then(() => { settled = true })
    .catch(() => { settled = true })
  await new Promise((resolve) => setTimeout(resolve, waitMs))
  emit({ ok: true, settled, elapsedMs: Date.now() - started })
  server.close()
  void pending
}

async function runFinish(taskId, dest) {
  const result = await finishMediaTask('video', {
    baseUrl: 'https://example.invalid',
    modelId: 'fixture-model',
  }, {
    dest,
    taskId,
    authKey: 'fixture',
    fetcher: async (url) => {
      if (String(url).includes('/video/generations/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'completed', url: 'https://cdn.example/out.mp4' }),
          text: async () => '',
        }
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'video/mp4' },
        arrayBuffer: async () => Buffer.from('mp4-probe-bytes'),
      }
    },
  })
  emit({ ok: true, mode: result.mode, taskId: result.taskId, dest, pid: process.pid })
}

try {
  if (mode === 'hang') {
    await runHang(Number(args[0]), Number(args[1]))
  } else if (mode === 'raw') {
    await runRaw(Number(args[0]))
  } else if (mode === 'finish') {
    await runFinish(args[0], args[1])
  } else {
    emit({ ok: false, reason: `unknown mode ${mode}` }, 2)
  }
} catch (error) {
  emit({ ok: false, reason: error instanceof Error ? error.message : String(error) }, 1)
}
