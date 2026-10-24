/**
 * Structured codec errors.
 *
 * The UI translates `code` through the canvas i18n dictionary and falls back
 * to `message` (plus `path`) so a malformed file always produces a readable
 * error instead of an exception escaping into React or a silent no-op.
 */

import type { ComfyCodecError, ComfyCodecErrorCode } from './types.ts';

/** Thrown internally by the decoders; converted to a result at the boundary. */
export class ComfyWorkflowCodecError extends Error {
  readonly code: ComfyCodecErrorCode;
  readonly path: string;

  constructor(code: ComfyCodecErrorCode, path: string, message: string) {
    super(message);
    this.name = 'ComfyWorkflowCodecError';
    this.code = code;
    this.path = path;
  }

  toResult(): ComfyCodecError {
    return { code: this.code, path: this.path, message: this.message };
  }
}

export function fail(
  code: ComfyCodecErrorCode,
  path: string,
  message: string,
): never {
  throw new ComfyWorkflowCodecError(code, path, message);
}

/** True when the value is a codec error produced by this module. */
export function isCodecError(value: unknown): value is ComfyWorkflowCodecError {
  return value instanceof ComfyWorkflowCodecError;
}

/** Human-readable one-liner used for logs and non-i18n surfaces. */
export function describeCodecError(error: ComfyCodecError): string {
  return `${error.code} at ${error.path}: ${error.message}`;
}
