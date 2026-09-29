import { execFile } from 'node:child_process'
import { stat, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { promisify } from 'node:util'
import { assertGuardOutput } from '../catalog/contract/submit-guard/index.js'
import { OmnimuxError } from './errors.js'

const execFileAsync = promisify(execFile)

export const DEFAULT_CLI_SPEECH_TIMEOUT_MS = 180_000

/**
 * Execute speech generation via local CLI (e.g. opencli gemini tts).
 *
 * @param {{
 *   route: { modelId: string },
 *   guardPlan: import('../catalog/contract/submit-guard/guard.js').GuardPlan,
 *   payload: Record<string, unknown>,
 *   dest: string,
 *   signal?: AbortSignal,
 *   timeoutMs?: number,
 *   runner?: (file: string, args: string[], options: object) => Promise<{ stdout: string, stderr: string }>,
 * }} input
 * @returns {Promise<{ mode: 'live', model: string, duration?: number, url?: string, dest: string }>}
 */
export async function generateCliSpeech(input) {
  const timeoutMs = input.timeoutMs ?? DEFAULT_CLI_SPEECH_TIMEOUT_MS
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout
  const runner = input.runner ?? execFileAsync

  const text = typeof input.payload?.input === 'string' && input.payload.input.trim()
    ? input.payload.input.trim()
    : (typeof input.payload?.prompt === 'string' && input.payload.prompt.trim()
      ? input.payload.prompt.trim()
      : (typeof input.guardPlan?.prompt === 'string' ? input.guardPlan.prompt.trim() : ''))

  if (!text) {
    throw new OmnimuxError('omnimux-invalid-request', 'cli speech text prompt cannot be empty')
  }

  await mkdir(dirname(input.dest), { recursive: true })

  try {
    signal.throwIfAborted()

    const args = ['gemini', 'tts', text, '--output', input.dest, '-f', 'json']
    const execOptions = {
      signal,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    }

    const { stdout, stderr } = await runner('opencli', args, execOptions)
    signal.throwIfAborted()

    let duration
    try {
      const parsed = JSON.parse(stdout)
      const row = Array.isArray(parsed) ? parsed[0] : parsed
      if (row && row.Duration) {
        const rawDur = String(row.Duration).replace(/[^\d.]/g, '')
        const numDur = Number(rawDur)
        if (Number.isFinite(numDur) && numDur >= 0) {
          duration = numDur
        }
      }
    } catch {
      // stdout may have non-json lines or warnings, duration parse failure is non-fatal
    }

    let fileStats
    try {
      fileStats = await stat(input.dest)
    } catch (statErr) {
      throw new OmnimuxError(
        'omnimux-request-failed',
        `cli speech did not produce destination file ${input.dest}: ${statErr.message}`,
        { details: { stdout, stderr } },
      )
    }

    if (fileStats.size === 0) {
      throw new OmnimuxError(
        'omnimux-request-failed',
        `cli speech generated empty file (0 bytes) at ${input.dest}`,
        { details: { stdout, stderr } },
      )
    }

    if (!input.guardPlan?.byok) {
      assertGuardOutput(
        input.guardPlan,
        {
          mode: 'live',
          outputs: [{ type: 'audio', mime: 'audio/wav', url: `file://${input.dest}` }],
        },
        { capability: 'audio' },
      )
    }

    return {
      mode: 'live',
      model: input.route.modelId,
      duration,
      url: undefined,
      dest: input.dest,
    }
  } catch (error) {
    if (input.signal?.aborted) {
      throw new OmnimuxError('omnimux-aborted', 'cli speech request aborted')
    }
    if (timeout.aborted) {
      throw new OmnimuxError('omnimux-request-failed', `cli speech request timed out (${timeoutMs}ms)`)
    }
    if (error instanceof OmnimuxError) {
      throw error
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new OmnimuxError(
        'omnimux-request-failed',
        'opencli executable not found; please ensure opencli is installed and in PATH',
        { cause: error },
      )
    }
    throw new OmnimuxError(
      'omnimux-request-failed',
      `cli speech generation failed: ${error?.message || String(error)}`,
      { cause: error },
    )
  }
}
