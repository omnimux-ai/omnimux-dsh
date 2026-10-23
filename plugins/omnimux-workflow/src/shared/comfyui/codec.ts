/**
 * ComfyUI workflow codec — public entry point.
 *
 * Pure functions only: parse a workflow text/JSON value into the structural
 * model, and encode the model back to JSON. No network, no filesystem, no
 * ComfyUI backend — a workflow can be inspected on a machine that has never
 * installed ComfyUI.
 */

import { ComfyWorkflowCodecError, fail } from './errors.ts';
import { asRecord, isFiniteNumber, isPlainObject } from './structure.ts';
import { decodeV04, encodeV04, looksLikeV04 } from './schemaV04.ts';
import { decodeV1, encodeV1, looksLikeV1 } from './schemaV1.ts';
import type {
  ComfyCodecError,
  ComfyCodecErrorCode,
  ComfyParseResult,
  ComfyWorkflowDocument,
  ComfyWorkflowFormat,
} from './types.ts';

/**
 * Build an explicit parse failure.
 *
 * Parse errors are always surfaced to the caller as `{ ok: false, error }`;
 * they are never converted into an empty-but-successful document.
 */
export function parseFailure(
  code: ComfyCodecErrorCode,
  path: string,
  message: string,
): ComfyParseResult {
  return { ok: false, error: { code, path, message } satisfies ComfyCodecError };
}

/**
 * Decide which schema generation a raw document uses.
 *
 * Primary dispatch is the `version` field (1 -> v1, < 1 -> v0.4). When the
 * field is absent the structural markers decide (`state` -> v1,
 * `last_node_id` -> v0.4). Anything else is reported as an unsupported
 * version instead of being guessed.
 */
export function detectComfyWorkflowFormat(raw: unknown): ComfyWorkflowFormat | null {
  const record = asRecord(raw);
  if (!record) return null;
  if (isFiniteNumber(record.version)) {
    if (record.version >= 1) return record.version === 1 ? 'v1' : null;
    return 'v0.4';
  }
  if (looksLikeV1(record)) return 'v1';
  if (looksLikeV04(record)) return 'v0.4';
  return null;
}

/** Convert an unexpected throw into an explicit parse failure. */
function failureFromThrown(error: unknown): ComfyParseResult {
  if (error instanceof ComfyWorkflowCodecError) {
    const converted = error.toResult();
    return parseFailure(converted.code, converted.path, converted.message);
  }
  return parseFailure(
    'invalid-structure',
    '',
    error instanceof Error ? error.message : String(error),
  );
}

/** Parse an already-decoded JSON value. */
export function parseComfyWorkflowValue(value: unknown): ComfyParseResult {
  if (!isPlainObject(value)) {
    return parseFailure(
      'invalid-root',
      '',
      Array.isArray(value)
        ? 'expected a workflow object at the document root, got an array'
        : 'expected a workflow object at the document root',
    );
  }
  const record = value as Record<string, unknown>;
  try {
    const versionRaw = record.version;
    if (isFiniteNumber(versionRaw) && versionRaw > 1) {
      fail(
        'unsupported-version',
        'version',
        `unsupported ComfyUI workflow version ${versionRaw}; supported: 0.4 and 1`,
      );
    }
    const format = detectComfyWorkflowFormat(record);
    if (format === null) {
      fail(
        'unsupported-version',
        'version',
        'cannot determine the ComfyUI workflow schema version (expected version 0.4 or 1)',
      );
    }
    if (format === 'v1') {
      return { ok: true, document: decodeV1(record), format: 'v1' };
    }
    return { ok: true, document: decodeV04(record), format: 'v0.4' };
  } catch (error) {
    return failureFromThrown(error);
  }
}

/**
 * Parse workflow JSON text. Never throws: malformed JSON, a non-object root,
 * an unknown version and structural violations all come back as a readable
 * `{ code, path, message }` error.
 */
export function parseComfyWorkflow(text: string): ComfyParseResult {
  if (typeof text !== 'string') {
    return parseFailure('invalid-json', '', 'expected workflow JSON text');
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    return parseFailure(
      'invalid-json',
      '',
      error instanceof Error ? error.message : 'the file is not valid JSON',
    );
  }
  return parseComfyWorkflowValue(value);
}

/** Encode the structural model to a JSON-safe plain object. */
export function encodeComfyWorkflowValue(document: ComfyWorkflowDocument): Record<string, unknown> {
  return document.format === 'v1' ? encodeV1(document) : encodeV04(document);
}

/** Encode the structural model back to a JSON string (2-space indent). */
export function stringifyComfyWorkflow(
  document: ComfyWorkflowDocument,
  space: number | string | undefined = 2,
): string {
  return JSON.stringify(encodeComfyWorkflowValue(document), null, space);
}
