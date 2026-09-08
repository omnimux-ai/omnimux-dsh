/** Offline validation contracts. No result grants installation or execution authority. */
export const VALIDATION_LIMITS = Object.freeze({
  zipBytes: 20 * 1024 * 1024,
  skillBytes: 1024 * 1024,
  resourceBytes: 10 * 1024 * 1024,
  totalBytes: 100 * 1024 * 1024,
  entries: 1000,
  depth: 8,
  pathCodePoints: 240,
  pathBytes: 960,
  componentBytes: 255,
  ratio: 100,
  frontmatterBytes: 64 * 1024,
  timeoutMs: 30_000,
});
export type ValidationLimits = { -readonly [K in keyof typeof VALIDATION_LIMITS]: number };
export type ValidationCode = 'PACKAGE_FORMAT' | 'PACKAGE_LIMIT' | 'UNSAFE_PATH' | 'INVALID_SKILL'
  | 'VALIDATION_ABORTED' | 'VALIDATION_TIMEOUT';
export interface ValidationFailure {
  ok: false;
  code: ValidationCode;
  reason: string;
}
export interface SkillMetadata {
  name: string;
  description: string;
  version: string | null;
}
export interface ManifestEntry {
  path: string;
  kind: 'file' | 'directory';
  bytes: number;
  sha256: string | null;
}
export interface ValidatedPackage {
  ok: true;
  stage: 'validated';
  format: 'zip' | 'markdown';
  contentHash: string;
  inputBytes: number;
  totalBytes: number;
  metadata: SkillMetadata;
  manifest: ManifestEntry[];
}
export type ValidationResult = ValidatedPackage | ValidationFailure;
export interface ValidationInput {
  format: 'zip' | 'markdown';
  fileName: string;
  bytes: Uint8Array;
}
export interface ValidationOptions {
  signal?: AbortSignal;
  /** Optional reduced budgets, never a way to raise production hard limits. */
  limits?: Partial<ValidationLimits>;
}
export class ValidationError extends Error {
  constructor(readonly code: ValidationCode, readonly reason: string) {
    super(reason);
    this.name = 'ValidationError';
  }
}
export function reject(code: ValidationCode, reason: string): never {
  throw new ValidationError(code, reason);
}
export function failure(error: unknown): ValidationFailure {
  return error instanceof ValidationError
    ? { ok: false, code: error.code, reason: error.reason }
    : { ok: false, code: 'PACKAGE_FORMAT', reason: 'MALFORMED_PACKAGE' };
}
export function resolveLimits(reduced: Partial<ValidationLimits> = {}): ValidationLimits {
  const limits: ValidationLimits = { ...VALIDATION_LIMITS };
  for (const key of Object.keys(reduced) as (keyof ValidationLimits)[]) {
    const value = reduced[key];
    if (!Object.hasOwn(VALIDATION_LIMITS, key) || !Number.isSafeInteger(value) || value! <= 0
        || value! > VALIDATION_LIMITS[key]) reject('PACKAGE_LIMIT', 'INVALID_BUDGET');
    limits[key] = value!;
  }
  return limits;
}
export function checkLimit(value: number, maximum: number, reason: string): void {
  if (value > maximum) reject('PACKAGE_LIMIT', reason);
}
