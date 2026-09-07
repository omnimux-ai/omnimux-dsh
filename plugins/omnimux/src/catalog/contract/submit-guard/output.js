/**
 * Validate vendor/runtime results against contract output type + MIME.
 */

import { GUARD_CODES } from './codes.js'

/**
 * @param {unknown} result
 * @param {object} operation
 * @param {{ capability?: string }} [opts]
 * @returns {{ ok: true, result: object } | { ok: false, code: string, message: string, [k: string]: unknown }}
 */
export function validateVendorResult(result, operation, opts = {}) {
  if (!result || typeof result !== 'object') {
    return {
      ok: false,
      code: GUARD_CODES.INVALID_RESPONSE,
      message: 'vendor result is not an object',
    }
  }
  const row = /** @type {Record<string, unknown>} */ (result)
  const expectedType = operation?.output?.type
  const allowedMimes = Array.isArray(operation?.output?.allowedMimes)
    ? operation.output.allowedMimes.map((m) => String(m).toLowerCase())
    : null

  // submitted mode (async handle) — no output body yet
  if (row.mode === 'submitted' && (row.taskId || row.task_id)) {
    return { ok: true, result: row }
  }

  if (expectedType === 'text') {
    const text = typeof row.text === 'string' ? row.text : typeof row.transcript === 'string' ? row.transcript : ''
    if (!text.trim()) {
      return {
        ok: false,
        code: GUARD_CODES.INVALID_RESPONSE,
        message: 'text output missing',
        expectedType,
      }
    }
    return { ok: true, result: row }
  }

  // Media outputs: expect matching type on outputs[] or top-level url + mode
  const outputs = Array.isArray(row.outputs) ? row.outputs : null
  if (outputs) {
    const hit = outputs.find((o) => o && typeof o === 'object' && o.type === expectedType
      && (o.url || o.b64_json || (o.bytes instanceof Uint8Array && o.bytes.byteLength > 0)))
    if (hit?.bytes instanceof Uint8Array) {
      const mime = String(hit.mime || hit.contentType || '').toLowerCase()
      if (!mime.startsWith(`${expectedType}/`)) {
        return { ok: false, code: GUARD_CODES.OUTPUT_MIME_MISMATCH, message: `binary output requires ${expectedType} MIME`, mime, expectedType }
      }
    }
    if (!hit) {
      const wrong = outputs.find((o) => o && typeof o === 'object' && o.type && o.type !== expectedType)
      if (wrong) {
        return {
          ok: false,
          code: GUARD_CODES.OUTPUT_TYPE_MISMATCH,
          message: `expected output type ${expectedType}, got ${wrong.type}`,
          expectedType,
          actualType: wrong.type,
        }
      }
      // empty outputs with taskId is ok only for submitted; completed needs url
      if (row.mode === 'live' || !row.taskId) {
        return {
          ok: false,
          code: GUARD_CODES.INVALID_RESPONSE,
          message: `runtime completed without a ${expectedType} output`,
          expectedType,
        }
      }
    } else if (allowedMimes && allowedMimes.length) {
      const mime = typeof hit.mime === 'string' ? hit.mime.toLowerCase() : typeof hit.contentType === 'string' ? hit.contentType.toLowerCase() : ''
      if (mime && !allowedMimes.includes(mime)) {
        return {
          ok: false,
          code: GUARD_CODES.OUTPUT_MIME_MISMATCH,
          message: `output MIME ${mime} not in contract allowedMimes`,
          mime,
          allowedMimes,
        }
      }
      if (!mime && allowedMimes.length) {
        // URL-only responses often omit MIME; require only when mime present or explicit flag
      }
    }
  } else if (expectedType === 'image' || expectedType === 'video' || expectedType === 'audio') {
    const url = typeof row.url === 'string' ? row.url : ''
    if (row.mode === 'live' && !url) {
      return {
        ok: false,
        code: GUARD_CODES.INVALID_RESPONSE,
        message: `live result missing ${expectedType} url`,
        expectedType,
      }
    }
    if (allowedMimes && allowedMimes.length && typeof row.mime === 'string') {
      const mime = row.mime.toLowerCase()
      if (!allowedMimes.includes(mime)) {
        return {
          ok: false,
          code: GUARD_CODES.OUTPUT_MIME_MISMATCH,
          message: `output MIME ${mime} not allowed`,
          mime,
          allowedMimes,
        }
      }
    }
  }

  // Capability cross-check when provided
  if (opts.capability && outputs) {
    const cap = opts.capability
    if ((cap === 'video' || cap === 'image' || cap === 'audio') && expectedType && expectedType !== 'text') {
      // capability should align with output type for media seams
      if (cap !== expectedType) {
        return {
          ok: false,
          code: GUARD_CODES.OUTPUT_TYPE_MISMATCH,
          message: `capability ${cap} does not match contract output ${expectedType}`,
          expectedType,
          capability: cap,
        }
      }
    }
  }

  return { ok: true, result: row }
}
